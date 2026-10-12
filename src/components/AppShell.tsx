"use client";
/**
 * Coquille de l'application : en-tete (logo, navigation, session), menu
 * mobile et pied de page.
 *
 * - Desktop : logo a gauche, navigation centree, session a droite.
 * - Mobile  : navigation repliee derriere un bouton « hamburger ».
 *
 * L'identite provient de la session reelle (cookie HttpOnly, GET
 * /api/auth/me) : l'en-tete affiche le compte + son badge de role et un
 * bouton de deconnexion. Sans session, toute page autre que l'accueil et la
 * connexion redirige vers /connexion?next=<page>.
 */
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { deconnexion, estAdmin, useCompte, type Role } from "@/lib/client";

const LIENS = [
  { href: "/", libelle: "Accueil" },
  { href: "/tableau-de-bord", libelle: "Tableau de bord" },
  { href: "/dossiers", libelle: "Dossiers" },
  { href: "/detection", libelle: "Détection" },
  { href: "/demo", libelle: "Démo jury" },
  { href: "/comptes", libelle: "Comptes", admin: true },
];

/** Pages accessibles sans session. */
const CHEMINS_PUBLICS = ["/", "/connexion"];

const COULEUR_ROLE: Record<Role, string> = {
  ADMIN: "bg-[#F2C14E] text-[#0B1526]",
  ANALYSTE: "bg-[#5FA8FF] text-[#0B1526]",
  LECTEUR: "bg-slate-600 text-white",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const chemin = usePathname();
  const router = useRouter();
  const [compte, , comptePret] = useCompte();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const estPublic = CHEMINS_PUBLICS.some((p) => (p === "/" ? chemin === "/" : chemin.startsWith(p)));

  // Garde de session : sans compte, toute page protegee est redirigee vers
  // la page de connexion (avec retour sur la page demandee apres connexion).
  useEffect(() => {
    if (!comptePret || compte || estPublic) return;
    router.replace(`/connexion?next=${encodeURIComponent(chemin)}`);
  }, [comptePret, compte, estPublic, chemin, router]);

  const estActif = (href: string) =>
    href === "/" ? chemin === "/" : chemin.startsWith(href);

  const styleLien = (href: string) =>
    `rounded-lg px-3 py-1.5 transition-colors ${
      estActif(href)
        ? "bg-[#F2C14E]/15 font-semibold text-[#F2C14E]"
        : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
    }`;

  const liensVisibles = LIENS.filter((l) => !l.admin || estAdmin(compte));

  const seDeconnecter = async () => {
    setMenuOuvert(false);
    await deconnexion();
    router.replace("/");
    router.refresh();
  };

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
            {liensVisibles.map((l) => (
              <Link key={l.href} href={l.href} className={styleLien(l.href)}>
                {l.libelle}
              </Link>
            ))}
          </nav>

          {/* Session + bouton menu */}
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {comptePret &&
              (compte ? (
                <>
                  <span
                    className={`hidden rounded px-1.5 py-0.5 text-[10px] font-bold sm:inline ${COULEUR_ROLE[compte.role]}`}
                    title={compte.email}
                  >
                    {compte.role}
                  </span>
                  <span
                    className="hidden max-w-[160px] truncate text-xs text-slate-300 lg:inline"
                    title={compte.email}
                  >
                    {compte.nom}
                  </span>
                  <button
                    type="button"
                    onClick={seDeconnecter}
                    className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-[#F2C14E] hover:text-[#F2C14E]"
                  >
                    Déconnexion
                  </button>
                </>
              ) : (
                <Link
                  href="/connexion"
                  className="rounded-lg bg-[#F2C14E] px-3 py-1.5 text-xs font-semibold text-[#0B1526] transition hover:brightness-110"
                >
                  Connexion
                </Link>
              ))}

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
                {liensVisibles.map((l) => (
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
                {compte && (
                  <li>
                    <button
                      type="button"
                      onClick={seDeconnecter}
                      className="block w-full rounded-lg px-3 py-1.5 text-left text-slate-300 hover:bg-slate-700/50 hover:text-white"
                    >
                      Déconnexion — {compte.nom}
                    </button>
                  </li>
                )}
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
