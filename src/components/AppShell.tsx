"use client";
/**
 * Coquille de l'application : en-tete (logo, navigation, selecteur de compte
 * de demonstration) et pied de page.
 *
 * - Desktop : logo a gauche, navigation centree, compte a droite.
 * - Mobile  : navigation repliee derriere un bouton « hamburger ».
 *
 * Le selecteur choisit un compte actif ; son identifiant part dans l'en-tête
 * x-user-id de tous les appels API (voir src/lib/client.ts). A remplacer par
 * la vraie connexion du Membre 1.
 */
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, changerCompte, lireCompte, useCompte, type Compte, type Role } from "@/lib/client";

const LIENS = [
  { href: "/", libelle: "Accueil" },
  { href: "/tableau-de-bord", libelle: "Tableau de bord" },
  { href: "/dossiers", libelle: "Dossiers" },
  { href: "/detection", libelle: "Détection" },
  { href: "/demo", libelle: "Démo jury" },
];

const COULEUR_ROLE: Record<Role, string> = {
  ADMIN: "bg-[#F2C14E] text-[#0B1526]",
  ANALYSTE: "bg-[#5FA8FF] text-[#0B1526]",
  LECTEUR: "bg-slate-600 text-white",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const chemin = usePathname();
  const [compte, setCompte, comptePret] = useCompte();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Liste des comptes de demonstration ; aucun compte -> selection par defaut
  // de l'analyste (l'API aurait de toute facon retombe sur le compte « dev »).
  useEffect(() => {
    apiFetch<{ utilisateurs: Compte[] }>("/api/users")
      .then((r) => {
        setComptes(r.utilisateurs);
        if (!lireCompte() && r.utilisateurs.length > 0) {
          const parDefaut =
            r.utilisateurs.find((u) => u.role === "ANALYSTE") ?? r.utilisateurs[0];
          changerCompte(parDefaut);
        }
      })
      .catch(() => setComptes([]));
  }, []);

  const estActif = (href: string) =>
    href === "/" ? chemin === "/" : chemin.startsWith(href);

  const styleLien = (href: string) =>
    `rounded-lg px-3 py-1.5 transition-colors ${
      estActif(href)
        ? "bg-[#F2C14E]/15 font-semibold text-[#F2C14E]"
        : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-[#0B1526] text-slate-200">
      {/* En-tête */}
      <header className="sticky top-0 z-20 border-b border-slate-700 bg-[#0B1526]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.jpeg" alt="CyberTrace BF" width={40} height={40} priority className="rounded-lg" />
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-bold text-white">
                Cyber<span className="text-[#F2C14E]">Trace</span> BF
              </span>
              <span className="hidden text-[11px] text-slate-400 sm:block">
                La preuve numérique, préservée et traçable
              </span>
            </span>
          </Link>

          {/* Navigation desktop : centree */}
          <nav className="mx-auto hidden items-center gap-1 text-sm md:flex">
            {LIENS.map((l) => (
              <Link key={l.href} href={l.href} className={styleLien(l.href)}>
                {l.libelle}
              </Link>
            ))}
          </nav>

          {/* Compte de demonstration + bouton menu */}
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {compte && (
              <span
                className={`hidden rounded px-1.5 py-0.5 text-[10px] font-bold sm:inline ${COULEUR_ROLE[compte.role]}`}
              >
                {compte.role}
              </span>
            )}
            <select
              value={comptePret && compte ? compte.id : ""}
              onChange={(e) => {
                const choisi = comptes.find((u) => u.id === e.target.value);
                if (choisi) setCompte(choisi);
              }}
              className="max-w-[150px] truncate rounded-lg border border-slate-600 bg-[#111F38] px-2 py-1.5 text-xs text-white focus:border-[#F2C14E] focus:outline-none sm:max-w-[190px]"
              title="Compte de démonstration (l'authentification réelle viendra avec le Membre 1)"
            >
              {!comptePret || !compte ? <option value="">—</option> : null}
              {comptes.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nom} ({u.role})
                </option>
              ))}
            </select>

            {/* Hamburger (mobile) */}
            <button
              type="button"
              onClick={() => setMenuOuvert((v) => !v)}
              aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={menuOuvert}
              className="rounded-lg border border-slate-600 p-2 text-slate-300 hover:border-[#F2C14E] hover:text-[#F2C14E] md:hidden"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                {menuOuvert ? (
                  <>
                    <path d="M6 6l12 12" />
                    <path d="M18 6L6 18" />
                  </>
                ) : (
                  <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Navigation mobile : deroulante */}
          {menuOuvert && (
            <nav className="w-full border-t border-slate-700 pt-2 md:hidden">
              <ul className="flex flex-col gap-1 text-sm">
                {LIENS.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => setMenuOuvert(false)}
                      className={`block ${styleLien(l.href)}`}
                    >
                      {l.libelle}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </header>

      {/* Contenu des pages */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      {/* Pied de page */}
      <footer className="border-t border-slate-800 bg-[#0B1526] py-4 text-center text-xs text-slate-500">
        CyberTrace BF — prototype de hackathon · données strictement fictives ·
        module preuves &amp; détection (Membre 2) · SHA-256 + AES-256-GCM
      </footer>
    </div>
  );
}
