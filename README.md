# CyberTrace BF — Preuves numériques (module + interface)

> **La preuve numérique, préservée et traçable.**

Module « Membre 2 — Preuves numériques » du cahier des charges CyberTrace BF :
stockage privé chiffré, import de fichiers, empreinte SHA-256, vérification
d'intégrité, chaîne de custodie, rapport PDF **et détection de sites frauduleux** —
livré avec son **interface web complète** (tableau de bord, dossiers, détection).

Application : **Next.js 16 (App Router) · TypeScript · Tailwind · PostgreSQL 17 · Prisma 7**

---

## Mise en route

```bash
# 1. Dépendances
npm install

# 2. Configuration
#    copier .env.example vers .env et renseigner DATABASE_URL + STORAGE_KEY

# 3. Base de données
npx prisma migrate dev

# 4. Données de démonstration (utilisateurs + dossier CT-2026-001)
curl -X POST http://localhost:3000/api/dev/seed

# 5. Lancer
npm run dev
# → accueil :            http://localhost:3000/
# → tableau de bord :    http://localhost:3000/tableau-de-bord
# → dossiers :           http://localhost:3000/dossiers
# → détection d'URL :    http://localhost:3000/detection
# → scénario du jury :   http://localhost:3000/demo
```

Les comptes de démonstration (`admin@cybertrace.bf`, `dev@cybertrace.bf`,
`lecteur@cybertrace.bf`) sont créés par le seed et sélectionnables dans
l'en-tête de l'application (voir « Interface » ci-dessous).

PostgreSQL : l'utilisateur applicatif doit posséder le droit `CREATEDB`
(utilisé par la base fantôme de Prisma Migrate) :

```sql
ALTER USER cybertrace CREATEDB;
```

### Tests automatisés

```bash
npm test          # 79 tests : unitaires + intégration (base cybertrace_test isolée)
npm run lint      # ESLint
npx tsc --noEmit  # typage strict
```

La base de test est réinitialisée à chaque exécution (`prisma db push
--force-reset`) : Prisma exige alors le consentement explicite
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, défini dans
`tests/global-setup.ts`. Le stockage de test vit dans `storage-test/`.

---

## Interface

Thème sombre (marine `#0B1526` / or `#F2C14E`), shell unique `src/components/AppShell.tsx`
(en-tête collant, navigation active, pied de page) présent sur **toutes** les pages.

| Page | Contenu |
|---|---|
| `/` | **Page d'accueil professionnelle** : hero (logo, slogan, actions), 6 cartes de fonctionnalités, déroulé d'une enquête en 4 étapes, garanties de sécurité, appel à l'action — responsive (grilles 1/2/3 colonnes, menu hamburger sur mobile) |
| `/tableau-de-bord` | Tableau de bord : statistiques (dossiers, preuves, URLs analysées, sites frauduleux), derniers dossiers, dernières détections, actions rapides ; amorçage du jeu de démo en un clic si la base est vide |
| `/dossiers` | Liste des dossiers avec **recherche texte** (référence, titre, catégorie), filtre par statut, **création** (référence auto `CT-AAAA-NNN`) |
| `/dossiers/:id` | Détail : classification (statut), **import de preuve** (métadonnées + magic bytes), vérification, comparaison de copie, téléchargement, chaîne de custodie, onglet **sites analysés** (analyse rattachée au dossier), rapport PDF |
| `/detection` | Analyse d'URL (choix du dossier de rattachement) + verdict / score / indicateurs + historique global |
| `/demo` | Scénario de démonstration guidé pour le jury (parcours complet pas à pas) |

**Sélecteur de compte (démonstration des rôles)** : l'en-tête propose les trois
comptes du cahier des charges §3 (ADMIN, ANALYSTE, LECTEUR). Le compte choisi
est stocké en `localStorage` et transmis à **toutes** les appels API par
l'en-tête `x-user-id` (`src/lib/client.ts → apiFetch`). Effets vérifiés côté
interface comme côté serveur :

- LECTEUR : formulaires d'import / analyse masqués, boutons d'écriture masqués,
  et toute écriture API reste refusée en **403** ;
- ADMIN/ANALYSTE : création de dossier, import, vérification, analyse d'URL.

Le contrôle d'accès effectif est **serveur** (`src/lib/actor.ts`), l'interface ne fait
que masquer les actions inaccessibles. Branchez la vraie authentification en
remplaçant `resolveActor()` (voir « Point de branchement ») : aucune page ni
route n'a besoin d'être modifiée.

---

## API — module preuves

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/cases` | tous rôles | Liste des dossiers (avec compteurs de preuves/sites) |
| POST | `/api/cases` | ANALYSTE/ADMIN | Création d'un dossier (référence saisie ou générée `CT-AAAA-NNN`) |
| PATCH | `/api/cases/:caseId` | ANALYSTE/ADMIN | Classification : statut, titre, description, catégorie |
| POST | `/api/cases/:caseId/evidence` | ANALYSTE/ADMIN | Import d'un fichier : validation (taille, extension, magic bytes), SHA-256 **calculé dans le flux**, chiffrement AES-256-GCM, stockage privé, événement de custodie, audit |
| GET | `/api/cases/:caseId/evidence` | tous rôles | Liste des preuves du dossier |
| GET | `/api/evidence/:id` | tous rôles | Métadonnées + derniers verdicts + état de la chaîne |
| POST | `/api/evidence/:id/verify` | ANALYSTE/ADMIN | Recalcul du SHA-256, comparaison, détection d'altération **du fichier chiffré** (verdict MODIFIE), tracé même en cas d'échec |
| POST | `/api/evidence/:id/compare` | tous rôles | Compare une **copie** (non stockée) à l'empreinte initiale — étape 5 du scénario jury |
| GET | `/api/evidence/:id/download` | tous rôles | Déchiffrement + téléchargement contrôlé (stream), opération tracée — **409 `INTEGRITY_BROKEN`** si altération détectée |
| GET | `/api/evidence/:id/custody` | tous rôles | Historique chronologique + vérification de la chaîne de hachage |
| GET | `/api/cases/:caseId/report.pdf` | tous rôles | Rapport PDF : dossier, preuves, empreintes, verdicts, **sites analysés**, historique, limites |
| POST | `/api/dev/seed` | démo | Jeu de données fictifs (refusé en production) |

## API — détection de sites frauduleux

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/sites/analyze` | ANALYSTE/ADMIN | Analyse hybride d'une URL : heuristiques lexicales + récupération **protégée** de la page (SSRF bloqué) → score 0-100, verdict, indicateurs ; persistée, auditée, rattachable à un dossier |
| GET | `/api/cases/:caseId/sites` | tous rôles | Historique des analyses d'un dossier (plus récente d'abord) |
| GET | `/api/sites` | tous rôles | Historique **global** des analyses (`?caseId=` pour filtrer) |
| GET | `/api/users` | connecté | Comptes actifs (alimente le sélecteur de démonstration) |

Codes d'erreur : `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `CASE_NOT_FOUND` /
`EVIDENCE_NOT_FOUND` (404), `STORAGE_MISSING` / `INTEGRITY_BROKEN` (410/409),
`TOO_LARGE` (413), `BAD_EXTENSION` / `CONTENT_MISMATCH` (415),
`NO_URL` / `BAD_JSON` (400).

---

## Garanties de sécurité (cahier des charges §7)

- **Stockage privé** : les preuves vivent dans `storage/cases/<dossier>/<uuid><ext>`
  (ignoré par Git, hors de `/public`). Aucun fichier n'est servi directement.
- **Chiffrement au repos (AES-256-GCM)** : chaque fichier est chiffré avec la
  clé `STORAGE_KEY` (jamais commitée). Format : `CTB1` (4) ‖ IV (12) ‖
  ciphertext ‖ tag (16). L'empreinte SHA-256 porte toujours sur le
  **contenu d'origine**. Toute altération du fichier chiffré casse le tag GCM
  → détection à la vérification comme au téléchargement.
- **Noms générés par l'application** : UUID côté serveur, nom d'origine conservé
  en base pour l'affichage uniquement (nettoyé contre le path-traversal).
- **Type réel vérifié** : magic bytes (PNG, JPEG, GIF, WEBP, PDF, ZIP/DOCX/XLSX)
  ou contenu texte — le MIME déclaré par le navigateur n'est jamais cru.
- **Taille maximale** : 25 Mo, liste blanche d'extensions.
- **Détection de doublons** : même empreinte dans le dossier → alerte.
- **Empreinte SHA-256** calculée côté serveur pendant l'écriture (un seul passage).
- **Horodatage serveur** pour tous les événements (jamais la date client).
- **Journal d'audit** : chaque opération sensible est écrite (succès et échec),
  y compris les analyses de sites.
- **Chaîne de custodie hachée** : chaque événement referme le SHA-256 du précédent
  (JSON canonique) — toute altération ou suppression casse la chaîne et est
  détectée par `GET /api/evidence/:id/custody`.

---

## Détection de sites frauduleux (fonctionnalité additionnelle)

Pipeline `POST /api/sites/analyze` :

1. **Analyse lexicale de l'URL** (`src/lib/detection/url-analysis.ts`, pur,
   testable sans réseau) : marque usurpée hors domaine officiel, lookalike par
   faute de frappe (Levenshtein), homographie punycode (`xn--`), mots-clés
   d'hameçonnage (`login`, `verify`…), TLD suspect (`.xyz`, `.top`…),
   raccourcisseurs, IP en lieu de domaine, `@` masquant, port atypique,
   sous-domaines multiples, URL trop longue.
2. **Protection SSRF** (`src/lib/detection/content.ts`) : le host est résolu par
   DNS et **bloqué** s'il pointe vers une adresse privée, loopback, link-local
   ou les métadonnées cloud (`169.254.169.254`) — impossible de faire
   requête-forcée vers l'intérieur du réseau.
3. **Analyse du contenu** : téléchargement `http/https` uniquement, 5 s max,
   300 Ko max, **redirections non suivies** ; le HTML est analysé par
   expressions régulières locales (aucun script exécuté) : champ mot de passe,
   formulaire qui exfiltre vers un autre domaine, marque citée hors domaine
   officiel, formulations d'hameconnage (« vérifiez votre compte », OTP…).
4. **Score cumulé 0-100** (poids par gravité) → verdict :
   `SURE` < 30 ≤ `SUSPECTE` < 60 ≤ `FRAUDULEUSE`.
5. **Persistance** rattachée au dossier + entrée d'audit ; l'historique apparaît
   sur `/demo` et dans le **rapport PDF** (section « Sites frauduleux analysés »).

Le verdict n'est jamais affirmé « SURE » sans preuve : URL invalide ou contenu
inaccessible → verdict au minimum `SUSPECTE` avec indicateur explicite.

---

## Point de branchement pour le Membre 1 (authentification)

Toute la résolution de l'utilisateur passe par **une seule fonction** :
`src/lib/actor.ts → resolveActor(req)`. Aujourd'hui elle lit l'en-tête
`x-user-id` (tests **et** sélecteur de compte de l'interface) et retombe sur
l'utilisateur `dev`. Remplacer son corps par
la lecture de la session (cookies) suffit : aucune route n'a besoin d'être
modifiée. Les rôles `ADMIN` / `ANALYSTE` / `LECTEUR` sont déjà appliqués
(`canWrite`, `canRead`).

---

## Scénario de démonstration (cahier des charges §12)

```bash
# 1) Données fictives (dossier CT-2026-001)
curl -X POST http://localhost:3000/api/dev/seed

# 2) Importer une preuve
curl -X POST -F "file=@preuve_demo.txt" \
     -F "description=Facture de la fausse boutique" \
     http://localhost:3000/api/cases/<CASE_ID>/evidence

# 3) Afficher l'empreinte SHA-256 calculée (réponse JSON)

# 4) Vérifier sans modifier → "IDENTIQUE"
curl -X POST http://localhost:3000/api/evidence/<EV_ID>/verify

# 5) Modifier une copie et comparer → "MODIFIE"
echo "contenu modifie" > copie_modifiee.txt
curl -X POST -F "file=@copie_modifiee.txt" \
     http://localhost:3000/api/evidence/<EV_ID>/compare

# 6) Consulter l'historique (chaîne vérifiée : ok=true)
curl http://localhost:3000/api/evidence/<EV_ID>/custody

# 7) Détecter un site frauduleux → verdict + indicateurs
curl -X POST -H "Content-Type: application/json" \
     -d '{"url":"https://facebook-secure-login.xyz/verify","caseId":"<CASE_ID>"}' \
     http://localhost:3000/api/sites/analyze

# 8) Générer le rapport PDF (preuves + sites + historique)
curl -OJ http://localhost:3000/api/cases/<CASE_ID>/report.pdf
```

La page **`/demo`** rejoue tout ce scénario sous forme guidée pour le jury
(import, vérification, comparaison, chaîne de custodie, détection d'URL,
rapport PDF) ; l'application complète (`/`, `/dossiers`, `/detection`) offre les
mêmes actions dans une navigation classée par dossiers.

---

## Limites assumées (à dire au jury)

L'empreinte SHA-256 prouve l'**intégrité depuis l'enregistrement** et détecte
toute modification. Elle ne prouve pas à elle seule l'**authenticité de l'origine**,
la **date réelle de collecte** (les dates saisies sont déclaratives) ni la
**valeur juridique** d'une preuve. Évolutions possibles : horodatage externe
(RFC 3161), signature de la chaîne par une autorité, journal externe inviolable.

Pour la détection de sites : heuristiques **sans réputation externe** (pas de
Google Safe Browsing/VirusTotal — clés API hors périmètre), l'analyse de
contenu ne suit pas les redirections ni le JavaScript, et le verdict est
**indicatif** : il oriente l'enquête, il ne remplace pas l'expertise humaine.

---

## Organisation du dépôt

```
prisma/schema.prisma             Modèles : User, Case, Evidence, CustodyEvent,
                                 AuditLog, SiteCheck
src/components/AppShell.tsx      Shell commun : en-tête, navigation, sélecteur de comptes
src/components/ui.tsx            Briques partagées (cartes, badges, états, styles)
src/lib/client.ts                Côté navigateur : apiFetch (x-user-id), compte démo,
                                 types partagés, formatages, hook useApi
src/lib/storage.ts               Stockage privé (chemins générés, hors /public)
src/lib/hash.ts                  SHA-256 en flux + chiffrement AES-256-GCM
src/lib/filetypes.ts             Magic bytes, liste blanche, normalisation des noms
src/lib/custody.ts               Chaîne de custodie hachée + journal d'audit
src/lib/actor.ts                 ⚠️ Point de branchement de l'authentification (Membre 1)
src/lib/pdf.ts                   Génération du rapport PDF (pdfkit)
src/lib/detection/brands.ts      Marques surveillées, mots-clés, TLD suspects
src/lib/detection/url-analysis.ts  Analyse lexicale de l'URL (pur)
src/lib/detection/content.ts     Analyse de contenu + protection SSRF (pur)
src/app/page.tsx                 Page d'accueil professionnelle (/)
src/app/tableau-de-bord/page.tsx Tableau de bord (/tableau-de-bord)
src/app/dossiers/page.tsx        Liste + recherche + création (/dossiers)
src/app/dossiers/[id]/page.tsx   Détail : preuves, sites, PDF (/dossiers/:id)
src/app/detection/page.tsx       Détection d'URL + historique (/detection)
src/app/demo/page.tsx            Scénario de démonstration jury (/demo)
src/app/api/...                  Routes API (dossiers, preuves, détection, comptes)
tests/                           Vitest : unitaires + intégration (79 tests)
storage/                         Preuves chiffrées (ignoré par Git)
```
