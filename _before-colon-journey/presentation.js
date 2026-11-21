import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCancerIllustration, sampleCancerState } from "./cancer-illustration.js";
import { SLIDES } from "./slides.js";
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
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 100);
camera.position.set(0, 0, 8);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfff7f1, 0x783b4a, 2.1));
const keyLight = new THREE.DirectionalLight(0xfff1e9, 3.3);
keyLight.position.set(-2.5, 3.4, 4.5);
keyLight.castShadow = true;
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
controls.minZoom = .15;
controls.maxZoom = 5.5;
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  camera.position.copy(point).add(direction);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  controls.update();
}
function flyToStage(index, instant = false) {
  if (!hasLoadedModel) return;
  const destination = targetForStage(index);
  ambientBase = destination;
  motionSeconds = 0;
  inspectionLocked = false;
  flight = null;
  if (instant || motionPreference.matches) {
    setCameraPose(destination.point, destination.zoom, destination.direction);
    presentation.dataset.cameraFlight = "0";
    return;
  }
  const fromTarget = controls.target.clone();
  const fromPosition = camera.position.clone();
  const fromDirection = fromPosition.sub(fromTarget);
  const fromZoom = camera.zoom;
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
  presentation.dataset.cameraZoom = camera.zoom.toFixed(2);
  presentation.dataset.cameraMotion = flight ? "flight" : motionEnabled && !userInteracting && !inspectionLocked ? "ambient" : "still";
  presentation.dataset.cameraPosition = camera.position.toArray().map(value => value.toFixed(3)).join(",");
  const zoomLabel = document.querySelector("#camera-zoom");
  if (zoomLabel) zoomLabel.textContent = `${camera.zoom.toFixed(1)}×`;
}
function updateSlideContent(index) {
  if (index === renderedStage) return;
  renderedStage = index;
  const slide = SLIDES[index];
  renderSlide(slide, { index, total: SLIDES.length });
  fitSlideContent();
  const region = document.querySelector("#camera-region");
  if (region) region.textContent = typeof slide.view.site === "number" ? regionNames[slide.view.site] : slide.view.site === "regional" ? "Regional view" : "Whole colon";
  const counter = document.querySelector("#slide-counter");
  if (counter) counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(SLIDES.length).padStart(2, "0")}`;
  const overlay = document.querySelector("#anatomy-markers");
  overlay.replaceChildren();
  const annotations = slide.layout === "blank" ? [] : slide.markers || regionNames.map((_, site) => ({ site, label: "Cancer illustration" }));
  focusLabels = annotations.map(({ site, label }) => {
    const element = document.createElement("span");
    element.className = "anatomy-marker";
    element.dataset.site = String(site);
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
    detail.textContent = `${regionNames[site]} · illustrative`;
    caption.append(title, detail);
    element.append(leader, ring, caption);
    element.hidden = true;
    overlay.append(element);
    return { element, caption, line, site };
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
  focusLabels.forEach(({ element, caption, line, site }) => {
    const worldPoint = anchorWorld(site);
    const point = worldPoint.clone().project(camera);
    const x = (point.x + 1) * viewport.clientWidth / 2;
    const y = (1 - point.y) * viewport.clientHeight / 2;
    element.style.transform = `translate(${x}px, ${y}px)`;
    const normal = modelRoot.userData.cancerNormals?.[site]?.clone().applyMatrix3(normalMatrix).normalize();
    const backFacing = normal && normal.dot(camera.position.clone().sub(worldPoint).normalize()) < .08;
    const underCopy = x > panel.left && x < panel.right && y > panel.top && y < panel.bottom;
    element.hidden = !hasLoadedModel || !anchors[site] || visualState.sites[site] < .14 || backFacing || underCopy ||
      point.z < -1 || point.z > 1 || x < 12 || x > viewport.clientWidth - 12 ||
      y < 75 || y > Math.min(viewport.clientHeight - 92, viewport.clientHeight * (sceneCenterY + sceneHeight / 2));
    if (element.hidden) return;
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
    dy = clamp(dy, 77 - y, Math.max(77 - y, viewport.clientHeight * (sceneCenterY + sceneHeight / 2) - height - y));
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
  updateTimelineControls();
  currentStage = nextStage;
  if (mode === "scrub") flyToStage(nextStage, true);
  else flyToStage(nextStage, false);
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
  timelineTime = 0;
  currentStage = 0;
  updateTimelineControls();
  flyToStage(0, false);
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
  } else if (event.key === "ArrowRight" || event.key === "PageDown") {
    event.preventDefault();
    stepStage(1);
  } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
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
    object.castShadow = true;
    object.receiveShadow = true;
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
  updateLesions = createCancerIllustration(THREE, modelRoot, model);
  anchors = modelRoot.userData.cancerAnchors || [];
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
  const aspect = width / height;
  const viewHeight = 4;
  const viewWidth = viewHeight * aspect;
  const layout = getComputedStyle(presentation);
  sceneCenterX = Number.parseFloat(layout.getPropertyValue("--scene-center-x")) || .73;
  sceneCenterY = Number.parseFloat(layout.getPropertyValue("--scene-center-y")) || .48;
  sceneHeight = Number.parseFloat(layout.getPropertyValue("--scene-height")) || .7;
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.setViewOffset(width, height, width * (.5 - sceneCenterX), height * (.5 - sceneCenterY), width, height);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  fitSlideContent();
  if (hasLoadedModel && !flight && !userInteracting) flyToStage(currentStage, true);
}
const resizeObserver = new ResizeObserver(updateCameraFit);
resizeObserver.observe(viewport);
window.addEventListener("resize", updateCameraFit, { passive: true });
document.fonts?.ready.then(() => { fitSlideContent(); updateCameraFit(); });
updateTimelineControls();
setMotionEnabled(motionEnabled);

function animate(timestamp) {
  frameId = requestAnimationFrame(animate);
  const delta = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 1) : 0;
  previousFrame = timestamp;
  // The scene clock NEVER changes timelineTime or currentStage.
  // Only an explicit navigation action may change the selected slide.
  if (inspectionLocked && !userInteracting && timestamp >= inspectionResumeAt) {
    ambientBase = {
      point: controls.target.clone(),
      zoom: camera.zoom,
      direction: camera.position.clone().sub(controls.target)
    };
    motionSeconds = 0;
    inspectionLocked = false;
  }
  updateFlight(delta);
  updateAmbientCamera(delta);
  if (hasLoadedModel && motionEnabled && !userInteracting && !inspectionLocked) {
    const start = SLIDES[currentStage].cancerTime;
    const end = SLIDES[currentStage + 1]?.cancerTime ?? start;
    const fraction = .5 - .5 * Math.cos(motionSeconds * .22);
    updateCancerVisual(start + (end - start) * fraction);
    modelPivot.rotation.y += THREE.MathUtils.degToRad(SLIDES[currentStage].spin || 0) * delta;
  }
  controls.update();
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
