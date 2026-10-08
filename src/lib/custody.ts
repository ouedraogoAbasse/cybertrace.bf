/**
 * Chaine de custodie et journal d'audit (cahier des charges §6, §13).
 *
 * Chaque evenement de conservation est horodate PAR LE SERVEUR et referme
 * un hash SHA-256 qui inclut le hash de l'evenement precedent de la meme
 * preuve : c'est l'« integrite chainee du journal » (fonction avancee du
 * cahier des charges §4). Toute suppression ou modification d'un evenement
 * casse la chaine et est detectable.
 */
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { CustodyAction, CustodyEvent } from "@/generated/prisma/client";

const GENESIS = "GENESE"; // premiere liaison de la chaine d'une preuve

/**
 * JSON canonique : cles triees recursivement.
 *
 * Sans cela, le stockage jsonb de PostgreSQL reordonne les cles du details
 * lors de la relecture : le hash recalcule differerait du hash enregistre et
 * la chaine apparaitrait cassee a tort.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

function computeEventHash(input: {
  hashPrecedent: string | null;
  evidenceId: string;
  acteurLabel: string;
  action: string;
  horodatage: Date;
  details: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        input.hashPrecedent ?? GENESIS,
        input.evidenceId,
        input.acteurLabel,
        input.action,
        input.horodatage.toISOString(),
        input.details,
      ].join("|"),
    )
    .digest("hex");
}

/**
 * Cree un evenement de custodie en le refermant dans la chaine
 * (hash du precedent + contenu de l'evenement).
 */
export async function recordCustodyEvent(params: {
  evidenceId: string;
  acteurId: string | null;
  acteurLabel: string;
  action: CustodyAction;
  details?: Record<string, unknown>;
}): Promise<CustodyEvent> {
  const details = params.details ?? {};
  const detailsJson = canonicalJson(details);

  const precedent = await prisma.custodyEvent.findFirst({
    where: { evidenceId: params.evidenceId },
    orderBy: [{ horodatage: "desc" }, { id: "desc" }],
    select: { hashEvenement: true },
  });

  // Horodatage SERVEUR uniquement (jamais la date declaree par le client).
  const horodatage = new Date();

  const hashEvenement = computeEventHash({
    hashPrecedent: precedent?.hashEvenement ?? null,
    evidenceId: params.evidenceId,
    acteurLabel: params.acteurLabel,
    action: params.action,
    horodatage,
    details: detailsJson,
  });

  return prisma.custodyEvent.create({
    data: {
      evidenceId: params.evidenceId,
      acteurId: params.acteurId,
      acteurLabel: params.acteurLabel,
      action: params.action,
      horodatage,
      details: details as object,
      hashPrecedent: precedent?.hashEvenement ?? null,
      hashEvenement,
    },
  });
}

/**
 * Verifie la coherence de toute la chaine de custodie d'une preuve.
 * Renvoie le numero de l'evenement casse le cas echeant.
 */
export async function verifyCustodyChain(
  evidenceId: string,
): Promise<{ ok: boolean; total: number; casseAu: number | null }> {
  const events = await prisma.custodyEvent.findMany({
    where: { evidenceId },
    orderBy: [{ horodatage: "asc" }, { id: "asc" }],
  });

  let precedent: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const attendu = computeEventHash({
      hashPrecedent: precedent,
      evidenceId,
      acteurLabel: e.acteurLabel,
      action: e.action,
      horodatage: e.horodatage,
      details: canonicalJson(e.details ?? {}),
    });
    if (e.hashPrecedent !== precedent || e.hashEvenement !== attendu) {
      return { ok: false, total: events.length, casseAu: i + 1 };
    }
    precedent = e.hashEvenement;
  }
  return { ok: true, total: events.length, casseAu: null };
}

/** Journal d'audit global (operations sensibles de l'application). */
export async function audit(params: {
  userId: string | null;
  action: string;
  ressource: string;
  resultat: "SUCCES" | "ECHEC";
  details?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      ressource: params.ressource,
      resultat: params.resultat,
      details: (params.details ?? {}) as object,
    },
  });
}
