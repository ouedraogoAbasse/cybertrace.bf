/**
 * Authentification (cahier des charges §3).
 *
 * - Mots de passe : scrypt (node:crypto, aucune dependance externe) avec sel
 *   aleatoire de 16 octets et comparaison a temps constant. Le mot de passe
 *   en clair ne quitte jamais le formulaire, seul le hachage est stocke.
 * - Sessions : jeton aleatoire de 32 octets emis dans un cookie HttpOnly ;
 *   en base on ne conserve que son SHA-256 — une fuite de la table Session
 *   ne permet donc pas de rejouer un jeton vole.
 * - Le cookie est SameSite=Lax + HttpOnly (inaccessible au JavaScript, donc
 *   impermeable aux vols par XSS) et Secure en production.
 *
 * Note de test : lireSession()/verifierMotDePasse() sont synchrones pour le
 * hachage pur ; les acces base sont asynchrones.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

/** Nom du cookie de session. */
export const COOKIE_SESSION = "ctb_session";

/** Duree de vie d'une session : 7 jours. */
export const DUREE_SESSION_JOURS = 7;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const LONGUEUR_SEL = 16;
const LONGUEUR_CLE = 64;

/**
 * Hache un mot de passe au format : scrypt$<sel hex>$<empreinte hex>.
 * Le sel est unique par compte (les comptes identiques ont des hachages
 * differents — pas de table arc-en-ciel possible).
 */
export function hacherMotDePasse(motDePasse: string): string {
  const sel = randomBytes(LONGUEUR_SEL);
  const empreinte = scryptSync(motDePasse, sel, LONGUEUR_CLE, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${sel.toString("hex")}$${empreinte.toString("hex")}`;
}

/** Verifie un mot de passe contre son hachage (comparaison a temps constant). */
export function verifierMotDePasse(motDePasse: string, hachage: string | null): boolean {
  if (!hachage) return false;
  const parties = hachage.split("$");
  if (parties.length !== 3 || parties[0] !== "scrypt") return false;
  const sel = Buffer.from(parties[1], "hex");
  const attendu = Buffer.from(parties[2], "hex");
  if (sel.length === 0 || attendu.length === 0) return false;
  const calcule = scryptSync(motDePasse, sel, attendu.length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return calcule.length === attendu.length && timingSafeEqual(calcule, attendu);
}

/** Longueur minimale exigee a la creation / reinitialisation d'un mot de passe. */
export const MOT_DE_PASSE_MIN = 8;

export function motDePasseValide(motDePasse: string): boolean {
  return motDePasse.length >= MOT_DE_PASSE_MIN;
}

// --- Sessions ---------------------------------------------------------------

function hacherJeton(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

/** Cree une session et retourne le jeton brut (a mettre dans le cookie). */
export async function creerSession(userId: string): Promise<{ jeton: string; expiration: Date }> {
  const jeton = randomBytes(32).toString("base64url");
  const expiration = new Date(Date.now() + DUREE_SESSION_JOURS * 24 * 3600 * 1000);
  await prisma.session.create({
    data: { tokenHash: hacherJeton(jeton), userId, expiration },
  });
  return { jeton, expiration };
}

/**
 * Resout le jeton brut d'un cookie en utilisateur ACTIF.
 * Retourne null si le jeton est inconnu, expire, ou si le compte est suspendu
 * (une session existante d'un compte suspendu devient donc immediatement
 * inactive, sans attendre la fin du cookie).
 */
export async function lireSession(jeton: string | undefined | null): Promise<User | null> {
  if (!jeton) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hacherJeton(jeton) },
    include: { utilisateur: true },
  });
  if (!session) return null;
  if (session.expiration.getTime() < Date.now()) {
    // Nettoyage opportuniste de la session expiree.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.utilisateur.statut !== "ACTIF") return null;
  return session.utilisateur;
}

/** Revoque la session correspondant au jeton (deconnexion). */
export async function supprimerSession(jeton: string | undefined | null): Promise<void> {
  if (!jeton) return;
  await prisma.session.deleteMany({ where: { tokenHash: hacherJeton(jeton) } });
}

// --- Cookies ----------------------------------------------------------------

/** Extrait le jeton d'une en-tête Cookie HTTP brute. */
export function jetonDepuisCookie(entete: string | null): string | null {
  if (!entete) return null;
  for (const partie of entete.split(";")) {
    const [nom, ...reste] = partie.trim().split("=");
    if (nom === COOKIE_SESSION) return reste.join("=") || null;
  }
  return null;
}

/** Serialise l'attribut Set-Cookie d'une session (HttpOnly, SameSite=Lax). */
export function cookieSession(jeton: string): string {
  const attributs = [
    `${COOKIE_SESSION}=${jeton}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${DUREE_SESSION_JOURS * 24 * 3600}`,
  ];
  if (process.env.NODE_ENV === "production") attributs.push("Secure");
  return attributs.join("; ");
}

/** Serialise l'expiration du cookie (deconnexion). */
export function cookieSessionVide(): string {
  const attributs = [`${COOKIE_SESSION}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") attributs.push("Secure");
  return attributs.join("; ");
}

// --- Limitation des tentatives ---------------------------------------------

/**
 * Limitation simple des tentatives de connexion : apres TENTATIVES_MAX essais
 * echoues pour un meme courriel dans la fenetre glissante, la reponse est
 * 429 meme si le mot de passe est juste (protection contre le force brute).
 * Etat en memoire : suffisant pour un prototype mono-processus ; en production
 * multi-instances, le porter dans Redis ou en base.
 */
const TENTATIVES_MAX = 8;
const FENETRE_MS = 10 * 60 * 1000;
const tentatives = new Map<string, number[]>();

export function tentativeBloquee(cle: string): boolean {
  const maintenant = Date.now();
  const historique = (tentatives.get(cle) ?? []).filter((t) => maintenant - t < FENETRE_MS);
  tentatives.set(cle, historique);
  return historique.length >= TENTATIVES_MAX;
}

export function noterEchec(cle: string): void {
  const historique = tentatives.get(cle) ?? [];
  historique.push(Date.now());
  tentatives.set(cle, historique);
}

export function noterSucces(cle: string): void {
  tentatives.delete(cle);
}
