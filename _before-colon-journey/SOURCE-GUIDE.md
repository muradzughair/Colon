# OREFERA presentation source guide

This folder contains the editable presentation source, supporting assets, browser checks, and generated standalone HTML exports.

## Main editable files

- `slides.js` — slide wording and structured content. The reserved product demo slide stays empty.
- `deck-content.js` — renders slide-specific text and cards.
- `styles.css` — presentation layout, responsive sizing, and motion-related visual styling.
- `card-colors.css` — paint-only light card palette and readable text colors.
- `presentation-shell.html` — the application HTML shell.
- `presentation.js`, `camera-motion.js`, `cancer-illustration.js`, and `deck-state.js` — navigation, the continuously animated 3D scene, callout labels, and slide state.
- `assets/colon.glb` and `assets/orefera-mark.png` — the supplied colon model and brand artwork.

## Build and check

From the project root, run:

```sh
node artifacts/medical-presentation-template/build-export.mjs
node --test artifacts/medical-presentation-template/card-colors.test.mjs \
  artifacts/medical-presentation-template/content-preservation.test.mjs \
  artifacts/medical-presentation-template/camera-motion.test.mjs \
  artifacts/medical-presentation-template/deck-state.test.mjs
```

The exporter generates `index.html` and `medical-presentation-template.html`. They package the code and model into standalone files; Three.js and fonts still load from the internet.

For a full-project browser check, start a local web server rooted at this folder, then run `node artifacts/medical-presentation-template/scripts/check-presentation.mjs --layout-only --palette-check` from the project root.
