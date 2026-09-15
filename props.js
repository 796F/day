/* props.js — the step, the wall and the chair.
 *
 * WHY THIS EXISTS. Half the library is defined against an object: knee-to-wall
 * needs a wall, a step-down needs a step, sit-to-stand needs a chair. Drawn
 * without them, the figure is doing something inexplicable in mid-air — one
 * leg apparently shoving off nothing — and the movement reads as a bug rather
 * than as an exercise. A person watching a workout video is reading the
 * relationship between the body and the thing it is using at least as much as
 * the body itself.
 *
 * PROPS ARE PLACED FROM THE POSE, NOT THE POSE FROM THE PROPS. The step goes
 * wherever the standing foot already is; the wall goes wherever the hand
 * already reaches. That way there is never a gap between the body and the
 * thing it is supposed to be touching, and no solver has to know about
 * furniture. The one exception is `lift`: an exercise standing ON something
 * says so, and the figure is raised by that much so the other foot has
 * somewhere below it to travel to.
 *
 * No three.js here — figure.js turns these boxes into meshes.
 */
import { xapply } from './math.js';

/** The extreme point of a segment in a direction, in world space. Used to put
 *  a wall exactly where a hand or a toe already is. */
function extremeOf(skel, frames, boneName, axis) {
  const b = skel.byName.get(boneName), f = frames.get(boneName);
  if (!b) return 0;
  const pts = [f.x.p, f.tip];
  if (b.shape.type !== 'limb') {
    const sh = b.shape;
    for (const s of [-1, 1]) {
      pts.push(xapply(f.x, [sh.cx + s * sh.rx, 0, sh.cz]));
      pts.push(xapply(f.x, [sh.cx, 0, sh.cz + s * sh.rz]));
      pts.push(xapply(f.x, [sh.cx, s * sh.ry, sh.cz]));
    }
  }
  const r = b.shape.type === 'limb' ? Math.max(...b.shape.r) : 0;
  const i = { x: 0, y: 1, z: 2 }[axis[1]];
  const sign = axis[0] === '+' ? 1 : -1;
  const best = Math.max(...pts.map((p) => sign * p[i]));
  return sign * (best + r);
}

const lowestOf = (skel, frames, names) => Math.min(...names.map((n) => {
  const b = skel.byName.get(n), f = frames.get(n);
  const r = b.shape.type === 'limb' ? b.shape.r[0] : (b.shape.rx || 0);
  return Math.min(f.x.p[2], f.tip[2]) - r;
}));

/**
 * Turn an exercise's prop list into boxes in world space.
 *
 *   {kind:'step',  under:'foot_l', height:18}
 *   {kind:'wall',  touch:'toes_l', dir:'+x'}      a plane the figure faces
 *   {kind:'seat',  under:'pelvis'}                a chair at whatever height
 *                                                 the pelvis is already at
 *   {kind:'mat'}                                  something to lie on
 */
export function placeProps(skel, frames, specs = [], H = 175, { az = null } = {}) {
  const out = [];
  for (const s of specs) {
    if (s.kind === 'step') {
      const top = s.height != null ? s.height : lowestOf(skel, frames, [s.under]);
      const f = frames.get(s.under);
      if (!f) continue;
      const cx = (f.x.p[0] + f.tip[0]) / 2, cy = (f.x.p[1] + f.tip[1]) / 2;
      out.push({
        kind: 'step',
        centre: [cx, cy, top / 2],
        size: [H * 0.26, H * 0.24, Math.max(2, top)],
      });
    } else if (s.kind === 'wall') {
      const axis = s.dir || '+x';
      const at = extremeOf(skel, frames, s.touch, axis) + (axis[0] === '+' ? 1 : -1) * (s.gap || 0.5);
      const horizontal = axis[1] === 'x';
      out.push({
        kind: 'wall',
        centre: horizontal ? [at + (axis[0] === '+' ? 2 : -2), 0, H * 0.55]
          : [0, at + (axis[0] === '+' ? 2 : -2), H * 0.55],
        size: horizontal ? [4, H * 0.9, H * 1.15] : [H * 0.9, 4, H * 1.15],
      });
    } else if (s.kind === 'seat') {
      const top = lowestOf(skel, frames, [s.under || 'pelvis']);
      const f = frames.get(s.under || 'pelvis');
      if (!f) continue;
      out.push({
        kind: 'seat',
        centre: [f.x.p[0] - H * 0.04, f.x.p[1], top / 2],
        size: [H * 0.25, H * 0.26, Math.max(2, top)],
      });
    } else if (s.kind === 'rail') {
      /* A POST, NOT A WALL.
       *
       * Six movements say "fingertip on a wall or a chair back for balance".
       * Drawn as an actual wall, the thing fills the entire frame and the
       * exercise disappears behind it — the prop that was added so nothing had
       * to be imagined ends up hiding everything. What the viewer needs to see
       * is that there is something at hand height to touch, and a slim post
       * says that without occluding the movement it is there to support. */
      const f = frames.get(s.touch);
      if (!f) continue;
      const hx = (f.x.p[0] + f.tip[0]) / 2, hy = (f.x.p[1] + f.tip[1]) / 2;
      let sign = (s.dir || '+y')[0] === '+' ? 1 : -1;
      const along = (s.dir || '+y')[1];
      /* PUT IT BEHIND THE FIGURE, NOT IN FRONT OF IT. A post on the near side
       * of the body sits between the camera and the movement and hides the
       * thing it was added to clarify. When the caller knows where the camera
       * is, the rail goes to the far side; the person is equally able to touch
       * either hand to it, and the viewer can see what they are doing. */
      if (az != null) {
        const c = Math.cos(az * Math.PI / 180), sn = Math.sin(az * Math.PI / 180);
        const toward = along === 'y' ? sign * sn : sign * c;
        if (toward > 0.3) sign = -sign;
      }
      // waist height at least: a chair back, not a doorstop
      const h = Math.max(H * 0.5, (f.x.p[2] + f.tip[2]) / 2 + H * 0.06);
      const g = s.gap == null ? 3 : s.gap;
      out.push({
        kind: 'rail',
        centre: [hx + (along === 'x' ? sign * g : 0), hy + (along === 'y' ? sign * g : 0), h / 2],
        size: [H * 0.035, H * 0.035, h],
      });
    } else if (s.kind === 'mat') {
      out.push({ kind: 'mat', centre: [0, 0, -0.6], size: [H * 1.25, H * 0.55, 1.2] });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- held --- *
 * THINGS IN THE HANDS.
 *
 * A third of the library says "hold a dumbbell", "stand on the band", "loop a
 * strap round your foot" — and then draws an empty-handed mannequin doing a
 * shape. The viewer is left to supply the object from imagination, and the
 * commonest way to get an exercise wrong is to imagine the wrong one: a row
 * with the band under your feet is a different exercise from a row with it
 * tied to a door.
 *
 * Unlike the furniture above, these MOVE. The step does not go anywhere during
 * a repetition; the dumbbell goes wherever the hand goes, so these are solved
 * from the current frame every time rather than placed once.
 */

/** Where a hand or a foot actually grips: the middle of the segment, not its
 *  origin (the wrist) or its tip (the fingertips). */
export function gripPoint(skel, frames, name) {
  const f = frames.get(name);
  if (!f) return null;
  return [(f.x.p[0] + f.tip[0]) / 2, (f.x.p[1] + f.tip[1]) / 2, (f.x.p[2] + f.tip[2]) / 2];
}

/** The floor directly under a segment — where a band stood on goes. */
function underfoot(skel, frames, name) {
  const p = gripPoint(skel, frames, name);
  return p ? [p[0], p[1], 1] : null;
}

const HELD_SIZE = {
  dumbbell: { bar: 1.1, plate: 7.0, span: 21 },
  stick: { bar: 1.5, span: 0 },
  band: { bar: 0.8 },
  strap: { bar: 0.7 },
};

/**
 * Turn an exercise's `holds` list into world-space objects for the current
 * frame.
 *
 *   {kind:'dumbbell', at:'hand_l'}             one in that hand
 *   {kind:'dumbbell', at:['hand_l','hand_r']}  one held in both, at the middle
 *   {kind:'band', from:'hand_l', to:'hand_r'}  stretched between two grips
 *   {kind:'band', from:'hand_l', under:'foot_l'} anchored under a foot
 *   {kind:'stick', from:'hand_l', to:'hand_r'} a dowel, overhanging both ends
 *   {kind:'strap', from:['hand_l','hand_r'], to:'foot_l'}
 */
export function placeHeld(skel, frames, holds = [], H = 175) {
  const out = [];
  const k = H / 175;
  const pt = (spec) => {
    if (!spec) return null;
    if (Array.isArray(spec)) {
      const ps = spec.map((n) => gripPoint(skel, frames, n)).filter(Boolean);
      if (!ps.length) return null;
      return [0, 1, 2].map((i) => ps.reduce((a, p) => a + p[i], 0) / ps.length);
    }
    return gripPoint(skel, frames, spec);
  };
  for (const h of holds) {
    if (h.kind === 'dumbbell') {
      const c = pt(h.at);
      if (!c) continue;
      /* A DUMBBELL RUNS ACROSS THE PALM, NOT ALONG THE FORLEARM.
       *
       * The bar goes through the fist at right angles to the arm, which is why
       * one drawn along the hand's own long axis reads as a stick being
       * carried rather than a weight being held. The axis here is the one
       * perpendicular to the arm that is most nearly horizontal — which is
       * where a dumbbell hangs, whatever the arm is doing. A goblet-style hold
       * against the chest is the exception and says `axis: 'up'`. */
      const nm = Array.isArray(h.at) ? h.at[0] : h.at;
      const f = frames.get(nm);
      const arm = f ? [f.tip[0] - f.x.p[0], f.tip[1] - f.x.p[1], f.tip[2] - f.x.p[2]] : [0, 0, -1];
      const aL = Math.hypot(...arm) || 1;
      const a1 = arm.map((v) => v / aL);
      let dir;
      if (h.axis === 'up') {
        dir = [0, 0, 1];
      } else {
        // cross(arm, world up) is horizontal and perpendicular to the arm;
        // when the arm IS vertical that degenerates, so fall back across the body
        dir = [a1[1] * 1 - a1[2] * 0, a1[2] * 0 - a1[0] * 1, 0];
        if (Math.hypot(...dir) < 0.2) dir = [0, 1, 0];
      }
      const L = Math.hypot(...dir) || 1;
      const u = dir.map((v) => v / L);
      const half = (HELD_SIZE.dumbbell.span / 2) * k * (h.scale || 1);
      out.push({ kind: 'dumbbell',
        a: [c[0] - u[0] * half, c[1] - u[1] * half, c[2] - u[2] * half],
        b: [c[0] + u[0] * half, c[1] + u[1] * half, c[2] + u[2] * half],
        r: HELD_SIZE.dumbbell.bar * k, plate: HELD_SIZE.dumbbell.plate * k * (h.scale || 1) });
      continue;
    }
    const a = pt(h.from);
    const b = h.under ? underfoot(skel, frames, h.under) : pt(h.to);
    if (!a || !b) continue;
    if (h.kind === 'stick') {
      // a dowel runs past the hands rather than stopping at them
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L = Math.hypot(...d) || 1;
      const over = 14 * k;
      const u = d.map((v) => v / L);
      out.push({ kind: 'stick',
        a: a.map((v, i) => v - u[i] * over), b: b.map((v, i) => v + u[i] * over),
        r: HELD_SIZE.stick.bar * k });
      continue;
    }
    out.push({ kind: h.kind, a, b, r: (HELD_SIZE[h.kind] || HELD_SIZE.band).bar * k });
  }
  return out;
}

/** What each prop is called, for the caption under the transport. */
export const PROP_LABEL = {
  step: 'a step or a low box', wall: 'a wall', seat: 'a chair or a bench', mat: 'a mat',
  rail: 'a wall, a door frame or a chair back \u2014 something to touch for balance',
};
/** Flip left for right in a holds list. A mirrored single-arm row has to put
 *  the dumbbell in the other hand, or the demonstration shows the same side
 *  twice and the person loads the leg they were told to rest. */
export function mirrorHolds(holds = [], mirror = false) {
  if (!mirror) return holds;
  const f = (n) => (typeof n !== 'string' ? n
    : n.endsWith('_l') ? n.slice(0, -2) + '_r' : n.endsWith('_r') ? n.slice(0, -2) + '_l' : n);
  const any = (v) => (Array.isArray(v) ? v.map(f) : f(v));
  return holds.map((h) => ({
    ...h,
    ...(h.at ? { at: any(h.at) } : {}),
    ...(h.from ? { from: any(h.from) } : {}),
    ...(h.to ? { to: any(h.to) } : {}),
    ...(h.under ? { under: any(h.under) } : {}),
  }));
}

export const HELD_LABEL = {
  dumbbell: 'a dumbbell', band: 'a resistance band', stick: 'a broom handle or a dowel',
  strap: 'a strap, a belt or a towel',
};
export const propsNeeded = (ex) => [...new Set([
  ...(ex.props || []).map((p) => PROP_LABEL[p.kind]),
  ...(ex.holds || []).map((h) => HELD_LABEL[h.kind]),
].filter(Boolean))];
