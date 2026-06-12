# DTSC e-PROC Dashboard — version publiée (lecture seule)

Dashboard de veille des marchés publics belges (publicprocurement.be) pour DTSC.

## Architecture
- `index.html` — UI lecture seule (filtres, recherche, tri). Aucun bouton Sync : les données viennent de `data.json`.
- `core.js` — logique pure (scoring, matching membres, thèmes, rendu). Testée en Node.
- `data.json` — données générées par le sync interne Cowork (emails ePROC + pages publicprocurement.be + CVs SharePoint). **Ne pas éditer à la main.**
- `tests/run-tests.js` — suite de tests unitaires : `node tests/run-tests.js` (exit 1 si échec).

## Mise à jour des données
Après chaque sync interne (déclenché par quentin.deliere@dtsc.be dans Cowork), `data.json` est régénéré,
la suite de tests est exécutée, puis le commit est poussé → GitHub Pages se met à jour automatiquement.
La date du dernier sync est affichée dans la barre de stats.

## Tests dans le navigateur
Ajouter `?debug=tests` à l'URL → smoke tests dans la console.
