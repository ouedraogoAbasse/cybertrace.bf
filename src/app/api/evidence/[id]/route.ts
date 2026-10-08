/**
 * GET /api/evidence/[id] — metadonnees completes d'une preuve, avec le
 * dernier verdict de verification et l'etat de la chaine de custodie.
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, canRead } from "@/lib/actor";
import { verifyCustodyChain } from "@/lib/custody";
import { ERR } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const evidence = await prisma.evidence.findUnique({
    where: { id },
    include: {
      dossier: { select: { id: true, reference: true, titre: true } },
      ajoutePar: { select: { nom: true, email: true } },
    },
  });
  if (!evidence) return ERR.PREUVE_TROUVEE();

  const dernieresVerifs = await prisma.custodyEvent.findMany({
    where: { evidenceId: id, action: { in: ["VERIFICATION_OK", "VERIFICATION_ECHEC"] } },
    orderBy: [{ horodatage: "desc" }, { id: "desc" }],
    take: 5,
  });

  const chaine = await verifyCustodyChain(id);

  // Ne jamais exposer le chemin de stockage interne dans les reponses.
  const { cleStockage: interne, ...publicData } = evidence;
  void interne; // volontairement non expose

  return Response.json({
    evidence: publicData,
    dernieresVerifications: dernieresVerifs,
    chaineCustodie: chaine,
  });
}
