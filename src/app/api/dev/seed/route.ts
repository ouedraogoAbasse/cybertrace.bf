/**
 * POST /api/dev/seed — jeu de donnees fictives de demonstration.
 *
 * Cree les trois utilisateurs (roles du cahier des charges §3) avec leur mot
 * de passe de demonstration hache en scrypt, l'utilisateur « dev » utilise par
 * defaut en l'absence d'authentification, et le dossier de demonstration
 * CT-2026-001 du scenario du jury (§12).
 *
 * Route de demonstration : refusee en production.
 */
import { prisma } from "@/lib/prisma";
import { DEV_USER_EMAIL } from "@/lib/actor";
import { hacherMotDePasse } from "@/lib/auth";
import { jsonError } from "@/lib/http";

const USERS = [
  { email: "admin@cybertrace.bf", nom: "Administrateur Demo", role: "ADMIN" as const },
  { email: DEV_USER_EMAIL, nom: "Analyste Demo", role: "ANALYSTE" as const },
  { email: "lecteur@cybertrace.bf", nom: "Lecteur Demo", role: "LECTEUR" as const },
];

/** Mot de passe de demonstration des trois comptes (comptes fictifs). */
export const MOT_DE_PASSE_DEMO = "CyberTrace2026";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return jsonError(403, "Route de demonstration desactivee en production");
  }

  const hachage = hacherMotDePasse(MOT_DE_PASSE_DEMO);
  const users = [];
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { nom: u.nom, role: u.role, passwordHash: hachage, statut: "ACTIF" },
      create: { email: u.email, nom: u.nom, role: u.role, passwordHash: hachage },
    });
    users.push({ id: user.id, email: user.email, role: user.role, nom: user.nom });
  }

  const analyste = users.find((u) => u.email === DEV_USER_EMAIL)!;

  const dossier = await prisma.case.upsert({
    where: { reference: "CT-2026-001" },
    update: {},
    create: {
      reference: "CT-2026-001",
      titre: "Fraude a la vente en ligne — usurpation de boutique",
      description:
        "Victime ayant regle une commande sur une fausse boutique en ligne ; captures et factures conservees comme preuves.",
      categorie: "Escroquerie en ligne",
      creeParId: analyste.id,
    },
  });

  return Response.json({
    message: "Jeu de donnees fictives cree",
    utilisateurs: users,
    dossier: { id: dossier.id, reference: dossier.reference },
  });
}
