/**
 * Pure motion helpers for the colon journey (no three.js, so they can be unit tested).
 * The camera moves along a 1-D track (the portal into the colon, then the centerline).
 * Its position on the track follows a two-stage, critically damped spring: the target is
 * smoothed first, then followed. That gives an eased start, an eased stop, and seamless
 * retargeting when the presenter clicks again during a move (speed and position carry over).
 */
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Hermite smoothstep; works for a > b too (then it falls from 1 to 0). */
export function smoothstep(a, b, value) {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function createTrack(x = 0) {
  return { x, v: 0, f: x, fv: 0 };
}

/** Advance the track toward `target`; time-based, stable at any frame rate. */
export function stepTrack(track, target, dt, { omega = 2.3, maxSpeed = 7 } = {}) {
  const time = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.5));
  const steps = Math.max(1, Math.ceil(time * 240));
  const h = time / steps;
  for (let i = 0; i < steps; i += 1) {
    const filterAcceleration = omega * omega * (target - track.f) - 2 * omega * track.fv;
    track.fv += filterAcceleration * h;
    track.f += track.fv * h;
    const acceleration = omega * omega * (track.f - track.x) - 2 * omega * track.v;
    track.v = clamp(track.v + acceleration * h, -maxSpeed, maxSpeed);
    track.x += track.v * h;
  }
  return track;
}

/** True once the track has come to rest at the target. */
export function trackSettled(track, target, epsilon = 0.0015) {
  const speed = Math.max(0.01, epsilon * 3);
  return Math.abs(track.x - target) < epsilon && Math.abs(track.v) < speed &&
    Math.abs(track.f - target) < epsilon && Math.abs(track.fv) < speed;
}

/**
 * Re-base a track onto a new leg. `offset` is where the current position sits on the new leg
 * and `sign` is -1 when the new leg runs the other way. Position and speed are unchanged.
 */
export function rebaseTrack(track, offset, sign = 1) {
  const relativeFilter = track.f - track.x;
  track.x = offset;
  track.v *= sign;
  track.f = offset + relativeFilter * sign;
  track.fv *= sign;
  return track;
}

/**
 * Blend values for the portal (the move between outside and inside), from `remaining`, the
 * distance still to travel to the end of the colon along the portal curve (negative once inside).
 * inside: 0 outside .. 1 inside (lining, darkness, fog, headlight, heat fading out).
 * lens: 0 outside lens .. 1 endoscope lens. turn: 0 facing the colon .. 1 facing down the lumen.
 */
export function portalBlend(remaining) {
  const inside = 1 - smoothstep(-0.1, 1.1, remaining);
  return {
    inside,
    lens: smoothstep(2.8, -0.1, remaining),
    turn: smoothstep(2.7, 0.15, remaining),
    nearFade: 1 - inside
  };
}

/**
 * Check the journey configuration against the slides. Returns the findings ordered along the
 * colon. Throws a readable error for a broken edit.
 */
export function validateJourney(slides, findings, inside) {
  if (!Array.isArray(findings)) throw new Error("FINDINGS must be a list.");
  const ids = new Set();
  findings.forEach((finding, index) => {
    if (!finding.id || ids.has(finding.id)) throw new Error(`Finding ${index + 1} needs a unique id.`);
    if (!["polyp", "tumor"].includes(finding.kind)) throw new Error(`Finding ${finding.id} must be a polyp or a tumor.`);
    if (!Number.isFinite(finding.at) || finding.at < 0.02 || finding.at > 0.97) throw new Error(`Finding ${finding.id} needs "at" between 0.02 and 0.97.`);
    if (!Number.isFinite(finding.sizeMm) || finding.sizeMm <= 0 || finding.sizeMm > 80) throw new Error(`Finding ${finding.id} needs a size between 0 and 80 mm.`);
    ids.add(finding.id);
  });
  const slideIds = new Set(slides.map((slide) => slide.id));
  for (const [slideId, findingId] of Object.entries(inside || {})) {
    if (!slideIds.has(slideId)) throw new Error(`INSIDE refers to an unknown slide: ${slideId}.`);
    if (!ids.has(findingId)) throw new Error(`INSIDE refers to an unknown finding: ${findingId}.`);
  }
  return [...findings].sort((a, b) => a.at - b.at);
}
