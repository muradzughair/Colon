import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const embeddedModules = new Map();

async function embedModule(filename, ancestors = new Set()) {
  if (ancestors.has(filename)) throw new Error(`Circular local module import: ${filename}`);
  if (embeddedModules.has(filename)) return embeddedModules.get(filename);
  const nextAncestors = new Set([...ancestors, filename]);
  let source = await readFile(filename, "utf8");
  // Keep the actual deck data readable at the top of the exported inline script.
  // Other helpers stay isolated modules, avoiding name collisions.
  source = source.replace(/^import\s+\{\s*SLIDES\s*\}\s+from\s+["']\.\/slides\.js["'];?\s*$/m, "");
  // The colon journey settings (findings and inside stops) stay readable beside SLIDES.
  source = source.replace(/^import\s+\{\s*FINDINGS,\s*INSIDE\s*\}\s+from\s+["']\.\/journey\.js["'];?\s*$/m, "");
  const imports = [...source.matchAll(/\bfrom\s*(["'])(\.\/[^"']+\.js)\1/g)];
  for (const match of imports) {
    const child = resolve(dirname(filename), match[2]);
    const dataUrl = await embedModule(child, nextAncestors);
    source = source.replace(match[0], `from ${JSON.stringify(dataUrl)}`);
  }
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  embeddedModules.set(filename, dataUrl);
  return dataUrl;
}

let html = await readFile(resolve(directory, "presentation-shell.html"), "utf8");
const css = await readFile(resolve(directory, "styles.css"), "utf8");
const cardColors = await readFile(resolve(directory, "card-colors.css"), "utf8");
const moduleUrl = await embedModule(resolve(directory, "presentation.js"));
let script = Buffer.from(moduleUrl.split(",")[1], "base64").toString("utf8");
const editableSlides = (await readFile(resolve(directory, "slides.js"), "utf8")).replace(/^export\s+/gm, "");
const editableJourney = (await readFile(resolve(directory, "journey.js"), "utf8")).replace(/^export\s+/gm, "");
script = `${editableSlides}\n\n${editableJourney}\n\n/* DECK ENGINE — slide edits belong in SLIDES above. */\n${script}`;
// Resolve the supplied logo at runtime so the editable SLIDES array retains a
// short, readable local path while the exported file has no local asset requests.
const logo = await readFile(resolve(directory, "assets/orefera-mark.png"));
const logoData = `data:image/png;base64,${logo.toString("base64")}`;
script = script.replace("/* DECK ENGINE — slide edits belong in SLIDES above. */",
  `/* DECK ENGINE — slide edits belong in SLIDES above. */\nfor (const slide of SLIDES) {\n  if (slide.logo?.src === "./assets/orefera-mark.png") slide.logo.src = ${JSON.stringify(logoData)};\n}`);
const model = await readFile(resolve(directory, "assets/colon.glb"));
const modelPattern = /(["'])\.\/assets\/colon\.glb\1/g;
if (!modelPattern.test(script)) throw new Error("Cannot find the supplied model reference.");
script = script.replace(modelPattern, JSON.stringify(`data:model/gltf-binary;base64,${model.toString("base64")}`));
const stylesheetPattern = /<link\b[^>]*href=["']\.\/styles\.css["'][^>]*>/;
const scriptPattern = /<script\b[^>]*src=["']\.\/presentation\.js["'][^>]*>\s*<\/script>/;
if (!stylesheetPattern.test(html) || !scriptPattern.test(html)) {
  throw new Error("Cannot find the presentation's stylesheet or entry script.");
}
html = html.replace(stylesheetPattern, () => `<style>\n${css}\n</style>`);
const cardColorsPattern = /<link\b[^>]*href=["']\.\/card-colors\.css["'][^>]*>/;
if (!cardColorsPattern.test(html)) throw new Error("Cannot find the card color stylesheet.");
html = html.replace(cardColorsPattern, () => `<style id="card-colors">\n${cardColors}\n</style>`);
html = html.replace(scriptPattern, () => `<script type="module">\n${script}\n</script>`);
for (const name of ["index.html", "medical-presentation-template.html"]) {
  await writeFile(resolve(directory, name), html);
}
console.log("Exported self-contained index.html and medical-presentation-template.html with editable SLIDES, FINDINGS and INSIDE. Three.js and fonts require internet.");
