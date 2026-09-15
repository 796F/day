/* figure.js — the mannequin you can see. Everything three.js lives on this
 * side of the line; body.js and pose.js never import it.
 *
 * The look is a wooden artist's mannequin rather than a rendered human, and
 * that is a deliberate clinical choice, not a shortcut. Segments that visibly
 * end at their joints let you point at "the lower lumbar segment" and mean
 * something; a smooth continuous skin does not. It also keeps the figure
 * anatomical without being a photograph of a body, which is the right
 * register for a tool you are going to mark up with where it hurts.
 *
 * One Object3D per bone, in the same parent/child order as the skeleton, so
 * posing is a transform write per bone and anything attached to a segment —
 * a pain mark, a highlight ring, a muscle band — rides the pose for free.
 */
/* three.js comes from the UMD global rather than a module import.
 *
 * One copy, one loading mechanism, no import map. It also makes the phone app
 * able to DEFER it: 670 KB is most of this project's weight, the Today tab
 * needs none of it, and a tab that appears instantly is worth more than a
 * figure that is ready before anybody asked for one. */
const THREE = globalThis.THREE;
if (!THREE) throw new Error('three.js has not been loaded yet');
import { BONE_LABEL } from './body.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export const SKIN = {
  base: 0xcfc7ba, dark: 0x8d8478, joint: 0xb3a99a,
  left: 0x58a6ff, right: 0xf45f00,
  select: 0xf45f00, hover: 0xffb07a, highlight: 0xffd08a, strain: 0xf85149,
};

/* --------------------------------------------------------- geometry */
/** A tapered capsule along +Z, from a joint at z=0 to a joint at z=len.
 *  `bulge` puts a slight muscle belly in the middle: a limb drawn as a
 *  straight cone reads as furniture. */
function limbGeom(len, r0, r1, bulge = 0.07, radial = 20) {
  const pts = [];
  const capA = Math.min(r0, len * 0.45), capB = Math.min(r1, len * 0.45);
  for (let i = 0; i <= 5; i++) {                       // proximal cap
    const a = (-Math.PI / 2) * (1 - i / 5);
    pts.push(new THREE.Vector2(r0 * Math.cos(a), capA + capA * Math.sin(a)));
  }
  for (let i = 1; i < 9; i++) {                        // the shaft
    const t = i / 9;
    const z = capA + (len - capB - capA) * t;
    const r = (r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * t));
    pts.push(new THREE.Vector2(r, z));
  }
  for (let i = 0; i <= 5; i++) {                       // distal cap
    const a = (Math.PI / 2) * (i / 5);
    pts.push(new THREE.Vector2(r1 * Math.cos(a), len - capB + capB * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(pts, radial);
  g.rotateX(Math.PI / 2);                              // lathe axis +Y -> +Z
  g.computeVertexNormals();
  return g;
}
/** An ellipsoid in the bone's own frame: x anterior, y lateral, z along the
 *  bone. Torso segments are wider than they are deep and a mannequin that
 *  gets that backwards reads as a robot. */
function ovoidGeom(rx, ry, rz, cx = 0, cz = 0) {
  const g = new THREE.SphereGeometry(1, 30, 22);
  g.scale(rx, ry, rz);
  g.translate(cx, 0, cz);
  return g;
}

/** The head, plus the small amount of face it takes to be sure which way the
 *  figure is looking — without that, every sagittal judgement is a coin flip. */
function headGroup(shape, mat, faceMat) {
  const g = new THREE.Group();
  const skull = new THREE.Mesh(ovoidGeom(shape.rx, shape.ry, shape.rz, shape.cx, shape.cz), mat);
  g.add(skull);
  const r = shape.rz;
  const brow = new THREE.Mesh(new THREE.SphereGeometry(r * 0.10, 12, 10), faceMat);
  brow.position.set(shape.cx + shape.rx * 0.94, 0, shape.cz + r * 0.02);
  brow.scale.set(1.5, 0.7, 0.7);
  g.add(brow);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.105, 12, 10), faceMat);
    eye.position.set(shape.cx + shape.rx * 0.80, s * shape.ry * 0.46, shape.cz + r * 0.22);
    eye.scale.set(0.55, 1, 0.85);
    g.add(eye);
  }
  return g;
}

/* ------------------------------------------------------------ figure */
export class Figure {
  /** @param skel  a skeleton from buildSkeleton() */
  constructor(skel, opts = {}) {
    this.skel = skel;
    this.root = new THREE.Group();
    this.root.name = 'figure';
    this.groups = new Map();          // bone name -> Object3D, in bone space
    this.meshes = new Map();          // bone name -> Mesh (the pickable skin)
    this.mats = new Map();
    this.jointMats = new Map();       // bone name -> the material of its joint ball
    this.joints = new Map();          // bone name -> the ball mesh
    this.jointRadius = new Map();

    this.matBase = new THREE.MeshStandardMaterial({
      color: SKIN.base, roughness: 0.64, metalness: 0.0, flatShading: false,
    });
    this.matJoint = new THREE.MeshStandardMaterial({ color: SKIN.joint, roughness: 0.5, metalness: 0.02 });
    this.matFace = new THREE.MeshStandardMaterial({ color: SKIN.dark, roughness: 0.55 });

    for (const b of skel.bones) {
      const g = new THREE.Group();
      g.name = b.name;
      g.userData.bone = b.name;
      this.groups.set(b.name, g);
      // FLAT, not nested. pose.js has already solved a world transform for
      // every bone, so nesting the graph would mean converting each one back
      // into its parent's frame for no gain. Anything attached to a bone
      // group still rides the pose, which is the only property that matters.
      this.root.add(g);
      // every bone gets its own material instance: tinting one segment for
      // hover, selection or pain must not tint the whole figure
      const mat = this.matBase.clone();
      this.mats.set(b.name, mat);

      let mesh;
      if (b.shape.type === 'limb') {
        mesh = new THREE.Mesh(limbGeom(b.len, b.shape.r[0], b.shape.r[1]), mat);
      } else if (b.name === 'head') {
        mesh = headGroup(b.shape, mat, this.matFace);
        mesh.children[0].userData.bone = b.name;
      } else {
        mesh = new THREE.Mesh(ovoidGeom(b.shape.rx, b.shape.ry, b.shape.rz, b.shape.cx, b.shape.cz), mat);
      }
      mesh.userData.bone = b.name;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.traverse?.((o) => { o.castShadow = true; o.receiveShadow = true; o.userData.bone = o.userData.bone || b.name; });
      g.add(mesh);
      this.meshes.set(b.name, mesh);

      // A visible ball at the joint, the way a mannequin is built.
      //
      // It is also a PICK TARGET, and that is not cosmetic. Each segment is a
      // capsule whose end caps taper to nothing exactly at the joint, so
      // without the ball there is a hole in the silhouette at every knee,
      // elbow and shoulder — and a ray aimed at a knee goes straight through
      // it and lands on whatever is behind, which in a squat is the other
      // knee. Circling your left knee and marking your right one is the
      // symptom; this is the cause.
      if (b.parent) {
        const rr = b.shape.type === 'limb' ? b.shape.r[0] * 0.94
          : Math.min(b.shape.ry, b.shape.rx) * 0.62;
        const jm = this.matJoint.clone();
        this.jointMats.set(b.name, jm);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(rr, 20, 16), jm);
        ball.userData.bone = b.name;
        // says "the click was on the joint itself", so a mark placed here is
        // the knee rather than the top of the shin
        ball.userData.jointOf = b.name;
        ball.castShadow = true; ball.receiveShadow = true;
        this.joints.set(b.name, ball);
        g.add(ball);
        this.jointRadius.set(b.name, rr);
      }
      // a band that says which side of the body this is, without colouring
      // half the figure
      if (b.name === 'forearm_l' || b.name === 'forearm_r' || b.name === 'shin_l' || b.name === 'shin_r') {
        const c = b.side === 'L' ? SKIN.left : SKIN.right;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(b.shape.r[1] * 1.04, b.shape.r[1] * 0.13, 8, 24),
          new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, emissive: c, emissiveIntensity: 0.25 }));
        ring.position.set(0, 0, b.len * 0.86);
        ring.userData.bone = b.name;
        this.sideBands = this.sideBands || [];
        this.sideBands.push(ring);
        g.add(ring);
      }
    }
    if (opts.showBands === false) this.setBands(false);
  }

  /** Write a solved frame set onto the scene graph: one world transform per
   *  bone, no geometry touched. Called on any frame the pose changed. */
  apply(frames) {
    for (const b of this.skel.bones) {
      const g = this.groups.get(b.name), f = frames.get(b.name);
      g.position.set(f.x.p[0], f.x.p[1], f.x.p[2]);
      g.quaternion.set(f.x.q[0], f.x.q[1], f.x.q[2], f.x.q[3]);
    }
    this.root.updateMatrixWorld(true);
  }

  /** Recolour one segment. Layers are resolved highest-priority-first so a
   *  selected segment that also hurts still reads as selected. */
  paint(state = {}) {
    const { selected = new Set(), hover = null, highlight = new Map(), strain = new Set(), pain = new Map(), ghost = new Set() } = state;
    for (const b of this.skel.bones) {
      const m = this.mats.get(b.name);
      const jm = this.jointMats.get(b.name);
      let color = SKIN.base, emissive = 0x000000, ei = 0, opacity = 1;
      const heat = pain.get(b.name) || 0;
      if (heat > 0) {
        // pain shades the segment from the base colour towards red, in step
        // with the marker colours, so a limb reads as sore at a glance
        color = new THREE.Color(SKIN.base).lerp(new THREE.Color(0xff4a3d), Math.min(0.55, heat * 0.055)).getHex();
      }
      if (highlight.has(b.name)) { emissive = SKIN.highlight; ei = 0.30 + 0.18 * highlight.get(b.name); }
      if (strain.has(b.name)) { emissive = SKIN.strain; ei = 0.45; }
      if (hover === b.name) { emissive = SKIN.hover; ei = 0.34; }
      if (selected.has(b.name)) { emissive = SKIN.select; ei = 0.48; }
      if (ghost.has(b.name)) { opacity = 0.13; }
      m.color.setHex(color);
      m.emissive.setHex(emissive);
      m.emissiveIntensity = ei;
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity > 0.5;
      // the ball keeps its own slightly darker base so the figure still reads
      // as articulated, but it picks up every other state the segment does
      if (jm) {
        jm.color.setHex(heat > 0 ? color : SKIN.joint);
        jm.emissive.setHex(emissive);
        jm.emissiveIntensity = ei;
        jm.transparent = opacity < 1;
        jm.opacity = opacity;
        jm.depthWrite = opacity > 0.5;
      }
    }
  }

  setBands(on) { (this.sideBands || []).forEach((r) => { r.visible = on; }); }
  group(name) { return this.groups.get(name); }
  /** Every mesh a ray should be allowed to hit: the segments AND the balls at
   *  the joints, which is what stops a ray slipping through the gap between
   *  two capsules. Anatomy patches are deliberately not here — they are drawn
   *  on top of the body but what gets picked is the body, and the structure is
   *  worked out afterwards from where the hit landed. */
  pickTargets() { return [...this.meshes.values(), ...this.joints.values()]; }
  boneAt(object) {
    let o = object;
    while (o && !o.userData.bone) o = o.parent;
    return o ? o.userData.bone : null;
  }
  label(name) { return BONE_LABEL(name); }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }
}

/* -------------------------------------------------------- scene extras */
/** The floor: a grid the figure stands on, so height and lean have somewhere
 *  to be read against. Drawn under everything and never picked. */
export function makeGround(H) {
  const g = new THREE.Group();
  const size = H * 2.2, step = 10;
  const grid = new THREE.GridHelper(size, Math.round(size / step), 0x2e2e2e, 0x1c1c1c);
  grid.rotation.x = Math.PI / 2;
  grid.material.transparent = true; grid.material.opacity = 0.55;
  g.add(grid);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.5, 64),
    new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 1, metalness: 0 }));
  disc.receiveShadow = true;
  disc.position.z = -0.35;
  g.add(disc);
  g.userData.noPick = true;
  return g;
}

/** The plumb line and the centre-of-mass ball: the two references a posture
 *  is actually judged against. Off by default, one keystroke away. */
export function makeReferences(H) {
  const g = new THREE.Group();
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, H * 1.12)]),
    new THREE.LineDashedMaterial({ color: 0x58a6ff, dashSize: 3, gapSize: 3, transparent: true, opacity: 0.7 }));
  line.computeLineDistances();
  const com = new THREE.Mesh(
    new THREE.SphereGeometry(H * 0.016, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.85 }));
  const base = new THREE.Mesh(
    new THREE.RingGeometry(H * 0.012, H * 0.016, 32),
    new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  base.position.z = 0.4;
  g.add(line, com, base);
  g.userData.noPick = true;
  g.userData.parts = { line, com, base };
  return g;
}
export function placeReferences(refs, com) {
  const { line, com: ball, base } = refs.userData.parts;
  line.position.set(com[0], com[1], 0);
  ball.position.set(com[0], com[1], com[2]);
  base.position.set(com[0], com[1], 0.4);
}

/* ---------------------------------------------------------- anatomy */
/** Mesh one parametric patch from anatomy.js. A grid rather than a stock
 *  geometry because the patch has to follow the segment it lies on exactly —
 *  a muscle floating a centimetre off the leg reads as a mistake. */
/**
 * Mesh one parametric patch from anatomy.js.
 *
 * A grid rather than a stock geometry, because the patch has to follow the
 * segment it lies on exactly — a muscle floating a centimetre off the leg
 * reads as a mistake.
 *
 * The alpha in the vertex colours is what stops it reading as a sticker.
 * A muscle does not have a rectangular border, and a patch drawn with one
 * looks like tape rather than anatomy, so every patch fades out towards its
 * own edge. `wrap` says the arc goes all the way round and has no side edges
 * to fade.
 */
function patchGeom(patch, { nu = 12, na = 16, wrap = false } = {}, colour = 0xffffff) {
  const pos = [], col = [], idx = [];
  const c = new THREE.Color(colour);
  const edge = (t) => THREE.MathUtils.smoothstep(Math.min(t, 1 - t), 0, 0.26);
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= na; j++) {
      const u = i / nu, v = j / na;
      const p = patch.point(u, patch.a0 + (patch.a1 - patch.a0) * v);
      pos.push(p[0], p[1], p[2]);
      col.push(c.r, c.g, c.b, edge(u) * (wrap ? 1 : edge(v)));
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < na; j++) {
      const k = i * (na + 1) + j;
      idx.push(k, k + 1, k + na + 1, k + 1, k + na + 2, k + na + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The muscles, tendons, ligaments and joints, drawn onto the segments they
 * belong to.
 *
 * Attached to the bone groups, so they bend with the figure for nothing. Never
 * pick targets: the body is what gets picked and the structure is worked out
 * from where the hit landed, which means a structure can be named whether or
 * not this layer is switched on.
 */
export class AnatomyLayer {
  constructor(figure, skel, anatomy, patchOf) {
    this.figure = figure;
    this.anatomy = anatomy;
    this.meshes = new Map();          // structure id -> [meshes]
    this.mats = new Map();            // structure id -> [materials]
    this.visible = false;
    this.focus = null;

    for (const s of anatomy.list) {
      const made = [], mats = [];
      for (const r of s.regions) {
        const host = figure.group(r.bone);
        if (!host) continue;
        let geom;
        if (r.sphere) {
          const rr = (figure.jointRadius.get(r.bone) || 3) * 1.07;
          geom = new THREE.SphereGeometry(rr, 20, 16);
        } else {
          const patch = patchOf(skel, r);
          if (!patch) continue;
          geom = patchGeom(patch, { wrap: r.width >= 350 }, s.colour);
        }
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0,
          transparent: true, opacity: 0, depthWrite: false,
          // patches sit a few millimetres off a curved surface; the offset
          // stops them flickering against it at grazing angles
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = s.kind === 'joint' ? 3 : 2;
        mesh.visible = false;
        mesh.userData.structure = s.id;
        host.add(mesh);
        made.push(mesh); mats.push(mat);
      }
      if (made.length) { this.meshes.set(s.id, made); this.mats.set(s.id, mats); }
    }
  }

  /** @param mode 'off' | 'muscles' | 'all'
   *  @param focus  a structure id to show regardless, and brighter — which is
   *                what makes "point at this one" work with the layer off */
  paint({ mode = 'off', focus = null, selected = null, sore = new Map() } = {}) {
    for (const s of this.anatomy.list) {
      const mats = this.mats.get(s.id);
      if (!mats) continue;
      const shown = mode === 'all' ? true
        : mode === 'muscles' ? (s.kind === 'muscle' || s.kind === 'tendon' || s.kind === 'fascia')
          : false;
      const isFocus = focus === s.id, isSel = selected === s.id;
      const heat = sore.get(s.id) || 0;
      let opacity = 0;
      if (isSel) opacity = 0.82;
      else if (isFocus) opacity = 0.66;
      else if (heat > 0) opacity = Math.min(0.6, 0.22 + heat * 0.045);
      else if (shown) opacity = s.deep ? 0.16 : 0.3;
      for (const m of mats) {
        m.opacity = opacity;
        m.emissive.setHex(isSel || isFocus ? s.colour : 0x000000);
        m.emissiveIntensity = isSel ? 0.5 : isFocus ? 0.32 : 0;
      }
      for (const mesh of this.meshes.get(s.id)) mesh.visible = opacity > 0.01;
    }
    this.visible = mode !== 'off';
  }

  dispose() {
    for (const list of this.meshes.values()) {
      for (const m of list) {
        m.parent && m.parent.remove(m);
        m.geometry.dispose(); m.material.dispose();
      }
    }
    this.meshes.clear(); this.mats.clear();
  }
}

/* ------------------------------------------------------------- props */
/** The step, the wall, the chair. Neutral and matte so they read as scenery
 *  and never compete with the body or with a pain mark. Never pick targets. */
export class PropLayer {
  constructor() {
    this.group = new THREE.Group();
    this.group.userData.noPick = true;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.95, metalness: 0 });
    this.edge = new THREE.LineBasicMaterial({ color: 0x3c4046, transparent: true, opacity: 0.85 });
    this.built = '';
  }
  /** Rebuild only when the props actually change — they are furniture, and
   *  furniture does not move during a repetition. */
  set(specs) {
    const stamp = JSON.stringify(specs);
    if (stamp === this.built) return;
    this.built = stamp;
    while (this.group.children.length) {
      const c = this.group.children.pop();
      c.traverse((o) => { o.geometry && o.geometry.dispose(); });
      this.group.remove(c);
    }
    for (const s of specs) {
      const g = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);
      const m = new THREE.Mesh(g, this.mat);
      m.position.set(s.centre[0], s.centre[1], s.centre[2]);
      m.receiveShadow = true;
      m.castShadow = s.kind !== 'mat';
      m.userData.noPick = true;
      // a wall is context; framing the camera to it would shrink the figure
      m.userData.framed = s.kind !== 'wall';
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(g), this.edge);
      line.userData.framed = m.userData.framed;
      line.position.copy(m.position);
      this.group.add(m, line);
    }
  }
  clear() { this.set([]); }
}

/* --------------------------------------------------------------- held */
/**
 * The dumbbell, the band, the dowel, the strap.
 *
 * Separate from PropLayer because furniture does not move during a repetition
 * and equipment does. The step stays where it was put; the dumbbell goes
 * wherever the hand goes, so this rebuilds from the current frame every time
 * the pose changes.
 *
 * Everything is a cylinder between two points, which is enough: a band, a
 * strap and a broom handle differ in colour and thickness, not in shape, and a
 * dumbbell is a cylinder with a block on each end. The point is not fidelity.
 * The point is that the viewer can see there IS something in the hands, and
 * where it is anchored — under the foot, between the hands, round the arch —
 * because that is the part of an exercise that gets imagined wrongly.
 */
export class HeldLayer {
  constructor() {
    this.group = new THREE.Group();
    this.group.userData.noPick = true;
    this.group.userData.framed = false;   // equipment must not drive the camera
    this.mats = {
      // low metalness on purpose: there is no environment map in the phone
      // player, so a metallic surface has nothing to reflect except the warm
      // rim light, and a dark chrome dumbbell comes out looking like a stick
      dumbbell: new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.55, metalness: 0.2 }),
      band: new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.75, metalness: 0 }),
      strap: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9, metalness: 0 }),
      stick: new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.8, metalness: 0 }),
    };
    this.rod = new THREE.CylinderGeometry(1, 1, 1, 14);
    this.block = new THREE.BoxGeometry(1, 1, 1);
    this.pool = [];
    this.used = 0;
  }

  take(geom, mat) {
    let m = this.pool[this.used];
    if (!m || m.userData.geomKind !== geom) {
      if (m) { this.group.remove(m); }
      m = new THREE.Mesh(geom === 'rod' ? this.rod : this.block, mat);
      m.userData.geomKind = geom;
      m.castShadow = true;
      m.userData.noPick = true;
      m.userData.framed = false;
      this.pool[this.used] = m;
      this.group.add(m);
    }
    m.material = mat;
    m.visible = true;
    this.used++;
    return m;
  }

  /** Orient a unit-Y shape so it spans a -> b, with the given cross-section. */
  static span(mesh, a, b, w, h = w) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const len = Math.max(d.length(), 0.01);
    mesh.position.copy(A).addScaledVector(d, 0.5);
    mesh.scale.set(w, len, h);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  /** @param specs from placeHeld() */
  set(specs) {
    this.used = 0;
    for (const s of specs) {
      const mat = this.mats[s.kind] || this.mats.band;
      HeldLayer.span(this.take('rod', mat), s.a, s.b, s.r * 2);
      if (s.kind === 'dumbbell') {
        const d = new THREE.Vector3(...s.b).sub(new THREE.Vector3(...s.a)).normalize();
        // round plates, not blocks: seen end-on from a side view (which is
        // where most of these are filmed from) a disc reads as a weight and a
        // cube reads as a mistake
        for (const end of [s.a, s.b]) {
          const m = this.take('rod', mat);
          m.position.copy(new THREE.Vector3(...end));
          m.scale.set(s.plate, s.plate * 0.62, s.plate);
          m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        }
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  clear() { this.set([]); }
  dispose() {
    this.rod.dispose(); this.block.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

/* -------------------------------------------------------------- ghost */
/** A faint copy of the figure frozen at the start of a repetition.
 *
 *  A still frame of a mannequin mid-movement does not tell you what moved. The
 *  thing a workout video gives you for free — seeing the start and the end of
 *  the rep in the same glance — has to be drawn in here, and this is the
 *  cheapest honest version of it: the same body, where it began. */
export class Ghost {
  constructor(skel) {
    this.skel = skel;
    this.figure = new Figure(skel, { showBands: false });
    this.root = this.figure.root;
    this.root.userData.noPick = true;
    for (const m of [...this.figure.mats.values(), ...this.figure.jointMats.values()]) {
      m.transparent = true; m.opacity = 0.13; m.depthWrite = false;
      m.color.setHex(0x9fb4c8); m.emissive.setHex(0x24405c); m.emissiveIntensity = 0.2;
    }
    this.root.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.renderOrder = -1; });
    this.root.visible = false;
  }
  showAt(frames) { this.figure.apply(frames); this.root.visible = true; }
  hide() { this.root.visible = false; }
  dispose() { this.figure.dispose(); }
}

/* -------------------------------------------------------- close-up */
/**
 * A detailed joint, drawn on top of the mannequin's own segments.
 *
 * The parts that belong to one bone are parented to it and then never touched
 * again. The tendons and ligaments CROSS the joint, so they are rebuilt every
 * frame between one anchor on the femur and one on the tibia — which is what
 * keeps them attached at both ends whatever angle the knee is at. A ligament
 * that detaches when you bend the knee is worse than no ligament.
 */
export class DetailLayer {
  constructor(figure, detail, colours) {
    this.figure = figure;
    this.detail = detail;
    this.meshes = new Map();
    this.bands = [];
    this.group = new THREE.Group();
    this.group.userData.noPick = true;
    this.visible = false;

    for (const p of detail.parts) {
      const host = figure.group(p.bone);
      if (!host) continue;
      const g = new THREE.SphereGeometry(1, 22, 16);
      g.scale(p.size[0], p.size[1], p.size[2]);
      const mat = new THREE.MeshStandardMaterial({
        color: colours[p.kind] || 0xcccccc, roughness: 0.55, metalness: 0.03,
        transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
      mesh.renderOrder = 6;
      mesh.visible = false;
      mesh.userData.detail = p.id;
      host.add(mesh);
      this.meshes.set(p.id, { mesh, mat, spec: p });
    }
    for (const b of detail.bands) {
      const g = new THREE.CylinderGeometry(b.width / 2, b.width / 2, 1, 14, 1, false);
      const mat = new THREE.MeshStandardMaterial({
        color: colours[b.kind] || 0xcccccc, roughness: 0.6, metalness: 0,
        transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 6;
      mesh.visible = false;
      mesh.userData.detail = b.id;
      this.group.add(mesh);
      this.bands.push({ mesh, mat, spec: b });
      this.meshes.set(b.id, { mesh, mat, spec: b });
    }
  }

  /** Re-stretch the crossing structures between their two anchors. */
  update() {
    if (!this.visible) return;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), mid = new THREE.Vector3();
    for (const { mesh, spec } of this.bands) {
      const ga = this.figure.group(spec.a.bone), gb = this.figure.group(spec.b.bone);
      if (!ga || !gb) continue;
      ga.updateMatrixWorld(); gb.updateMatrixWorld();
      A.set(...spec.a.pos).applyMatrix4(ga.matrixWorld);
      B.set(...spec.b.pos).applyMatrix4(gb.matrixWorld);
      const len = A.distanceTo(B);
      mid.addVectors(A, B).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.scale.set(1, Math.max(0.01, len), 1);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    }
  }

  /** Where each labelled thing is in world space, for placing the callouts. */
  anchors() {
    const out = [];
    const v = new THREE.Vector3();
    for (const [id, { mesh, spec }] of this.meshes) {
      if (!mesh.visible) continue;
      mesh.updateMatrixWorld();
      v.setFromMatrixPosition(mesh.matrixWorld);
      out.push({ id, name: spec.name, kind: spec.kind, pos: v.clone(), highlight: !!spec.highlight });
    }
    return out;
  }

  show(on, { focus = null } = {}) {
    this.visible = on;
    for (const [id, { mesh, mat, spec }] of this.meshes) {
      mesh.visible = on;
      if (!on) continue;
      const isFocus = focus === id;
      mat.opacity = isFocus ? 1 : spec.kind === 'bone' ? 0.92 : 0.85;
      mat.emissive.setHex(isFocus ? 0xffffff : 0x000000);
      mat.emissiveIntensity = isFocus ? 0.45 : 0;
    }
    this.update();
  }
  dispose() {
    for (const { mesh } of this.meshes.values()) {
      mesh.parent && mesh.parent.remove(mesh);
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    this.meshes.clear(); this.bands = [];
  }
}
