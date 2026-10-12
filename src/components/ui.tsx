/**
 * Briques d'interface partagees par les pages (cartes, badges, etats vides).
 * Palette constante : fond marine #0B1526, cartes #111F38, accent or #F2C14E.
 */
import type { Chaine, Dossier } from "@/lib/client";

export function Carte({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-700 bg-[#111F38] p-5 ${className}`}>
      {children}
    </section>
  );
}

export function Titre({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-white">{children}</h2>
      {action}
    </div>
  );
}

export function Chargeur({ texte = "Chargement…" }: { texte?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-[#F2C14E]" />
      {texte}
    </div>
  );
}

export function Vide({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-600 px-4 py-8 text-center text-sm text-slate-400">
      <p className="mb-3">{message}</p>
      {action}
    </div>
  );
}

export function MessageErreur({ texte }: { texte: string }) {
  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {texte}
    </div>
  );
}

export function Alerte({ type, texte }: { type: "ok" | "erreur"; texte: string }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        type === "ok"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/40 bg-red-500/10 text-red-300"
      }`}
    >
      {texte}
    </div>
  );
}

// --- Badges ------------------------------------------------------------------

export function BadgeStatut({ statut }: { statut: Dossier["statut"] }) {
  const styles: Record<Dossier["statut"], string> = {
    OUVERT: "bg-[#F2C14E]/15 text-[#F2C14E] border-[#F2C14E]/40",
    EN_COURS: "bg-[#5FA8FF]/15 text-[#5FA8FF] border-[#5FA8FF]/40",
    CLOTURE: "bg-slate-600/20 text-slate-400 border-slate-600/60",
  };
  const libelles: Record<Dossier["statut"], string> = {
    OUVERT: "Ouvert",
    EN_COURS: "En cours",
    CLOTURE: "Clôturé",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${styles[statut]}`}>
      {libelles[statut]}
    </span>
  );
}

export function BadgeVerdictSite({ verdict }: { verdict: "SURE" | "SUSPECTE" | "FRAUDULEUSE" }) {
  const styles = {
    SURE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    SUSPECTE: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
    FRAUDULEUSE: "bg-red-500/15 text-red-400 border-red-500/40",
  } as const;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${styles[verdict]}`}>
      {verdict}
    </span>
  );
}

export function BadgeVerdictPreuve({ verdict }: { verdict: "IDENTIQUE" | "MODIFIE" }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
        verdict === "IDENTIQUE"
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
          : "border-red-500/40 bg-red-500/15 text-red-400"
      }`}
    >
      {verdict}
    </span>
  );
}

export function BadgeChaine({ chaine }: { chaine: Chaine }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
        chaine.ok
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
          : "border-red-500/40 bg-red-500/15 text-red-400"
      }`}
    >
      {chaine.ok ? `Chaîne intacte (${chaine.total})` : `Chaîne cassée à l'événement ${chaine.casseAu}`}
    </span>
  );
}

// --- Styles partages de formulaires -----------------------------------------

export const CLASSES_CHAMP =
  "w-full rounded-lg border border-slate-600 bg-[#0B1526] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#F2C14E] focus:outline-none";

export const CLASSES_BOUTON_PRINCIPAL =
  "rounded-lg bg-[#F2C14E] px-4 py-2 text-sm font-semibold text-[#0B1526] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

export const CLASSES_BOUTON_SECONDAIRE =
  "rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#F2C14E] hover:text-[#F2C14E] disabled:cursor-not-allowed disabled:opacity-40";
