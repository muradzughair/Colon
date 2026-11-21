import test from "node:test";
import assert from "node:assert/strict";
import { sampleCameraMotion } from "./camera-motion.js";

test("ambient motion starts at the precise flight destination without a jump", () => {
  assert.deepEqual(sampleCameraMotion(0), { heading: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 });
  assert.deepEqual(sampleCameraMotion(-1), sampleCameraMotion(0));
  assert.deepEqual(sampleCameraMotion(NaN), sampleCameraMotion(0));
  assert.ok(Math.abs(sampleCameraMotion(.001).heading) < .00001);
});

test("orbit and dolly remain bounded across a full seven-minute presentation", () => {
  for (let t = 0; t <= 420; t += .17) {
    const motion = sampleCameraMotion(t, 1.5);
    assert.ok(Math.abs(motion.heading) <= 27);
    assert.ok(Math.abs(motion.tilt) <= 10.5);
    assert.ok(motion.zoom >= 1 && motion.zoom <= 1.150001);
    assert.ok(Math.abs(motion.panX) <= .052501);
    assert.ok(Math.abs(motion.panY) <= .075001);
  }
  assert.notDeepEqual(sampleCameraMotion(5), sampleCameraMotion(10));
  assert.deepEqual(sampleCameraMotion(20, 0), { heading: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 });
});
