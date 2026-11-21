/*
 * EDIT YOUR DECK HERE
 * -------------------
 * Edit only SLIDES to change the story, timing, or camera destinations.
 * The downloaded index.html includes this same readable array above the engine.
 *
 * Required: id (unique), title, duration (seconds), view.
 * view: { site: "overview" | "regional" | 0..3, zoom, mobileZoom?,
 *         offset?: [x,y,z], tilt?: degrees, heading?: degrees }.
 * Sites are anatomical anchors on the supplied colon, NOT Earth coordinates:
 * 0 transverse colon, 1 ascending colon, 2 descending colon, 3 sigmoid colon.
 * Use mobileZoom: "fit" for a complete-organ view on phones.
 * layout: "brand" (logo and name), "blank" (no content), "hero", or "panel" (default).
 * logo: {src,alt} for the supplied brand mark. The export embeds the image.
 * Text: eyebrow, title, sub, body, bullets (at most three), chips, note.
 * Optional blocks: stat:{value,unit,label}; legend:[{color,label}];
 * media:{type:"image"|"video",src,alt}; team:[{name,role}];
 * links:[{label,href}]. Use real sources, never invent statistics.
 * cancerTime: illustrative animation position, 0..45000, NOT patient time.
 * markers: [{site:0..3,label}] for model-attached focus labels.
 * sun: "day" | "dusk" | "night" adjusts anatomy lighting, not the background.
 * motion: bounded ambient camera strength (0..1.5); spin is optional model rotation.
 * Duration values define manual seek positions and a suggested seven-minute talk.
 * Slides never auto-advance; 3D animation has a separate clock.
 * Pitch order follows the user's requested ten-slide structure.
 * Sources: Idea_and_Features.pdf, supplied brand boards and competitor landscape.
 * The final ask is 10,000 JOD in implementation funding from the judging panel,
 * as confirmed by the team.
 * Clinical features described below are the supplied platform concept;
 * this presentation does not implement or validate those clinical services.
 */
export const SLIDES = [
  {
    id: "orefera",
    duration: 42,
    layout: "brand",
    logo: { src: "./assets/orefera-mark.png", alt: "OREFERA medical and referral symbol" },
    title: "OREFERA",
    sub: "AI Oncology & Referral Platform",
    view: { site: "overview", zoom: 1.3, mobileZoom: "fit", heading: -12, tilt: 5 },
    cancerTime: 0
  },
  {
    id: "problem",
    duration: 42,
    eyebrow: "The problem",
    title: "Cancer care lasts years. The records are scattered.",
    bullets: [
      "Patient: piles of scans and results, no one place, no clear summary",
      "Doctor: hundreds of patients, hard to remember each history",
      "New doctor: unorganized records lead to mistakes or repeated treatments"
    ],
    stat: { value: "68%", label: "of specialists receive no information from the referring doctor" },
    note: "Source: Gandhi et al., Journal of General Internal Medicine, 2000.",
    view: { site: 0, zoom: 2.25, mobileZoom: 1.35, heading: 26, tilt: -8 },
    cancerTime: 3000
  },
  {
    id: "impact",
    duration: 42,
    eyebrow: "The impact",
    title: "Missing context can delay the next step.",
    body: "When the history is hard to reconstruct, the next clinician must first work out what happened before deciding what comes next.",
    bullets: ["Clinical time is spent matching records and dates", "Changes and earlier treatment plans are harder to review", "Wrong decisions: too many unorganized records can mislead the doctor"],
    note: "OREFERA aims to improve understanding and continuity. Clinical benefits have not yet been measured.",
    view: { site: "regional", zoom: 1.45, mobileZoom: "fit", tilt: 11, heading: -26 },
    cancerTime: 8000
  },
  {
    id: "solution",
    duration: 42,
    eyebrow: "The solution",
    title: "One record. A visual history.",
    body: "A hospital-first platform connects dated records and clinician-reviewed findings to an interactive 3D colon.",
    bullets: ["Dated visits: CT, colonoscopy, video, and tests", "Editable findings and side-by-side date comparisons", "Doctor-entered treatment records and editable radiology reports"],
    note: "The demo uses fictional data and pre-computed AI results. The doctor makes every decision; no treatment or medicine is suggested.",
    markers: [{ site: 0, label: "Cancer illustration" }],
    view: { site: 0, zoom: 3.05, mobileZoom: 2.05, tilt: 7, heading: 18 },
    cancerTime: 11250
  },
  {
    id: "product-demo",
    duration: 42,
    eyebrow: "Product demo",
    title: "See the prototype.",
    bullets: [
      "3D colon: every polyp and tumor on one map",
      "Dated visits: CT and colonoscopy pictures, by date",
      "Compare dates: what changed and what was done"
    ],
    note: "Fictional demo patient. The doctor makes every decision.",
    view: { site: "regional", zoom: 1.65, mobileZoom: 1.05, heading: -18, tilt: -7 },
    cancerTime: 22500
  },
  {
    id: "market-competitors",
    duration: 42,
    eyebrow: "Market",
    title: "Start in Jordan. Grow across the region.",
    rings: [
      { tag: "SOM", value: "121", label: "hospitals in Jordan: government, military, private and cancer centers" },
      { tag: "SAM", value: "$0.45B", label: "Middle East market" },
      { tag: "TAM", value: "$4.2B", label: "Global market" }
    ],
    note: "Oncology software market. Sources: Trade.gov 2024, Emergen Research 2024, IMARC 2024.",
    view: { site: 2, zoom: 2.1, mobileZoom: 1.5, heading: 28, tilt: 9 },
    cancerTime: 33750
  },
  {
    id: "break-even",
    duration: 42,
    eyebrow: "Break-even",
    title: "Break-even.",
    rings: [
      { tag: "Break-even", value: "4", label: "hospitals" },
      { tag: "Payback", value: "16", label: "months" },
      { tag: "Price", value: "400", label: "JOD / month" }
    ],
    view: { site: "overview", zoom: 1.35, mobileZoom: "fit", heading: -20, tilt: 4 },
    cancerTime: 41000
  },
  {
    id: "business-model",
    duration: 42,
    eyebrow: "Business model",
    title: "The hospital subscribes. The care team uses it.",
    body: "Hospitals pay a subscription for the full doctor view. Doctors, MDTs, and radiologists use the same patient record.",
    bullets: ["Hospital subscriptions fund the platform", "Doctor view first: nine defined core features", "Patient and read-only external doctor views come later"],
    note: "Pricing is not yet specified. Insurance companies are outside the product scope.",
    view: { site: 3, zoom: 2.15, mobileZoom: 1.5, tilt: -12, heading: -24 },
    cancerTime: 40000
  },
  {
    id: "potential-collaboration",
    duration: 42,
    eyebrow: "Potential collaboration",
    title: "Build the workflow with clinicians.",
    body: "We propose working with clinical and technical partners to validate the workflow and prepare the next development stage.",
    bullets: ["Hospital oncology and MDT teams: review workflow needs", "Radiologists: test finding review and report editing", "Research and technical partners: evaluate AI and data governance"],
    note: "These are proposed collaborations, not confirmed partnerships. Privacy, consent, and data protection must be defined before real patient data is used.",
    view: { site: "overview", zoom: 1.35, mobileZoom: "fit", heading: 22, tilt: 6 },
    cancerTime: 42500
  },
  {
    id: "team",
    duration: 42,
    eyebrow: "The team",
    title: "The team behind OREFERA.",
    body: "Motivated by a family member’s fragmented care history, the team is focused on building the hospital doctor view first.",
    team: [
      { name: "Nour Atiya", role: "Design & Presentation" },
      { name: "Noor Majdi", role: "Business & Pitching" },
      { name: "Murad Alzughair", role: "Technical Development" },
      { name: "Teeba Mohammed", role: "Medical Research" },
      { name: "Yaqout Sultan", role: "Medical Research" },
      { name: "Eman Jamal", role: "Medical Research" }
    ],
    view: { site: "overview", zoom: 1.3, mobileZoom: "fit", heading: -16, tilt: -4 },
    cancerTime: 44000
  },
  {
    id: "the-ask",
    duration: 42,
    eyebrow: "The ask",
    title: "Help us build OREFERA.",
    body: "We’re seeking implementation funding from the judging panel to build the hospital doctor view.",
    stat: { value: "10,000", unit: "JOD", label: "Implementation funding" },
    view: { site: "overview", zoom: 1.22, mobileZoom: "fit", heading: 8, tilt: 5 },
    cancerTime: 45000
  }
];
