/**
 * GET /api/evidence/[id]/custody — historique complet de la chaine de
 * custodie d'une preuve, dans l'ordre chronologique, avec verification
 * de l'integrite de la chaine (chaque evenement referme le hash du precedent).
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

  const evidence = await prisma.evidence.findUnique({ where: { id }, select: { id: true } });
  if (!evidence) return ERR.PREUVE_TROUVEE();

  const evenements = await prisma.custodyEvent.findMany({
    where: { evidenceId: id },
    orderBy: [{ horodatage: "asc" }, { id: "asc" }],
    select: {
      id: true,
      acteurLabel: true,
      action: true,
      horodatage: true,
      details: true,
      hashPrecedent: true,
      hashEvenement: true,
    },
  });

  const chaine = await verifyCustodyChain(id);

  return Response.json({ evenements, chaineCustodie: chaine });
}
