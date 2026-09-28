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

/* ------------------------------------------------------------- machines ---
 *
 * GYM MACHINES, BUILT OUT OF BOXES.
 *
 * The rest of this file places a step, a wall and a chair — things a person
 * can picture without help. A hip abduction machine is not that. Somebody who
 * has never used one cannot picture it, cannot picture which way the pads
 * push, and cannot tell from a written dose which of the forty machines on the
 * floor is the one meant. That is not a gap the prose can close: "sit with the
 * pads on the outside of your knees" only means something once you have seen
 * a machine with pads on the outside of its knees.
 *
 * So each machine is assembled here from the same axis-aligned boxes as
 * everything else, placed FROM THE POSE exactly as the step and the chair are:
 * the seat goes wherever the pelvis already is, the back pad goes behind
 * whatever the torso is doing, the footplate goes under the feet. Nothing is
 * measured in absolute centimetres, so the same machine fits a figure of any
 * height, and nothing has to agree with a pose in two places.
 *
 * FIDELITY IS NOT THE POINT, and chasing it would be a mistake. A machine
 * drawn to the millimetre would still be the wrong brand. What the viewer has
 * to get out of this in three seconds is: I sit here, this part presses on
 * that part of me, and this is the direction it moves. Everything else is
 * decoration, and decoration costs frames on a phone.
 *
 * THE PARTS THAT MOVE ARE NOT HERE. A knee pad follows the knee and an ankle
 * roller follows the ankle, so they are `holds` (see placeHeld below) and are
 * re-solved every frame. Only the frame, the seat and the stack stand still,
 * and those are what this builds.
 */

/** Which way the figure is facing, and how wide it is. Everything below is
 *  expressed against these rather than against the axes, so a machine cannot
 *  end up mirrored or inside the person. */
function machineContext(skel, frames, H) {
  const g = (n) => frames.get(n) || null;
  const mid = (n) => { const f = g(n); return f ? [(f.x.p[0] + f.tip[0]) / 2, (f.x.p[1] + f.tip[1]) / 2, (f.x.p[2] + f.tip[2]) / 2] : null; };
  const low = (n) => { const f = g(n), b = skel.byName.get(n); if (!f || !b) return 0;
    const r = b.shape.type === 'limb' ? b.shape.r[0] : (b.shape.rz || b.shape.ry || 0);
    return Math.min(f.x.p[2], f.tip[2]) - r; };
  const pelvis = g('pelvis'), thorax = g('thorax_upper');
  const knee = g('shin_l'), ankle = g('foot_l');
  return {
    H, k: H / 175,
    g, mid, low,
    /* The figure faces +x throughout this app, left is +y. Named rather than
     * written as literals because a sign error here puts the back pad through
     * the person's chest and the mistake is invisible in the code.
     *
     * `backX` is the BACK SURFACE of the trunk, not the joint centre down the
     * middle of it. Those differ by about ten centimetres, which is more than
     * the thickness of a back pad — so placing the pad from the joint centre
     * buries it in the ribs, and the figure appears to be sitting a hand's
     * width in front of a chair it is supposedly leaning on. */
    seatTop: low('pelvis'),
    hipX: pelvis ? pelvis.x.p[0] : 0,
    backX: Math.min(
      extremeOf(skel, frames, 'thorax_upper', '-x'),
      extremeOf(skel, frames, 'pelvis', '-x'),
    ),
    /* ...and the front of the chest, for the pads you lean INTO. Same lesson
     * as backX and the same ten centimetres: a chest pad placed from the
     * middle of the torso floats a hand's width off the person it is holding.
     * The chest-supported row is defined by that contact — it is the reason
     * to choose the machine — so a visible gap there teaches the opposite of
     * the exercise. */
    frontX: extremeOf(skel, frames, 'thorax_upper', '+x'),
    kneeX: knee ? knee.x.p[0] : H * 0.24,
    kneeZ: knee ? knee.x.p[2] : H * 0.29,
    footX: ankle ? ankle.x.p[0] : H * 0.30,
    footZ: ankle ? ankle.x.p[2] : H * 0.04,
    halfW: H * 0.13,
  };
}

/** A box, in the units everything else here uses. */
const box = (kind, centre, size, tilt) => (tilt ? { kind, centre, size, tilt } : { kind, centre, size });

/* The shared furniture. Almost every machine on the floor is one of these
 * three with something bolted to it, which is also the most useful thing a
 * person can know walking in. */
const PARTS = {
  /** A base frame on the floor: what stops the thing tipping over, and what
   *  makes a drawing read as a machine rather than as a chair. */
  base: (c, { from = -0.30, to = 0.34 } = {}) => [
    box('frame', [c.hipX + c.H * (from + to) / 2, 0, c.H * 0.018],
      [c.H * (to - from), c.H * 0.20, c.H * 0.035]),
  ],
  /** Seat pad on a pedestal. The pad is upholstery-coloured and the pedestal
   *  is not, because the only thing the viewer needs to pick out instantly is
   *  where the body goes. */
  seat: (c, { back = -0.13, front = 0.20 } = {}) => {
    const cx = c.hipX + c.H * (back + front) / 2;
    return [
      box('frame', [cx, 0, c.seatTop * 0.45], [c.H * 0.10, c.H * 0.11, c.seatTop * 0.9]),
      box('pad', [cx, 0, c.seatTop - c.H * 0.016], [c.H * (front - back), c.H * 0.19, c.H * 0.032]),
    ];
  },
  /** An upright back pad behind the torso. */
  backrest: (c, { rise = 0.34, tilt = 0 } = {}) => {
    const x = c.backX - c.H * 0.022;
    return [
      box('frame', [x - c.H * 0.03, 0, c.seatTop + c.H * rise * 0.42], [c.H * 0.03, c.H * 0.05, c.H * rise * 0.95]),
      box('pad', [x, 0, c.seatTop + c.H * rise * 0.5], [c.H * 0.035, c.H * 0.19, c.H * rise], tilt),
    ];
  },
  /** The weight stack. Behind the seat, because that is where it is on almost
   *  every selectorised machine, and because it is the single feature that
   *  says "this one has a pin in it" at a glance. */
  stack: (c, { behind = 0.30 } = {}) => {
    const x = c.hipX - c.H * behind;
    const h = c.H * 0.46;
    const out = [box('frame', [x, 0, h / 2], [c.H * 0.10, c.H * 0.15, h])];
    for (let i = 0; i < 7; i++) {
      out.push(box('stack', [x, 0, c.H * 0.055 + i * c.H * 0.055], [c.H * 0.115, c.H * 0.13, c.H * 0.038]));
    }
    return out;
  },
  /** A plate to push the feet against. */
  footplate: (c, { at = null, tilt = 0, size = 0.22 } = {}) => [
    box('frame', [at == null ? c.footX + c.H * 0.06 : at, 0, c.H * size * 0.5],
      [c.H * 0.035, c.H * 0.26, c.H * size], tilt),
  ],
  /** A vertical column with a pulley on it. The cable itself is a `hold`. */
  column: (c, { x = -0.34, height = 1.15 } = {}) => [
    box('frame', [c.hipX + c.H * x, 0, c.H * height * 0.5], [c.H * 0.06, c.H * 0.09, c.H * height]),
    box('frame', [c.hipX + c.H * x, 0, c.H * 0.03], [c.H * 0.22, c.H * 0.18, c.H * 0.05]),
  ],
};

/** The angled pad under the upper arms on a curl or triceps machine: laid
 *  along the arm, just behind it, spanning both. Tilt is about the lateral
 *  axis, the same as every other angled pad here. */
function armPad(c) {
  const arms = ['upperarm_l', 'upperarm_r'].map((n) => c.g(n)).filter(Boolean);
  if (!arms.length) return [];
  const avg = (k, i) => arms.reduce((a, f) => a + (k === 'p' ? f.x.p[i] : f.tip[i]), 0) / arms.length;
  const sh = [avg('p', 0), avg('p', 2)], el = [avg('tip', 0), avg('tip', 2)];
  const dx = el[0] - sh[0], dz = el[1] - sh[1], len = Math.hypot(dx, dz) || 1;
  const theta = Math.atan2(dx, -dz);                 // 0 = hanging straight down
  const nx = Math.cos(theta), nz = Math.sin(theta);  // pad normal, towards the arm
  // centred towards the elbow, because the elbow is what the pad is for
  const off = c.H * 0.042, at = 0.62;
  const cx = sh[0] + dx * at - nx * off, cz = sh[1] + dz * at - nz * off;
  return [
    box('pad', [cx, 0, cz], [c.H * 0.035, c.H * 0.26, len * 0.95], -theta * 180 / Math.PI),
    box('frame', [cx, 0, (c.seatTop + cz) / 2], [c.H * 0.04, c.H * 0.05, Math.max(cz - c.seatTop, c.H * 0.05)]),
  ];
}

/**
 * One entry per machine named in the gym rotation.
 *
 * Each returns the STILL parts only. Read alongside the `holds` list on the
 * exercise, which carries the pads and cables that follow the body.
 */
const MACHINE = {
  /* Seat, back pad, stack. The knee pads are holds. */
  abduction: (c) => [...PARTS.base(c), ...PARTS.seat(c), ...PARTS.backrest(c), ...PARTS.stack(c)],
  adduction: (c) => [...PARTS.base(c), ...PARTS.seat(c), ...PARTS.backrest(c), ...PARTS.stack(c)],

  /* Sit, legs out in front, curl them down and back. The thigh restraint
   * across the lap is what stops you lifting out of the seat, and it is the
   * part people leave unadjusted, so it is drawn. */
  legcurl_seated: (c) => [
    ...PARTS.base(c, { from: -0.30, to: 0.50 }), ...PARTS.seat(c), ...PARTS.backrest(c), ...PARTS.stack(c),
    box('pad', [c.kneeX - c.H * 0.06, 0, c.kneeZ + c.H * 0.075], [c.H * 0.09, c.H * 0.20, c.H * 0.035]),
    box('frame', [c.kneeX - c.H * 0.06, 0, c.kneeZ + c.H * 0.14], [c.H * 0.025, c.H * 0.03, c.H * 0.10]),
  ],

  /* Face down on a flat bench, curl the heels towards the backside. */
  legcurl_lying: (c) => {
    const top = c.low('pelvis');
    return [
      ...PARTS.base(c, { from: -0.42, to: 0.34 }),
      box('frame', [c.hipX - c.H * 0.08, 0, top * 0.45], [c.H * 0.12, c.H * 0.12, top * 0.9]),
      box('pad', [c.hipX - c.H * 0.10, 0, top - c.H * 0.018], [c.H * 0.62, c.H * 0.19, c.H * 0.036]),
      ...PARTS.stack(c, { behind: 0.58 }),
    ];
  },

  /* Shoulders on a bench, weight across the hips, feet on the floor. The bar
   * pad is a hold — it rides the hips, which is the whole movement. */
  hipthrust: (c) => {
    const sh = c.low('thorax_upper');
    return [
      box('frame', [c.backX - c.H * 0.02, 0, sh * 0.44], [c.H * 0.20, c.H * 0.14, sh * 0.88]),
      box('pad', [c.backX - c.H * 0.02, 0, sh - c.H * 0.018], [c.H * 0.24, c.H * 0.24, c.H * 0.036]),
      box('frame', [c.backX - c.H * 0.02, 0, c.H * 0.015], [c.H * 0.34, c.H * 0.26, c.H * 0.03]),
    ];
  },

  /* The 45-degree back extension: an angled thigh pad you lean over, with
   * your ankles hooked under two rollers.
   *
   * THE FIGURE IS DRAWN HINGING RATHER THAN LYING AT 45 DEGREES, and that is
   * a deliberate trade. Tilting the whole body means abandoning the balance
   * solver that places every other standing movement, and what came back was
   * a figure sprawled sideways across the room — a worse drawing of a better
   * idea. What a person actually has to take away here is which frame in the
   * gym this is (angled pad at the hips, rollers at the ankles) and what
   * moves (the hips, not the spine). Both survive the simplification; the
   * tilt was decoration. */
  backext45: (c) => {
    const hip = c.low('pelvis') || c.H * 0.52;
    const padX = c.hipX + c.H * 0.10;
    return [
      ...PARTS.base(c, { from: -0.16, to: 0.24 }),
      box('frame', [padX, 0, hip * 0.42], [c.H * 0.05, c.H * 0.09, hip * 0.84]),
      box('pad', [padX, 0, hip - c.H * 0.09], [c.H * 0.10, c.H * 0.20, c.H * 0.17], 34),
      box('frame', [c.footX - c.H * 0.02, 0, c.H * 0.045], [c.H * 0.20, c.H * 0.26, c.H * 0.09]),
      box('frame', [padX + c.H * 0.04, 0, hip + c.H * 0.06], [c.H * 0.03, c.H * 0.30, c.H * 0.03]),
    ];
  },

  /* Seated calf: a pad across the knees, the balls of the feet on a plate. */
  calf_seated: (c) => [
    ...PARTS.base(c, { from: -0.24, to: 0.40 }), ...PARTS.seat(c),
    box('pad', [c.kneeX - c.H * 0.02, 0, c.kneeZ + c.H * 0.085], [c.H * 0.13, c.H * 0.21, c.H * 0.045]),
    box('frame', [c.kneeX - c.H * 0.02, 0, c.kneeZ + c.H * 0.17], [c.H * 0.03, c.H * 0.035, c.H * 0.12]),
    box('frame', [c.footX + c.H * 0.04, 0, c.H * 0.045], [c.H * 0.14, c.H * 0.24, c.H * 0.09]),
  ],

  /* Leg press: an angled back pad low down, a sled up in front. Drawn with
   * the sled ABOVE the feet because that is the thing people get wrong about
   * this machine — it is not a horizontal push. */
  legpress: (c) => [
    ...PARTS.base(c, { from: -0.34, to: 0.62 }),
    box('frame', [c.hipX - c.H * 0.06, 0, c.seatTop * 0.45], [c.H * 0.22, c.H * 0.13, c.seatTop * 0.9]),
    box('pad', [c.hipX - c.H * 0.06, 0, c.seatTop - c.H * 0.018], [c.H * 0.26, c.H * 0.20, c.H * 0.036]),
    box('pad', [c.backX - c.H * 0.10, 0, c.seatTop + c.H * 0.13], [c.H * 0.16, c.H * 0.20, c.H * 0.05], -62),
    /* THE SLED GOES WHERE THE FEET ARE, not where a leg press is generally
     * assumed to have one. That is the same rule as the step and the chair,
     * and it is what stops the drawing from telling the viewer to push
     * against a plate their feet are forty centimetres clear of — which is
     * exactly what a fixed height produced here. */
    box('frame', [c.footX + c.H * 0.08, 0, c.footZ], [c.H * 0.05, c.H * 0.32, c.H * 0.40], -20),
    box('frame', [c.footX + c.H * 0.13, 0, c.footZ], [c.H * 0.07, c.H * 0.24, c.H * 0.30], -20),
  ],

  /* Sit, press two handles forward. Kept deliberately plain: it is the one
   * machine here that is meant to stay light. */
  chestpress: (c) => [
    ...PARTS.base(c), ...PARTS.seat(c), ...PARTS.backrest(c, { rise: 0.40 }), ...PARTS.stack(c),
  ],

  /* Reverse pec-deck: the same seat with a CHEST pad, because on this one you
   * face into the machine and pull the arms back. */
  pecdeck: (c) => [
    ...PARTS.base(c), ...PARTS.seat(c),
    box('frame', [c.frontX + c.H * 0.055, 0, c.seatTop + c.H * 0.16], [c.H * 0.04, c.H * 0.06, c.H * 0.34]),
    box('pad', [c.frontX + c.H * 0.020, 0, c.seatTop + c.H * 0.22], [c.H * 0.040, c.H * 0.20, c.H * 0.22]),
    ...PARTS.stack(c, { behind: 0.34 }),
  ],

  /* Chest-supported row: the pad is in FRONT of you and you pull towards it.
   * Same shape as the pec-deck and the opposite movement, which is exactly
   * the confusion worth drawing. */
  rowpad: (c) => [
    ...PARTS.base(c, { from: -0.20, to: 0.40 }), ...PARTS.seat(c),
    box('frame', [c.frontX + c.H * 0.06, 0, c.seatTop + c.H * 0.14], [c.H * 0.05, c.H * 0.07, c.H * 0.32]),
    box('pad', [c.frontX + c.H * 0.022, 0, c.seatTop + c.H * 0.21], [c.H * 0.042, c.H * 0.21, c.H * 0.24], 8),
    ...PARTS.stack(c, { behind: 0.26 }),
  ],

  /* Seated cable row: a low bench, a footplate to brace against, and the
   * pulley down at floor level. */
  cablerow: (c) => [
    box('frame', [c.hipX - c.H * 0.05, 0, c.seatTop * 0.4], [c.H * 0.40, c.H * 0.12, c.seatTop * 0.8]),
    box('pad', [c.hipX - c.H * 0.05, 0, c.seatTop - c.H * 0.016], [c.H * 0.44, c.H * 0.17, c.H * 0.032]),
    ...PARTS.footplate(c, { at: c.footX + c.H * 0.05, tilt: -12, size: 0.26 }),
    box('frame', [c.footX + c.H * 0.13, 0, c.H * 0.07], [c.H * 0.10, c.H * 0.20, c.H * 0.14]),
  ],

  /* A cable column, which is four machines in one and worth recognising as
   * such: the pulley slides up and down the upright. */
  cable_high: (c) => [...PARTS.column(c, { x: 0.36, height: 1.25 })],
  cable_low: (c) => [...PARTS.column(c, { x: 0.36, height: 1.25 })],
  cable_behind: (c) => [...PARTS.column(c, { x: -0.40, height: 1.25 })],

  /* The two arm machines share a frame: a seat and an angled pad the upper
   * arms lie along. The pad is the whole point of choosing them over a cable
   * — it is what stops the elbow drifting — so it is placed from the arm
   * the figure is actually holding, at the angle it is actually held. */
  curl_seat: (c) => [...PARTS.base(c, { from: -0.24, to: 0.44 }), ...PARTS.seat(c), ...armPad(c), ...PARTS.stack(c, { behind: 0.26 })],
  triceps_seat: (c) => [
    ...PARTS.base(c, { from: -0.30, to: 0.44 }), ...PARTS.seat(c), ...PARTS.backrest(c, { rise: 0.40 }), ...armPad(c),
    ...PARTS.stack(c),
  ],

  /* Ab crunch: a seat with a back pad and rollers for the feet. The handles
   * move with the person, so they are not drawn as furniture. */
  crunch_seat: (c) => [
    ...PARTS.base(c, { from: -0.30, to: 0.40 }), ...PARTS.seat(c), ...PARTS.backrest(c, { rise: 0.40 }), ...PARTS.stack(c),
    box('pad', [c.footX - c.H * 0.02, 0, c.footZ + c.H * 0.06], [c.H * 0.05, c.H * 0.22, c.H * 0.05]),
  ],

  /* Rotary torso: you sit, your legs are held, and only the trunk turns. */
  rotarytorso: (c) => [
    ...PARTS.base(c), ...PARTS.seat(c),
    box('pad', [c.kneeX - c.H * 0.10, c.H * 0.075, c.kneeZ + c.H * 0.07], [c.H * 0.08, c.H * 0.05, c.H * 0.14]),
    box('pad', [c.kneeX - c.H * 0.10, -c.H * 0.075, c.kneeZ + c.H * 0.07], [c.H * 0.08, c.H * 0.05, c.H * 0.14]),
    ...PARTS.stack(c, { behind: 0.32 }),
  ],
};

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
    } else if (s.kind === 'machine') {
      /* One spec becomes a dozen boxes. The renderer already draws a list of
       * boxes, so a machine needs nothing from it that a chair did not. */
      const make = MACHINE[s.type];
      if (!make) continue;
      out.push(...make(machineContext(skel, frames, H)));
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
  /* MACHINE PARTS THAT FOLLOW THE BODY. A knee pad is not furniture: it is
   * bolted to an arm that swings, so it goes wherever the knee goes, and a
   * still drawing of it in one place is a drawing of a machine jammed. These
   * are cylinders because that is genuinely what they are — every ankle
   * roller, knee pad and hip bar on a gym floor is a padded tube. */
  pad: { bar: 4.2 },
  handle: { bar: 1.6 },
  cable: { bar: 0.55 },
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
    /* A PAD RIDES A SEGMENT. `at` says which one (or two, for a roller that
     * runs across both ankles), `offset` says where against it in centimetres
     * — and the sideways part of that offset FLIPS with the side, so a pad on
     * the outside of the left knee is still on the outside after mirroring
     * rather than buried in the other leg. That sign is the whole reason this
     * is computed here instead of being written out twice per exercise. */
    if (h.kind === 'pad' || h.kind === 'handle') {
      const c = pt(h.at);
      if (!c) continue;
      const nm = Array.isArray(h.at) ? h.at[0] : h.at;
      const sgn = typeof nm === 'string' && nm.endsWith('_r') ? -1 : 1;
      const off = h.offset || [0, 0, 0];
      const centre = [c[0] + (off[0] || 0) * k, c[1] + sgn * (off[1] || 0) * k, c[2] + (off[2] || 0) * k];
      const axis = h.axis || 'y';
      const u = axis === 'x' ? [1, 0, 0] : axis === 'z' ? [0, 0, 1] : [0, 1, 0];
      const half = ((h.span == null ? 18 : h.span) / 2) * k;
      out.push({ kind: h.kind,
        a: centre.map((v, i) => v - u[i] * half),
        b: centre.map((v, i) => v + u[i] * half),
        r: (h.r == null ? HELD_SIZE[h.kind].bar : h.r) * k });
      continue;
    }
    /* A CABLE RUNS FROM THE HAND TO A PULLEY THAT IS NOT PART OF THE BODY.
     * Anchors are given as fractions of height from the figure's own origin,
     * so one number works for anybody: [1.05, 0, 1.25] is a high pulley a
     * little over a body-length in front and just above head height. */
    if (h.kind === 'cable') {
      const a2 = pt(h.from);
      if (!a2) continue;
      const an = h.anchor || [1.0, 0, 1.2];
      out.push({ kind: 'cable', a: a2,
        b: [an[0] * H, an[1] * H, an[2] * H],
        r: HELD_SIZE.cable.bar * k });
      continue;
    }
    if (h.kind === 'dumbbell') {
      const c0 = pt(h.at);
      if (!c0) continue;
      /* An `offset` for the same reason the pads have one: a bar resting
       * ACROSS the hips sits on top of them, and the hip's grip point is the
       * middle of the pelvis — inside the person. Sideways offsets flip with
       * the side, as they do for pads. */
      const o = h.offset || [0, 0, 0];
      const sn = (Array.isArray(h.at) ? h.at[0] : h.at).endsWith('_r') ? -1 : 1;
      const c = [c0[0] + (o[0] || 0) * k, c0[1] + sn * (o[1] || 0) * k, c0[2] + (o[2] || 0) * k];
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
  /* Deliberately unlabelled: the pads, handles and cable are part of the
   * machine the exercise already names, and listing "a padded roller" under
   * "you need" would read as a separate thing to go and find. */
  pad: null, handle: null, cable: null,
};

/** What each machine is called when the app says what you need, and — the
 *  part that actually helps — how to pick it out of a room full of them. */
export const MACHINE_LABEL = {
  abduction: 'the hip abduction machine \u2014 a seat with a pad on the OUTSIDE of each knee',
  adduction: 'the hip adduction machine \u2014 the same seat with the pads on the INSIDE of each knee',
  legcurl_seated: 'the seated leg curl \u2014 you sit, legs straight out in front, and curl them down',
  legcurl_lying: 'the lying leg curl \u2014 a flat bench you lie face down on, roller behind the ankles',
  hipthrust: 'the hip thrust or glute drive machine \u2014 a low back pad, a bar or pad across the hips',
  backext45: 'the 45-degree back extension \u2014 an angled pad for your thighs, rollers behind your ankles',
  calf_seated: 'the seated calf raise \u2014 a seat with a pad that sits across your knees',
  legpress: 'the leg press \u2014 you sit low and push a platform up and away',
  chestpress: 'the chest press machine \u2014 a seat with two handles beside your chest',
  pecdeck: 'the reverse pec-deck \u2014 a seat with a chest pad and two arms that swing back',
  rowpad: 'the chest-supported row \u2014 a seat with a pad in front of your chest to lean into',
  cablerow: 'the seated cable row \u2014 a long low bench with a footplate and a handle on a cable',
  cable_high: 'a cable machine with the pulley set HIGH',
  cable_low: 'a cable machine with the pulley set LOW, near the floor',
  cable_behind: 'a cable machine \u2014 stand facing away from it, pulley low',
  curl_seat: 'the biceps curl machine \u2014 a seat with an angled pad in front that your upper arms lie on',
  triceps_seat: 'the triceps extension machine \u2014 a seat with a pad your upper arms rest on, handles beyond the elbows',
  crunch_seat: 'the ab crunch machine \u2014 a seat with handles by your shoulders or a pad across your chest',
  rotarytorso: 'the rotary torso machine \u2014 a seat with pads that hold your knees still',
};
export const propsNeeded = (ex) => [...new Set([
  ...(ex.props || []).map((p) => (p.kind === 'machine' ? MACHINE_LABEL[p.type] : PROP_LABEL[p.kind])),
  ...(ex.holds || []).map((h) => HELD_LABEL[h.kind]),
].filter(Boolean))];
