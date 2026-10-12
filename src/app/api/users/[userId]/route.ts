/**
 * PATCH /api/users/[userId] — modification d'un compte (ADMIN uniquement).
 *
 * Champs partiels : { role?, statut?, motDePasse?, nom?, email? }.
 * Protections :
 *  - impossible de se modifier soi-meme (verrouillage de session) ;
 *  - impossible de retirer le role ADMIN au dernier admin actif ;
 *  - suspension / retrait de role => revoque les sessions du compte.
 */
import { prisma } from "@/lib/prisma";
import { resolveActor, actorLabel, isAdmin } from "@/lib/actor";
import { MOT_DE_PASSE_MIN, hacherMotDePasse, motDePasseValide } from "@/lib/auth";
import { audit } from "@/lib/custody";
import { ERR, jsonError } from "@/lib/http";
import { Role, UserStatut } from "@/generated/prisma/client";

const ROLES = new Set<string>(Object.values(Role));
const STATUTS = new Set<string>(Object.values(UserStatut));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SELECT_COMPTE_SAFE = {
  id: true,
  nom: true,
  email: true,
  role: true,
  statut: true,
  dateCreation: true,
} as const;

export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const actor = await resolveActor(req);
  if (!actor) return ERR.NON_AUTORISE();
  if (!isAdmin(actor)) return ERR.INTERDIT();

  const { userId } = await ctx.params;
  if (userId === actor.id) {
    return jsonError(400, "Vous ne pouvez pas modifier votre propre compte", "SELF_MODIFY");
  }

  const compte = await prisma.user.findUnique({ where: { id: userId } });
  if (!compte) return jsonError(404, "Compte introuvable", "USER_NOT_FOUND");

  let corps: {
    nom?: unknown;
    email?: unknown;
    role?: unknown;
    statut?: unknown;
    motDePasse?: unknown;
  };
  try {
    corps = await req.json();
  } catch {
    return jsonError(400, "Corps JSON invalide", "BAD_JSON");
  }

  const donnees: {
    nom?: string;
    email?: string;
    role?: Role;
    statut?: UserStatut;
    passwordHash?: string;
  } = {};

  if (corps.role !== undefined) {
    const role = String(corps.role);
    if (!ROLES.has(role)) return jsonError(400, "Role attendu : ADMIN, ANALYSTE ou LECTEUR", "BAD_ROLE");
    if (compte.role === "ADMIN" && role !== "ADMIN") {
      const adminsActifs = await prisma.user.count({ where: { role: "ADMIN", statut: "ACTIF" } });
      if (adminsActifs <= 1) {
        return jsonError(409, "Impossible : c'est le dernier compte ADMIN actif", "LAST_ADMIN");
      }
    }
    donnees.role = role as Role;
  }

  if (corps.statut !== undefined) {
    const statut = String(corps.statut);
    if (!STATUTS.has(statut)) return jsonError(400, "Statut attendu : ACTIF ou SUSPENDU", "BAD_STATUS");
    if (compte.role === "ADMIN" && statut !== "ACTIF") {
      const adminsActifs = await prisma.user.count({ where: { role: "ADMIN", statut: "ACTIF" } });
      if (adminsActifs <= 1) {
        return jsonError(409, "Impossible : c'est le dernier compte ADMIN actif", "LAST_ADMIN");
      }
    }
    donnees.statut = statut as UserStatut;
  }

  if (corps.nom !== undefined) {
    const nom = String(corps.nom).trim();
    if (!nom || nom.length > 120) return jsonError(400, "Nom invalide", "BAD_NAME");
    donnees.nom = nom;
  }

  if (corps.email !== undefined) {
    const email = String(corps.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return jsonError(400, "Courriel invalide", "BAD_EMAIL");
    donnees.email = email;
  }

  if (corps.motDePasse !== undefined) {
    const motDePasse = String(corps.motDePasse);
    if (!motDePasseValide(motDePasse)) {
      return jsonError(400, `Mot de passe : ${MOT_DE_PASSE_MIN} caracteres minimum`, "WEAK_PASSWORD");
    }
    donnees.passwordHash = hacherMotDePasse(motDePasse);
  }

  if (Object.keys(donnees).length === 0) {
    return jsonError(400, "Aucune modification fournie", "EMPTY_PATCH");
  }

  try {
    const maj = await prisma.user.update({ where: { id: userId }, data: donnees, select: SELECT_COMPTE_SAFE });
    // Tout changement de role/statut/mot de passe invalide les sessions existantes.
    if (donnees.role || donnees.statut || donnees.passwordHash) {
      await prisma.session.deleteMany({ where: { userId } });
    }
    await audit({
      userId: actor.id,
      action: "UPDATE_USER",
      ressource: `utilisateur:${userId}`,
      resultat: "SUCCES",
      details: { champs: Object.keys(donnees), acteur: actorLabel(actor) },
    });
    return Response.json({ utilisateur: maj });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return jsonError(409, "Un compte existe deja avec ce courriel", "EMAIL_EXISTS");
    }
    throw e;
  }
}
