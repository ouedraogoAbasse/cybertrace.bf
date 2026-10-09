/**
 * Tests d'INTEGRATION du module preuves : les routes API sont appellees
 * directement (sans serveur) contre une base de test dediee.
 *
 * Scenario couvert (cahier des charges §11 et §12) :
 *   import → empreinte SHA-256 → verification IDENTIQUE → alteration detectee
 *   → historique chaine → telechargement → comparaison de copie → rejets de securite.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { STORAGE_ROOT } from "@/lib/storage";
import { POST as uploadPOST } from "@/app/api/cases/[caseId]/evidence/route";
import { POST as verifyPOST } from "@/app/api/evidence/[id]/verify/route";
import { GET as custodyGET } from "@/app/api/evidence/[id]/custody/route";
import { GET as downloadGET } from "@/app/api/evidence/[id]/download/route";
import { POST as comparePOST } from "@/app/api/evidence/[id]/compare/route";

const CONTENU = Buffer.from(
  "Facture FA-2026-0421 - commande jamais livree - boutique-en-ligne-bf.example - 145000 FCFA",
  "utf8",
);
const SHA256_ATTENDU = crypto.createHash("sha256").update(CONTENU).digest("hex");

let caseId = "";
let analysteId = "";
let lecteurId = "";
let evidenceId = "";

function ctx<T>(params: T) {
  return { params: Promise.resolve(params) };
}

function requeteImport(
  fichier: File,
  extra: Record<string, string> = {},
  enTetes: Record<string, string> = {},
): Request {
  const fd = new FormData();
  fd.append("file", fichier);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return new Request("http://test.local/import", { method: "POST", body: fd, headers: enTetes });
}

beforeAll(async () => {
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
    where: { reference: "CT-TEST-001" },
    update: {},
    create: {
      reference: "CT-TEST-001",
      titre: "Dossier de test",
      categorie: "Test",
      creeParId: analysteId,
    },
  });
  caseId = dossier.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({});
  await prisma.custodyEvent.deleteMany({});
  await prisma.evidence.deleteMany({});
  await prisma.case.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.$disconnect();
  fs.rmSync(STORAGE_ROOT, { recursive: true, force: true });
});

describe("1. Import d'une preuve", () => {
  it("enregistre la preuve avec l'empreinte SHA-256 du contenu", async () => {
    const fichier = new File([CONTENU], "preuve_demo.txt", { type: "text/plain" });
    const req = requeteImport(fichier, {
      description: "Facture de la fausse boutique",
      provenance: "Releve de la victime",
      dateCollecteDeclaree: "2026-10-05T14:30:00Z",
    });

    const res = await uploadPOST(req, ctx({ caseId }));
    expect(res.status).toBe(201);

    const corps = await res.json();
    expect(corps.evidence.empreinteInitiale).toBe(SHA256_ATTENDU);
    expect(corps.evidence.taille).toBe(CONTENU.length);
    expect(corps.evidence.mimeType).toBe("text/plain");
    expect(corps.evidence.nomOriginal).toBe("preuve_demo.txt");
    expect(corps.doublon).toBeNull();
    evidenceId = corps.evidence.id;
  });

  it("conserve le fichier CHIFFRE hors du repertoire public", () => {
    const fichierStocke = `${STORAGE_ROOT}/cases/${caseId}/${evidenceId}.txt`;
    expect(fs.existsSync(fichierStocke)).toBe(true);
    const surDisque = fs.readFileSync(fichierStocke);
    expect(surDisque.subarray(0, 4).toString("ascii")).toBe("CTB1"); // chiffre
    expect(surDisque.includes(CONTENU)).toBe(false); // aucun clair sur disque
  });

  it("signale un doublon si le meme contenu est re-importe", async () => {
    const copie = new File([CONTENU], "preuve_demo_copie.txt", { type: "text/plain" });
    const res = await uploadPOST(requeteImport(copie), ctx({ caseId }));
    expect(res.status).toBe(201);
    const corps = await res.json();
    expect(corps.doublon?.de?.id).toBe(evidenceId);
  });
});

describe("2. Verification d'integrite", () => {
  it("confirme qu'un fichier intact est IDENTIQUE", async () => {
    const res = await verifyPOST(new Request("http://t", { method: "POST" }), ctx({ id: evidenceId }));
    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps.verdict).toBe("IDENTIQUE");
    expect(corps.empreinteRecalculee).toBe(SHA256_ATTENDU);
    expect(corps.chaineCustodie.ok).toBe(true);
  });

  it("detecte une ALTERATION hors-application du fichier chiffre", async () => {
    const fichierStocke = `${STORAGE_ROOT}/cases/${caseId}/${evidenceId}.txt`;
    const original = fs.readFileSync(fichierStocke);
    const octets = Buffer.from(original);
    octets[40] ^= 0xff;
    fs.writeFileSync(fichierStocke, octets);

    const res = await verifyPOST(new Request("http://t", { method: "POST" }), ctx({ id: evidenceId }));
    const corps = await res.json();
    expect(corps.verdict).toBe("MODIFIE");
    expect(corps.motif).toMatch(/AES-GCM/);
    expect(corps.chaineCustodie.ok).toBe(true); // la chaine reste verifiable

    // On restaure le fichier intact pour les tests suivants.
    fs.writeFileSync(fichierStocke, original);
  });
});

describe("3. Historique de custodie chaine", () => {
  it("conserve les evenements dans l'ordre avec la chaine intacte", async () => {
    const res = await custodyGET(new Request("http://t"), ctx({ id: evidenceId }));
    expect(res.status).toBe(200);
    const corps = await res.json();

    const actions = corps.evenements.map((e: { action: string }) => e.action);
    expect(actions).toContain("ENREGISTREMENT");
    expect(actions).toContain("VERIFICATION_OK");
    expect(actions).toContain("VERIFICATION_ECHEC");
    expect(corps.chaineCustodie.ok).toBe(true);
    expect(corps.chaineCustodie.casseAu).toBeNull();

    // Chaque evenement referme le hash du precedent (chaine de hachage).
    for (let i = 1; i < corps.evenements.length; i++) {
      expect(corps.evenements[i].hashPrecedent).toBe(corps.evenements[i - 1].hashEvenement);
    }
  });
});

describe("4. Telechargement controle", () => {
  it("restitue le contenu clair a l'identique", async () => {
    const res = await downloadGET(new Request("http://t"), ctx({ id: evidenceId }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");

    const recu = Buffer.from(await res.arrayBuffer());
    expect(recu.equals(CONTENU)).toBe(true);
  });
});

describe("5. Comparaison d'une copie (scenario jury)", () => {
  it("MODIFIE quand la copie a change", async () => {
    const copie = new File([Buffer.concat([CONTENU, Buffer.from(" - prix modifie")])], "copie.txt");
    const fd = new FormData();
    fd.append("file", copie);
    const req = new Request("http://t", { method: "POST", body: fd });

    const res = await comparePOST(req, ctx({ id: evidenceId }));
    const corps = await res.json();
    expect(corps.verdict).toBe("MODIFIE");
    expect(corps.empreinteCopie).not.toBe(SHA256_ATTENDU);
  });

  it("IDENTIQUE quand la copie est intacte", async () => {
    const fd = new FormData();
    fd.append("file", new File([CONTENU], "copie.txt"));
    const req = new Request("http://t", { method: "POST", body: fd });

    const res = await comparePOST(req, ctx({ id: evidenceId }));
    const corps = await res.json();
    expect(corps.verdict).toBe("IDENTIQUE");
    expect(corps.empreinteCopie).toBe(SHA256_ATTENDU);
  });
});

describe("6. Securite", () => {
  it("REJETTE une extension hors liste blanche (.exe)", async () => {
    const req = requeteImport(new File([CONTENU], "malware.exe"));
    const res = await uploadPOST(req, ctx({ caseId }));
    expect(res.status).toBe(415);
    expect((await res.json()).code).toBe("BAD_EXTENSION");
  });

  it("REJETTE un binaire deguise en .pdf (magic bytes)", async () => {
    const faux = Buffer.from("MZ fake executable content", "latin1");
    const req = requeteImport(new File([faux], "faux.pdf"));
    const res = await uploadPOST(req, ctx({ caseId }));
    expect(res.status).toBe(415);
    expect((await res.json()).code).toBe("CONTENT_MISMATCH");
  });

  it("REJETTE un fichier vide", async () => {
    const req = requeteImport(new File([], "vide.txt"));
    const res = await uploadPOST(req, ctx({ caseId }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMPTY_FILE");
  });

  it("INTERDIT l'import a un role LECTEUR", async () => {
    const req = requeteImport(new File([CONTENU], "lecteur.txt"), {}, { "x-user-id": lecteurId });
    const res = await uploadPOST(req, ctx({ caseId }));
    expect(res.status).toBe(403);
  });

  it("RETourne 404 pour une preuve inexistante", async () => {
    const res = await verifyPOST(new Request("http://t", { method: "POST" }), ctx({ id: "id-inexistant" }));
    expect(res.status).toBe(404);
  });

  it("n'expose jamais le chemin de stockage interne", async () => {
    const res = await downloadGET(new Request("http://t"), ctx({ id: evidenceId }));
    const texte = await res.text();
    expect(texte).not.toContain(STORAGE_ROOT.replace(/\\/g, "/"));
  });
});
