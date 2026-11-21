import test from "node:test";
import assert from "node:assert/strict";
import { SLIDES } from "./slides.js";
import { createDeckState } from "./deck-state.js";
import { sampleCancerState } from "./cancer-illustration.js";

test("the medical talk contains eleven slides", () => {
  const deck = createDeckState(SLIDES);
  assert.equal(SLIDES.length, 11);
  assert.equal(deck.duration, 462000);
  assert.deepEqual(deck.starts, Array.from({ length: 11 }, (_, index) => index * 42000));
  assert.ok(SLIDES.every((slide) => (slide.bullets || []).length <= 3));
});

test("the pitch follows the requested order, with slide five introducing the prototype demo", () => {
  assert.deepEqual(SLIDES.map((slide) => slide.id), [
    "orefera", "problem", "impact", "solution", "product-demo",
    "market-competitors", "break-even", "business-model", "potential-collaboration", "team", "the-ask"
  ]);
  assert.equal(SLIDES[0].layout, "brand");
  assert.equal(SLIDES[0].title, "OREFERA");
  assert.equal(SLIDES[0].logo.src, "./assets/orefera-mark.png");
  assert.equal(SLIDES[4].eyebrow, "Product demo");
  assert.ok(SLIDES[4].bullets.length > 0);
  assert.match(SLIDES[3].note, /fictional data and pre-computed AI/);
  assert.match(SLIDES[7].body, /Hospitals pay a subscription/);
  assert.match(SLIDES[8].note, /not confirmed partnerships/);
  assert.equal(SLIDES[9].team.length, 6);
  assert.deepEqual(SLIDES[10].stat, {
    value: "10,000", unit: "JOD", label: "Implementation funding"
  });
});

test("all slide boundaries, out-of-range seeks, and the last hold resolve correctly", () => {
  const deck = createDeckState(SLIDES);
  deck.starts.forEach((start, index) => {
    assert.equal(deck.indexAt(start), index);
    if (index > 0) assert.equal(deck.indexAt(start - 1), index - 1);
  });
  assert.equal(deck.indexAt(-1), 0);
  assert.equal(deck.indexAt(NaN), 0);
  assert.equal(deck.indexAt(deck.duration), 10);
  assert.equal(deck.indexAt(deck.duration + 100), 10);
});

test("unequal slide lengths and a single-slide deck need no engine changes", () => {
  const slides = SLIDES.slice(0, 3).map((slide, index) => ({ ...slide, duration: index + 1 }));
  const deck = createDeckState(slides);
  assert.deepEqual(deck.starts, [0, 1000, 3000]);
  assert.equal(deck.duration, 6000);
  assert.equal(deck.indexAt(2999), 1);
  assert.equal(deck.indexAt(3000), 2);
  assert.equal(createDeckState([SLIDES[0]]).indexAt(42000), 0);
});

test("illustrative cancer sampling grows and regresses independently of talk duration", () => {
  const deck = createDeckState(SLIDES);
  deck.starts.forEach((start, index) => assert.equal(deck.cancerAt(start), SLIDES[index].cancerTime));
  const burdenAt = (time) => sampleCancerState(deck.cancerAt(time)).burden;
  assert.ok(burdenAt(3.5 * 42000) > burdenAt(3 * 42000));
  assert.ok(burdenAt(4.5 * 42000) < burdenAt(4 * 42000));
  assert.equal(deck.cancerAt(deck.duration), 45000);
  assert.equal(deck.cancerAt(-1), 0);
});

test("invalid deck edits fail explicitly", () => {
  assert.throws(() => createDeckState([]), /at least one/);
  assert.throws(() => createDeckState([SLIDES[0], SLIDES[0]]), /unique id/);
  for (const change of [
    { title: "" }, { duration: 0 }, { duration: NaN }, { view: { site: "overview", zoom: 0 } },
    { view: { site: 8, zoom: 1 } }, { cancerTime: 45001 }, { bullets: ["a", "b", "c", "d"] }
  ]) assert.throws(() => createDeckState([{ ...SLIDES[0], ...change }]));
});
