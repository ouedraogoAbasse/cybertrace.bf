/**
 * GET /api/sites — historique global des analyses de sites frauduleux.
 * Filtre optionnel : ?caseId=...
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, canRead } from "@/lib/actor";
import { ERR } from "@/lib/http";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const caseId = new URL(req.url).searchParams.get("caseId");

  const analyses = await prisma.siteCheck.findMany({
    where: caseId ? { caseId } : {},
    orderBy: { analyseLe: "desc" },
    take: 100,
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
      dossier: { select: { id: true, reference: true } },
    },
  });

  return Response.json({ analyses });
}
