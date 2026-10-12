/**
 * Resolution de l'acteur (utilisateur qui realise l'operation).
 *
 * C'est le seul point ou l'application determine « qui parle ». Les routes
 * de preuves n'ont donc jamais eu (et n'auront jamais) besoin d'etre
 * modifiees pour prendre en compte l'authentification.
 *
 * Ordre de resolution :
 * 1. la session (cookie HttpOnly — authentification reelle, roles en base) ;
 * 2. l'en-tete http x-user-id (appels directs : tests, scripts, curl) ;
 * 3. hors production uniquement, l'utilisateur « dev » du seed, pour que
 *    l'application reste consultable sans compte pendant le developpement.
 *    En production cet ultime repli est supprime : sans session => 401.
 */
import { prisma } from "@/lib/prisma";
import { jetonDepuisCookie, lireSession } from "@/lib/auth";
import type { User } from "@/generated/prisma/client";

export const DEV_USER_EMAIL = "dev@cybertrace.bf";

export async function resolveActor(req: Request): Promise<User | null> {
  // 1. Authentification reelle : cookie de session signe par /api/auth/login.
  const jeton = jetonDepuisCookie(req.headers.get("cookie"));
  const session = await lireSession(jeton);
  if (session) return session;

  // 2. En-tete d'identification directe (tests, automatisations).
  const userId = req.headers.get("x-user-id");
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && user.statut === "ACTIF") return user;
  }

  // 3. Repli de developpement (jamais en production).
  if (process.env.NODE_ENV === "production") return null;
  const dev = await prisma.user.findUnique({ where: { email: DEV_USER_EMAIL } });
  return dev && dev.statut === "ACTIF" ? dev : null;
}

/** Libelle de l'acteur pour les journaux (immuable meme si le nom change). */
export function actorLabel(user: User): string {
  return `${user.nom} <${user.email}>`;
}

export function canWrite(user: User): boolean {
  return user.role === "ADMIN" || user.role === "ANALYSTE";
}

export function canRead(user: User): boolean {
  return user.role === "ADMIN" || user.role === "ANALYSTE" || user.role === "LECTEUR";
}

/** Gestion des comptes et des roles : reservee a l'ADMIN (cahier des charges §3). */
export function isAdmin(user: User): boolean {
  return user.role === "ADMIN";
}
