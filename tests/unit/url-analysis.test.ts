/**
 * Tests unitaires de l'analyse lexicale des URL (detection de sites frauduleux).
 * Aucun reseau : uniquement les fonctions pures de src/lib/detection/url-analysis.ts
 */
import { describe, expect, it } from "vitest";

import {
  analyserUrl,
  levenshtein,
  normaliserUrl,
  scorer,
  verdict,
} from "@/lib/detection/url-analysis";

/** Analyse + score + verdict en une passe. */
function evaluer(url: string) {
  const { url: u, indicateurs } = analyserUrl(url);
  const score = scorer(indicateurs);
  return { url: u, indicateurs, score, verdict: verdict(score) };
}

describe("analyserUrl — sites legitimes", () => {
  it("HTTPS sur un domaine officiel = aucun indicateur, verdict SURE", () => {
    const r = evaluer("https://www.google.com/search?q=cybersecurite");
    expect(r.url).not.toBeNull();
    expect(r.indicateurs).toHaveLength(0);
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("SURE");
  });

  it("domaine officiel d'une marque = pas d'usurpation", () => {
    const r = evaluer("https://www.facebook.com/actualite");
    expect(r.indicateurs.filter((i) => i.code === "MARQUE_USURPEE")).toHaveLength(0);
    expect(r.verdict).toBe("SURE");
  });

  it("URL invalide = indicateur URL_INVALIDE, jamais jugee SURE", () => {
    const r = evaluer("pas-du-tout-une-url");
    expect(r.url).toBeNull();
    expect(r.indicateurs[0].code).toBe("URL_INVALIDE");
    expect(r.verdict).toBe("SUSPECTE"); // non analysable = a verifier manuellement
  });
});

describe("analyserUrl — sites frauduleux", () => {
  it("faux login Facebook sur TLD .xyz = FRAUDULEUSE avec marque usurpee", () => {
    const r = evaluer("https://facebook-secure-login.xyz/verify/account");
    expect(r.verdict).toBe("FRAUDULEUSE");
    const codes = r.indicateurs.map((i) => i.code);
    expect(codes).toContain("MARQUE_USURPEE");
    expect(codes).toContain("MOT_CLEFS_HAMECONNAGE");
    expect(codes).toContain("TLD_SUSPECT");
  });

  it("adresse IP en lieu de domaine + http + chemin d'hameconnage", () => {
    const r = evaluer("http://192.168.1.50/login/verify");
    const codes = r.indicateurs.map((i) => i.code);
    expect(codes).toContain("IP_EN_LIEU_DE_DOMAINE");
    expect(codes).toContain("SCHEME_HTTP");
    expect(codes).toContain("CHEMIN_HAMECONNAGE");
    expect(r.verdict).toBe("SUSPECTE"); // 12 + 25 + 12 = 49
  });

  it("attaque homographe (punycode) signalee", () => {
    const r = evaluer("https://xn--facebok-2za.com/login");
    const codes = r.indicateurs.map((i) => i.code);
    expect(codes).toContain("PUNYCODE");
    expect(r.verdict).toBe("SUSPECTE"); // 25 (punycode) + 12 (chemin) + 5 (tirets)
  });

  it("usurpation par faute de frappe d'un domaine officiel", () => {
    // "westernunion" sans le point, sur TLD banalisant
    const r = evaluer("https://westernunion-secure.top/envoi");
    const codes = r.indicateurs.map((i) => i.code);
    expect(codes).toContain("MARQUE_USURPEE");
    expect(codes).toContain("TLD_SUSPECT");
    expect(r.verdict).not.toBe("SURE");
  });

  it("raccourcisseur = destination masquee", () => {
    const r = evaluer("https://bit.ly/3xample");
    expect(r.indicateurs.map((i) => i.code)).toContain("RACCOURCISSEUR");
  });

  it("symbole @ masquant le vrai domaine", () => {
    const r = evaluer("https://www.google.com@evil-login.xyz/steal");
    expect(r.indicateurs.map((i) => i.code)).toContain("AROBASE");
    expect(r.verdict).toBe("FRAUDULEUSE");
  });

  it("port non standard signale", () => {
    const r = evaluer("https://shop.example.com:8443/");
    expect(r.indicateurs.map((i) => i.code)).toContain("PORT_NON_STANDARD");
  });
});

describe("scorer / verdict", () => {
  it("le score est plafonne a 100", () => {
    // URL cumulant punycode + marque + mots-clefs + TLD suspect + http + @ + tirets
    const { indicateurs } = analyserUrl("http://xn--facebook-verify-login.xyz/x@y");
    expect(indicateurs.length).toBeGreaterThanOrEqual(6);
    expect(scorer(indicateurs)).toBe(100);
  });

  it("seuils : <30 SURE, 30-59 SUSPECTE, >=60 FRAUDULEUSE", () => {
    expect(verdict(0)).toBe("SURE");
    expect(verdict(29)).toBe("SURE");
    expect(verdict(30)).toBe("SUSPECTE");
    expect(verdict(59)).toBe("SUSPECTE");
    expect(verdict(60)).toBe("FRAUDULEUSE");
    expect(verdict(100)).toBe("FRAUDULEUSE");
  });

  it("une seule indication moyenne reste SURE", () => {
    const { indicateurs } = analyserUrl("http://site-normal.com/");
    expect(scorer(indicateurs)).toBe(12);
    expect(verdict(scorer(indicateurs))).toBe("SURE");
  });
});

describe("utilitaires", () => {
  it("levenshtein mesure la distance entre chaines", () => {
    expect(levenshtein("facebook", "facebook")).toBe(0);
    expect(levenshtein("facebook", "facebok")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("normaliserUrl renvoie l'URL nettoyee et l'hote", () => {
    const n = normaliserUrl("  HTTPS://WWW.Example.com/Path  ");
    expect(n).not.toBeNull();
    expect(n!.hote).toBe("www.example.com");
    expect(n!.urlNormalisee).toContain("https://www.example.com/");
  });

  it("normaliserUrl renvoie null pour une URL invalide", () => {
    expect(normaliserUrl("invalide")).toBeNull();
  });
});
