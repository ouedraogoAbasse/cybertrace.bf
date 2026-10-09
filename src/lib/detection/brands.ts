/**
 * Marques frequentement usurpees par les sites frauduleux au Burkina Faso
 * et ailleurs (hameconnage, fausses boutiques, arnaques au pret).
 *
 * Utilise pour :
 *  - detecter une marque dans un nom de domaine qui n'est PAS le domaine officiel ;
 *  - detecter une marque citee dans le contenu d'une page dont l'hote n'est
 *    pas le domaine officiel (usurpation de contenu).
 */

export type Marque = {
  nom: string;
  /** Domaines officiels (commencement de l'hote accepte) */
  domainesOfficiels: string[];
};

export const MARQUES: Marque[] = [
  { nom: "Facebook", domainesOfficiels: ["facebook.com", "fb.com", "messenger.com"] },
  { nom: "WhatsApp", domainesOfficiels: ["whatsapp.com", "wa.me"] },
  { nom: "Instagram", domainesOfficiels: ["instagram.com"] },
  { nom: "Google", domainesOfficiels: ["google.com", "google.fr", "gmail.com", "youtube.com"] },
  { nom: "Microsoft", domainesOfficiels: ["microsoft.com", "live.com", "outlook.com"] },
  { nom: "Orange Money", domainesOfficiels: ["orangemoney.com", "orange.com", "orange.bf"] },
  { nom: "Moov Money", domainesOfficiels: ["moovmoney.com", "moov.africa", "moov.bf"] },
  { nom: "Airtel Money", domainesOfficiels: ["airtelmoney.com", "airtel.africa"] },
  { nom: "Western Union", domainesOfficiels: ["westernunion.com"] },
  { nom: "PayPal", domainesOfficiels: ["paypal.com", "paypal.fr"] },
  { nom: "Orange", domainesOfficiels: ["orange.com", "orange.bf"] },
  { nom: "Moov Africa", domainesOfficiels: ["moov.africa", "moov.bf"] },
  { nom: "Africell", domainesOfficiels: ["africell.com"] },
  { nom: "Telecel", domainesOfficiels: ["telecel.bf", "telecelgroup.com"] },
  { nom: "Coris Bank", domainesOfficiels: ["corisbank.com", "corisbank.bf"] },
  { nom: "Societe Generale", domainesOfficiels: ["societegenerale.bf", "societegenerale.com"] },
  { nom: "Ecobank", domainesOfficiels: ["ecobank.com"] },
  { nom: "Binance", domainesOfficiels: ["binance.com"] },
  { nom: "Jumia", domainesOfficiels: ["jumia.com", "jumia.bf"] },
  { nom: "Amazon", domainesOfficiels: ["amazon.com", "amazon.fr"] },
];

/** Termes d'hameconnage frequents dans les URL et les pages. */
export const MOTS_CLEFS_HAMECONNAGE = [
  "login",
  "log-in",
  "signin",
  "sign-in",
  "verify",
  "verification",
  "validate",
  "account",
  "auth",
  "password",
  "passwort",
  "secure",
  "security",
  "confirm",
  "update",
  "wallet",
  "unlock",
  "suspendu",
  "suspended",
  "recuperation",
  "recover",
  "identity",
  "kyc",
  "otp",
  "bonus",
  "gratuit",
  "gagne",
  "gain",
  "urgent",
  "debloquer",
  "claim",
  "reward",
  "prize",
];

/** TLD souvent utilises par les operateurs de fraudes. */
export const TLD_SUSPECTS = [
  ".xyz",
  ".top",
  ".click",
  ".icu",
  ".rest",
  ".site",
  ".online",
  ".shop",
  ".store",
  ".live",
  ".buzz",
  ".monster",
  ".tk",
  ".ml",
  ".ga",
  ".cf",
  ".gq",
  ".ru",
  ".cn",
  ".zip",
  ".mov",
];

/** Redirigeurs courts frequemment utilises pour masquer la cible. */
export const RACCOURCISSEURS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "is.gd",
  "rb.gy",
  "cutt.ly",
  "ow.ly",
  "shorturl.at",
  "s.id",
  "v.gd",
  "rebrand.ly",
];
