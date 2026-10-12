"use client";
/**
 * Detail d'un dossier : informations, classification (statut), preuves
 * (import, verification, comparaison, telechargement, chaine de custodie),
 * sites frauduleux analyses et rapport PDF.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";

import {
  apiFetch,
  fmtDate,
  fmtHash,
  fmtTaille,
  peutEcrire,
  useApi,
  useCompte,
  type AnalyseSite,
  type Chaine,
  type Dossier,
  type Evenement,
  type Preuve,
  type VerdictPreuve,
} from "@/lib/client";
import {
  Alerte,
  BadgeChaine,
  BadgeStatut,
  BadgeVerdictPreuve,
  BadgeVerdictSite,
  Carte,
  Chargeur,
  CLASSES_BOUTON_PRINCIPAL,
  CLASSES_BOUTON_SECONDAIRE,
  CLASSES_CHAMP,
  MessageErreur,
  Vide,
} from "@/components/ui";

const STATUTS = ["OUVERT", "EN_COURS", "CLOTURE"] as const;

export default function PageDossier() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [compte] = useCompte();
  const idCompte = compte?.id ?? "";
  const lecture = peutEcrire(compte);

  // Donnees
  const dossiers = useApi<{ dossiers: Dossier[] }>(() => "/api/cases", [idCompte]);
  const dossier = dossiers.donnees?.dossiers.find((d) => d.id === id) ?? null;

  const preuves = useApi<{ preuves: Preuve[] }>(
    () => `/api/cases/${id}/evidence`,
    [id, idCompte],
  );
  const analyses = useApi<{ analyses: AnalyseSite[] }>(
    () => `/api/cases/${id}/sites`,
    [id, idCompte],
  );

  const [onglet, setOnglet] = useState<"preuves" | "sites">("preuves");
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Import de preuve
  const [fichier, setFichier] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [provenance, setProvenance] = useState("");
  const [collecte, setCollecte] = useState("");

  // Resultats par preuve
  const [verdicts, setVerdicts] = useState<Record<string, VerdictPreuve>>({});
  const [histories, setHistories] = useState<
    Record<string, { evenements: Evenement[]; chaineCustodie: Chaine } | "chargement">
  >({});
  const [comparateurs, setComparateurs] = useState<Record<string, File | null>>({});
  const inputComparaison = useRef<HTMLInputElement>(null);
  const cibleComparaison = useRef<string>("");

  // Analyse de site
  const [urlSaisie, setUrlSaisie] = useState("");
  const [analyseCourante, setAnalyseCourante] = useState<AnalyseSite | null>(null);

  const notifier = (type: "ok" | "erreur", texte: string) => setMessage({ type, texte });

  const changerStatut = async (statut: string) => {
    try {
      await apiFetch(`/api/cases/${id}`, { method: "PATCH", body: JSON.stringify({ statut }) });
      notifier("ok", `Statut mis à jour : ${statut.replace("_", " ").toLowerCase()}`);
      dossiers.recharger();
    } catch (e) {
      notifier("erreur", e instanceof Error ? e.message : "Echec de la mise à jour");
    }
  };

  const importer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fichier) return;
    setEnCours(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", fichier);
      if (description) fd.append("description", description);
      if (provenance) fd.append("provenance", provenance);
      if (collecte) fd.append("dateCollecteDeclaree", new Date(collecte).toISOString());

      const r = await apiFetch<{ evidence: Preuve; doublon: { de: { nomOriginal: string } } | null }>(
        `/api/cases/${id}/evidence`,
        { method: "POST", body: fd },
      );
      notifier("ok", `Preuve « ${r.evidence.nomOriginal} » enregistrée — SHA-256 : ${fmtHash(r.evidence.empreinteInitiale)}`);
      if (r.doublon) {
        notifier("erreur", `Attention : contenu identique déjà présent (« ${r.doublon.de.nomOriginal} »).`);
      }
      setFichier(null);
      setDescription("");
      setProvenance("");
      setCollecte("");
      (e.target as HTMLFormElement).reset();
      preuves.recharger();
      dossiers.recharger();
    } catch (err) {
      notifier("erreur", err instanceof Error ? err.message : "Echec de l'import");
    } finally {
      setEnCours(false);
    }
  };

  const verifier = async (idPreuve: string) => {
    setEnCours(true);
    try {
      const r = await apiFetch<VerdictPreuve>(`/api/evidence/${idPreuve}/verify`, { method: "POST" });
      setVerdicts((v) => ({ ...v, [idPreuve]: r }));
      if (histories[idPreuve] && histories[idPreuve] !== "chargement") chargerHistorique(idPreuve);
    } catch (e) {
      notifier("erreur", e instanceof Error ? e.message : "Echec de la vérification");
    } finally {
      setEnCours(false);
    }
  };

  const demanderComparaison = (idPreuve: string) => {
    cibleComparaison.current = idPreuve;
    inputComparaison.current?.click();
  };

  const comparer = async () => {
    const idPreuve = cibleComparaison.current;
    const copie = comparateurs[idPreuve];
    if (!idPreuve || !copie) return;
    setEnCours(true);
    try {
      const fd = new FormData();
      fd.append("file", copie);
      const r = await apiFetch<VerdictPreuve>(`/api/evidence/${idPreuve}/compare`, {
        method: "POST",
        body: fd,
      });
      setVerdicts((v) => ({ ...v, [idPreuve]: r }));
      setComparateurs((c) => ({ ...c, [idPreuve]: null }));
    } catch (e) {
      notifier("erreur", e instanceof Error ? e.message : "Echec de la comparaison");
    } finally {
      setEnCours(false);
    }
  };

  const chargerHistorique = async (idPreuve: string) => {
    setHistories((h) => ({ ...h, [idPreuve]: "chargement" }));
    try {
      const r = await apiFetch<{ evenements: Evenement[]; chaineCustodie: Chaine }>(
        `/api/evidence/${idPreuve}/custody`,
      );
      setHistories((h) => ({ ...h, [idPreuve]: r }));
    } catch {
      setHistories((h) => ({ ...h, [idPreuve]: { evenements: [], chaineCustodie: { ok: false, total: 0, casseAu: null } } }));
    }
  };

  const analyserSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlSaisie.trim()) return;
    setEnCours(true);
    setMessage(null);
    try {
      const r = await apiFetch<{ analyse: AnalyseSite }>("/api/sites/analyze", {
        method: "POST",
        body: JSON.stringify({ url: urlSaisie, caseId: id }),
      });
      setAnalyseCourante(r.analyse);
      setUrlSaisie("");
      notifier(
        r.analyse.verdict === "SURE" ? "ok" : "erreur",
        `Verdict : ${r.analyse.verdict} (risque ${r.analyse.score}/100)`,
      );
      analyses.recharger();
      dossiers.recharger();
    } catch (err) {
      notifier("erreur", err instanceof Error ? err.message : "Echec de l'analyse");
    } finally {
      setEnCours(false);
    }
  };

  // --- Rendu -----------------------------------------------------------------

  if (dossiers.chargement) return <Chargeur />;
  if (!dossier) {
    return (
      <MessageErreur texte="Dossier introuvable. Il a peut-être été supprimé ou vous n'y avez pas accès." />
    );
  }

  const listePreuves = preuves.donnees?.preuves ?? [];
  const listeAnalyses = analyses.donnees?.analyses ?? [];

  return (
    <div className="space-y-6">
      {/* En-tête du dossier */}
      <Carte>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold text-[#F2C14E]">{dossier.reference}</p>
            <h1 className="text-xl font-bold text-white">{dossier.titre}</h1>
            {dossier.description && (
              <p className="mt-1 max-w-2xl text-sm text-slate-400">{dossier.description}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {dossier.categorie ?? "Sans catégorie"} · créé le {fmtDate(dossier.dateCreation)}
              {dossier.creePar ? ` par ${dossier.creePar.nom}` : ""} · {listePreuves.length} preuve(s)
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <BadgeStatut statut={dossier.statut} />
              {lecture && (
                <select
                  value={dossier.statut}
                  onChange={(e) => changerStatut(e.target.value)}
                  className={`${CLASSES_CHAMP} w-auto text-xs`}
                  title="Classer le dossier"
                >
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <a
              href={`/api/cases/${dossier.id}/report.pdf`}
              className={CLASSES_BOUTON_PRINCIPAL}
            >
              Rapport PDF
            </a>
          </div>
        </div>
      </Carte>

      {message && <Alerte type={message.type} texte={message.texte} />}

      {/* Onglets */}
      <div className="flex gap-2">
        {(
          [
            ["preuves", `Preuves (${listePreuves.length})`],
            ["sites", `Sites analysés (${listeAnalyses.length})`],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            onClick={() => setOnglet(cle)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              onglet === cle
                ? "bg-[#F2C14E] text-[#0B1526]"
                : "bg-[#111F38] text-slate-300 hover:text-white"
            }`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {/* ---------------- Onglet preuves ---------------- */}
      {onglet === "preuves" && (
        <div className="space-y-4">
          {lecture && (
            <Carte>
              <h3 className="mb-3 text-sm font-semibold text-white">Ajouter une preuve</h3>
              <form onSubmit={importer} className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs text-slate-400 md:col-span-2">
                  Fichier * (25 Mo max — types contrôlés par magic bytes)
                  <input
                    type="file"
                    required
                    onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[#F2C14E] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#0B1526] hover:file:brightness-110"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Description
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Facture de la fausse boutique…"
                    className={`${CLASSES_CHAMP} mt-1`}
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Provenance déclarée
                  <input
                    value={provenance}
                    onChange={(e) => setProvenance(e.target.value)}
                    placeholder="Courriel reçu, capture de la victime…"
                    className={`${CLASSES_CHAMP} mt-1`}
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Date de collecte déclarée
                  <input
                    type="date"
                    value={collecte}
                    onChange={(e) => setCollecte(e.target.value)}
                    className={`${CLASSES_CHAMP} mt-1`}
                  />
                </label>
                <div className="flex items-end">
                  <button type="submit" disabled={enCours || !fichier} className={CLASSES_BOUTON_PRINCIPAL}>
                    {enCours ? "Enregistrement…" : "Enregistrer la preuve"}
                  </button>
                </div>
              </form>
            </Carte>
          )}

          {preuves.chargement ? (
            <Chargeur />
          ) : listePreuves.length === 0 ? (
            <Vide message="Aucune preuve dans ce dossier pour le moment." />
          ) : (
            listePreuves.map((p) => {
              const verdict = verdicts[p.id];
              const historique = histories[p.id];
              return (
                <Carte key={p.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{p.nomOriginal}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {p.mimeType} · {fmtTaille(p.taille)} · enregistrée le {fmtDate(p.dateEnregistrement)}
                        {p.ajoutePar ? ` par ${p.ajoutePar.nom}` : ""}
                        {p.dateCollecteDeclaree
                          ? ` · collectée le ${fmtDate(p.dateCollecteDeclaree)} (déclarée)`
                          : ""}
                      </p>
                      <p className="mt-1 font-mono text-xs text-[#5FA8FF]" title={p.empreinteInitiale}>
                        SHA-256 : {fmtHash(p.empreinteInitiale)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => verifier(p.id)} disabled={enCours} className={CLASSES_BOUTON_SECONDAIRE}>
                        Vérifier l&apos;intégrité
                      </button>
                      <button onClick={() => demanderComparaison(p.id)} disabled={enCours} className={CLASSES_BOUTON_SECONDAIRE}>
                        Comparer une copie…
                      </button>
                      <a href={`/api/evidence/${p.id}/download`} className={CLASSES_BOUTON_SECONDAIRE}>
                        Télécharger
                      </a>
                      <button
                        onClick={() =>
                          historique && historique !== "chargement"
                            ? setHistories((h) => ({ ...h, [p.id]: undefined as never }))
                            : chargerHistorique(p.id)
                        }
                        className={CLASSES_BOUTON_SECONDAIRE}
                      >
                        {historique && historique !== "chargement" ? "Masquer l'historique" : "Historique"}
                      </button>
                    </div>
                  </div>

                  {/* Verdict */}
                  {verdict && (
                    <div className="mt-3 rounded-lg border border-slate-700 bg-[#0B1526] p-3">
                      <div className="flex items-center gap-2">
                        <BadgeVerdictPreuve verdict={verdict.verdict} />
                        <span className="text-xs text-slate-400">
                          {verdict.verdict === "IDENTIQUE"
                            ? "Le fichier stocké correspond exactement à l'empreinte initiale."
                            : `Altération détectée : ${verdict.motif ?? "empreinte différente"}`}
                        </span>
                      </div>
                      {verdict.empreinteRecalculee && (
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          Recalculée : {fmtHash(verdict.empreinteRecalculee)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Input de comparaison cache */}
                  <input
                    type="file"
                    ref={inputComparaison}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setComparateurs((c) => ({ ...c, [cibleComparaison.current]: f }));
                      if (f) comparer();
                      e.target.value = "";
                    }}
                  />
                  {comparateurs[p.id] && (
                    <p className="mt-2 text-xs text-slate-400">Copie sélectionnée : {comparateurs[p.id]!.name}</p>
                  )}

                  {/* Historique */}
                  {historique === "chargement" && <Chargeur texte="Chargement de l'historique…" />}
                  {historique && historique !== "chargement" && (
                    <div className="mt-3 rounded-lg border border-slate-700 bg-[#0B1526] p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">Chaîne de custodie</span>
                        <BadgeChaine chaine={historique.chaineCustodie} />
                      </div>
                      <ol className="space-y-1.5">
                        {historique.evenements.map((ev, i) => (
                          <li key={ev.id} className="text-xs">
                            <span className="font-mono text-slate-500">#{i + 1}</span>{" "}
                            <span className="font-semibold text-[#F2C14E]">
                              {ev.action.replace("_", " ")}
                            </span>{" "}
                            <span className="text-slate-400">
                              — {fmtDate(ev.horodatage)} · {ev.acteurLabel}
                            </span>
                            <span className="block pl-6 font-mono text-[10px] text-slate-600">
                              hash {fmtHash(ev.hashEvenement)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </Carte>
              );
            })
          )}
        </div>
      )}

      {/* ---------------- Onglet sites ---------------- */}
      {onglet === "sites" && (
        <div className="space-y-4">
          {lecture && (
            <Carte>
              <h3 className="mb-1 text-sm font-semibold text-white">
                Analyser une URL dans le cadre de ce dossier
              </h3>
              <p className="mb-3 text-xs text-slate-400">
                Analyse lexicale de l&apos;URL puis récupération protégée de la page (SSRF bloqué,
                5 s, 300 Ko) — score de risque 0-100 et indicateurs détaillés.
              </p>
              <form onSubmit={analyserSite} className="flex flex-wrap gap-2">
                <input
                  type="url"
                  required
                  value={urlSaisie}
                  onChange={(e) => setUrlSaisie(e.target.value)}
                  placeholder="https://facebook-secure-login.xyz/verify"
                  className={`${CLASSES_CHAMP} min-w-[260px] flex-1`}
                />
                <button type="submit" disabled={enCours} className={CLASSES_BOUTON_PRINCIPAL}>
                  {enCours ? "Analyse…" : "Analyser l'URL"}
                </button>
              </form>
              {analyseCourante && (
                <div className="mt-4">
                  <ResultatAnalyse analyse={analyseCourante} />
                </div>
              )}
            </Carte>
          )}

          {analyses.chargement ? (
            <Chargeur />
          ) : listeAnalyses.length === 0 ? (
            <Vide message="Aucune URL analysée pour ce dossier." />
          ) : (
            listeAnalyses.map((a) => (
              <Carte key={a.id} className="p-4">
                <ResultatAnalyse analyse={a} />
              </Carte>
            ))
          )}
        </div>
      )}

      {/* Lien retour */}
      <Link href="/dossiers" className="inline-block text-sm text-[#F2C14E] hover:underline">
        ← Retour à la liste des dossiers
      </Link>
    </div>
  );
}

/** Affichage d'une analyse de site (verdict, score, indicateurs). */
function ResultatAnalyse({ analyse }: { analyse: AnalyseSite }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <BadgeVerdictSite verdict={analyse.verdict} />
        <span className="text-sm text-slate-300">
          Risque <strong>{analyse.score}/100</strong>
        </span>
        <span className="text-xs text-slate-500">
          {analyse.contenuAnalyse ? "URL + contenu analysés" : "URL seule (contenu inaccessible)"}
          {analyse.dossier ? ` · dossier ${analyse.dossier.reference}` : ""}
        </span>
        <span className="ml-auto text-xs text-slate-500">{fmtDate(analyse.analyseLe)}</span>
      </div>
      <p className="mt-1 break-all font-mono text-xs text-slate-400">{analyse.url}</p>
      <ul className="mt-2 space-y-1">
        {analyse.indicateurs.map((ind) => (
          <li key={ind.code} className="text-xs">
            <span
              className={
                ind.gravite === "haute"
                  ? "font-semibold text-red-400"
                  : ind.gravite === "moyenne"
                    ? "font-semibold text-yellow-400"
                    : ind.gravite === "info"
                      ? "text-slate-400"
                      : "text-slate-300"
              }
            >
              [{ind.gravite}]
            </span>{" "}
            <span className="text-slate-300">{ind.message}</span>
          </li>
        ))}
        {analyse.indicateurs.length === 0 && (
          <li className="text-xs text-emerald-400">Aucun indicateur de fraude détecté.</li>
        )}
      </ul>
    </div>
  );
}
