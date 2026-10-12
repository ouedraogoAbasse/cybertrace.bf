"use client";
/**
 * Page de connexion — authentification reelle (cahier des charges §3).
 *
 * Le formulaire appelle POST /api/auth/login qui pose un cookie HttpOnly ;
 * en cas de succes on rafraichit l'etat de session et on redirige vers la
 * page demandee (parametre `next`) ou le tableau de bord.
 *
 * Les comptes de demonstration sont affiches uniquement hors production
 * (la route /api/dev/seed qui les cree est de toute facon refusee en prod).
 */
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { connexion, useCompte } from "@/lib/client";
import {
  Alerte,
  CLASSES_BOUTON_PRINCIPAL,
  CLASSES_CHAMP,
} from "@/components/ui";

const COMPTES_DEMO = [
  { email: "admin@cybertrace.bf", role: "ADMIN", nom: "Administrateur" },
  { email: "dev@cybertrace.bf", role: "ANALYSTE", nom: "Analyste" },
  { email: "lecteur@cybertrace.bf", role: "LECTEUR", nom: "Lecteur" },
];

const MOT_DE_PASSE_DEMO = "CyberTrace2026";

function FormulaireConnexion() {
  const router = useRouter();
  const params = useSearchParams();
  const [compte, , comptePret] = useCompte();

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const destination = params.get("next") || "/tableau-de-bord";

  // Deja connecte : inutile de rester sur la page de connexion.
  useEffect(() => {
    if (comptePret && compte) router.replace(destination);
  }, [comptePret, compte, destination, router]);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await connexion(email.trim(), motDePasse);
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Echec de la connexion");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Image src="/logo.jpeg" alt="CyberTrace BF" width={72} height={72} priority className="rounded-xl" />
        <h1 className="text-2xl font-bold text-white">
          Connexion à Cyber<span className="text-[#F2C14E]">Trace</span> BF
        </h1>
        <p className="text-sm text-slate-400">
          Accédez aux dossiers, preuves et analyses selon votre rôle.
        </p>
      </div>

      <section className="rounded-xl border border-slate-700 bg-[#111F38] p-6">
        <form onSubmit={soumettre} className="space-y-4">
          {erreur && <Alerte type="erreur" texte={erreur} />}

          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-300">
              Courriel
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="analyste@cybertrace.bf"
              className={CLASSES_CHAMP}
            />
          </div>

          <div>
            <label htmlFor="motDePasse" className="mb-1 block text-xs font-medium text-slate-300">
              Mot de passe
            </label>
            <input
              id="motDePasse"
              type="password"
              required
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              placeholder="••••••••••••"
              className={CLASSES_CHAMP}
            />
          </div>

          <button
            type="submit"
            disabled={envoi}
            className={`${CLASSES_BOUTON_PRINCIPAL} w-full`}
          >
            {envoi ? "Connexion en cours…" : "Se connecter"}
          </button>
        </form>
      </section>

      {/* Comptes de demonstration (developpement uniquement) */}
      {process.env.NODE_ENV !== "production" && (
        <section className="mt-4 rounded-xl border border-dashed border-slate-600 bg-[#111F38]/60 p-4">
          <p className="mb-2 text-xs font-semibold text-slate-300">
            Comptes de démonstration
            <span className="ml-2 font-normal text-slate-500">
              (mot de passe : {MOT_DE_PASSE_DEMO})
            </span>
          </p>
          <ul className="space-y-1.5">
            {COMPTES_DEMO.map((c) => (
              <li key={c.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(c.email);
                    setMotDePasse(MOT_DE_PASSE_DEMO);
                    setErreur(null);
                  }}
                  className="w-full rounded-lg border border-slate-700 px-3 py-1.5 text-left text-xs text-slate-400 transition-colors hover:border-[#F2C14E]/60 hover:text-white"
                >
                  <span className="font-semibold text-slate-200">{c.nom}</span> ({c.role}) — {c.email}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        <Link href="/" className="underline hover:text-[#F2C14E]">
          Retour à l&apos;accueil
        </Link>
      </p>
    </div>
  );
}

export default function PageConnexion() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-400">Chargement…</div>}>
      <FormulaireConnexion />
    </Suspense>
  );
}
