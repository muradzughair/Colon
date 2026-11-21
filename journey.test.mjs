import test from "node:test";
import assert from "node:assert/strict";
import { SLIDES } from "./slides.js";
import { FINDINGS, INSIDE } from "./journey.js";
import { createTrack, stepTrack, trackSettled, rebaseTrack, portalBlend, smoothstep, validateJourney } from "./journey-motion.js";

test("the journey starts outside, goes inside in the middle, and ends outside", () => {
  const inside = SLIDES.map((slide) => Boolean(INSIDE[slide.id]));
  assert.equal(inside[0], false, "the talk opens outside the colon");
  assert.equal(inside.at(-1), false, "the talk ends outside the colon");
  const first = inside.indexOf(true);
  const last = inside.lastIndexOf(true);
  assert.ok(first > 0 && last < SLIDES.length - 1);
  assert.ok(inside.slice(first, last + 1).every(Boolean), "inside slides are one continuous stretch");
});

test("inside stops visit the findings in order along the colon, polyps before the tumor", () => {
  const ordered = validateJourney(SLIDES, FINDINGS, INSIDE);
  const stops = SLIDES.filter((slide) => INSIDE[slide.id]).map((slide) => ordered.find((f) => f.id === INSIDE[slide.id]));
  for (let i = 1; i < stops.length; i += 1) assert.ok(stops[i].at > stops[i - 1].at);
  assert.equal(stops.at(-1).kind, "tumor");
  assert.ok(stops.slice(0, -1).every((finding) => finding.kind === "polyp"));
});

test("broken journey edits fail with a readable message", () => {
  assert.throws(() => validateJourney(SLIDES, [...FINDINGS, FINDINGS[0]], INSIDE), /unique id/);
  assert.throws(() => validateJourney(SLIDES, [{ ...FINDINGS[0], kind: "cyst" }], {}), /polyp or a tumor/);
  assert.throws(() => validateJourney(SLIDES, [{ ...FINDINGS[0], at: 1.2 }], {}), /"at"/);
  assert.throws(() => validateJourney(SLIDES, FINDINGS, { "no-such-slide": "tumor" }), /unknown slide/);
  assert.throws(() => validateJourney(SLIDES, FINDINGS, { solution: "nope" }), /unknown finding/);
});

test("the track eases in and out, reaches its target, and never overshoots", () => {
  const track = createTrack();
  let previous = 0, maxStep = 0, previousStep = 0, maxChange = 0;
  for (let frame = 0; frame < 60 * 8; frame += 1) {
    stepTrack(track, 10, 1 / 60);
    const step = track.x - previous;
    assert.ok(step >= -1e-9, "moves only forward");
    assert.ok(track.x <= 10 + 1e-6, "no overshoot");
    maxStep = Math.max(maxStep, step);
    if (frame > 0) maxChange = Math.max(maxChange, Math.abs(step - previousStep));
    previousStep = step;
    previous = track.x;
  }
  assert.ok(trackSettled(track, 10, 0.01));
  assert.ok(maxChange < maxStep * 0.05, "speed changes gradually (eased start and stop)");
});

test("a click during a move re-plans without a jump in position or speed", () => {
  const track = createTrack();
  for (let frame = 0; frame < 50; frame += 1) stepTrack(track, 6, 1 / 60);
  const before = { x: track.x, v: track.v };
  rebaseTrack(track, 2.5, -1); // same place, now on a leg that runs the other way
  assert.equal(track.x, 2.5);
  assert.equal(track.v, -before.v);
  const atRebase = track.x;
  stepTrack(track, 0, 1 / 60);
  assert.ok(Math.abs(track.x - atRebase) < Math.abs(before.v) / 60 * 1.5, "continues at the speed it had");
});

test("frame rate does not change the motion", () => {
  const fast = createTrack(), slow = createTrack();
  for (let i = 0; i < 240; i += 1) stepTrack(fast, 5, 1 / 120);
  for (let i = 0; i < 60; i += 1) stepTrack(slow, 5, 1 / 30);
  assert.ok(Math.abs(fast.x - slow.x) < 0.01);
});

test("the portal blends outside to inside smoothly and completely", () => {
  const far = portalBlend(6), wall = portalBlend(0.4), deep = portalBlend(-0.2);
  assert.deepEqual([far.inside, far.lens, far.turn], [0, 0, 0]);
  assert.ok(wall.inside > 0 && wall.inside < 1);
  assert.deepEqual([deep.inside, deep.lens, deep.turn, deep.nearFade], [1, 1, 1, 0]);
  for (let r = 6; r > -0.2; r -= 0.01) {
    const a = portalBlend(r), b = portalBlend(r - 0.01);
    assert.ok(b.inside >= a.inside - 1e-12 && b.inside - a.inside < 0.03, "inside never jumps");
  }
  assert.equal(smoothstep(1, 0, 0.5), 0.5);
});
