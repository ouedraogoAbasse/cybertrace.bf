/**
 * GET /api/cases/[caseId]/report.pdf — rapport PDF du dossier (§4 « Rapports PDF »).
 *
 * Contient : les informations du dossier, chaque preuve avec son empreinte
 * SHA-256 et ses verdicts de verification, l'historique complet des
 * operations de conservation, et la mention des limites de la methode.
 *
 * L'export est trace : evenement de custodie par preuve + journal d'audit.
 */
import { PassThrough, Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, canRead } from "@/lib/actor";
import { audit, recordCustodyEvent } from "@/lib/custody";
import { renderCaseReport, type CaseReportData, type ReportEvent } from "@/lib/pdf";
import { ERR } from "@/lib/http";

type Ctx = { params: Promise<{ caseId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { caseId } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const dossier = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      creePar: { select: { nom: true, email: true } },
      preuves: {
        include: {
          ajoutePar: { select: { nom: true } },
          evenements: { orderBy: [{ horodatage: "asc" }, { id: "asc" }] },
        },
      },
      sites: { orderBy: { analyseLe: "desc" } },
    },
  });
  if (!dossier) return ERR.DOSIER_TROUVE();

  // Tracabilite de l'export lui-meme (par preuve) + journal d'audit.
  for (const preuve of dossier.preuves) {
    await recordCustodyEvent({
      evidenceId: preuve.id,
      acteurId: actor.id,
      acteurLabel: actorLabel(actor),
      action: "EXPORT_RAPPORT",
      details: { dossier: dossier.reference },
    });
  }
  await audit({
    userId: actor.id,
    action: "EXPORT_REPORT",
    ressource: `case:${dossier.id}`,
    resultat: "SUCCES",
    details: { reference: dossier.reference, preuves: dossier.preuves.length },
  });

  const evenements: ReportEvent[] = [];
  for (const preuve of dossier.preuves) {
    for (const e of preuve.evenements) {
      const details = (e.details ?? {}) as Record<string, unknown>;
      const bits: string[] = [`preuve « ${preuve.nomOriginal} »`];
      if (e.action === "VERIFICATION_OK" || e.action === "VERIFICATION_ECHEC") {
        bits.push(`verdict ${String(details.verdict ?? "—")}`);
      }
      evenements.push({
        horodatage: e.horodatage,
        acteur: e.acteurLabel,
        action: e.action,
        resultatDetail: bits.join(" — "),
      });
    }
  }
  evenements.sort((a, b) => a.horodatage.getTime() - b.horodatage.getTime());

  const data: CaseReportData = {
    reference: dossier.reference,
    titre: dossier.titre,
    description: dossier.description,
    categorie: dossier.categorie,
    statut: dossier.statut,
    creePar: `${dossier.creePar.nom} <${dossier.creePar.email}>`,
    dateCreation: dossier.dateCreation,
    evidence: dossier.preuves.map((p) => ({
      nomOriginal: p.nomOriginal,
      empreinteInitiale: p.empreinteInitiale,
      taille: p.taille,
      mimeType: p.mimeType,
      description: p.description,
      provenanceDeclaree: p.provenanceDeclaree,
      dateCollecteDeclaree: p.dateCollecteDeclaree,
      dateEnregistrement: p.dateEnregistrement,
      ajoutePar: p.ajoutePar?.nom ?? null,
      verifications: p.evenements
        .filter((e) => e.action === "VERIFICATION_OK" || e.action === "VERIFICATION_ECHEC")
        .map((e) => {
          const details = (e.details ?? {}) as Record<string, unknown>;
          return {
            horodatage: e.horodatage,
            verdict: (details.verdict === "MODIFIE" ? "MODIFIE" : "IDENTIQUE") as
              | "IDENTIQUE"
              | "MODIFIE",
            empreinteRecalculee: String(details.empreinteRecalculee ?? "—"),
          };
        }),
    })),
    sites: dossier.sites.map((s) => ({
      url: s.url,
      hote: s.hote,
      score: s.score,
      verdict: s.verdict,
      analyseLe: s.analyseLe,
      indicateurs: ((s.indicateurs ?? []) as { message?: string }[]).map((i) => i.message ?? "").filter(Boolean),
    })),
    events: evenements,
    generationDate: new Date(),
    generateur: `CyberTrace BF — session de ${actor.nom}`,
  };

  const stream = new PassThrough();
  const pdfPromise = renderCaseReport(stream, data);

  const nomFichier = `rapport-${dossier.reference}.pdf`;
  const response = new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
      "Cache-Control": "no-store",
    },
  });

  // On laisse la generation se terminer pendant que la reponse part au client.
  await pdfPromise;
  return response;
}
