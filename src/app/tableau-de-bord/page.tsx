"use client";
/**
 * Tableau de bord : statistiques, derniers dossiers, dernieres analyses de
 * sites frauduleux et actions rapides.
 */
import Link from "next/link";

import {
  apiFetch,
  fmtDateCourte,
  peutEcrire,
  useApi,
  useCompte,
  type AnalyseSite,
  type Dossier,
} from "@/lib/client";
import {
  Alerte,
  BadgeStatut,
  BadgeVerdictSite,
  Carte,
  Chargeur,
  CLASSES_BOUTON_PRINCIPAL,
  CLASSES_BOUTON_SECONDAIRE,
  MessageErreur,
  Titre,
  Vide,
} from "@/components/ui";
import { useState } from "react";

export default function TableauDeBord() {
  const [compte] = useCompte();
  const idCompte = compte?.id ?? "";

  const dossiers = useApi<{ dossiers: Dossier[] }>(() => "/api/cases", [idCompte]);
  const sites = useApi<{ analyses: AnalyseSite[] }>(() => "/api/sites", [idCompte]);

  const [amorcao, setAmorcao] = useState(false);
  const [messageAmorcage, setMessageAmorcage] = useState<string | null>(null);

  const listeDossiers = dossiers.donnees?.dossiers ?? [];
  const listeAnalyses = sites.donnees?.analyses ?? [];

  const nbPreuves = listeDossiers.reduce((acc, d) => acc + (d.nbPreuves ?? 0), 0);
  const nbFraudeuses = listeAnalyses.filter((a) => a.verdict === "FRAUDULEUSE").length;

  const amorcer = async () => {
    setAmorcao(true);
    setMessageAmorcage(null);
    try {
      await apiFetch("/api/dev/seed", { method: "POST" });
      setMessageAmorcage("Jeu de démonstration chargé (dossier CT-2026-001 + comptes).");
      dossiers.recharger();
      sites.recharger();
    } catch (e) {
      setMessageAmorcage(e instanceof Error ? e.message : "Echec de l'amorçage");
    } finally {
      setAmorcao(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bannière d'accueil */}
      <Carte className="bg-gradient-to-r from-[#111F38] to-[#0e1a30]">
        <h1 className="text-2xl font-bold text-white">
          Bienvenue sur <span className="text-[#F2C14E]">CyberTrace</span> BF
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Centralisez les dossiers d&apos;incident, préservez les preuves numériques chiffrées
          (AES-256-GCM), contrôlez leur intégrité par SHA-256, tracez chaque opération et détectez
          les sites frauduleux.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/dossiers" className={CLASSES_BOUTON_PRINCIPAL}>
            Ouvrir les dossiers
          </Link>
          <Link href="/detection" className={CLASSES_BOUTON_SECONDAIRE}>
            Analyser une URL
          </Link>
          <Link href="/demo" className={CLASSES_BOUTON_SECONDAIRE}>
            Scénario de démonstration (jury)
          </Link>
        </div>
      </Carte>

      {/* Statistiques */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { valeur: listeDossiers.length, libelle: "Dossiers d'incident" },
          { valeur: nbPreuves, libelle: "Preuves préservées" },
          { valeur: listeAnalyses.length, libelle: "URL analysées" },
          { valeur: nbFraudeuses, libelle: "Sites frauduleux détectés" },
        ].map((s) => (
          <Carte key={s.libelle} className="p-4 text-center">
            <p className="text-3xl font-bold text-[#F2C14E]">{s.valeur}</p>
            <p className="mt-1 text-xs text-slate-400">{s.libelle}</p>
          </Carte>
        ))}
      </div>

      {/* Aucune donnée -> amorçage */}
      {dossiers.chargement ? (
        <Chargeur />
      ) : listeDossiers.length === 0 ? (
        <Carte>
          <Vide
            message="Aucun dossier pour l'instant. Chargez le jeu de démonstration (données fictives) pour commencer."
            action={
              peutEcrire(compte) ? (
                <button onClick={amorcer} disabled={amorcao} className={CLASSES_BOUTON_PRINCIPAL}>
                  {amorcao ? "Chargement…" : "Charger les données de démonstration"}
                </button>
              ) : undefined
            }
          />
          {messageAmorcage && (
            <div className="mt-3">
              <Alerte type={messageAmorcage.startsWith("Jeu") ? "ok" : "erreur"} texte={messageAmorcage} />
            </div>
          )}
        </Carte>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Derniers dossiers */}
          <Carte>
            <Titre
              action={
                <Link href="/dossiers" className="text-xs text-[#F2C14E] hover:underline">
                  Tout voir →
                </Link>
              }
            >
              Derniers dossiers
            </Titre>
            {dossiers.erreur ? (
              <MessageErreur texte={dossiers.erreur} />
            ) : (
              <ul className="divide-y divide-slate-800">
                {listeDossiers.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/dossiers/${d.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-700/20"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">
                          <span className="font-mono text-[#F2C14E]">{d.reference}</span>{" "}
                          {d.titre}
                        </span>
                        <span className="text-xs text-slate-500">
                          {d.categorie ?? "Sans catégorie"} · {d.nbPreuves ?? 0} preuve(s) ·{" "}
                          {fmtDateCourte(d.dateCreation)}
                        </span>
                      </span>
                      <BadgeStatut statut={d.statut} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          {/* Dernières analyses */}
          <Carte>
            <Titre
              action={
                <Link href="/detection" className="text-xs text-[#F2C14E] hover:underline">
                  Tout voir →
                </Link>
              }
            >
              Dernières détections de sites
            </Titre>
            {sites.chargement ? (
              <Chargeur />
            ) : listeAnalyses.length === 0 ? (
              <Vide message="Aucune URL analysée pour le moment." />
            ) : (
              <ul className="divide-y divide-slate-800">
                {listeAnalyses.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm text-white">{a.hote}</span>
                      <span className="text-xs text-slate-500">
                        Risque {a.score}/100 · {fmtDateCourte(a.analyseLe)}
                        {a.dossier ? ` · dossier ${a.dossier.reference}` : ""}
                      </span>
                    </span>
                    <BadgeVerdictSite verdict={a.verdict} />
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </div>
      )}
    </div>
  );
}
