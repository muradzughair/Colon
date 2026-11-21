/**
 * Bounded camera offsets, never clinical values. The reveal starts at rest,
 * making it safe to blend in after a chapter flight without a camera jump.
 * Advance seconds only while presentation motion is enabled.
 */
export function sampleCameraMotion(seconds, strength = 1) {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const amount = Math.max(0, Math.min(1.5, Number.isFinite(strength) ? strength : 1));
  if (!time || !amount) return { heading: 0, tilt: 0, zoom: 1, panX: 0, panY: 0 };
  const progress = Math.min(1, time / 3);
  const reveal = progress * progress * (3 - 2 * progress);
  return {
    heading: Math.sin(time * .42) * 18 * amount * reveal,
    tilt: Math.sin(time * .29) * 7 * amount * reveal,
    zoom: 1 + (1 - Math.cos(time * .36)) * .05 * amount * reveal,
    panX: Math.sin(time * .2) * .035 * amount * reveal,
    panY: Math.sin(time * .25) * .05 * amount * reveal
  };
}
