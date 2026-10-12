/**
 * PATCH /api/cases/[caseId] — mise a jour d'un dossier (classification).
 * Champs acceptes : statut, titre, description, categorie.
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, canWrite } from "@/lib/actor";
import { audit } from "@/lib/custody";
import { ERR, jsonError } from "@/lib/http";

const STATUTS = ["OUVERT", "EN_COURS", "CLOTURE"] as const;

type Ctx = { params: Promise<{ caseId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { caseId } = await ctx.params;

  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canWrite(actor)) return ERR.INTERDIT();

  const dossier = await prisma.case.findUnique({ where: { id: caseId } });
  if (!dossier) return ERR.DOSIER_TROUVE();

  let corps: { statut?: string; titre?: string; description?: string; categorie?: string };
  try {
    corps = await req.json();
  } catch {
    return jsonError(400, "Corps JSON attendu : { statut?, titre?, description?, categorie? }", "BAD_JSON");
  }

  const data: {
    statut?: (typeof STATUTS)[number];
    titre?: string;
    description?: string | null;
    categorie?: string | null;
  } = {};

  if (corps.statut !== undefined) {
    if (!STATUTS.includes(corps.statut as (typeof STATUTS)[number])) {
      return jsonError(400, `Statut invalide : attendu ${STATUTS.join(" / ")}`, "BAD_STATUT");
    }
    data.statut = corps.statut as (typeof STATUTS)[number];
  }
  if (corps.titre !== undefined) {
    const titre = corps.titre.trim();
    if (!titre || titre.length > 200) return jsonError(400, "Titre invalide (1 a 200 caracteres)", "BAD_TITLE");
    data.titre = titre;
  }
  if (corps.description !== undefined) data.description = corps.description.trim() || null;
  if (corps.categorie !== undefined) data.categorie = corps.categorie.trim() || null;

  if (Object.keys(data).length === 0) {
    return jsonError(400, "Aucun champ modifiable fourni", "EMPTY_PATCH");
  }

  const maj = await prisma.case.update({
    where: { id: caseId },
    data,
    select: {
      id: true,
      reference: true,
      titre: true,
      description: true,
      categorie: true,
      statut: true,
      dateCreation: true,
    },
  });

  await audit({
    userId: actor.id,
    action: "UPDATE_CASE",
    ressource: `case:${caseId}`,
    resultat: "SUCCES",
    details: { champs: Object.keys(data), acteur: actorLabel(actor) },
  });

  return Response.json({ dossier: maj });
}
