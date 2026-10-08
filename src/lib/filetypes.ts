/**
 * Validation des fichiers de preuve (cahier des charges section 7).
 *
 * - Liste blanche d'extensions ;
 * - Detection du type reel par magic bytes (le type MIME declare par le
 *   navigateur n'est pas fiable) ;
 * - Taille maximale ;
 * - Les fichiers texte sont acceptes s'ils ne contiennent pas de octets nuls.
 */

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo

export const ALLOWED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
  ".txt",
  ".csv",
  ".log",
  ".json",
  ".zip",
  ".docx",
  ".xlsx",
] as const;

type Signature = {
  extensions: string[];
  mime: string;
  test: (b: Buffer) => boolean;
};

const SIGNATURES: Signature[] = [
  {
    extensions: [".png"],
    mime: "image/png",
    test: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    extensions: [".jpg", ".jpeg"],
    mime: "image/jpeg",
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    extensions: [".gif"],
    mime: "image/gif",
    test: (b) => b.length >= 4 && b.toString("ascii", 0, 3) === "GIF",
  },
  {
    extensions: [".webp"],
    mime: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
  {
    extensions: [".pdf"],
    mime: "application/pdf",
    test: (b) => b.length >= 5 && b.toString("ascii", 0, 5) === "%PDF-",
  },
  {
    // ZIP : aussi les formats conteneurs .docx / .xlsx
    extensions: [".zip", ".docx", ".xlsx"],
    mime: "application/zip",
    test: (b) =>
      b.length >= 4 &&
      b[0] === 0x50 &&
      b[1] === 0x4b &&
      (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
  },
];

/** Extensions texte pures : pas de magic bytes, on accepte si le contenu est lisible. */
const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".log", ".json"]);

function looksTextual(header: Buffer): boolean {
  // Un fichier texte ne contient pas de octet nul dans son en-tete.
  return !header.subarray(0, Math.min(header.length, 2048)).includes(0);
}

export type DetectedType = { extensions: string[]; mime: string };

/**
 * Determine le type reel du fichier a partir de ses premiers octets.
 * @param header    premiers octets du fichier (>= 16 octets conseilles)
 * @param extension extension declaree (minuscule, avec point)
 */
export function detectFileType(header: Buffer, extension: string): DetectedType | null {
  const signature = SIGNATURES.find((s) => s.test(header));
  if (signature) {
    // Le contenu determine le type ; l'extension declaree doit etre coherente.
    if (!signature.extensions.includes(extension)) return null;
    return { extensions: [...signature.extensions], mime: signature.mime };
  }
  if (TEXT_EXTENSIONS.has(extension) && looksTextual(header)) {
    return { extensions: [extension], mime: "text/plain" };
  }
  return null;
}

export function extensionAllowed(extension: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension);
}

/**
 * Normalise le nom de fichier fourni par le navigateur : on ne garde que le
 * nom de base (protection contre le path-traversal) et on neutralise les
 * caracteres dangereux.
 */
export function sanitizeOriginalName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "fichier";
  const propre = base
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^[. ]+/, "")
    .slice(0, 200);
  return propre || "fichier";
}
