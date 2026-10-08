/**
 * /api/cases/[caseId]/evidence
 *
 * POST — import d'un fichier de preuve (cahier des charges §4 « Preuves »).
 *   1. controle de l'acteur et de son role ;
 *   2. validation : taille, extension, type REEL du fichier (magic bytes) ;
 *   3. ecriture dans le stockage prive + calcul du SHA-256 **dans le flux** ;
 *   4. enregistrement des metadonnees et de l'empreinte initiale ;
 *   5. evenement de custodie + journal d'audit.
 *
 * GET — liste des preuves du dossier.
 */
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, canWrite, canRead } from "@/lib/actor";
import { audit, recordCustodyEvent } from "@/lib/custody";
import { saveAndHash } from "@/lib/hash";
import {
  caseStorageDir,
  ensureDir,
  evidenceFilePath,
  newEvidenceId,
  removeFile,
} from "@/lib/storage";
import {
  MAX_FILE_SIZE,
  detectFileType,
  extensionAllowed,
  sanitizeOriginalName,
} from "@/lib/filetypes";
import { ERR, jsonError } from "@/lib/http";

type Ctx = { params: Promise<{ caseId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { caseId } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canWrite(actor)) return ERR.INTERDIT();

  const dossier = await prisma.case.findUnique({ where: { id: caseId } });
  if (!dossier) return ERR.DOSIER_TROUVE();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError(400, "Corps attendu : multipart/form-data", "BAD_MULTIPART");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "Champ 'file' manquant", "NO_FILE");
  }
  if (file.size === 0) {
    return jsonError(400, "Fichier vide", "EMPTY_FILE");
  }
  if (file.size > MAX_FILE_SIZE) {
    return jsonError(413, "Fichier trop volumineux (25 Mo maximum)", "TOO_LARGE");
  }

  const nomOriginal = sanitizeOriginalName(file.name || "fichier");
  const extension = (nomOriginal.match(/\.[A-Za-z0-9]+$/)?.[0] ?? "").toLowerCase();
  if (!extensionAllowed(extension)) {
    return jsonError(415, `Extension non autorisee : ${extension || '(inconnue)'}`, "BAD_EXTENSION");
  }

  // Type reel du fichier : premiers octets, jamais le MIME declare par le client.
  const header = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const detected = detectFileType(header, extension);
  if (!detected) {
    return jsonError(
      415,
      "Le contenu du fichier ne correspond pas a une extension autorisee",
      "CONTENT_MISMATCH",
    );
  }

  const evidenceId = newEvidenceId();
  // Chemin relatif au stockage prive (cases/<dossier>/<preuve><ext>).
  const cleStockage = `cases/${dossier.id}/${evidenceId}${extension}`;
  const filePath = evidenceFilePath(dossier.id, evidenceId, extension);
  ensureDir(caseStorageDir(dossier.id));

  // Ecriture + empreinte dans un seul passage sur le flux.
  let sha256: string;
  let taille: number;
  try {
    const nodeStream = Readable.fromWeb(
      file.stream() as unknown as import("node:stream/web").ReadableStream,
    );
    ({ sha256, taille } = await saveAndHash(nodeStream, filePath));
  } catch (e) {
    await removeFile(filePath);
    await audit({
      userId: actor.id,
      action: "UPLOAD_EVIDENCE",
      ressource: `case:${caseId}`,
      resultat: "ECHEC",
      details: { erreur: String(e) },
    });
    return jsonError(500, "Echec de l'ecriture du fichier", "STORAGE_FAILED");
  }

  const description = (formData.get("description") as string | null)?.trim() || null;
  const provenance = (formData.get("provenance") as string | null)?.trim() || null;
  const collecteBrute = (formData.get("dateCollecteDeclaree") as string | null)?.trim() || null;
  let dateCollecteDeclaree: Date | null = null;
  if (collecteBrute) {
    const d = new Date(collecteBrute);
    if (!Number.isNaN(d.getTime())) dateCollecteDeclaree = d;
  }

  try {
    const evidence = await prisma.evidence.create({
      data: {
        id: evidenceId,
        caseId: dossier.id,
        nomOriginal,
        cleStockage,
        extension,
        empreinteInitiale: sha256,
        taille,
        mimeType: detected.mime,
        description,
        provenanceDeclaree: provenance,
        dateCollecteDeclaree,
        ajouteParId: actor.id,
      },
    });

    // Evenement de custodie : enregistrement de la preuve (chaine genese).
    await recordCustodyEvent({
      evidenceId: evidence.id,
      acteurId: actor.id,
      acteurLabel: actorLabel(actor),
      action: "ENREGISTREMENT",
      details: {
        nomOriginal,
        empreinteInitiale: sha256,
        taille,
        mimeType: detected.mime,
        provenanceDeclaree: provenance,
      },
    });

    await audit({
      userId: actor.id,
      action: "UPLOAD_EVIDENCE",
      ressource: `evidence:${evidence.id}`,
      resultat: "SUCCES",
      details: { caseId: dossier.id, empreinteInitiale: sha256, taille },
    });

    return Response.json({ evidence }, { status: 201 });
  } catch (e) {
    // Transaction echouee : on ne laisse aucun fichier orphelin sur le disque.
    await removeFile(filePath);
    await audit({
      userId: actor.id,
      action: "UPLOAD_EVIDENCE",
      ressource: `case:${caseId}`,
      resultat: "ECHEC",
      details: { erreur: String(e) },
    });
    return jsonError(500, "Echec de l'enregistrement en base", "DB_FAILED");
  }
}

export async function GET(req: Request, ctx: Ctx) {
  const { caseId } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const dossier = await prisma.case.findUnique({ where: { id: caseId } });
  if (!dossier) return ERR.DOSIER_TROUVE();

  const preuves = await prisma.evidence.findMany({
    where: { caseId },
    orderBy: { dateEnregistrement: "asc" },
    select: {
      id: true,
      nomOriginal: true,
      empreinteInitiale: true,
      taille: true,
      mimeType: true,
      dateEnregistrement: true,
      dateCollecteDeclaree: true,
      ajoutePar: { select: { nom: true } },
    },
  });

  return Response.json({ preuves });
}
