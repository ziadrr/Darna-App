# Darna — Collaboration Claude Code × Google AI Studio

Ce fichier est la **source de vérité** pour savoir qui fait quoi. Les deux outils
(Claude Code et AI Studio) doivent le **lire avant de commencer** et le **mettre à
jour à la fin** de chaque tâche. Ziad arbitre.

---

## 1. Règle d'or : chacun ses fichiers

| Zone | Propriétaire | Fichiers |
|------|--------------|----------|
| Serveur, base de données, sécurité, tests, CI | **Claude Code** | `server.ts`, `src/server/**`, `src/db/**`, `src/utils/security.ts`, `tests/**`, `.github/**`, `drizzle/**`, `.env.example` |
| Interface (écrans, styles, carte, formulaire) | **AI Studio** | `src/App.tsx`, `src/components/**`, `src/index.css`, `index.html`, `public/**`, `src/data/translations.ts` |
| Partagé (annoncer AVANT de toucher, dans la section 3) | les deux | `src/types/index.ts`, `src/utils/rentalLogic.ts`, `package.json`, `src/data/*` (hors traductions) |

- On ne modifie **pas** un fichier de l'autre zone. Si c'est nécessaire, on
  l'écrit dans « Demandes à l'autre » (section 4) au lieu de le faire.
- Exception : un **test** qui vérifie l'interface peut être modifié par Claude Code
  seulement pour suivre un changement validé d'AI Studio.

## 2. Déroulé d'une tâche

1. **Avant de commencer** : récupérer la dernière version de `main` (AI Studio :
   recharger depuis GitHub ; Claude Code : `git pull`).
2. Passer la tâche en `EN COURS (Claude|AI Studio)` dans la section 3.
3. Coder **uniquement** dans sa zone.
4. Vérifier : `npm run lint`, `npm test` (supprimer `dist/` avant), `npm run build`.
5. Pousser sur GitHub, passer la tâche en `À RELIRE`, ajouter une ligne au journal (section 5).
6. **Relecture croisée** :
   - ce que fait AI Studio → relu par Claude Code (Ziad écrit « REGARDE MNT ») ;
   - ce que fait Claude Code → Ziad colle à AI Studio le prompt « RELIS CLAUDE »
     (section 6) ; Claude Code re-vérifie ensuite que la relecture n'a rien cassé.
7. Une tâche n'est `FAIT` que si les deux côtés l'ont relue et que la CI est verte.

**Jamais** : de clé, mot de passe ou secret dans le code, ce fichier ou un prompt
(le dépôt est public). Les secrets vont dans les « Secrets » d'AI Studio.

## 3. Tableau des tâches

Statuts : `À FAIRE` · `EN COURS (qui)` · `À RELIRE` · `FAIT`

| # | Tâche | Qui | Statut |
|---|-------|-----|--------|
| C1 | CI GitHub : Node 22 + npm (Bun ne lisait pas le lockfile) | Claude | À RELIRE |
| C2 | Images d'annonces : refuser les URLs externes / `http://` / chemins internes (`INVALID_IMAGE_URL`) ; Unsplash seulement hors prod ou en mode démo | Claude | À RELIRE |
| C3 | Lecture PostgreSQL d'abord pour code e-mail, lien magique, Google/Apple, mot de passe oublié (multi-instance) | Claude | À RELIRE |
| C4 | Session non vérifiable contre PostgreSQL en prod → refusée (`SESSION_CHECK_FAILED`) | Claude | À RELIRE |
| C5 | Quotas images par défaut : 30 images / 40 Mo par utilisateur (configurable) | Claude | À RELIRE |
| C6 | Cache court (lecture annonces / sessions) sans casser la cohérence multi-instance | Claude | À FAIRE (quand il y aura du trafic) |
| C7 | Découper `src/server/apiApp.ts` (> 4 300 lignes) en routes séparées, un morceau à la fois | Claude | À FAIRE |
| C8 | Webhook paiement au vrai format CMI/Payzone (nécessite le contrat / la doc) | Claude | BLOQUÉ (doc CMI) |
| C9 | Limiteurs de débit partagés entre instances (PostgreSQL) | Claude | À FAIRE |
| A1 | Bouton « photo d'exemple » du formulaire visible seulement en mode démo + message clair pour `INVALID_IMAGE_URL` | AI Studio | À FAIRE |
| A2 | Formulaire en plein écran sur mobile + en-tête compact (≥ 60 % de hauteur pour le contenu) | AI Studio | À FAIRE |
| A3 | Vérifier visuellement la carte (fond CARTO, clusters, pastilles) sur mobile et ordinateur | AI Studio | À FAIRE |
| A4 | Chargement différé (lazy) de AdminDashboard, AiImageStudioModal, MoroccoMap (bundle > 500 Ko) | AI Studio | À FAIRE |
| A5 | Pages légales (CGU, mentions légales, CNDP) + positionnement « location ET vente » | AI Studio | À FAIRE |

## 4. Demandes à l'autre

- **Claude → AI Studio** : le serveur renvoie maintenant `400 INVALID_IMAGE_URL`
  pour toute image qui n'est pas une photo téléversée sur Darna (sauf Unsplash
  hors production / mode démo). Le formulaire doit afficher ce message tel quel
  et ne plus proposer de photo d'exemple hors mode démo (tâche A1).
- **AI Studio → Claude** : _(vide)_

## 5. Journal (le plus récent en haut)

| Date | Qui | Quoi | Vérifié |
|------|-----|------|---------|
| 2026-11-19 | Claude | C1→C5 + test 35 (URLs d'images) | lint OK, tests 44 OK / 2 ignorés, build OK |

## 6. Prompt « RELIS CLAUDE » (à coller dans AI Studio)

```
Lis COLLABORATION.md. Récupère la dernière version depuis GitHub.
Relis les tâches marquées « À RELIRE » faites par Claude : explique-moi en français ce qui a changé,
signale tout problème (bug, régression d'interface, incohérence avec le front), mais NE MODIFIE PAS
les fichiers de la zone Claude. Si un changement côté interface est nécessaire, fais-le dans ta zone
et ajoute une ligne au journal (section 5) de COLLABORATION.md.
```
