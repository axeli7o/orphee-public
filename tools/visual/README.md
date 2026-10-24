# Vérification visuelle (harness headless)

Rend une vue de l'app avec les **vrais CSS + modules** et des **données mock**
(calquées sur le schéma cache, `docs/SPEC.md` § 4.1), puis la **capture** en
desktop et mobile. Sert à valider une mise en page sans Firebase ni auth — p.ex.
le feed Stats sur grand écran (ADR-029).

## Pourquoi
L'app exige Firebase Auth + données de cache : impossible à rendre tel quel hors
ligne. Le harness stube `IntersectionObserver` (révèle tout), charge les modules
IIFE de `public/js/`, et bâtit le DOM via des mocks.

## Usage
```bash
cd tools/visual
npm run setup          # une fois : installe playwright + chromium
node shoot.js stats    # → out/stats_desktop.png, out/stats_mobile.png
```
`node shoot.js <vue> [dossier-sortie]`. Vues définies dans `mocks.js` (`VIEWS`).

## Ajouter une vue
Dans `mocks.js`, ajouter `{ scripts:[…public/js…], build() {…} }` sous la clé de
la vue, en construisant le DOM avec des mocks au bon schéma.

## Notes
- `out/` et `node_modules/` sont gitignorés.
- Le binaire chromium est aussi pré-installé par le hook SessionStart
  (`.claude/`), donc « ça marche » dès le début d'une session web.
