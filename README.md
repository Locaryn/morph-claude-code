# morph-claude-code

> Vos modèles Claude dans Locaryn, avec **votre abonnement Claude** (Pro, Max)
> ou votre clé d'API — par le CLI officiel Claude Code, sur votre machine.

## Ce que ce morph apporte

- **Un dossier « Claude Code »** dans « Mes modèles » et dans le sélecteur de
  modèle du chat : Claude Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1, et les
  alias `opus` / `sonnet` / `haiku` qui suivent toujours la dernière version.
- **Une carte dans Réglages → Compte** pour installer Claude Code, démarrer le
  pont et **connecter votre compte Anthropic**. Sans ce morph, rien de tout
  cela n'apparaît dans Locaryn.
- **Une jauge des limites** à côté de la jauge de contexte, quand un modèle
  Claude répond : fenêtre de 5 heures, semaine, et quand elles repartent de
  zéro. Elle n'apparaît que pour un modèle payant.

## Comment ça marche

Un petit serveur (`bridge/server.mjs`, Node.js, sans dépendance) écoute sur
`127.0.0.1:20131` et parle le dialecte OpenAI que Locaryn utilise. À chaque
message, il lance `claude -p` en flux JSON :

- **Les outils de Claude Code sont coupés** (`--tools ""`) : c'est Locaryn qui
  lit, écrit et exécute, avec ses permissions et ses demandes d'accord. Les
  outils de Locaryn sont décrits au modèle, qui les appelle par des blocs
  `<tool_call>` ; le pont les rend à Locaryn comme de vrais appels d'outils.
- **La consigne système vient de Locaryn** (`--system-prompt-file`), et rien
  n'est gardé en session (`--no-session-persistence`).
- **Vos identifiants restent ceux du CLI** : Locaryn ne les lit jamais. La
  connexion ouvre une fenêtre `claude auth login`, qui passe par le navigateur.
- Les événements de limite du flux alimentent `GET /v1/usage`, que la jauge lit.

## Prérequis

- Node.js 18 ou plus récent (pour le pont).
- Claude Code : déjà installé (`claude` dans le PATH, ou `~/.local/bin`), ou
  installé par Locaryn depuis la carte du compte (`@anthropic-ai/claude-code`
  épinglé, dans le dossier de la passerelle — pas en global).

## Limites connues

- Les images jointes ne sont pas transmises (le CLI ne les lit pas sur l'entrée
  standard).
- Les limites ne s'affichent qu'après une première réponse : le CLI ne les
  publie que dans le flux d'une conversation.
- Utilisation soumise aux conditions d'Anthropic pour Claude Code et à celles
  de votre abonnement.

## Écrire le même morph pour un autre fournisseur

Le pont est commun (`bridge/server.mjs`, `bridge/cli.mjs`) ; seul
`bridge/adapter.mjs` change : `models()`, `status()`, `login()`, `logout()`,
`usage()` et `run()`. Copiez ce dépôt, réécrivez l'adaptateur pour votre CLI,
changez `id`, `label` et le port dans `morph.json`.

## Licence

Apache-2.0. Claude Code est un produit d'Anthropic, sous ses propres
conditions : ce morph l'installe depuis npm, il ne le redistribue pas.
