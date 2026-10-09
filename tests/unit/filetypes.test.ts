/**
 * Tests unitaires de la validation des fichiers de preuve.
 * Verifie la detection par magic bytes, la liste blanche et le nettoyage des noms.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_FILE_SIZE,
  detectFileType,
  extensionAllowed,
  sanitizeOriginalName,
} from "@/lib/filetypes";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF_HEADER = Buffer.from("%PDF-1.7", "latin1");
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

describe("detectFileType", () => {
  it("reconnait un vrai PNG", () => {
    expect(detectFileType(PNG_HEADER, ".png")).toEqual({
      extensions: [".png"],
      mime: "image/png",
    });
  });

  it("reconnait un vrai PDF", () => {
    expect(detectFileType(PDF_HEADER, ".pdf")?.mime).toBe("application/pdf");
  });

  it("reconnait un vrai JPEG", () => {
    expect(detectFileType(JPEG_HEADER, ".jpg")?.mime).toBe("image/jpeg");
  });

  it("accepte un fichier texte sans octet nul", () => {
    const header = Buffer.from("Facture FA-2026-0421 - 145000 FCFA", "utf8");
    expect(detectFileType(header, ".txt")?.mime).toBe("text/plain");
  });

  it("REJETTE un binaire deguise en .pdf (magic bytes incoherents)", () => {
    const exe = Buffer.from("MZ This is a fake executable", "latin1");
    expect(detectFileType(exe, ".pdf")).toBeNull();
  });

  it("REJETTE un .pdf qui contient du texte brut", () => {
    expect(detectFileType(Buffer.from("ceci nest pas un pdf", "utf8"), ".pdf")).toBeNull();
  });

  it("REJETTE un fichier texte contenant des octets nuls", () => {
    const binaire = Buffer.from([0x48, 0x00, 0x49, 0x00]);
    expect(detectFileType(binaire, ".txt")).toBeNull();
  });

  it("REJETTE un PNG annonce en .jpg (extension incoherente)", () => {
    expect(detectFileType(PNG_HEADER, ".jpg")).toBeNull();
  });
});

describe("extensionAllowed", () => {
  it("accepte les extensions de la liste blanche", () => {
    expect(extensionAllowed(".pdf")).toBe(true);
    expect(extensionAllowed(".png")).toBe(true);
    expect(extensionAllowed(".docx")).toBe(true);
  });

  it("REJETTE les extensions dangereuses", () => {
    expect(extensionAllowed(".exe")).toBe(false);
    expect(extensionAllowed(".sh")).toBe(false);
    expect(extensionAllowed(".js")).toBe(false);
    expect(extensionAllowed("")).toBe(false);
  });
});

describe("sanitizeOriginalName", () => {
  it("supprime les chemins (protection path-traversal)", () => {
    expect(sanitizeOriginalName("C:\\Windows\\System32\\evil.exe")).toBe("evil.exe");
    expect(sanitizeOriginalName("../../etc/passwd")).toBe("passwd");
  });

  it("neutralise les caracteres dangereux", () => {
    const nom = sanitizeOriginalName("facture<>.txt");
    expect(nom).not.toContain("<");
    expect(nom).not.toContain(">");
  });

  it("tronque les noms trop longs", () => {
    expect(sanitizeOriginalName("a".repeat(500)).length).toBeLessThanOrEqual(200);
  });

  it("retombe sur 'fichier' si le nom est vide", () => {
    expect(sanitizeOriginalName("")).toBe("fichier");
    expect(sanitizeOriginalName("...")).toBe("fichier");
  });
});

describe("MAX_FILE_SIZE", () => {
  it("fixe la limite a 25 Mo", () => {
    expect(MAX_FILE_SIZE).toBe(25 * 1024 * 1024);
  });
});
