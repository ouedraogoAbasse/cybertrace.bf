/**
 * GET /api/users — comptes actifs (jeu de demonstration).
 *
 * Sert le selecteur de compte de la page d'interface. En production, cette
 * route sera remplacee par la liste des comptes gerée par l'authentification
 * (Membre 1) ; aucune donnee secrete n'est exposee (utilisateurs fictifs).
 */
import { prisma } from "@/lib/prisma";
import { resolveActor } from "@/lib/actor";
import { ERR } from "@/lib/http";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();

  const utilisateurs = await prisma.user.findMany({
    where: { statut: "ACTIF" },
    select: { id: true, nom: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { nom: "asc" }],
  });

  return Response.json({ utilisateurs });
}
