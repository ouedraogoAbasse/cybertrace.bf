/**
 * Empreintes SHA-256 (cahier des charges §2, §4).
 *
 * Le hash est calculé **dans le flux** pendant l'écriture du fichier :
 * on ne lit jamais le fichier deux fois, ce qui fonctionne aussi pour
 * des preuves volumineuses.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

/** Calcule le SHA-256 d'un flux (ex. fichier déposé par l'utilisateur). */
export async function sha256Stream(stream: Readable): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

/** Recalcule le SHA-256 d'un fichier déjà stocké (vérification d'intégrité). */
export function sha256File(filePath: string): Promise<string> {
  return sha256Stream(fs.createReadStream(filePath));
}

/**
 * Écrit le flux dans `target` tout en calculant le SHA-256 et la taille.
 * Retourne l'empreinte initiale et le nombre d'octets écrits.
 */
export async function saveAndHash(
  input: Readable,
  target: string,
): Promise<{ sha256: string; taille: number }> {
  const hash = crypto.createHash("sha256");
  let taille = 0;

  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      taille += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  await pipeline(input, meter, fs.createWriteStream(target));
  return { sha256: hash.digest("hex"), taille };
}

/** Compare deux empreintes de façon constante en temps (résistance théorique au timing). */
export function empreintesIdentiques(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ---------------------------------------------------------------------------
// Chiffrement au repos — AES-256-GCM (sécurité renforcée)
//
// Format du fichier stocke : [magique "CTB1" (4)] [IV (12)] [contenu chiffre] [tag GCM (16)]
// L'empreinte SHA-256 reste celle du contenu CLAIR : elle se compare donc a
// l'empreinte calculee par n'importe quel outil sur le fichier d'origine.
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const MAGIC = Buffer.from("CTB1");

/** Cle de chiffrement du stockage (env STORAGE_KEY, 32 octets en base64). */
export function getStorageKey(): Buffer {
  const raw = process.env.STORAGE_KEY;
  if (!raw) {
    throw new Error("STORAGE_KEY manquante — voir .env.example (32 octets en base64)");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("STORAGE_KEY invalide : 32 octets exactement (base64)");
  }
  return key;
}

/**
 * Ecrit le fichier CHIFFRE (AES-256-GCM) tout en calculant le SHA-256 et la
 * taille du contenu clair. Un seul passage sur le flux.
 */
export async function saveEncryptAndHash(
  input: Readable,
  target: string,
): Promise<{ sha256: string; taille: number }> {
  const key = getStorageKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });

  const hash = crypto.createHash("sha256");
  let taille = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      taille += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  const out = fs.createWriteStream(target);
  out.write(Buffer.concat([MAGIC, iv])); // entete : magique + IV
  await pipeline(input, meter, cipher, out);

  // Le tag d'authentification GCM est ecrit en fin de fichier.
  await fs.promises.appendFile(target, cipher.getAuthTag());

  return { sha256: hash.digest("hex"), taille };
}

/** Lit l'en-tete : le fichier est-il au format chiffre CyberTrace ? */
export async function isEncryptedFile(filePath: string): Promise<boolean> {
  const fd = await fs.promises.open(filePath, "r");
  try {
    const header = Buffer.alloc(MAGIC.length);
    const { bytesRead } = await fd.read(header, 0, MAGIC.length, 0);
    return bytesRead === MAGIC.length && header.equals(MAGIC);
  } finally {
    await fd.close();
  }
}

/**
 * Ouvre un fichier de preuve et renvoie un flux du contenu CLAIR.
 * Si le fichier chiffre a ete altere hors de l'application, le flux emet une
 * erreur d'authentification GCM — c'est exactement ce que la verification
 * d'integrite doit signaler.
 * Compatibilite : un fichier sans en-tete chiffre est lu tel quel (ancien format).
 */
export async function decryptStream(filePath: string): Promise<Readable> {
  const stat = await fs.promises.stat(filePath);
  if (stat.size < MAGIC.length + IV_LENGTH + TAG_LENGTH || !(await isEncryptedFile(filePath))) {
    // Format ancien (non chiffre) : lecture directe.
    return fs.createReadStream(filePath);
  }

  const key = getStorageKey();
  const fd = await fs.promises.open(filePath, "r");
  try {
    const header = Buffer.alloc(MAGIC.length + IV_LENGTH);
    await fd.read(header, 0, header.length, 0);
    const iv = header.subarray(MAGIC.length);

    const tag = Buffer.alloc(TAG_LENGTH);
    await fd.read(tag, 0, TAG_LENGTH, stat.size - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);

    const ciphertext = fs.createReadStream(filePath, {
      start: MAGIC.length + IV_LENGTH,
      end: stat.size - TAG_LENGTH - 1,
    });
    return ciphertext.pipe(decipher);
  } finally {
    await fd.close();
  }
}

/** Formatage d'une taille en octets pour l'affichage. */
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  if (octets < 1024 * 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(2)} Mo`;
  return `${(octets / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}
