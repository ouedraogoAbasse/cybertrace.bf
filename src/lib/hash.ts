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

/** Formatage d'une taille en octets pour l'affichage. */
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  if (octets < 1024 * 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(2)} Mo`;
  return `${(octets / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}
