# CyberTrace BF — Cœur technique des preuves numériques

> **La preuve numérique, préservée et traçable.**

Module « Membre 2 — Preuves numériques » du cahier des charges CyberTrace BF :
stockage privé, import de fichiers, empreinte SHA-256, vérification d'intégrité,
chaîne de custodie et rapport PDF.

Application : **Next.js 16 (App Router) · TypeScript · Tailwind · PostgreSQL 17 · Prisma 7**

---

## Mise en route

```bash
# 1. Dépendances
npm install

# 2. Configuration
#    copier .env.example vers .env et renseigner DATABASE_URL

# 3. Base de données
npx prisma migrate dev

# 4. Données de démonstration (utilisateurs + dossier CT-2026-001)
curl -X POST http://localhost:3000/api/dev/seed

# 5. Lancer
npm run dev
```

PostgreSQL : l'utilisateur applicatif doit posséder le droit `CREATEDB`
(utilisé par la base fantôme de Prisma Migrate) :

```sql
ALTER USER cybertrace CREATEDB;
```

---

## API — module preuves

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/cases/:caseId/evidence` | ANALYSTE/ADMIN | Import d'un fichier : validation (taille, extension, magic bytes), SHA-256 **calculé dans le flux**, stockage privé, événement de custodie, audit |
| GET | `/api/cases/:caseId/evidence` | tous rôles | Liste des preuves du dossier |
| GET | `/api/evidence/:id` | tous rôles | Métadonnées + derniers verdicts + état de la chaîne |
| POST | `/api/evidence/:id/verify` | ANALYSTE/ADMIN | Recalcul du SHA-256 du fichier stocké, comparaison, verdict **tracé même en cas d'échec** |
| POST | `/api/evidence/:id/compare` | tous rôles | Compare une **copie** (non stockée) à l'empreinte initiale — étape 5 du scénario jury |
| GET | `/api/evidence/:id/download` | tous rôles | Téléchargement contrôlé (stream depuis le stockage privé), opération tracée |
| GET | `/api/evidence/:id/custody` | tous rôles | Historique chronologique + vérification de la chaîne de hachage |
| GET | `/api/cases/:caseId/report.pdf` | tous rôles | Rapport PDF : dossier, preuves, empreintes, verdicts, historique, limites |
| POST | `/api/dev/seed` | démo | Jeu de données fictifs (refusé en production) |

Codes d'erreur : `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `CASE_NOT_FOUND` /
`EVIDENCE_NOT_FOUND` (404), `TOO_LARGE` (413), `BAD_EXTENSION` /
`CONTENT_MISMATCH` (415), `STORAGE_MISSING` (410).

---

## Garanties de sécurité (cahier des charges §7)

- **Stockage privé** : les preuves vivent dans `storage/cases/<dossier>/<uuid><ext>`
  (ignoré par Git, hors de `/public`). Aucun fichier n'est servi directement.
- **Noms générés par l'application** : UUID côté serveur, nom d'origine conservé
  en base pour l'affichage uniquement (nettoyé contre le path-traversal).
- **Type réel vérifié** : magic bytes (PNG, JPEG, GIF, WEBP, PDF, ZIP/DOCX/XLSX)
  ou contenu texte — le MIME déclaré par le navigateur n'est jamais cru.
- **Taille maximale** : 25 Mo, liste blanche d'extensions.
- **Empreinte SHA-256** calculée côté serveur pendant l'écriture (un seul passage).
- **Horodatage serveur** pour tous les événements (jamais la date client).
- **Journal d'audit** : chaque opération sensible est écrite (succès et échec).
- **Chaîne de custodie hachée** : chaque événement referme le SHA-256 du précédent
  (JSON canonique) — toute altération ou suppression casse la chaîne et est
  détectée par `GET /api/evidence/:id/custody`.

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

# 7) Générer le rapport PDF
curl -OJ http://localhost:3000/api/cases/<CASE_ID>/report.pdf
```

---

## Limites assumées (à dire au jury)

L'empreinte SHA-256 prouve l'**intégrité depuis l'enregistrement** et détecte
toute modification. Elle ne prouve pas à elle seule l'**authenticité de l'origine**,
la **date réelle de collecte** (les dates saisies sont déclaratives) ni la
**valeur juridique** d'une preuve. Évolutions possibles : horodatage externe
(RFC 3161), signature de la chaîne par une autorité, journal externe inviolable.

---

## Organisation du dépôt

```
prisma/schema.prisma        Modèles : User, Case, Evidence, CustodyEvent, AuditLog
src/lib/storage.ts          Stockage privé (chemins générés, hors /public)
src/lib/hash.ts             SHA-256 en flux + comparaison à temps constant
src/lib/filetypes.ts        Magic bytes, liste blanche, normalisation des noms
src/lib/custody.ts          Chaîne de custodie hachée + journal d'audit
src/lib/actor.ts            ⚠️ Point de branchement de l'authentification (Membre 1)
src/lib/pdf.ts              Génération du rapport PDF (pdfkit)
src/app/api/...             Routes API du module preuves
storage/                    Preuves stockées (ignoré par Git)
```
