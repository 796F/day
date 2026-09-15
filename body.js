/* body.js — the mannequin's skeleton: where the joints are, how far each one
 * is allowed to travel, and what a clinician calls the motion.
 *
 * NO THREE.JS HERE. This file and pose.js are the part that has to be right;
 * figure.js is the part that has to be pretty. Everything below runs under
 * bare node, which is how selftest.mjs can assert that hip flexion puts the
 * knee in front of the hip.
 *
 * ANTHROPOMETRY. Segment lengths are Drillis & Contini proportions — the
 * fractions-of-stature table that biomechanics has used since 1966 — so
 * changing the height slider rescales a real body rather than a guess, and
 * the male and female figures differ in the places they actually differ:
 * biacromial breadth, bi-iliac breadth, and the Q-angle that follows from
 * them. Segment masses are Dempster's fractions, which is what lets the app
 * say "your head weighs 4.6 kg" instead of hand-waving about load.
 *
 * THE JOINT MODEL. Every joint is three numbers in degrees:
 *
 *     flex   flexion / extension      (sagittal)
 *     abd    abduction / adduction    (frontal)
 *     rot    internal / external      (transverse)
 *
 * always in the PARENT bone's frame and always composed in that order
 * (q = Rflex * Rabd * Rrot), which is the order a goniometer is read in. The
 * numbers are signed so that POSITIVE IS THE NAMED DIRECTION on both sides of
 * the body — 90 is 90 degrees of abduction whether it is the left shoulder or
 * the right. The bookkeeping that makes that true lives in `sign` and
 * `mirror` on each joint kind, and nowhere else; nothing downstream — not the
 * IK, not the exercise tracks, not the agent — ever has to think about which
 * way a raw axis happens to point.
 *
 * BONE FRAMES are authored as two vectors, `dir` (down the bone) and `front`
 * (which way is anterior/dorsal), rather than as three rest angles. A limb
 * hanging straight down is the antiparallel case for "shortest rotation
 * between two vectors", where every perpendicular axis is equally valid and
 * the one the maths happens to pick silently decides whether the knee bends
 * forwards or backwards. Two vectors leave nothing to pick.
 */
import { DEG, qid, qmul, qaxis, frameQuat, qToYXZ, vlen, vrot, xid, xmul, clamp } from './math.js';

/* ------------------------------------------------------- joint kinds */
/* labels[axis] = [what negative is called, what positive is called]
 * limits[axis] = [min, max] degrees, healthy adult active range
 * sign[axis]   = which way the raw rotation has to go to make positive mean
 *                the named thing (see the header)
 * mirror       = true when the right side needs abd/rot negated, which is
 *                every bilateral joint: "abduction" is a mirrored word. */
export const JOINT_KINDS = {
  root: {
    label: 'whole body', limits: { flex: [-90, 90], abd: [-90, 90], rot: [-180, 180] },
    sign: { flex: -1, abd: 1, rot: 1 }, mirror: false,
    labels: { flex: ['lean back', 'lean forward'], abd: ['lean right', 'lean left'], rot: ['turn right', 'turn left'] },
  },
  pelvis: {
    label: 'pelvis', limits: { flex: [-20, 25], abd: [-18, 18], rot: [-25, 25] },
    sign: { flex: -1, abd: 1, rot: 1 }, mirror: false,
    labels: { flex: ['posterior tilt', 'anterior tilt'], abd: ['right hip hike', 'left hip hike'], rot: ['right rotation', 'left rotation'] },
  },
  lumbar: {
    label: 'lumbar spine', limits: { flex: [-13, 30], abd: [-13, 13], rot: [-6, 6] },
    sign: { flex: -1, abd: -1, rot: 1 }, mirror: false,
    labels: { flex: ['extension', 'flexion'], abd: ['right side-bend', 'left side-bend'], rot: ['right rotation', 'left rotation'] },
  },
  thoracic: {
    label: 'thoracic spine', limits: { flex: [-11, 18], abd: [-14, 14], rot: [-19, 19] },
    sign: { flex: -1, abd: -1, rot: 1 }, mirror: false,
    labels: { flex: ['extension', 'flexion'], abd: ['right side-bend', 'left side-bend'], rot: ['right rotation', 'left rotation'] },
  },
  neck: {
    label: 'cervical spine', limits: { flex: [-55, 45], abd: [-40, 40], rot: [-70, 70] },
    sign: { flex: -1, abd: -1, rot: 1 }, mirror: false,
    labels: { flex: ['extension', 'flexion'], abd: ['right side-bend', 'left side-bend'], rot: ['right rotation', 'left rotation'] },
  },
  skull: {
    label: 'upper cervical', limits: { flex: [-25, 25], abd: [-10, 10], rot: [-15, 15] },
    sign: { flex: -1, abd: -1, rot: 1 }, mirror: false,
    labels: { flex: ['chin poke', 'chin tuck'], abd: ['right tilt', 'left tilt'], rot: ['right turn', 'left turn'] },
  },
  clavicle: {
    label: 'shoulder girdle', limits: { flex: [-22, 28], abd: [-12, 40], rot: [-15, 15] },
    sign: { flex: 1, abd: 1, rot: 1 }, mirror: true,
    labels: { flex: ['retraction', 'protraction'], abd: ['depression', 'elevation'], rot: ['posterior tilt', 'anterior tilt'] },
  },
  shoulder: {
    label: 'glenohumeral', limits: { flex: [-60, 180], abd: [-40, 180], rot: [-90, 95] },
    sign: { flex: 1, abd: 1, rot: 1 }, mirror: true,
    labels: { flex: ['extension', 'flexion'], abd: ['adduction', 'abduction'], rot: ['internal rotation', 'external rotation'] },
  },
  elbow: {
    label: 'elbow', limits: { flex: [-10, 150], abd: [-6, 12], rot: [-85, 90] },
    sign: { flex: -1, abd: 1, rot: -1 }, mirror: true,
    labels: { flex: ['hyperextension', 'flexion'], abd: ['varus', 'valgus (carrying angle)'], rot: ['pronation', 'supination'] },
  },
  wrist: {
    label: 'wrist', limits: { flex: [-70, 80], abd: [-30, 20], rot: [-5, 5] },
    sign: { flex: -1, abd: 1, rot: 1 }, mirror: true,
    labels: { flex: ['extension', 'flexion'], abd: ['ulnar deviation', 'radial deviation'], rot: ['—', '—'] },
  },
  hip: {
    label: 'hip', limits: { flex: [-25, 125], abd: [-30, 48], rot: [-45, 45] },
    sign: { flex: 1, abd: 1, rot: 1 }, mirror: true,
    labels: { flex: ['extension', 'flexion'], abd: ['adduction', 'abduction'], rot: ['internal rotation', 'external rotation'] },
  },
  knee: {
    label: 'knee', limits: { flex: [-8, 150], abd: [-8, 8], rot: [-12, 22] },
    sign: { flex: 1, abd: -1, rot: 1 }, mirror: true,
    labels: { flex: ['hyperextension', 'flexion'], abd: ['varus (bow-leg)', 'valgus (knee-in)'], rot: ['internal rotation', 'external rotation'] },
  },
  ankle: {
    label: 'ankle', limits: { flex: [-50, 25], abd: [-30, 18], rot: [-18, 18] },
    sign: { flex: -1, abd: 1, rot: 1 }, mirror: true,
    labels: { flex: ['plantarflexion', 'dorsiflexion'], abd: ['inversion', 'eversion'], rot: ['toe-in', 'toe-out'] },
  },
  toes: {
    label: 'toes (MTP)', limits: { flex: [-35, 75], abd: [-5, 5], rot: [-5, 5] },
    sign: { flex: -1, abd: 1, rot: 1 }, mirror: false,
    labels: { flex: ['flexion', 'extension'], abd: ['—', '—'], rot: ['—', '—'] },
  },
};

/* ---------------------------------------------------------- subjects */
/* Everything is a fraction of stature H except mass. The two sexes differ in
 * the four places that change how a body loads itself: shoulder breadth, hip
 * breadth, the knee-to-hip offset those two produce (the Q-angle), and the
 * mass carried above the pelvis. */
export const SUBJECTS = {
  male: {
    id: 'male', label: 'male · average build', H: 175, mass: 78,
    hipY: 0.095, kneeY: 0.076, ghY: 0.111, scY: 0.018, biacromial: 0.259, biiliac: 0.191,
    girth: 1.00, bust: 0,
  },
  female: {
    id: 'female', label: 'female · average build', H: 162, mass: 65,
    hipY: 0.101, kneeY: 0.073, ghY: 0.103, scY: 0.017, biacromial: 0.245, biiliac: 0.200,
    girth: 0.93, bust: 1,
  },
};

/* Vertical landmarks, fraction of stature, measured standing. These are the
 * numbers every segment length below is a difference of, so a change here
 * moves the whole figure consistently. */
export const LM = {
  ankle: 0.039, knee: 0.285, hip: 0.520, l5s1: 0.570, l3: 0.633,
  t12: 0.696, t6: 0.775, c7: 0.860, occiput: 0.905, vertex: 1.000,
  scZ: 0.845, ghZ: 0.805, scX: 0.030, ghX: 0.015,
};

/* Sagittal rest tilt of each spinal segment, degrees, positive = the segment
 * leans ANTERIOR. This is the curve a person actually stands in — a lordotic
 * lumbar spine, a kyphotic thorax, a lordotic neck — and it is baked into the
 * REST geometry rather than into a pose on purpose: it makes "zero" mean
 * standing neutral, so that "lumbar flexion 20 degrees" is 20 degrees from
 * how this person stands, which is what a clinician means by it. The tilts
 * sum to zero through the head, so the plumb line comes back and the eyes
 * finish level. */
const CURVE = {
  // The pelvis itself stays upright. The sacral slope that a real pelvis
  // carries belongs ABOVE the hip joints, not below them: baking it into the
  // pelvis bone rotates the acetabula, and with them both femurs, which walks
  // the whole figure backwards off its own feet.
  pelvis: 0, lumbar_lower: -4, lumbar_upper: -11,
  thorax_lower: 9, thorax_upper: 6, neck: -7, head: 7,
};
const tilt = (deg) => [Math.sin(deg * DEG), 0, Math.cos(deg * DEG)];

/* Dempster segment masses as a percent of body mass, normalised at build. */
const MASS = {
  head: 6.8, neck: 1.3, thoraxUp: 11.0, thoraxLow: 10.6, lumbarUp: 7.0, lumbarLow: 6.9,
  pelvis: 14.2, clavicle: 0.5, upperarm: 2.7, forearm: 1.6, hand: 0.6,
  thigh: 10.0, shin: 4.35, foot: 1.2, toes: 0.25,
};

/* Segment radii, fraction of stature, male reference. Multiplied by `girth`
 * (sex) and by the build slider. Limbs are r0 (proximal) -> r1 (distal);
 * torso segments are ellipsoid half-axes in the bone's own frame, where x is
 * anterior-posterior and y is side-to-side — a torso is wider than it is
 * deep, and a mannequin that gets that backwards reads as a robot. */
const GIRTH = {
  pelvis: { rx: 0.055, ry: 0.092, rz: 0.060, cx: -0.013, cz: 0.022 },
  lumbarLow: { rx: 0.052, ry: 0.072, rz: 0.047, cx: 0.002, cz: 0.031 },
  lumbarUp: { rx: 0.053, ry: 0.074, rz: 0.047, cx: 0.001, cz: 0.031 },
  thoraxLow: { rx: 0.058, ry: 0.084, rz: 0.055, cx: 0.000, cz: 0.039 },
  thoraxUp: { rx: 0.060, ry: 0.093, rz: 0.058, cx: 0.000, cz: 0.041 },
  head: { rx: 0.060, ry: 0.045, rz: 0.055, cx: 0.007, cz: 0.045 },
  neck: [0.028, 0.026], clavicle: [0.017, 0.031],
  upperarm: [0.030, 0.023], forearm: [0.025, 0.017],
  hand: { rx: 0.011, ry: 0.026, rz: 0.054, cx: 0, cz: 0.048 },
  thigh: [0.059, 0.038], shin: [0.039, 0.022],
  foot: { rx: 0.022, ry: 0.024, rz: 0.061, cx: -0.018, cz: 0.024 },
  // toes are a flattened pad, not a sausage: a capsule here reads as one
  // enormous big toe and pulls the eye straight to it
  toes: { rx: 0.014, ry: 0.026, rz: 0.025, cx: -0.002, cz: 0.017 },
};

/** Resolve the subject sliders into the one struct everything else reads. */
export function makeSubject(opts = {}) {
  const base = SUBJECTS[opts.sex === 'female' ? 'female' : 'male'];
  const H = opts.height || base.H;
  // Build is entered as a BMI-ish dial, not as a girth multiplier: mass is
  // what a person knows about themselves. Radii go as the square root of mass
  // per unit height, which is what keeps a heavier figure the same height.
  const mass = opts.mass || Math.round(base.mass * (H / base.H) ** 2);
  const refMass = base.mass * (H / base.H) ** 2;
  return { ...base, H, mass, girthScale: base.girth * Math.sqrt(mass / refMass) };
}

/* ------------------------------------------------------- the skeleton */
/** One bone. `dir`/`front` are in the PARENT's frame and define this bone's
 *  rest frame; `offset` is in the parent's frame too, from the parent's own
 *  origin. `childRest` overrides the frame that this bone's children are
 *  posed in — only the clavicle uses it, so that shoulder angles come out as
 *  the clinical glenohumeral angles against the torso instead of against a
 *  collarbone that happens to point up and out. */
function bone(b) {
  const kind = JOINT_KINDS[b.kind];
  const mirror = b.side === 'R' && kind.mirror;
  return {
    ...b,
    kindRef: kind,
    rest: frameQuat(b.dir, b.front || [1, 0, 0]),
    childRest: b.childDir ? frameQuat(b.childDir, b.childFront || [1, 0, 0]) : null,
    sign: {
      flex: kind.sign.flex,
      abd: kind.sign.abd * (mirror ? -1 : 1),
      rot: kind.sign.rot * (mirror ? -1 : 1),
    },
    limits: kind.limits,
    labels: kind.labels,
  };
}

/** Build the whole articulated figure for a subject.
 *  Returns { subject, bones (in parent-before-child order), byName, chains }.
 *  Lengths and offsets come out in CENTIMETRES — the unit a clinician says
 *  out loud, and small enough numbers that the camera and the HUD agree. */
export function buildSkeleton(opts = {}) {
  const S = makeSubject(opts);
  const H = S.H, g = S.girthScale;
  const cm = (f) => f * H;
  const R = (k) => (Array.isArray(GIRTH[k])
    ? GIRTH[k].map((r) => r * H * g)
    : Object.fromEntries(Object.entries(GIRTH[k]).map(([p, v]) =>
      // centres are positions on the bone and scale with height only; radii
      // are girth and scale with build as well
      [p, v * H * (p[0] === 'c' ? 1 : g)])));

  const L = {
    pelvis: cm(LM.l5s1 - LM.hip),
    lumbarLow: cm(LM.l3 - LM.l5s1),
    lumbarUp: cm(LM.t12 - LM.l3),
    thoraxLow: cm(LM.t6 - LM.t12),
    thoraxUp: cm(LM.c7 - LM.t6),
    neck: cm(LM.occiput - LM.c7),
    head: cm(LM.vertex - LM.occiput),
    upperarm: cm(0.186), forearm: cm(0.146), hand: cm(0.108),
    foot: cm(0.085), toes: cm(0.037),
  };
  // The clavicle and the femur are the two bones whose direction carries the
  // sex difference, so both are derived from the breadth numbers rather than
  // tabulated: a wider pelvis with a narrower stance is exactly what a larger
  // Q-angle is, and it falls out of the arithmetic instead of being asserted.
  const clav = [cm(LM.ghX - LM.scX), cm(S.ghY - S.scY), cm(LM.ghZ - LM.scZ)];
  const femur = [0, cm(S.kneeY - S.hipY), cm(LM.knee - LM.hip)];
  const qAngle = Math.atan2(-femur[1], -femur[2]) / DEG;   // knee medial to hip

  const list = [];
  const add = (b) => { list.push(bone(b)); return b.name; };

  add({ name: 'pelvis', parent: null, kind: 'pelvis', group: 'trunk', side: null,
    offset: [0, 0, 0], dir: tilt(CURVE.pelvis), len: L.pelvis, shape: { type: 'ovoid', ...R('pelvis') }, mass: MASS.pelvis });
  add({ name: 'lumbar_lower', parent: 'pelvis', kind: 'lumbar', group: 'trunk', side: null, region: 'low back',
    offset: [0, 0, L.pelvis], dir: tilt(CURVE.lumbar_lower), len: L.lumbarLow, shape: { type: 'ovoid', ...R('lumbarLow') }, mass: MASS.lumbarLow });
  add({ name: 'lumbar_upper', parent: 'lumbar_lower', kind: 'lumbar', group: 'trunk', side: null, region: 'low back',
    offset: [0, 0, L.lumbarLow], dir: tilt(CURVE.lumbar_upper), len: L.lumbarUp, shape: { type: 'ovoid', ...R('lumbarUp') }, mass: MASS.lumbarUp });
  add({ name: 'thorax_lower', parent: 'lumbar_upper', kind: 'thoracic', group: 'trunk', side: null, region: 'mid back',
    offset: [0, 0, L.lumbarUp], dir: tilt(CURVE.thorax_lower), len: L.thoraxLow, shape: { type: 'ovoid', ...R('thoraxLow') }, mass: MASS.thoraxLow });
  add({ name: 'thorax_upper', parent: 'thorax_lower', kind: 'thoracic', group: 'trunk', side: null, region: 'upper back',
    offset: [0, 0, L.thoraxLow], dir: tilt(CURVE.thorax_upper), len: L.thoraxUp,
    shape: { type: 'ovoid', ...R('thoraxUp'), bust: S.bust ? cm(0.030) * g : 0 }, mass: MASS.thoraxUp });
  add({ name: 'neck', parent: 'thorax_upper', kind: 'neck', group: 'head', side: null, region: 'neck',
    offset: [0, 0, L.thoraxUp], dir: tilt(CURVE.neck), len: L.neck, shape: { type: 'limb', r: R('neck') }, mass: MASS.neck });
  add({ name: 'head', parent: 'neck', kind: 'skull', group: 'head', side: null, region: 'head',
    offset: [0, 0, L.neck], dir: tilt(CURVE.head), len: L.head, shape: { type: 'ovoid', ...R('head'), face: true }, mass: MASS.head });

  for (const side of ['L', 'R']) {
    const m = side === 'L' ? 1 : -1;                 // +Y is the subject's left
    const sfx = '_' + side.toLowerCase();
    add({ name: 'clavicle' + sfx, parent: 'thorax_upper', kind: 'clavicle', group: 'arm', side, region: 'shoulder girdle',
      offset: [cm(LM.scX), m * cm(S.scY), cm(LM.scZ - LM.t6)],
      dir: [clav[0], m * clav[1], clav[2]], front: [1, 0, 0],
      // children of the clavicle are posed against the torso, not against it
      childDir: [0, 0, 1], childFront: [1, 0, 0],
      len: vlen(clav), shape: { type: 'limb', r: R('clavicle') }, mass: MASS.clavicle });
    add({ name: 'upperarm' + sfx, parent: 'clavicle' + sfx, kind: 'shoulder', group: 'arm', side, region: 'upper arm',
      offset: [clav[0], m * clav[1], clav[2]],       // in the torso frame, see childDir
      dir: [0, m * 0.07, -0.9975], front: [1, 0, 0],
      len: L.upperarm, shape: { type: 'limb', r: R('upperarm') }, mass: MASS.upperarm });
    add({ name: 'forearm' + sfx, parent: 'upperarm' + sfx, kind: 'elbow', group: 'arm', side, region: 'forearm',
      offset: [0, 0, L.upperarm], dir: [0, 0, 1], front: [1, 0, 0],
      len: L.forearm, shape: { type: 'limb', r: R('forearm') }, mass: MASS.forearm });
    add({ name: 'hand' + sfx, parent: 'forearm' + sfx, kind: 'wrist', group: 'arm', side, region: 'hand',
      offset: [0, 0, L.forearm], dir: [0, 0, 1], front: [1, 0, 0],
      len: L.hand, shape: { type: 'ovoid', ...R('hand') }, mass: MASS.hand });

    add({ name: 'thigh' + sfx, parent: 'pelvis', kind: 'hip', group: 'leg', side, region: 'thigh',
      offset: [0, m * cm(S.hipY), 0],
      dir: [femur[0], m * femur[1], femur[2]], front: [1, 0, 0],
      len: vlen(femur), shape: { type: 'limb', r: R('thigh') }, mass: MASS.thigh });
    add({ name: 'shin' + sfx, parent: 'thigh' + sfx, kind: 'knee', group: 'leg', side, region: 'lower leg',
      offset: [0, 0, vlen(femur)], dir: [0, 0, 1], front: [1, 0, 0],
      len: cm(LM.knee - LM.ankle), shape: { type: 'limb', r: R('shin') }, mass: MASS.shin });
    add({ name: 'foot' + sfx, parent: 'shin' + sfx, kind: 'ankle', group: 'leg', side, region: 'foot',
      offset: [0, 0, cm(LM.knee - LM.ankle)],
      // anterior and 11 degrees below horizontal: the ankle is above the ball
      // of the foot, which is what puts the heel on the floor at rest
      dir: [0.980, 0, 0.199], front: [0, 0, -1],
      len: L.foot, shape: { type: 'foot', ...R('foot') }, mass: MASS.foot });
    add({ name: 'toes' + sfx, parent: 'foot' + sfx, kind: 'toes', group: 'leg', side, region: 'toes',
      offset: [0, 0, L.foot], dir: [0, 0, 1], front: [0, 0, -1],
      len: L.toes, shape: { type: 'ovoid', ...R('toes') }, mass: MASS.toes });
  }

  // The spine is curved, so the straight-line landmark differences above are
  // slightly too short to reach the vertex: an arc spans less height than its
  // own length. Rather than fudge the landmark table, stretch the spinal
  // segments until the top of the head lands at exactly H. Two passes is
  // plenty — the correction is a couple of percent.
  {
    const spine = ['pelvis', 'lumbar_lower', 'lumbar_upper', 'thorax_lower', 'thorax_upper', 'neck', 'head'];
    const idx = new Map(list.map((b) => [b.name, b]));
    for (let pass = 0; pass < 3; pass++) {
      const tmp = { bones: list, byName: idx };
      const F = solveFrames(tmp, {}, { q: qid(), p: [0, 0, cm(LM.hip)] });
      // stature is floor to vertex, so fit against the sole of the foot and
      // not against an assumed hip height
      const sole = Math.min(...list.map((b) => segmentLowZ(b, F.get(b.name))));
      const top = F.get('head').tip[2];
      const k = (H - (cm(LM.hip) - sole)) / (top - cm(LM.hip));
      if (Math.abs(k - 1) < 1e-6) break;
      for (const n of spine) {
        const b = idx.get(n);
        b.len *= k;
        for (const c of list) if (c.parent === n && c.offset[2] > 0 && c.kind !== 'clavicle' && c.kind !== 'shoulder') c.offset[2] *= k;
      }
      // the collarbone hangs off a landmark height, not off a segment length
      const tu = idx.get('thorax_upper');
      for (const c of list) if (c.parent === 'thorax_upper' && c.kind === 'clavicle') {
        c.offset[2] = Math.min(c.offset[2], tu.len * 0.84);
      }
    }
  }

  const byName = new Map(list.map((b) => [b.name, b]));
  for (const b of list) b.children = list.filter((c) => c.parent === b.name).map((c) => c.name);
  const total = list.reduce((s, b) => s + b.mass, 0);
  for (const b of list) { b.massFrac = b.mass / total; b.massKg = S.mass * b.mass / total; }

  return {
    subject: S, bones: list, byName, qAngle,
    // Named chains, used by the IK and by the exercise library. Ordered
    // proximal -> distal, which is the order CCD walks them back in.
    chains: {
      spine: ['pelvis', 'lumbar_lower', 'lumbar_upper', 'thorax_lower', 'thorax_upper', 'neck', 'head'],
      arm_l: ['clavicle_l', 'upperarm_l', 'forearm_l', 'hand_l'],
      arm_r: ['clavicle_r', 'upperarm_r', 'forearm_r', 'hand_r'],
      leg_l: ['thigh_l', 'shin_l', 'foot_l', 'toes_l'],
      leg_r: ['thigh_r', 'shin_r', 'foot_r', 'toes_r'],
    },
    stature: H,
    // Each spinal segment's lean in the rest pose, so that a posture read-out
    // can report curves as a change from how THIS subject stands rather than
    // from an imaginary straight spine.
    neutralTilt: (() => {
      const F = solveFrames({ bones: list, byName }, {}, { q: qid(), p: [0, 0, 0] });
      const t = {};
      for (const b of list) { const d = vrot([0, 0, 1], F.get(b.name).x.q); t[b.name] = Math.atan2(d[0], d[2]) / DEG; }
      return t;
    })(),
    // Which way is "down through the sole", in each foot's own frame, taken
    // from the neutral standing pose. A foot's sole is not perpendicular to
    // the line of the foot — the ankle sits above the ball, not above the
    // middle — so "flat on the floor" has to be measured against the rest
    // pose rather than against the foot's own axes.
    soleDown: (() => {
      const F = solveFrames({ bones: list, byName }, {}, { q: qid(), p: [0, 0, 0] });
      const out = {};
      for (const n of ['foot_l', 'foot_r']) {
        const q = F.get(n).x.q;
        out[n] = vrot([0, 0, -1], [-q[0], -q[1], -q[2], q[3]]);
      }
      return out;
    })(),
    // Where along the foot a quiet standing centre of mass actually sits,
    // 0 = heel, 1 = tip of the toes. The balancer aims at this rather than at
    // the middle of the foot, which makes standing neutral a fixed point of
    // the balancer instead of something it nudges every time it runs.
    comFootFraction: (() => {
      const tmp = { bones: list, byName, soleDown: null };
      const F = solveFrames(tmp, {}, { q: qid(), p: [0, 0, 0] });
      const c = (() => { let m = 0, x = 0; for (const b of list) { const p = xmul(F.get(b.name).x, { q: qid(), p: [0, 0, b.len * 0.43] }).p; x += p[0] * b.mass; m += b.mass; } return x / m; })();
      const sh = byName.get('foot_l').shape;
      const heel = xmul(F.get('foot_l').x, { q: qid(), p: [sh.cx, 0, sh.cz - sh.rz] }).p[0];
      const toe = F.get('toes_l').tip[0];
      return clamp((c - heel) / (toe - heel), 0.1, 0.7);
    })(),
    // Where the root has to sit for the soles to be on z = 0 in the rest
    // pose. Every posture is solved down onto the floor from here.
    standRootZ: (() => {
      const F = solveFrames({ bones: list, byName }, {}, { q: qid(), p: [0, 0, cm(LM.hip)] });
      return cm(LM.hip) - Math.min(...list.map((b) => segmentLowZ(b, F.get(b.name))));
    })(),
  };
}

/* ----------------------------------------------------- pose -> frames */
/** The local rotation of one joint, from its three clinical angles.
 *  q = Rflex * Rabd * Rrot, each about the PARENT frame's axis, each already
 *  signed so that positive means the word in `labels`. */
export function jointQuat(b, a) {
  const f = (a && a.flex) || 0, d = (a && a.abd) || 0, r = (a && a.rot) || 0;
  return qmul(qmul(
    qaxis([0, -1, 0], b.sign.flex * f * DEG),
    qaxis([1, 0, 0], b.sign.abd * d * DEG)),
    qaxis([0, 0, 1], b.sign.rot * r * DEG));
}
/** Invert jointQuat: a local rotation back into clinical degrees. The IK
 *  produces rotations and then has to clamp them to a range of motion, which
 *  is only meaningful in these three numbers. */
export function quatToJoint(b, q) {
  // q = Rflex(-sf*F) * Rabd(sa*A) * Rrot(sr*R) is exactly intrinsic Y-X-Z
  const [x, y, z] = qToYXZ(q);
  return {
    flex: (-y / DEG) / b.sign.flex,
    abd: (x / DEG) / b.sign.abd,
    rot: (z / DEG) / b.sign.rot,
  };
}
/** Clamp one joint's angles to its range of motion. */
export function clampJoint(b, a) {
  const lim = b.limits;
  return {
    flex: clamp(a.flex || 0, lim.flex[0], lim.flex[1]),
    abd: clamp(a.abd || 0, lim.abd[0], lim.abd[1]),
    rot: clamp(a.rot || 0, lim.rot[0], lim.rot[1]),
  };
}
/** How far outside its range a joint is, in degrees — 0 when it is legal.
 *  Shown in the UI so a posture that is at end-range reads as at end-range. */
export function jointStrain(b, a) {
  let worst = 0;
  for (const k of ['flex', 'abd', 'rot']) {
    const v = a[k] || 0, [lo, hi] = b.limits[k];
    worst = Math.max(worst, v < lo ? lo - v : v > hi ? v - hi : 0);
  }
  return worst;
}
/** Fraction of the available range each axis is using, signed. 1 means the
 *  joint is at the end of its travel in the positive direction. */
export function jointUse(b, a) {
  const u = {};
  for (const k of ['flex', 'abd', 'rot']) {
    const v = a[k] || 0, [lo, hi] = b.limits[k];
    u[k] = v >= 0 ? (hi > 0 ? v / hi : 0) : (lo < 0 ? -v / lo : 0);
  }
  return u;
}

/** Walk the skeleton and produce a world {q, p} for every bone.
 *  `root` is the whole figure's placement: {p, q} in world space.
 *  Returns a Map name -> {x (the bone's own frame), cx (the frame its children
 *  are posed in), tip (the distal end in world space)}. */
export function solveFrames(skel, pose, root = xid()) {
  const out = new Map();
  for (const b of skel.bones) {
    const base = b.parent ? out.get(b.parent).cx : root;
    const jq = jointQuat(b, pose[b.name]);
    const local = { q: qmul(jq, b.rest), p: b.offset };
    const x = xmul(base, local);
    const cx = b.childRest ? xmul(base, { q: qmul(jq, b.childRest), p: b.offset }) : x;
    out.set(b.name, { x, cx, tip: xmul(x, { q: qid(), p: [0, 0, b.len] }).p, bone: b });
  }
  return out;
}

/** Centre of mass of the whole figure, in world space — the number that
 *  decides whether a posture is actually balanced over the feet. */
export function centreOfMass(skel, frames) {
  let m = 0, c = [0, 0, 0];
  for (const b of skel.bones) {
    const f = frames.get(b.name);
    // segment COM sits at ~43% of the way down a limb from the proximal end
    const p = xmul(f.x, { q: qid(), p: [0, 0, b.len * 0.43] }).p;
    c = [c[0] + p[0] * b.massFrac, c[1] + p[1] * b.massFrac, c[2] + p[2] * b.massFrac];
    m += b.massFrac;
  }
  return [c[0] / m, c[1] / m, c[2] / m];
}

/** The lowest world point of one segment — exact, not an estimate. For an
 *  ellipsoid the support function in a direction is sqrt(sum((axis.d * r)^2)),
 *  which is what makes a torso lying on its side rest on its width and the
 *  same torso standing rest on its depth. Getting this wrong is how a figure
 *  ends up floating two centimetres above the floor in one posture and buried
 *  in it in the next. */
export function segmentLowZ(b, f) {
  if (b.shape.type === 'limb') {
    return Math.min(f.x.p[2] - b.shape.r[0], f.tip[2] - b.shape.r[1]);
  }
  const sh = b.shape;
  const ez = [vrot([1, 0, 0], f.x.q)[2], vrot([0, 1, 0], f.x.q)[2], vrot([0, 0, 1], f.x.q)[2]];
  const ext = Math.hypot(ez[0] * sh.rx, ez[1] * sh.ry, ez[2] * sh.rz);
  const c = xmul(f.x, { q: qid(), p: [sh.cx || 0, 0, sh.cz || 0] }).p;
  return c[2] - ext;
}
/** The lowest point of the whole figure, used to stand it back on the floor. */
export function lowestPoint(skel, frames) {
  let z = Infinity;
  for (const b of skel.bones) z = Math.min(z, segmentLowZ(b, frames.get(b.name)));
  return z;
}
/** Every segment within `tol` of the floor — what the figure is resting on. */
export function groundContacts(skel, frames, tol = 1.5) {
  return skel.bones.filter((b) => segmentLowZ(b, frames.get(b.name)) < tol).map((b) => b.name);
}

export const BONE_LABEL = (name) => name
  .replace(/_l$/, ' (left)').replace(/_r$/, ' (right)')
  .replace(/_/g, ' ');
