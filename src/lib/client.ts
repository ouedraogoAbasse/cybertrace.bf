"use client";
/**
 * Cote client : comptes de demonstration, fetch unifie (en-tete x-user-id)
 * et formatages partages.
 *
 * BRANCHEMENT AUTH (Membre 1) : le compte selectionne est stocke en
 * localStorage et transmis par l'en-tête x-user-id, que resolveActor() lit
 * cote serveur. Pour passer a une vraie session, il suffit de supprimer la
 * lecture du localStorage ici — resolveActor deviendra la source de verite.
 */
import { useCallback, useEffect, useState } from "react";

export type Role = "ADMIN" | "ANALYSTE" | "LECTEUR";

export type Compte = { id: string; nom: string; email: string; role: Role };

export type Dossier = {
  id: string;
  reference: string;
  titre: string;
  description: string | null;
  categorie: string | null;
  statut: "OUVERT" | "EN_COURS" | "CLOTURE";
  dateCreation: string;
  creePar?: { nom: string };
  nbPreuves?: number;
  nbSites?: number;
};

export type Preuve = {
  id: string;
  nomOriginal: string;
  empreinteInitiale: string;
  taille: number;
  mimeType: string;
  dateCollecteDeclaree: string | null;
  dateEnregistrement: string;
  ajoutePar?: { nom: string };
};

export type VerdictPreuve = {
  verdict: "IDENTIQUE" | "MODIFIE";
  empreinteRecalculee: string | null;
  motif?: string | null;
};

export type Evenement = {
  id: string;
  horodatage: string;
  acteurLabel: string;
  action: string;
  hashEvenement: string;
  hashPrecedent: string | null;
};

export type Chaine = { ok: boolean; total: number; casseAu: number | null };

export type AnalyseSite = {
  id: string;
  url: string;
  hote: string;
  score: number;
  verdict: "SURE" | "SUSPECTE" | "FRAUDULEUSE";
  indicateurs: { code: string; gravite: string; message: string; poids: number }[];
  contenuAnalyse: boolean;
  dureeMs?: number | null;
  analyseLe: string;
  effectuePar?: { nom: string } | null;
  dossier?: { id: string; reference: string } | null;
};

/** Erreur API standardisee (statut + code serveur). */
export class ApiErreur extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiErreur";
  }
}

// --- Compte de demonstration ------------------------------------------------

const CLE_COMPTE = "cybertrace-compte";

export function lireCompte(): Compte | null {
  if (typeof window === "undefined") return null;
  try {
    const brut = localStorage.getItem(CLE_COMPTE);
    return brut ? (JSON.parse(brut) as Compte) : null;
  } catch {
    return null;
  }
}

export function changerCompte(compte: Compte | null) {
  if (compte) localStorage.setItem(CLE_COMPTE, JSON.stringify(compte));
  else localStorage.removeItem(CLE_COMPTE);
  window.dispatchEvent(new Event("cybertrace-compte"));
}

/** Compte courant, reactive au changement (selecteur de l'en-tete). */
export function useCompte(): [Compte | null, (c: Compte | null) => void, boolean] {
  const [compte, setCompte] = useState<Compte | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompte(lireCompte());
    setPret(true);
    const maj = () => setCompte(lireCompte());
    window.addEventListener("cybertrace-compte", maj);
    window.addEventListener("storage", maj);
    return () => {
      window.removeEventListener("cybertrace-compte", maj);
      window.removeEventListener("storage", maj);
    };
  }, []);

  return [compte, changerCompte, pret];
}

/** Vrai si le compte peut ecrire (creer, importer, verifier...). */
export function peutEcrire(compte: Compte | null): boolean {
  // Sans compte selectionne, l'API retombe sur l'utilisateur « dev » (ANALYSTE).
  return !compte || compte.role === "ADMIN" || compte.role === "ANALYSTE";
}

// --- Appel d'API -------------------------------------------------------------

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const compte = lireCompte();
  const headers = new Headers(init?.headers);
  if (compte) headers.set("x-user-id", compte.id);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const corps = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiErreur(res.status, corps?.error ?? `Erreur HTTP ${res.status}`, corps?.code);
  }
  return corps as T;
}

/** GET rapide avec etat de chargement/d'erreur (re-chargé si dépendances changent). */
export function useApi<T>(constructeurUrl: () => string | null, deps: unknown[]) {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(() => {
    const url = constructeurUrl();
    if (!url) return;
    setChargement(true);
    setErreur(null);
    apiFetch<T>(url)
      .then((d) => setDonnees(d))
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setChargement(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, deps);

  useEffect(() => {
    recharger();
  }, [recharger]);

  return { donnees, erreur, chargement, recharger };
}

// --- Formatages --------------------------------------------------------------

export const fmtDate = (d: string | Date) => new Date(d).toLocaleString("fr-FR");

export const fmtDateCourte = (d: string | Date) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const fmtTaille = (o: number) =>
  o < 1024 ? `${o} o` : o < 1048576 ? `${(o / 1024).toFixed(1)} Ko` : `${(o / 1048576).toFixed(2)} Mo`;

export const fmtHash = (h: string) => `${h.slice(0, 16)}…${h.slice(-8)}`;
