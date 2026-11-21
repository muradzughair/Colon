const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (a, b, t) => {
  const p = clamp((t - a) / (b - a));
  return p * p * (3 - 2 * p);
};

const PHASES = [
  "initial",
  "early-progression",
  "expanded-burden",
  "response",
  "later-response"
];

/**
 * Pure 45-second illustrative burden sampler. Values are visual parameters,
 * not clinical measurements, stages, scores, or predictions.
 */
export function sampleCancerState(milliseconds, duration = 45000) {
  const t = clamp(milliseconds / duration) * 4;
  const stops = [0.16, 0.43, 1, 0.62, 0.16];
  const segment = Math.min(3, Math.floor(t));
  const local = t >= 4 ? 1 : t - segment;
  const burden = stops[segment] + (stops[segment + 1] - stops[segment]) * (local * local * (3 - 2 * local));
  const phaseIndex = Math.min(4, Math.floor(t + 0.000001));
  const progress = t >= 4 ? 0 : t - phaseIndex;
  return {
    phase: PHASES[phaseIndex],
    burden: Number(burden.toFixed(4)),
    sites: [
      0.74 + burden * 0.56,
      smooth(0.08, 0.72, t) * (1 - smooth(2.75, 3.8, t)) * 0.96,
      smooth(0.45, 1.8, t) * (1 - smooth(2.8, 3.9, t)) * 0.82,
      smooth(0.95, 2.45, t) * (1 - smooth(2.9, 3.85, t)) * 0.68
    ],
    phaseProgress: Number(progress.toFixed(4))
  };
}

const SITE_MESHES = [
  "VH_F_transverse_colon",
  "VH_F_ascending_colon",
  "VH_F_descending_colon",
  "VH_F_sigmoid_colon"
];

function buildPatch(THREE, root, raycaster, meshes, surface, radius, seed) {
  const segments = 28;
  const rings = 4;
  const center = surface.position.clone();
  const positions = [0, 0, 0];
  const colors = [];
  const indices = [];
  const centerColor = new THREE.Color(seed % 3 === 0 ? "#7d1d34" : "#541729");
  const rimColor = new THREE.Color(seed % 2 ? "#ff5e7e" : "#fa8072");
  colors.push(centerColor.r, centerColor.g, centerColor.b);

  for (let ring = 1; ring <= rings; ring += 1) {
    const radial = ring / rings;
    for (let step = 0; step < segments; step += 1) {
      const angle = (step / segments) * Math.PI * 2;
      const irregularity = 0.83 + 0.13 * Math.sin(angle * 3 + seed * 1.7) +
        0.08 * Math.sin(angle * 5 - seed * 0.63) + 0.045 * Math.cos(angle * 7 + seed);
      const x = Math.cos(angle) * radius * radial * irregularity;
      const y = Math.sin(angle) * radius * radial * (0.84 + 0.12 * Math.sin(seed * 0.9));
      const hit = surfaceAt(THREE, root, raycaster, meshes, surface.position.x + x, surface.position.y + y, surface.position.z + 0.12);
      const point = hit?.position ?? center.clone().add(new THREE.Vector3(x, y, 0));
      const normal = hit?.normal ?? surface.normal;
      const crown = Math.pow(1 - radial, 1.45) * radius * 0.28;
      point.addScaledVector(normal, 0.0008 + crown);
      positions.push(point.x - center.x, point.y - center.y, point.z - center.z);
      const blend = clamp(radial * 0.93);
      const color = centerColor.clone().lerp(rimColor, blend);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let step = 0; step < segments; step += 1) {
    const next = (step + 1) % segments;
    indices.push(0, 1 + step, 1 + next);
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const innerStart = 1 + (ring - 1) * segments;
    const outerStart = 1 + ring * segments;
    for (let step = 0; step < segments; step += 1) {
      const next = (step + 1) % segments;
      const a = innerStart + step;
      const b = innerStart + next;
      const c = outerStart + step;
      const d = outerStart + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.38,
    metalness: 0,
    transparent: true,
    opacity: 0.96,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: new THREE.Color("#7d1d34"),
    emissiveIntensity: 0.13
  });
  const patch = new THREE.Mesh(geometry, material);
  patch.position.copy(center);
  patch.scale.setScalar(0.001);
  patch.renderOrder = 4;
  root.add(patch);
  return patch;
}

function surfaceAt(THREE, root, raycaster, meshes, x, y, topZ) {
  root.updateMatrixWorld(true);
  const origin = root.localToWorld(new THREE.Vector3(x, y, topZ));
  const end = root.localToWorld(new THREE.Vector3(x, y, topZ - 1));
  const direction = end.sub(origin).normalize();
  raycaster.set(origin, direction);
  raycaster.near = 0;
  raycaster.far = 3;
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit) return null;
  const position = root.worldToLocal(hit.point.clone());
  const relative = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(hit.object.matrixWorld);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(relative);
  const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
  return { position, normal };
}

/**
 * Finds one outer-surface anchor per site (used to aim the outside camera views) and, unless
 * options.patches is false, draws the older surface patches. The colon journey draws the
 * findings on the inner wall instead (colon-journey.js), so the deck turns the patches off.
 */
export function createCancerIllustration(THREE, root, model, options = {}) {
  const raycaster = new THREE.Raycaster();
  const meshes = [];
  model.traverse((object) => {
    if (object.isMesh && object.geometry?.attributes?.position) meshes.push(object);
  });
  root.updateMatrixWorld(true);

  const namedMeshes = new Map();
  model.traverse((object) => {
    if (object.isMesh) namedMeshes.set(object.name, object);
  });
  const worldBounds = new THREE.Box3().setFromObject(model);
  const localMin = root.worldToLocal(worldBounds.min.clone());
  const localMax = root.worldToLocal(worldBounds.max.clone());
  const topZ = Math.max(localMin.z, localMax.z) + 0.18;
  const targets = SITE_MESHES.map((name, siteIndex) => {
    const mesh = namedMeshes.get(name);
    if (!mesh) return null;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone();
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    ].map((point) => root.worldToLocal(mesh.localToWorld(point)));
    const x = (corners[0].x + corners[1].x) / 2;
    const y = (corners[0].y + corners[1].y) / 2;
    const surface = surfaceAt(THREE, root, raycaster, meshes, x, y, topZ);
    if (surface) return { surface, siteIndex };

    // If a mesh's centerline is occluded by a fold, search its actual projected
    // bounds for a ray hit instead of placing an overlay in screen space.
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i += Math.max(1, Math.floor(position.count / 80))) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
      const local = root.worldToLocal(mesh.localToWorld(vertex));
      const candidate = surfaceAt(THREE, root, raycaster, meshes, local.x, local.y, topZ);
      if (candidate) return { surface: candidate, siteIndex };
    }
    return null;
  }).filter(Boolean);

  const lesions = [];
  let seed = 0;
  if (options.patches !== false) targets.forEach(({ surface, siteIndex }) => {
    const count = siteIndex === 0 ? 9 : 6;
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.399963 + siteIndex * 1.31;
      const distance = siteIndex === 0 ? 0.004 + (i % 4) * 0.005 : 0.003 + (i % 3) * 0.0045;
      const x = surface.position.x + Math.cos(angle) * distance;
      const y = surface.position.y + Math.sin(angle) * distance * 0.76;
      const localSurface = surfaceAt(THREE, root, raycaster, meshes, x, y, topZ) || surface;
      const radius = (siteIndex === 0 ? 0.0105 : 0.0085) * (0.76 + (i % 4) * 0.13);
      const patch = buildPatch(THREE, root, raycaster, meshes, localSurface, radius, seed++);
      lesions.push({ patch, siteIndex, size: 0.72 + (i % 5) * 0.12, index: i });
    }
  });
  root.userData.cancerAnchorCount = targets.length;
  root.userData.cancerPatchCount = lesions.length;
  root.userData.cancerAnchors = Array.from({ length: SITE_MESHES.length }, (_, siteIndex) => {
    const target = targets.find((candidate) => candidate.siteIndex === siteIndex);
    return target ? target.surface.position.clone() : null;
  });
  root.userData.cancerNormals = Array.from({ length: SITE_MESHES.length }, (_, siteIndex) => {
    const target = targets.find((candidate) => candidate.siteIndex === siteIndex);
    return target ? target.surface.normal.clone() : null;
  });

  return (state) => {
    lesions.forEach(({ patch, siteIndex, size, index }) => {
      const siteWeight = state.sites[siteIndex] ?? 0;
      const emergence = siteIndex === 0 ? 1 : clamp(siteWeight * 1.45);
      const localVariation = 0.88 + 0.12 * Math.sin(index * 2.1 + siteIndex);
      const growth = 0.42 + state.burden * 1.34;
      const scale = siteWeight > 0 ? Math.max(0.001, growth * emergence * size * localVariation) : 0.001;
      patch.scale.setScalar(scale);
      patch.material.opacity = 0.2 + 0.76 * clamp(emergence * (0.42 + state.burden * 0.72));
    });
  };
}
