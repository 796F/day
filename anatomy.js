/* anatomy.js — the structures underneath the mannequin.
 *
 * WHY THIS EXISTS. Pain is not evenly distributed over a limb. It is in a
 * muscle belly, or a tendon, or the joint line, or along a nerve, and which
 * one it is changes what you would do about it. A figure you can only describe
 * as "left lower leg, proximal medial" makes you do the translation into
 * anatomy in your head; a figure that answers "left pes anserine, at the
 * insertion of the medial hamstrings" has already done it.
 *
 * DELIBERATELY LOW RESOLUTION. This is a map of the forty-odd structures a
 * person can actually point to on themselves through skin, not an anatomical
 * atlas. Each one is a patch on a segment — a span down the bone and an arc
 * around it — which is enough to highlight, name, and hang a pain mark on, and
 * is honest about being an approximation. Sub-regions nobody can localise from
 * the outside are left out on purpose.
 *
 * WHY NOT A REAL ANATOMICAL MESH. The good open datasets (BodyParts3D,
 * Z-Anatomy and friends) are hundreds of megabytes of unrigged geometry in
 * their own coordinate systems and their own fixed poses. Getting one of them
 * to bend correctly with this skeleton is a rigging project, and a muscle mesh
 * that does not deform with the joint it crosses is worse than no muscle mesh:
 * it would be visibly wrong in exactly the positions this app exists to show.
 * Patches ride the pose for free, because they are attached to the segments.
 *
 * Arcs are authored in clinical directions — "posterolateral", "medial" — and
 * resolved through sites.js, which is the same table describeSite reads to
 * name a point. So a muscle placed on the lateral side of a left shin and a
 * point described as lateral on a left shin cannot disagree.
 *
 * No three.js here: figure.js turns `patchOf()` into geometry.
 */
import { aspectAngle, boneAxes } from './sites.js';
import { JOINT_KINDS } from './body.js';

export const KINDS = {
  muscle: { label: 'muscle', color: 0xc65b52 },
  tendon: { label: 'tendon', color: 0xd8c98a },
  fascia: { label: 'fascia', color: 0xc9b7a0 },
  ligament: { label: 'ligament', color: 0xa8c6d8 },
  joint: { label: 'joint', color: 0x7fa8c9 },
  nerve: { label: 'nerve', color: 0xb09ad0 },
  other: { label: 'structure', color: 0xa1a1a1 },
};

/* Authored once. `bones` may name several segments a structure runs across;
 * `side: 'both'` means make a left and a right copy — of a paired segment by
 * suffix, or of a midline segment as two arcs.
 *
 * span is along the bone, 0 at its joint and 1 at the next one. Values outside
 * that are allowed and used: the pelvis segment is short and the muscles on it
 * extend well past both ends.
 *
 * `deep` structures lose to superficial ones when both contain a point, which
 * is the right answer for a click on skin. */
const DEFS = [
  /* ---------------------------------------------------------- trunk */
  { id: 'erector_l', name: 'erector spinae (lumbar)', kind: 'muscle', side: 'both',
    bones: ['lumbar_lower', 'lumbar_upper'], span: [0, 1], at: 'posterior', toward: 'lateral', bias: 24, width: 58,
    note: 'the long back extensors. Sore here after sustained bending or standing.' },
  { id: 'ql', name: 'quadratus lumborum', kind: 'muscle', side: 'both', deep: true,
    bones: ['lumbar_lower', 'lumbar_upper'], span: [0.1, 0.95], at: 'lateral', width: 34,
    note: 'side of the low back, between the last rib and the pelvis. Often involved when one hip hikes.' },
  { id: 'rect_abd', name: 'rectus abdominis', kind: 'muscle', side: 'both',
    bones: ['lumbar_lower', 'lumbar_upper'], span: [0, 1], at: 'anterior', width: 30 },
  { id: 'oblique', name: 'obliques', kind: 'muscle', side: 'both',
    bones: ['lumbar_lower', 'lumbar_upper'], span: [0, 1], at: 'anterolateral', width: 52 },
  { id: 'erector_t', name: 'erector spinae (thoracic)', kind: 'muscle', side: 'both',
    bones: ['thorax_lower', 'thorax_upper'], span: [0, 1], at: 'posterior', toward: 'lateral', bias: 22, width: 52 },
  { id: 'lat', name: 'latissimus dorsi', kind: 'muscle', side: 'both',
    bones: ['thorax_lower'], span: [0.05, 1.1], at: 'posterolateral', width: 78,
    note: 'the broad sheet from the low back to the armpit. Tight lats limit overhead reach.' },
  { id: 'trap_low', name: 'lower trapezius', kind: 'muscle', side: 'both',
    bones: ['thorax_lower'], span: [0.45, 1.1], at: 'posterior', width: 40 },
  { id: 'rhomboid', name: 'rhomboids & mid trapezius', kind: 'muscle', side: 'both',
    bones: ['thorax_upper'], span: [0.2, 0.95], at: 'posterior', width: 44,
    note: 'between the shoulder blade and the spine. The classic ache of a long day at a screen.' },
  { id: 'trap_up', name: 'upper trapezius', kind: 'muscle', side: 'both',
    bones: ['neck'], span: [-0.2, 1], at: 'posterolateral', width: 52,
    note: 'from the base of the skull out to the point of the shoulder.' },
  { id: 'serratus', name: 'serratus anterior', kind: 'muscle', side: 'both', deep: true,
    bones: ['thorax_lower'], span: [0.35, 1.1], at: 'anterolateral', width: 40 },
  { id: 'pec', name: 'pectoralis major', kind: 'muscle', side: 'both',
    bones: ['thorax_upper'], span: [0.2, 1], at: 'anterolateral', width: 52,
    note: 'tight pecs pull the shoulders forward and cost you overhead range.' },
  { id: 'scm', name: 'sternocleidomastoid', kind: 'muscle', side: 'both',
    bones: ['neck'], span: [0, 1], at: 'anterolateral', width: 34 },
  { id: 'scalene', name: 'scalenes', kind: 'muscle', side: 'both', deep: true,
    bones: ['neck'], span: [0.15, 0.95], at: 'lateral', width: 26 },
  { id: 'suboccip', name: 'suboccipitals', kind: 'muscle', side: 'both',
    bones: ['head'], span: [-0.1, 0.3], at: 'posterolateral', width: 52,
    note: 'right under the base of the skull. A common source of headache from the neck.' },
  { id: 'glute_max', name: 'gluteus maximus', kind: 'muscle', side: 'both',
    bones: ['pelvis'], span: [-1.0, 0.9], at: 'posterolateral', width: 72,
    note: 'the main hip extensor. What a bridge and a hinge are meant to load.' },
  { id: 'glute_med', name: 'gluteus medius', kind: 'muscle', side: 'both',
    bones: ['pelvis'], span: [0.1, 1.4], at: 'lateral', width: 42,
    note: 'holds the pelvis level on one leg. Weakness here shows up as a hip drop.' },
  { id: 'piriformis', name: 'piriformis & deep rotators', kind: 'muscle', side: 'both', deep: true,
    bones: ['pelvis'], span: [-0.7, 0.4], at: 'posterolateral', width: 34 },
  { id: 'iliopsoas', name: 'iliopsoas (hip flexors)', kind: 'muscle', side: 'both', deep: true,
    bones: ['pelvis'], span: [0, 1.3], at: 'anterolateral', width: 40,
    note: 'crosses from the lumbar spine to the femur. Short hip flexors tip the pelvis forward.' },
  { id: 'si', name: 'sacroiliac joint', kind: 'joint', side: 'both',
    bones: ['pelvis'], span: [-0.4, 0.8], at: 'posterior', width: 26 },

  /* ------------------------------------------------------------ arm */
  { id: 'delt_ant', name: 'deltoid (anterior)', kind: 'muscle', side: 'both',
    bones: ['upperarm'], span: [0, 0.34], at: 'anterior', width: 52 },
  { id: 'delt_lat', name: 'deltoid (lateral)', kind: 'muscle', side: 'both',
    bones: ['upperarm'], span: [0, 0.34], at: 'lateral', width: 52 },
  { id: 'delt_post', name: 'deltoid (posterior)', kind: 'muscle', side: 'both',
    bones: ['upperarm'], span: [0, 0.34], at: 'posterior', width: 52 },
  { id: 'cuff', name: 'rotator cuff', kind: 'tendon', side: 'both', deep: true,
    bones: ['upperarm'], span: [-0.08, 0.12], at: 'posterolateral', width: 150,
    note: 'the four tendons that centre the shoulder. Pain reaching overhead or behind you.' },
  { id: 'biceps', name: 'biceps brachii', kind: 'muscle', side: 'both',
    bones: ['upperarm'], span: [0.22, 0.95], at: 'anterior', width: 88 },
  { id: 'triceps', name: 'triceps', kind: 'muscle', side: 'both',
    bones: ['upperarm'], span: [0.15, 0.95], at: 'posterior', width: 96 },
  { id: 'ext_common', name: 'wrist extensors (tennis elbow)', kind: 'muscle', side: 'both',
    bones: ['forearm'], span: [-0.05, 0.95], at: 'posterolateral', width: 84,
    note: 'their common origin on the outside of the elbow is where tennis elbow hurts.' },
  { id: 'flex_common', name: 'wrist flexors (golfer’s elbow)', kind: 'muscle', side: 'both',
    bones: ['forearm'], span: [-0.05, 0.95], at: 'anteromedial', width: 84 },
  { id: 'brachiorad', name: 'brachioradialis', kind: 'muscle', side: 'both',
    bones: ['forearm'], span: [0, 0.45], at: 'lateral', width: 32 },
  { id: 'carpal', name: 'carpal tunnel', kind: 'other', side: 'both',
    bones: ['hand'], span: [-0.12, 0.3], at: 'anterior', width: 58,
    note: 'the median nerve passes through here. Numbness in the thumb side of the hand.' },

  /* ------------------------------------------------------------ leg */
  { id: 'rect_fem', name: 'rectus femoris', kind: 'muscle', side: 'both',
    bones: ['thigh'], span: [0.02, 0.88], at: 'anterior', width: 42 },
  { id: 'vast_lat', name: 'vastus lateralis', kind: 'muscle', side: 'both',
    bones: ['thigh'], span: [0.18, 0.9], at: 'anterolateral', width: 44 },
  { id: 'vast_med', name: 'vastus medialis', kind: 'muscle', side: 'both',
    bones: ['thigh'], span: [0.5, 0.96], at: 'anteromedial', width: 40 },
  { id: 'ham_lat', name: 'hamstrings (biceps femoris)', kind: 'muscle', side: 'both',
    bones: ['thigh'], span: [0.05, 0.95], at: 'posterior', toward: 'lateral', bias: 26, width: 62 },
  { id: 'ham_med', name: 'hamstrings (semimembranosus/tendinosus)', kind: 'muscle', side: 'both',
    bones: ['thigh'], span: [0.05, 0.95], at: 'posterior', toward: 'medial', bias: 26, width: 62 },
  { id: 'adductor', name: 'adductors', kind: 'muscle', side: 'both',
    bones: ['thigh'], span: [0.02, 0.8], at: 'medial', width: 48 },
  { id: 'itb', name: 'TFL & iliotibial band', kind: 'fascia', side: 'both',
    bones: ['thigh'], span: [0, 1.05], at: 'lateral', width: 26,
    note: 'runs the whole outside of the thigh to just below the knee. Classic runner’s pain at its lower end.' },
  { id: 'gastroc', name: 'gastrocnemius', kind: 'muscle', side: 'both',
    bones: ['shin'], span: [0.05, 0.55], at: 'posterior', width: 80 },
  { id: 'soleus', name: 'soleus', kind: 'muscle', side: 'both', deep: true,
    bones: ['shin'], span: [0.35, 0.82], at: 'posterior', width: 66 },
  { id: 'achilles', name: 'achilles tendon', kind: 'tendon', side: 'both',
    bones: ['shin'], span: [0.8, 1.05], at: 'posterior', width: 40 },
  { id: 'tib_ant', name: 'tibialis anterior', kind: 'muscle', side: 'both',
    bones: ['shin'], span: [0.08, 0.72], at: 'anterolateral', width: 34 },
  { id: 'peroneal', name: 'peroneals', kind: 'muscle', side: 'both',
    bones: ['shin'], span: [0.15, 0.88], at: 'lateral', width: 30 },
  { id: 'tib_post', name: 'tibialis posterior', kind: 'muscle', side: 'both', deep: true,
    bones: ['shin'], span: [0.32, 0.95], at: 'posteromedial', width: 26 },
  { id: 'pat_tendon', name: 'patellar tendon', kind: 'tendon', side: 'both',
    bones: ['shin'], span: [-0.05, 0.13], at: 'anterior', width: 40,
    note: 'below the kneecap. Sore with jumping and with deep knee bend under load.' },
  { id: 'pes', name: 'pes anserine', kind: 'tendon', side: 'both',
    bones: ['shin'], span: [0.03, 0.16], at: 'anteromedial', width: 34 },
  { id: 'mcl', name: 'medial collateral ligament', kind: 'ligament', side: 'both',
    bones: ['shin'], span: [-0.08, 0.12], at: 'medial', width: 24 },
  { id: 'lcl', name: 'lateral collateral ligament', kind: 'ligament', side: 'both',
    bones: ['shin'], span: [-0.08, 0.12], at: 'lateral', width: 24 },
  { id: 'sciatic', name: 'sciatic nerve', kind: 'nerve', side: 'both', deep: true,
    bones: ['thigh'], span: [-0.15, 0.72], at: 'posterior', width: 18,
    note: 'referred pain down the back of the thigh often comes from the low back, not from here.' },
  { id: 'plantar', name: 'plantar fascia', kind: 'fascia', side: 'both',
    bones: ['foot'], span: [-0.5, 1.0], at: 'plantar', width: 62,
    note: 'sole of the foot. Worst on the first steps in the morning.' },

  /* Filling in the places a systematic sweep of the body surface found with
   * no name on them at all. Every one of these is somewhere people actually
   * report pain, and "left forearm, mid posteromedial" is not an answer. */
  { id: 'ac', name: 'AC joint', kind: 'joint', side: 'both',
    bones: ['clavicle'], span: [0.74, 1.12], at: 'anterior', width: 250,
    note: 'the bump on top of the shoulder. Sore on reaching across the body.' },
  { id: 'trap_clav', name: 'upper trapezius (over the collarbone)', kind: 'muscle', side: 'both',
    bones: ['clavicle'], span: [0.05, 0.85], at: 'posterior', width: 210 },
  { id: 'medial_arm', name: 'medial arm (nerves and vessels)', kind: 'nerve', side: 'both', deep: true,
    bones: ['upperarm'], span: [0.25, 0.92], at: 'medial', width: 44 },
  { id: 'ulnar_border', name: 'ulnar border of the forearm', kind: 'other', side: 'both',
    bones: ['forearm'], span: [0.05, 0.98], at: 'posteromedial', width: 64 },
  { id: 'hand_body', name: 'hand', kind: 'other', side: 'both',
    bones: ['hand'], span: [-0.15, 1.1], at: 'anterior', width: 360,
    note: 'fingers, knuckles and the back of the hand.' },
  { id: 'shin_medial', name: 'medial tibial border (shin splints)', kind: 'other', side: 'both',
    bones: ['shin'], span: [0.12, 0.82], at: 'medial', toward: 'posterior', bias: 12, width: 38,
    note: 'the inner edge of the shin bone. The classic running pain that builds over weeks.' },
  { id: 'foot_dorsum', name: 'dorsum of the foot', kind: 'other', side: 'both',
    bones: ['foot'], span: [-0.5, 1.1], at: 'dorsal', width: 130 },
  { id: 'forefoot', name: 'toes and forefoot', kind: 'other', side: 'both',
    bones: ['toes'], span: [-0.3, 1.2], at: 'dorsal', width: 360,
    note: 'the big-toe joint is the commonest single site here.' },
  { id: 'ribs_lat', name: 'lateral ribs', kind: 'other', side: 'both',
    bones: ['thorax_lower', 'thorax_upper'], span: [0, 1], at: 'lateral', width: 58 },
  { id: 'costal', name: 'lower ribs and costal margin', kind: 'other', side: 'both',
    bones: ['thorax_lower'], span: [-0.15, 0.4], at: 'anterolateral', width: 70 },
  { id: 'sternum', name: 'sternum', kind: 'other',
    bones: ['thorax_upper'], span: [0.1, 1], at: 'anterior', width: 30 },
  { id: 'face', name: 'face and jaw', kind: 'other', side: 'both',
    bones: ['head'], span: [-0.3, 0.85], at: 'anterior', width: 110 },
  { id: 'tmj', name: 'jaw joint (TMJ)', kind: 'joint', side: 'both',
    bones: ['head'], span: [-0.25, 0.25], at: 'anterolateral', width: 44,
    note: 'just in front of the ear. Jaw clenching often travels with neck pain.' },
  { id: 'temporal', name: 'temple and side of the head', kind: 'other', side: 'both',
    bones: ['head'], span: [0, 0.8], at: 'lateral', width: 66 },
  { id: 'throat', name: 'front of the neck', kind: 'other',
    bones: ['neck'], span: [0, 1], at: 'anterior', width: 44 },
];

/* Spinal levels get proper names; everywhere else the joint kind already has
 * one and repeating it here would be a second place to keep in step. */
const JOINT_NAMES = {
  lumbar_lower: 'L5–S1 (lumbosacral junction)',
  lumbar_upper: 'mid lumbar spine',
  thorax_lower: 'thoracolumbar junction',
  thorax_upper: 'mid thoracic spine',
  neck: 'cervicothoracic junction',
  head: 'upper cervical spine',
  clavicle: 'sternoclavicular joint',
};

const suffix = (side) => (side === 'L' ? '_l' : '_r');

/** Expand the table for one skeleton: paired segments become two structures,
 *  midline segments become two arcs, and every joint on the figure becomes a
 *  structure you can point at. */
export function buildAnatomy(skel) {
  const list = [];
  const add = (s) => { list.push(s); return s; };

  for (const d of DEFS) {
    const sides = d.side === 'both' ? ['L', 'R'] : [d.side || null];
    for (const side of sides) {
      const regions = [];
      for (const stem of d.bones) {
        const name = skel.byName.has(stem) ? stem : stem + suffix(side);
        const bone = skel.byName.get(name);
        if (!bone) continue;
        // `bias` rotates the centre a few degrees from `at` towards another
        // named direction. Authoring a raw angle instead would not mirror:
        // "lateral" is +90 on one side of the body and -90 on the other.
        let centre = aspectAngle(bone, d.at, side);
        if (d.bias) {
          const to = aspectAngle(bone, d.toward, side);
          const way = ((((to - centre + 540) % 360) - 180) >= 0) ? 1 : -1;
          centre += way * d.bias;
        }
        regions.push({ bone: name, span: d.span, centre, width: d.width });
      }
      if (!regions.length) continue;
      add({
        id: side ? `${d.id}_${side.toLowerCase()}` : d.id,
        name: (side ? (side === 'L' ? 'left ' : 'right ') : '') + d.name,
        plain: d.name, kind: d.kind, side, deep: !!d.deep, note: d.note || '',
        colour: kindColor(d.kind),
        regions,
        // how specific this structure is: the smaller, the more it wins when
        // two of them cover the same point
        area: regions.reduce((t, r) => t + Math.abs(r.span[1] - r.span[0]) * r.width, 0),
      });
    }
  }

  // every articulation, from the skeleton itself
  for (const b of skel.bones) {
    if (!b.parent) continue;
    const stem = b.name.replace(/_[lr]$/, '');
    const label = JOINT_NAMES[stem] || b.kindRef.label;
    const side = b.side;
    // A limb joint is a ball you can point at. A spinal level is not: it is
    // the strip of midline running down that segment, which is where anyone
    // pointing at "my L4/L5" actually puts their finger.
    const spinal = b.group === 'trunk' || b.name === 'neck' || b.name === 'head';
    const regions = spinal
      ? [{ bone: b.name, span: [-0.05, 1.0], centre: aspectAngle(b, 'posterior'), width: 30 }]
      : [{ bone: b.name, span: [-0.09, 0.09], centre: 0, width: 360, sphere: true }];
    add({
      id: 'joint_' + b.name, name: (side ? (side === 'L' ? 'left ' : 'right ') : '') + label,
      plain: label, kind: 'joint', side, deep: false, joint: b.name, spinal,
      colour: kindColor('joint'),
      note: 'range of motion: ' + ['flex', 'abd', 'rot']
        .filter((a) => b.labels[a][0] !== '\u2014')
        .map((a) => `${b.limits[a][0]} to ${b.limits[a][1]} deg ${b.labels[a][0]}/${b.labels[a][1]}`).join(', '),
      regions,
      // A limb joint is the FALLBACK, not the first answer: being near the
      // knee is not a better description than "patellar tendon", and clicking
      // the ball itself is the unambiguous way to mean the joint. A spinal
      // level is the opposite - the midline strip really is the most specific
      // thing there, so it keeps a small area and wins.
      area: spinal ? 1.05 * 30 : 400,
    });
  }
  return { list, byId: new Map(list.map((s) => [s.id, s])) };
}

const norm180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Does this structure cover the point? `local` is in the bone's own frame. */
export function regionContains(bone, region, local) {
  const t = local[2] / Math.max(bone.len, 1e-6);
  if (t < region.span[0] || t > region.span[1]) return false;
  if (region.width >= 360) return true;
  const a = Math.atan2(local[1], local[0]) * 180 / Math.PI;
  return Math.abs(norm180(a - region.centre)) <= region.width / 2;
}

/**
 * What is at this point on the body. Smallest wins, because a smaller patch is
 * a more specific claim; a superficial structure beats a deep one, because a
 * click lands on skin and a person pointing at the outside of their thigh
 * means the IT band rather than the sciatic nerve underneath it.
 */
export function structureAt(anatomy, bone, local) {
  if (!bone) return null;
  const boneName = bone.name;
  let best = null;
  for (const s of anatomy.list) {
    for (const r of s.regions) {
      if (r.bone !== boneName) continue;
      if (!regionContains(bone, r, local)) continue;
      const rank = s.area + (s.deep ? 1e4 : 0);
      if (!best || rank < best.rank) best = { s, rank };
      break;
    }
  }
  return best ? best.s : null;
}

/** All the structures on one segment, for the anatomy list. */
export const structuresOn = (anatomy, boneName) =>
  anatomy.list.filter((s) => s.regions.some((r) => r.bone === boneName));

/**
 * The patch to draw for one region, as a parametric surface in the bone's own
 * frame. figure.js meshes it; nothing here knows about three.js.
 *
 * `lift` pushes the patch just off the segment so it reads as something lying
 * on the body rather than as the body itself.
 */
export function patchOf(skel, region, lift = 1.045) {
  const bone = skel.byName.get(region.bone);
  if (!bone) return null;
  const sh = bone.shape, len = bone.len;
  const t0 = region.span[0], t1 = region.span[1];
  const a0 = (region.centre - region.width / 2) * Math.PI / 180;
  const a1 = (region.centre + region.width / 2) * Math.PI / 180;

  if (sh.type === 'limb') {
    // a tapered tube: clamp to the segment so a span that runs past the joint
    // stops at it rather than floating in the air
    const c0 = Math.max(0, Math.min(1, t0)), c1 = Math.max(0, Math.min(1, t1));
    if (c1 - c0 < 1e-3) return null;
    return {
      a0, a1,
      point: (u, a) => {
        const t = c0 + (c1 - c0) * u;
        const r = (sh.r[0] + (sh.r[1] - sh.r[0]) * t) * lift;
        return [r * Math.cos(a), r * Math.sin(a), t * len];
      },
    };
  }
  // an ellipsoid: the span is still measured along the bone, so it has to be
  // turned back into a polar angle on the surface
  const zAt = (t) => t * len;
  const lo = sh.cz - sh.rz, hi = sh.cz + sh.rz;
  const z0 = Math.max(lo + sh.rz * 0.02, Math.min(hi - sh.rz * 0.02, zAt(t0)));
  const z1 = Math.max(lo + sh.rz * 0.02, Math.min(hi - sh.rz * 0.02, zAt(t1)));
  if (Math.abs(z1 - z0) < 1e-3) return null;
  return {
    a0, a1,
    point: (u, a) => {
      const z = z0 + (z1 - z0) * u;
      const c = Math.max(-1, Math.min(1, (z - sh.cz) / sh.rz));
      const s = Math.sqrt(Math.max(0, 1 - c * c));
      return [sh.cx + sh.rx * lift * s * Math.cos(a), sh.ry * lift * s * Math.sin(a), sh.cz + sh.rz * lift * c];
    },
  };
}

/** One anatomy per skeleton, built once. Everything that needs to name a
 *  point can reach it without having it threaded through five call sites. */
const CACHE = new WeakMap();
export function anatomyFor(skel) {
  let a = CACHE.get(skel);
  if (!a) { a = buildAnatomy(skel); CACHE.set(skel, a); }
  return a;
}
/** The structure at a point, with an explicit click on a joint ball winning
 *  outright — that click is unambiguous about what was meant. */
export function structureForMark(skel, mark) {
  const an = anatomyFor(skel);
  if (mark.joint) return an.byId.get('joint_' + mark.joint) || null;
  return structureAt(an, skel.byName.get(mark.bone), mark.local);
}

export const kindColor = (kind) => (KINDS[kind] || KINDS.other).color;
export const GROUPS = [
  ['trunk & back', (s) => /lumbar|thorax|pelvis|neck|head|sacro/.test(s.regions[0].bone) || /erector|trap|rhom|lat|oblique|abdom|glute|psoas|quadratus|serratus|pector|scalene|scm|suboccip|piriform|sacro/.test(s.id)],
  ['shoulder & arm', (s) => /clavicle|upperarm|forearm|hand/.test(s.regions[0].bone)],
  ['hip & leg', (s) => /thigh|shin|foot|toes/.test(s.regions[0].bone)],
];
