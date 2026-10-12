/**
 * GET /api/auth/me — utilisateur courant de la session (ou 401).
 * Utilise par le front pour afficher le compte + le badge de role.
 */
import { jetonDepuisCookie, lireSession } from "@/lib/auth";
import { ERR } from "@/lib/http";

export async function GET(req: Request): Promise<Response> {
  const jeton = jetonDepuisCookie(req.headers.get("cookie"));
  const compte = await lireSession(jeton);
  if (!compte) return ERR.NON_AUTORISE();

  const reponse = Response.json({
    utilisateur: {
      id: compte.id,
      nom: compte.nom,
      email: compte.email,
      role: compte.role,
      statut: compte.statut,
    },
  });
  reponse.headers.append("Vary", "Cookie");
  return reponse;
}
