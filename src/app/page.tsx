/**
 * Page d'accueil professionnelle (/).
 *
 * Présentation de la plateforme : hero, garanties de sécurité, fonctionnalités,
 * déroulé d'une enquête et appel à l'action. Composant serveur (statique) :
 * aucun état côté client, rendu immédiat et bien référencé.
 */
import Image from "next/image";
import Link from "next/link";

const FONCTIONNALITES = [
  {
    icone: (
      <>
        <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    titre: "Import sécurisé",
    texte:
      "Type réel contrôlé par magic bytes, 25 Mo maximum, détection de doublons et noms générés côté serveur : aucun fichier n'est servi depuis /public.",
  },
  {
    icone: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    titre: "Chiffrement au repos",
    texte:
      "AES-256-GCM avec clé secrète (format CTB1 ‖ IV ‖ ciphertext ‖ tag) : la moindre altération du fichier chiffré casse le tag et est détectée.",
  },
  {
    icone: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
        <path d="M8 11l2 2 4-4" />
      </>
    ),
    titre: "Intégrité SHA-256",
    texte:
      "Empreinte calculée dans le flux pendant l'écriture, vérifiable à tout moment : intacte ou modifiée, chaque preuve reçoit un verdict tracé.",
  },
  {
    icone: (
      <>
        <path d="M10 14a5 5 0 0 0 7.1 0l2.9-2.9a5 5 0 0 0-7.1-7.1l-1.6 1.6" />
        <path d="M14 10a5 5 0 0 0-7.1 0L4 12.9a5 5 0 0 0 7.1 7.1l1.6-1.6" />
      </>
    ),
    titre: "Chaîne de custodie",
    texte:
      "Chaque événement referme le SHA-256 du précédent (JSON canonique) : une suppression ou une modification casse la chaîne et le signal immédiatement.",
  },
  {
    icone: (
      <>
        <path d="M12 21a9 9 0 1 0-9-9" />
        <path d="M12 12l5-5" />
        <path d="M12 12l-4 6" />
        <circle cx="12" cy="12" r="1.5" />
      </>
    ),
    titre: "Détection de sites frauduleux",
    texte:
      "Analyse hybride URL + contenu récupéré en mode protégé (SSRF bloqué) : marque usurpée, homographie punycode, TLD suspect, hameçonnage → score 0-100.",
  },
  {
    icone: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 15l2 2 4-4" />
      </>
    ),
    titre: "Rapports PDF",
    texte:
      "Dossier, preuves, empreintes, verdicts, sites analysés et historique complet réunis dans un rapport prêt à être transmis à l'enquête.",
  },
] as const;

const ETAPES = [
  {
    numero: "01",
    titre: "Importer",
    texte: "Déposez une preuve dans son dossier : type contrôlé, empreinte calculée, stockage chiffré.",
  },
  {
    numero: "02",
    titre: "Vérifier",
    texte: "Recalculez le SHA-256 à tout moment : verdict IDENTIQUE ou MODIFIE, horodaté et tracé.",
  },
  {
    numero: "03",
    titre: "Tracer",
    texte: "Consultez la custodie : qui, quoi, quand — chaque étape scellée par le hash de la précédente.",
  },
  {
    numero: "04",
    titre: "Rapporter",
    texte: "Analysez les URLs suspectes et exportez le rapport PDF complet du dossier.",
  },
] as const;

const GARANTIES = [
  "Stockage privé hors /public, aucun fichier servi directement",
  "Contrôles exécutés côté serveur (rôles, tailles, types, empreintes)",
  "Journal d'audit de chaque opération — succès et échec",
  "Analyses de contenu protégées contre les requêtes vers le réseau interne",
  "Données de démonstration strictement fictives",
] as const;

const PICTOGRAMME = "h-6 w-6";

export default function Accueil() {
  return (
    <div className="space-y-14 pb-4 md:space-y-20">
      {/* ---------------------------- Hero ---------------------------- */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-[#132448] via-[#0d1a33] to-[#0B1526] px-5 py-14 text-center sm:px-8 md:py-24">
        {/* Orbes décoratifs (masqués sur mobile) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 hidden h-72 w-72 rounded-full bg-[#F2C14E]/15 blur-3xl md:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-20 hidden h-72 w-72 rounded-full bg-[#5FA8FF]/10 blur-3xl md:block"
        />

        <div className="relative mx-auto max-w-3xl">
          <Image
            src="/logo.jpeg"
            alt="Logo CyberTrace BF"
            width={96}
            height={96}
            priority
            className="mx-auto rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10"
          />

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Cyber<span className="text-[#5FA8FF]">Trace</span>
            <span className="text-[#F2C14E]"> BF</span>
          </h1>

          <p className="mt-4 text-lg font-medium text-[#F2C14E] sm:text-xl">
            « La preuve numérique, préservée et traçable. »
          </p>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Centralisez les dossiers d&apos;incident, préservez les preuves chiffrées
            (AES-256-GCM), prouvez leur intégrité par empreinte <strong>SHA-256</strong>,
            tracez chaque opération dans une chaîne de custodie hachée, détectez les
            sites frauduleux et exportez le rapport PDF — de l&apos;import à la preuve
            présentée au jury.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              href="/tableau-de-bord"
              className="rounded-xl bg-[#F2C14E] px-6 py-3 text-sm font-bold text-[#0B1526] shadow-lg shadow-black/30 transition hover:brightness-110"
            >
              Accéder à la plateforme →
            </Link>
            <Link
              href="/demo"
              className="rounded-xl border border-slate-500 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-[#F2C14E] hover:text-[#F2C14E]"
            >
              Voir le scénario du jury
            </Link>
            <Link
              href="/detection"
              className="rounded-xl border border-slate-500 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-[#F2C14E] hover:text-[#F2C14E]"
            >
              Analyser une URL
            </Link>
          </div>

          {/* Bandeau de confiance */}
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
            {[
              "SHA-256 en flux",
              "AES-256-GCM",
              "Chaîne de custodie hachée",
              "SSRF bloqué",
              "PostgreSQL",
              "Rôles ADMIN / ANALYSTE / LECTEUR",
            ].map((c) => (
              <li
                key={c}
                className="rounded-full border border-slate-700 bg-[#0B1526]/70 px-3 py-1"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------ Fonctionnalités ------------------------ */}
      <section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Tout le cycle de vie de la preuve numérique
          </h2>
          <p className="mt-2 text-sm text-slate-400 sm:text-base">
            Les garanties exigées par le cahier des charges §7, mises en œuvre
            côté serveur — l&apos;interface ne fait que les rendre visibles.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FONCTIONNALITES.map((f) => (
            <article
              key={f.titre}
              className="group rounded-xl border border-slate-700 bg-[#111F38] p-5 transition hover:border-[#F2C14E]/50"
            >
              <div className="mb-3 inline-flex rounded-lg bg-[#F2C14E]/10 p-2.5 text-[#F2C14E] transition group-hover:bg-[#F2C14E]/20">
                <svg
                  className={PICTOGRAMME}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {f.icone}
                </svg>
              </div>
              <h3 className="text-base font-semibold text-white">{f.titre}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.texte}</p>
            </article>
          ))}
        </div>
      </section>

      {/* --------------------------- Processus --------------------------- */}
      <section className="rounded-2xl border border-slate-700 bg-[#111F38] px-5 py-10 sm:px-8 md:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Une enquête en quatre étapes
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Le parcours complet, de la collecte à la transmission du rapport.
          </p>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((e) => (
            <li key={e.numero} className="relative">
              <span className="font-mono text-3xl font-bold text-[#F2C14E]/40">
                {e.numero}
              </span>
              <h3 className="mt-2 text-base font-semibold text-white">{e.titre}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{e.texte}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* -------------------------- Sécurité -------------------------- */}
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Conçu pour une preuve sensible
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            La fiabilité ne dépend jamais du navigateur : chaque contrôle (rôles,
            tailles, types, empreintes, analyse d&apos;URL) est réexécuté par le
            serveur. L&apos;application peut donc être démontrée au jury sans
            rien concéder à la confiance client.
          </p>
          <Link
            href="/tableau-de-bord"
            className="mt-6 inline-block rounded-lg bg-[#F2C14E] px-5 py-2.5 text-sm font-bold text-[#0B1526] transition hover:brightness-110"
          >
            Ouvrir le tableau de bord
          </Link>
        </div>

        <ul className="space-y-3">
          {GARANTIES.map((g) => (
            <li
              key={g}
              className="flex items-start gap-3 rounded-xl border border-slate-700 bg-[#111F38] px-4 py-3 text-sm text-slate-300"
            >
              <svg
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {g}
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------- Appel à l'action ------------------------ */}
      <section className="rounded-2xl bg-[#F2C14E] px-6 py-10 text-center text-[#0B1526] sm:px-10 md:py-12">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Prêt à préserver une preuve numérique ?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-[#0B1526]/80">
          Créez un dossier, importez une pièce, vérifiez son empreinte — puis
          laissez la chaîne de custodie raconter le reste.
        </p>
        <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
          <Link
            href="/dossiers"
            className="rounded-xl bg-[#0B1526] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#132448]"
          >
            Commencer par les dossiers
          </Link>
          <Link
            href="/detection"
            className="rounded-xl border border-[#0B1526]/40 px-6 py-3 text-sm font-bold text-[#0B1526] transition hover:border-[#0B1526]"
          >
            Tester la détection de fraude
          </Link>
        </div>
      </section>
    </div>
  );
}
