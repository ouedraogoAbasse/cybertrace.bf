/**
 * POST /api/evidence/[id]/verify — verification d'integrite (§4 « Integrite »).
 *
 * Recalcule le SHA-256 du fichier stocke, le compare a l'empreinte initiale,
 * puis enregistre l'issue dans la chaine de custodie — que la verification
 * reussisse ou echoue (c'est l'echec qui doit etre trace).
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, canWrite } from "@/lib/actor";
import { audit, recordCustodyEvent, verifyCustodyChain } from "@/lib/custody";
import { empreintesIdentiques, sha256File } from "@/lib/hash";
import { STORAGE_ROOT } from "@/lib/storage";
import { ERR, jsonError } from "@/lib/http";
import path from "node:path";
import fs from "node:fs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canWrite(actor)) return ERR.INTERDIT();

  const evidence = await prisma.evidence.findUnique({ where: { id } });
  if (!evidence) return ERR.PREUVE_TROUVEE();

  const filePath = path.join(STORAGE_ROOT, evidence.cleStockage);
  if (!fs.existsSync(filePath)) {
    await audit({
      userId: actor.id,
      action: "VERIFY_EVIDENCE",
      ressource: `evidence:${id}`,
      resultat: "ECHEC",
      details: { erreur: "fichier absent du stockage prive" },
    });
    return jsonError(410, "Fichier de preuve absent du stockage prive", "STORAGE_MISSING");
  }

  const empreinteRecalculee = await sha256File(filePath);
  const identique = empreintesIdentiques(evidence.empreinteInitiale, empreinteRecalculee);
  const verdict = identique ? "IDENTIQUE" : "MODIFIE";

  const evenement = await recordCustodyEvent({
    evidenceId: id,
    acteurId: actor.id,
    acteurLabel: actorLabel(actor),
    action: identique ? "VERIFICATION_OK" : "VERIFICATION_ECHEC",
    details: {
      empreinteInitiale: evidence.empreinteInitiale,
      empreinteRecalculee,
      verdict,
    },
  });

  await audit({
    userId: actor.id,
    action: "VERIFY_EVIDENCE",
    ressource: `evidence:${id}`,
    resultat: "SUCCES",
    details: { verdict },
  });

  const chaine = await verifyCustodyChain(id);

  return Response.json({
    verdict,
    empreinteInitiale: evidence.empreinteInitiale,
    empreinteRecalculee,
    verifieLe: evenement.horodatage,
    chaineCustodie: chaine,
  });
}
