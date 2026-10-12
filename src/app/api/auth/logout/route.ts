/**
 * POST /api/auth/logout — revoque la session courante et efface le cookie.
 * Idempotent : sans session, repond quand meme 200.
 */
import { cookieSessionVide, jetonDepuisCookie, supprimerSession } from "@/lib/auth";

export async function POST(req: Request): Promise<Response> {
  const jeton = jetonDepuisCookie(req.headers.get("cookie"));
  await supprimerSession(jeton);

  const reponse = Response.json({ ok: true });
  reponse.headers.append("Set-Cookie", cookieSessionVide());
  reponse.headers.append("Vary", "Cookie");
  return reponse;
}
