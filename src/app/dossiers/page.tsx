"use client";
/**
 * Dossiers d'incident : liste, recherche (texte + statut), creation.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  apiFetch,
  fmtDateCourte,
  peutEcrire,
  useApi,
  useCompte,
  type Dossier,
} from "@/lib/client";
import {
  Alerte,
  BadgeStatut,
  Carte,
  Chargeur,
  CLASSES_BOUTON_PRINCIPAL,
  CLASSES_CHAMP,
  MessageErreur,
  Titre,
  Vide,
} from "@/components/ui";

const STATUTS = ["TOUS", "OUVERT", "EN_COURS", "CLOTURE"] as const;

const CATEGORIES_SUGGEREES = [
  "Escroquerie en ligne",
  "Hameçonnage (phishing)",
  "Usurpation d'identité",
  "Fraude aux mobile money",
  "Fausse boutique en ligne",
  "Attaque par déni de service",
];

export default function PageDossiers() {
  const [compte] = useCompte();
  const idCompte = compte?.id ?? "";
  const { donnees, erreur, chargement, recharger } = useApi<{ dossiers: Dossier[] }>(
    () => "/api/cases",
    [idCompte],
  );

  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<(typeof STATUTS)[number]>("TOUS");
  const [formOuvert, setFormOuvert] = useState(false);

  // Formulaire de creation
  const [reference, setReference] = useState("");
  const [titre, setTitre] = useState("");
  const [categorie, setCategorie] = useState("");
  const [description, setDescription] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [messageCreation, setMessageCreation] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);

  const dossiers = useMemo(() => donnees?.dossiers ?? [], [donnees]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (filtreStatut !== "TOUS" && d.statut !== filtreStatut) return false;
      if (!q) return true;
      return [d.reference, d.titre, d.categorie ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [dossiers, recherche, filtreStatut]);

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setMessageCreation(null);
    try {
      const r = await apiFetch<{ dossier: Dossier }>("/api/cases", {
        method: "POST",
        body: JSON.stringify({
          reference: reference.trim() || undefined,
          titre,
          categorie: categorie.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      setMessageCreation({ type: "ok", texte: `Dossier ${r.dossier.reference} créé.` });
      setReference("");
      setTitre("");
      setCategorie("");
      setDescription("");
      setFormOuvert(false);
      recharger();
    } catch (err) {
      setMessageCreation({
        type: "erreur",
        texte: err instanceof Error ? err.message : "Echec de la création",
      });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-6">
      <Titre
        action={
          peutEcrire(compte) ? (
            <button
              onClick={() => setFormOuvert((v) => !v)}
              className={CLASSES_BOUTON_PRINCIPAL}
            >
              {formOuvert ? "Fermer" : "+ Nouveau dossier"}
            </button>
          ) : undefined
        }
      >
        Dossiers d&apos;incident
      </Titre>

      {messageCreation && <Alerte type={messageCreation.type} texte={messageCreation.texte} />}

      {/* Formulaire de creation */}
      {formOuvert && peutEcrire(compte) && (
        <Carte>
          <h3 className="mb-3 text-sm font-semibold text-white">Créer un dossier</h3>
          <form onSubmit={creer} className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Référence (auto si vide)
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="CT-2026-002"
                pattern="^CT-\d{4}-\d{3,}$"
                title="Format CT-AAAA-NNN"
                className={`${CLASSES_CHAMP} mt-1 font-mono`}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Catégorie
              <input
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                list="categories"
                placeholder="Escroquerie en ligne…"
                className={`${CLASSES_CHAMP} mt-1`}
              />
              <datalist id="categories">
                {CATEGORIES_SUGGEREES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block text-xs text-slate-400 md:col-span-2">
              Titre *
              <input
                required
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Ex. Fraude à la vente en ligne — usurpation de boutique"
                className={`${CLASSES_CHAMP} mt-1`}
              />
            </label>
            <label className="block text-xs text-slate-400 md:col-span-2">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Contexte de l'incident, victime présumée, éléments connus…"
                className={`${CLASSES_CHAMP} mt-1`}
              />
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={envoi} className={CLASSES_BOUTON_PRINCIPAL}>
                {envoi ? "Création…" : "Créer le dossier"}
              </button>
            </div>
          </form>
        </Carte>
      )}

      {/* Recherche + filtres */}
      <Carte className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (référence, titre, catégorie)…"
            className={`${CLASSES_CHAMP} max-w-sm`}
          />
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value as (typeof STATUTS)[number])}
            className={`${CLASSES_CHAMP} w-auto`}
          >
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {s === "TOUS" ? "Tous les statuts" : s.replace("_", " ")}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-slate-500">
            {filtres.length} dossier(s)
          </span>
        </div>
      </Carte>

      {/* Liste */}
      {chargement ? (
        <Chargeur />
      ) : erreur ? (
        <MessageErreur texte={erreur} />
      ) : filtres.length === 0 ? (
        <Vide
          message={
            dossiers.length === 0
              ? "Aucun dossier. Créez-en un depuis le tableau de bord ou chargez le jeu de démonstration."
              : "Aucun dossier ne correspond à la recherche."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtres.map((d) => (
            <Link key={d.id} href={`/dossiers/${d.id}`}>
              <Carte className="h-full transition-colors hover:border-[#F2C14E]/60">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-[#F2C14E]">{d.reference}</span>
                  <BadgeStatut statut={d.statut} />
                </div>
                <h3 className="mt-1 text-sm font-semibold text-white">{d.titre}</h3>
                {d.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{d.description}</p>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  {d.categorie ?? "Sans catégorie"} · {d.nbPreuves ?? 0} preuve(s) ·{" "}
                  {d.nbSites ?? 0} site(s) analysé(s) · créé le {fmtDateCourte(d.dateCreation)}
                </p>
              </Carte>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
