/**
 * Stockage privé des preuves numériques.
 *
 * Règles (cahier des charges §7) :
 * - Aucun fichier de preuve n'est servi depuis le répertoire public ;
 * - Les noms de stockage sont générés par l'application (jamais le nom d'origine) ;
 * - La structure du disque reflète le dossier (case) auquel la preuve appartient,
 *   ce qui facilite les sauvegardes par dossier.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Racine du stockage privé — hors de /public. Configurable via STORAGE_DIR. */
export const STORAGE_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(process.cwd(), "storage");

/** Identifiant de stockage d'une preuve : UUID généré côté serveur. */
export function newEvidenceId(): string {
  return crypto.randomUUID();
}

/** Dossier physique d'un dossier d'incident. */
export function caseStorageDir(caseId: string): string {
  // caseId provient de la base (UUID) : pas d'injection de chemin possible,
  // on valide par sécurité au cas où.
  if (!/^[A-Za-z0-9_-]+$/.test(caseId)) {
    throw new Error("Identifiant de dossier invalide");
  }
  return path.join(STORAGE_ROOT, "cases", caseId);
}

/** Chemin complet du fichier d'une preuve. L'extension est fournie par l'app. */
export function evidenceFilePath(caseId: string, evidenceId: string, ext: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(evidenceId)) {
    throw new Error("Identifiant de preuve invalide");
  }
  if (!/^\.[A-Za-z0-9]+$/.test(ext)) {
    throw new Error("Extension invalide");
  }
  return path.join(caseStorageDir(caseId), `${evidenceId}${ext}`);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Supprime un fichier de preuve (nettoyage en cas d'échec d'enregistrement). */
export async function removeFile(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { force: true });
}

/** Vérifie qu'un fichier existe et renvoie sa taille. */
export async function fileSize(filePath: string): Promise<number | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}
