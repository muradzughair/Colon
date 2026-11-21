# OREFERA medical Orbit Deck

A ten-slide, manually navigated pitch drawn from the supplied **Idea and Features** document, brand artwork, and team-provided competitor landscape. One persistent colon scene moves continuously while the selected slide stays fixed. The supplied colon geometry and brand palette are preserved.

The information uses slide-specific visual compositions rather than a shared stack of paragraphs. Content wording remains in `slides.js`; the renderer groups and emphasizes that exact wording without rewriting it. All content remains visible at once, with the desktop content on the left and the animated anatomy on the right.

`card-colors.css` contains the light, complementary card palette and dark text colors. It is a paint-only layer: do not put layout, typography, or animation rules there. The exporter embeds it in both downloadable HTML files. Run the browser checks with `--layout-only --palette-check` to verify text contrast of at least 4.5:1 and compare every element's geometry and typography with the color layer disabled.

`node --test artifacts/medical-presentation-template/content-preservation.test.mjs` compares the slide data with the extracted before-design. The browser checks in `scripts/check-presentation.mjs` also verify each text line's bounds, responsive fitting, manual navigation, and unchanged 3D behavior.

## Pitch order and content boundaries

1. OREFERA logo and name
2. Problem
3. Impact
4. Solution
5. Product demo — deliberately no slide copy or placeholder
6. Market and competitors
7. Business model
8. Potential collaboration
9. Team
10. The ask

The hospital doctor view comes first; patient and read-only external doctor views are later phases. The demo uses fictional data and pre-computed AI findings. The system does not recommend treatments or medicines. Privacy, consent, and data protection remain prerequisites for any real-data work, not implemented product claims.

Competitor examples and MENA positioning come from the supplied landscape; they are not independently verified capability ratings or market-size estimates. Potential collaborators are not confirmed partners. Team names and roles were supplied by the user. The final slide asks the judging panel for **10,000 JOD** in implementation funding, as confirmed by the user. No budget allocation or financial projections are assumed.

Use `layout: "brand"` with `logo: {src,alt}` for an opening brand slide, or `layout: "blank"` to leave its content area completely empty while the continuous anatomy scene and navigation remain. The supplied logo is embedded in the single-file export.

## Open and edit without a build step

Open **index.html** in a modern browser, or serve this folder as a static website. It contains the model, styles, and local JavaScript helpers in one file. Internet is required for Three.js **0.170.0** and the Archivo / IBM Plex Mono fonts.

Find **EDIT YOUR DECK HERE** near the top of its inline module script. All slide content, duration, camera destinations, illustrative cancer positions, and focus labels live in one readable `const SLIDES` array. The comment describes every option. No engine edits are required.

The standalone `medical-presentation-template.html` download contains the same deck. Editing either standalone file directly works immediately; **running the export command overwrites both standalone files from the development sources**.

## Organized development sources

- `slides.js`: editable slide data and option documentation.
- `presentation.js`: model, camera, controls, and playback engine.
- `deck-state.js`: validated timing and illustrative cancer sampling.
- `deck-content.js`: safe rendering of text and optional content blocks.
- `styles.css` and `presentation-shell.html`: reusable visual layer.
- `cancer-illustration.js` and `assets/colon.glb`: model-attached illustration.

After editing these development sources, regenerate both standalone files:

```sh
node artifacts/medical-presentation-template/build-export.mjs
```

## Illustrative use only

Cancer growth, additional affected sites, and later reduction are synthetic illustrations. They are not real patient data, a literal account of metastatic spread, clinical stages, dates, scores, or a diagnostic or predictive medical simulation. The platform features described in the slides come from the supplied concept overview; this deck does not implement patient records, permissions, clinical reconstruction, secure sharing, or treatment services. No medical outcomes or statistics have been invented.

## Preview

Serve this folder from a local HTTP server, then open `index.html`. For example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/artifacts/medical-presentation-template/` from the workspace root, or serve this folder directly.

## Runtime assumptions

- Every slide is a fixed presentation surface: all configured copy is visible together, with no panel or page scrolling. Responsive reflow and measured fitting preserve text rather than clipping or truncating it.
- Cancer callouts identify the illustrated focus and colon segment. Their targets stay attached to the supplied model; labels disappear when a site is not active, off-screen, back-facing, or behind the copy. No labels or copy are added to the reserved demo slide.
- Chapters use varied angles and curved pull-back/push-in flights. Bounded camera orbits, floating offsets, and illustrative lesion changes run on an independent clock and never advance slides. Explicit pause stops the animation. Manual model inspection temporarily interrupts it, then motion continues smoothly from the inspected view.

- WebGL-capable modern browser with JavaScript modules enabled.
- The standalone model is embedded, with no local file requests needed.
- Drag the anatomy to orbit; wheel or pinch to zoom. These gestures never change the selected slide.
- Previous/next, the ten chapter markers, and Left/Right or PageUp/PageDown fly to a chapter. Scrubbing seeks instantly.
- **Space** advances a slide; **Shift+Space** goes back. **1–9** jump to slides; **0** jumps to slide ten. **Home/End** go to the first/last.
- **F** toggles fullscreen; **H** hides/restores the text panel and controls. Icons also support hiding and restoring.
- **Swipe horizontally on the content panel** to navigate on phones. Direct model dragging remains available; vertical scrolling is intentionally removed.
- Play/pause controls only the 3D animation, including on the final slide. Restart is an explicit manual return to the first slide. There is no slide autoplay; configured duration values only define manual seek positions and suggested speaking time.
- Reduced-motion preferences start the presentation paused and disable orbit damping.
- Anatomical **Focus** and actual camera **Zoom** replace Earth-specific LAT/LON/ALT telemetry. Camera views use named organ anchors, not geographic coordinates.
