/**
 * GET /api/cases/[caseId]/sites — historique des analyses de sites frauduleux
 * rattachees a un dossier (dans l'ordre chronologique).
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, canRead } from "@/lib/actor";
import { ERR } from "@/lib/http";

type Ctx = { params: Promise<{ caseId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { caseId } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const dossier = await prisma.case.findUnique({ where: { id: caseId } });
  if (!dossier) return ERR.DOSIER_TROUVE();

  const analyses = await prisma.siteCheck.findMany({
    where: { caseId },
    orderBy: { analyseLe: "desc" },
    select: {
      id: true,
      url: true,
      hote: true,
      score: true,
      verdict: true,
      indicateurs: true,
      contenuAnalyse: true,
      dureeMs: true,
      analyseLe: true,
      effectuePar: { select: { nom: true } },
    },
  });

  return Response.json({ analyses });
}
