/**
 * POST /api/sites/analyze — analyse d'une URL pour detecter un site frauduleux.
 *
 * Corps JSON : { url: string, caseId?: string }
 *
 * Pipeline : analyse lexicale de l'URL -> verifications SSRF -> recuperation
 * et analyse du contenu -> score cumule (0-100) -> verdict -> persistance
 * rattachee au dossier + journal d'audit.
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, canWrite } from "@/lib/actor";
import { audit } from "@/lib/custody";
import { ERR, jsonError } from "@/lib/http";
import { analyserUrl, scorer, verdict, normaliserUrl } from "@/lib/detection/url-analysis";
import { analyserPage, verifierSsrf } from "@/lib/detection/content";

export async function POST(req: Request) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!canWrite(actor)) return ERR.INTERDIT();

  let corps: { url?: string; caseId?: string };
  try {
    corps = await req.json();
  } catch {
    return jsonError(400, "Corps JSON attendu : { url, caseId? }", "BAD_JSON");
  }

  const brut = corps.url?.trim();
  if (!brut) return jsonError(400, "Champ 'url' requis", "NO_URL");
  if (brut.length > 2048) return jsonError(413, "URL trop longue", "URL_TOO_LONG");

  const dossier = corps.caseId
    ? await prisma.case.findUnique({ where: { id: corps.caseId } })
    : null;
  if (corps.caseId && !dossier) return ERR.DOSIER_TROUVE();

  const debut = Date.now();

  // 1. Analyse lexicale de l'URL (aucun reseau).
  const { url, indicateurs } = analyserUrl(brut);

  let contenuRecupere = false;
  let httpStatus: number | null = null;

  if (url) {
    // 2. Protections SSRF avant tout telechargement.
    const ssrf = await verifierSsrf(url.hostname);
    if (!ssrf.ok) {
      // Bloquage (adresse privee) ou simple echec DNS : le contenu n'a pas
      // ete consulte, le verdict reste fonde sur l'URL seule.
      indicateurs.push({
        code: ssrf.type === "prive" ? "SSRF_BLOQUE" : "CONTENU_INACCESSIBLE",
        gravite: "info",
        message:
          ssrf.type === "prive"
            ? `Analyse du contenu non effectuee : ${ssrf.raison}`
            : `Contenu non recuperable (${ssrf.raison}) : verdict fonde sur l'URL seule`,
        poids: 0,
      });
    } else {
      // 3. Recuperation et analyse du contenu de la page.
      const resultat = await analyserPage(url);
      indicateurs.push(...resultat.indicateurs);
      contenuRecupere = resultat.contenuRecupere;
      httpStatus = resultat.httpStatus;
      if (resultat.erreur) {
        indicateurs.push({
          code: "CONTENU_INACCESSIBLE",
          gravite: "info",
          message: `Contenu non recuperable (${resultat.erreur}) : verdict fonde sur l'URL seule`,
          poids: 0,
        });
      }
    }
  }

  // 4. Score et verdict cumules.
  const score = scorer(indicateurs);
  const verdictFinal = verdict(score);
  const normalise = normaliserUrl(brut);

  // 5. Persistance rattachee au dossier (optionnel).
  const analyse = await prisma.siteCheck.create({
    data: {
      url: brut.slice(0, 2048),
      urlNormalisee: normalise?.urlNormalisee ?? brut,
      hote: normalise?.hote ?? "invalide",
      score,
      verdict: verdictFinal,
      indicateurs: indicateurs as unknown as object,
      contenuAnalyse: contenuRecupere,
      dureeMs: Date.now() - debut,
      caseId: dossier?.id ?? null,
      effectueParId: actor.id,
    },
  });

  await audit({
    userId: actor.id,
    action: "ANALYZE_SITE",
    ressource: `sitecheck:${analyse.id}`,
    resultat: "SUCCES",
    details: {
      url: normalise?.hote ?? brut,
      score,
      verdict: verdictFinal,
      caseId: dossier?.id ?? null,
      acteur: actorLabel(actor),
      httpStatus,
    },
  });

  return Response.json(
    {
      analyse: {
        id: analyse.id,
        url: analyse.url,
        hote: analyse.hote,
        score,
        verdict: verdictFinal,
        indicateurs,
        contenuAnalyse: contenuRecupere,
        dureeMs: analyse.dureeMs,
        analyseLe: analyse.analyseLe,
        dossier: dossier ? { id: dossier.id, reference: dossier.reference } : null,
      },
    },
    { status: 201 },
  );
}
