/* math.js — the small amount of linear algebra the mannequin needs, with no
 * dependencies at all.
 *
 * WHY NOT THREE.MATH. The skeleton, the poses, the IK solver and the exercise
 * tracks are the part of this app that has to be *correct* — a joint that
 * bends the wrong way is a wrong instruction to a person about their body.
 * Keeping that layer free of three.js means it runs under bare `node`, which
 * is what selftest.mjs does: it asserts that hip flexion puts the knee in
 * front of the hip and knee flexion puts the ankle behind it, with no browser
 * and no install. three.js is used only to *draw* the result (figure.js).
 *
 * Conventions, used everywhere in this project:
 *   vectors      plain [x, y, z]
 *   quaternions  plain [x, y, z, w], unit, right-handed
 *   transforms   rigid only: {q, p} — rotate by q, then translate by p.
 *                Nothing in a body scales, so there is no matrix anywhere.
 *
 * WORLD AXES are anatomical, not graphical:
 *   +X anterior (the way the subject faces)
 *   +Y to the subject's LEFT
 *   +Z superior (up)
 * which is right-handed (X x Y = Z) and makes the three clinical planes fall
 * out for free: rotation about Y is flexion/extension, about X is
 * abduction/adduction, about Z is internal/external rotation.
 */

export const DEG = Math.PI / 180, RAD = 180 / Math.PI;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------- vectors */
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export function vnorm(a) {
  const l = vlen(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
/** a with every component of b removed — Gram-Schmidt, one step. */
export const vreject = (a, b) => vsub(a, vmul(b, vdot(a, b)));

/* --------------------------------------------------------- quaternions */
export const qid = () => [0, 0, 0, 1];
export function qaxis(axis, rad) {
  const a = vnorm(axis), s = Math.sin(rad / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(rad / 2)];
}
export function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz];
}
export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
/** Rotate a vector by a quaternion (v' = q v q*, expanded). */
export function vrot(v, q) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + y * tz - z * ty,
    v[1] + w * ty + z * tx - x * tz,
    v[2] + w * tz + x * ty - y * tx];
}
export function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let e = b;
  if (d < 0) { e = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) return qnorm([lerp(a[0], e[0], t), lerp(a[1], e[1], t), lerp(a[2], e[2], t), lerp(a[3], e[3], t)]);
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + e[0] * wb, a[1] * wa + e[1] * wb, a[2] * wa + e[2] * wb, a[3] * wa + e[3] * wb];
}
/** The shortest rotation carrying unit a onto unit b. `fallback` breaks the
 *  tie when they are antiparallel and every perpendicular axis would do. */
export function qBetween(a, b, fallback = [0, 1, 0]) {
  const u = vnorm(a), v = vnorm(b), d = vdot(u, v);
  if (d > 0.999999) return qid();
  if (d < -0.999999) return qaxis(vnorm(vreject(fallback, u)), Math.PI);
  const c = vcross(u, v);
  return qnorm([c[0], c[1], c[2], 1 + d]);
}
/** Decompose into intrinsic Y-X-Z Euler angles (radians), so that
 *  q = Ry(y) * Rx(x) * Rz(z). This is the decomposition the joint model uses:
 *  see body.js — flexion is the outer rotation, then abduction, then the
 *  long-axis spin, which is the order a clinician reads a joint in. */
export function qToYXZ(q) {
  const [x, y, z, w] = qnorm(q);
  // third column of the rotation matrix, plus the m12 term
  const m12 = 2 * (y * z - w * x);
  const sx = clamp(-m12, -1, 1);
  const ax = Math.asin(sx);
  if (Math.abs(sx) < 0.9999995) {
    const m02 = 2 * (x * z + w * y), m22 = 1 - 2 * (x * x + y * y);
    const m10 = 2 * (x * y + w * z), m11 = 1 - 2 * (x * x + z * z);
    return [ax, Math.atan2(m02, m22), Math.atan2(m10, m11)];
  }
  // gimbal lock: fold the spin into the first angle
  const m01 = 2 * (x * y - w * z), m00 = 1 - 2 * (y * y + z * z);
  return [ax, Math.atan2(-m01, m00), 0];
}
export function qFromYXZ(x, y, z) {
  return qmul(qmul(qaxis([0, 1, 0], y), qaxis([1, 0, 0], x)), qaxis([0, 0, 1], z));
}
/** The orthonormal frame with +Z along `dir` and +X as close to `front` as it
 *  can get, returned as a quaternion. Authoring every bone's rest pose as two
 *  vectors instead of three angles is what keeps the skeleton table readable
 *  AND numerically stable: a limb hanging straight down is an antiparallel
 *  case for "shortest rotation", and which perpendicular axis it happened to
 *  pick would silently decide whether the knee bends forwards or backwards. */
export function frameQuat(dir, front) {
  const z = vnorm(dir);
  let x = vreject(front, z);
  if (vlen(x) < 1e-6) x = vreject(Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], z);
  x = vnorm(x);
  const y = vcross(z, x);
  return qFromBasis(x, y, z);
}
/** Quaternion from the three columns of a rotation matrix. */
export function qFromBasis(x, y, z) {
  const m00 = x[0], m10 = x[1], m20 = x[2];
  const m01 = y[0], m11 = y[1], m21 = y[2];
  const m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

/* ---------------------------------------------------- rigid transforms */
export const xid = () => ({ q: qid(), p: [0, 0, 0] });
/** b expressed in a's parent: apply b, then a. */
export const xmul = (a, b) => ({ q: qmul(a.q, b.q), p: vadd(a.p, vrot(b.p, a.q)) });
export const xapply = (x, p) => vadd(vrot(p, x.q), x.p);
export const xdir = (x, d) => vrot(d, x.q);
export const xinv = (x) => { const qi = qconj(x.q); return { q: qi, p: vmul(vrot(x.p, qi), -1) }; };
/** A point in world space, expressed in x's local frame. */
export const xunapply = (x, p) => vrot(vsub(p, x.p), qconj(x.q));

/* --------------------------------------------------------- misc easing */
export const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Ease that holds briefly at both ends — how a controlled rep actually
 *  moves, as opposed to a sine wave that is fastest exactly where a person
 *  is meant to pause. */
export const easeHold = (t) => smoothstep(clamp((t - 0.08) / 0.84, 0, 1));
export const round1 = (v) => Math.round(v * 10) / 10;
