"use client";
/**
 * Detection de sites frauduleux : analyse d'une URL (rattachable a un
 * dossier), verdict et indicateurs, historique global des analyses.
 */
import Link from "next/link";
import { useState } from "react";

import {
  apiFetch,
  fmtDate,
  peutEcrire,
  useApi,
  useCompte,
  type AnalyseSite,
  type Dossier,
} from "@/lib/client";
import {
  Alerte,
  BadgeVerdictSite,
  Carte,
  Chargeur,
  CLASSES_BOUTON_PRINCIPAL,
  CLASSES_CHAMP,
  Titre,
  Vide,
} from "@/components/ui";

export default function PageDetection() {
  const [compte] = useCompte();
  const idCompte = compte?.id ?? "";
  const lecture = peutEcrire(compte);

  const analyses = useApi<{ analyses: AnalyseSite[] }>(() => "/api/sites", [idCompte]);
  const dossiers = useApi<{ dossiers: Dossier[] }>(() => "/api/cases", [idCompte]);

  const [urlSaisie, setUrlSaisie] = useState("");
  const [caseId, setCaseId] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [analyseCourante, setAnalyseCourante] = useState<AnalyseSite | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);

  const liste = analyses.donnees?.analyses ?? [];
  const listeDossiers = dossiers.donnees?.dossiers ?? [];
  const nbFraudeuses = liste.filter((a) => a.verdict === "FRAUDULEUSE").length;
  const nbSuspectes = liste.filter((a) => a.verdict === "SUSPECTE").length;

  const analyser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlSaisie.trim()) return;
    setEnCours(true);
    setMessage(null);
    try {
      const r = await apiFetch<{ analyse: AnalyseSite }>("/api/sites/analyze", {
        method: "POST",
        body: JSON.stringify({ url: urlSaisie, caseId: caseId || undefined }),
      });
      setAnalyseCourante(r.analyse);
      setUrlSaisie("");
      setMessage({
        type: r.analyse.verdict === "SURE" ? "ok" : "erreur",
        texte: `Verdict : ${r.analyse.verdict} (risque ${r.analyse.score}/100)${
          r.analyse.dossier ? ` — rattaché au dossier ${r.analyse.dossier.reference}` : ""
        }`,
      });
      analyses.recharger();
    } catch (err) {
      setMessage({ type: "erreur", texte: err instanceof Error ? err.message : "Echec de l'analyse" });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="space-y-6">
      <Titre>Détection de sites frauduleux</Titre>

      {/* Analyse */}
      <Carte>
        <p className="mb-3 text-sm text-slate-400">
          Analyse hybride : heuristiques de l&apos;URL (usurpation de marque, homographie punycode,
          TLD suspect, mots-clés d&apos;hameçonnage…) puis récupération <strong>protégée</strong> de
          la page (requêtes vers les réseaux privés bloquées, 5 s et 300 Ko maximum, redirections non
          suivies). Score de risque 0-100 et verdict : <strong>SURE</strong> {"<"} 30 {"≤"}{" "}
          <strong>SUSPECTE</strong> {"<"} 60 {"≤"} <strong>FRAUDULEUSE</strong>.
        </p>
        {lecture ? (
          <form onSubmit={analyser} className="flex flex-wrap gap-2">
            <input
              type="url"
              required
              value={urlSaisie}
              onChange={(e) => setUrlSaisie(e.target.value)}
              placeholder="https://facebook-secure-login.xyz/verify"
              className={`${CLASSES_CHAMP} min-w-[260px] flex-1`}
            />
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className={`${CLASSES_CHAMP} w-auto`}>
              <option value="">— Sans dossier —</option>
              {listeDossiers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.reference} · {d.titre.slice(0, 40)}
                </option>
              ))}
            </select>
            <button type="submit" disabled={enCours} className={CLASSES_BOUTON_PRINCIPAL}>
              {enCours ? "Analyse…" : "Analyser l'URL"}
            </button>
          </form>
        ) : (
          <Alerte type="erreur" texte="Votre rôle (LECTEUR) ne permet pas de lancer des analyses." />
        )}
        {message && (
          <div className="mt-3">
            <Alerte type={message.type} texte={message.texte} />
          </div>
        )}
        {analyseCourante && (
          <div className="mt-4 rounded-lg border border-slate-700 bg-[#0B1526] p-4">
            <ResultatAnalyse analyse={analyseCourante} />
          </div>
        )}
      </Carte>

      {/* Statistiques + historique */}
      <Carte>
        <Titre>Historique des analyses</Titre>
        {liste.length > 0 && (
          <p className="mb-3 text-xs text-slate-500">
            {liste.length} analyse(s) · {nbFraudeuses} frauduleuse(s) · {nbSuspectes} suspecte(s)
          </p>
        )}
        {analyses.chargement ? (
          <Chargeur />
        ) : liste.length === 0 ? (
          <Vide message="Aucune URL analysée pour le moment. Essayez un domaine officiel (SURE) puis un faux login (FRAUDULEUSE)." />
        ) : (
          <div className="space-y-3">
            {liste.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-700 bg-[#0B1526] p-4">
                <ResultatAnalyse analyse={a} />
                {a.dossier && (
                  <Link
                    href={`/dossiers/${a.dossier.id}`}
                    className="mt-2 inline-block text-xs text-[#F2C14E] hover:underline"
                  >
                    Voir le dossier {a.dossier.reference} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Carte>
    </div>
  );
}

/** Affichage d'une analyse (verdict, score, indicateurs) — meme gabarit que la page dossier. */
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
        </span>
        <span className="ml-auto text-xs text-slate-500">
          {fmtDate(analyse.analyseLe)}
          {analyse.effectuePar ? ` · ${analyse.effectuePar.nom}` : ""}
        </span>
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
