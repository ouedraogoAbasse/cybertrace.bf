/**
 * Analyse lexicale d'une URL — detection de site frauduleux (hameconnage).
 *
 * Chaque indicateur a une gravite et un poids ; le score final (0-100) est la
 * somme des poids plafonnee, et le verdict en decoule :
 *   score < 30  -> SURE
 *   30 <= score < 60 -> SUSPECTE
 *   score >= 60 -> FRAUDULEUSE
 *
 * Fonctions pures : testables sans reseau (tests unitaires).
 */
import {
  MARQUES,
  MOTS_CLEFS_HAMECONNAGE,
  RACCOURCISSEURS,
  TLD_SUSPECTS,
} from "./brands";

export type Gravite = "haute" | "moyenne" | "basse" | "info";

export type Indicateur = {
  code: string;
  gravite: Gravite;
  message: string;
  poids: number;
};

export type Verdict = "SURE" | "SUSPECTE" | "FRAUDULEUSE";

const POIDS: Record<Gravite, number> = { haute: 25, moyenne: 12, basse: 5, info: 0 };

function indicateur(code: string, gravite: Gravite, message: string): Indicateur {
  return { code, gravite, message, poids: POIDS[gravite] };
}

/** Distance de Levenshtein (usurpation de marque par faute de frappe). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let precede = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, precede + (a[i - 1] === b[j - 1] ? 0 : 1));
      precede = tmp;
    }
  }
  return d[n];
}

const EST_IP_V4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Analyse pure de l'URL. Renvoie les indicateurs et l'hote (ou null si URL invalide). */
export function analyserUrl(brut: string): {
  url: URL | null;
  indicateurs: Indicateur[];
} {
  const indicateurs: Indicateur[] = [];

  let url: URL;
  try {
    url = new URL(brut.trim());
  } catch {
    return {
      url: null,
      // Poids explicite : une URL non analysable ne peut pas etre certifiee
      // sure (sinon 25 < 30 donnerait verdict SURE par defaut).
      indicateurs: [
        {
          code: "URL_INVALIDE",
          gravite: "haute",
          message: "L'URL saisie n'est pas une URL valide",
          poids: 40,
        },
      ],
    };
  }

  const hote = url.hostname.toLowerCase();
  const sansWww = hote.replace(/^www\./, "");
  const chemin = (url.pathname + url.search).toLowerCase();

  // --- Schema ---
  if (url.protocol !== "https:") {
    indicateurs.push(
      indicateur("SCHEME_HTTP", "moyenne", "Connexion non chiffree (http) : les echanges peuvent etre interceptes"),
    );
  }

  // --- Hote = adresse IP ---
  const estIP = EST_IP_V4.test(sansWww);
  if (estIP) {
    indicateurs.push(
      indicateur("IP_EN_LIEU_DE_DOMAINE", "haute", "Le site est adresse par une IP directe plutot qu'un nom de domaine"),
    );
  }

  // --- Punycode / homographie ---
  if (hote.includes("xn--")) {
    indicateurs.push(
      indicateur("PUNYCODE", "haute", "Nom de domaine encodé en punycode : risque d'attaque homographe (lettres cyrilliques)"),
    );
  }

  // --- Mots-clefs d'hameconnage dans l'hote ---
  const motsHote = sansWww.split(/[.\-_0-9]+/).filter(Boolean);
  const motsHameconnage = motsHote.filter((m) => MOTS_CLEFS_HAMECONNAGE.includes(m));
  if (motsHameconnage.length > 0) {
    indicateurs.push(
      indicateur(
        "MOT_CLEFS_HAMECONNAGE",
        "haute",
        `Nom de domaine contenant des mots d'hameconnage : « ${motsHameconnage.join(", ")} »`,
      ),
    );
  }

  // --- Marque utilisee dans un domaine non officiel ---
  const marqueTrouvee = MARQUES.find((marque) => {
    const nomNormalise = marque.nom.toLowerCase().replace(/\s+/g, "");
    const hoteNormalise = sansWww.replace(/[.\-_]/g, "");
    return (
      hoteNormalise.includes(nomNormalise) &&
      !marque.domainesOfficiels.some((d) => sansWww === d || sansWww.endsWith(`.${d}`))
    );
  });
  if (marqueTrouvee) {
    indicateurs.push(
      indicateur(
        "MARQUE_USURPEE",
        "haute",
        `La marque « ${marqueTrouvee.nom} » apparait dans un domaine qui n'est pas le sien officiel`,
      ),
    );
  }

  // --- Usurpation proche d'un domaine officiel (faute de frappe) ---
  // Inutile (et faux) si l'hote EST deja un domaine officiel : google.com
  // n'est pas un lookalike de google.fr.
  const hoteEstOfficiel = MARQUES.some((marque) =>
    marque.domainesOfficiels.some((d) => sansWww === d || sansWww.endsWith(`.${d}`)),
  );
  const proche = hoteEstOfficiel
    ? undefined
    : MARQUES.find((marque) =>
        marque.domainesOfficiels.some((d) => {
          const racine = d.split(".")[0];
          return sansWww !== d && levenshtein(sansWww.split(".")[0], racine) <= 2 && racine.length > 4;
        }),
      );
  if (proche && !marqueTrouvee) {
    indicateurs.push(
      indicateur(
        "DOMAINE_PROCHE_MARQUE",
        "haute",
        `Nom de domaine tres proche d'un domaine officiel (${proche.nom}) : usurpation probable`,
      ),
    );
  }

  // --- TLD suspect ---
  const tld = "." + sansWww.split(".").slice(1).join(".");
  if (TLD_SUSPECTS.includes(tld)) {
    indicateurs.push(
      indicateur("TLD_SUSPECT", "moyenne", `Extension « ${tld} » couramment utilisee par les sites frauduleux`),
    );
  }

  // --- Raccourcisseur ---
  if (RACCOURCISSEURS.includes(sansWww)) {
    indicateurs.push(
      indicateur("RACCOURCISSEUR", "moyenne", "Lien raccourci : la destination reelle est masquee"),
    );
  }

  // --- Sous-domaines multiples (hors IP : les octets ne sont pas des domaines) ---
  const nbSousDomaines = sansWww.split(".").length - 2;
  if (!estIP && nbSousDomaines >= 2) {
    indicateurs.push(
      indicateur("OUS_DOMAINES", "moyenne", `${nbSousDomaines + 1} niveaux de sous-domaines : technique de camouflage habituelle`),
    );
  }

  // --- Tirets excessifs ---
  const tirets = (sansWww.match(/-/g) ?? []).length;
  if (tirets >= 2) {
    indicateurs.push(
      indicateur("TIRETS_EXCESSIFS", "basse", `${tirets} tirets dans le nom de domaine (signe frequent de faux sites)`),
    );
  }

  // --- Port non standard ---
  if (url.port && url.port !== "443" && url.port !== "80") {
    indicateurs.push(
      indicateur("PORT_NON_STANDARD", "moyenne", `Port atypique :${url.port} (hors navigateur standard)`),
    );
  }

  // --- @ dans l'URL (detournement visuel) ---
  if (brut.includes("@")) {
    indicateurs.push(
      indicateur("AROBASE", "haute", "Symbole « @ » dans l'URL : la partie reelle du domaine est masquee"),
    );
  }

  // --- Mots-clefs d'hameconnage dans le chemin ---
  const motsChemin = MOTS_CLEFS_HAMECONNAGE.filter((m) => chemin.includes(m));
  if (motsChemin.length > 0 && !motsHameconnage.length) {
    indicateurs.push(
      indicateur(
        "CHEMIN_HAMECONNAGE",
        "moyenne",
        `Chemin contenant des mots d'hameconnage : « ${motsChemin.slice(0, 4).join(", ")} »`,
      ),
    );
  }

  // --- URL tres longue ---
  if (brut.length > 120) {
    indicateurs.push(indicateur("URL_TROP_LONGUE", "basse", "URL anormalement longue (masquage de la vraie cible)"));
  }

  return { url, indicateurs };
}

/** Score final (0-100) a partir des indicateurs. */
export function scorer(indicateurs: Indicateur[]): number {
  const somme = indicateurs.reduce((acc, i) => acc + i.poids, 0);
  return Math.min(100, somme);
}

/** Verdict a partir du score. */
export function verdict(score: number): Verdict {
  if (score >= 60) return "FRAUDULEUSE";
  if (score >= 30) return "SUSPECTE";
  return "SURE";
}

/** Formate l'URL pour l'affichage / le stockage. */
export function normaliserUrl(brut: string): { urlNormalisee: string; hote: string } | null {
  try {
    const u = new URL(brut.trim());
    return { urlNormalisee: u.toString(), hote: u.hostname.toLowerCase() };
  } catch {
    return null;
  }
}
