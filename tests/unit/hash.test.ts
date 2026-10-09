/**
 * Tests unitaires du module hash/chiffrement.
 * Verifie l'empreinte SHA-256, le chiffrement AES-256-GCM au repos
 * et la detection d'alteration hors-application.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import {
  decryptStream,
  empreintesIdentiques,
  formatTaille,
  isEncryptedFile,
  saveEncryptAndHash,
  sha256File,
  sha256Stream,
} from "@/lib/hash";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cybertrace-hash-"));
const CONTENU = Buffer.from("Facture FA-2026-0421 - commande jamais livree - 145000 FCFA", "utf8");

function attenduSha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function lire(flux: Readable): Promise<Buffer> {
  const morceaux: Buffer[] = [];
  for await (const c of flux) morceaux.push(c as Buffer);
  return Buffer.concat(morceaux);
}

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("sha256Stream / sha256File", () => {
  it("calcule le SHA-256 attendu par un outil externe", async () => {
    const fichier = path.join(TMP, "a.txt");
    fs.writeFileSync(fichier, CONTENU);
    expect(await sha256File(fichier)).toBe(attenduSha256(CONTENU));
    expect(await sha256Stream(Readable.from([CONTENU]))).toBe(attenduSha256(CONTENU));
  });
});

describe("empreintesIdentiques", () => {
  it("compare correctement", () => {
    const h = attenduSha256(CONTENU);
    expect(empreintesIdentiques(h, h)).toBe(true);
    expect(empreintesIdentiques(h, "0".repeat(64))).toBe(false);
    expect(empreintesIdentiques(h, h.slice(0, 10))).toBe(false);
  });
});

describe("chiffrement AES-256-GCM au repos", () => {
  it(" chiffre le fichier : le contenu clair n'apparait pas sur le disque", async () => {
    const cible = path.join(TMP, "chiffre.bin");
    const { sha256, taille } = await saveEncryptAndHash(Readable.from([CONTENU]), cible);

    // L'empreinte reste celle du contenu CLAIR (comparable avec un outil externe).
    expect(sha256).toBe(attenduSha256(CONTENU));
    expect(taille).toBe(CONTENU.length);

    // Le disque ne contient que du chiffre (en-tete CTB1 + IV + chiffre + tag).
    const surDisque = fs.readFileSync(cible);
    expect(surDisque.subarray(0, 4).toString("ascii")).toBe("CTB1");
    expect(surDisque.length).toBe(4 + 12 + CONTENU.length + 16);
    expect(surDisque.includes(CONTENU)).toBe(false);
    expect(await isEncryptedFile(cible)).toBe(true);
  });

  it("dechiffre a l'identique", async () => {
    const cible = path.join(TMP, "dechiffre.bin");
    await saveEncryptAndHash(Readable.from([CONTENU]), cible);
    const clair = await lire(await decryptStream(cible));
    expect(clair.equals(CONTENU)).toBe(true);
    expect(await sha256Stream(await decryptStream(cible))).toBe(attenduSha256(CONTENU));
  });

  it("REFUSE de dechiffrer un fichier altere hors-application (MAC GCM)", async () => {
    const cible = path.join(TMP, "altere.bin");
    await saveEncryptAndHash(Readable.from([CONTENU]), cible);

    // On modifie un octet du chiffre (apres l'en-tete de 16 octets).
    const octets = fs.readFileSync(cible);
    octets[40] ^= 0xff;
    fs.writeFileSync(cible, octets);

    await expect(lire(await decryptStream(cible))).rejects.toThrow();
  });

  it("REFUSE de dechiffrer avec une autre cle", async () => {
    const cible = path.join(TMP, "autre-cle.bin");
    await saveEncryptAndHash(Readable.from([CONTENU]), cible);

    const cleOriginale = process.env.STORAGE_KEY;
    process.env.STORAGE_KEY = crypto.randomBytes(32).toString("base64");
    try {
      await expect(lire(await decryptStream(cible))).rejects.toThrow();
    } finally {
      process.env.STORAGE_KEY = cleOriginale;
    }
  });

  it("lit en clair un fichier ancien (sans en-tete chiffre)", async () => {
    const legacy = path.join(TMP, "legacy.txt");
    fs.writeFileSync(legacy, CONTENU);
    expect(await isEncryptedFile(legacy)).toBe(false);
    expect((await lire(await decryptStream(legacy))).equals(CONTENU)).toBe(true);
  });

  it("produit un chiffre different a chaque enregistrement (IV aleatoire)", async () => {
    const c1 = path.join(TMP, "iv1.bin");
    const c2 = path.join(TMP, "iv2.bin");
    await saveEncryptAndHash(Readable.from([CONTENU]), c1);
    await saveEncryptAndHash(Readable.from([CONTENU]), c2);
    // Memes empreintes (contenu clair identique)...
    expect(fs.readFileSync(c1).equals(fs.readFileSync(c2))).toBe(false);
  });
});

describe("formatTaille", () => {
  it("formate les tailles", () => {
    expect(formatTaille(512)).toBe("512 o");
    expect(formatTaille(2048)).toBe("2.0 Ko");
    expect(formatTaille(3 * 1024 * 1024)).toBe("3.00 Mo");
  });
});

describe("getStorageKey (via saveEncryptAndHash)", () => {
  it("exige une cle de 32 octets", async () => {
    const cleOriginale = process.env.STORAGE_KEY;
    process.env.STORAGE_KEY = Buffer.alloc(16).toString("base64");
    try {
      await expect(
        saveEncryptAndHash(Readable.from([CONTENU]), path.join(TMP, "k.bin")),
      ).rejects.toThrow(/32 octets/);
    } finally {
      process.env.STORAGE_KEY = cleOriginale;
    }
  });

  it("exige la presence de la cle", async () => {
    const cleOriginale = process.env.STORAGE_KEY;
    delete process.env.STORAGE_KEY;
    try {
      await expect(
        saveEncryptAndHash(Readable.from([CONTENU]), path.join(TMP, "k2.bin")),
      ).rejects.toThrow(/STORAGE_KEY/);
    } finally {
      process.env.STORAGE_KEY = cleOriginale;
    }
  });
});
