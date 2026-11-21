import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createCancerIllustration, sampleCancerState } from "./cancer-illustration.js";
import { SLIDES } from "./slides.js";
import { FINDINGS, INSIDE } from "./journey.js";
import { createColonJourney } from "./colon-journey.js";
import { createJourneyCamera } from "./journey-camera.js";
import { validateJourney } from "./journey-motion.js";
import { createDeckState } from "./deck-state.js";
import { renderSlide, fitSlideContent } from "./deck-content.js";
import { sampleCameraMotion } from "./camera-motion.js";

const presentation = document.querySelector("#presentation");
const viewport = document.querySelector("#model-view");
const deck = createDeckState(SLIDES);
const markerContainer = document.querySelector(".stage-markers");
markerContainer.replaceChildren();
const markers = SLIDES.map((slide, index) => {
  const button = document.createElement("button");
  button.className = "stage-marker";
  button.type = "button";
  button.style.left = `${deck.starts[index] / deck.duration * 100}%`;
  button.setAttribute("aria-label", `Go to slide ${index + 1}: ${slide.title}`);
  button.title = `${index + 1}. ${slide.title}`;
  markerContainer.append(button);
  return button;
});
const playButton = document.querySelector(".playback-toggle");
const restartButton = document.querySelector(".restart");
const fullscreenButton = document.querySelector(".fullscreen-toggle");
const previousButton = document.querySelector(".previous");
const nextButton = document.querySelector(".next");
const seekInput = document.querySelector(".timeline-seek");
const timelineFill = document.querySelector(".timeline-fill");
const restoreButton = document.querySelector(".chrome-restore");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const duration = deck.duration;
const stageTimes = deck.starts;
seekInput.max = String(duration);
presentation.dataset.duration = String(duration);
presentation.dataset.slideCount = String(SLIDES.length);
const journeyOrder = validateJourney(SLIDES, FINDINGS, INSIDE);
const scene = new THREE.Scene();
// One perspective camera for the whole talk. Outside it uses a narrow lens, which frames the
// colon like the earlier flat (orthographic) view; for the dive it widens to an endoscope lens.
const FOV_OUT = 20;
const FOV_IN = 66;
const camera = new THREE.PerspectiveCamera(FOV_OUT, 1, 0.05, 100);
const zoomScale = 2 / Math.tan(THREE.MathUtils.degToRad(FOV_OUT / 2)); // zoom z shows 4/z units of height
const distanceForZoom = (zoom) => zoomScale / Math.max(.01, zoom);
camera.position.set(0, 0, distanceForZoom(1));
scene.add(camera);
// The endoscope's own light: off outside, fades in inside the colon.
const headlight = new THREE.PointLight(0xfff2ea, 0, 1.6, 2);
camera.add(headlight);
scene.fog = new THREE.Fog(0x050103, 60, 100);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setClearColor(0x050103, 0);
viewport.appendChild(renderer.domElement);

const hemisphereLight = new THREE.HemisphereLight(0xfff7f1, 0x783b4a, 2.1);
scene.add(hemisphereLight);
const keyLight = new THREE.DirectionalLight(0xfff1e9, 3.3);
keyLight.position.set(-2.5, 3.4, 4.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffa18e, 1.15);
fillLight.position.set(3.2, -1.2, 2.6);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffd7c8, 2.15);
rimLight.position.set(.4, 2.6, -3.4);
scene.add(rimLight);
const softFront = new THREE.PointLight(0xffe7dd, .55, 9);
softFront.position.set(0, .5, 3);
scene.add(softFront);
const roomLights = [hemisphereLight, keyLight, fillLight, rimLight, softFront];
roomLights.forEach((light) => { light.userData.baseIntensity = light.intensity; });

const modelRoot = new THREE.Group();
const modelPivot = new THREE.Group();
scene.add(modelPivot);
modelPivot.add(modelRoot);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !motionPreference.matches;
controls.dampingFactor = .065;
controls.enablePan = false;
controls.enableZoom = true;
// Phone stage fits can be below .72; a larger minimum silently overrides them.
controls.minDistance = distanceForZoom(5.5);
controls.maxDistance = distanceForZoom(.15);
controls.zoomSpeed = .65;
controls.rotateSpeed = .62;
controls.target.set(0, 0, 0);

const requestedSlide = SLIDES.findIndex((slide) => location.hash === `#${slide.id}` || location.hash === `#${encodeURIComponent(slide.id)}`);
let timelineTime = stageTimes[Math.max(0, requestedSlide)];
let motionEnabled = !motionPreference.matches;
let hasLoadedModel = false;
let userInteracting = false;
let frameId = 0;
let previousFrame = 0;
let updateLesions = () => {};
let anchors = [];
let flight = null;
let currentStage = deck.indexAt(timelineTime);
let flightSequence = 0;
let renderedStage = -1;
let focusLabels = [];
let visualState = sampleCancerState(deck.cancerAt(timelineTime), 45000);
let motionSeconds = 0;
let ambientBase = null;
let inspectionLocked = false;
let inspectionResumeAt = 0;
let sceneCenterX = .73;
let sceneCenterY = .48;
let sceneHeight = .7;
const regionNames = ["Transverse colon", "Ascending colon", "Descending colon", "Sigmoid colon"];
const cameraEndDirection = new THREE.Vector3(0, 0, 8);
const modelSize = new THREE.Vector3(1.75, 2.05, 1);
// Colon journey (built when the model loads): the inside stops and the camera that flies there.
let journey = null;
let journeyCamera = null;
let findingsById = new Map();
let insideAmount = 0;
let lastOutsideZoom = 1;
const scratchVector = new THREE.Vector3();
const pivotQuaternion = new THREE.Quaternion();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function currentZoom() {
  return zoomScale / Math.max(.001, camera.position.distanceTo(controls.target));
}
/** The finding a slide stops at inside the colon, or null for an outside slide. */
function insideFinding(index) {
  const id = INSIDE[SLIDES[index]?.id];
  return id && findingsById.get(id) || null;
}
/** The outside camera pose of a slide (pivot space), for the camera leaving the colon. */
function outsidePose(index) {
  const destination = targetForStage(index);
  return {
    position: destination.point.clone().addScaledVector(destination.direction.clone().normalize(), distanceForZoom(destination.zoom)),
    look: destination.point.clone()
  };
}
/** Hand the camera back to the outside views (orbit controls, ambient drift). */
let appliedCenter = "";
function setSceneCenter(x, y) {
  const key = `${x.toFixed(4)},${y.toFixed(4)}`;
  if (key === appliedCenter) return;
  appliedCenter = key;
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  camera.setViewOffset(width, height, width * (.5 - x), height * (.5 - y), width, height);
}
function leaveJourney() {
  journeyCamera?.clear();
  setSceneCenter(sceneCenterX, sceneCenterY);
  controls.enabled = true;
  camera.fov = FOV_OUT;
  camera.near = .05;
  camera.updateProjectionMatrix();
}
function easeInOut(value) {
  return value * value * (3 - 2 * value);
}
function stageForTime(time) {
  return deck.indexAt(time);
}
function anchorWorld(siteIndex) {
  const anchor = anchors[siteIndex];
  return anchor ? modelRoot.localToWorld(anchor.clone()) : new THREE.Vector3();
}
function targetForStage(index) {
  const portrait = window.matchMedia("(max-width: 767px)").matches;
  const aspect = Math.max(1, viewport.clientWidth) / Math.max(1, viewport.clientHeight);
  const view = SLIDES[index].view;
  let point = new THREE.Vector3();
  if (typeof view.site === "number") point = anchorWorld(view.site);
  else if (view.site === "regional") {
    point = [1, 2, 3].reduce((sum, site) => sum.add(anchorWorld(site)), new THREE.Vector3()).multiplyScalar(1 / 3);
  }
  if (view.offset) point.add(new THREE.Vector3(...view.offset));
  const fit = Math.min(1.3, 4 * aspect * (portrait ? .86 : .43) / modelSize.x, 4 * sceneHeight * .88 / modelSize.y);
  const zoom = portrait ? (view.mobileZoom === "fit" ? fit : Math.min(view.mobileZoom ?? view.zoom, fit * 2.15)) : view.zoom;
  const direction = cameraEndDirection.clone().applyEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(view.tilt || 0), THREE.MathUtils.degToRad(view.heading || 0), 0, "YXZ"
  ));
  return { point, zoom, direction };
}
function setCameraPose(point, zoom, direction = cameraEndDirection) {
  controls.target.copy(point);
  camera.position.copy(point).addScaledVector(scratchVector.copy(direction).normalize(), distanceForZoom(zoom));
  controls.update();
}
function flyToStage(index, instant = false, previousIndex = index) {
  if (!hasLoadedModel) return;
  const snap = instant || motionPreference.matches;
  const direction = Math.sign(index - previousIndex) || 1;
  const finding = insideFinding(index);
  // Inside the colon, or going there: the journey camera takes over.
  if (journeyCamera && (finding || journeyCamera.active())) {
    flight = null;
    inspectionLocked = false;
    presentation.dataset.cameraFlight = "0";
    if (finding) {
      controls.enabled = false;
      if (snap) journeyCamera.snapInside(finding);
      else journeyCamera.goInside(finding, direction, journeyCamera.active() ? null : { position: camera.position.clone(), look: controls.target.clone() });
      return;
    }
    if (snap) {
      leaveJourney();
    } else {
      journeyCamera.goOutside(outsidePose(index), direction, (arrivedAt) => {
        leaveJourney();
        // Arrived at the slide's own view: settle there. A different slide was chosen meanwhile: fly on.
        const wanted = outsidePose(currentStage);
        const same = arrivedAt && arrivedAt.position.distanceTo(wanted.position) < .01;
        if (!same) {
          controls.target.copy(arrivedAt?.look ?? controls.target);
          controls.update();
        }
        flyToStage(currentStage, same, currentStage);
      });
      return;
    }
  }
  const destination = targetForStage(index);
  ambientBase = destination;
  motionSeconds = 0;
  inspectionLocked = false;
  flight = null;
  if (snap) {
    setCameraPose(destination.point, destination.zoom, destination.direction);
    presentation.dataset.cameraFlight = "0";
    return;
  }
  const fromTarget = controls.target.clone();
  const fromPosition = camera.position.clone();
  const fromDirection = fromPosition.sub(fromTarget);
  const fromZoom = currentZoom();
  const distance = fromTarget.distanceTo(destination.point);
  const zoomDistance = Math.abs(Math.log(Math.max(.01, destination.zoom / Math.max(.01, fromZoom))));
  const seconds = clamp(1.7 + distance * .65 + zoomDistance * .25, 1.9, 3.1);
  flight = {
    fromTarget,
    toTarget: destination.point.clone(),
    fromDirection,
    toDirection: destination.direction.clone(),
    fromZoom,
    toZoom: destination.zoom,
    elapsed: 0,
    duration: seconds * 1000,
    id: ++flightSequence
  };
  presentation.dataset.cameraFlight = "0";
}
function updateFlight(delta) {
  if (!flight) {
    presentation.dataset.cameraFlight = "0";
    return;
  }
  flight.elapsed = Math.min(flight.duration, flight.elapsed + delta * 1000);
  const raw = flight.elapsed / flight.duration;
  const eased = easeInOut(raw);
  const arc = Math.sin(Math.PI * raw);
  const target = flight.fromTarget.clone().lerp(flight.toTarget, eased);
  target.y += arc * Math.min(.12, flight.fromTarget.distanceTo(flight.toTarget) * .055);
  const direction = flight.fromDirection.clone().lerp(flight.toDirection, eased);
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), arc * .16 * (flight.id % 2 ? 1 : -1));
  const zoom = Math.exp(Math.log(Math.max(.01, flight.fromZoom)) * (1 - eased) + Math.log(Math.max(.01, flight.toZoom)) * eased) * (1 - arc * .1);
  setCameraPose(target, zoom, direction);
  presentation.dataset.cameraFlight = raw.toFixed(3);
  if (raw >= 1) {
    const destination = flight.toTarget.clone();
    const finalZoom = flight.toZoom;
    const finalDirection = flight.toDirection.clone();
    flight = null;
    setCameraPose(destination, finalZoom, finalDirection);
    presentation.dataset.cameraFlight = "0";
  }
}
function updateAmbientCamera(delta) {
  if (!hasLoadedModel || !motionEnabled || flight || userInteracting || inspectionLocked || !ambientBase) return;
  motionSeconds += delta;
  const motion = sampleCameraMotion(motionSeconds, SLIDES[currentStage].motion ?? 1);
  const point = ambientBase.point.clone();
  point.x += motion.panX;
  point.y += motion.panY;
  const direction = ambientBase.direction.clone().applyEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(motion.tilt), THREE.MathUtils.degToRad(motion.heading), 0, "YXZ"
  ));
  setCameraPose(point, ambientBase.zoom * motion.zoom, direction);
}
function updateCameraDataset() {
  const inJourney = journeyCamera?.active();
  if (!inJourney) lastOutsideZoom = currentZoom();
  const zoom = lastOutsideZoom;
  presentation.dataset.cameraZoom = zoom.toFixed(2);
  const idleMotion = motionEnabled && !motionPreference.matches ? "ambient" : "still";
  presentation.dataset.cameraMotion = inJourney ? (journeyCamera.moving ? "journey" : idleMotion)
    : flight ? "flight" : motionEnabled && !userInteracting && !inspectionLocked ? "ambient" : "still";
  presentation.dataset.cameraPosition = camera.position.toArray().map(value => value.toFixed(3)).join(",");
  presentation.dataset.inside = insideAmount.toFixed(2);
  const zoomLabel = document.querySelector("#camera-zoom");
  if (zoomLabel) zoomLabel.textContent = insideAmount > .5 ? "Lumen" : `${zoom.toFixed(1)}×`;
  const region = document.querySelector("#camera-region");
  if (region && inJourney && insideAmount > .5) region.textContent = `Inside · ${journey.segmentAt(journeyCamera.state.s)}`;
  else if (region && renderedStage >= 0) region.textContent = regionLabel(SLIDES[renderedStage]);
}
function regionLabel(slide) {
  return typeof slide.view.site === "number" ? regionNames[slide.view.site] : slide.view.site === "regional" ? "Regional view" : "Whole colon";
}
function updateSlideContent(index) {
  if (index === renderedStage) return;
  renderedStage = index;
  const slide = SLIDES[index];
  renderSlide(slide, { index, total: SLIDES.length });
  fitSlideContent();
  const counter = document.querySelector("#slide-counter");
  if (counter) counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(SLIDES.length).padStart(2, "0")}`;
  const overlay = document.querySelector("#anatomy-markers");
  overlay.replaceChildren();
  // Outside, the heat map and its legend mark the findings (no pins). Inside, the finding of
  // the stop gets a label. Slides may still add their own `markers` for an outside view.
  const finding = insideFinding(index);
  const annotations = slide.layout === "blank" ? [] : finding
    ? [{ finding, label: finding.label, detail: `${finding.segment} · ${finding.sizeMm} mm · illustrative` }]
    : (slide.markers || []).map(({ site, label }) => ({ site, label, detail: `${regionNames[site]} · illustrative` }));
  focusLabels = annotations.map(({ site, finding, label, detail: detailText }) => {
    const element = document.createElement("span");
    element.className = finding ? `anatomy-marker anatomy-marker-${finding.kind}` : "anatomy-marker";
    if (site !== undefined) element.dataset.site = String(site);
    if (finding) element.dataset.finding = finding.id;
    const ring = document.createElement("i");
    ring.className = "marker-ring";
    ring.setAttribute("aria-hidden", "true");
    const leader = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    leader.classList.add("marker-leader");
    leader.setAttribute("aria-hidden", "true");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    leader.append(line);
    const caption = document.createElement("span");
    const title = document.createElement("b");
    title.textContent = label;
    const detail = document.createElement("small");
    detail.textContent = detailText;
    caption.append(title, detail);
    element.append(leader, ring, caption);
    element.hidden = true;
    overlay.append(element);
    return { element, caption, line, site, finding };
  });
  keyLight.intensity = { day: 3.3, dusk: 2.7, night: 1.6 }[slide.sun || "day"] ?? 3.3;
  presentation.dataset.slideId = slide.id;
  try { history.replaceState(null, "", `#${slide.id}`); } catch {}
}
function updateFocusLabels() {
  modelRoot.updateWorldMatrix(true, false);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(modelRoot.matrixWorld);
  const panel = document.querySelector("#slide-panel").getBoundingClientRect();
  const occupied = [];
  focusLabels.forEach(({ element, caption, line, site, finding }) => {
    const worldPoint = finding ? finding.point.clone().applyMatrix4(modelPivot.matrixWorld) : anchorWorld(site);
    const point = worldPoint.clone().project(camera);
    const x = (point.x + 1) * viewport.clientWidth / 2;
    const y = (1 - point.y) * viewport.clientHeight / 2;
    element.style.transform = `translate(${x}px, ${y}px)`;
    const underCopy = x > panel.left && x < panel.right && y > panel.top && y < panel.bottom;
    const offScreen = point.z < -1 || point.z > 1 || x < 12 || x > viewport.clientWidth - 12 || y < 75;
    if (finding) {
      // Inside: only near the finding, facing it, and with no fold of the wall in between.
      const near = camera.position.distanceTo(worldPoint) < .85;
      const facing = finding.inward.dot(scratchVector.copy(camera.position).sub(worldPoint)) > 0;
      element.hidden = !journeyCamera?.active() || insideAmount < .92 || !near || !facing || underCopy || offScreen ||
        y > viewport.clientHeight - 100 || !journey.isVisibleFrom(camera.position, worldPoint);
    } else {
      const normal = modelRoot.userData.cancerNormals?.[site]?.clone().applyMatrix3(normalMatrix).normalize();
      const backFacing = normal && normal.dot(camera.position.clone().sub(worldPoint).normalize()) < .08;
      element.hidden = !hasLoadedModel || insideAmount > .05 || !anchors[site] || backFacing || underCopy || offScreen ||
        y > Math.min(viewport.clientHeight - 92, viewport.clientHeight * (sceneCenterY + sceneHeight / 2));
    }
    if (element.hidden) return;
    const bottomLimit = finding ? viewport.clientHeight - 100 : viewport.clientHeight * (sceneCenterY + sceneHeight / 2);
    // Move the caption, never the actual surface target. Keep callouts apart.
    const width = caption.offsetWidth || 150;
    const height = caption.offsetHeight || 40;
    let dx = x + width + 22 > viewport.clientWidth - 12 ? -width - 16 : 16;
    if (dx < 0 && x + dx < panel.right + 8 && y > panel.top && innerWidth > 767) dx = 16;
    dx = clamp(dx, 12 - x, viewport.clientWidth - width - 12 - x);
    let dy = -height - 18;
    if (y + dy < 78) dy = 18;
    for (const other of occupied) {
      if (x + dx < other.right + 8 && x + dx + width > other.left - 8 &&
          y + dy < other.bottom + 8 && y + dy + height > other.top - 8) dy = other.bottom + 10 - y;
    }
    dy = clamp(dy, 77 - y, Math.max(77 - y, bottomLimit - height - y));
    caption.style.translate = `${dx}px ${dy}px`;
    line.setAttribute("x2", String(dx >= 0 ? dx : dx + width));
    line.setAttribute("y2", String(dy + height / 2));
    occupied.push({ left: x + dx, right: x + dx + width, top: y + dy, bottom: y + dy + height });
  });
}
function updateTimelineControls() {
  seekInput.value = String(Math.round(timelineTime));
  const fraction = timelineTime / duration;
  timelineFill.style.width = `calc(${fraction * 100}% - ${fraction * 16}px)`;
  const stageIndex = stageForTime(timelineTime);
  previousButton.disabled = stageIndex === 0;
  nextButton.disabled = stageIndex === markers.length - 1;
  markers.forEach((marker, index) => {
    marker.classList.toggle("is-active", index === stageIndex);
    if (index === stageIndex) marker.setAttribute("aria-current", "step");
    else marker.removeAttribute("aria-current");
  });
  presentation.dataset.stage = String(stageIndex);
  updateSlideContent(stageIndex);
  updateCancerVisual(deck.cancerAt(timelineTime));
  document.querySelector(".page-progress span").style.width = `${fraction * 100}%`;
}
function updateCancerVisual(illustrationTime) {
  visualState = sampleCancerState(illustrationTime, 45000);
  presentation.dataset.phase = visualState.phase;
  presentation.dataset.tumorBurden = visualState.burden.toFixed(2);
  presentation.dataset.affectedSites = String(visualState.sites.filter((weight) => weight > .1).length);
  updateLesions(visualState);
}
function setMotionEnabled(enabled) {
  motionEnabled = Boolean(enabled && hasLoadedModel);
  playButton.setAttribute("aria-pressed", String(motionEnabled));
  playButton.setAttribute("aria-label", motionEnabled ? "Pause 3D animation" : "Play 3D animation");
  playButton.title = motionEnabled ? "Pause 3D animation — slides stay manual" : "Play 3D animation — slides stay manual";
}
function seekTo(time, mode = "chapter") {
  timelineTime = clamp(time, 0, duration);
  const nextStage = stageForTime(timelineTime);
  const previousStage = currentStage;
  updateTimelineControls();
  currentStage = nextStage;
  if (mode === "scrub") flyToStage(nextStage, true, previousStage);
  else if (nextStage !== previousStage || !journeyCamera?.active()) flyToStage(nextStage, false, previousStage);
}
function toggleChrome() {
  const hidden = presentation.classList.toggle("is-chrome-hidden");
  document.querySelectorAll(".controls,.glass-panel,.topbar,.chrome-hide").forEach((element) => {
    element.inert = hidden;
    element.setAttribute("aria-hidden", String(hidden));
  });
  restoreButton.hidden = !hidden;
  (hidden ? restoreButton : playButton).focus({ preventScroll: true });
}
function stepStage(direction) {
  const targetIndex = clamp(stageForTime(timelineTime) + direction, 0, markers.length - 1);
  seekTo(stageTimes[targetIndex], "chapter");
}

controls.addEventListener("start", () => {
  userInteracting = true;
  inspectionLocked = true;
  flight = null;
  presentation.dataset.cameraFlight = "0";
});
controls.addEventListener("end", () => {
  userInteracting = false;
  inspectionResumeAt = performance.now() + 1000;
});

playButton.addEventListener("click", () => {
  setMotionEnabled(!motionEnabled);
});
restartButton.addEventListener("click", () => {
  const previousStage = currentStage;
  timelineTime = 0;
  currentStage = 0;
  updateTimelineControls();
  flyToStage(0, false, previousStage);
});
previousButton.addEventListener("click", () => stepStage(-1));
nextButton.addEventListener("click", () => stepStage(1));
seekInput.addEventListener("input", () => seekTo(Number(seekInput.value), "scrub"));
markers.forEach((marker, index) => marker.addEventListener("click", () => seekTo(stageTimes[index], "chapter")));
restoreButton.addEventListener("click", toggleChrome);
document.querySelector(".chrome-hide").addEventListener("click", toggleChrome);

// Swipe the content panel to navigate; dragging the anatomy remains orbit input.
let swipeStart = null;
const slidePanel = document.querySelector(".glass-panel");
slidePanel.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch" || event.target.closest("a,button,input,video")) return;
  swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
slidePanel.addEventListener("pointerup", (event) => {
  if (!swipeStart || event.pointerId !== swipeStart.id) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  if (Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.8) {
    stepStage(dx < 0 ? 1 : -1);
  }
  swipeStart = null;
});
slidePanel.addEventListener("pointercancel", () => { swipeStart = null; });

// A mouse click anywhere that is not a control advances one slide. A drag (orbiting the model)
// or selecting text does not count. Touch keeps its swipe gesture.
let clickStart = null;
presentation.addEventListener("pointerdown", (event) => {
  clickStart = event.pointerType === "mouse" && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
});
presentation.addEventListener("pointerup", (event) => {
  const start = clickStart;
  clickStart = null;
  if (!start || event.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
  if (event.target.closest?.("a,button,input,select,textarea,video,label,.controls,.chrome-restore")) return;
  if (String(window.getSelection?.() || "").trim()) return;
  stepStage(1);
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await presentation.requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) {
    console.warn("Full screen is unavailable in this browser.", error);
  }
});
document.addEventListener("fullscreenchange", () => {
  const fullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.classList.toggle("is-fullscreen", fullscreen);
  fullscreenButton.setAttribute("aria-label", fullscreen ? "Exit full screen" : "Enter full screen");
  updateCameraFit();
});
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  const isEditing = target?.matches?.("input,textarea,select,[contenteditable=true]");
  if (isEditing) return;
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    fullscreenButton.click();
  } else if (event.key.toLowerCase() === "h") {
    event.preventDefault();
    toggleChrome();
  } else if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown") {
    event.preventDefault();
    stepStage(1);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") {
    event.preventDefault();
    stepStage(-1);
  } else if (event.key === "Home") {
    event.preventDefault();
    seekTo(0, "chapter");
  } else if (event.key === "End") {
    event.preventDefault();
    seekTo(duration, "chapter");
  } else if (event.code === "Space" && !target?.closest?.("button")) {
    event.preventDefault();
    stepStage(event.shiftKey ? -1 : 1);
  } else if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    seekTo(stageTimes[Math.min(SLIDES.length - 1, Number(event.key) - 1)], "chapter");
  } else if (event.key === "0" && SLIDES.length >= 10) {
    event.preventDefault();
    seekTo(stageTimes[9], "chapter");
  }
});
motionPreference.addEventListener?.("change", (event) => {
  controls.enableDamping = !event.matches;
  if (event.matches) {
    flight = null;
    setMotionEnabled(false);
    presentation.dataset.cameraFlight = "0";
  }
});

const loader = new GLTFLoader();
loader.load("./assets/colon.glb", (gltf) => {
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const normalization = 2.05 / Math.max(size.x, size.y, size.z);
  modelSize.copy(size).multiplyScalar(normalization);
  modelRoot.scale.setScalar(normalization);
  modelRoot.position.copy(center).multiplyScalar(-normalization);
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.roughness = Math.max(material.roughness ?? .3, .31);
        material.metalness = 0;
      });
    }
  });
  modelRoot.add(model);
  model.updateMatrixWorld(true);
  modelRoot.updateMatrixWorld(true);
  updateLesions = createCancerIllustration(THREE, modelRoot, model, { patches: false });
  anchors = modelRoot.userData.cancerAnchors || [];
  journey = createColonJourney(THREE, { mergeGeometries, mergeVertices }, { model, pivot: modelPivot, findings: journeyOrder });
  findingsById = new Map(journey.findings.map((finding) => [finding.id, finding]));
  journeyCamera = createJourneyCamera(THREE, journey, { fovOut: FOV_OUT, fovIn: FOV_IN });
  presentation.dataset.findings = String(journey.findings.length);
  renderedStage = -1; // rebuild the labels now that the findings exist
  presentation.dataset.anchoredSites = String(modelRoot.userData.cancerAnchorCount);
  presentation.dataset.tumorPatches = String(modelRoot.userData.cancerPatchCount);
  hasLoadedModel = true;
  viewport.classList.add("is-loaded");
  presentation.dataset.anchoredSites = String(anchors.filter(Boolean).length);
  updateCameraFit();
  updateTimelineControls();
  flyToStage(currentStage, true);
  setMotionEnabled(!motionPreference.matches);
}, undefined, (error) => {
  console.error("Unable to load the supplied colon model.", error);
  const errorElement = document.querySelector("#model-error");
  errorElement.dataset.failed = "true";
  errorElement.textContent = "The anatomical model could not load. Check your connection and reload.";
  setMotionEnabled(false);
  viewport.classList.add("is-loaded");
});

function updateCameraFit() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  const layout = getComputedStyle(presentation);
  sceneCenterX = Number.parseFloat(layout.getPropertyValue("--scene-center-x")) || .73;
  sceneCenterY = Number.parseFloat(layout.getPropertyValue("--scene-center-y")) || .48;
  sceneHeight = Number.parseFloat(layout.getPropertyValue("--scene-height")) || .7;
  camera.aspect = width / height;
  appliedCenter = "";
  setSceneCenter(sceneCenterX, sceneCenterY);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  fitSlideContent();
  if (hasLoadedModel && !flight && !userInteracting && !journeyCamera?.active()) flyToStage(currentStage, true);
}
const resizeObserver = new ResizeObserver(updateCameraFit);
resizeObserver.observe(viewport);
window.addEventListener("resize", updateCameraFit, { passive: true });
document.fonts?.ready.then(() => { fitSlideContent(); updateCameraFit(); });
updateTimelineControls();
setMotionEnabled(motionEnabled);

/** Place the camera from the journey state (pivot space), with a slight hand-held sway inside. */
function applyJourneyCamera(state, seconds) {
  modelPivot.updateMatrixWorld();
  camera.position.copy(state.position).applyMatrix4(modelPivot.matrixWorld);
  camera.quaternion.copy(state.quaternion).premultiply(modelPivot.getWorldQuaternion(pivotQuaternion));
  if (motionEnabled && !motionPreference.matches && state.sway > 0) {
    const sway = .005 * state.sway;
    camera.translateX(Math.sin(seconds * .9) * sway);
    camera.translateY(Math.cos(seconds * .7) * sway);
    camera.rotateZ(Math.sin(seconds * .45) * .025 * state.sway);
  }
  insideAmount = state.inside;
  // Inside a slide with no text panel, the endoscope view is centred on the screen.
  const centered = SLIDES[currentStage]?.layout === "blank" ? state.inside : 0;
  setSceneCenter(sceneCenterX + (.5 - sceneCenterX) * centered, sceneCenterY + (.5 - sceneCenterY) * centered);
  const fov = FOV_OUT + (FOV_IN - FOV_OUT) * state.lens;
  const near = .05 + (.003 - .05) * state.lens;
  camera.fov = fov;
  camera.near = near;
  camera.updateProjectionMatrix();
  journey.setVisual({ inside: state.inside, time: seconds, tumorScale: .85 + .3 * visualState.burden, nearStrength: state.nearFade });
}
/** Blend everything that differs between outside and inside: light, darkness, fog, heat. */
function applyInsideLook(seconds) {
  if (!journey) return;
  const inside = insideAmount;
  if (!journeyCamera.active()) {
    journey.setVisual({ inside: 0, time: seconds, tumorScale: .85 + .3 * visualState.burden, nearStrength: 0 });
  }
  renderer.setClearColor(0x050103, inside);
  roomLights.forEach((light) => { light.intensity = light.userData.baseIntensity * (1 - .965 * inside); });
  keyLight.intensity *= { day: 1, dusk: .82, night: .48 }[SLIDES[renderedStage]?.sun || "day"] ?? 1;
  headlight.intensity = .032 * inside * inside;
  scene.fog.near = 60 + (.12 - 60) * Math.pow(inside, .35);
  scene.fog.far = 100 + (1.15 - 100) * Math.pow(inside, .35);
  presentation.style.setProperty("--inside", inside.toFixed(3));
}
function animate(timestamp) {
  frameId = requestAnimationFrame(animate);
  const delta = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 1) : 0;
  previousFrame = timestamp;
  // The scene clock NEVER changes timelineTime or currentStage.
  // Only an explicit navigation action may change the selected slide.
  if (inspectionLocked && !userInteracting && timestamp >= inspectionResumeAt) {
    ambientBase = {
      point: controls.target.clone(),
      zoom: currentZoom(),
      direction: camera.position.clone().sub(controls.target)
    };
    motionSeconds = 0;
    inspectionLocked = false;
  }
  const journeyState = journeyCamera?.active() ? journeyCamera.update(delta) : null;
  if (journeyState?.arrived) journeyState.onArrive();
  if (journeyState && !journeyState.arrived) {
    applyJourneyCamera(journeyState, (timestamp || 0) / 1000);
  } else {
    if (!journeyCamera?.active()) insideAmount = 0;
    updateFlight(delta);
    updateAmbientCamera(delta);
  }
  if (hasLoadedModel && motionEnabled && !userInteracting && !inspectionLocked) {
    const start = SLIDES[currentStage].cancerTime;
    const end = SLIDES[currentStage + 1]?.cancerTime ?? start;
    const fraction = .5 - .5 * Math.cos(motionSeconds * .22);
    updateCancerVisual(start + (end - start) * fraction);
    if (!journeyCamera?.active()) modelPivot.rotation.y += THREE.MathUtils.degToRad(SLIDES[currentStage].spin || 0) * delta;
  }
  if (!journeyCamera?.active()) controls.update();
  applyInsideLook((timestamp || 0) / 1000);
  updateFocusLabels();
  updateCameraDataset();
  renderer.render(scene, camera);
}
animate();
window.addEventListener("pagehide", () => {
  cancelAnimationFrame(frameId);
  resizeObserver.disconnect();
  controls.dispose();
  renderer.dispose();
});
