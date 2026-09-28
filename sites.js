/* sites.js — turning a point on the mannequin into words a clinician uses.
 *
 * This is the quiet load-bearing piece of the whole app. A click gives you a
 * bone and three local coordinates; nobody can act on that. What makes the
 * figure a shared language rather than a toy is that the same click also
 * comes out as "left lower leg, proximal anteromedial — around the pes
 * anserine", which is a thing you can look up, describe to a physio, and hand
 * to an agent as text. No three.js here: it is pure arithmetic on the bone
 * frame, and selftest.mjs checks the quadrants.
 *
 * Every limb bone in this skeleton shares one frame convention — local +X is
 * anterior (dorsal, on a foot), +Z runs down the bone, and +Y points to the
 * SUBJECT'S RIGHT — so "medial" and "lateral" are the same arithmetic on
 * every limb, flipped by which side of the body the limb is on.
 */

const LEVELS = {
  limb: [[0.30, 'proximal'], [0.70, 'mid'], [1.01, 'distal']],
  foot: [[0.32, 'hindfoot'], [0.68, 'midfoot'], [1.01, 'forefoot']],
  trunk: [[0.40, 'lower'], [0.72, 'mid'], [1.01, 'upper']],
};
const level = (style, t) => (LEVELS[style] || LEVELS.limb).find(([u]) => t < u)[1];

/** Compass the point around the bone's long axis. `axes` names the four
 *  directions in +X, +Y, -X, -Y order; blends give the "antero-" compounds
 *  that make a description precise enough to palpate. */
function aspectOf(x, y, axes) {
  const a = Math.atan2(y, x);                       // 0 = +X
  const oct = Math.round((a / (Math.PI / 4)) + 8) % 8;
  const [px, py, nx, ny] = axes;
  const table = [px, `${py === 'left' || py === 'right' ? py : py}-${px}`, py,
    `${py}-${nx}`, nx, `${ny}-${nx}`, ny, `${ny}-${px}`];
  const raw = table[oct];
  // antero-lateral rather than lateral-anterior, the way it is said
  return raw
    .replace('lateral-anterior', 'anterolateral').replace('medial-anterior', 'anteromedial')
    .replace('lateral-posterior', 'posterolateral').replace('medial-posterior', 'posteromedial')
    .replace('left-anterior', 'left anterior').replace('right-anterior', 'right anterior')
    .replace('left-posterior', 'left posterior').replace('right-posterior', 'right posterior')
    .replace('lateral-dorsal', 'dorsolateral').replace('medial-dorsal', 'dorsomedial')
    .replace('lateral-plantar', 'plantar-lateral').replace('medial-plantar', 'plantar-medial');
}

/** Palpable landmarks, keyed bone -> "level|aspect-fragment". First match on a
 *  substring wins, so one entry can cover a whole quadrant. Deliberately
 *  short: naming the handful of places people actually hurt is worth much
 *  more than a complete but unusable atlas. */
const LANDMARKS = {
  pelvis: [['posterior', 'sacroiliac joint / sacrum'], ['lateral', 'iliac crest and gluteus medius'], ['anterior', 'ASIS / hip flexor origin']],
  lumbar_lower: [['posterior', 'lower lumbar paraspinals, L4–S1'], ['lateral', 'quadratus lumborum']],
  lumbar_upper: [['posterior', 'upper lumbar paraspinals, L1–L3'], ['lateral', 'thoracolumbar junction']],
  thorax_lower: [['posterior', 'thoracolumbar paraspinals'], ['lateral', 'lower ribs']],
  thorax_upper: [['posterior', 'interscapular / rhomboid'], ['lateral', 'lateral ribs'], ['anterior', 'sternum / pec']],
  neck: [['posterior', 'cervical paraspinals'], ['lateral', 'levator scapulae / scalenes'], ['anterior', 'anterior neck']],
  head: [['posterior', 'suboccipital'], ['lateral', 'temporal'], ['anterior', 'forehead / temple']],
  clavicle_l: [['', 'AC joint and upper trapezius']], clavicle_r: [['', 'AC joint and upper trapezius']],
  upperarm_l: [['proximal|lateral', 'deltoid / subacromial space'], ['proximal|anterior', 'biceps tendon, anterior shoulder'],
    ['proximal|posterior', 'posterior cuff'], ['distal|lateral', 'lateral epicondyle'], ['distal|medial', 'medial epicondyle']],
  forearm_l: [['proximal|lateral', 'common extensor origin, lateral epicondyle'], ['proximal|medial', 'common flexor origin, medial epicondyle'],
    ['distal|anterior', 'carpal tunnel / volar wrist'], ['distal|posterior', 'dorsal wrist']],
  thigh_l: [['proximal|lateral', 'greater trochanter'], ['proximal|anterior', 'hip flexor / anterior hip'],
    ['proximal|posterior', 'ischial tuberosity / proximal hamstring'], ['mid|lateral', 'iliotibial band'],
    ['distal|anterior', 'distal quadriceps / suprapatellar'], ['posterior', 'hamstrings'], ['distal|medial', 'adductor insertion']],
  shin_l: [['proximal|anterior', 'tibial tuberosity and patellar tendon'], ['proximal|lateral', 'fibular head / peroneals'],
    ['proximal|medial', 'pes anserine'], ['proximal|posterior', 'posterior knee / popliteal'],
    ['mid|posterior', 'calf, gastrocnemius'], ['mid|anterior', 'tibialis anterior / shin'],
    ['distal|posterior', 'achilles tendon'], ['distal|medial', 'medial malleolus / tibialis posterior'], ['distal|lateral', 'lateral malleolus / peroneal tendons']],
  foot_l: [['hindfoot|plantar', 'plantar fascia at the heel'], ['midfoot|plantar', 'plantar fascia, mid-arch'],
    ['forefoot|plantar', 'metatarsal heads'], ['dorsal', 'dorsal midfoot'], ['medial', 'medial arch']],
  hand_l: [['', 'hand']], toes_l: [['', 'toes']],
};
for (const k of Object.keys(LANDMARKS)) if (k.endsWith('_l')) LANDMARKS[k.slice(0, -2) + '_r'] = LANDMARKS[k];

/** What the four horizontal directions around a bone are called, in +X, +Y,
 *  -X, -Y order. One table, read forwards by describeSite to name a point and
 *  backwards by anatomy.js to place a muscle, so the two cannot disagree about
 *  which side of a leg is lateral. */
export function boneAxes(bone) {
  if (bone.group === 'trunk' || bone.name === 'neck' || bone.name === 'head') {
    return { style: bone.group === 'trunk' ? 'trunk' : 'limb', axes: ['anterior', 'left', 'posterior', 'right'] };
  }
  if (bone.name.startsWith('foot') || bone.name.startsWith('toes')) {
    return { style: 'foot', axes: bone.side === 'L' ? ['dorsal', 'medial', 'plantar', 'lateral'] : ['dorsal', 'lateral', 'plantar', 'medial'] };
  }
  // every limb bone: +X anterior, +Y the subject's right
  return { style: 'limb', axes: bone.side === 'L' ? ['anterior', 'medial', 'posterior', 'lateral'] : ['anterior', 'lateral', 'posterior', 'medial'] };
}

/** The angle, in degrees about the bone's long axis, of a named direction —
 *  the inverse of aspectOf. "posterolateral" on a left shin and on a right
 *  shin are different numbers, and this is the one place that knows it.
 *  `side` disambiguates medial/lateral on a midline segment. */
export function aspectAngle(bone, name, side = null) {
  const { axes } = boneAxes(bone);
  const at = (n) => {
    let i = axes.indexOf(n);
    if (i < 0 && (n === 'lateral' || n === 'medial')) {
      // a midline segment has no lateral: it has a left and a right, and which
      // one counts as "lateral" depends on the structure being placed
      const want = (n === 'lateral') === (side === 'L') ? 'left' : 'right';
      i = axes.indexOf(want);
    }
    return i < 0 ? null : i * 90;
  };
  const direct = at(name);
  if (direct !== null) return direct;
  const pairs = {
    anterolateral: ['anterior', 'lateral'], anteromedial: ['anterior', 'medial'],
    posterolateral: ['posterior', 'lateral'], posteromedial: ['posterior', 'medial'],
    dorsolateral: ['dorsal', 'lateral'], dorsomedial: ['dorsal', 'medial'],
    plantarlateral: ['plantar', 'lateral'], plantarmedial: ['plantar', 'medial'],
  };
  const pair = pairs[name];
  if (!pair) return 0;
  const a = at(pair[0]), b = at(pair[1]);
  if (a === null || b === null) return a === null ? (b || 0) : a;
  // bisect the short way round
  let d = ((b - a + 540) % 360) - 180;
  return a + d / 2;
}

/** Describe a point given in a bone's own local frame.
 *  @returns {{region, level, aspect, text, landmark}} */
export function describeSite(bone, local) {
  const side = bone.side;
  const t = Math.max(0, Math.min(1, local[2] / Math.max(bone.len, 1e-6)));
  const { style, axes } = boneAxes(bone);
  const lv = level(style, t);
  const aspect = aspectOf(local[0], local[1], axes);
  const region = (side ? (side === 'L' ? 'left ' : 'right ') : '') + (bone.region || bone.name.replace(/_[lr]$/, ''));

  let landmark = null;
  for (const [key, name] of (LANDMARKS[bone.name] || [])) {
    const parts = key ? key.split('|') : [];
    // on the trunk the sides are named "left"/"right", so a rule written as
    // "lateral" still has to match them
    const hit = (q) => q === lv || aspect.includes(q)
      || (q === 'lateral' && (aspect.includes('left') || aspect.includes('right')));
    if (parts.every(hit)) { landmark = name; break; }
  }
  const text = `${region}, ${lv} ${aspect}` + (landmark ? ` — around the ${landmark}` : '');
  return { region, level: lv, aspect, landmark, text };
}

/** The colour a pain intensity is drawn in, 0-10. One ramp, used by the
 *  markers, the segment tint and the legend, so the number and the picture
 *  never drift apart. */
export function painColor(intensity) {
  const stops = [[0, 0xffd479], [3, 0xffa23a], [5, 0xff6b35], [7, 0xf8492f], [10, 0xd21f1f]];
  const v = Math.max(0, Math.min(10, intensity));
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (v >= stops[i][0] && v <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; }
  const t = b[0] === a[0] ? 0 : (v - a[0]) / (b[0] - a[0]);
  const mix = (sh) => Math.round((((a[1] >> sh) & 255) * (1 - t)) + (((b[1] >> sh) & 255) * t));
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export const QUALITIES = [
  'sharp', 'dull ache', 'burning', 'tingling', 'numb', 'stiff',
  'pinching', 'catching', 'throbbing', 'weakness', 'instability', 'cramping',
];
export const TIMING = ['at rest', 'on loading', 'at end range', 'after the fact', 'first thing in the morning', 'only under fatigue'];

/** Pain intensity, in the words the 0-10 scale actually means. */
export function intensityWord(v) {
  return v <= 0 ? 'none' : v <= 2 ? 'mild' : v <= 4 ? 'noticeable'
    : v <= 6 ? 'moderate' : v <= 8 ? 'severe' : 'worst imaginable';
}
