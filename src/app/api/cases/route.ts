/**
 * GET /api/cases — liste des dossiers d'incident.
 *
 * NOTE (Membre 1) : cette route est un pont minimal pour la page de
 * demonstration du module preuves. Elle pourra etre remplacee par votre
 * version enrichie (recherche, pagination, filtres) sans impact.
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, canRead } from "@/lib/actor";
import { ERR } from "@/lib/http";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const dossiers = await prisma.case.findMany({
    orderBy: { dateCreation: "desc" },
    select: {
      id: true,
      reference: true,
      titre: true,
      categorie: true,
      statut: true,
      dateCreation: true,
      _count: { select: { preuves: true } },
    },
  });

  return Response.json({
    dossiers: dossiers.map((d) => ({ ...d, nbPreuves: d._count.preuves, _count: undefined })),
  });
}
