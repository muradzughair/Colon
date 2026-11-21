import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the color layer cannot change layout, typography, content, or animation", async () => {
  const css = (await readFile(new URL("./card-colors.css",import.meta.url),"utf8")).replace(/\/\*[\s\S]*?\*\//g,"");
  const paintProperties = new Set([
    "color","background","background-color","border-color",
    "box-shadow","text-shadow","outline-color","stroke","fill"
  ]);
  for(const [,property] of css.matchAll(/([-\w]+)\s*:\s*([^;{}]+);/g)) {
    assert.ok(property.startsWith("--") || paintProperties.has(property),
      `Non-color property in the palette layer: ${property}`);
  }
});
