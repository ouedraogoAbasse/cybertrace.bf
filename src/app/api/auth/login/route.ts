/**
 * POST /api/auth/login — ouverture de session (cahier des charges §3).
 *
 * Corps : { email, motDePasse }. Verifie le hachage scrypt stocke en base,
 * refuse les comptes suspendus, puis cree une session et pose le cookie
 * HttpOnly. Reponse 429 si le compte a depasse le quota de tentatives.
 * Le message d'erreur est volontairement identique pour « compte inconnu »
 * et « mot de passe faux » : pas d'enumeration de comptes.
 */
import { audit } from "@/lib/custody";
import {
  cookieSession,
  creerSession,
  jetonDepuisCookie,
  noterEchec,
  noterSucces,
  supprimerSession,
  tentativeBloquee,
  verifierMotDePasse,
} from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const ERREUR_IDENTIFIANTS = "Identifiants incorrects";

export async function POST(req: Request): Promise<Response> {
  let corps: { email?: unknown; motDePasse?: unknown };
  try {
    corps = await req.json();
  } catch {
    return jsonError(400, "Corps JSON invalide", "BAD_REQUEST");
  }

  const email = String(corps.email ?? "")
    .trim()
    .toLowerCase();
  const motDePasse = String(corps.motDePasse ?? "");
  if (!email || !motDePasse) {
    return jsonError(400, "Courriel et mot de passe requis", "BAD_REQUEST");
  }

  const cleTentative = `connexion:${email}`;
  if (tentativeBloquee(cleTentative)) {
    return jsonError(429, "Trop de tentatives. Reessayez dans quelques minutes", "RATE_LIMITED");
  }

  const compte = await prisma.user.findUnique({ where: { email } });
  const valide = compte !== null && verifierMotDePasse(motDePasse, compte.passwordHash);

  if (!valide || compte.statut !== "ACTIF") {
    noterEchec(cleTentative);
    await audit({
      userId: compte?.id ?? null,
      action: "CONNEXION",
      ressource: `utilisateur/${email}`,
      resultat: "ECHEC",
      details: { motif: compte && compte.statut !== "ACTIF" ? "COMPTE_SUSPENDU" : "IDENTIFIANTS" },
    });
    return jsonError(401, ERREUR_IDENTIFIANTS, "INVALID_CREDENTIALS");
  }

  noterSucces(cleTentative);

  // Rotation : une reconnexion invalide le precedent cookie s'il existe.
  const ancienJeton = jetonDepuisCookie(req.headers.get("cookie"));
  if (ancienJeton) await supprimerSession(ancienJeton);

  const { jeton } = await creerSession(compte.id);
  await audit({
    userId: compte.id,
    action: "CONNEXION",
    ressource: `utilisateur/${compte.email}`,
    resultat: "SUCCES",
    details: { role: compte.role },
  });

  const reponse = Response.json({
    utilisateur: {
      id: compte.id,
      nom: compte.nom,
      email: compte.email,
      role: compte.role,
      statut: compte.statut,
    },
  });
  reponse.headers.append("Set-Cookie", cookieSession(jeton));
  reponse.headers.append("Vary", "Cookie");
  return reponse;
}
