"use client";
/**
 * Page de demonstration du module « Preuves numeriques » (Membre 2).
 *
 * Permet au jury de vivre le scenario complet sans Postman :
 * importer une preuve, voir l'empreinte SHA-256, verifier l'integrite,
 * comparer une copie modifiee, consulter la chaine de custodie et
 * telecharger le rapport PDF.
 *
 * Cette page est conservee comme scenario de demonstration guidé ; l'interface
 * complete de l'application vit sur /, /dossiers et /detection.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/client";

type Dossier = {
  id: string;
  reference: string;
  titre: string;
  categorie: string | null;
  statut: string;
  dateCreation: string;
  nbPreuves: number;
};

type Preuve = {
  id: string;
  nomOriginal: string;
  empreinteInitiale: string;
  taille: number;
  mimeType: string;
  description: string | null;
  provenanceDeclaree: string | null;
  dateCollecteDeclaree: string | null;
  dateEnregistrement: string;
};

type Verdict = {
  verdict: "IDENTIQUE" | "MODIFIE";
  empreinteRecalculee: string | null;
  empreinteCopie?: string;
  motif?: string | null;
};

type Evenement = {
  id: string;
  horodatage: string;
  acteurLabel: string;
  action: string;
  hashEvenement: string;
};

type Chaine = { ok: boolean; total: number; casseAu: number | null };

type AnalyseSite = {
  id: string;
  url: string;
  hote: string;
  score: number;
  verdict: "SURE" | "SUSPECTE" | "FRAUDULEUSE";
  indicateurs: { code: string; gravite: string; message: string; poids: number }[];
  contenuAnalyse: boolean;
  analyseLe: string;
  dossier?: { id: string; reference: string } | null;
};

const fmtDate = (d: string) => new Date(d).toLocaleString("fr-FR");
const fmtTaille = (o: number) =>
  o < 1024 ? `${o} o` : o < 1048576 ? `${(o / 1024).toFixed(1)} Ko` : `${(o / 1048576).toFixed(2)} Mo`;

export default function Demo() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [dossierId, setDossierId] = useState("");
  const [preuves, setPreuves] = useState<Preuve[]>([]);
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Formulaire d'import
  const [fichier, setFichier] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [provenance, setProvenance] = useState("");
  const [collecte, setCollecte] = useState("");

  // Résultats par preuve
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [histories, setHistories] = useState<Record<string, { evenements: Evenement[]; chaineCustodie: Chaine }>>({});
  const [comparateurs, setComparateurs] = useState<Record<string, File | null>>({});

  // Détection de site frauduleux
  const [urlSaisie, setUrlSaisie] = useState("");
  const [analyses, setAnalyses] = useState<AnalyseSite[]>([]);
  const [analyseCourante, setAnalyseCourante] = useState<AnalyseSite | null>(null);

  const inputComparaison = useRef<HTMLInputElement>(null);
  const cibleComparaison = useRef<string>("");

  const notifier = (type: "ok" | "erreur", texte: string) => setMessage({ type, texte });

  const chargerDossiers = useCallback(async () => {
    try {
      const corps = await apiFetch<{ dossiers: Dossier[] }>("/api/cases");
      setDossiers(corps.dossiers);
      if (corps.dossiers.length > 0) setDossierId((c) => c || corps.dossiers[0].id);
    } catch {
      /* pas de donnees : la page affichera ses etats vides */
    }
  }, []);

  const chargerPreuves = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const corps = await apiFetch<{ preuves: Preuve[] }>(`/api/cases/${id}/evidence`);
      setPreuves(corps.preuves);
    } catch {
      /* ignore */
    }
  }, []);

  const chargerAnalyses = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const corps = await apiFetch<{ analyses: AnalyseSite[] }>(`/api/cases/${id}/sites`);
      setAnalyses(corps.analyses);
    } catch {
      /* ignore */
    }
  }, []);

  // Chargement initial : le setState n'est atteint qu'apres le fetch (async).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerDossiers();
  }, [chargerDossiers]);

  // Rechargement des preuves et des analyses lorsque le dossier selectionne change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerPreuves(dossierId);
    chargerAnalyses(dossierId);
  }, [dossierId, chargerPreuves, chargerAnalyses]);

  const importer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fichier || !dossierId) return;
    setEnCours(true);
    try {
      const fd = new FormData();
      fd.append("file", fichier);
      if (description) fd.append("description", description);
      if (provenance) fd.append("provenance", provenance);
      if (collecte) fd.append("dateCollecteDeclaree", new Date(collecte).toISOString());

      const corps = await apiFetch<{
        evidence: Preuve;
        doublon: { de: { nomOriginal: string } } | null;
      }>(`/api/cases/${dossierId}/evidence`, { method: "POST", body: fd });
      notifier("ok", `Preuve enregistrée — SHA-256 : ${corps.evidence.empreinteInitiale}`);
      if (corps.doublon) {
        notifier("ok", `Preuve enregistrée, MAIS doublon de « ${corps.doublon.de.nomOriginal} » déjà présent dans le dossier`);
      }
      setFichier(null);
      setDescription("");
      setProvenance("");
      setCollecte("");
      const form = e.target as HTMLFormElement;
      form.reset();
      chargerPreuves(dossierId);
    } catch (err) {
      notifier("erreur", `Import refusé : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    } finally {
      setEnCours(false);
    }
  };

  const analyserSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlSaisie.trim()) return;
    setEnCours(true);
    try {
      const corps = await apiFetch<{ analyse: AnalyseSite }>("/api/sites/analyze", {
        method: "POST",
        body: JSON.stringify({ url: urlSaisie, caseId: dossierId || undefined }),
      });
      setAnalyseCourante(corps.analyse);
      setUrlSaisie("");
      notifier(
        corps.analyse.verdict === "SURE" ? "ok" : "erreur",
        `Verdict : ${corps.analyse.verdict} (risque ${corps.analyse.score}/100)`,
      );
      chargerAnalyses(dossierId);
    } catch (err) {
      notifier("erreur", `Analyse refusée : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    } finally {
      setEnCours(false);
    }
  };

  const verifier = async (id: string) => {
    setEnCours(true);
    try {
      const corps = await apiFetch<Verdict>(`/api/evidence/${id}/verify`, { method: "POST" });
      setVerdicts((v) => ({ ...v, [id]: corps }));
      if (histories[id]) chargerHistorique(id);
    } catch (err) {
      notifier("erreur", err instanceof Error ? err.message : "Echec de la vérification");
    } finally {
      setEnCours(false);
    }
  };

  const comparer = async () => {
    const id = cibleComparaison.current;
    const fichier = comparateurs[id];
    if (!id || !fichier) return;
    setEnCours(true);
    try {
      const fd = new FormData();
      fd.append("file", fichier);
      const corps = await apiFetch<Verdict>(`/api/evidence/${id}/compare`, { method: "POST", body: fd });
      setVerdicts((v) => ({ ...v, [id]: { ...corps, empreinteRecalculee: corps.empreinteCopie ?? null } }));
      setComparateurs((c) => ({ ...c, [id]: null }));
    } catch (err) {
      notifier("erreur", err instanceof Error ? err.message : "Echec de la comparaison");
    } finally {
      setEnCours(false);
    }
  };

  const chargerHistorique = async (id: string) => {
    try {
      const corps = await apiFetch<{ evenements: Evenement[]; chaineCustodie: Chaine }>(
        `/api/evidence/${id}/custody`,
      );
      setHistories((h) => ({ ...h, [id]: corps }));
    } catch {
      /* ignore */
    }
  };

  const dossier = dossiers.find((d) => d.id === dossierId);

  return (
    <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Scénario de démonstration — module Preuves numériques
          </h1>
          <p className="text-sm text-slate-400">
            Suite complète sans Postman : importer, vérifier, comparer, tracer et exporter —
            données fictives.
          </p>
        </div>
        {message && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              message.type === "ok"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/40 bg-red-500/10 text-red-300"
            }`}
          >
            {message.texte}
          </div>
        )}

        {/* Dossier */}
        <section className="rounded-xl border border-slate-700 bg-[#111F38] p-5">
          <h2 className="mb-3 text-lg font-semibold text-white">1. Dossier d&apos;incident</h2>
          <select
            value={dossierId}
            onChange={(e) => setDossierId(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-[#0B1526] px-3 py-2 text-sm"
          >
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.reference} — {d.titre} ({d.nbPreuves} preuve{d.nbPreuves > 1 ? "s" : ""})
              </option>
            ))}
          </select>
        </section>

        {/* Import */}
        <section className="rounded-xl border border-slate-700 bg-[#111F38] p-5">
          <h2 className="mb-3 text-lg font-semibold text-white">2. Ajouter une preuve</h2>
          <form onSubmit={importer} className="grid gap-3 sm:grid-cols-2">
            <input
              type="file"
              onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
              required
              className="rounded-lg border border-slate-600 bg-[#0B1526] px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-[#2E86FF] file:px-3 file:py-1 file:text-white"
            />
            <input
              type="datetime-local"
              value={collecte}
              onChange={(e) => setCollecte(e.target.value)}
              placeholder="Date de collecte déclarée"
              className="rounded-lg border border-slate-600 bg-[#0B1526] px-3 py-2 text-sm"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description de la preuve"
              className="rounded-lg border border-slate-600 bg-[#0B1526] px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              value={provenance}
              onChange={(e) => setProvenance(e.target.value)}
              placeholder="Provenance déclarée (ex. : relevé de la victime)"
              className="rounded-lg border border-slate-600 bg-[#0B1526] px-3 py-2 text-sm sm:col-span-2"
            />
            <button
              type="submit"
              disabled={enCours || !fichier}
              className="rounded-lg bg-[#2E86FF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E6FD9] disabled:opacity-50 sm:col-span-2"
            >
              Enregistrer la preuve (empreinte SHA-256 calculée côté serveur)
            </button>
          </form>
        </section>

        {/* Preuves */}
        <section className="rounded-xl border border-slate-700 bg-[#111F38] p-5">
          <h2 className="mb-3 text-lg font-semibold text-white">
            3. Preuves du dossier {dossier?.reference ?? ""}
          </h2>
          {preuves.length === 0 && (
            <p className="text-sm text-slate-400">Aucune preuve enregistrée pour l&apos;instant.</p>
          )}
          <div className="space-y-4">
            {preuves.map((p, i) => {
              const verdict = verdicts[p.id];
              const historique = histories[p.id];
              return (
                <div key={p.id} className="rounded-lg border border-slate-700 bg-[#0B1526] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-white">
                      Preuve {i + 1} — {p.nomOriginal}
                    </h3>
                    <span className="rounded bg-slate-700/60 px-2 py-0.5 text-xs text-slate-300">
                      {p.mimeType} · {fmtTaille(p.taille)}
                    </span>
                  </div>

                  <p className="mt-2 break-all font-mono text-xs text-[#5FA8FF]">
                    SHA-256 : {p.empreinteInitiale}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Enregistrée le {fmtDate(p.dateEnregistrement)} (serveur)
                    {p.dateCollecteDeclaree && ` · collecte déclarée : ${fmtDate(p.dateCollecteDeclaree)}`}
                    {p.provenanceDeclaree && ` · provenance : ${p.provenanceDeclaree}`}
                  </p>

                  {verdict && (
                    <div
                      className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                        verdict.verdict === "IDENTIQUE"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-red-500/10 text-red-300"
                      }`}
                    >
                      <strong>Verdict : {verdict.verdict}</strong>
                      {verdict.motif && <> — {verdict.motif}</>}
                      {verdict.empreinteRecalculee && verdict.verdict === "MODIFIE" && (
                        <p className="mt-1 break-all font-mono text-xs">
                          empreinte recalculée : {verdict.empreinteRecalculee}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => verifier(p.id)}
                      disabled={enCours}
                      className="rounded bg-[#2E86FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E6FD9] disabled:opacity-50"
                    >
                      Vérifier l&apos;intégrité
                    </button>
                    <button
                      onClick={() => {
                        cibleComparaison.current = p.id;
                        inputComparaison.current?.click();
                      }}
                      className="rounded bg-[#F2C14E] px-3 py-1.5 text-xs font-semibold text-[#0B1526] hover:brightness-110"
                    >
                      Comparer une copie…
                    </button>
                    <a
                      href={`/api/evidence/${p.id}/download`}
                      className="rounded bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-500"
                    >
                      Télécharger
                    </a>
                    <button
                      onClick={() => (historique ? setHistories((h) => ({ ...h, [p.id]: undefined as never })) : chargerHistorique(p.id))}
                      className="rounded bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-500"
                    >
                      {historique ? "Masquer l&apos;historique" : "Historique"}
                    </button>
                  </div>

                  <input
                    ref={inputComparaison}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      setComparateurs((c) => ({ ...c, [cibleComparaison.current]: e.target.files?.[0] ?? null }));
                      comparer();
                    }}
                  />

                  {historique && (
                    <div className="mt-3 rounded-lg border border-slate-700 bg-[#111F38] p-3">
                      <p className="mb-2 text-xs font-semibold text-white">
                        Chaine de custodie ({historique.evenements.length} evenements) —
                        {historique.chaineCustodie.ok ? (
                          <span className="text-emerald-400"> chaine intacte ✓</span>
                        ) : (
                          <span className="text-red-400">
                            {" "}
                            chaine cassee à l&apos;événement {historique.chaineCustodie.casseAu} ✗
                          </span>
                        )}
                      </p>
                      <ul className="space-y-1 text-xs">
                        {historique.evenements.map((ev) => (
                          <li key={ev.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-800 pb-1">
                            <span>
                              {fmtDate(ev.horodatage)} — <strong>{ev.action}</strong> — {ev.acteurLabel}
                            </span>
                            <span className="break-all font-mono text-slate-500">{ev.hashEvenement.slice(0, 16)}…</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Détection de site frauduleux */}
        {dossier && (
          <section className="rounded-xl border border-slate-700 bg-[#111F38] p-5">
            <h2 className="mb-3 text-lg font-semibold text-white">4. Détection de site frauduleux</h2>
            <p className="mb-3 text-sm text-slate-400">
              Analyse hybride : heuristiques de l&apos;URL (hameçonnage, usurpation de marque) puis récupération
              protégée de la page (SSRF bloqué, 5 s max). Score de risque 0-100 et liste des indicateurs.
            </p>
            <form onSubmit={analyserSite} className="mb-4 flex flex-wrap gap-2">
              <input
                type="url"
                required
                value={urlSaisie}
                onChange={(e) => setUrlSaisie(e.target.value)}
                placeholder="https://facebook-secure-login.xyz/verify"
                className="min-w-[280px] flex-1 rounded-lg border border-slate-600 bg-[#0B1526] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#F2C14E] focus:outline-none"
              />
              <button
                type="submit"
                disabled={enCours}
                className="rounded-lg bg-[#F2C14E] px-4 py-2 text-sm font-semibold text-[#0B1526] hover:brightness-110 disabled:opacity-50"
              >
                {enCours ? "Analyse…" : "Analyser l'URL"}
              </button>
            </form>

            {analyseCourante && (
              <div
                className={`mb-4 rounded-lg border p-4 ${
                  analyseCourante.verdict === "FRAUDULEUSE"
                    ? "border-red-500/50 bg-red-500/10"
                    : analyseCourante.verdict === "SUSPECTE"
                      ? "border-yellow-500/50 bg-yellow-500/10"
                      : "border-emerald-500/50 bg-emerald-500/10"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded px-2 py-1 text-xs font-bold ${
                      analyseCourante.verdict === "FRAUDULEUSE"
                        ? "bg-red-500 text-white"
                        : analyseCourante.verdict === "SUSPECTE"
                          ? "bg-yellow-500 text-[#0B1526]"
                          : "bg-emerald-500 text-[#0B1526]"
                    }`}
                  >
                    {analyseCourante.verdict}
                  </span>
                  <span className="text-sm text-slate-300">
                    Risque : <strong>{analyseCourante.score}/100</strong>
                  </span>
                  <span className="text-xs text-slate-500">
                    {analyseCourante.contenuAnalyse ? "URL + contenu analysés" : "URL seule (contenu inaccessible)"}
                  </span>
                </div>
                <p className="mb-2 break-all text-xs text-slate-400">{analyseCourante.url}</p>
                <ul className="space-y-1">
                  {analyseCourante.indicateurs.map((ind) => (
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
                  {analyseCourante.indicateurs.length === 0 && (
                    <li className="text-xs text-emerald-400">Aucun indicateur de fraude détecté.</li>
                  )}
                </ul>
              </div>
            )}

            {analyses.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-300">
                  Historique des analyses ({analyses.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="py-1 pr-3">Date</th>
                        <th className="py-1 pr-3">Hôte</th>
                        <th className="py-1 pr-3">Score</th>
                        <th className="py-1 pr-3">Verdict</th>
                        <th className="py-1">Indicateurs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyses.map((a) => (
                        <tr key={a.id} className="border-b border-slate-800">
                          <td className="py-1 pr-3 text-slate-400">
                            {new Date(a.analyseLe).toLocaleString("fr-FR")}
                          </td>
                          <td className="max-w-[220px] truncate py-1 pr-3 text-slate-300">{a.hote}</td>
                          <td className="py-1 pr-3 font-mono text-slate-300">{a.score}</td>
                          <td className="py-1 pr-3">
                            <span
                              className={
                                a.verdict === "FRAUDULEUSE"
                                  ? "font-semibold text-red-400"
                                  : a.verdict === "SUSPECTE"
                                    ? "font-semibold text-yellow-400"
                                    : "text-emerald-400"
                              }
                            >
                              {a.verdict}
                            </span>
                          </td>
                          <td className="py-1 text-slate-400">{a.indicateurs.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Rapport */}
        {dossier && preuves.length > 0 && (
          <section className="rounded-xl border border-slate-700 bg-[#111F38] p-5">
            <h2 className="mb-2 text-lg font-semibold text-white">5. Rapport PDF du dossier</h2>
            <p className="mb-3 text-sm text-slate-400">
              Généré côté serveur avec les empreintes, les verdicts, les sites analysés et l&apos;historique complet.
            </p>
            <a
              href={`/api/cases/${dossier.id}/report.pdf`}
              className="inline-block rounded-lg bg-[#F2C14E] px-4 py-2 text-sm font-semibold text-[#0B1526] hover:brightness-110"
            >
              Télécharger le rapport {dossier.reference}.pdf
            </a>
          </section>
        )}

        {/* Scenario du jury */}
        <section className="rounded-xl border border-dashed border-[#F2C14E]/50 bg-[#111F38]/60 p-5 text-sm text-slate-300">
          <h2 className="mb-2 font-semibold text-[#F2C14E]">Scénario de démonstration (jury)</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Créer le dossier fictif CT-2026-001 (déjà présent).</li>
            <li>Ajouter le fichier <code className="text-[#5FA8FF]">preuve_demo.txt</code> et afficher son empreinte SHA-256.</li>
            <li>Cliquer « Vérifier l&apos;intégrité » → verdict <strong className="text-emerald-400">IDENTIQUE</strong>.</li>
            <li>Modifier une copie du fichier, puis « Comparer une copie… » → verdict <strong className="text-red-400">MODIFIE</strong>.</li>
            <li>
              Analyser une URL piégée (ex.{" "}
              <code className="text-[#5FA8FF]">https://facebook-secure-login.xyz/verify</code>) → verdict{" "}
              <strong className="text-red-400">FRAUDULEUSE</strong> avec la liste des indicateurs (marque usurpée,
              TLD suspect, champ de mot de passe…).
            </li>
            <li>Consulter l&apos;historique (chaîne intacte ✓) et télécharger le rapport PDF.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            Limite assumée : le SHA-256 prouve l&apos;intégrité depuis l&apos;enregistrement, pas l&apos;origine
            ni la date réelle de collecte.
          </p>
        </section>
    </div>
  );
}
