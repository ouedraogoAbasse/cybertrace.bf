/**
 * POST /api/evidence/[id]/compare — comparaison d'une COPIE du fichier
 * avec l'empreinte initiale de la preuve (etape 5 du scenario de
 * demonstration, cahier des charges §12).
 *
 * La copie n'est PAS stockee : seul son hash est calcule puis compare.
 */
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { resolveActor, canRead } from "@/lib/actor";
import { audit } from "@/lib/custody";
import { empreintesIdentiques, sha256Stream } from "@/lib/hash";
import { ERR, jsonError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const evidence = await prisma.evidence.findUnique({ where: { id } });
  if (!evidence) return ERR.PREUVE_TROUVEE();

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

  const empreinteCopie = await sha256Stream(
    Readable.fromWeb(file.stream() as unknown as import("node:stream/web").ReadableStream),
  );
  const identique = empreintesIdentiques(evidence.empreinteInitiale, empreinteCopie);

  await audit({
    userId: actor.id,
    action: "COMPARE_EVIDENCE",
    ressource: `evidence:${id}`,
    resultat: "SUCCES",
    details: { verdict: identique ? "IDENTIQUE" : "MODIFIE", nomCopie: file.name },
  });

  return Response.json({
    verdict: identique ? "IDENTIQUE" : "MODIFIE",
    empreinteInitiale: evidence.empreinteInitiale,
    empreinteCopie,
    nomCopie: file.name,
  });
}
