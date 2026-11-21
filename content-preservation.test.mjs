import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { SLIDES } from "./slides.js";

test("the visual redesign preserves every slide's original information verbatim", async () => {
  const snapshot = await readFile(new URL("../mockup-sandbox/public/medical-information-current.html", import.meta.url), "utf8");
  const start = snapshot.indexOf("const SLIDES =");
  const end = snapshot.indexOf("/* DECK ENGINE", start);
  assert.ok(start >= 0 && end > start, "The extracted baseline must contain the original readable slide data.");
  const original = JSON.parse(JSON.stringify(runInNewContext(
    `${snapshot.slice(start, end)}\nSLIDES`, Object.create(null), { timeout: 1000 }
  )));
  assert.deepEqual(SLIDES, original, "Copy, slide order, demo state, and the existing 3D camera configuration must not change.");
});
