/**
 * /api/cases — dossiers d'incident.
 *
 * GET  — liste des dossiers (avec nombre de preuves), pour l'interface.
 * POST — creation d'un dossier (reference saisie ou generee CT-AAAA-NNN).
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, canRead, canWrite } from "@/lib/actor";
import { audit } from "@/lib/custody";
import { ERR, jsonError } from "@/lib/http";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canRead(actor)) return ERR.INTERDIT();

  const dossiers = await prisma.case.findMany({
    orderBy: { dateCreation: "desc" },
    select: {
      id: true,
      reference: true,
      titre: true,
      description: true,
      categorie: true,
      statut: true,
      dateCreation: true,
      creePar: { select: { nom: true } },
      _count: { select: { preuves: true, sites: true } },
    },
  });

  return Response.json({
    dossiers: dossiers.map((d) => ({
      ...d,
      nbPreuves: d._count.preuves,
      nbSites: d._count.sites,
      _count: undefined,
    })),
  });
}

export async function POST(req: Request) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canWrite(actor)) return ERR.INTERDIT();

  let corps: { reference?: string; titre?: string; description?: string; categorie?: string };
  try {
    corps = await req.json();
  } catch {
    return jsonError(400, "Corps JSON attendu : { reference?, titre, description?, categorie? }", "BAD_JSON");
  }

  const titre = corps.titre?.trim();
  if (!titre) return jsonError(400, "Champ 'titre' requis", "NO_TITLE");
  if (titre.length > 200) return jsonError(413, "Titre trop long (200 caracteres max)", "TITLE_TOO_LONG");

  // Reference : saisie par l'utilisateur ou generee automatiquement.
  let reference = corps.reference?.trim().toUpperCase() || null;
  if (reference && !/^CT-\d{4}-\d{3,}$/.test(reference)) {
    return jsonError(400, "Reference attendue au format CT-AAAA-NNN (ex. CT-2026-002)", "BAD_REFERENCE");
  }
  if (!reference) {
    const annee = new Date().getFullYear();
    const derniere = await prisma.case.findFirst({
      where: { reference: { startsWith: `CT-${annee}-` } },
      select: { reference: true },
      orderBy: { reference: "desc" },
    });
    const sequence = derniere ? parseInt(derniere.reference.split("-")[2], 10) + 1 : 1;
    reference = `CT-${annee}-${String(sequence).padStart(3, "0")}`;
  }

  try {
    const dossier = await prisma.case.create({
      data: {
        reference,
        titre,
        description: corps.description?.trim() || null,
        categorie: corps.categorie?.trim() || null,
        creeParId: actor.id,
      },
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
      action: "CREATE_CASE",
      ressource: `case:${dossier.id}`,
      resultat: "SUCCES",
      details: { reference, titre, acteur: actorLabel(actor) },
    });

    return Response.json({ dossier }, { status: 201 });
  } catch {
    return jsonError(409, "Cette reference de dossier existe deja", "REFERENCE_EXISTS");
  }
}
