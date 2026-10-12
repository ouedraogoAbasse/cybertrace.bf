/**
 * /api/users — comptes utilisateurs (cahier des charges §3).
 *
 * GET  — liste des comptes (connecte ; n'expose jamais les hachages).
 * POST — creation d'un compte avec role et mot de passe (ADMIN uniquement).
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, isAdmin } from "@/lib/actor";
import { MOT_DE_PASSE_MIN, hacherMotDePasse, motDePasseValide } from "@/lib/auth";
import { audit } from "@/lib/custody";
import { ERR, jsonError } from "@/lib/http";
import { Role, UserStatut } from "@/generated/prisma/client";

const ROLES = new Set<string>(Object.values(Role));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SELECT_COMPTE = {
  id: true,
  nom: true,
  email: true,
  role: true,
  statut: true,
  dateCreation: true,
} as const;

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();

  // La liste detaillee (avec statut) est reservee a l'ADMIN ; les autres
  // roles ne recoivent que le minimum pour l'interface.
  const utilisateurs = await prisma.user.findMany({
    where: isAdmin(actor) ? {} : { statut: "ACTIF" },
    select: SELECT_COMPTE,
    orderBy: [{ role: "asc" }, { nom: "asc" }],
  });

  return Response.json({ utilisateurs });
}

export async function POST(req: Request) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!isAdmin(actor)) return ERR.INTERDIT();

  let corps: {
    nom?: unknown;
    email?: unknown;
    role?: unknown;
    motDePasse?: unknown;
    statut?: unknown;
  };
  try {
    corps = await req.json();
  } catch {
    return jsonError(400, "Corps JSON attendu : { nom, email, role, motDePasse }", "BAD_JSON");
  }

  const nom = String(corps.nom ?? "").trim();
  const email = String(corps.email ?? "").trim().toLowerCase();
  const role = String(corps.role ?? "");
  const motDePasse = String(corps.motDePasse ?? "");
  const statut = String(corps.statut ?? UserStatut.ACTIF);

  if (!nom || nom.length > 120) return jsonError(400, "Nom requis (120 caracteres max)", "BAD_NAME");
  if (!EMAIL_RE.test(email)) return jsonError(400, "Courriel invalide", "BAD_EMAIL");
  if (!ROLES.has(role)) return jsonError(400, "Role attendu : ADMIN, ANALYSTE ou LECTEUR", "BAD_ROLE");
  if (!motDePasseValide(motDePasse)) {
    return jsonError(400, `Mot de passe : ${MOT_DE_PASSE_MIN} caracteres minimum`, "WEAK_PASSWORD");
  }
  if (!ROLES.has(statut)) return jsonError(400, "Statut attendu : ACTIF ou SUSPENDU", "BAD_STATUS");

  try {
    const compte = await prisma.user.create({
      data: { nom, email, role: role as Role, statut: statut as UserStatut, passwordHash: hacherMotDePasse(motDePasse) },
      select: SELECT_COMPTE,
    });

    await audit({
      userId: actor.id,
      action: "CREATE_USER",
      ressource: `utilisateur:${compte.id}`,
      resultat: "SUCCES",
      details: { email, role, acteur: actorLabel(actor) },
    });

    return Response.json({ utilisateur: compte }, { status: 201 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return jsonError(409, "Un compte existe deja avec ce courriel", "EMAIL_EXISTS");
    }
    throw e;
  }
}
