/**
 * GET /api/evidence/[id]/download — telechargement controle d'une preuve.
 *
 * Le fichier n'est JAMAIS servi depuis /public : il est lu depuis le stockage
 * prive et streamé apres verification de l'acteur. L'operation est tracee
 * dans la chaine de custodie et le journal d'audit.
 */
import fs from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, canRead } from "@/lib/actor";
import { audit, recordCustodyEvent } from "@/lib/custody";
import { STORAGE_ROOT } from "@/lib/storage";
import { ERR, jsonError } from "@/lib/http";
import path from "node:path";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const evidence = await prisma.evidence.findUnique({ where: { id } });
  if (!evidence) return ERR.PREUVE_TROUVEE();

  const filePath = path.join(STORAGE_ROOT, evidence.cleStockage);
  if (!fs.existsSync(filePath)) {
    await audit({
      userId: actor.id,
      action: "DOWNLOAD_EVIDENCE",
      ressource: `evidence:${id}`,
      resultat: "ECHEC",
      details: { erreur: "fichier absent du stockage prive" },
    });
    return jsonError(410, "Fichier de preuve absent du stockage prive", "STORAGE_MISSING");
  }

  await recordCustodyEvent({
    evidenceId: id,
    acteurId: actor.id,
    acteurLabel: actorLabel(actor),
    action: "TELECHARGEMENT",
    details: { nomOriginal: evidence.nomOriginal },
  });

  await audit({
    userId: actor.id,
    action: "DOWNLOAD_EVIDENCE",
    ressource: `evidence:${id}`,
    resultat: "SUCCES",
  });

  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  const nomFichier = `preuve-${evidence.id}${evidence.extension}`;

  return new Response(stream, {
    headers: {
      "Content-Type": evidence.mimeType,
      "Content-Length": String(evidence.taille),
      // Nom d'origine fourni en parametre RFC 5987 (accents acceptes).
      "Content-Disposition": `attachment; filename="${nomFichier}"; filename*=UTF-8''${encodeURIComponent(evidence.nomOriginal)}`,
      "Cache-Control": "no-store",
    },
  });
}
