import { CENTERLINE } from "./colon-centerline.js";
import { smoothstep } from "./journey-motion.js";

/*
 * The colon wall, the findings and the path through the colon, for the outside-to-inside
 * journey. Everything is built once from the supplied model (the file itself is not changed):
 *  - The model's parts are welded into one surface (no seams between segments) and made finer
 *    and rounder, so the colon no longer looks faceted.
 *  - One wall material does both looks. Outside: a translucent, softly lit shell with heat
 *    glowing through it where the findings are. Inside: a wet pink-red lining with ring folds
 *    (haustra), faint vessels and a fine uneven surface. `inside` (0..1) blends between them.
 *  - Polyps and the tumor sit on the INNER wall and grow into the lumen.
 *  - The camera path is the colon's centerline, with rotation-minimizing frames so the view
 *    never flips where the colon turns.
 * three.js is passed in (like cancer-illustration.js), so the exported file needs no extra imports.
 * Positions are in the space of `pivot` (the model's parent), which is the world space at rest.
 */

const MM = 0.0032; // one millimetre in scene units (the colon is about 5 cm wide here)
const FOLD_SPACING = 0.12; // distance between the ring folds, in scene units
const LOOK_AHEAD = 0.25; // how far ahead along the colon the camera looks
const MAX_HEAT = 8;

const SEGMENT_NAMES = {
  VH_F_caecum: "Cecum",
  VH_F_ileocecal_valve: "Cecum",
  VH_F_vermiform_appendix: "Appendix",
  VH_F_ascending_colon: "Ascending colon",
  VH_F_hepatic_flexure_of_colon: "Hepatic flexure",
  VH_F_transverse_colon: "Transverse colon",
  VH_F_splenic_flexure_of_colon: "Splenic flexure",
  VH_F_descending_colon: "Descending colon",
  VH_F_sigmoid_colon: "Sigmoid colon",
  VH_F_rectum: "Rectum"
};

// Value noise and the fold / bump helpers for the lining (adapted from the platform demo).
const WALL_COMMON = /* glsl */ `
  uniform float uInside;
  uniform float uFoldSpacing;
  uniform vec3 uLining;
  uniform float uGhost;
  uniform vec4 uHeat[${MAX_HEAT}];
  uniform float uHeatAmount[${MAX_HEAT}];
  uniform float uHeatGlow;
  uniform vec2 uNearFade;
  uniform float uNearStrength;
  varying float vAlong;
  varying vec3 vLocal;
  varying vec3 vAlongDirection;
  varying vec3 vWorld;
  varying vec3 vRadial;
  float wallHeat;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    return 0.5 * noise(p) + 0.3 * noise(p * 2.1) + 0.2 * noise(p * 4.3);
  }
  float foldStrength() { return 0.6 + 0.4 * noise(vLocal * 18.0); }
  float foldRidge() {
    float wave = 0.5 + 0.5 * cos(6.2831853 * vAlong / uFoldSpacing);
    return pow(wave, 3.0) * foldStrength();
  }
  float foldSlope() {
    float angle = 6.2831853 * vAlong / uFoldSpacing;
    float wave = 0.5 + 0.5 * cos(angle);
    return 3.0 * wave * wave * (-0.5 * sin(angle)) * (6.2831853 / uFoldSpacing) * foldStrength();
  }
  vec3 foldNormal(vec3 n) {
    vec3 t = vAlongDirection - dot(vAlongDirection, n) * n;
    return normalize(n - 0.022 * foldSlope() * normalize(t + 1e-6));
  }
  vec3 bumpNormal(vec3 surfPos, vec3 surfNormal, float height, float strength, float faceDir) {
    vec3 sigmaX = dFdx(surfPos);
    vec3 sigmaY = dFdy(surfPos);
    vec3 r1 = cross(sigmaY, surfNormal);
    vec3 r2 = cross(surfNormal, sigmaX);
    float det = dot(sigmaX, r1) * faceDir;
    vec2 slope = vec2(dFdx(height), dFdy(height)) * strength;
    vec3 grad = sign(det) * (slope.x * r1 + slope.y * r2);
    return normalize(abs(det) * surfNormal - grad);
  }
  // Heat colour: soft yellow, through orange, to red.
  vec3 heatColor(float h) {
    vec3 low = vec3(1.0, 0.82, 0.36);
    vec3 mid = vec3(1.0, 0.47, 0.14);
    vec3 high = vec3(0.93, 0.13, 0.12);
    return h < 0.55 ? mix(low, mid, h / 0.55) : mix(mid, high, clamp((h - 0.55) / 0.6, 0.0, 1.0));
  }
`;

function createWallMaterial(THREE, color) {
  const uniforms = {
    uInside: { value: 0 },
    uFoldSpacing: { value: FOLD_SPACING },
    uLining: { value: new THREE.Color("#d0605d") },
    uGhost: { value: 0.34 },
    uHeat: { value: Array.from({ length: MAX_HEAT }, () => new THREE.Vector4(0, 0, 0, 1)) },
    uHeatAmount: { value: new Array(MAX_HEAT).fill(0) },
    uHeatGlow: { value: 1 },
    uNearFade: { value: new THREE.Vector2(0.05, 0.42) },
    uNearStrength: { value: 0 }
  };
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.2,
    sheen: 0.35,
    sheenColor: new THREE.Color("#ffb3a8"),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  material.customProgramCacheKey = () => "orefera-colon-wall";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float along;
        attribute vec3 alongDirection;
        attribute vec3 radial;
        varying float vAlong;
        varying vec3 vLocal;
        varying vec3 vAlongDirection;
        varying vec3 vWorld;
        varying vec3 vRadial;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vAlong = along;
        vLocal = position;
        vAlongDirection = normalize(normalMatrix * alongDirection);
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRadial = normalize(mat3(modelMatrix) * radial);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${WALL_COMMON}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 toCamera = cameraPosition - vWorld;
        float cameraDistance = length(toCamera);
        // Lining: faint vessels, darker in the grooves between the folds.
        float vessel = 1.0 - smoothstep(0.0, 0.035, abs(fbm(vLocal * 38.0) - 0.5));
        vec3 lining = mix(uLining, vec3(0.55, 0.12, 0.16), vessel * 0.35) * (0.45 + 0.55 * foldRidge());
        diffuseColor.rgb = mix(diffuseColor.rgb, lining, uInside);
        // Heat from the findings, by distance in 3D (it shows on the wall above each finding).
        wallHeat = 0.0;
        for (int i = 0; i < ${MAX_HEAT}; i++) {
          float d = distance(vWorld, uHeat[i].xyz) / max(uHeat[i].w, 1e-4);
          wallHeat += uHeatAmount[i] * exp(-d * d * 2.4);
        }
        wallHeat = clamp(wallHeat, 0.0, 1.6);
        // Tint the shell with the heat colour, so the spots read as yellow, orange and red.
        diffuseColor.rgb = mix(diffuseColor.rgb, heatColor(wallHeat) * 0.85, clamp(wallHeat * 1.1, 0.0, 0.92) * uHeatGlow);
        // Outside: a translucent shell, more solid at the silhouette (like a soft X-ray).
        float facing = abs(dot(normalize(toCamera), vRadial));
        float rim = pow(1.0 - facing, 2.2);
        float farWall = step(dot(toCamera, vRadial), 0.0); // the inner face of the far wall
        float shell = mix(uGhost, 0.92, rim) * mix(1.0, 0.5, farWall) + smoothstep(0.0, 0.8, wallHeat) * 0.7 * uHeatGlow;
        float wallAlpha = mix(clamp(shell, 0.0, 1.0), 1.0, uInside);
        // While passing through the wall, the wall near the camera fades out (no clipping pop).
        wallAlpha *= mix(1.0, smoothstep(uNearFade.x, uNearFade.y, cameraDistance), uNearStrength);
        diffuseColor.a *= wallAlpha;`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        vec3 liningNormal = bumpNormal(-vViewPosition, foldNormal(normal), fbm(vLocal * 75.0), 0.0012, faceDirection);
        normal = normalize(mix(normal, liningNormal, uInside));`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += heatColor(wallHeat) * wallHeat * uHeatGlow * 1.7;`);
  };
  return { material, uniforms };
}

function glowTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.22, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.14)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A polyp: a small raised, rounded bump of slightly paler, shiny tissue.
function polypMesh(THREE, sizeMm) {
  const radius = Math.max(0.012, (sizeMm / 2) * MM);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    new THREE.MeshPhysicalMaterial({ color: "#e0837a", roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 })
  );
  mesh.scale.set(radius, radius * 0.8, radius);
  return { mesh, radius };
}

// A tumor: a larger, irregular, darker red mass.
function tumorMesh(THREE, mergeVertices, sizeMm) {
  const radius = Math.max(0.02, (sizeMm / 2) * MM);
  const ball = new THREE.IcosahedronGeometry(1, 5);
  ball.deleteAttribute("normal");
  ball.deleteAttribute("uv");
  const geometry = mergeVertices(ball);
  const position = geometry.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const lumpy = 1 + 0.18 * Math.sin(v.x * 7.1 + v.y * 3.3) * Math.cos(v.z * 6.4 - v.x * 2.1) + 0.08 * Math.sin(v.y * 17 + v.z * 13);
    v.multiplyScalar(lumpy);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    color: "#9b2f2f", roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.3
  }));
  mesh.scale.set(radius, radius * 0.65, radius);
  return { mesh, radius };
}

// Split each triangle into four, pushing the new edge points onto the curved surface
// (Phong tessellation). Extra per-vertex values are averaged.
function subdivideSmooth(THREE, geometry, levels) {
  let pos = Array.from(geometry.getAttribute("position").array);
  let nor = Array.from(geometry.getAttribute("normal").array);
  const extras = Object.keys(geometry.attributes).filter((name) => name !== "position" && name !== "normal")
    .map((name) => ({ name, size: geometry.getAttribute(name).itemSize, values: Array.from(geometry.getAttribute(name).array) }));
  let index = Array.from(geometry.index.array);
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), n0 = new THREE.Vector3(), n1 = new THREE.Vector3();
  const mid = new THREE.Vector3(), a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  for (let level = 0; level < levels; level += 1) {
    const edges = new Map();
    const next = [];
    const middle = (a, b) => {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      const known = edges.get(key);
      if (known !== undefined) return known;
      p0.fromArray(pos, a * 3); p1.fromArray(pos, b * 3);
      n0.fromArray(nor, a * 3); n1.fromArray(nor, b * 3);
      mid.copy(p0).add(p1).multiplyScalar(0.5);
      a0.copy(mid).addScaledVector(n0, -a1.copy(mid).sub(p0).dot(n0));
      a1.copy(mid).addScaledVector(n1, -mid.clone().sub(p1).dot(n1));
      a0.add(a1).multiplyScalar(0.5);
      mid.multiplyScalar(0.25).addScaledVector(a0, 0.75);
      n0.add(n1).normalize();
      const id = pos.length / 3;
      pos.push(mid.x, mid.y, mid.z);
      nor.push(n0.x, n0.y, n0.z);
      for (const { size, values } of extras) {
        for (let k = 0; k < size; k += 1) values.push((values[a * size + k] + values[b * size + k]) / 2);
      }
      edges.set(key, id);
      return id;
    };
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    index = next;
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  for (const { name, size, values } of extras) result.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  result.setIndex(index);
  result.computeVertexNormals();
  pos = nor = null;
  return result;
}

export function createColonJourney(THREE, { mergeGeometries, mergeVertices }, { model, pivot, findings }) {
  pivot.updateMatrixWorld(true);
  model.updateMatrixWorld(true);
  const toPivot = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const meshes = [];
  model.traverse((object) => {
    if (object.isMesh && object.geometry?.attributes?.position) meshes.push(object);
  });

  // The centerline as a smooth curve, sampled evenly by distance.
  const modelToPivot = new THREE.Matrix4().multiplyMatrices(toPivot, model.matrixWorld);
  const curve = new THREE.CatmullRomCurve3(CENTERLINE.map((p) => new THREE.Vector3(...p).applyMatrix4(modelToPivot)), false, "centripetal");
  const length = curve.getLength();
  const SAMPLES = 480;
  const samples = curve.getSpacedPoints(SAMPLES);
  const frames = curve.computeFrenetFrames(SAMPLES, false);
  // Roll every frame by the same angle (they stay rotation-minimizing) so that at the start of
  // the colon "up" points toward the audience: entering from the front then needs no roll.
  {
    const t0 = frames.tangents[0];
    const wanted = new THREE.Vector3(0, 0, 1).addScaledVector(t0, -t0.z).normalize();
    const n0 = frames.normals[0];
    const angle = Math.atan2(new THREE.Vector3().crossVectors(n0, wanted).dot(t0), n0.dot(wanted));
    const q = new THREE.Quaternion();
    for (let i = 0; i <= SAMPLES; i += 1) {
      q.setFromAxisAngle(frames.tangents[i], angle);
      frames.normals[i].applyQuaternion(q);
      frames.binormals[i].applyQuaternion(q);
    }
  }
  const sampleIndex = (s) => Math.min(SAMPLES, Math.max(0, s / length * SAMPLES));

  function pointAt(s, target = new THREE.Vector3()) {
    if (s <= 0) return target.copy(samples[0]).addScaledVector(frames.tangents[0], s);
    if (s >= length) return target.copy(samples[SAMPLES]).addScaledVector(frames.tangents[SAMPLES], s - length);
    return curve.getPointAt(s / length, target);
  }
  function interpolate(list, s, target) {
    const f = sampleIndex(s);
    const i = Math.min(SAMPLES - 1, Math.floor(f));
    return target.copy(list[i]).lerp(list[i + 1], f - i).normalize();
  }
  const tangentAt = (s, target = new THREE.Vector3()) => interpolate(frames.tangents, s, target);
  const normalAt = (s, target = new THREE.Vector3()) => interpolate(frames.normals, s, target);

  // For each vertex: its distance along the colon, the colon's direction there, and the
  // outward direction from the centerline (the wall is a single surface; this tells the
  // shader which face the camera is looking at).
  function nearestSample(point) {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const d = samples[i].distanceToSquared(point);
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    return best;
  }

  // Weld the parts into one surface, in pivot space, without seams.
  const parts = meshes.map((mesh) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", mesh.geometry.getAttribute("position").clone());
    geometry.setIndex(mesh.geometry.index ? mesh.geometry.index.clone() : null);
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toPivot, mesh.matrixWorld));
    return geometry.index ? geometry : geometry.toNonIndexed();
  });
  const welded = mergeVertices(mergeGeometries(parts), 1e-4);
  parts.forEach((geometry) => geometry.dispose());
  welded.computeVertexNormals();
  {
    const position = welded.getAttribute("position");
    const along = new Float32Array(position.count);
    const direction = new Float32Array(position.count * 3);
    const radial = new Float32Array(position.count * 3);
    const p = new THREE.Vector3(), r = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i);
      const k = nearestSample(p);
      along[i] = (k / SAMPLES) * length;
      const t = frames.tangents[k];
      direction.set([t.x, t.y, t.z], i * 3);
      r.copy(p).sub(samples[k]);
      r.addScaledVector(t, -r.dot(t)).normalize();
      radial.set([r.x, r.y, r.z], i * 3);
    }
    welded.setAttribute("along", new THREE.BufferAttribute(along, 1));
    welded.setAttribute("alongDirection", new THREE.BufferAttribute(direction, 3));
    welded.setAttribute("radial", new THREE.BufferAttribute(radial, 3));
  }
  const smoothGeometry = subdivideSmooth(THREE, welded, 2);
  welded.dispose();
  const baseColor = meshes.find((mesh) => mesh.material?.color)?.material.color.clone() ?? new THREE.Color("#f3dcd2");
  const { material: wallMaterial, uniforms } = createWallMaterial(THREE, baseColor);
  const wall = new THREE.Mesh(smoothGeometry, wallMaterial);
  wall.renderOrder = 2;
  pivot.add(wall);

  // Segment name along the colon (from the model part the wall belongs to).
  const raycaster = new THREE.Raycaster();
  const segmentNames = [];
  {
    const side = new THREE.Vector3();
    for (let i = 0; i <= 100; i += 1) {
      const s = (i / 100) * length;
      const k = Math.round(sampleIndex(s));
      let best = null;
      for (let a = 0; a < 6; a += 1) {
        side.copy(frames.normals[k]).applyAxisAngle(frames.tangents[k], (a / 6) * Math.PI * 2);
        raycaster.set(samples[k], side);
        const hit = raycaster.intersectObjects(meshes, false)[0];
        if (hit && (!best || hit.distance < best.distance)) best = hit;
      }
      segmentNames.push(SEGMENT_NAMES[best?.object.name] ?? "Colon");
    }
  }
  const segmentAt = (s) => segmentNames[Math.round(Math.min(1, Math.max(0, s / length)) * 100)];

  const isVisibleFrom = (from, point) => {
    const toPoint = point.clone().sub(from);
    const distance = toPoint.length();
    raycaster.set(from, toPoint.normalize());
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return !hit || hit.distance > distance - 0.02;
  };

  // The findings on the inner wall.
  const glow = glowTexture(THREE);
  const placed = findings.map((finding) => {
    const s = finding.at * length;
    const center = pointAt(s);
    const t = tangentAt(s);
    // "around" is measured from the side facing the audience (+z), where that is defined.
    const front = new THREE.Vector3(0, 0, 1).addScaledVector(t, -t.z);
    const base = front.length() > 0.35 ? front.normalize() : normalAt(s);
    const out = base.applyAxisAngle(t, THREE.MathUtils.degToRad(finding.around || 0)).normalize();
    raycaster.set(center, out);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    const wallPoint = hit ? hit.point.applyMatrix4(toPivot) : center.clone().addScaledVector(out, 0.08);
    const inward = center.clone().sub(wallPoint).normalize();
    const { mesh, radius } = finding.kind === "tumor" ? tumorMesh(THREE, mergeVertices, finding.sizeMm) : polypMesh(THREE, finding.sizeMm);
    const point = wallPoint.clone().addScaledVector(inward, radius * 0.18);
    mesh.position.copy(point).addScaledVector(inward, -radius * 0.25);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
    pivot.add(mesh);
    // Where the camera stops: a little before the finding, with nothing in between.
    let viewS = s - 0.24;
    for (const back of [0.24, 0.2, 0.28, 0.16, 0.32, 0.12]) {
      if (isVisibleFrom(pointAt(s - back), point)) { viewS = s - back; break; }
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow,
      color: finding.kind === "tumor" ? "#ff3b1f" : "#ff9a2e",
      blending: THREE.NormalBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false
    }));
    const heatRadius = finding.kind === "tumor" ? 0.2 : 0.13;
    halo.scale.setScalar(heatRadius * 4);
    halo.position.copy(point);
    halo.renderOrder = 6;
    pivot.add(halo);
    return {
      id: finding.id,
      kind: finding.kind,
      label: finding.label || (finding.kind === "tumor" ? "Tumor" : "Polyp"),
      sizeMm: finding.sizeMm,
      segment: segmentAt(s),
      s,
      viewS: Math.max(0.12, viewS),
      point,
      inward,
      mesh,
      halo,
      heatRadius,
      heat: finding.kind === "tumor" ? 1.35 : 1.0,
      phase: placedPhase(finding.id)
    };
  });
  placed.forEach((finding, i) => {
    if (i >= MAX_HEAT) return;
    uniforms.uHeat.value[i].set(finding.point.x, finding.point.y, finding.point.z, finding.heatRadius);
  });

  const lookMatrix = new THREE.Matrix4();
  const ahead = new THREE.Vector3();
  const up = new THREE.Vector3();
  const dirA = new THREE.Vector3();
  const dirF = new THREE.Vector3();
  const turnQ = new THREE.Quaternion();
  /** Camera orientation inside the colon at distance s: looking ahead, turned toward `focus`. */
  function orientationAt(s, eye, focus, turn, target = new THREE.Quaternion()) {
    pointAt(s + LOOK_AHEAD, ahead);
    normalAt(s, up);
    lookMatrix.lookAt(eye, ahead, up);
    target.setFromRotationMatrix(lookMatrix);
    if (focus && turn > 0.0001) {
      dirA.copy(ahead).sub(eye).normalize();
      dirF.copy(focus).sub(eye).normalize();
      dirF.lerp(dirA, 1 - turn * 0.82).normalize();
      turnQ.setFromUnitVectors(dirA, dirF);
      target.premultiply(turnQ);
    }
    return target;
  }

  /** Per-frame look: inside (0..1), time (s), tumor heat scale, near-camera fade strength. */
  function setVisual({ inside, time, tumorScale = 1, nearStrength = 0 }) {
    uniforms.uInside.value = inside;
    uniforms.uNearStrength.value = nearStrength;
    const glowAmount = Math.pow(1 - inside, 1.5);
    uniforms.uHeatGlow.value = glowAmount;
    wallMaterial.depthWrite = inside > 0.6;
    placed.forEach((finding, i) => {
      const pulse = 0.82 + 0.18 * Math.sin(time * (finding.kind === "tumor" ? 1.9 : 1.4) + finding.phase);
      const amount = finding.heat * pulse * (finding.kind === "tumor" ? tumorScale : 1);
      if (i < MAX_HEAT) uniforms.uHeatAmount.value[i] = amount;
      finding.halo.material.opacity = glowAmount * (0.42 + 0.34 * pulse) * Math.min(1.1, amount);
      finding.halo.visible = glowAmount > 0.01;
    });
  }

  meshes.forEach((mesh) => { mesh.visible = false; }); // the welded wall replaces the parts

  return {
    length,
    findings: placed,
    pointAt,
    tangentAt,
    normalAt,
    orientationAt,
    segmentAt,
    isVisibleFrom,
    setVisual,
    wall,
    smoothstep
  };
}

function placedPhase(id) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash / 997 * Math.PI * 2;
}
