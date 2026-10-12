"use client";
/**
 * Gestion des comptes utilisateurs (cahier des charges §3) — ADMIN.
 *
 * - liste des comptes (nom, courriel, role, statut, date de creation) ;
 * - creation d'un compte avec role et mot de passe ;
 * - changement de role, suspension / reactivation, reinitialisation du
 *   mot de passe. L'API refuse la modification de son propre compte et la
 *   perte du dernier compte ADMIN actif.
 */
import { useState } from "react";

import {
  apiFetch,
  estAdmin,
  fmtDateCourte,
  useApi,
  useCompte,
  type Compte,
  type Role,
} from "@/lib/client";
import {
  Alerte,
  Carte,
  Chargeur,
  CLASSES_BOUTON_PRINCIPAL,
  CLASSES_BOUTON_SECONDAIRE,
  CLASSES_CHAMP,
  MessageErreur,
  Titre,
  Vide,
} from "@/components/ui";

type CompteAvecStatut = Compte & { statut: "ACTIF" | "SUSPENDU"; dateCreation: string };

const ROLES: Role[] = ["ADMIN", "ANALYSTE", "LECTEUR"];

const COULEUR_ROLE: Record<Role, string> = {
  ADMIN: "bg-[#F2C14E]/15 text-[#F2C14E] border-[#F2C14E]/40",
  ANALYSTE: "bg-[#5FA8FF]/15 text-[#5FA8FF] border-[#5FA8FF]/40",
  LECTEUR: "bg-slate-600/20 text-slate-400 border-slate-600/60",
};

export default function PageComptes() {
  const [compte] = useCompte();
  const idCompte = compte?.id ?? "";
  const admin = estAdmin(compte);

  const { donnees, erreur, chargement, recharger } = useApi<{ utilisateurs: CompteAvecStatut[] }>(
    () => (admin ? "/api/users" : null),
    [idCompte, admin],
  );

  // Formulaire de creation
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("ANALYSTE");
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);

  // Reinitialisation de mot de passe (saisie dans le tableau)
  const [resetEnCours, setResetEnCours] = useState<string | null>(null);
  const [nouveauMdp, setNouveauMdp] = useState("");

  if (compte && !admin) {
    return (
      <Vide message="La gestion des comptes est réservée aux administrateurs (rôle ADMIN)." />
    );
  }

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ nom, email, role, motDePasse }),
      });
      setMessage({ type: "ok", texte: `Compte « ${nom} » créé avec le rôle ${role}.` });
      setNom("");
      setEmail("");
      setMotDePasse("");
      setRole("ANALYSTE");
      recharger();
    } catch (err) {
      setMessage({
        type: "erreur",
        texte: err instanceof Error ? err.message : "Echec de la création du compte",
      });
    } finally {
      setEnvoi(false);
    }
  };

  const modifier = async (userId: string, corps: Record<string, string>) => {
    setMessage(null);
    try {
      await apiFetch(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(corps) });
      setMessage({ type: "ok", texte: "Compte mis à jour." });
      setResetEnCours(null);
      setNouveauMdp("");
      recharger();
    } catch (err) {
      setMessage({
        type: "erreur",
        texte: err instanceof Error ? err.message : "Echec de la mise à jour",
      });
    }
  };

  const comptes = donnees?.utilisateurs ?? [];

  return (
    <div className="space-y-6">
      <Titre>Gestion des comptes</Titre>

      {message && <Alerte type={message.type} texte={message.texte} />}

      {/* Creation */}
      <Carte>
        <h3 className="mb-3 text-sm font-semibold text-white">Nouveau compte</h3>
        <form onSubmit={creer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            required
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom complet"
            maxLength={120}
            className={CLASSES_CHAMP}
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="courriel@cybertrace.bf"
            className={CLASSES_CHAMP}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={CLASSES_CHAMP}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            required
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="Mot de passe (8 car. min)"
            minLength={8}
            autoComplete="new-password"
            className={CLASSES_CHAMP}
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={envoi} className={CLASSES_BOUTON_PRINCIPAL}>
              {envoi ? "Création…" : "Créer le compte"}
            </button>
          </div>
        </form>
      </Carte>

      {/* Liste */}
      <Carte>
        <h3 className="mb-3 text-sm font-semibold text-white">
          Comptes ({comptes.length})
        </h3>

        {erreur && <MessageErreur texte={erreur} />}
        {chargement && <Chargeur texte="Chargement des comptes…" />}
        {!chargement && !erreur && comptes.length === 0 && (
          <Vide message="Aucun compte." />
        )}

        {!chargement && comptes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="py-2 pr-3">Nom</th>
                  <th className="py-2 pr-3">Courriel</th>
                  <th className="py-2 pr-3">Rôle</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 pr-3">Créé le</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {comptes.map((c) => {
                  const moi = c.id === idCompte;
                  return (
                    <tr key={c.id} className="border-b border-slate-800 text-slate-300">
                      <td className="py-2.5 pr-3 font-medium text-white">
                        {c.nom}
                        {moi && <span className="ml-2 text-xs text-slate-500">(vous)</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-400">{c.email}</td>
                      <td className="py-2.5 pr-3">
                        <select
                          value={c.role}
                          disabled={moi}
                          onChange={(e) => modifier(c.id, { role: e.target.value })}
                          className={`rounded-full border px-2 py-0.5 text-xs font-bold ${COULEUR_ROLE[c.role]} disabled:opacity-50`}
                          title={moi ? "Impossible de changer son propre rôle" : "Changer le rôle"}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r} className="bg-[#111F38] text-white">
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            c.statut === "ACTIF"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                              : "border-red-500/40 bg-red-500/10 text-red-300"
                          }`}
                        >
                          {c.statut === "ACTIF" ? "Actif" : "Suspendu"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500">
                        {fmtDateCourte(c.dateCreation)}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={moi}
                            onClick={() =>
                              modifier(c.id, {
                                statut: c.statut === "ACTIF" ? "SUSPENDU" : "ACTIF",
                              })
                            }
                            className={CLASSES_BOUTON_SECONDAIRE}
                            title={moi ? "Impossible de suspendre son propre compte" : undefined}
                          >
                            {c.statut === "ACTIF" ? "Suspendre" : "Réactiver"}
                          </button>
                          <button
                            type="button"
                            disabled={moi}
                            onClick={() => {
                              setResetEnCours(resetEnCours === c.id ? null : c.id);
                              setNouveauMdp("");
                            }}
                            className={CLASSES_BOUTON_SECONDAIRE}
                          >
                            Mot de passe
                          </button>
                        </div>
                        {resetEnCours === c.id && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              modifier(c.id, { motDePasse: nouveauMdp });
                            }}
                            className="mt-2 flex justify-end gap-1.5"
                          >
                            <input
                              type="password"
                              required
                              minLength={8}
                              autoComplete="new-password"
                              value={nouveauMdp}
                              onChange={(e) => setNouveauMdp(e.target.value)}
                              placeholder="Nouveau mot de passe"
                              className={`${CLASSES_CHAMP} max-w-[200px] py-1 text-xs`}
                            />
                            <button type="submit" className={CLASSES_BOUTON_SECONDAIRE}>
                              Enregistrer
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}
