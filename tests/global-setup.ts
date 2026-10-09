/**
 * Global setup des tests : prepare une base PostgreSQL dediee aux tests.
 *
 * - cree la base cybertrace_test si elle n'existe pas (l'utilisateur a le
 *   droit CREATEDB) ;
 * - applique le schema avec `prisma db push --force-reset` : la base est
 *   reinitialisee a chaque execution, les tests sont donc independants.
 */
import { execSync } from "node:child_process";
import { Client } from "pg";

const TEST_DATABASE_URL =
  "postgresql://cybertrace:CyberTrace2026@127.0.0.1:5432/cybertrace_test";

export default async function globalSetup(): Promise<void> {
  const adminUrl = TEST_DATABASE_URL.replace("/cybertrace_test", "/postgres");
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query("CREATE DATABASE cybertrace_test");
  } catch {
    // la base existe deja : on continue
  } finally {
    await admin.end();
  }

  // Consentement utilisateur explicite pour l'action destructive (base de TEST
  // uniquement, sans donnee reelle) — requis par le garde-fou Prisma 7.
  execSync("npx prisma db push --force-reset", {
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
        "Oui, j'autorise la réinitialisation de cybertrace_test",
    },
    stdio: "inherit",
  });
}
