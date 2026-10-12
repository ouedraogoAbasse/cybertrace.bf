"use client";
/**
 * Cote client : session d'authentification, fetch unifie et formatages
 * partages.
 *
 * L'identite ne vit QUE dans le cookie HttpOnly pose par POST /api/auth/login
 * (aucun compte n'est stocke dans le navigateur) ; ce module ne fait que
 * refleter GET /api/auth/me. L'ancien selecteur de compte de demonstration
 * (localStorage + en-tete x-user-id) a ete remplace par la vraie connexion.
 */
import { useCallback, useEffect, useState } from "react";

export type Role = "ADMIN" | "ANALYSTE" | "LECTEUR";

export type Compte = { id: string; nom: string; email: string; role: Role; statut?: string };

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

// --- Session d'authentification ---------------------------------------------

/** Etat de session partage par tous les composants (source : /api/auth/me). */
let etatSession: { compte: Compte | null; pret: boolean } = { compte: null, pret: false };
let chargementSession: Promise<void> | null = null;
const ecouteursSession = new Set<() => void>();

function publierSession() {
  for (const fn of ecouteursSession) fn();
}

/**
 * Recharge l'etat de session depuis GET /api/auth/me (cookie HttpOnly).
 * Appel unique et partage : plusieurs composants peuvent l'appeler, une seule
 * requete part. `force` sert apres connexion / deconnexion.
 */
export function rechargerSession(force = false): Promise<void> {
  if (!force && sessionDejaChargee()) return Promise.resolve();
  if (!force && chargementSession) return chargementSession;

  chargementSession = (async () => {
    try {
      const r = await apiFetch<{ utilisateur: Compte }>("/api/auth/me", { sansRedirection401: true });
      etatSession = { compte: r.utilisateur, pret: true };
    } catch {
      // 401 = aucune session (ou erreur reseau) : on considere l'invite.
      etatSession = { compte: null, pret: true };
    } finally {
      chargementSession = null;
      publierSession();
    }
  })();
  return chargementSession;
}

function sessionDejaChargee(): boolean {
  return etatSession.pret;
}

/** Compte courant, reactive a la session (connexion / deconnexion comprise). */
export function useCompte(): [Compte | null, (c: Compte | null) => void, boolean] {
  const [etat, setEtat] = useState(etatSession);

  useEffect(() => {
    const maj = () => setEtat(etatSession);
    ecouteursSession.add(maj);
    void rechargerSession();
    return () => {
      ecouteursSession.delete(maj);
    };
  }, []);

  // Mise a jour optimiste locale (utilisee par la page de connexion).
  const majLocale = (compte: Compte | null) => {
    etatSession = { compte, pret: true };
    publierSession();
  };

  return [etat.compte, majLocale, etat.pret];
}

/** Ouvre une session reelle : POST /api/auth/login puis rafraichit l'etat. */
export async function connexion(email: string, motDePasse: string): Promise<Compte> {
  const r = await apiFetch<{ utilisateur: Compte }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, motDePasse }),
    sansRedirection401: true,
  });
  etatSession = { compte: r.utilisateur, pret: true };
  publierSession();
  return r.utilisateur;
}

/** Ferme la session : POST /api/auth/logout (cookie efface cote serveur). */
export async function deconnexion(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST", sansRedirection401: true });
  } finally {
    etatSession = { compte: null, pret: true };
    publierSession();
  }
}

/** Vrai si le compte courant peut ecrire (creer, importer, verifier...). */
export function peutEcrire(compte: Compte | null): boolean {
  return compte !== null && (compte.role === "ADMIN" || compte.role === "ANALYSTE");
}

/** Vrai si le compte courant est administrateur (gestion des comptes). */
export function estAdmin(compte: Compte | null): boolean {
  return compte?.role === "ADMIN";
}

// --- Appel d'API -------------------------------------------------------------

/**
 * Fetch unifie. L'identite voyage dans le cookie de session (HttpOnly) —
 * aucun en-tete d'identification n'est ajoute ici. En cas de 401 hors
 * /api/auth, l'utilisateur est redirige vers la page de connexion avec la
 * page courante en parametre `next`.
 */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit & { sansRedirection401?: boolean },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const sansRedirection = init?.sansRedirection401 === true || url.startsWith("/api/auth/");
  const res = await fetch(url, { ...init, headers, credentials: "same-origin" });
  const corps = await res.json().catch(() => null);

  if (res.status === 401 && !sansRedirection && typeof window !== "undefined") {
    const actuel = window.location.pathname + window.location.search;
    if (!actuel.startsWith("/connexion")) {
      window.location.assign(`/connexion?next=${encodeURIComponent(actuel)}`);
    }
  }

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
