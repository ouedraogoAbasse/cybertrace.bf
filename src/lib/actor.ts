/**
 * Resolution de l'acteur (utilisateur qui realise l'operation).
 *
 * HOOK POUR LE MEMBRE 1 : cette fonction est le seul point ou l'application
 * determine « qui parle ». Quand l'authentification sera en place, remplacer
 * le corps de resolveActor() par la lecture de la session (cookies) — les
 * routes de preuves n'auront pas besoin d'etre modifiees.
 *
 * En attendant :
 * - l'en-tête http x-user-id permet de simuler un utilisateur (tests) ;
 * - a defaut, l'utilisateur « dev » cree par POST /api/dev/seed est utilise.
 */
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

export const DEV_USER_EMAIL = "dev@cybertrace.bf";

export async function resolveActor(req: Request): Promise<User | null> {
  const userId = req.headers.get("x-user-id");
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && user.statut === "ACTIF") return user;
  }
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
