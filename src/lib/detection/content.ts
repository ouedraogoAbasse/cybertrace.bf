/**
 * Analyse du CONTENU d'une page web — detection de site frauduleux.
 *
 * Protections (l'analyseve telecharge une URL fournie par l'utilisateur) :
 *  - uniquement http/https ;
 *  - resolution DNS puis blocage des adresses privees, loopback, link-local
 *    (SSRF : on ne doit pas pouvoir consulter http://127.0.0.1:5432, un
 *    routeur interne ou les metadonnees d'une machine cloud) ;
 *  - timeout 5 s, taille maximale 300 Ko, redirections non suivies ;
 *  - la reponse HTML n'est analysee que par expressions regulieres locales
 *    (aucun script de la page n'est execute).
 *
 * Les fonctions d'analyse du HTML sont pures : testables sans reseau.
 */
import dns from "node:dns/promises";
import { MARQUES, MOTS_CLEFS_HAMECONNAGE } from "./brands";
import type { Indicateur } from "./url-analysis";

const POIDS: Record<Indicateur["gravite"], number> = { haute: 25, moyenne: 12, basse: 5, info: 0 };

function indicateur(code: string, gravite: Indicateur["gravite"], message: string): Indicateur {
  return { code, gravite, message, poids: POIDS[gravite] };
}

export const MAX_CONTENU = 300 * 1024; // 300 Ko
export const TIMEOUT_MS = 5000;

/** Vrai si l'adresse est privee / loopback / reservee (a bloquer). */
export function adressePrivee(address: string): boolean {
  if (address.includes(":")) {
    // IPv6 (y compris IPv4-mappee ::ffff:x.x.x.x)
    const v4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return adressePrivee(v4[1]);
    const bas = address.toLowerCase();
    return (
      bas === "::1" || // loopback
      bas === "::" ||
      bas.startsWith("fc") || // ULA prive
      bas.startsWith("fd") ||
      bas.startsWith("fe80") || // link-local
      bas.startsWith("fe9") ||
      bas.startsWith("fea") ||
      bas.startsWith("feb")
    );
  }
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 || // "cette machine"
    a === 10 || // prive
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / metadonnees cloud (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // prive
    (a === 192 && b === 168) // prive
  );
}

export type ResultatSsrf =
  | { ok: true }
  | { ok: false; raison: string; type: "prive" | "dns" };

/** Verifie l'hote : resolution DNS + blocage des adresses privees. */
export async function verifierSsrf(hote: string): Promise<ResultatSsrf> {
  // Une IP ecrite directement dans l'URL : teste aussi le format prive.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hote)) {
    return adressePrivee(hote)
      ? { ok: false, raison: `Adresse privee interdite : ${hote}`, type: "prive" }
      : { ok: true };
  }
  try {
    const adresses = await dns.lookup(hote, { all: true });
    if (adresses.length === 0) {
      return { ok: false, raison: "Resolution DNS impossible", type: "dns" };
    }
    const privee = adresses.find((a) => adressePrivee(a.address));
    if (privee) {
      return {
        ok: false,
        raison: `L'hote resout vers une adresse privee (${privee.address}) : analyse bloquee`,
        type: "prive",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, raison: "Resolution DNS impossible (hote introuvable)", type: "dns" };
  }
}

/** Phrases typiques des pages d'hameconnage. */
const PHRASES_HAMECONNAGE: { motif: RegExp; message: string }[] = [
  { motif: /v[ée]rifiez\s+votre\s+compte/i, message: "« vérifiez votre compte » (pression)" },
  { motif: /votre\s+compte\s+sera\s+(suspendu|bloqu[ée])/i, message: "menace de suspension de compte" },
  { motif: /confirmez\s+(votre|vous)/i, message: "« confirmez votre... » (fausse validation)" },
  { motif: /(code\s+de\s+v[ée]rification|otp)/i, message: "demande de code de vérification / OTP" },
  { motif: /saisissez\s+(votre\s+)?(mot\s+de\s+passe|pin)/i, message: "demande de saisie de mot de passe / PIN" },
  { motif: /(western\s+union|orange\s+money|moov\s+money|airtel\s+money)/i, message: "service de paiement cité" },
  { motif: /vous\s+avez\s+(gagn|un\s+bonus)/i, message: "fausse annonce de gain / bonus" },
  { motif: /transf[ée]rez?\s+(de\s+l['’]argent|des?\s+fonds)/i, message: "demande de transfert d'argent" },
  { motif: /(exp[ée]diteur|b[ée]n[ée]ficiaire)\s+(inconnu|anonyme)/i, message: "contexte d'arnaque au transfert" },
];

/**
 * Analyse PURE du HTML d'une page (aucun reseau).
 * @param html   contenu de la page (tronque a MAX_CONTENU par l'appelant)
 * @param url    URL de la page (pour comparer l'hote au contenu)
 */
export function analyserContenu(html: string, url: URL): Indicateur[] {
  const indicateurs: Indicateur[] = [];
  const hote = url.hostname.toLowerCase().replace(/^www\./, "");

  // Champ mot de passe : signe majeur de page d'identification (fausse ou non).
  if (/<input[^>]*type\s*=\s*["']?password/i.test(html)) {
    indicateurs.push(
      indicateur("CHAMP_MOT_DE_PASSE", "haute", "La page contient un champ de saisie de mot de passe"),
    );
  }

  // Formulaires qui postent vers un autre domaine (exfiltration des identifiants).
  const actions = [...html.matchAll(/<form[^>]*action\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const action of actions) {
    try {
      const cible = new URL(action, url);
      const hoteCible = cible.hostname.toLowerCase().replace(/^www\./, "");
      if (hoteCible && hoteCible !== hote) {
        indicateurs.push(
          indicateur(
            "FORMULAIRE_EXTERNE",
            "haute",
            `Un formulaire envoie les donnees vers un autre domaine : ${hoteCible}`,
          ),
        );
        break;
      }
    } catch {
      /* action relative invalide : ignore */
    }
  }

  // Marque citee dans le contenu alors que l'hote n'est pas son domaine officiel.
  const marqueContenu = MARQUES.find(
    (marque) =>
      new RegExp(`\\b${marque.nom.replace(/\s+/g, "\\s+")}\\b`, "i").test(html) &&
      !marque.domainesOfficiels.some((d) => hote === d || hote.endsWith(`.${d}`)),
  );
  if (marqueContenu) {
    indicateurs.push(
      indicateur(
        "MARQUE_DANS_CONTENU",
        "moyenne",
        `La page cite « ${marqueContenu.nom} » mais n'est pas hebergee par son domaine officiel`,
      ),
    );
  }

  // Phrases d'hameconnage.
  const phrases = PHRASES_HAMECONNAGE.filter((p) => p.motif.test(html));
  if (phrases.length > 0) {
    indicateurs.push(
      indicateur(
        "PHRASES_HAMECONNAGE",
        "moyenne",
        `Formulations d'hameconnage detectees : ${phrases.map((p) => p.message).join(", ")}`,
      ),
    );
  }

  // Mots-clefs dans le titre.
  const titre = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  const motsTitre = MOTS_CLEFS_HAMECONNAGE.filter((m) => titre.toLowerCase().includes(m));
  if (motsTitre.length > 0) {
    indicateurs.push(
      indicateur("TITRE_HAMECONNAGE", "moyenne", `Titre de page suggérant une connexion : « ${titre.trim().slice(0, 80)} »`),
    );
  }

  return indicateurs;
}

export type ResultatContenu = {
  indicateurs: Indicateur[];
  contenuRecupere: boolean;
  httpStatus: number | null;
  erreur?: string;
};

/**
 * Telecharge et analyse la page. En cas d'echec (DNS, timeout, SSRF...), le
 * contenu est simplement considere comme non recuperable (indicateur info).
 */
export async function analyserPage(url: URL): Promise<ResultatContenu> {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const reponse = await fetch(url, {
      signal: controle.signal,
      redirect: "manual", // aucune redirection suivie automatiquement
      headers: { "User-Agent": "CyberTrace-BF-Detection/1.0 (+securite)" },
    });

    if (reponse.status >= 300 && reponse.status < 400) {
      return {
        indicateurs: [
          indicateur(
            "REDIRECTION",
            "moyenne",
            `La page repond par une redirection (HTTP ${reponse.status}) : destination reelle non verifiee`,
          ),
        ],
        contenuRecupere: false,
        httpStatus: reponse.status,
      };
    }
    if (!reponse.ok) {
      return {
        indicateurs: [],
        contenuRecupere: false,
        httpStatus: reponse.status,
        erreur: `Le serveur a repondu HTTP ${reponse.status}`,
      };
    }

    const octets = Buffer.from(await reponse.arrayBuffer());
    const html = octets.subarray(0, MAX_CONTENU).toString("utf8");
    return {
      indicateurs: analyserContenu(html, url),
      contenuRecupere: true,
      httpStatus: reponse.status,
    };
  } catch (e) {
    return {
      indicateurs: [],
      contenuRecupere: false,
      httpStatus: null,
      erreur: e instanceof Error ? e.message : "Echec de la recuperation de la page",
    };
  } finally {
    clearTimeout(minuteur);
  }
}
