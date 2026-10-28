// Intro stage: an industrial arm whose gripper follows the cursor.
// The cursor ray lands on a pick surface, a camera-facing plane through the base column that bulges into a
// half-cylinder around it, so the arm swings around the column instead of flipping over it. A two-link solve
// then sets the shoulder and elbow so the gripper sits under the cursor whenever the point is in reach.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

const host = document.getElementById('arm-viewport');
const intro = document.getElementById('intro');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}
if (!renderer || !host || !intro) {
  host && host.classList.add('nogl');
  window.dispatchEvent(new CustomEvent('torque:hero-fallback'));
} else {
  start();
}

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#999';
}
function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

function start() {
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 160);
  const CAM_DIR = new THREE.Vector3(5.42, 3.5, 12.29).normalize();
  const N = new THREE.Vector3(CAM_DIR.x, 0, CAM_DIR.z).normalize();   // pick plane faces the camera
  const SIDE = new THREE.Vector3(N.z, 0, -N.x);                          // screen right, on the floor
  const ANCHOR = new THREE.Vector3(0, 1.9, 0);                           // point on the column the layout places

  // ----- look: studio reflections, soft shadows, filmic tone curve -----
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;      // soft, blurred contact shadows on the floor
  // a small light room baked into an environment map, so paint and steel have something to reflect
  (function bakeStudio() {
    const env = new THREE.Scene(), box = new THREE.BoxGeometry(1, 1, 1);
    const room = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x9aa2aa, side: THREE.BackSide, roughness: 1, metalness: 0 }));
    room.scale.set(30, 18, 30); room.position.y = 7; env.add(room);
    const bulb = new THREE.PointLight(0xffffff, 520, 40, 2); bulb.position.set(0, 12, 0); env.add(bulb);
    const panel = (x, y, z, sx, sy, sz, k) => {
      const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(k) }));
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); env.add(m);
    };
    panel(0, 15.6, 0, 10, 0.2, 6, 12);    // overhead softbox
    panel(-14.6, 7, 3, 0.2, 5, 9, 8);     // long strip on the left
    panel(14.6, 8, -2, 0.2, 6, 5, 4);     // smaller strip on the right
    panel(3, 6, 14.6, 12, 4, 0.2, 5);     // front fill, behind the viewer
    panel(-3, 9, -14.6, 7, 3, 0.2, 3);    // back rim
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
    box.dispose();
  })();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7d8894, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-3.2, 11, 6.5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);     // the blur does the softening, so a small map is enough
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 2, far: 30 });
  key.shadow.radius = 9;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.3);
  rim.position.set(-7, 6, -8);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xfff1dc, 0.45);
  fill.position.set(8, 4, 6);
  scene.add(fill);

  // materials: clear-coated robot yellow, satin graphite housings, machined steel, rubber pads
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xeca400, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 0.85 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x2a3037, roughness: 0.46, metalness: 0.3, envMapIntensity: 0.75 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc4cbd2, roughness: 0.24, metalness: 1, envMapIntensity: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9, metalness: 0, envMapIntensity: 0.4 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.6, metalness: 0.05, envMapIntensity: 0.5 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffc933, toneMapped: false });

  // floor: fading calibration grid, a soft pool of light and the contact shadow, drawn into one texture
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = floorCanvas.height = 1024;
  const floorTex = new THREE.CanvasTexture(floorCanvas);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 8;
  let darkTheme = false;
  function drawFloor() {
    const g = floorCanvas.getContext('2d'), W = 1024, c = W / 2;
    g.clearRect(0, 0, W, W);
    const pool = g.createRadialGradient(c, c, 0, c, c, W * 0.42);
    pool.addColorStop(0, darkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.55)');
    pool.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = pool; g.fillRect(0, 0, W, W);
    g.save();
    g.strokeStyle = cssColor('--axis');
    g.lineWidth = 1.1;
    const step = W / 28;
    for (let i = 0; i <= 28; i++) {
      g.globalAlpha = i % 4 === 0 ? 0.5 : 0.22;
      g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, W); g.stroke();
      g.beginPath(); g.moveTo(0, i * step); g.lineTo(W, i * step); g.stroke();
    }
    g.restore();
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createRadialGradient(c, c, W * 0.1, c, c, W * 0.5);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, W, W);
    g.globalCompositeOperation = 'source-over';
    const sh = g.createRadialGradient(c, c, W * 0.05, c, c, W * 0.115);
    sh.addColorStop(0, darkTheme ? 'rgba(0,0,0,0.55)' : 'rgba(10,14,18,0.32)');
    sh.addColorStop(1, 'rgba(10,14,18,0)');
    g.fillStyle = sh;
    g.beginPath(); g.arc(c, c, W * 0.115, 0, Math.PI * 2); g.fill();
    floorTex.needsUpdate = true;
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false, toneMapped: false }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.004;
  catcher.receiveShadow = true;
  scene.add(catcher);

  // ----- shape helpers -----
  // a link plate: the convex hull of two joint circles, extruded with rounded edges
  function linkGeo(L, r1, r2, depth, bevel, y0 = 0) {
    const a1 = r1 - bevel, a2 = r2 - bevel;
    const ny = (a1 - a2) / L, nx = Math.sqrt(1 - ny * ny), t = Math.atan2(ny, nx);
    const s = new THREE.Shape();
    s.moveTo(a1 * nx, y0 + a1 * ny);
    s.lineTo(a2 * nx, y0 + L + a2 * ny);
    s.absarc(0, y0 + L, a2, t, Math.PI - t, false);
    s.lineTo(-a1 * nx, y0 + a1 * ny);
    s.absarc(0, y0, a1, Math.PI - t, 2 * Math.PI + t, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 30 });
    g.translate(0, 0, -(depth - 2 * bevel) / 2);
    return g;
  }
  // a cylinder with rounded rims, along y
  function roundCyl(r, h, b, seg = 56) {
    const pts = [new THREE.Vector2(0.0001, -h / 2)];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - b + b * Math.cos(a), -h / 2 + b + b * Math.sin(a))); }
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - b + b * Math.cos(a), h / 2 - b + b * Math.sin(a))); }
    pts.push(new THREE.Vector2(0.0001, h / 2));
    return new THREE.LatheGeometry(pts, seg);
  }
  // a box with rounded edges
  function roundBox(w, h, d, b) {
    const ww = w - 2 * b, hh = h - 2 * b, rc = Math.max(0.002, Math.min(b, hh / 2, ww / 2) * 0.9);
    const s = new THREE.Shape(), x0 = -ww / 2, y0 = -hh / 2;
    s.moveTo(x0 + rc, y0);
    s.lineTo(x0 + ww - rc, y0); s.absarc(x0 + ww - rc, y0 + rc, rc, -Math.PI / 2, 0, false);
    s.lineTo(x0 + ww, y0 + hh - rc); s.absarc(x0 + ww - rc, y0 + hh - rc, rc, 0, Math.PI / 2, false);
    s.lineTo(x0 + rc, y0 + hh); s.absarc(x0 + rc, y0 + hh - rc, rc, Math.PI / 2, Math.PI, false);
    s.lineTo(x0, y0 + rc); s.absarc(x0 + rc, y0 + rc, rc, Math.PI, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    return g;
  }
  function mesh(geo, mat, parent, opts = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = opts.cast !== false;
    if (opts.pos) m.position.set(...opts.pos);
    if (opts.rot) m.rotation.set(...opts.rot);
    parent.add(m);
    return m;
  }
  // bolt heads on a circle, as one instanced mesh; axis 'y' or 'z'
  function bolts(parent, n, R, r, h, axis, offset) {
    const geo = new THREE.CylinderGeometry(r, r, h, 12);
    if (axis === 'z') geo.rotateX(Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, steel, n), m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.PI / n;
      if (axis === 'z') m4.makeTranslation(Math.cos(a) * R, Math.sin(a) * R, offset);
      else m4.makeTranslation(Math.cos(a) * R, offset, Math.sin(a) * R);
      im.setMatrixAt(i, m4);
    }
    parent.add(im);
    return im;
  }
  // a joint housing across the arm: graphite drum, steel caps, a bolt circle on each cap
  function hub(parent, r, len, capR) {
    const g = new THREE.Group(); parent.add(g);
    mesh(roundCyl(r, len, Math.min(0.05, r * 0.18)).rotateX(Math.PI / 2), joint, g);
    for (const s of [-1, 1]) {
      mesh(roundCyl(capR, 0.05, 0.016, 40).rotateX(Math.PI / 2), steel, g, { pos: [0, 0, s * (len / 2 + 0.01)] });
      bolts(g, 6, capR * 0.7, 0.018, 0.03, 'z', s * (len / 2 + 0.035));
    }
    return g;
  }

  // ----- the arm: base yaw, shoulder and elbow pitch, a wrist that keeps the gripper level -----
  const L1 = 2.25, L2 = 1.7;
  const SH_Y = 0.26 + 0.92;   // shoulder pivot height
  const TCP = 0.72;           // wrist centre to the point between the fingers
  // fixed base: chamfered plate and riser, with its anchor bolts
  const basePts = [[0.0001, 0], [1.14, 0], [1.16, 0.025], [1.16, 0.1], [1.12, 0.145], [1.0, 0.16], [0.88, 0.165], [0.86, 0.185], [0.86, 0.26], [0.0001, 0.26]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(basePts, 72), joint, scene);
  bolts(scene, 8, 1.01, 0.04, 0.035, 'y', 0.175);
  // J1: the turret turns on the base
  const yaw = new THREE.Group();
  yaw.position.y = 0.26;
  scene.add(yaw);
  const turretPts = [[0.0001, 0], [0.83, 0], [0.845, 0.025], [0.84, 0.1], [0.815, 0.4], [0.8, 0.5], [0.77, 0.56], [0.7, 0.6], [0.6, 0.615], [0.0001, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(turretPts, 72), paint, yaw);
  mesh(new THREE.CylinderGeometry(0.855, 0.855, 0.035, 72), joint, yaw, { pos: [0, 0.0175, 0] });
  mesh(roundCyl(0.16, 0.44, 0.05), joint, yaw, { pos: [-0.68, 0.42, 0] });          // J1 motor at the back
  mesh(roundCyl(0.1, 0.04, 0.012, 32), steel, yaw, { pos: [-0.68, 0.66, 0] });
  // shoulder yoke: two cheek plates either side of the upper arm, and the J2 drum and motor
  for (const s of [-1, 1]) mesh(linkGeo(0.62, 0.56, 0.47, 0.12, 0.03, 0.3), paint, yaw, { pos: [0, 0, s * 0.335] });
  const shoulderHub = hub(yaw, 0.4, 0.88, 0.25);
  shoulderHub.position.y = 0.92;
  mesh(roundCyl(0.22, 0.32, 0.05).rotateX(Math.PI / 2), joint, yaw, { pos: [0, 0.92, 0.6] });   // J2 motor
  mesh(roundCyl(0.15, 0.04, 0.012, 32).rotateX(Math.PI / 2), steel, yaw, { pos: [0, 0.92, 0.775] });
  const shoulder = new THREE.Group();
  shoulder.position.y = 0.92;
  yaw.add(shoulder);
  // upper arm: tapered plate with an inset graphite panel on each face, cable dressed along its back
  mesh(linkGeo(L1, 0.37, 0.3, 0.32, 0.055), paint, shoulder);
  for (const s of [-1, 1]) mesh(linkGeo(L1 - 1.1, 0.15, 0.12, 0.012, 0.004, 0.55), joint, shoulder, { pos: [0, 0, s * 0.163], cast: false });
  const cable = new THREE.CatmullRomCurve3([[-0.26, 0.22, 0.06], [-0.44, 0.62, 0.06], [-0.47, 1.15, 0.06], [-0.42, 1.68, 0.06], [-0.27, 2.06, 0.06]].map(p => new THREE.Vector3(...p)));
  mesh(new THREE.TubeGeometry(cable, 48, 0.036, 10, false), cableMat, shoulder);
  for (const y of [0.7, 1.6]) mesh(roundBox(0.14, 0.07, 0.12, 0.02), steel, shoulder, { pos: [-0.37, y, 0.06], rot: [0, 0, y > 1 ? -0.08 : 0.25], cast: false });
  // J3: the elbow
  const elbow = new THREE.Group();
  elbow.position.y = L1;
  shoulder.add(elbow);
  hub(elbow, 0.33, 0.62, 0.2);
  // forearm: slimmer plate, with its wrist motor pod on the near face
  mesh(linkGeo(L2, 0.27, 0.205, 0.26, 0.045), paint, elbow);
  for (const s of [-1, 1]) mesh(linkGeo(L2 - 0.95, 0.1, 0.08, 0.012, 0.004, 0.5), joint, elbow, { pos: [0, 0, s * 0.133], cast: false });
  mesh(roundCyl(0.1, 0.5, 0.04), joint, elbow, { pos: [0, 0.62, 0.27] });
  mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.03, 32), steel, elbow, { pos: [0, 0.9, 0.27], cast: false });
  const wrist = new THREE.Group();
  wrist.position.y = L2;
  elbow.add(wrist);
  hub(wrist, 0.22, 0.46, 0.13);
  // tool: flange, status ring, parallel gripper with rubber pads
  const tool = new THREE.Group();
  wrist.add(tool);
  mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.12, 32), steel, tool, { pos: [0, -0.26, 0] });
  mesh(roundCyl(0.175, 0.06, 0.015, 40), steel, tool, { pos: [0, -0.33, 0] });
  mesh(new THREE.TorusGeometry(0.17, 0.024, 12, 56), ledMat, tool, { pos: [0, -0.372, 0], rot: [Math.PI / 2, 0, 0], cast: false });
  mesh(roundBox(0.6, 0.14, 0.34, 0.035), joint, tool, { pos: [0, -0.44, 0] });
  mesh(new THREE.BoxGeometry(0.58, 0.03, 0.1), steel, tool, { pos: [0, -0.525, 0], cast: false });
  const fingers = [-1, 1].map(s => {
    const f = new THREE.Group(); tool.add(f);
    mesh(roundBox(0.07, 0.3, 0.22, 0.02), steel, f, { pos: [0, -0.68, 0] });
    mesh(roundBox(0.022, 0.15, 0.17, 0.006), rubber, f, { pos: [-s * 0.045, -0.75, 0], cast: false });
    return { f, s };
  });

  // two-link solve in the arm's vertical plane; r is the gripper's distance from the column, h its height
  const REACH = (L1 + L2) * 0.985, H_MIN = 0.26;
  function solve(r, h) {
    let u = Math.max(0, r), v = h + TCP - SH_Y;
    let d = Math.hypot(u, v);
    if (d > REACH) { u *= REACH / d; v *= REACH / d; d = REACH; }
    if (d < 0.9) { const k = 0.9 / Math.max(d, 1e-6); u *= k; v *= k; d = 0.9; }
    const c = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    const e = Math.acos(clamp(c, -1, 1));
    const s = Math.atan2(u, v) - Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e));
    return [clamp(s, -0.55, 1.36), clamp(e, 0.18, 2.78)];
  }
  // keep targets inside the reachable shell, so the springs never wind up past what the arm can do
  function reachable(r, h) {
    h = Math.max(H_MIN, h);
    let u = r, v = h + TCP - SH_Y;
    const d = Math.hypot(u, v);
    if (d > REACH) { u *= REACH / d; v *= REACH / d; }
    return [u, Math.max(H_MIN, v - TCP + SH_Y)];
  }

  // ----- picking: cursor ray onto the bulged plane -----
  const R0 = 1.5;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  function pick(cx, cy) {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ndc.set((cx - rect.left) / rect.width * 2 - 1, 1 - (cy - rect.top) / rect.height * 2);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    let t = -1;
    const a = d.x * d.x + d.z * d.z, b = 2 * (o.x * d.x + o.z * d.z), c = o.x * o.x + o.z * o.z - R0 * R0;
    const disc = b * b - 4 * a * c;
    if (a > 1e-9 && disc >= 0) {
      const t0 = (-b - Math.sqrt(disc)) / (2 * a);
      if (t0 > 0 && (o.x + d.x * t0) * N.x + (o.z + d.z * t0) * N.z >= 0) t = t0;
    }
    if (t < 0) {
      const den = d.x * N.x + d.z * N.z;
      if (Math.abs(den) < 1e-6) return null;
      t = -(o.x * N.x + o.z * N.z) / den;
      if (t <= 0) return null;
    }
    return hit.copy(d).multiplyScalar(t).add(o);
  }
  function targetOf(p) {
    const [r, h] = reachable(Math.hypot(p.x, p.z), p.y);
    return { phi: Math.atan2(-p.z, p.x), r, h };
  }
  function pointAt(side, toward, h) {
    return new THREE.Vector3().addScaledVector(SIDE, side).addScaledVector(N, toward).setY(h);
  }

  // ----- motion: critically damped springs on yaw, reach, height and grip -----
  const sp = {
    phi: { x: 0, v: 0, t: 0, w: 6.2 },
    r: { x: 0, v: 0, t: 0, w: 8.4 },
    h: { x: 0, v: 0, t: 0, w: 8.4 },
    g: { x: 0, v: 0, t: 0, w: 20 },
    led: { x: 0.4, v: 0, t: 0.4, w: 9 }
  };
  const KEYS = ['phi', 'r', 'h', 'g', 'led'];
  function stepSpring(p, dt, w) {
    const x0 = p.x - p.t, v0 = p.v, e = Math.exp(-w * dt), q = (v0 + w * x0) * dt;
    p.x = p.t + (x0 + q) * e;
    p.v = (v0 - w * q) * e;
    return Math.abs(p.x - p.t) > 2e-4 || Math.abs(p.v) > 2e-4;
  }

  function applyPose() {
    const [sA, eA] = solve(sp.r.x, sp.h.x);
    yaw.rotation.y = sp.phi.x;
    shoulder.rotation.z = -sA;
    elbow.rotation.z = -eA;
    wrist.rotation.z = sA + eA;          // gripper stays level whatever the joints do
    const g = clamp(sp.g.x, 0, 1.05);
    fingers.forEach(({ f, s }) => { f.position.x = s * (0.22 - 0.13 * g); });
    // status ring: dim at rest, bright while it tracks, a white flash as the gripper closes
    const b = clamp(sp.led.x, 0, 1.2);
    ledMat.color.setRGB(1, 0.79 + 0.21 * clamp(g, 0, 1), 0.2 + 0.8 * clamp(g, 0, 1) * 0.6).multiplyScalar(0.45 + 0.55 * Math.min(1, b));
  }

  // ----- layout: where the column sits on screen and how large the arm draws -----
  const stackQ = window.matchMedia('(max-width: 760px), (max-aspect-ratio: 5/6)');
  let W = 1, H = 1, stacked = false, HOME = { phi: 0, r: 2.6, h: 1.5 };
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4.2e6 / (W * H))));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    stacked = stackQ.matches;
    const copyEl = intro.querySelector('.intro-copy');
    const copy = copyEl ? copyEl.getBoundingClientRect() : null;
    let ax, ay, px;
    if (stacked) {
      // arm above the words: the free band runs from the top of the stage to the top of the copy
      const free = clamp(copy ? copy.top - r.top : H * 0.5, H * 0.32, H * 0.7);
      ax = W / 2; ay = free * 0.54;
      px = Math.min(W / 7.9, free / 5.6);
      HOME = targetOf(pointAt(2.5, 0.9, 1.45));
    } else {
      // arm in the space to the right of the words; at full stretch it stops short of them.
      // On a short screen the stage can run past the fold, so size it to the part that shows.
      const left = clamp(copy ? copy.right - r.left + 24 : W * 0.45, W * 0.36, W * 0.62);
      const vis = clamp(window.innerHeight - (r.top + window.scrollY), H * 0.5, H);
      ax = left + (W - left) * 0.56; ay = vis * 0.6;
      px = Math.min((W - left) / 6.7, vis / 7.1);
      HOME = targetOf(pointAt(-2.9, 1.0, 1.5));
    }
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = H / (2 * tanV * px);
    camera.position.copy(ANCHOR).addScaledVector(CAM_DIR, dist);
    camera.lookAt(ANCHOR);
    camera.setViewOffset(W, H, W / 2 - ax, H / 2 - ay, W, H);
    camera.updateProjectionMatrix();
    if (pointer.active) aim(pointer.x, pointer.y);
    else if (performance.now() > homingUntil) goHome();
    kick();
  }

  // ----- loop: renders only while something is still moving -----
  let running = false, last = 0, visible = true, homingUntil = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || 1 / 60);   // exact spring step, so a slow frame stays on time
    last = now;
    const slow = now < homingUntil ? 0.5 : 1;
    let moving = false;
    for (const k of KEYS) if (stepSpring(sp[k], dt, sp[k].w * (k === 'g' ? 1 : slow))) moving = true;
    applyPose();
    renderer.render(scene, camera);
    if (moving && visible) requestAnimationFrame(frame);
    else running = false;
  }
  function kick() {
    if (running || !visible) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // ----- input -----
  const pointer = { x: 0, y: 0, active: false, touching: false };
  let leaveTimer = 0, idleTimer = 0, steered = false;
  function setTarget(t, tracking) { sp.phi.t = t.phi; sp.r.t = t.r; sp.h.t = t.h; sp.led.t = tracking ? 1 : 0.4; kick(); }
  function aim(cx, cy) {
    const p = pick(cx, cy);
    if (!p) return;
    homingUntil = 0;
    setTarget(targetOf(p), true);
  }
  function goHome() { setTarget(HOME); }
  function grip(on) { sp.g.t = on ? 1 : 0; if (on) sp.led.v += 6; kick(); }
  function markSteered() {
    if (steered) return;
    steered = true;
    intro.classList.add('steered');
  }
  intro.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && !pointer.touching) return;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    clearTimeout(leaveTimer);
    aim(pointer.x, pointer.y);
    markSteered();
  }, { passive: true });
  intro.addEventListener('pointerdown', e => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    clearTimeout(leaveTimer); clearTimeout(idleTimer);
    if (e.pointerType === 'touch') pointer.touching = true;
    aim(pointer.x, pointer.y);
    grip(true);
    markSteered();
  });
  const release = e => {
    grip(false);
    if (e.pointerType === 'touch') {
      pointer.touching = false; pointer.active = false;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(goHome, 4200);   // after a tap the arm holds the spot, then parks
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  intro.addEventListener('pointerleave', e => {
    if (e.pointerType === 'touch') return;
    pointer.active = false;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(goHome, 650);
  });
  // the page moves under a still cursor while scrolling; keep reaching for it
  window.addEventListener('scroll', () => { if (pointer.active && !pointer.touching) aim(pointer.x, pointer.y); }, { passive: true });
  window.addEventListener('torque:intro-press', () => { grip(true); setTimeout(() => grip(false), 420); });

  // ----- theme -----
  function refreshTheme() {
    const bgc = new THREE.Color(cssColor('--bg'));
    darkTheme = bgc.r * 0.2126 + bgc.g * 0.7152 + bgc.b * 0.0722 < 0.25;
    drawFloor();
    // on a dark page the housings lift a little and the rim light does more of the outlining
    joint.color.set(darkTheme ? 0x3d4651 : 0x2a3037);
    rim.intensity = darkTheme ? 2.2 : 1.3;
    hemi.intensity = darkTheme ? 0.45 : 0.55;
    key.intensity = darkTheme ? 2.0 : 2.3;
    catcher.material.opacity = darkTheme ? 0.5 : 0.2;
    paint.envMapIntensity = darkTheme ? 0.7 : 0.85;
    kick();
  }
  refreshTheme();
  new MutationObserver(refreshTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshTheme);

  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) kick();
  }, { threshold: 0.01 }).observe(host);
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    host.classList.remove('gl-ready');
    window.dispatchEvent(new CustomEvent('torque:hero-fallback'));
  });

  // ----- start-up: the joints come in one after another, the way a real cell homes -----
  resize();
  for (const k of ['phi', 'r', 'h']) { sp[k].x = sp[k].t = HOME[k]; sp[k].v = 0; }
  if (!reduce) {
    sp.phi.x = HOME.phi + (stacked ? -0.9 : 0.9);
    sp.r.x = 0.95; sp.h.x = 0.8;
    homingUntil = performance.now() + 2400;
    sp.phi.t = HOME.phi; sp.r.t = 0.95; sp.h.t = 0.8;
    setTimeout(() => { if (homingUntil) { sp.h.t = HOME.h; kick(); } }, 260);
    setTimeout(() => { if (homingUntil) { sp.r.t = HOME.r; kick(); } }, 520);
  }
  applyPose();
  renderer.render(scene, camera);
  kick();
  host.classList.add('gl-ready');
  window.dispatchEvent(new CustomEvent('torque:hero-ready'));
}
