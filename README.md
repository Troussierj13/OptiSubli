# Opti Enchantements Wakfu

Petite appli locale pour optimiser le placement des sublimations sur un stuff
en minimisant le nombre de châsses jaunes à obtenir.

## Utilisation

Ouvrir `index.html` dans un navigateur (double-clic), aucune installation nécessaire.

1. **Mon personnage** : choisir le rôle (Mêlée / Distance / Support) et les options
   (Spé Crit, Spé Dos, Soins) qui ajustent la couleur opti de certains objets.
2. **Mes sublimations** : rechercher et ajouter les sublimations voulues (max 10,
   quantité réglable, le `max_usage` du jeu est vérifié).
3. **Mes objets** (optionnel) : indiquer les châsses déjà en place sur tes objets —
   les jaunes existantes sont réutilisées par le calcul — ou forcer la couleur opti
   d'un objet.
4. **Placement optimal** : affectation exacte des sublimations aux 10 objets,
   couleur de chaque châsse, position de la sublimation (châsses 1-3 ou 2-4),
   et total de jaunes à obtenir.
5. **Ordre d'enchantement conseillé** : pour chaque objet restant, « levier de
   chance » = jaunes économisées si l'objet sortait full jaune. Enchanter d'abord
   les objets à fort levier ; après chaque objet, déclarer les couleurs obtenues
   (section 3) et cocher « fait » — un objet fait garde ses châsses telles quelles
   et n'accueille une sublimation que si les couleurs correspondent déjà.
6. **Mode enchantement** : sélectionner l'objet en cours de roll ; l'appli liste
   les combinaisons de couleurs (sans jaune) qui égalent ou battent le plan.
   En rouler une → « Prévisualiser » applique le nouveau plan complet, puis
   « Je garde » ou « Annuler ».

Chaque objet peut aussi **tolérer** des couleurs supplémentaires (section 3,
« Tolère aussi ») : une exigence de sublimation dans une couleur tolérée ne coûte
pas de jaune, au prix d'une châsse non opti (perte de stats assumée, ex. bottes
mêlée qui acceptent le bleu pour de la maîtrise élémentaire). À coût de jaunes
égal, l'algorithme minimise d'abord les châsses tolérées, puis la perte de stats
chiffrée, puis maximise la réutilisation des jaunes déjà en place.

## Stats des châsses

Le **niveau du stuff** (tranches de 20 à 245 par pas de 15) détermine le niveau
max des châsses (1 par tranche, plafonné à 11). Les valeurs par stat et par
niveau sont dérivées des formules du jeu (`subli.json`) — vérifiées :
maîtrises secondaires 1→33, élémentaire 1→22, vie 4→88 — et doublées sur les
objets concernés (`double_bonus`). Survoler une châsse dans les résultats affiche
l'enchantement prévu, sa valeur, et la perte chiffrée si la couleur est tolérée.
Les stats des stuffs support (résistances, soin, initiative…) ne sont pas comptées.
La case « ❤️ vie » (chapeau, corps à corps : PV doublés) bascule l'objet en opti
bleu avec des enchantements Vie. Le coût en éclats par châsse (1 → 12 415 selon
le niveau) est affiché à titre indicatif.

Les choix sont sauvegardés dans le navigateur (localStorage).

## Règles encodées

- Chaque objet a 4 châsses ; une sublimation exige 3 couleurs ordonnées sur les
  châsses 1-3 ou 2-4.
- La couleur opti par objet et par rôle vient du tableau de référence communautaire
  (bonus d'enchantement doublés). Elle est définie dans `ITEMS` en tête de `app.js`.
- Une châsse jaune est un joker : elle valide n'importe quelle couleur exigée par la
  sublimation tout en acceptant l'enchantement opti.
- Les anneaux sont traités comme des objets « libres » (couleur indifférente) : ils
  accueillent gratuitement les sublimations les plus incompatibles.
- Plastron en support : les résistances sont doublées quelle que soit la couleur des
  châsses. Un switch « Plastron châsses libres » permet de choisir entre full jaune
  (4 jaunes, mais choix libre des éléments de résistance) et châsses aux couleurs de
  la sublimation (0 jaune, éléments imposés par les couleurs).
- À total de jaunes égal, l'algorithme préfère la solution qui réutilise le plus de
  jaunes déjà en place : les sublimations les plus exigeantes vont sur les objets
  riches en jaunes, les faciles sur les emplacements ordinaires.

## Fichiers

- `index.html` / `style.css` / `app.js` — l'application.
- `data.js` — les 154 sublimations (nom, couleurs exigées, max), généré depuis `subli.json`.
- `build-data.ps1` — régénère `data.js` si `subli.json` est mis à jour :
  `powershell -File build-data.ps1`
- `subli.json` — export brut des données du jeu (sublimations + shards).
