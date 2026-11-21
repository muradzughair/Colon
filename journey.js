/*
 * EDIT THE COLON JOURNEY HERE
 * ---------------------------
 * The colon journey has three acts. It starts outside, with the findings glowing through the
 * wall like a heat map. In the middle it dives inside the colon and stops at each finding.
 * At the end it leaves through the rectum and pulls back out to the outside view.
 *
 * FINDINGS: illustrative polyps and a tumor on the INNER wall of the supplied colon.
 *   id: unique; kind: "polyp" | "tumor"; label: shown next to the finding inside the colon.
 *   at: position along the colon, 0 = start (cecum) ... 1 = end (rectum).
 *   around: degrees around the colon wall (0 = the side facing the audience).
 *   sizeMm: drawn size in millimetres (illustrative, not a measurement).
 *   The colon segment name (for example "Ascending colon") is detected from the model.
 *
 * INSIDE: slide id -> finding id. These slides fly inside the colon and stop in front of that
 *   finding. Every other slide keeps its outside camera view from SLIDES. Going forward, the
 *   camera enters at the cecum and leaves through the rectum; going back plays it in reverse.
 *   To add a stop, add a finding and map another slide to it.
 *
 * Synthetic illustration only: not patient data, a diagnosis, a stage, or a prediction.
 */
export const FINDINGS = [
  { id: "polyp-1", kind: "polyp", label: "Polyp", at: 0.11, around: 35, sizeMm: 9 },
  { id: "polyp-2", kind: "polyp", label: "Polyp", at: 0.33, around: -40, sizeMm: 7 },
  { id: "polyp-3", kind: "polyp", label: "Polyp", at: 0.62, around: 30, sizeMm: 10 },
  { id: "tumor", kind: "tumor", label: "Tumor", at: 0.83, around: -25, sizeMm: 30 }
];

export const INSIDE = {
  "solution": "polyp-1",
  "product-demo": "polyp-2",
  "market-competitors": "polyp-3",
  "break-even": "tumor"
};
