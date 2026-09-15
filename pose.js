/* pose.js — what a pose IS, how dragging changes it, and how to read one back
 * out in words. Still no three.js: all of this is testable under node.
 *
 * A POSE is a plain object, joint name -> {flex, abd, rot} in degrees, and a
 * ROOT is where the whole figure sits: {p, q}. Anything missing is zero, so
 * `{}` is standing neutral and a posture that only bends one knee is one line
 * long. That matters more than it sounds: this object is also the wire format
 * the agent speaks, and an agent that has to emit twenty-three joints to say
 * "bend the left knee" will get it wrong.
 *
 * DRAGGING IS IK. Grab any part of the figure and the chain above it solves
 * to follow the cursor — cyclic coordinate descent, clamped to each joint's
 * real range of motion after every step. The clamp is the whole point. An
 * unclamped ragdoll will happily fold a knee sideways, and a picture of a
 * knee folding sideways is a lie about the body being discussed.
 */
import {
  DEG, clamp, lerp, qid, qmul, qconj, qaxis, qslerp, qBetween, vsub, vadd, vlen, vdot, vcross,
  xapply, vrot, round1,
} from './math.js';
import {
  solveFrames, jointQuat, quatToJoint, clampJoint, jointStrain, centreOfMass, lowestPoint,
  groundContacts, segmentLowZ, BONE_LABEL,
} from './body.js';

export const AXES = ['flex', 'abd', 'rot'];
export const emptyPose = () => ({});
export const jointAt = (pose, name) => pose[name] || { flex: 0, abd: 0, rot: 0 };

export function clonePose(pose) {
  const out = {};
  for (const k in pose) out[k] = { flex: pose[k].flex || 0, abd: pose[k].abd || 0, rot: pose[k].rot || 0 };
  return out;
}
/** Non-zero joints only — what gets saved, sent to the agent and diffed. */
export function compactPose(pose, eps = 0.25) {
  const out = {};
  for (const k in pose) {
    const j = pose[k], o = {};
    for (const a of AXES) if (Math.abs(j[a] || 0) >= eps) o[a] = round1(j[a]);
    if (Object.keys(o).length) out[k] = o;
  }
  return out;
}
export function setJoint(pose, name, patch) {
  const j = { ...jointAt(pose, name), ...patch };
  return { ...pose, [name]: j };
}
export function lerpPose(a, b, t) {
  const out = {}, names = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const n of names) {
    const x = jointAt(a, n), y = jointAt(b, n);
    out[n] = { flex: lerp(x.flex || 0, y.flex || 0, t), abd: lerp(x.abd || 0, y.abd || 0, t), rot: lerp(x.rot || 0, y.rot || 0, t) };
  }
  return out;
}
export function lerpRoot(a, b, t) {
  return { p: [lerp(a.p[0], b.p[0], t), lerp(a.p[1], b.p[1], t), lerp(a.p[2], b.p[2], t)], q: qslerp(a.q, b.q, t) };
}
const flip = (n) => (n.endsWith('_l') ? n.slice(0, -2) + '_r' : n.endsWith('_r') ? n.slice(0, -2) + '_l' : n);
/** Swap left for right. Because every angle is already signed so that
 *  positive means the named direction on either side, mirroring a limb is
 *  just a rename; only the midline segments, whose positive direction IS
 *  "leftwards", have to flip sign. */
export function mirrorPose(pose) {
  const out = {};
  for (const n in pose) {
    const j = pose[n], mid = !n.endsWith('_l') && !n.endsWith('_r');
    out[flip(n)] = mid
      ? { flex: j.flex || 0, abd: -(j.abd || 0), rot: -(j.rot || 0) }
      : { flex: j.flex || 0, abd: j.abd || 0, rot: j.rot || 0 };
  }
  return out;
}
export function clampPose(skel, pose) {
  const out = {};
  for (const n in pose) { const b = skel.byName.get(n); out[n] = b ? clampJoint(b, pose[n]) : pose[n]; }
  return out;
}

/* ------------------------------------------------------- root placement */
export const ROOT_SIGN = { flex: -1, abd: 1, rot: 1 };     // see JOINT_KINDS.root
export function rootQuat(rot = {}) {
  return qmul(qmul(
    qaxis([0, -1, 0], ROOT_SIGN.flex * (rot.flex || 0) * DEG),
    qaxis([1, 0, 0], ROOT_SIGN.abd * (rot.abd || 0) * DEG)),
    qaxis([0, 0, 1], ROOT_SIGN.rot * (rot.rot || 0) * DEG));
}
/** Drop the figure until whatever is lowest rests on the floor. Every posture
 *  in the library uses this instead of tabulating a height, which is why
 *  sitting, squatting and lying down all come out at the right level from the
 *  joint angles alone. */
export function standOnFloor(skel, pose, root) {
  const F = solveFrames(skel, pose, root);
  const dz = -lowestPoint(skel, F);
  return { q: root.q, p: [root.p[0], root.p[1], root.p[2] + dz] };
}
/** The base of support: the horizontal extent of whatever is touching the
 *  floor, and its centre. */
export function baseOfSupport(skel, pose, root, tol = 2.5) {
  const F = solveFrames(skel, pose, root);
  const on = groundContacts(skel, F, tol);
  if (!on.length) return null;
  // A foot counts as a whole foot even when only the toes are down. What is
  // wanted here is not the patch currently bearing load but the patch the
  // body could be standing on — otherwise a figure that has crept onto its
  // toes is told that the toes ARE the target, and it keeps creeping.
  const pts = [], span = [], seen = new Set();
  for (const n of on) {
    const leg = n.match(/^(foot|toes)_(l|r)$/);
    if (leg) {
      const side = leg[2];
      if (seen.has(side)) continue;
      seen.add(side);
      const f = F.get('foot_' + side), sh = skel.byName.get('foot_' + side).shape;
      const heel = xapply(f.x, [sh.cx, 0, sh.cz - sh.rz]);
      const toe = F.get('toes_' + side).tip;
      const k = skel.comFootFraction;
      pts.push([heel[0] + (toe[0] - heel[0]) * k, heel[1] + (toe[1] - heel[1]) * k]);
      span.push(heel, toe);
      continue;
    }
    const a = F.get(n).x.p, b = F.get(n).tip;
    pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    span.push(a, b);
  }
  // the aim point is the first entry of each foot (or segment); heel and toe
  // go in only to report the span
  const cx = pts.reduce((t, q) => t + q[0], 0) / pts.length;
  const cy = pts.reduce((t, q) => t + q[1], 0) / pts.length;
  const xs = span.map((q) => q[0]), ys = span.map((q) => q[1]);
  return {
    segments: on, centre: [cx, cy], points: pts,
    span: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
  };
}
/**
 * Set one ankle so that the sole of that foot lies flat on the floor, given
 * wherever the shin above it currently points — and clamp the answer to the
 * ankle's real range of motion, so that if the posture demands more
 * dorsiflexion than an ankle has, the heel comes up. That is not a failure of
 * the solver; it is the single most common finding in a squat assessment, and
 * the figure should show it rather than cheat it.
 */
export function flattenFoot(skel, pose, root, name) {
  const b = skel.byName.get(name);
  if (!b || !b.parent) return jointAt(pose, name);
  const F = solveFrames(skel, pose, root);
  const down = vrot(skel.soleDown[name] || [-1, 0, 0], F.get(name).x.q);
  const D = qBetween(down, [0, 0, -1], [0, 1, 0]);
  const base = F.get(b.parent).cx;
  const jq2 = qmul(qmul(qconj(base.q), qmul(D, base.q)), jointQuat(b, pose[name]));
  return clampJoint(b, quatToJoint(b, jq2));
}
export function flattenFeet(skel, pose, root, feet = ['foot_l', 'foot_r']) {
  let p = clonePose(pose);
  for (const n of feet) p = { ...p, [n]: flattenFoot(skel, p, root, n) };
  return p;
}

/**
 * Stand the figure up over its own feet, by the ankle strategy — the way a
 * person actually does it.
 *
 * Translating the whole figure cannot balance it: the feet come along and
 * nothing changes. What moves a body's mass over its feet is leaning at the
 * ankles, so that is what this does — tip the whole figure about the contact
 * point, then take the same angle back out of the ankles so the soles stay
 * flat. Two or three passes converge, and every upright posture in the
 * library comes out standing on its own rather than at a tabulated angle
 * somebody guessed.
 */
export function balanceUpright(skel, pose, root, { passes = 6, plant = ['foot_l', 'foot_r'] } = {}) {
  let p = flattenFeet(skel, clonePose(pose), root, plant);
  let r = standOnFloor(skel, p, root);
  for (let i = 0; i < passes; i++) {
    const bos = baseOfSupport(skel, p, r, 3);
    if (!bos) break;
    const com = centreOfMass(skel, solveFrames(skel, p, r));
    if (com[2] < skel.subject.H * 0.15) break;                  // not upright
    const ex = bos.centre[0] - com[0], ey = bos.centre[1] - com[1];
    if (Math.hypot(ex, ey) < 0.15) break;
    const a = clamp(Math.asin(clamp(ex / com[2], -0.45, 0.45)), -0.35, 0.35);   // pitch, +Y
    const b = clamp(-Math.asin(clamp(ey / com[2], -0.45, 0.45)), -0.35, 0.35);  // roll, +X
    const D = qmul(qaxis([0, 1, 0], a), qaxis([1, 0, 0], b));
    const pivot = [bos.centre[0], bos.centre[1], 0];
    r = { q: qmul(D, r.q), p: vadd(pivot, vrot(vsub(r.p, pivot), D)) };
    p = flattenFeet(skel, p, r, plant);
    r = standOnFloor(skel, p, r);
  }
  return { pose: p, root: r };
}

/**
 * Place a pose so that one part STAYS WHERE IT WAS while the rest moves.
 *
 * This is the missing piece of physics. `fitContacts` can only rotate the
 * figure and then drop it, which is fine when the whole body is resting on the
 * floor and wrong the moment one part is planted and another is meant to
 * travel. A glute bridge solved by dropping ends up balanced on the back of the
 * head, because the head became the lowest thing once the hips came up; a
 * step-down solved by dropping lifts the standing foot off the step to put the
 * moving foot on the ground. In both cases the figure was obeying the floor
 * instead of obeying the part that is bearing weight.
 *
 * So: the shoulders stay on the floor and the hips rise off them; the knees
 * stay put and the hips travel back over them. `anchor` is what does not move,
 * `want` is everything else that should still end up on the floor, and the
 * rotation is searched about the anchor rather than about nothing in
 * particular.
 */
export function anchorFit(skel, pose, r0, anchor, target, want = [], span = 26) {
  // span 0 means "do not search at all": the orientation given is the
  // orientation wanted, and the anchor only decides where the figure sits.
  // Some movements are fully determined by their joint angles and any search
  // at all just finds a way to lean that the exercise did not ask for.
  // "Planted" means two different things at once, and both have to hold: the
  // part does not SLIDE (its x and y stay where they were) and it does not
  // LEAVE THE GROUND (its lowest surface sits on the floor). Holding the joint
  // centre instead gets the second one wrong the moment the segment rotates,
  // which is most of the time.
  const bone = skel.byName.get(anchor);
  const put = (q) => {
    const probe = solveFrames(skel, pose, { q, p: r0.p });
    const a = probe.get(anchor).x.p;
    const low = segmentLowZ(bone, probe.get(anchor));
    return { q, p: [r0.p[0] + target[0] - a[0], r0.p[1] + target[1] - a[1], r0.p[2] - low] };
  };
  let best = null;
  // span 0 is a legitimate request, and a zero step size is an infinite loop
  const schedule = span > 0 ? [[span / 7, span], [span / 28, span / 5]] : [[1, 0]];
  for (const [step, range] of schedule) {
    const base = best ? best.root.q : r0.q;
    for (let dp = -range; dp <= range + 1e-9; dp += step) {
      for (let dr = -range; dr <= range + 1e-9; dr += step) {
        const q = qmul(qmul(qaxis([0, 1, 0], dp * DEG), qaxis([1, 0, 0], dr * DEG)), base);
        const cand = put(q);
        const F = solveFrames(skel, pose, cand);
        let err = want.reduce((t, n) => t + segmentLowZ(skel.byName.get(n), F.get(n)) ** 2, 0);
        // and nothing at all may end up underneath the floor
        for (const b of skel.bones) err += 8 * Math.max(0, -segmentLowZ(b, F.get(b.name))) ** 2;
        // DO NOT ROTATE MORE THAN YOU HAVE TO. Without this the search is
        // underdetermined whenever there is one anchor and nothing else to
        // level, and it will happily pick a forty-degree lean that satisfies
        // the constraints and looks like the figure is falling over.
        err += (dp * dp + dr * dr) * 0.02;
        if (!best || err < best.err) best = { err, root: cand };
      }
    }
  }
  return best.root;
}

/** Fit the root's pitch and roll so that every segment in `want` reaches the
 *  floor together — how you place a posture that rests on four points, like
 *  four-point kneeling, where "drop until something touches" only ever finds
 *  one of them. */
export function fitContacts(skel, pose, root, want, span = 30) {
  let best = root, bestErr = Infinity;
  for (const [step, range] of [[span / 7, span], [span / 28, span / 5]]) {
    const base = best;
    for (let dp = -range; dp <= range + 1e-9; dp += step) {
      for (let dr = -range; dr <= range + 1e-9; dr += step) {
        const D = qmul(qaxis([0, 1, 0], dp * DEG), qaxis([1, 0, 0], dr * DEG));
        const cand = standOnFloor(skel, pose, { q: qmul(D, base.q), p: base.p });
        const F = solveFrames(skel, pose, cand);
        // how far each wanted contact still floats. Squaring (rather than
        // taking the spread) stops the fit "succeeding" by tipping the whole
        // figure onto something else entirely with all four targets neatly
        // level in mid-air.
        const err = want.reduce((t, n) => t + segmentLowZ(skel.byName.get(n), F.get(n)) ** 2, 0)
          + (dp * dp + dr * dr) * 0.02;          // prefer the smallest rotation that works
        if (err < bestErr - 1e-6) { bestErr = err; best = cand; }
      }
    }
  }
  return best;
}
/** Let the figure settle onto the floor the way a lying body does: search the
 *  small pitch/roll adjustments that lower its centre of mass the most. A
 *  body lying down is at a minimum of potential energy, and searching for
 *  that minimum is both shorter and more honest than tabulating the angle at
 *  which each lying posture happens to rest. */
export function settleOnFloor(skel, pose, root, span = 22) {
  let best = standOnFloor(skel, pose, root), bestH = Infinity;
  for (const [step, range] of [[5.5, span], [1.5, 6]]) {
    const base = best;
    for (let dp = -range; dp <= range + 1e-9; dp += step) {
      for (let dr = -range; dr <= range + 1e-9; dr += step) {
        const q = qmul(qmul(qaxis([0, 1, 0], dp * DEG), qaxis([1, 0, 0], dr * DEG)), base.q);
        const cand = standOnFloor(skel, pose, { q, p: base.p });
        const h = centreOfMass(skel, solveFrames(skel, pose, cand))[2];
        if (h < bestH - 1e-6) { bestH = h; best = cand; }
      }
    }
  }
  return best;
}
/** Place a pose in the world. Returns {pose, root} because balancing is
 *  allowed to spend a couple of degrees of ankle to do it. */
export function place(skel, pose, { rot, q, xy = [0, 0], floor = 'balance', contacts, plant, span = 30, lift = 0, anchor, anchorAt, anchorSpan } = {}) {
  const r0 = { q: q || rootQuat(rot), p: [xy[0], xy[1], skel.standRootZ] };
  if (floor === false || floor === 'none') return { pose, root: r0 };
  // `lift` raises the whole figure after it has been placed: an exercise done
  // standing on a step is solved with that foot as the floor, then the floor
  // is put back where it belongs underneath it.
  //
  // Whatever else a placement does, NOTHING GOES THROUGH THE FLOOR. A solver
  // that cannot satisfy its constraints should leave a part hovering, which
  // reads as an approximation; a part buried in the ground reads as broken,
  // and is the kind of thing that makes someone stop believing the whole
  // picture. So this is applied last, to every path, unconditionally.
  const up = (r, p = pose) => {
    const raised = lift ? { q: r.q, p: [r.p[0], r.p[1], r.p[2] + lift] } : r;
    // guarded against the real ground, not against `lift`: a figure standing
    // on an 18 cm step has its other foot travelling down towards zero, and
    // that is the whole exercise
    const low = lowestPoint(skel, solveFrames(skel, p, raised));
    return low < -1e-6
      ? { q: raised.q, p: [raised.p[0], raised.p[1], raised.p[2] - low] }
      : raised;
  };
  if (anchor && anchorAt) return { pose, root: up(anchorFit(skel, pose, r0, anchor, anchorAt, contacts || [], anchorSpan == null ? span : anchorSpan)) };
  if (contacts) return { pose, root: up(fitContacts(skel, pose, r0, contacts, span)) };
  if (floor === 'settle') return { pose, root: up(settleOnFloor(skel, pose, r0)) };
  if (floor === 'drop') {
    const p = plant ? flattenFeet(skel, pose, r0, plant) : pose;
    return { pose: p, root: up(standOnFloor(skel, p, r0), p) };
  }
  const b = balanceUpright(skel, pose, r0, plant ? { plant } : {});
  // measured against the pose the balancer produced, not the one it was given:
  // it spends a couple of degrees of ankle to stand the figure up
  return { pose: b.pose, root: up(b.root, b.pose) };
}
export function makeRoot(skel, pose, opts = {}) { return place(skel, pose, opts).root; }

/* ------------------------------------------------------------ postures */
/* The starting vocabulary. Every one of these is a pose you can drag away
 * from — they are a way to get somewhere near what you mean in one click, not
 * a fixed set of answers. `cue` is what the agent and the UI both say about
 * it, so the two stay in step. */
export const POSTURES = [
  { id: 'standing', name: 'Standing neutral', group: 'stance', cue: 'Feet hip-width, weight even. The reference everything else is measured from.', pose: {} },
  { id: 'standing_relaxed', name: 'Standing, weight shifted', group: 'stance',
    cue: 'Habitual stance \u2014 weight on one leg, pelvis dropped on the other side.',
    pose: { pelvis: { abd: -5, rot: 3 }, thigh_r: { abd: -3 }, thigh_l: { abd: 4, flex: -3 }, lumbar_lower: { abd: 4 }, foot_l: { rot: 8 }, foot_r: { rot: 8 } } },
  { id: 'forward_head', name: 'Forward head / rounded shoulders', group: 'stance',
    cue: 'The screen posture. Upper cervical extends, mid-back flexes, shoulders roll forward.',
    pose: { thorax_upper: { flex: 11 }, thorax_lower: { flex: 7 }, neck: { flex: 22 }, head: { flex: -20 },
      clavicle_l: { flex: 17, abd: 6 }, clavicle_r: { flex: 17, abd: 6 },
      upperarm_l: { rot: -22, flex: 6 }, upperarm_r: { rot: -22, flex: 6 } } },
  { id: 'anterior_tilt', name: 'Anterior pelvic tilt', group: 'stance',
    cue: 'Pelvis tipped forward, lumbar spine extended, hips in relative flexion to keep the femurs upright.',
    pose: { pelvis: { flex: 14 }, lumbar_lower: { flex: -9 }, lumbar_upper: { flex: -7 }, thorax_lower: { flex: 4 },
      thigh_l: { flex: 14 }, thigh_r: { flex: 14 } } },
  { id: 'flat_back', name: 'Posterior tilt / flat back', group: 'stance',
    cue: 'Pelvis tucked, lumbar curve flattened, hips in relative extension.',
    pose: { pelvis: { flex: -13 }, lumbar_lower: { flex: 11 }, lumbar_upper: { flex: 8 }, thorax_lower: { flex: -5 }, thorax_upper: { flex: -4 },
      thigh_l: { flex: -13 }, thigh_r: { flex: -13 } } },
  { id: 'sway', name: 'Swayback', group: 'stance',
    cue: 'Hips pushed forward of the ankles, thorax settled back behind them.',
    pose: { pelvis: { flex: -11 }, thigh_l: { flex: -22 }, thigh_r: { flex: -22 }, shin_l: { flex: -5 }, shin_r: { flex: -5 },
      lumbar_lower: { flex: 9 }, thorax_lower: { flex: -9 }, thorax_upper: { flex: 11 }, neck: { flex: 12 }, head: { flex: -12 } } },
  { id: 'sitting', name: 'Sitting neutral', group: 'sitting', floor: 'drop',
    cue: 'Hips and knees at 90, feet flat, pelvis stacked under the ribs.',
    pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 }, foot_l: { flex: 2 }, foot_r: { flex: 2 } } },
  { id: 'slouch', name: 'Slouched sitting', group: 'sitting', floor: 'drop',
    cue: 'Pelvis rolled back, lumbar spine in full flexion, head forward of the shoulders.',
    pose: { thigh_l: { flex: 72 }, thigh_r: { flex: 72 }, shin_l: { flex: 82 }, shin_r: { flex: 82 }, foot_l: { flex: 6 }, foot_r: { flex: 6 },
      pelvis: { flex: -17 }, lumbar_lower: { flex: 24 }, lumbar_upper: { flex: 18 }, thorax_lower: { flex: 12 }, thorax_upper: { flex: 10 },
      neck: { flex: 20 }, head: { flex: -22 }, clavicle_l: { flex: 18 }, clavicle_r: { flex: 18 },
      upperarm_l: { flex: 22, rot: -25 }, upperarm_r: { flex: 22, rot: -25 }, forearm_l: { flex: 70 }, forearm_r: { flex: 70 } } },
  { id: 'desk', name: 'At a keyboard', group: 'sitting', floor: 'drop',
    cue: 'Sitting, arms forward and unsupported, head in front of the shoulders.',
    pose: { thigh_l: { flex: 81 }, thigh_r: { flex: 81 }, shin_l: { flex: 85 }, shin_r: { flex: 85 }, foot_l: { flex: 4 }, foot_r: { flex: 4 },
      pelvis: { flex: -8 }, lumbar_lower: { flex: 14 }, lumbar_upper: { flex: 10 }, thorax_upper: { flex: 9 },
      neck: { flex: 18 }, head: { flex: -16 }, clavicle_l: { flex: 20 }, clavicle_r: { flex: 20 },
      upperarm_l: { flex: 38, abd: 12, rot: -35 }, upperarm_r: { flex: 38, abd: 12, rot: -35 },
      forearm_l: { flex: 82, rot: -70 }, forearm_r: { flex: 82, rot: -70 }, hand_l: { flex: -18 }, hand_r: { flex: -18 } } },
  { id: 'squat', name: 'Deep squat', group: 'loading', root: { rot: { flex: 18 } },
    cue: 'Bottom position. Watch ankle dorsiflexion, and whether the lumbar spine has to flex to get there.',
    pose: { pelvis: { flex: -6 }, thigh_l: { flex: 118, abd: 17, rot: 13 }, thigh_r: { flex: 118, abd: 17, rot: 13 },
      shin_l: { flex: 132 }, shin_r: { flex: 132 }, foot_l: { flex: 22, rot: 11 }, foot_r: { flex: 22, rot: 11 },
      lumbar_lower: { flex: 9 }, lumbar_upper: { flex: 6 }, thorax_lower: { flex: 8 }, thorax_upper: { flex: 5 },
      upperarm_l: { flex: 96, abd: 8 }, upperarm_r: { flex: 96, abd: 8 }, forearm_l: { flex: 22 }, forearm_r: { flex: 22 }, neck: { flex: -16 } } },
  { id: 'hinge', name: 'Hip hinge', group: 'loading', root: { rot: { flex: 70 } },
    cue: 'Bend at the hips with the spine held. The test is whether the lumbar spine stays out of it.',
    pose: { thigh_l: { flex: 58 }, thigh_r: { flex: 58 }, shin_l: { flex: 20 }, shin_r: { flex: 20 }, foot_l: { flex: -3 }, foot_r: { flex: -3 },
      upperarm_l: { flex: -68 }, upperarm_r: { flex: -68 }, forearm_l: { flex: 8 }, forearm_r: { flex: 8 },
      neck: { flex: -50 }, head: { flex: -10 } } },
  { id: 'sl_stance_l', name: 'Single-leg stance (left)', group: 'loading',
    plant: ['foot_l'],
    cue: 'Standing on the left leg. Look for the pelvis dropping on the unsupported side.',
    pose: { thigh_r: { flex: 48, abd: -4 }, shin_r: { flex: 88 }, foot_r: { flex: -14 }, pelvis: { abd: -6, rot: -4 }, lumbar_lower: { abd: 5 }, lumbar_upper: { abd: 4 }, thigh_l: { abd: -3 } } },
  { id: 'lunge_l', name: 'Split stance (left forward)', group: 'loading',
    plant: ['foot_l'],
    cue: 'Left leg forward. Loads left-hip flexion and right-hip extension at the same time.',
    pose: { thigh_l: { flex: 75 }, shin_l: { flex: 110 },
      thigh_r: { flex: -20 }, shin_r: { flex: 70 }, foot_r: { flex: -45 }, toes_r: { flex: 58 }, pelvis: { rot: -6 },
      upperarm_l: { flex: -16 }, upperarm_r: { flex: 16 } } },
  { id: 'overhead', name: 'Overhead reach', group: 'loading',
    cue: 'Both arms overhead. Needs thoracic extension \u2014 without it, the lumbar spine supplies the range.',
    pose: { upperarm_l: { flex: 168, abd: 12, rot: 28 }, upperarm_r: { flex: 168, abd: 12, rot: 28 },
      clavicle_l: { abd: 26, flex: -6 }, clavicle_r: { abd: 26, flex: -6 }, thorax_upper: { flex: -8 }, thorax_lower: { flex: -6 }, lumbar_lower: { flex: -5 } } },
  /* WHY THE TILT IS NOT -90. A body is not a plank: the spine carries its rest
   * curves, so the skeleton's long axis and the surface a person actually lies
   * on are a few degrees apart. Rotating the root exactly 90 degrees stood the
   * figure on one end of itself and left the rest in the air — supine was
   * resting on its upper back with the pelvis 4 cm up and the heels 9 cm up,
   * and prone was balanced on its pointed toes with the entire body hovering
   * 8 to 13 cm above the floor, in every exercise that started from it.
   * Both angles below are solved: they minimise the total gap at the points
   * that are supposed to be bearing weight. Supine now touches at the upper
   * back, the pelvis, the calves and the heels; prone at the chest, the
   * pelvis, the thighs and the toes. */
  { id: 'supine', name: 'Lying on back', group: 'lying', root: { rot: { flex: -86 } },
    cue: 'Supine. The reference position for most hip and core testing.',
    pose: { upperarm_l: { abd: 14 }, upperarm_r: { abd: 14 }, foot_l: { flex: 10 }, foot_r: { flex: 10 }, head: { flex: 6 } } },
  { id: 'prone', name: 'Lying face down', group: 'lying', root: { rot: { flex: -95.5, rot: 180 } },
    cue: 'Prone. Used for hip extension and for the prone press-up.',
    pose: { upperarm_l: { abd: 16 }, upperarm_r: { abd: 16 }, foot_l: { flex: -20 }, foot_r: { flex: -20 }, neck: { flex: -14 }, head: { flex: -8 } } },
  { id: 'sidelying_l', name: 'Side-lying (left side down)', group: 'lying', root: { rot: { abd: -90 } },
    cue: 'Left side down. The position for most glute-medius work.',
    pose: { thigh_l: { flex: 34 }, shin_l: { flex: 54 }, thigh_r: { flex: 16 }, shin_r: { flex: 28 },
      upperarm_l: { flex: 128 }, forearm_l: { flex: 26 }, upperarm_r: { flex: 14, rot: -30 }, forearm_r: { flex: 48 }, head: { abd: -8 } } },
  { id: 'quadruped', name: 'Four-point kneeling', group: 'lying', root: { rot: { flex: 62 } }, floor: 'drop',
    cue: 'Hands and knees. Where spinal segmental control is easiest to see and to train.',
    pose: { thigh_l: { flex: 56 }, thigh_r: { flex: 56 }, shin_l: { flex: 92 }, shin_r: { flex: 92 }, foot_l: { flex: -38 }, foot_r: { flex: -38 },
      lumbar_lower: { flex: 4 }, lumbar_upper: { flex: 4 }, thorax_lower: { flex: 6 }, thorax_upper: { flex: 4 }, neck: { flex: -50 }, head: { flex: -10 },
      upperarm_l: { flex: 68, abd: 6 }, upperarm_r: { flex: 68, abd: 6 }, hand_l: { flex: -56 }, hand_r: { flex: -56 },
      clavicle_l: { flex: 10 }, clavicle_r: { flex: 10 } } },
];
export const POSTURE = (id) => POSTURES.find((p) => p.id === id);

/** A posture's pose plus the root that puts it on the floor. */
export function posturePlacement(skel, posture) {
  const pose = clampPose(skel, clonePose(posture.pose || {}));
  return place(skel, pose, {
    rot: posture.root && posture.root.rot,
    floor: posture.floor || (posture.group === 'lying' ? 'settle' : 'balance'),
    contacts: posture.contacts, plant: posture.plant,
  });
}

/* ------------------------------------------------------------------ IK */
/** How far up the body a drag is allowed to reach, per body region. Grabbing
 *  a wrist should move the arm, not fold the spine — until you ask it to. */
export const REACH = {
  none: 0, limb: 99,                       // limb = everything up to the chain root
};
function chainUp(skel, name, stopAt, max) {
  const out = [];
  let b = skel.byName.get(name);
  while (b && out.length < max) {
    out.push(b.name);
    if (b.name === stopAt || !b.parent) break;
    b = skel.byName.get(b.parent);
  }
  return out;
}
/** Where a drag on this bone should stop propagating, by default. */
export function defaultStop(skel, name, reachTorso = false) {
  const b = skel.byName.get(name);
  if (!b) return name;
  if (b.group === 'arm') return reachTorso ? 'lumbar_lower' : 'clavicle' + (b.side === 'L' ? '_l' : '_r');
  if (b.group === 'leg') return reachTorso ? 'pelvis' : 'thigh' + (b.side === 'L' ? '_l' : '_r');
  if (b.group === 'head') return reachTorso ? 'lumbar_lower' : 'neck';
  return 'pelvis';                                   // trunk: the whole spine
}

/**
 * Cyclic coordinate descent, distal joint first, with a range-of-motion clamp
 * after every single step. Returns a NEW pose.
 *
 * @param grab  {bone, local}  the point that follows the cursor, in that
 *              bone's own frame — so grabbing a shin mid-way rotates it
 *              differently from grabbing it at the ankle, which is how a real
 *              limb behaves and what makes the drag feel like a body.
 * @param target world-space point to reach for
 * @param pinned Set of joint names IK must not touch (a pinned foot, a joint
 *              the user is holding still).
 */
export function solveIK(skel, pose, root, { grab, target, stopAt, pinned, iterations = 14, maxStep = 22, damp = 0.75 }) {
  let out = clonePose(pose);
  const stop = stopAt || defaultStop(skel, grab.bone);
  const chain = chainUp(skel, grab.bone, stop, 12).filter((n) => !(pinned && pinned.has(n)));
  if (!chain.length) return out;

  for (let it = 0; it < iterations; it++) {
    let moved = 0;
    for (const name of chain) {
      const F = solveFrames(skel, out, root);
      const gf = F.get(grab.bone);
      const eff = xapply(gf.x, grab.local);
      const jf = F.get(name);
      const a = vsub(eff, jf.x.p), t = vsub(target, jf.x.p);
      const la = vlen(a), lt = vlen(t);
      if (la < 0.5 || lt < 0.5) continue;
      const axis = vcross(a, t);
      const sinA = vlen(axis) / (la * lt);
      const cosA = vdot(a, t) / (la * lt);
      let ang = Math.atan2(sinA, cosA) * damp;
      if (Math.abs(ang) < 1e-5) continue;
      ang = clamp(ang, -maxStep * DEG, maxStep * DEG);
      const D = qaxis(axis, ang);

      // The joint's rotation lives in its PARENT's frame, so the world-space
      // correction has to be carried into that frame before it can be clamped
      // as flexion/abduction/rotation.
      const b = skel.byName.get(name);
      const base = b.parent ? F.get(b.parent).cx : root;
      const jq = jointQuat(b, out[name]);
      const jq2 = qmul(qmul(qconj(base.q), qmul(D, base.q)), jq);
      const ang2 = clampJoint(b, quatToJoint(b, jq2));
      const prev = jointAt(out, name);
      moved += Math.abs(ang2.flex - (prev.flex || 0)) + Math.abs(ang2.abd - (prev.abd || 0)) + Math.abs(ang2.rot - (prev.rot || 0));
      out[name] = ang2;
    }
    if (moved < 0.05) break;
  }
  return out;
}

/** Spin one joint directly, in its own clinical axes — the fine control that
 *  IK cannot express, used by the rotate tool and by the angle fields. */
export function nudgeJoint(skel, pose, name, patch) {
  const b = skel.byName.get(name);
  if (!b) return pose;
  return { ...pose, [name]: clampJoint(b, { ...jointAt(pose, name), ...patch }) };
}

/* ---------------------------------------------------- reading a posture */
const DEGS = (v) => `${v > 0 ? '' : ''}${round1(v)}°`;
/** Name one joint's position the way a note would: "left knee 92° flexion". */
export function describeJoint(bone, angles, { min = 4 } = {}) {
  const parts = [];
  for (const a of AXES) {
    const v = angles[a] || 0;
    if (Math.abs(v) < min) continue;
    const label = bone.labels[a][v > 0 ? 1 : 0];
    if (label === '—') continue;
    parts.push(`${DEGS(Math.abs(v))} ${label}`);
  }
  return parts.length ? `${BONE_LABEL(bone.name)}: ${parts.join(', ')}` : null;
}

/** A structured read of the whole posture — the thing the agent actually gets
 *  instead of a screenshot. Everything here is derived from the same frames
 *  that are on screen, so what it says and what you see cannot disagree. */
export function analysePosture(skel, pose, root) {
  const F = solveFrames(skel, pose, root);
  const P = (n) => F.get(n).x.p;
  const com = centreOfMass(skel, F);
  const ankle = [(P('foot_l')[0] + P('foot_r')[0]) / 2, (P('foot_l')[1] + P('foot_r')[1]) / 2];
  const H = skel.subject.H;

  // sagittal plumb line, measured forward (+) or back (-) of the ankles
  const plumb = {
    ear: round1(F.get('head').x.p[0] + vrot([1, 0, 0], F.get('head').x.q)[0] * 2 - ankle[0]),
    shoulder: round1((P('upperarm_l')[0] + P('upperarm_r')[0]) / 2 - ankle[0]),
    hip: round1((P('thigh_l')[0] + P('thigh_r')[0]) / 2 - ankle[0]),
    knee: round1((P('shin_l')[0] + P('shin_r')[0]) / 2 - ankle[0]),
    com: round1(com[0] - ankle[0]),
  };
  // regional curves, as the angle between the ends of each region in world
  const worldTilt = (n) => {
    const d = vrot([0, 0, 1], F.get(n).x.q);
    return Math.atan2(d[0], d[2]) / DEG;                   // + = leaning forward
  };
  // Spinal curves are the sum of the segment flexions, NOT a difference of
  // world tilts. A world tilt only means anything while the person is upright:
  // measured on someone lying on their side it produced "209 degrees of lumbar
  // extension", which is not a number about a body. Segment flexions are the
  // same values the joints are posed with, so they read the same whichever way
  // up the figure is.
  const sum = (...names) => round1(names.reduce((t, n) => t + (jointAt(pose, n).flex || 0), 0));
  const N = skel.neutralTilt;
  const curves = {
    // pelvic tilt is genuinely a world measurement: it is tilt relative to
    // upright, and the caller is told when the figure is not upright
    pelvic_tilt: round1(((worldTilt('pelvis') - N.pelvis + 540) % 360) - 180 + 0),
    upright: Math.abs(((worldTilt('pelvis') - N.pelvis + 540) % 360) - 180) < 45,
    lumbar: sum('lumbar_lower', 'lumbar_upper'),
    thoracic: sum('thorax_lower', 'thorax_upper'),
    cervical: sum('neck', 'head'),
  };
  // frontal-plane asymmetry
  const asym = {
    shoulder_height: round1(P('upperarm_l')[2] - P('upperarm_r')[2]),
    pelvic_obliquity: round1(P('thigh_l')[2] - P('thigh_r')[2]),
    trunk_shift: round1(P('neck')[1] - (P('thigh_l')[1] + P('thigh_r')[1]) / 2),
  };
  // which joints are living at the end of their travel in this posture
  const endRange = [];
  for (const b of skel.bones) {
    const a = jointAt(pose, b.name);
    for (const ax of AXES) {
      const v = a[ax] || 0, [lo, hi] = b.limits[ax];
      const frac = v >= 0 ? (hi > 0 ? v / hi : 0) : (lo < 0 ? v / lo : 0);
      if (frac > 0.9) endRange.push({ joint: b.name, axis: ax, deg: round1(v), of: v >= 0 ? hi : lo, label: b.labels[ax][v > 0 ? 1 : 0] });
    }
  }
  const contact = groundContacts(skel, F, 1.5);
  return {
    top_of_head_cm: round1(F.get('head').tip[2]),
    com: com.map(round1),
    base_of_support_cm: round1(Math.abs(P('foot_l')[1] - P('foot_r')[1])),
    com_forward_of_ankles_cm: plumb.com,
    plumb, curves, asymmetry: asym, end_range: endRange,
    ground_contact: contact,
    joints: Object.fromEntries(Object.entries(compactPose(pose))),
  };
}

/** The same read, in sentences — what gets pasted into a message. */
export function summarisePosture(skel, pose, root, name = 'current posture') {
  const a = analysePosture(skel, pose, root);
  const lines = [`${name}:`];
  const said = [];
  for (const b of skel.bones) {
    const s = describeJoint(b, jointAt(pose, b.name), { min: 6 });
    if (s) said.push('  ' + s);
  }
  lines.push(said.length ? said.join('\n') : '  standing neutral, no joint away from zero');
  lines.push(`  pelvic tilt ${a.curves.pelvic_tilt}° · lumbar ${a.curves.lumbar}° · thoracic ${a.curves.thoracic}° · cervical ${a.curves.cervical}°`);
  lines.push(Math.abs(a.com_forward_of_ankles_cm) < 1
    ? '  centre of mass over the ankles'
    : `  centre of mass ${Math.abs(a.com_forward_of_ankles_cm)} cm ${a.com_forward_of_ankles_cm > 0 ? 'in front of' : 'behind'} the ankles`);
  if (a.end_range.length) {
    lines.push('  at end range: ' + a.end_range.map((e) => `${BONE_LABEL(e.joint)} ${e.label} ${e.deg}°`).join(', '));
  }
  return lines.join('\n');
}

/** Total strain: how much of the pose is outside a healthy range. Used to
 *  colour joints in the viewport, and to stop the agent proposing a position
 *  the figure cannot actually hold. */
export function poseStrain(skel, pose) {
  const out = [];
  for (const b of skel.bones) {
    const s = jointStrain(b, jointAt(pose, b.name));
    if (s > 0.5) out.push({ joint: b.name, over: round1(s) });
  }
  return out;
}
