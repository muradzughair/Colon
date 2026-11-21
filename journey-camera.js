import { createTrack, stepTrack, trackSettled, rebaseTrack, portalBlend, smoothstep } from "./journey-motion.js";

/*
 * Moves the one presentation camera between the outside views and the stops inside the colon.
 * A move is a "leg": a list of parts laid end to end on one 1-D track.
 *   - "in": the portal from an outside pose to just inside one end of the colon,
 *   - "path": along the centerline from one distance to another,
 *   - "out": a portal played backwards, from inside one end to an outside pose.
 * The position on the track follows a smooth spring (journey-motion.js), so moves ease in and
 * out, and a click during a move re-plans from where the camera is, at the speed it has.
 * Going forward the camera enters at the cecum and leaves through the rectum. Going back plays
 * the same moves in reverse. Inside, the camera always faces down the colon (cecum to rectum).
 */
const ENTRY = 0.16; // how far inside the colon a portal ends, in scene units
const MAX_TURN = 110 * Math.PI / 180; // fastest camera rotation, radians per second

export function createJourneyCamera(THREE, journey, { fovOut, fovIn }) {
  const track = createTrack();
  let leg = null;
  let target = 0;
  let turn = 0;
  let focusedId = null;
  const lookedAt = new THREE.Vector3();
  const desired = new THREE.Quaternion();
  const outsideQ = new THREE.Quaternion();
  const lookMatrix = new THREE.Matrix4();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const state = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    inside: 0,
    lens: 0,
    nearFade: 0,
    onPath: false,
    s: 0,
    sway: 0
  };
  let hasOrientation = false;

  function buildPortal(end, pose) {
    const sEnd = end === 0 ? 0 : journey.length;
    const sInside = end === 0 ? ENTRY : journey.length - ENTRY;
    const endPoint = journey.pointAt(sEnd);
    const outward = journey.tangentAt(sEnd).multiplyScalar(end === 0 ? -1 : 1);
    const front = new THREE.Vector3(0, 0, 1);
    // Approach from in front of and beyond the end of the colon, then glide in along it.
    const approach = endPoint.clone().addScaledVector(outward, 0.5).addScaledVector(front, 0.42);
    const middle = pose.position.clone().lerp(approach, 0.62).addScaledVector(front, 0.25);
    const curve = new THREE.CatmullRomCurve3([
      pose.position.clone(), middle, approach, endPoint.clone(), journey.pointAt(sInside)
    ], false, "centripetal");
    curve.arcLengthDivisions = 600;
    const lengths = curve.getLengths(600);
    const length = lengths[600];
    const endArc = lengths[Math.round(600 * 3 / 4)]; // control point 3 of 5 = the colon's end
    // Track distance per unit of real distance: up to 3x near the wall, so the camera slows down
    // to pass through it and to turn, and exactly 1 where the portal meets the centerline.
    const track = new Float32Array(601);
    for (let i = 1; i <= 600; i += 1) {
      const remaining = endArc - (lengths[i] + lengths[i - 1]) / 2;
      const weight = 1 + 2.2 * smoothstep(-ENTRY, 0.3, remaining) * (1 - smoothstep(0.7, 3.2, remaining));
      track[i] = track[i - 1] + weight * (lengths[i] - lengths[i - 1]);
    }
    const arcAt = (q) => {
      if (q <= 0) return 0;
      if (q >= track[600]) return length;
      let lo = 0, hi = 600;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (track[mid] <= q) lo = mid; else hi = mid; }
      const f = (q - track[lo]) / Math.max(1e-9, track[hi] - track[lo]);
      return lengths[lo] + f * (lengths[hi] - lengths[lo]);
    };
    const insideQ = journey.orientationAt(sInside, journey.pointAt(sInside), null, 0);
    return { end, sInside, curve, length, trackLength: track[600], arcAt, endArc, pose: { position: pose.position.clone(), look: pose.look.clone() }, insideQ };
  }

  const pathPart = (from, to) => ({ type: "path", from, to, sign: to >= from ? 1 : -1, length: Math.abs(to - from) });
  const legLength = (parts) => parts.reduce((sum, part) => sum + part.length, 0);

  function locate(x = track.x) {
    let local = x;
    for (let i = 0; i < leg.parts.length; i += 1) {
      const part = leg.parts[i];
      if (local <= part.length || i === leg.parts.length - 1) return { part, index: i, local: Math.min(Math.max(local, 0), part.length) };
      local -= part.length;
    }
    return null;
  }

  function evaluatePortal(portal, trackDistance) {
    const q = portal.arcAt(trackDistance);
    portal.curve.getPointAt(Math.min(1, Math.max(0, q / portal.length)), state.position);
    const blend = portalBlend(portal.endArc - q);
    lookMatrix.lookAt(state.position, portal.pose.look, worldUp);
    outsideQ.setFromRotationMatrix(lookMatrix);
    desired.slerpQuaternions(outsideQ, portal.insideQ, blend.turn);
    state.inside = blend.inside;
    state.lens = blend.lens;
    state.nearFade = blend.nearFade;
    state.onPath = false;
    state.sway = blend.inside * blend.inside;
    state.s = portal.end === 0 ? 0 : journey.length;
  }

  function evaluate() {
    const where = locate();
    const { part, local } = where;
    if (part.type === "path") {
      const s = part.from + part.sign * local;
      journey.pointAt(s, state.position);
      journey.orientationAt(s, state.position, turn > 0.0001 ? lookedAt : null, turn, desired);
      state.inside = 1;
      state.lens = 1;
      state.nearFade = 0;
      state.onPath = true;
      state.sway = 1;
      state.s = s;
    } else {
      evaluatePortal(part.portal, part.type === "in" ? local : part.length - local);
    }
  }

  function startLeg(parts, extra = {}) {
    leg = { parts, length: legLength(parts), focus: null, outsidePose: null, onArrive: null, ...extra };
    target = leg.length;
  }

  /** Is the camera handled by the journey (inside, or moving through a portal)? */
  const active = () => leg !== null;

  /** Fly to a finding's stop. `from` is the outside pose when starting outside. */
  function goInside(finding, direction, from) {
    const stop = finding.viewS;
    if (!leg) {
      const portal = buildPortal(direction >= 0 ? 0 : 1, from);
      startLeg([{ type: "in", portal, length: portal.trackLength }, pathPart(portal.sInside, stop)], { focus: finding });
      Object.assign(track, createTrack());
      hasOrientation = false;
      return;
    }
    const { part, index, local } = locate();
    if (part.type === "path") {
      const s = part.from + part.sign * local;
      const next = pathPart(s, stop);
      rebaseTrack(track, 0, part.sign * next.sign);
      startLeg([next], { focus: finding });
    } else if (part.type === "in" && index === 0) {
      startLeg([part, pathPart(part.portal.sInside, stop)], { focus: finding });
    } else {
      // Leaving through a portal: turn back in along the same portal.
      const q = part.length - local;
      rebaseTrack(track, q, -1);
      startLeg([{ type: "in", portal: part.portal, length: part.portal.trackLength }, pathPart(part.portal.sInside, stop)], { focus: finding });
    }
  }

  /** Leave the colon toward an outside pose, then call `onArrive` when the camera is there. */
  function goOutside(pose, direction, onArrive) {
    if (!leg) return false;
    const { part, index, local } = locate();
    if (part.type === "path") {
      const s = part.from + part.sign * local;
      const portal = buildPortal(direction >= 0 ? 1 : 0, pose);
      const toEnd = pathPart(s, portal.sInside);
      rebaseTrack(track, 0, part.sign * toEnd.sign);
      startLeg([toEnd, { type: "out", portal, length: portal.trackLength }], { outsidePose: portal.pose, onArrive });
    } else if (part.type === "in" && index === 0) {
      // Still on the way in: go back out the same way (then fly on if the view differs).
      rebaseTrack(track, part.length - local, -1);
      startLeg([{ type: "out", portal: part.portal, length: part.portal.trackLength }], { outsidePose: part.portal.pose, onArrive });
    } else {
      leg.onArrive = onArrive;
    }
    return true;
  }

  /** Jump straight to a finding's stop (scrubbing, reduced motion). */
  function snapInside(finding) {
    startLeg([pathPart(finding.viewS, finding.viewS)], { focus: finding });
    Object.assign(track, createTrack());
    turn = 1;
    focusedId = finding.id;
    lookedAt.copy(finding.point);
    hasOrientation = false;
  }

  function clear() {
    leg = null;
    turn = 0;
    focusedId = null;
    hasOrientation = false;
  }

  /**
   * Advance by dt seconds. Returns the camera state (pivot space), or { arrived } when an "out"
   * leg has reached its outside pose (the caller hands the camera back to the outside views).
   */
  function update(dt) {
    if (!leg) return null;
    stepTrack(track, target, dt);
    // Turn toward the finding when nearly at its stop; turn back when moving on. A new finding
    // is only taken once the view has let go of the previous one (no whip-around).
    const remaining = Math.abs(target - track.x);
    const last = leg.parts[leg.parts.length - 1];
    const focus = leg.focus && last.type === "path" ? leg.focus : null;
    if (focus && focusedId !== focus.id && turn < 0.03) {
      focusedId = focus.id;
      lookedAt.copy(focus.point);
    }
    const wantTurn = focus && focusedId === focus.id ? 1 - smoothstep(0.1, 0.85, remaining) : 0;
    turn += (wantTurn - turn) * Math.min(1, dt * (wantTurn > turn ? 2.2 : 1.6));
    evaluate();
    // Rotation follows smoothly and never faster than MAX_TURN, like a camera operator panning:
    // joins between parts never snap, and passing close to the colon never whips the view.
    if (!hasOrientation) { state.quaternion.copy(desired); hasOrientation = true; }
    else {
      const angle = state.quaternion.angleTo(desired);
      state.quaternion.rotateTowards(desired, Math.min(angle * (1 - Math.exp(-dt * 9)), MAX_TURN * dt));
    }
    if (last.type === "out" && trackSettled(track, target, 0.012) && state.quaternion.angleTo(desired) < 0.003) {
      const onArrive = leg.onArrive;
      const pose = leg.outsidePose;
      leg = null;
      return { arrived: true, onArrive: () => onArrive?.(pose), pose };
    }
    return state;
  }

  return {
    active, goInside, goOutside, snapInside, clear, update, state, fovOut, fovIn,
    get focus() { return leg?.focus ?? null; },
    get moving() { return leg !== null && !trackSettled(track, target, 0.004); }
  };
}
