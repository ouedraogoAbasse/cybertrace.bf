# CyberTrace BF — Cœur technique des preuves numériques

> **La preuve numérique, préservée et traçable.**

Module « Membre 2 — Preuves numériques » du cahier des charges CyberTrace BF :
stockage privé chiffré, import de fichiers, empreinte SHA-256, vérification
d'intégrité, chaîne de custodie, rapport PDF **et détection de sites frauduleux**.

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
# → page de démonstration : http://localhost:3000/demo
```

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

## API — module preuves

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/cases` | tous rôles | Liste des dossiers (pont interface ↔ API) |
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
`x-user-id` (tests) et retombe sur l'utilisateur `dev`. Remplacer son corps par
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

La page **`/demo`** rejoue tout ce scénario dans l'interface : en-tête au logo,
sélection du dossier, import, vérification, comparaison, chaîne de custodie,
détection d'URL et rapport PDF.

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
src/lib/storage.ts               Stockage privé (chemins générés, hors /public)
src/lib/hash.ts                  SHA-256 en flux + chiffrement AES-256-GCM
src/lib/filetypes.ts             Magic bytes, liste blanche, normalisation des noms
src/lib/custody.ts               Chaîne de custodie hachée + journal d'audit
src/lib/actor.ts                 ⚠️ Point de branchement de l'authentification (Membre 1)
src/lib/pdf.ts                   Génération du rapport PDF (pdfkit)
src/lib/detection/brands.ts      Marques surveillées, mots-clés, TLD suspects
src/lib/detection/url-analysis.ts  Analyse lexicale de l'URL (pur)
src/lib/detection/content.ts     Analyse de contenu + protection SSRF (pur)
src/app/api/...                  Routes API (preuves + détection)
src/app/demo/page.tsx            Page de démonstration jury (/demo)
tests/                           Vitest : unitaires + intégration (79 tests)
storage/                         Preuves chiffrées (ignoré par Git)
```
