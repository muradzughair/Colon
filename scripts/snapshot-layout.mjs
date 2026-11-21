// Preserve the actual exported presentation for isolated canvas comparison.
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
if (!["current", "refined"].includes(name)) {
  throw new Error("Choose the current or refined layout snapshot.");
}
await copyFile(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  fileURLToPath(new URL(`../../mockup-sandbox/public/medical-information-${name}.html`, import.meta.url))
);
console.log(`Preserved the real ${name} presentation in the isolated preview sandbox.`);
