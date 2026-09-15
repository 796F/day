/* anim.js — movement: the exercise library, and the player that runs one.
 *
 * An exercise is a starting posture plus a short list of keyframes, each one a
 * partial pose. Keyframes rather than per-joint curves because that is how a
 * movement is actually described — "start here, end here, and pause at the
 * end range" — and because a format a person can read in the file is a format
 * the agent can write correctly. `pt-exercise` blocks in a reply parse into
 * exactly this shape, so anything in this library is something the agent can
 * also invent on the spot.
 *
 * Timing is deliberately slow and holds at both ends (see easeHold). A rep
 * animated on a sine wave is fastest exactly where the person is supposed to
 * be pausing, and demonstrates the opposite of what it is teaching.
 */
import { clamp, easeHold, lerp } from './math.js';
import { solveFrames, segmentLowZ, lowestPoint } from './body.js';
import { clonePose, lerpPose, mirrorPose, clampPose, place, solveIK, standOnFloor, POSTURE, posturePlacement } from './pose.js';


/* ---------------------------------------------------------------------------
 * HOW AN EXERCISE IS DESCRIBED
 *
 * `cue`, `watch` and `why` are one-liners: they fit on a card and under the
 * transport, and they are what you glance at mid-repetition.
 *
 * They are not enough to DO the thing from. Somebody alone in a room needs to
 * know how to set up before they start, what order things happen in, and —
 * the part that was missing entirely — how to actually SEE the fault they are
 * being told to look for. "The knee falls inwards" is not an observation, it
 * is a label; "line your kneecap up with your second toe at the start, and
 * watch whether it drifts inside your big toe on the way down" is one.
 *
 *   setup  what to arrange before the first repetition
 *   steps  the movement, in order, one instruction per line
 *   look   [sign, how you see it, what it means] — an observation is only
 *          useful if it comes with a way of making it
 *   dose   how many, how often, and how fast
 *   stop   what response means back off, and what means stop altogether
 *
 * Verbose on purpose. Reading it twice is cheaper than doing it wrong for a
 * fortnight.
 * ------------------------------------------------------------------------- */

/* Each entry:
 *   from      a posture id, or an inline {pose, root, floor}
 *   frames    [{t 0..1, label, hold (seconds), pose {...partial}}]
 *   duration  seconds for one full cycle
 *   watch     what a clinician is looking at while it runs
 *   why       what it is for, in the words you would say to the person
 */
export const EXERCISES = [
  {
    id: 'cat_cow', name: 'Cat–cow', category: 'mobility', duration: 7, loop: true,
    view: { az: 92, el: 8 }, areas: ['low back', 'mid back'], targets: ['lumbar spine', 'thoracic spine', 'pelvis'],
    why: 'Moves the spine through flexion and extension segment by segment, without loading it.',
    cue: 'Lead with the tailbone, not the head. Let each segment move a little rather than one hinge moving a lot.',
    watch: 'Whether the movement is spread across the whole spine or is happening at one lumbar segment.',
    setup: [
      'On hands and knees on a mat. Hands under shoulders, knees under hips.',
      'Film from the SIDE. This movement is about the shape of your spine, which you cannot feel accurately.',
    ],
    steps: [
      'Start with a flat back, head in line with the spine.',
      'Lead with the TAILBONE: tip it up towards the ceiling, and let the arch travel up your back one segment at a time until your head lifts last.',
      'Pause at the end for two seconds.',
      'Reverse it: tuck the tailbone under first, then round each segment in turn, head tucking last.',
      'Pause for two seconds. Six to eight slow cycles.',
    ],
    look: [
      { sign: 'Whether the movement is spread out or hinging at one point',
        how: 'From the side, watch the curve. A healthy one is a smooth arc; a stiff spine moves at one segment and stays flat either side of it.',
        means: 'One hinging segment doing all the work is the thing to notice, and usually sits just above or below where it hurts.' },
      { sign: 'Whether you lead with your head',
        how: 'Watch the order in the video: tailbone should move first, head last.',
        means: 'Leading with the head means the neck and shoulders are driving it and the low back barely moves.' },
      { sign: 'The elbows locking and the shoulders rising to the ears',
        how: 'Watch your shoulder blades.',
        means: 'Take the effort out of the arms; they are just a stand.' },
    ],
    dose: '6-8 slow cycles, once or twice a day. Two seconds at each end. This is a mobility drill, not a workout.',
    stop: 'It should feel like easy movement. Sharp pain at one point in the range means stop short of it and mention it.',
    props: [{ kind: 'mat' }],
    from: 'quadruped', contacts: ['hand_l', 'hand_r', 'shin_l', 'shin_r'],
    // Rounding the mid-back raises the shoulder girdle with it, and the arm is
    // already straight — so the hands can only stay on the floor if the pin is
    // allowed to give a little of the flexion back at the top of the thorax.
    // That is also what a person does: the round comes from the mid-back, not
    // from lifting the shoulders.

      frames: [
      { t: 0, label: 'cow · extension', hold: 0.8,
        pose: { pelvis: { flex: 20 }, thigh_l: { flex: 76 }, thigh_r: { flex: 76 },
          lumbar_lower: { flex: -13 }, lumbar_upper: { flex: -13 }, thorax_lower: { flex: -11 }, thorax_upper: { flex: -10 },
          neck: { flex: -55 }, head: { flex: -20 } } },
      { t: 0.5, label: 'cat · flexion', hold: 0.8,
        // The amplitude here is the honest one for this figure, not the
        // maximum the joints allow. Past about this much flexion the
        // shoulder girdle drops far enough that the arms can no longer
        // reach the floor, and a cat-cow demonstrated with the hands in
        // mid-air teaches the wrong thing. Range across the rep is still
        // about 25 degrees per lumbar segment, which is a real cat-cow.
        pose: { pelvis: { flex: -5 }, thigh_l: { flex: 51 }, thigh_r: { flex: 51 },
          lumbar_lower: { flex: 12 }, lumbar_upper: { flex: 11 }, thorax_lower: { flex: 6 }, thorax_upper: { flex: 5 },
          neck: { flex: -15 }, head: { flex: 4 },
          upperarm_l: { flex: 66, abd: 6 }, upperarm_r: { flex: 66, abd: 6 } } },
      { t: 1, label: 'cow · extension',
        pose: { pelvis: { flex: 20 }, thigh_l: { flex: 76 }, thigh_r: { flex: 76 },
          lumbar_lower: { flex: -13 }, lumbar_upper: { flex: -13 }, thorax_lower: { flex: -11 }, thorax_upper: { flex: -10 },
          neck: { flex: -55 }, head: { flex: -20 } } },
      ],
  },
  {
    id: 'bird_dog', name: 'Bird dog', category: 'control', duration: 8, loop: true, mirror: true,
    view: { az: 44, el: 14 }, areas: ['low back', 'core', 'hip', 'shoulder'], targets: ['lumbar spine', 'hip', 'shoulder'],
    why: 'Loads the trunk diagonally while asking the spine not to move. Trains what holds a back still, rather than what bends it.',
    cue: 'Reach long rather than high. If the low back arches or the pelvis rolls, you have gone past your range.',
    watch: 'Pelvic rotation and lumbar extension as the leg goes back — the spine should look identical at both ends.',
    setup: [
      'Hands and knees on a mat. Hands under shoulders, knees under hips.',
      'Balance something light on your low back — a TV remote, a half-full water bottle. If it falls, your spine moved.',
      'Film from the SIDE or from above.',
    ],
    steps: [
      'Set a flat back and brace your stomach gently, as if about to be poked.',
      'Slide one leg back along the floor first, then lift it only to the height of your hip. No higher.',
      'At the same time reach the OPPOSITE arm forward, thumb up, to shoulder height.',
      'Hold for five seconds, reaching long in both directions rather than high.',
      'Return under control and swap sides. The spine should look identical throughout.',
    ],
    look: [
      { sign: 'The object on your back falling off',
        how: 'That is the test. It falls when the pelvis rotates or the back arches.',
        means: 'The point of the exercise is that the spine does not move. If it falls, go lower, not further.' },
      { sign: 'The pelvis rotating open as the leg goes back',
        how: 'From above, both hip bones should stay pointing at the floor.',
        means: 'The usual fault. Lower the leg until it stops.' },
      { sign: 'The low back sagging as the limbs extend',
        how: 'From the side, the low back should keep the same shape as at the start.',
        means: 'Means you have gone past what the trunk can hold.' },
      { sign: 'The shoulder rising to the ear on the reaching arm',
        how: 'Watch the gap between shoulder and ear.',
        means: 'Reach long, not high.' },
    ],
    dose: '2 sets of 6 each side, holding five seconds, most days.',
    stop: 'Low back pain means the range went too far. Reduce the height and keep the object on your back.',
    props: [{ kind: 'mat' }],
    from: 'quadruped',
    frames: [
      { t: 0, label: 'set', hold: 0.5, pose: {} },
      { t: 0.42, label: 'reach', hold: 1.4,
        pose: { thigh_r: { flex: -8, abd: 2 }, shin_r: { flex: 8 }, foot_r: { flex: -18 },
          upperarm_l: { flex: 150, abd: 4 }, forearm_l: { flex: 4 }, hand_l: { flex: -8 }, clavicle_l: { abd: 16, flex: -4 },
          lumbar_lower: { flex: 3 }, neck: { flex: -56 } } },
      { t: 1, label: 'return', pose: {} },
    ],
  },
  {
    id: 'glute_bridge', name: 'Glute bridge', category: 'strength', duration: 6, loop: true,
    props: [{ kind: 'mat' }], view: { az: 92, el: 8 }, areas: ['hip', 'low back'], targets: ['hip', 'lumbar spine'],
    why: 'Hip extension with the spine held still — the pattern that stops the low back doing the hips’ job.',
    cue: 'Push the floor away through the heels. Finish with the hips, not by arching the back.',
    watch: 'Whether the lumbar spine extends before the hips do, and whether the ribs flare at the top.',
    // the shoulders and both feet stay on the floor and the pelvis is what
    // rises, so the placement is solved from those three contacts rather than
    // by dropping the whole figure
    setup: [
      'Lie on your back on the floor, knees bent, feet flat and hip width apart.',
      'Heels close enough that you can just brush them with your fingertips.',
      'Arms by your sides, palms down. Film from the SIDE.',
    ],
    steps: [
      'Before lifting, gently flatten your low back towards the floor and tuck the tailbone slightly.',
      'Push through your HEELS and lift the hips until your body is a straight line from knee to shoulder.',
      'Squeeze the buttocks hard at the top and hold for three seconds.',
      'Lower over three seconds, one vertebra at a time.',
      'Do not go higher than a straight line — more is not better here.',
    ],
    look: [
      { sign: 'Where you feel the work',
        how: 'At the top, notice what is burning.',
        means: 'Buttocks is right. Hamstrings cramping usually means the heels are too far away — walk them in. Low back means you went too high or lost the tuck.' },
      { sign: 'The ribs flaring at the top',
        how: 'From the side, the line from knee to shoulder should be straight, not arched.',
        means: 'Arching means the low back is doing the work the hips should.' },
      { sign: 'The knees falling apart or pressing together',
        how: 'Look down. They should stay hip width.',
        means: 'Either drift is the hip losing control.' },
    ],
    dose: '3 sets of 12, holding three seconds at the top, daily. When easy, do them one leg at a time.',
    stop: 'Low back pain means lower the height and re-do the tuck. Hamstring cramp means move the heels closer.',
    from: 'supine', floor: 'contacts', anchor: 'thorax_upper', pin: ['foot_l', 'foot_r'], contacts: ['foot_l', 'foot_r'],
    frames: [
      { t: 0, label: 'down', hold: 0.6,
        pose: { thigh_l: { flex: 62 }, thigh_r: { flex: 62 }, shin_l: { flex: 92 }, shin_r: { flex: 92 }, foot_l: { flex: 6 }, foot_r: { flex: 6 },
          upperarm_l: { abd: 26 }, upperarm_r: { abd: 26 } } },
      { t: 0.45, label: 'top · hips extended', hold: 1.2,
        pose: { thigh_l: { flex: 14 }, thigh_r: { flex: 14 }, shin_l: { flex: 92 }, shin_r: { flex: 92 }, foot_l: { flex: 8 }, foot_r: { flex: 8 },
          pelvis: { flex: -9 }, lumbar_lower: { flex: 4 }, lumbar_upper: { flex: 2 },
          upperarm_l: { abd: 26 }, upperarm_r: { abd: 26 } } },
      { t: 1, label: 'down',
        pose: { thigh_l: { flex: 62 }, thigh_r: { flex: 62 }, shin_l: { flex: 92 }, shin_r: { flex: 92 }, foot_l: { flex: 6 }, foot_r: { flex: 6 },
          upperarm_l: { abd: 26 }, upperarm_r: { abd: 26 } } },
    ],
  },
  {
    id: 'dead_bug', name: 'Dead bug', category: 'control', duration: 8, loop: true, mirror: true,
    props: [{ kind: 'mat' }], view: { az: 46, el: 22 }, areas: ['core', 'low back', 'hip'], targets: ['lumbar spine', 'hip'],
    why: 'Asks the front of the trunk to hold the ribs down while the limbs move. The anterior half of the bird dog.',
    cue: 'Keep the low back flat on the floor the whole way. Slow the movement until it is.',
    watch: 'The moment the low back lifts off the floor — that is the end of the usable range.',
    setup: [
      'Lie on your back on a mat, knees and hips bent to 90 degrees, arms straight up towards the ceiling.',
      'Slide one hand under your low back, palm down. You will use it to feel the fault.',
    ],
    steps: [
      'Flatten your low back gently onto your hand and keep that pressure the whole time.',
      'Slowly lower ONE leg towards the floor while reaching the OPPOSITE arm back overhead.',
      'Go only as far as you can while keeping the pressure on your hand.',
      'Return to the start under control.',
      'Alternate sides. Breathe out as you extend — do not hold your breath.',
    ],
    look: [
      { sign: 'The pressure coming off the hand under your back',
        how: 'That is the whole test. The instant it lightens, your back has arched.',
        means: 'That point is the end of your current range. Go there and no further; it will extend over weeks.' },
      { sign: 'Holding your breath',
        how: 'Talk or count out loud through a rep.',
        means: 'Breath-holding is how people fake trunk control. If you cannot talk, it is too hard.' },
      { sign: 'The ribs flaring up at the top of the reach',
        how: 'Put your free hand on your lower ribs at the front. They should stay down.',
        means: 'Ribs lifting is the same fault as the back arching, seen from the front.' },
    ],
    dose: '2 sets of 8 each side, slowly, most days. Reduce the range until you can keep the pressure, rather than doing more reps badly.',
    stop: 'Low back pain means you went past the range. Shorten it.',
    from: 'supine',
    frames: [
      { t: 0, label: 'set', hold: 0.5,
        pose: { thigh_l: { flex: 90 }, thigh_r: { flex: 90 }, shin_l: { flex: 90 }, shin_r: { flex: 90 },
          upperarm_l: { flex: 92 }, upperarm_r: { flex: 92 }, pelvis: { flex: -6 }, lumbar_lower: { flex: 6 } } },
      { t: 0.45, label: 'extend', hold: 1.2,
        pose: { thigh_l: { flex: 90 }, thigh_r: { flex: 14 }, shin_l: { flex: 90 }, shin_r: { flex: 16 }, foot_r: { flex: 10 },
          upperarm_l: { flex: 164 }, upperarm_r: { flex: 92 }, pelvis: { flex: -6 }, lumbar_lower: { flex: 6 } } },
      { t: 1, label: 'return',
        pose: { thigh_l: { flex: 90 }, thigh_r: { flex: 90 }, shin_l: { flex: 90 }, shin_r: { flex: 90 },
          upperarm_l: { flex: 92 }, upperarm_r: { flex: 92 }, pelvis: { flex: -6 }, lumbar_lower: { flex: 6 } } },
    ],
  },
  {
    id: 'open_book', name: 'Open book · thoracic rotation', category: 'mobility', duration: 8, loop: true, mirror: true,
    props: [{ kind: 'mat' }], view: { az: 6, el: 20 }, areas: ['mid back', 'shoulder'], targets: ['thoracic spine', 'shoulder'],
    why: 'Rotation through the mid-back with the pelvis stacked and still, so the lumbar spine cannot supply the range.',
    cue: 'Let the ribs turn and follow the hand with your eyes. Knees stay stacked.',
    watch: 'Whether the pelvis rolls back with the shoulders — if it does, the rotation is coming from the lumbar spine.',
    setup: [
      'Lie on your side on a mat, knees bent up to about 90 degrees and stacked on top of each other.',
      'Put a cushion or block between the knees to hold them together — that is what stops the low back joining in.',
      'Arms straight out in front at shoulder height, palms together.',
    ],
    steps: [
      'Press the knees together on the cushion and keep them there throughout.',
      'Slide the top hand along the bottom arm, then open it up and over towards the floor behind you.',
      'Follow the hand with your eyes and let your ribs turn with it.',
      'Go only as far as the knees stay stacked and together.',
      'Hold three breaths at the end, then close slowly. Six to eight each side.',
    ],
    look: [
      { sign: 'The knees coming apart or the top knee lifting',
        how: 'The cushion is the test. If the pressure on it changes, the pelvis has rotated.',
        means: 'That is the low back joining in, which is exactly what the drill excludes.' },
      { sign: 'How far the top shoulder gets towards the floor',
        how: 'Note it, and compare sides.',
        means: 'It rarely reaches the floor and does not need to. The comparison is the finding.' },
      { sign: 'The arm leading instead of the ribs',
        how: 'Watch your chest, not your hand.',
        means: 'Reaching with the arm alone gets your hand further round and rotates nothing.' },
    ],
    dose: '6-8 each side, holding three breaths at the end, daily.',
    stop: 'Shoulder pinching means keep the arm lower. Low back pain means the knees came apart.',
    from: 'sidelying_l',
    frames: [
      { t: 0, label: 'closed', hold: 0.6,
        pose: { upperarm_r: { flex: 88 }, forearm_r: { flex: 6 }, upperarm_l: { flex: 88 }, forearm_l: { flex: 6 } } },
      { t: 0.45, label: 'open · end range', hold: 1.5,
        pose: { thorax_lower: { rot: -17 }, thorax_upper: { rot: -18 }, lumbar_upper: { rot: -4 }, neck: { rot: -30 },
          upperarm_r: { flex: 74, abd: 26, rot: 40 }, forearm_r: { flex: 10 },
          upperarm_l: { flex: 88 }, forearm_l: { flex: 6 }, clavicle_r: { flex: -16 } } },
      { t: 1, label: 'closed',
        pose: { upperarm_r: { flex: 88 }, forearm_r: { flex: 6 }, upperarm_l: { flex: 88 }, forearm_l: { flex: 6 } } },
    ],
  },
  {
    id: 'prone_press', name: 'Prone press-up', category: 'mobility', duration: 7, loop: true,
    props: [{ kind: 'mat' }], view: { az: 92, el: 8 }, areas: ['low back'], targets: ['lumbar spine'],
    why: 'Repeated lumbar extension. The first thing to try when sitting makes a back worse and standing makes it better.',
    cue: 'Push the top half up and let the hips stay heavy on the floor. Stop where it is comfortable, not where the arms end.',
    watch: 'Whether symptoms move towards the spine as you repeat it — that direction matters more than the range.',
    setup: [
      'Lie face down on a mat, hands flat under your shoulders as if about to push up.',
      'Take a minute lying flat first and let your back settle.',
      'Note exactly where your symptoms are BEFORE you start — you are going to compare.',
    ],
    steps: [
      'Push your upper body up with your arms, keeping your hips heavy on the floor.',
      'Let your low back sag; do not hold it tight. The arms do the work, the back stays relaxed.',
      'Go up only as far as is comfortable, which at first may be very little.',
      'Hold for two seconds at the top, then lower all the way down.',
      'Ten repetitions, then lie flat and compare your symptoms to before.',
    ],
    look: [
      { sign: 'Whether symptoms move towards your spine or further down the leg',
        how: 'Note the FURTHEST point the symptoms reach, before and after the ten repetitions.',
        means: 'Moving towards the spine is the direction you want, even if the intensity briefly rises. Moving further down the leg means stop and try the other direction instead.' },
      { sign: 'Whether your range improves over the ten',
        how: 'Note how high you got on rep one against rep ten.',
        means: 'Improving range within a set is a good sign.' },
      { sign: 'The hips lifting off the floor',
        how: 'Someone watching, or a hand on your buttock.',
        means: 'Lifting turns it into a different exercise. The hips stay down.' },
    ],
    dose: '10 repetitions, every two to three hours through the day, for the first few days. This is a directional test as much as an exercise.',
    stop: 'Stop if symptoms travel FURTHER down the leg — that is the wrong direction for you. Mention that if it happens.',
    from: 'prone', floor: 'drop', props: [{ kind: 'mat' }],
    frames: [
      // The shoulder rotation is load-bearing, not decoration. Lying face
      // down, the elbow's flexion axis points AT THE FLOOR, so bending the
      // elbow drives the hand straight through it and the placement solver
      // answers the only way it can: by lifting the entire body 30 cm into
      // the air. Rotated 90 degrees, the elbow bends in the plane of the
      // floor and the forearm lies on it, which is what the position is.
      { t: 0, label: 'flat, forearms on the floor', hold: 0.7,
        pose: { upperarm_l: { flex: 10, abd: 35, rot: -90 }, upperarm_r: { flex: 10, abd: 35, rot: -90 },
          forearm_l: { flex: 110 }, forearm_r: { flex: 110 },
          neck: { flex: -8 }, foot_l: { flex: -20 }, foot_r: { flex: -20 } } },
      { t: 0.45, label: 'pressed up — hips stay down', hold: 1.6,
        pose: { upperarm_l: { flex: -10, abd: 30, rot: -90 }, upperarm_r: { flex: -10, abd: 30, rot: -90 },
          forearm_l: { flex: 75 }, forearm_r: { flex: 75 },
          lumbar_lower: { flex: -13 }, lumbar_upper: { flex: -12 }, thorax_lower: { flex: -9 }, thorax_upper: { flex: -6 },
          neck: { flex: -22 }, head: { flex: -10 }, foot_l: { flex: -20 }, foot_r: { flex: -20 } } },
      { t: 1, label: 'flat, forearms on the floor',
        pose: { upperarm_l: { flex: 10, abd: 35, rot: -90 }, upperarm_r: { flex: 10, abd: 35, rot: -90 },
          forearm_l: { flex: 110 }, forearm_r: { flex: 110 },
          neck: { flex: -8 }, foot_l: { flex: -20 }, foot_r: { flex: -20 } } },
    ],
  },
  {
    id: 'hip_hinge_drill', name: 'Hip hinge', category: 'control', duration: 7, loop: true,
    view: { az: 92, el: 6 }, areas: ['hip', 'low back'], targets: ['hip', 'lumbar spine'],
    why: 'Teaches bending at the hips instead of through the back — the single most useful pattern for a sore low back.',
    cue: 'Push the hips back towards the wall behind you. Shins stay nearly vertical, spine stays exactly as it is.',
    watch: 'The point in the range where the lumbar spine starts to flex. That is where the hinge currently ends.',
    setup: [
      'Stand about 15 cm in front of a wall, facing away from it, feet hip width.',
      'Hold a broomstick or a long ruler vertically along your back: it must touch the back of your head, your mid-back and your tailbone at the same time.',
      'Film from the SIDE.',
    ],
    steps: [
      'Keep all three contact points on the stick.',
      'Push your hips BACKWARDS until your bottom touches the wall. Do not think about bending forward — think about pushing back.',
      'Let your chest come down only as much as the hips going back requires.',
      'Keep the shins nearly vertical; the knees bend only slightly.',
      'Return by driving the hips forward. Then move a few centimetres further from the wall and repeat.',
    ],
    look: [
      { sign: 'Any of the three stick contacts lifting',
        how: 'Feel for it, or have someone watch. The mid-back one usually goes first.',
        means: 'The moment one lifts, the spine has started moving. That point is the current end of your hinge.' },
      { sign: 'The knees bending a lot',
        how: 'From the side, the shins should stay close to vertical.',
        means: 'Bending the knees turns it into a squat, which is a different movement with a different purpose.' },
      { sign: 'Where you feel it',
        how: 'The backs of the thighs should load up.',
        means: 'Feeling it in the low back means the hips are not hinging.' },
    ],
    dose: '3 sets of 8, daily for the first fortnight. This is a pattern to learn rather than a muscle to tire.',
    stop: 'Should feel like a hamstring stretch and hip work. Low back pain means the stick contacts were lost.',
    holds: [{ kind: 'stick', from: 'hand_l', to: 'hand_r' }],
    props: [{ kind: 'wall', touch: 'pelvis', dir: '-x', gap: 12 }],
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'tall', hold: 0.5, pose: {} },
      { t: 0.45, label: 'hinged', hold: 1.2,
        pose: { thigh_l: { flex: 58 }, thigh_r: { flex: 58 }, shin_l: { flex: 20 }, shin_r: { flex: 20 },
          upperarm_l: { flex: -66 }, upperarm_r: { flex: -66 }, neck: { flex: -46 }, head: { flex: -10 } },
        root: { rot: { flex: 70 } } },
      { t: 1, label: 'tall', pose: {} },
    ],
  },
  {
    id: 'squat_screen', name: 'Deep squat screen', category: 'test', duration: 9, loop: true,
    view: { az: 30, el: 6 }, areas: ['ankle', 'hip', 'knee', 'low back'], targets: ['ankle', 'hip', 'lumbar spine'],
    why: 'One movement that tests ankle, hip and spine together. Where it fails tells you which one to look at.',
    cue: 'Feet about shoulder width, go down as far as you can keep your heels down and your chest up.',
    watch: 'Heels lifting (ankle), knees falling in (hip), or the pelvis tucking under at the bottom (hip or spine).',
    setup: [
      'Bare feet, about shoulder width apart, toes pointing forward or very slightly out.',
      'Film from the FRONT at hip height for the knee and foot findings, then do it again filmed from the SIDE for the depth and back findings.',
      'No weight. This is a test, not training.',
    ],
    steps: [
      'Stand tall with arms reaching forward at shoulder height.',
      'Squat down as far as you can while keeping your heels on the floor and your chest up.',
      'Pause at the bottom for two seconds.',
      'Stand back up.',
      'Do it three times so you can see what is consistent rather than what happened once.',
    ],
    look: [
      { sign: 'Heels lifting off the floor at the bottom',
        how: 'Film from the side, or have someone try to slide paper under your heels at the deepest point.',
        means: 'Ankle dorsiflexion is the limit. Test it properly with knee-to-wall and compare sides.' },
      { sign: 'Knees falling inwards on the way down or the way up',
        how: 'Film from the front. Watch whether each kneecap stays over the second toe.',
        means: 'Hip control. Usually worse coming up than going down.' },
      { sign: 'The lower back rounding under at the bottom',
        how: 'Film from the side. Watch the curve of your low back at the deepest point — it should keep its slight inward curve, not tuck under.',
        means: 'Often called a butt wink. Usually hip range, sometimes ankle, occasionally the spine itself.' },
      { sign: 'One side dropping or turning more than the other',
        how: 'From the front, watch whether your hips stay square or one rotates back.',
        means: 'A side-to-side difference matters more than any single number.' },
    ],
    dose: 'A screen, not an exercise. Repeat it every few weeks to see whether anything has changed.',
    stop: 'If it hurts, note exactly where in the range it started and stop there. The depth at which pain begins is itself the finding.',
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'stand', hold: 0.5, pose: {} },
      { t: 0.5, label: 'bottom', hold: 1.6,
        pose: { pelvis: { flex: -6 }, thigh_l: { flex: 118, abd: 17, rot: 13 }, thigh_r: { flex: 118, abd: 17, rot: 13 },
          shin_l: { flex: 132 }, shin_r: { flex: 132 }, foot_l: { flex: 22, rot: 11 }, foot_r: { flex: 22, rot: 11 },
          lumbar_lower: { flex: 9 }, lumbar_upper: { flex: 6 }, thorax_lower: { flex: 8 }, thorax_upper: { flex: 5 },
          upperarm_l: { flex: 96, abd: 8 }, upperarm_r: { flex: 96, abd: 8 }, forearm_l: { flex: 22 }, forearm_r: { flex: 22 }, neck: { flex: -16 } },
        root: { rot: { flex: 18 } } },
      { t: 1, label: 'stand', pose: {} },
    ],
  },
  {
    id: 'sl_stance_test', name: 'Single-leg stance', category: 'test', duration: 7, loop: true, mirror: true,
    view: { az: 2, el: 6 }, areas: ['hip', 'ankle'], targets: ['hip', 'pelvis'],
    why: 'Thirty seconds on one leg tests the hip abductors and the balance system at the same time.',
    cue: 'Stand on one leg, hands off anything, and hold the pelvis level.',
    watch: 'The pelvis dropping on the lifted side, or the trunk leaning over the stance leg to make up for it.',
    setup: [
      'Bare feet, near a wall you could touch if you had to, but do not hold it.',
      'Film from the FRONT at hip height, or stand facing a mirror.',
      'Have a clock or timer where you can see it.',
    ],
    steps: [
      'Stand on one leg. Lift the other foot just clear of the floor, knee bent to about 45 degrees.',
      'Hold as still as you can for 30 seconds. Eyes open, looking straight ahead at a fixed point.',
      'Note what happens and how long you last.',
      'Repeat on the other leg and compare.',
      'If 30 seconds is easy on both, do it again with your eyes closed — that takes vision out of it and is much harder.',
    ],
    look: [
      { sign: 'The hip on the LIFTED side dropping below the standing side',
        how: 'Thumbs on the tops of your hip bones, or watch your waistband in the mirror.',
        means: 'The standing leg\'s gluteus medius is not holding the pelvis level. This is the classic finding and it is trainable.' },
      { sign: 'The trunk leaning over the standing leg',
        how: 'Watch your head: it should stay directly above the standing foot.',
        means: 'A compensation for the same weakness — moving your weight so the hip has less to hold.' },
      { sign: 'A lot of foot and ankle activity',
        how: 'Watch the toes gripping and the ankle wobbling.',
        means: 'Normal in small amounts. Constant grabbing suggests the balance system is working hard.' },
      { sign: 'A clear difference between the two sides',
        how: 'Time both, count the wobbles on both.',
        means: 'The comparison is the finding. Absolute times vary hugely between people.' },
    ],
    dose: 'A test. Repeat every couple of weeks. If you want it as an exercise, 3 holds of 30 seconds each side, daily.',
    stop: 'Put the other foot down before you fall. There is no benefit in the near-fall.',
    props: [{ kind: 'rail', touch: 'hand_l', dir: '+y', gap: 5 }],
    from: 'standing', floor: 'balance', plant: ['foot_l'],
    frames: [
      { t: 0, label: 'two feet', hold: 0.4, pose: {} },
      { t: 0.35, label: 'one leg', hold: 2.2,
        pose: { thigh_r: { flex: 48, abd: -4 }, shin_r: { flex: 88 }, foot_r: { flex: -14 },
          pelvis: { abd: -6, rot: -4 }, lumbar_lower: { abd: 5 }, lumbar_upper: { abd: 4 }, thigh_l: { abd: -3 } } },
      { t: 1, label: 'two feet', pose: {} },
    ],
  },
  {
    id: 'wall_slide', name: 'Overhead reach · wall slide', category: 'control', duration: 8, loop: true,
    props: [{ kind: 'wall', touch: 'thorax_upper', dir: '-x', gap: 1 }], view: { az: 66, el: 8 }, areas: ['shoulder', 'mid back'], targets: ['shoulder', 'thoracic spine'],
    why: 'Shoulder flexion that has to come from the shoulders and mid-back, not from arching the low back.',
    cue: 'Ribs stay down. Slide the arms up only as far as they go without the back arching.',
    watch: 'The ribs flaring and the lumbar spine extending as the arms pass shoulder height.',
    setup: [
      'Stand with your back against a wall, feet about 20 cm out from it.',
      'Press your low back towards the wall so there is only a small gap.',
      'Put the backs of your hands and forearms against the wall, elbows bent to 90, upper arms at shoulder height.',
    ],
    steps: [
      'Keep your ribs down and the low back close to the wall. This is the hard part.',
      'Slide your arms up the wall, keeping wrists, elbows and the backs of the hands in contact.',
      'Go up only as far as everything stays in contact AND the back stays down.',
      'Hold two seconds.',
      'Slide back down slowly. Eight to ten repetitions.',
    ],
    look: [
      { sign: 'The low back arching off the wall as the arms rise',
        how: 'Slide a hand behind your low back before you start and keep checking the gap.',
        means: 'This is the fault. Where the back leaves the wall is the true end of your overhead range. Going past it means borrowing from the spine.' },
      { sign: 'The hands or forearms coming off the wall',
        how: 'Have someone slide a finger between your wrist and the wall at the top of the slide, or do it beside a mirror and watch the gap open.',
        means: 'Contact lost means the shoulder ran out of range and you went further anyway.' },
      { sign: 'The shoulders shrugging up to the ears',
        how: 'Watch in a mirror, or feel the gap between shoulder and ear.',
        means: 'Shrugging is the upper trapezius doing the job of the lower.' },
    ],
    dose: '2 sets of 10, slowly, most days.',
    stop: 'Shoulder pinching at the top means stop below that height. There is no benefit in forcing it.',
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'start', hold: 0.5,
        pose: { upperarm_l: { flex: 20, abd: 62, rot: 62 }, upperarm_r: { flex: 20, abd: 62, rot: 62 },
          forearm_l: { flex: 92 }, forearm_r: { flex: 92 }, clavicle_l: { flex: -10 }, clavicle_r: { flex: -10 } } },
      { t: 0.45, label: 'overhead', hold: 1.4,
        pose: { upperarm_l: { flex: 150, abd: 26, rot: 40 }, upperarm_r: { flex: 150, abd: 26, rot: 40 },
          forearm_l: { flex: 16 }, forearm_r: { flex: 16 }, clavicle_l: { abd: 26, flex: -8 }, clavicle_r: { abd: 26, flex: -8 },
          thorax_upper: { flex: -7 }, thorax_lower: { flex: -5 } } },
      { t: 1, label: 'start',
        pose: { upperarm_l: { flex: 20, abd: 62, rot: 62 }, upperarm_r: { flex: 20, abd: 62, rot: 62 },
          forearm_l: { flex: 92 }, forearm_r: { flex: 92 }, clavicle_l: { flex: -10 }, clavicle_r: { flex: -10 } } },
    ],
  },
  {
    id: 'chin_tuck', name: 'Chin tuck', category: 'control', duration: 6, loop: true,
    props: [{ kind: 'seat', under: 'pelvis' }], view: { az: 92, el: 4 }, areas: ['neck'], targets: ['cervical spine'],
    why: 'Trains the deep neck flexors to hold the head back over the shoulders instead of in front of them.',
    cue: 'Slide the head straight back, as if making a double chin. Do not tip it down.',
    watch: 'The head tipping down instead of translating back — the two look similar and do different things.',
    setup: [
      'Sit or stand tall, or lie on your back with the head on the floor.',
      'Two fingers resting lightly on your chin.',
    ],
    steps: [
      'Use the fingers to guide the chin straight BACKWARDS, as if making a double chin.',
      'The head TRANSLATES back; it does not tip down. Your eyes stay level with the horizon.',
      'You should feel a stretch at the base of the skull and work at the front of the neck.',
      'Hold five seconds.',
      'Release slowly. Ten repetitions.',
    ],
    look: [
      { sign: 'Tipping the head down instead of sliding it back',
        how: 'Watch your eye level in a mirror — it must not drop. Or keep a finger on your chin and check it moves back, not down.',
        means: 'The two look similar and do completely different things. Tipping down stretches the back of the neck; sliding back trains the muscles that hold your head up.' },
      { sign: 'The shoulders rising or the jaw clenching',
        how: 'Rest your fingertips on the tops of your shoulders as you tuck, and let your jaw hang slightly open the whole time so clenching becomes obvious.',
        means: 'Both are signs of trying too hard. This should be a gentle movement.' },
      { sign: 'Where you feel it',
        how: 'Stretch at the base of the skull, mild work at the front of the throat.',
        means: 'Sharp pain, dizziness or visual change means stop immediately and mention it in person.' },
    ],
    dose: '10 repetitions holding five seconds, several times a day — it is easy to do at a desk.',
    stop: 'Stop at once for dizziness, nausea, visual disturbance, or any symptoms in both arms.',
    from: 'sitting', floor: 'drop',
    frames: [
      { t: 0, label: 'forward head', hold: 0.6, pose: { neck: { flex: 20 }, head: { flex: -22 }, thorax_upper: { flex: 8 } } },
      { t: 0.45, label: 'tucked', hold: 1.2, pose: { neck: { flex: -6 }, head: { flex: 16 }, thorax_upper: { flex: -3 } } },
      { t: 1, label: 'forward head', pose: { neck: { flex: 20 }, head: { flex: -22 }, thorax_upper: { flex: 8 } } },
    ],
  },
  {
    id: 'hamstring_aslr', name: 'Active straight-leg raise', category: 'test', duration: 7, loop: true, mirror: true,
    props: [{ kind: 'mat' }], view: { az: 92, el: 10 }, areas: ['hip', 'knee'], targets: ['hip', 'hamstring'],
    why: 'Hip flexion with a straight knee, one leg at a time — hamstring length and whether the pelvis can stay still.',
    cue: 'Lift one straight leg as far as it goes while the other stays flat on the floor.',
    watch: 'The opposite leg lifting, or the pelvis rolling. Note the angle where either starts.',
    setup: [
      'Lie on your back on a mat, both legs straight.',
      'Have someone watch, or film from the side.',
    ],
    steps: [
      'Keep both legs straight and both knees locked.',
      'Lift ONE leg as high as it goes, keeping the other flat on the floor.',
      'Stop as soon as the other leg starts to lift or the pelvis rolls.',
      'Note the angle you reached.',
      'Lower slowly and do the other side.',
    ],
    look: [
      { sign: 'The opposite leg lifting off the floor',
        how: 'That is the limit. Have someone hold a hand lightly on it and tell you when it starts to lift.',
        means: 'Once it lifts, the extra range is coming from the pelvis, not the hamstring.' },
      { sign: 'The lifting knee bending',
        how: 'It must stay straight for the test to mean anything.',
        means: 'A bent knee makes the number meaningless.' },
      { sign: 'A difference between the sides',
        how: 'Measure or photograph both.',
        means: 'The comparison is the finding.' },
      { sign: 'Where the pull is felt',
        how: 'Back of the thigh, back of the knee, or the calf.',
        means: 'Back of the thigh is the hamstring. Symptoms further down, or pins and needles, are a different thing — mention them.' },
    ],
    dose: 'A test. Three lifts each side, take the best.',
    stop: 'Stop if anything shoots down the leg or into the foot.',
    from: 'supine',
    frames: [
      { t: 0, label: 'flat', hold: 0.5, pose: { upperarm_l: { abd: 24 }, upperarm_r: { abd: 24 } } },
      { t: 0.45, label: 'raised', hold: 1.4,
        pose: { thigh_l: { flex: 76 }, shin_l: { flex: 2 }, foot_l: { flex: 8 }, upperarm_l: { abd: 24 }, upperarm_r: { abd: 24 } } },
      { t: 1, label: 'flat', pose: { upperarm_l: { abd: 24 }, upperarm_r: { abd: 24 } } },
    ],
  },
  {
    id: 'side_lying_abd', name: 'Side-lying hip abduction', category: 'strength', duration: 7, loop: true, mirror: true,
    anchor: 'thigh_l', contacts: ['upperarm_l', 'shin_l'], props: [{ kind: 'mat' }], view: { az: 4, el: 16 }, areas: ['hip'], targets: ['hip'],
    why: 'Isolates gluteus medius, the muscle that keeps the pelvis level when you are on one leg.',
    cue: 'Take the top leg back slightly and lift it without rolling the pelvis backwards.',
    watch: 'The pelvis rolling back so the hip flexors can do the lifting instead.',
    setup: [
      'Lie on your side on the floor, not a bed. Bottom leg bent for stability, top leg straight.',
      'Line yourself up: shoulder, hip and ankle in one straight line. Lying curled forward is the commonest setup error.',
      'Rest your head on your bottom arm. Put your top hand on the floor in front of your chest, not pushing.',
    ],
    steps: [
      'Roll the top hip very slightly FORWARD, so the pelvis is stacked vertically rather than tipped back.',
      'Take the top leg a few centimetres BEHIND the line of your body. Keep it there.',
      'Lift the top leg towards the ceiling, no higher than about 30 degrees — roughly the height of your other knee.',
      'Hold for two seconds at the top.',
      'Lower over three seconds. Do not let it drop.',
    ],
    look: [
      { sign: 'The pelvis rolling backwards as you lift',
        how: 'Rest your top hand on the front of your top hip bone. If it rotates backwards under your hand, that is the fault.',
        means: 'Rolling back lets the hip flexors do the lifting instead of the glute. You will feel it at the front of the hip rather than the side.' },
      { sign: 'Where you feel the work',
        how: 'It should burn on the SIDE of the hip, roughly a hand\'s width below the top of the pelvis.',
        means: 'Front of hip means you rolled back. Low back means you are hiking the whole pelvis. Neither is the target.' },
      { sign: 'The waist sagging towards the floor',
        how: 'Watch the gap between your bottom ribs and the floor: keep a small space there throughout.',
        means: 'Letting the waist collapse lets the trunk cheat.' },
    ],
    dose: '2 sets of 12 each side, slowly, most days. When 12 is easy, hold the top position for five seconds instead of adding repetitions.',
    stop: 'Burning in the side of the hip by rep 8-10 is the point. Pinching at the front of the hip means the setup is wrong, not that you should push through.',
    from: 'sidelying_l',
    frames: [
      { t: 0, label: 'down', hold: 0.5,
        pose: { thigh_r: { flex: 2, abd: 0 }, shin_r: { flex: 4 }, thigh_l: { flex: 26 }, shin_l: { flex: 48 },
          upperarm_l: { flex: 128 }, forearm_l: { flex: 26 } } },
      { t: 0.45, label: 'abducted', hold: 1.2,
        pose: { thigh_r: { flex: -6, abd: 34, rot: -6 }, shin_r: { flex: 4 }, thigh_l: { flex: 26 }, shin_l: { flex: 48 },
          upperarm_l: { flex: 128 }, forearm_l: { flex: 26 } } },
      { t: 1, label: 'down',
        pose: { thigh_r: { flex: 2, abd: 0 }, shin_r: { flex: 4 }, thigh_l: { flex: 26 }, shin_l: { flex: 48 },
          upperarm_l: { flex: 128 }, forearm_l: { flex: 26 } } },
    ],
  },
  {
    id: 'calf_raise', name: 'Calf raise', category: 'strength', duration: 5, loop: true,
    view: { az: 92, el: 6 }, areas: ['ankle', 'foot'], targets: ['ankle'],
    why: 'Loads the calf and achilles through their full range. The base of almost every lower-limb problem below the knee.',
    cue: 'Up slowly, hold at the top, down even more slowly.',
    watch: 'Whether the heel actually gets high, and whether the ankle rolls out at the top.',
    setup: [
      'Bare feet, standing on flat ground to begin with. Fingertips on a wall for balance only.',
      'Progression, not shown here: once flat ground is easy, stand with the balls of your feet on the edge of a step so the heels can drop below the level of your toes.',
    ],
    steps: [
      'Stand with feet hip width, weight even.',
      'Push up onto the balls of your feet as high as you can. Two seconds up.',
      'Hold at the top for two seconds. Get properly high — most people stop short.',
      'Lower over four seconds. The slow lowering is where most of the benefit is.',
      'Once flat ground is easy, do them one leg at a time, then from a step.',
    ],
    look: [
      { sign: 'How high the heel actually gets',
        how: 'Film from behind, or look in a mirror. Compare the two sides.',
        means: 'A side that will not get as high is the side to work on.' },
      { sign: 'The ankle rolling outwards at the top',
        how: 'From behind, the heel should stay in line with the achilles, not tip out.',
        means: 'Rolling out is a way of getting height without the calf doing it.' },
      { sign: 'The knee bending to help',
        how: 'From the side, the knee should stay straight for the gastrocnemius version.',
        means: 'Bending the knee shifts the work to the soleus underneath — useful, but do it deliberately as a separate set.' },
    ],
    dose: '3 sets of 15 on both legs, or 3 sets of 8-10 on one leg, every other day. Slow lowering throughout.',
    stop: 'Calf fatigue and burning is the point. Sharp pain in the achilles, or pain the morning after that lasts more than an hour, means reduce.',
    props: [{ kind: 'rail', touch: 'hand_l', dir: '+x', gap: 5 }],
    from: 'standing', floor: 'drop',
    frames: [
      { t: 0, label: 'flat', hold: 0.4, pose: {} },
      { t: 0.4, label: 'top', hold: 1.0, pose: { foot_l: { flex: -34 }, foot_r: { flex: -34 }, toes_l: { flex: 46 }, toes_r: { flex: 46 } } },
      { t: 1, label: 'flat', pose: {} },
    ],
  },
  {
    id: 'sit_to_stand', name: 'Sit to stand', category: 'test', duration: 7, loop: true,
    props: [{ kind: 'seat', under: 'pelvis' }], view: { az: 92, el: 6 }, areas: ['hip', 'knee', 'ankle'], targets: ['hip', 'knee', 'ankle'],
    why: 'The most-repeated loaded movement in an ordinary day, and a decent proxy for lower-limb strength.',
    cue: 'Nose over toes, then stand up without using your hands.',
    watch: 'Pushing off the thighs, knees collapsing inwards, or a big trunk lean to get going.',
    setup: [
      'An ordinary dining chair, not a soft sofa. Feet flat, hip width.',
      'Arms crossed over your chest so you cannot push off your thighs.',
      'Film from the SIDE, and from the FRONT for knee tracking.',
    ],
    steps: [
      'Sit with your bottom towards the front half of the chair, feet flat and drawn slightly back under you.',
      'Lean your chest forward until your nose is roughly over your toes.',
      'Push evenly through both heels and stand all the way up.',
      'Sit back down under control — three seconds — rather than dropping.',
      'Five in a row, without pausing.',
    ],
    look: [
      { sign: 'Pushing off your thighs or the chair arms',
        how: 'Arms crossed makes this impossible, which is the point.',
        means: 'It hides how much leg strength is actually there.' },
      { sign: 'One leg doing more than the other',
        how: 'Film from the front. Watch whether your body shifts sideways as you rise.',
        means: 'A side-to-side difference in leg strength.' },
      { sign: 'Knees falling inwards on the way up',
        how: 'From the front, each kneecap over the second toe.',
        means: 'Same hip control question as everywhere else.' },
      { sign: 'Dropping rather than lowering on the way down',
        how: 'Time it. Going down should take about as long as coming up.',
        means: 'The lowering is the harder half and the half usually skipped.' },
    ],
    dose: 'As a test: how many can you do in 30 seconds. As an exercise: 3 sets of 8, slowly, daily.',
    stop: 'Front-of-knee pain that builds means use a higher chair to reduce the range.',
    from: 'sitting', floor: 'drop',
    frames: [
      { t: 0, label: 'seated', hold: 0.5,
        pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 }, foot_l: { flex: 2 }, foot_r: { flex: 2 } } },
      { t: 0.35, label: 'lean forward', hold: 0.3,
        pose: { thigh_l: { flex: 104 }, thigh_r: { flex: 104 }, shin_l: { flex: 92 }, shin_r: { flex: 92 }, foot_l: { flex: 16 }, foot_r: { flex: 16 },
          upperarm_l: { flex: 34 }, upperarm_r: { flex: 34 } },
        root: { rot: { flex: 34 } } },
      // "return to standing" has to say so joint by joint: a frame's pose is
      // merged over the starting posture, and an empty one means "unchanged"
      { t: 0.75, label: 'standing', hold: 0.8,
        pose: { thigh_l: { flex: 0 }, thigh_r: { flex: 0 }, shin_l: { flex: 0 }, shin_r: { flex: 0 }, foot_l: { flex: 0 }, foot_r: { flex: 0 } } },
      { t: 1, label: 'seated',
        pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 }, foot_l: { flex: 2 }, foot_r: { flex: 2 } } },
    ],
  },
  {
    id: 'cervical_rotation', name: 'Cervical rotation range', category: 'test', duration: 8, loop: true,
    props: [{ kind: 'seat', under: 'pelvis' }], view: { az: 0, el: 22 }, areas: ['neck'], targets: ['cervical spine'],
    why: 'Neck rotation left and right, compared. A difference between the two sides is more informative than either number.',
    cue: 'Sit tall and turn your head as far as it goes, without letting the shoulders follow.',
    watch: 'How far each way, and whether one side stops earlier or hurts.',
    setup: [
      'Sit tall on a chair, feet flat, shoulders relaxed.',
      'Face a mirror, or film from above/in front.',
    ],
    steps: [
      'Look straight ahead to start.',
      'Turn your head slowly to the left as far as it comfortably goes. Keep your shoulders square.',
      'Note how far round you got — pick a landmark in the room you can see over your shoulder.',
      'Return to centre, then turn right and note the same.',
      'Three turns each way, and take the best.',
    ],
    look: [
      { sign: 'A difference between the two sides',
        how: 'Use a landmark on each side, or measure against the mirror.',
        means: 'The side-to-side comparison is the whole point. A clear difference is more informative than either number alone.' },
      { sign: 'The shoulders turning with the head',
        how: 'Watch your shoulders in the mirror; they must stay square.',
        means: 'Turning the shoulders inflates the range.' },
      { sign: 'Where the movement stops',
        how: 'Note whether it is stiffness, a stretch, or pain, and on which side.',
        means: 'Pain stopping the movement is different from stiffness stopping it.' },
    ],
    dose: 'A test. Take it once and re-take it weekly.',
    stop: 'Stop for dizziness or visual change, and mention it.',
    from: 'sitting', floor: 'drop',
    frames: [
      { t: 0, label: 'centre', hold: 0.4, pose: {} },
      { t: 0.28, label: 'left', hold: 1.0, pose: { neck: { rot: 62 }, head: { rot: 12 } } },
      { t: 0.55, label: 'centre', hold: 0.4, pose: {} },
      { t: 0.82, label: 'right', hold: 1.0, pose: { neck: { rot: -62 }, head: { rot: -12 } } },
      { t: 1, label: 'centre', pose: {} },
    ],
  },

  /* ------------------------------------------------------------------ *
   * Everything below is the same shape as everything above: a starting  *
   * posture, and a short list of partial poses to move between. Nothing *
   * here is special-cased — an exercise written by hand in a terminal    *
   * and sent as a link lands in exactly this structure.                  *
   * ------------------------------------------------------------------ */
  {
    id: 'thread_needle', name: 'Thread the needle', category: 'mobility', duration: 8, loop: true, mirror: true,
    view: { az: 44, el: 18 }, approx: 7,  // the supporting knee lifts ~7cm at full rotation: the pose asks for more than a rigid placement can give
    areas: ['mid back', 'shoulder'], targets: ['thoracic spine', 'shoulder'],
    why: 'Rotation through the mid-back with the pelvis pinned by your own knees, so the lumbar spine cannot supply the range.',
    cue: 'Slide one arm under the other and let the shoulder and ribs turn towards the floor. Hips stay stacked over the knees.',
    watch: 'The hips swinging sideways — that is the lumbar spine taking over from the mid-back.',
    setup: [
      'Hands and knees on a mat, knees under hips.',
      'Film from behind or from above.',
    ],
    steps: [
      'Keep your hips directly over your knees. They stay there the whole time.',
      'Slide one arm underneath your body and across, palm up, until the shoulder and side of the head rest on the floor.',
      'Let your ribs turn with it; follow your hand with your eyes.',
      'Hold 20-30 seconds, breathing into the stretch.',
      'Come back slowly and repeat on the other side.',
    ],
    look: [
      { sign: 'The hips swinging away from over the knees',
        how: 'From behind, the hips should stay square over the knees.',
        means: 'Hips swinging means the rotation has come from the low back rather than the mid-back, which is the opposite of the intention.' },
      { sign: 'How far round you get, compared side to side',
        how: 'Note how far the top shoulder turns on each side.',
        means: 'A side-to-side difference in mid-back rotation is common and useful to know.' },
      { sign: 'Pinching at the top shoulder',
        how: 'Note where it is felt.',
        means: 'Should be a broad stretch across the upper back. Pinching in the shoulder joint means back off.' },
    ],
    dose: '20-30 seconds each side, two rounds, daily if you sit a lot.',
    stop: 'Neck pain means do not put full weight on the head — support it with a cushion.',
    props: [{ kind: 'mat' }],
    from: 'quadruped', contacts: ['shin_l', 'shin_r', 'hand_r'],
    frames: [
      { t: 0, label: 'set', hold: 0.5, pose: {} },
      { t: 0.45, label: 'threaded', hold: 1.5,
        pose: { thorax_lower: { rot: -14 }, thorax_upper: { rot: -17 }, neck: { rot: -26, flex: -26 },
          upperarm_l: { flex: 108, abd: -22, rot: -20 }, forearm_l: { flex: 16 }, hand_l: { flex: -10 },
          clavicle_l: { flex: 20 }, upperarm_r: { flex: 96, abd: 10 }, forearm_r: { flex: 14 } } },
      { t: 1, label: 'return', pose: {} },
    ],
  },
  {
    id: 'childs_pose', name: "Child's pose", category: 'mobility', duration: 7, loop: true,
    view: { az: 92, el: 8 }, approx: 6,  // the shins lift ~5cm at the deepest sit-back
    areas: ['low back', 'hip', 'shoulder'], targets: ['lumbar spine', 'hip'],
    why: 'Sitting back onto the heels takes the low back into supported flexion and lengthens the lats on the way.',
    cue: 'Sit the hips back towards the heels and reach the hands long. Let the head hang.',
    watch: 'How far back the hips will actually go — stiff ankles or knees stop this before the back does.',
    setup: [
      'Kneel on a mat, knees about hip width or a little wider.',
      'A cushion behind the knees, or under the backside, if the knee bend is uncomfortable.',
    ],
    steps: [
      'From hands and knees, sit your hips back towards your heels.',
      'Reach your hands forward along the floor and let your head hang.',
      'Go as far back as is comfortable. If your backside does not reach your heels, put a cushion there and rest on it.',
      'Breathe into your low back — try to feel the ribs widening at the back.',
      'Hold 30-60 seconds.',
    ],
    look: [
      { sign: 'What stops you going back',
        how: 'Notice whether it is the knees, the ankles, or a stretch in the back and hips.',
        means: 'Knees or ankles stopping you is a different problem from tight hips; pad them and the stretch changes completely.' },
      { sign: 'Where you feel the stretch',
        how: 'Low back, hips, and often the shoulders.',
        means: 'Knee pain means pad it. Ankle pain means put a rolled towel under the ankles.' },
    ],
    dose: '30-60 seconds, two or three times, whenever the back feels tight.',
    stop: 'Knee pain means pad it or skip it — there are gentler ways to get the same flexion.',
    props: [{ kind: 'mat' }],
    from: 'quadruped', contacts: ['shin_l', 'shin_r', 'hand_l', 'hand_r'],
    frames: [
      { t: 0, label: 'four-point', hold: 0.6, root: { rot: { flex: 62 } }, pose: {} },
      { t: 0.45, label: 'sat back onto the heels', hold: 1.6, root: { rot: { flex: 45 } },
        pose: { thigh_l: { flex: 96 }, thigh_r: { flex: 96 }, shin_l: { flex: 150 }, shin_r: { flex: 150 },
          foot_l: { flex: -40 }, foot_r: { flex: -40 },
          pelvis: { flex: -14 }, lumbar_lower: { flex: 22 }, lumbar_upper: { flex: 20 }, thorax_lower: { flex: 12 }, thorax_upper: { flex: 8 },
          neck: { flex: 6 }, head: { flex: 10 },
          upperarm_l: { flex: 158, abd: 10 }, upperarm_r: { flex: 158, abd: 10 },
          forearm_l: { flex: 4 }, forearm_r: { flex: 4 }, clavicle_l: { abd: 20 }, clavicle_r: { abd: 20 } } },
      { t: 1, label: 'four-point', root: { rot: { flex: 62 } }, pose: {} },
    ],
  },
  {
    id: 'hip_flexor_stretch', name: 'Half-kneeling hip flexor stretch', category: 'mobility', duration: 8, loop: true, mirror: true,
    contacts: ['foot_l', 'shin_r', 'toes_r'], view: { az: 92, el: 6 }, areas: ['hip', 'low back'], targets: ['hip', 'pelvis'],
    why: 'Lengthens the front of the back hip. The tuck matters more than the depth: without it the range comes from the low back.',
    cue: 'Tuck the tailbone under first, then ease the hips forward. You should feel it at the front of the back hip, not in the back.',
    watch: 'The low back arching instead of the hip extending.',
    setup: [
      'Kneel on one knee on something soft — a folded towel or a mat.',
      'Front foot flat, front knee over the front ankle.',
      'The BACK leg is the one being stretched. Sit up tall.',
    ],
    steps: [
      'Before moving anything, TUCK your tailbone under so your low back flattens. You should already feel the front of the back hip.',
      'Holding that tuck, ease your hips forward a few centimetres. A few, not a lunge.',
      'Squeeze the buttock on the back leg — this adds to the stretch and protects the low back.',
      'Hold 30-45 seconds, breathing.',
      'For more, raise the arm on the back-leg side overhead and lean gently away from that side.',
    ],
    look: [
      { sign: 'Your low back arching instead of the hip opening',
        how: 'Hand on the low back: it should stay flat throughout.',
        means: 'This is the whole exercise. Without the tuck, the range comes from the spine and the hip gets nothing.' },
      { sign: 'Where you feel it',
        how: 'It should be at the front of the BACK hip, and often the front of that thigh.',
        means: 'Pinching at the front of the FRONT hip means that knee has gone too far forward.' },
      { sign: 'How far forward you can go before the back arches',
        how: 'Note it. It should improve over a few weeks.',
        means: 'That is the measurement worth tracking.' },
    ],
    dose: '30-45 seconds each side, twice through, daily if you sit a lot.',
    stop: 'A strong stretch is right. Low back pain means the tuck was lost.',
    props: [{ kind: 'mat' }],
    from: 'lunge_l', floor: 'drop', plant: ['foot_l'],
      frames: [
        { t: 0, label: 'set', hold: 0.6,
          pose: { thigh_l: { flex: 92 }, shin_l: { flex: 96 }, foot_l: { flex: 4 },
            thigh_r: { flex: 0 }, shin_r: { flex: 92 }, foot_r: { flex: -40 }, toes_r: { flex: 6 },
            upperarm_l: { flex: 12 }, upperarm_r: { flex: 12 } } },
        { t: 0.45, label: 'tailbone tucked, hips forward', hold: 1.8,
          pose: { pelvis: { flex: -16 },
            thigh_l: { flex: 74 }, shin_l: { flex: 106 }, foot_l: { flex: 16 },
            thigh_r: { flex: -14 }, shin_r: { flex: 96 }, foot_r: { flex: -40 }, toes_r: { flex: 6 },
            lumbar_lower: { flex: 8 }, lumbar_upper: { flex: 5 },
            upperarm_l: { flex: 12 }, upperarm_r: { flex: 12 } } },
        { t: 1, label: 'set',
          pose: { thigh_l: { flex: 92 }, shin_l: { flex: 96 }, foot_l: { flex: 4 },
            thigh_r: { flex: 0 }, shin_r: { flex: 92 }, foot_r: { flex: -40 }, toes_r: { flex: 6 },
            upperarm_l: { flex: 12 }, upperarm_r: { flex: 12 } } },
      ],
  },
  {
    id: 'figure_four', name: 'Figure-4 stretch', category: 'mobility', duration: 8, loop: true, mirror: true,
    props: [{ kind: 'mat' }], view: { az: 34, el: 24 }, areas: ['hip'], targets: ['hip'],
    why: 'Hip external rotation and the deep rotators behind it. The stretch most people mean when they say "piriformis".',
    cue: 'Ankle across the opposite thigh, then draw that thigh towards you. Keep the low back flat.',
    watch: 'Pinching at the front of the hip rather than a stretch behind it — back the angle off if so.',
    setup: [
      'Lie on your back on a mat, both knees bent, feet flat.',
      'Cross one ankle over the opposite thigh, just above the knee, so the legs make a figure four.',
    ],
    steps: [
      'Flex the crossed foot — pull the toes up towards the shin. This protects the knee.',
      'Reach through the gap and take hold of the back of the supporting thigh.',
      'Draw that thigh towards your chest until you feel a stretch deep in the buttock of the crossed leg.',
      'Keep your head and shoulders relaxed on the floor and your low back flat.',
      'Hold 30-45 seconds, breathing.',
    ],
    look: [
      { sign: 'Where you feel it',
        how: 'Deep in the buttock, and sometimes the outside of the hip.',
        means: 'Pinching at the FRONT of the hip means back the angle off — take the knee less towards the chest and more across the body.' },
      { sign: 'The head and shoulders lifting',
        how: 'They should stay on the floor. Use a cushion under the head if needed.',
        means: 'Straining the neck to reach the thigh.' },
      { sign: 'Knee pain in the crossed leg',
        how: 'Ask yourself where exactly it is: inside the knee joint, or a pull on the outside of it. Joint pain means stop; a pull usually means the foot was not flexed hard enough.',
        means: 'Usually means the foot is not flexed. Pull the toes up hard and re-check.' },
    ],
    dose: '30-45 seconds each side, twice, daily.',
    stop: 'Stop for front-of-hip pinching, or any knee pain in the crossed leg.',
    from: 'supine',
    frames: [
      { t: 0, label: 'set', hold: 0.6,
        pose: { thigh_l: { flex: 46, abd: 26, rot: 34 }, shin_l: { flex: 88 }, thigh_r: { flex: 62 }, shin_r: { flex: 84 },
          upperarm_l: { abd: 22 }, upperarm_r: { abd: 22 } } },
      { t: 0.45, label: 'drawn in', hold: 1.6,
        pose: { thigh_l: { flex: 78, abd: 30, rot: 40 }, shin_l: { flex: 86 }, thigh_r: { flex: 96 }, shin_r: { flex: 92 },
          upperarm_l: { flex: 64, abd: 26 }, upperarm_r: { flex: 64, abd: 26 }, forearm_l: { flex: 76 }, forearm_r: { flex: 76 },
          neck: { flex: 12 } } },
      { t: 1, label: 'set',
        pose: { thigh_l: { flex: 46, abd: 26, rot: 34 }, shin_l: { flex: 88 }, thigh_r: { flex: 62 }, shin_r: { flex: 84 },
          upperarm_l: { abd: 22 }, upperarm_r: { abd: 22 } } },
    ],
  },
  {
    id: 'hamstring_stretch', name: 'Supine hamstring stretch', category: 'mobility', duration: 8, loop: true, mirror: true,
    props: [{ kind: 'mat' }], view: { az: 92, el: 10 }, areas: ['hip', 'knee'], targets: ['hamstring', 'hip'],
    why: 'Hamstring length with the pelvis held down, which is what separates a short hamstring from a stiff back.',
    cue: 'One leg straight up with the knee soft, the other flat on the floor. Hold, do not bounce.',
    watch: 'The opposite leg lifting off the floor, or the pelvis rolling — stop at that point and hold there.',
    setup: [
      'Lie on your back on a mat, both legs straight.',
      'A belt, a towel or a dressing-gown cord looped around the foot of the leg being stretched.',
    ],
    steps: [
      'Bend the leg being stretched up, loop the strap round the ball of the foot, then straighten the knee as much as you can.',
      'Keep the OTHER leg flat on the floor, pressed down. That is what makes it a hamstring stretch rather than a pelvis tilt.',
      'Draw the strap towards you until you feel a firm stretch in the back of the thigh.',
      'Keep the knee softly straight, not locked hard.',
      'Hold 30 seconds, breathing. Do not bounce.',
    ],
    look: [
      { sign: 'The opposite leg lifting off the floor',
        how: 'Look, or have someone check.',
        means: 'The moment it lifts, the pelvis is rotating and the hamstring has stopped lengthening.' },
      { sign: 'Where the stretch is felt',
        how: 'Should be the belly of the back of the thigh.',
        means: 'Behind the knee, or pins and needles into the calf or foot, is nerve rather than muscle — ease off and mention it.' },
      { sign: 'The low back lifting off the floor',
        how: 'Hand under the low back.',
        means: 'Same fault as the opposite leg lifting.' },
    ],
    dose: '30 seconds, three times each side, daily.',
    stop: 'Stop for anything shooting, tingling or numb down the leg. That is not a stretch.',
    holds: [{ kind: 'strap', from: ['hand_l', 'hand_r'], to: 'foot_l' }],
    from: 'supine',
    frames: [
      { t: 0, label: 'flat', hold: 0.5, pose: { upperarm_l: { abd: 24 }, upperarm_r: { abd: 24 } } },
      { t: 0.4, label: 'held', hold: 2.2,
        pose: { thigh_l: { flex: 82 }, shin_l: { flex: 6 }, foot_l: { flex: 10 },
          upperarm_l: { flex: 96, abd: 14 }, upperarm_r: { flex: 96, abd: 14 }, forearm_l: { flex: 52 }, forearm_r: { flex: 52 }, neck: { flex: 8 } } },
      { t: 1, label: 'flat', pose: { upperarm_l: { abd: 24 }, upperarm_r: { abd: 24 } } },
    ],
  },
  {
    id: 'calf_stretch', name: 'Calf stretch (straight and bent knee)', category: 'mobility', duration: 10, loop: true, mirror: true,
    contacts: ['foot_l', 'foot_r'], props: [{ kind: 'wall', touch: 'hand_l', dir: '+x', gap: 1 }], view: { az: 92, el: 8 }, areas: ['ankle', 'foot'], targets: ['ankle'],
    why: 'Straight knee lengthens gastrocnemius, bent knee lengthens soleus underneath it. Both matter and they are different.',
    cue: 'Back heel down, hips forward. Then bend the back knee and keep the heel down — the stretch moves lower.',
    watch: 'The heel lifting, or the arch collapsing to fake the range.',
    setup: [
      'Face a wall, hands flat on it at shoulder height.',
      'Step one foot well back — about a metre — and point both feet straight at the wall.',
      'The back leg is the one being stretched.',
    ],
    steps: [
      'Keep the back knee STRAIGHT and the back heel pressed down.',
      'Lean your hips towards the wall until you feel a stretch in the thick upper part of the calf.',
      'Hold for 30 seconds, breathing normally. Do not bounce.',
      'Now bend the back knee slightly, keeping the heel down. The stretch should move lower, towards the ankle.',
      'Hold that for 30 seconds too. Both positions, every time — they stretch different muscles.',
    ],
    look: [
      { sign: 'The back heel lifting off the floor',
        how: 'Look down, or feel for it. The heel must stay in contact throughout.',
        means: 'Once the heel lifts you are no longer stretching the calf, you are just leaning.' },
      { sign: 'The back foot rolling inwards',
        how: 'The outside edge of the foot should stay on the floor.',
        means: 'Turning the foot out is the usual way of faking range. Point it straight at the wall.' },
      { sign: 'Feeling it behind the knee rather than in the calf',
        how: 'Note exactly where the pull is.',
        means: 'That is usually the hamstring or nerve, not the calf. Take the back foot closer in and try again.' },
    ],
    dose: 'Both knee positions, 30 seconds each, both legs, once or twice a day. This is one of the few things worth doing daily and indefinitely.',
    stop: 'A strong pull is right. Sharp pain at the back of the heel, or pain that lingers afterwards, is not — that region is the achilles and it does not like being forced.',
    from: 'lunge_l', floor: 'drop', plant: ['foot_l', 'foot_r'],
    frames: [
      { t: 0, label: 'straight knee', hold: 1.4,
        pose: { thigh_l: { flex: 46 }, shin_l: { flex: 52 }, thigh_r: { flex: -14 }, shin_r: { flex: 2 }, foot_r: { flex: 18 },
          upperarm_l: { flex: 62 }, upperarm_r: { flex: 62 }, forearm_l: { flex: 24 }, forearm_r: { flex: 24 } } },
      { t: 0.5, label: 'bent knee', hold: 1.4,
        pose: { thigh_l: { flex: 46 }, shin_l: { flex: 52 }, thigh_r: { flex: -6 }, shin_r: { flex: 28 }, foot_r: { flex: 22 },
          upperarm_l: { flex: 62 }, upperarm_r: { flex: 62 }, forearm_l: { flex: 24 }, forearm_r: { flex: 24 } } },
      { t: 1, label: 'straight knee',
        pose: { thigh_l: { flex: 46 }, shin_l: { flex: 52 }, thigh_r: { flex: -14 }, shin_r: { flex: 2 }, foot_r: { flex: 18 },
          upperarm_l: { flex: 62 }, upperarm_r: { flex: 62 }, forearm_l: { flex: 24 }, forearm_r: { flex: 24 } } },
    ],
  },
  {
    id: 'quad_stretch', name: 'Standing quad stretch', category: 'mobility', duration: 8, loop: true, mirror: true,
    view: { az: 92, el: 6 }, areas: ['knee', 'hip'], targets: ['hip', 'knee'],
    why: 'Rectus femoris crosses both the hip and the knee, so it only lengthens when the hip is extended and the knee bent together.',
    cue: 'Heel towards the backside, then take the knee back behind you with the tailbone tucked.',
    watch: 'The low back arching to give the illusion of hip extension.',
    setup: [
      'Stand next to a wall, fingertips on it for balance.',
      'Bare feet or flat shoes.',
    ],
    steps: [
      'Bend one knee and take hold of that ankle behind you.',
      'Before you pull, TUCK your tailbone under — flatten the low back. This is the part everyone skips and it is most of the stretch.',
      'Keeping the tuck, draw the knee gently backwards so the thigh points down and slightly behind you.',
      'Keep the knees close together, not splayed apart.',
      'Hold 30 seconds, breathing. Then the other side.',
    ],
    look: [
      { sign: 'Your low back arching instead of your hip extending',
        how: 'Put your free hand on your low back. It should stay flat, not hollow out, as you draw the knee back.',
        means: 'Without the tuck you are stretching your spine, not your thigh.' },
      { sign: 'The knee drifting out to the side',
        how: 'Look down. The knees should stay side by side.',
        means: 'Letting it swing out avoids the stretch.' },
      { sign: 'Where you feel it',
        how: 'The front of the thigh, and often the front of the hip.',
        means: 'Pain INSIDE the knee joint rather than a stretch in the thigh means stop and reduce the knee bend.' },
    ],
    dose: '30 seconds each side, twice through, most days.',
    stop: 'Stop if you feel it in the kneecap rather than the thigh. Use a strap around the ankle instead of gripping it if the knee bend is uncomfortable.',
    props: [{ kind: 'rail', touch: 'hand_l', dir: '+y', gap: 5 }],
    from: 'standing', floor: 'balance', plant: ['foot_r'],
    frames: [
      { t: 0, label: 'stand', hold: 0.5, pose: {} },
      { t: 0.42, label: 'held', hold: 1.8,
        pose: { pelvis: { flex: -10 }, thigh_l: { flex: -18 }, shin_l: { flex: 126 }, foot_l: { flex: -22 },
          upperarm_l: { flex: -42, rot: -20 }, forearm_l: { flex: 58 }, upperarm_r: { abd: 42 },
          lumbar_lower: { flex: 6 } } },
      { t: 1, label: 'stand', pose: {} },
    ],
  },
  {
    id: 'pec_stretch', name: 'Doorway pec stretch', category: 'mobility', duration: 8, loop: true, mirror: true,
    view: { az: 2, el: 8 }, areas: ['shoulder', 'mid back'], targets: ['shoulder', 'thoracic spine'],
    why: 'Short pecs hold the shoulder forward and cost you overhead range. Three arm heights hit different parts of the muscle.',
    cue: 'Forearm on the frame at shoulder height, then step through and turn away from the arm.',
    watch: 'Pinching at the front of the shoulder — lower the arm until it is a stretch across the chest instead.',
    setup: [
      'Stand in a doorway. Forearm flat on the frame, elbow at shoulder height, upper arm horizontal.',
      'Stand close enough that you can step through.',
    ],
    steps: [
      'Step the same-side foot forward through the doorway.',
      'Keeping the forearm on the frame, turn your chest AWAY from that arm.',
      'Stand tall — do not let the ribs flare or the back arch.',
      'Hold 30 seconds, breathing.',
      'Repeat with the elbow lower (about chest height) and higher (about ear height) — the three heights reach different parts of the muscle.',
    ],
    look: [
      { sign: 'Where you feel it',
        how: 'It should be a broad stretch across the front of the chest and armpit.',
        means: 'Pinching at the FRONT of the shoulder joint means the arm is too high or too far back. Lower it.' },
      { sign: 'The ribs flaring and the low back arching',
        how: 'Hand on the stomach, or film from the side.',
        means: 'Arching gets your chest further round without stretching the chest at all.' },
      { sign: 'The shoulder rolling forward',
        how: 'The shoulder should stay back and down, not creep forward.',
        means: 'Rolling it forward slackens the muscle.' },
    ],
    dose: '30 seconds at each of the three arm heights, both sides, daily if you sit at a desk.',
    stop: 'Stop for pinching in the shoulder joint, or any pins and needles down the arm.',
    props: [{ kind: 'rail', touch: 'hand_l', dir: '+x', gap: 5 }],
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'set', hold: 0.5,
        pose: { upperarm_l: { flex: 10, abd: 80, rot: 76 }, forearm_l: { flex: 88 }, clavicle_l: { flex: 6 } } },
      { t: 0.45, label: 'turned away', hold: 1.8,
        pose: { upperarm_l: { flex: -16, abd: 86, rot: 84 }, forearm_l: { flex: 88 }, clavicle_l: { flex: -18, abd: 6 },
          thorax_upper: { rot: -14 }, thorax_lower: { rot: -10 }, pelvis: { rot: -8 }, neck: { rot: -12 } } },
      { t: 1, label: 'set',
        pose: { upperarm_l: { flex: 10, abd: 80, rot: 76 }, forearm_l: { flex: 88 }, clavicle_l: { flex: 6 } } },
    ],
  },
  {
    id: 'neck_side_bend', name: 'Upper trapezius stretch', category: 'mobility', duration: 8, loop: true, mirror: true,
    props: [{ kind: 'seat', under: 'pelvis' }], view: { az: 2, el: 6 }, areas: ['neck', 'shoulder'], targets: ['cervical spine'],
    why: 'Side-bending away with the shoulder held down is what actually lengthens the upper trapezius.',
    cue: 'Sit tall, let the opposite shoulder stay heavy, and take the ear towards the shoulder. No turning.',
    watch: 'The shoulder on the stretched side creeping up to meet the ear.',
    setup: [
      'Sit on a chair. Sit on the hand of the side you are stretching, or hold the edge of the seat — that anchors the shoulder down.',
      'Sit tall.',
    ],
    steps: [
      'Keeping the anchored shoulder down, tip your ear towards the OPPOSITE shoulder.',
      'Do not turn the head; this is a pure side bend.',
      'Use the free hand resting on the head for gentle weight only — do not pull.',
      'Hold 30 seconds, breathing.',
      'Come back slowly and do the other side.',
    ],
    look: [
      { sign: 'The anchored shoulder creeping up',
        how: 'Sitting on that hand makes it obvious.',
        means: 'Once the shoulder rises the muscle slackens and you are stretching nothing.' },
      { sign: 'Turning the head as well as tipping it',
        how: 'Keep your nose pointing straight ahead.',
        means: 'Turning changes which muscle you are on.' },
      { sign: 'Where you feel it',
        how: 'Along the top of the shoulder and the side of the neck.',
        means: 'Anything sharp, or symptoms down the arm, means stop.' },
    ],
    dose: '30 seconds each side, twice, once or twice a day.',
    stop: 'Stop for any pins and needles or pain travelling into the arm.',
    from: 'sitting', floor: 'drop',
    frames: [
      { t: 0, label: 'centre', hold: 0.5, pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 } } },
      { t: 0.45, label: 'side-bent', hold: 1.8,
        pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 },
          neck: { abd: 34 }, head: { abd: 8 }, clavicle_r: { abd: -8 },
          upperarm_l: { flex: 30, abd: 60, rot: 30 }, forearm_l: { flex: 118 } } },
      { t: 1, label: 'centre', pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 } } },
    ],
  },
  {
    id: 'thoracic_ext', name: 'Seated thoracic extension', category: 'mobility', duration: 7, loop: true,
    props: [{ kind: 'seat', under: 'pelvis' }], view: { az: 92, el: 6 }, areas: ['mid back'], targets: ['thoracic spine'],
    why: 'Extension through the mid-back specifically. Most people who cannot reach overhead are stiff here, not tight in the shoulder.',
    cue: 'Hands behind the head, ribs down, and open through the upper back only. The low back does not move.',
    watch: 'The ribs flaring and the low back arching — that is the lumbar spine doing the work again.',
    setup: [
      'Sit on a firm chair, feet flat, or sit on the floor.',
      'Hands behind your head, elbows pointing forwards to start.',
      'Film from the SIDE.',
    ],
    steps: [
      'Round your upper back forwards first, elbows coming together.',
      'Now lift the breastbone and open through the UPPER back only, elbows widening.',
      'Keep your lower ribs down — imagine the front of your ribcage staying closed.',
      'Hold two seconds at the top of the extension.',
      'Return to the rounded start. Eight to ten slow repetitions.',
    ],
    look: [
      { sign: 'The ribs flaring and the low back arching',
        how: 'From the side, watch your lower ribs and your waistband. Put a hand on your stomach if it helps.',
        means: 'This is the whole difficulty: the low back is mobile and will happily do the movement the stiff mid-back should. If the low back moves, the exercise did nothing.' },
      { sign: 'The chin poking forward as you extend',
        how: 'The head should travel with the chest, not lead it.',
        means: 'Poking loads the neck.' },
      { sign: 'Where you feel the movement',
        how: 'Between the shoulder blades is right.',
        means: 'Feeling it in the low back means the ribs flared.' },
    ],
    dose: '8-10 slow repetitions, once or twice a day, especially after long sitting.',
    stop: 'Should feel like movement, not strain. Sharp mid-back pain means reduce the range.',
    from: 'sitting', floor: 'drop',
    frames: [
      { t: 0, label: 'rounded', hold: 0.6,
        pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 },
          thorax_lower: { flex: 10 }, thorax_upper: { flex: 10 }, neck: { flex: 14 },
          upperarm_l: { flex: 108, abd: 48, rot: 60 }, upperarm_r: { flex: 108, abd: 48, rot: 60 },
          forearm_l: { flex: 130 }, forearm_r: { flex: 130 } } },
      { t: 0.45, label: 'extended', hold: 1.4,
        pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 },
          thorax_lower: { flex: -10 }, thorax_upper: { flex: -9 }, neck: { flex: -8 }, head: { flex: 8 },
          upperarm_l: { flex: 118, abd: 54, rot: 66 }, upperarm_r: { flex: 118, abd: 54, rot: 66 },
          forearm_l: { flex: 128 }, forearm_r: { flex: 128 }, clavicle_l: { flex: -14 }, clavicle_r: { flex: -14 } } },
      { t: 1, label: 'rounded',
        pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 },
          thorax_lower: { flex: 10 }, thorax_upper: { flex: 10 }, neck: { flex: 14 },
          upperarm_l: { flex: 108, abd: 48, rot: 60 }, upperarm_r: { flex: 108, abd: 48, rot: 60 },
          forearm_l: { flex: 130 }, forearm_r: { flex: 130 } } },
    ],
  },
  {
    id: 'adductor_rockback', name: 'Adductor rock-back', category: 'mobility', duration: 8, loop: true, mirror: true,
    view: { az: 34, el: 14 }, approx: 13, // the supporting hand lifts as the hips travel back; needs a closed-chain solve, not a rigid one
    areas: ['hip'], targets: ['hip'],
    why: 'Lengthens the groin of the extended leg while the other hip goes into flexion. Cheap and hard to do wrong.',
    cue: 'One leg out to the side with the foot flat, then rock the hips back towards the heel.',
    watch: 'The low back rounding at the end of the rock — that is where the hip range stopped.',
    setup: [
      'Hands and knees on a mat.',
      'Extend one leg straight out to the side, foot flat on the floor, toes pointing forward.',
    ],
    steps: [
      'Keep the extended leg straight and the foot flat.',
      'Keep your back flat — the same shape it has on hands and knees.',
      'Rock your hips back towards the heel of the kneeling leg.',
      'Go only as far as the back stays flat. Hold two seconds.',
      'Rock forward again. Eight to ten slow repetitions, then swap.',
    ],
    look: [
      { sign: 'The low back rounding as you rock back',
        how: 'Film from the side, or balance something light on your low back.',
        means: 'Where the back starts rounding is where the hip range ended. That is the point to work at, not past.' },
      { sign: 'The extended foot rolling or the toes turning out',
        how: 'Watch it. The sole should stay flat and the toes forward.',
        means: 'Turning out reduces the stretch on the groin.' },
      { sign: 'Where you feel it',
        how: 'The inside of the extended thigh.',
        means: 'Groin pinching at the front of the hip means turn the toes slightly in and try again.' },
    ],
    dose: '8-10 slow rock-backs each side, daily.',
    stop: 'A stretch on the inside of the thigh is right. Sharp groin pain is not.',
    props: [{ kind: 'mat' }],
    from: 'quadruped', contacts: ['shin_l', 'hand_l', 'hand_r'],
    frames: [
      { t: 0, label: 'set', hold: 0.6,
        pose: { thigh_r: { flex: 60, abd: 44 }, shin_r: { flex: 8 }, foot_r: { flex: 16 } } },
      { t: 0.45, label: 'rocked back', hold: 1.5,
        pose: { thigh_r: { flex: 66, abd: 46 }, shin_r: { flex: 8 }, foot_r: { flex: 16 },
          thigh_l: { flex: 76 }, shin_l: { flex: 94 },
          pelvis: { flex: -8 }, lumbar_lower: { flex: 8 }, lumbar_upper: { flex: 6 },
          upperarm_l: { flex: 118 }, upperarm_r: { flex: 118 } } },
      { t: 1, label: 'set',
        pose: { thigh_r: { flex: 60, abd: 44 }, shin_r: { flex: 8 }, foot_r: { flex: 16 } } },
    ],
  },
  {
    id: 'knee_to_wall', name: 'Knee-to-wall ankle test', category: 'test', duration: 7, loop: true, mirror: true,
    contacts: ['foot_l', 'shin_r', 'toes_r'], props: [{ kind: 'wall', touch: 'toes_l', dir: '+x', gap: 1 }], view: { az: 92, el: 6 }, areas: ['ankle'], targets: ['ankle'],
    why: 'The cleanest measure of ankle dorsiflexion, and the thing that most often limits a squat or a lunge.',
    cue: 'Half kneeling, foot flat, drive the knee forward over the toes without the heel lifting.',
    watch: 'How far past the toes the knee gets before the heel comes up. Compare the two sides.',
    setup: [
      'Bare feet. Find a wall and something to mark the floor with — a tape measure, or just a pen and a piece of paper.',
      'Kneel on one knee in front of the wall: front foot flat and pointing straight at it, back knee on the floor.',
      'Put the tip of your front big toe against the wall to start.',
    ],
    steps: [
      'Drive your front knee forward until it touches the wall, keeping the whole heel pressed to the floor.',
      'If the knee touches easily and the heel stays down, slide the foot back a centimetre and try again.',
      'Keep sliding back until you find the furthest distance where the knee still touches the wall AND the heel is still down.',
      'Measure from the wall to the tip of your big toe. That is your number, in centimetres.',
      'Do the other side the same way and write both numbers down.',
    ],
    look: [
      { sign: 'The heel lifting, even slightly',
        how: 'Have someone watch it, or put a sheet of paper under the heel — if you can pull it out, the heel has lifted.',
        means: 'The measurement only counts with the heel down. A lifted heel is the range you do not have.' },
      { sign: 'The arch of the foot collapsing inwards as the knee comes forward',
        how: 'Watch the inside of your arch. It should not flatten to the floor.',
        means: 'Borrowed range from the foot rather than the ankle. Keep the arch and re-measure.' },
      { sign: 'The knee drifting inwards instead of straight over the toes',
        how: 'The kneecap should travel over the second and third toes.',
        means: 'Same as above: range taken from somewhere other than the ankle.' },
    ],
    dose: 'A measurement, not an exercise. Take it once, then re-take it every week or two if you are working on ankle mobility.',
    stop: 'It should feel like a deep stretch at the front of the ankle. Pinching at the FRONT of the ankle joint is worth mentioning to someone in person.',
    from: 'lunge_l', floor: 'drop', plant: ['foot_l'],
      // Half kneeling with all three contacts actually on the floor: front foot
      // flat, back knee down, back toes tucked. Before this the back foot hung
      // fifteen centimetres in the air and the figure looked like it was
      // floating, because "drop until the lowest thing touches" only ever puts
      // ONE thing on the ground.
      frames: [
        { t: 0, label: 'start', hold: 0.5,
          pose: { thigh_l: { flex: 92 }, shin_l: { flex: 96 }, foot_l: { flex: 4 },
            thigh_r: { flex: 0 }, shin_r: { flex: 92 }, foot_r: { flex: -40 }, toes_r: { flex: 6 },
            upperarm_l: { flex: 16 }, upperarm_r: { flex: 16 } } },
        { t: 0.45, label: 'knee forward over the toes', hold: 1.6,
          pose: { thigh_l: { flex: 78 }, shin_l: { flex: 113 }, foot_l: { flex: 25 },
            thigh_r: { flex: 0 }, shin_r: { flex: 92 }, foot_r: { flex: -40 }, toes_r: { flex: 6 },
            upperarm_l: { flex: 30 }, upperarm_r: { flex: 30 }, forearm_l: { flex: 30 }, forearm_r: { flex: 30 },
            neck: { flex: 12 } } },
        { t: 1, label: 'start',
          pose: { thigh_l: { flex: 92 }, shin_l: { flex: 96 }, foot_l: { flex: 4 },
            thigh_r: { flex: 0 }, shin_r: { flex: 92 }, foot_r: { flex: -40 }, toes_r: { flex: 6 },
            upperarm_l: { flex: 16 }, upperarm_r: { flex: 16 } } },
      ],
  },
  {
    id: 'curl_up', name: 'Curl-up', category: 'control', duration: 6, loop: true,
    props: [{ kind: 'mat' }], view: { az: 92, el: 10 }, areas: ['core', 'low back'], targets: ['lumbar spine'],
    why: 'Loads the front of the trunk with the low back kept in its neutral curve, instead of grinding it flat like a sit-up.',
    cue: 'One knee bent, hands under the small of the back, lift only the head and shoulders a few centimetres.',
    watch: 'Coming up too far. The point is the first few centimetres held well, not the height.',
    setup: [
      'Lie on your back. ONE knee bent with the foot flat, the other leg straight.',
      'Slide both hands, palms down, under the small of your back. They stay there.',
      'This is deliberately a very small movement.',
    ],
    steps: [
      'Keep the low back pressed lightly on your hands. Do not flatten it hard.',
      'Lift your head and the tops of your shoulders a few centimetres only — enough to clear the floor.',
      'Your chin stays in the same relationship to your chest; do not crane it forward.',
      'Hold for eight to ten seconds, breathing normally.',
      'Lower fully and rest for a moment between repetitions.',
    ],
    look: [
      { sign: 'Coming up too far',
        how: 'The gap under your shoulder blades should be a few centimetres, not a sit-up.',
        means: 'Higher means the hip flexors take over and the low back loads up. The first few centimetres is the whole exercise.' },
      { sign: 'The chin poking forward',
        how: 'Keep your tongue on the roof of your mouth; it makes chin poke hard to do.',
        means: 'Poking loads the neck instead of the trunk.' },
      { sign: 'The pressure on your hands changing',
        how: 'Press your fingertips gently upwards into your low back before you start, so you have a baseline, then notice any change as you lift and lower.',
        means: 'It should stay about the same. Changing means the spine is moving when it should not.' },
    ],
    dose: 'Three holds of 8-10 seconds, then swap which knee is bent. Daily. Sets of long holds rather than many quick reps.',
    stop: 'Neck pain means you are pulling with the neck. Low back pain means the back position was lost.',
    from: 'supine',
    frames: [
      { t: 0, label: 'down', hold: 0.5,
        pose: { thigh_l: { flex: 62 }, shin_l: { flex: 92 }, upperarm_l: { flex: 20, abd: 30 }, upperarm_r: { flex: 20, abd: 30 },
          forearm_l: { flex: 70 }, forearm_r: { flex: 70 } } },
      { t: 0.45, label: 'curled', hold: 1.4,
        pose: { thigh_l: { flex: 62 }, shin_l: { flex: 92 },
          thorax_upper: { flex: 14 }, thorax_lower: { flex: 8 }, neck: { flex: 16 }, head: { flex: 8 },
          upperarm_l: { flex: 20, abd: 30 }, upperarm_r: { flex: 20, abd: 30 }, forearm_l: { flex: 70 }, forearm_r: { flex: 70 } } },
      { t: 1, label: 'down',
        pose: { thigh_l: { flex: 62 }, shin_l: { flex: 92 }, upperarm_l: { flex: 20, abd: 30 }, upperarm_r: { flex: 20, abd: 30 },
          forearm_l: { flex: 70 }, forearm_r: { flex: 70 } } },
    ],
  },
  {
    id: 'side_plank', name: 'Side plank', category: 'strength', duration: 8, loop: true, mirror: true,
    props: [{ kind: 'mat' }], view: { az: 4, el: 12 }, areas: ['core', 'low back', 'hip'], targets: ['lumbar spine', 'hip'],
    why: 'Loads the side of the trunk and the hip abductors together with almost no compression through the spine.',
    cue: 'Elbow under the shoulder, lift the hips until the body is one line. Start from the knees if that is too much.',
    watch: 'The hips sagging, or the top shoulder rolling forward.',
    setup: [
      'Lie on your side on a mat, elbow directly under your shoulder, forearm flat.',
      'Knees bent to start with; straight legs is the harder version.',
      'Film from the FRONT.',
    ],
    steps: [
      'Stack shoulder, hip and knee in one line.',
      'Lift your hips off the floor until the line from shoulder to knee is straight.',
      'Keep your top shoulder stacked over the bottom one — do not let the chest roll towards the floor.',
      'Hold, breathing normally.',
      'Lower under control. Do both sides even if only one hurts.',
    ],
    look: [
      { sign: 'The hips sagging towards the floor',
        how: 'From the front, the line from shoulder to knee should be straight.',
        means: 'End of the useful hold.' },
      { sign: 'The chest rolling forward',
        how: 'The top shoulder should stay above the bottom one, not in front of it.',
        means: 'Rolling forward makes it much easier and takes the side of the trunk out of it.' },
      { sign: 'Where you feel it',
        how: 'The side of the trunk and the side of the bottom hip.',
        means: 'Shoulder pain means the elbow is not under the shoulder.' },
      { sign: 'A clear difference between the sides',
        how: 'Time each side with a clock you can see, and note which side breaks form first rather than only how long each lasted.',
        means: 'Very common, and worth knowing about.' },
    ],
    dose: '3 holds each side, as long as form holds. Start from the knees. 20-30 seconds is a good target.',
    stop: 'Shoulder pain, or a hip that will not stay up, means come down and go back to the knees version.',
    from: 'sidelying_l', floor: 'contacts', anchor: 'forearm_l', contacts: ['foot_l'],
    frames: [
      { t: 0, label: 'down', hold: 0.6,
        pose: { upperarm_l: { flex: 92, abd: 8 }, forearm_l: { flex: 88 }, thigh_l: { flex: 6 }, shin_l: { flex: 22 },
          thigh_r: { flex: 4 }, shin_r: { flex: 16 }, upperarm_r: { flex: 18, rot: -30 }, forearm_r: { flex: 34 } } },
      { t: 0.45, label: 'up', hold: 1.8,
        pose: { upperarm_l: { flex: 92, abd: 8 }, forearm_l: { flex: 88 },
          thigh_l: { flex: 2, abd: 2 }, shin_l: { flex: 4 }, thigh_r: { flex: 2, abd: 4 }, shin_r: { flex: 4 },
          upperarm_r: { flex: 4, abd: 16, rot: -10 }, forearm_r: { flex: 10 },
          lumbar_lower: { abd: -4 }, lumbar_upper: { abd: -4 } } },
      { t: 1, label: 'down',
        pose: { upperarm_l: { flex: 92, abd: 8 }, forearm_l: { flex: 88 }, thigh_l: { flex: 6 }, shin_l: { flex: 22 },
          thigh_r: { flex: 4 }, shin_r: { flex: 16 }, upperarm_r: { flex: 18, rot: -30 }, forearm_r: { flex: 34 } } },
    ],
  },
  {
    id: 'front_plank', name: 'Front plank', category: 'strength', duration: 7, loop: true,
    props: [{ kind: 'mat' }], view: { az: 92, el: 8 }, areas: ['core', 'low back', 'shoulder'], targets: ['lumbar spine'],
    why: 'Asks the whole front of the trunk to stop the low back sagging. Thirty good seconds beats three sloppy minutes.',
    cue: 'Elbows under the shoulders, tailbone slightly tucked, squeeze everything. Breathe.',
    watch: 'The hips dropping or the shoulders sliding forward past the elbows.',
    setup: [
      'On a mat, forearms on the floor, elbows directly under your shoulders.',
      'Legs straight back, toes tucked under.',
      'Film from the SIDE. You cannot feel your own hip height.',
    ],
    steps: [
      'Before lifting, tuck your tailbone slightly so the low back flattens.',
      'Lift your hips so head, hips and heels make one straight line.',
      'Push the floor away with your forearms so your upper back does not sink between your shoulder blades.',
      'Squeeze the buttocks and the stomach. Breathe normally.',
      'Hold. Come down the moment the line breaks, not when the timer says so.',
    ],
    look: [
      { sign: 'The hips dropping',
        how: 'From the side, look for the straight line. Hips sagging is the usual failure.',
        means: 'When it sags, the low back is taking the load the trunk should. That is the end of the useful hold.' },
      { sign: 'The hips riding up into a peak',
        how: 'From the side-on video, lay a ruler or a straight edge along the screen from your shoulder to your heel: the hips should touch it, not sit above it.',
        means: 'Easier, and avoids the work. Lower to the line.' },
      { sign: 'The shoulders sinking between the blades',
        how: 'Watch the upper back: it should be flat or slightly rounded, not caved.',
        means: 'Push the floor away.' },
      { sign: 'Holding your breath',
        how: 'Count out loud from one to ten, or recite something. If you cannot speak in a normal voice, the hold is too hard and you are bracing with your breath.',
        means: 'If you cannot talk, come down.' },
    ],
    dose: '3 holds of 20-30 seconds with good form, resting a minute between. Thirty good seconds beats three sloppy minutes. From the knees if needed.',
    stop: 'Low back pain means the line broke — come down. Shoulder pain means the elbows are not under the shoulders.',
    from: 'prone', floor: 'contacts', contacts: ['forearm_l', 'forearm_r', 'toes_l', 'toes_r'],
    frames: [
      { t: 0, label: 'down', hold: 0.5,
        pose: { upperarm_l: { flex: 104, abd: 26 }, upperarm_r: { flex: 104, abd: 26 }, forearm_l: { flex: 96 }, forearm_r: { flex: 96 },
          foot_l: { flex: -20 }, foot_r: { flex: -20 }, neck: { flex: -10 } } },
      { t: 0.4, label: 'holding', hold: 2.0,
        pose: { upperarm_l: { flex: 88, abd: 6 }, upperarm_r: { flex: 88, abd: 6 }, forearm_l: { flex: 92 }, forearm_r: { flex: 92 },
          foot_l: { flex: 16 }, foot_r: { flex: 16 }, toes_l: { flex: 54 }, toes_r: { flex: 54 },
          pelvis: { flex: -6 }, lumbar_lower: { flex: 4 }, neck: { flex: -4 } } },
      { t: 1, label: 'down',
        pose: { upperarm_l: { flex: 104, abd: 26 }, upperarm_r: { flex: 104, abd: 26 }, forearm_l: { flex: 96 }, forearm_r: { flex: 96 },
          foot_l: { flex: -20 }, foot_r: { flex: -20 }, neck: { flex: -10 } } },
    ],
  },
  {
    id: 'wall_sit', name: 'Wall sit', category: 'strength', duration: 6, loop: true,
    props: [{ kind: 'wall', touch: 'thorax_upper', dir: '-x', gap: 1 }], propFrame: 1, view: { az: 92, el: 6 }, areas: ['knee', 'hip'], targets: ['knee', 'hip'],
    why: 'Loads the quadriceps hard with no movement at the knee, which makes it useful when moving the knee is what hurts.',
    cue: 'Slide down a wall until the thighs are level, knees over the ankles. Hold.',
    watch: 'The knees drifting inwards, and whether the pain is different from moving the knee under load.',
    setup: [
      'Stand with your back flat against a wall, feet about 50 cm out from it and shoulder width apart.',
      'Bare feet or flat shoes. A timer you can see.',
    ],
    steps: [
      'Slide down the wall until your thighs are parallel to the floor, or as close as you can manage.',
      'Your knees should be directly above your ankles, not in front of them. If they are forward, walk your feet further out.',
      'Keep your whole back in contact with the wall.',
      'Hold. Breathe normally — do not hold your breath.',
      'Slide back up when the time is done, or when your form breaks.',
    ],
    look: [
      { sign: 'The knees drifting inwards towards each other',
        how: 'Look down. A gap should stay between them, roughly hip width.',
        means: 'Hip control giving way under sustained load. Press the knees gently outwards.' },
      { sign: 'Your low back arching away from the wall',
        how: 'Try to slide a hand behind your low back — there should be only a small gap.',
        means: 'The trunk taking over from the legs.' },
      { sign: 'Where you feel it',
        how: 'It should burn across the front of the thighs.',
        means: 'If it is mostly at the front of the knee rather than the thigh, raise the position slightly so the knees are less bent.' },
    ],
    dose: '3 holds, as long as you can keep good form, resting a minute between. Start where you are — 20 seconds is a fine starting point. This is useful precisely because the knee does not move.',
    stop: 'Burning in the quadriceps is the point. Knee pain that builds through the hold means come up higher.',
    from: 'standing', floor: 'drop',
    frames: [
      { t: 0, label: 'stand', hold: 0.4, pose: {} },
      { t: 0.35, label: 'holding', hold: 2.2,
        pose: { thigh_l: { flex: 88 }, thigh_r: { flex: 88 }, shin_l: { flex: 88 }, shin_r: { flex: 88 },
          foot_l: { flex: 2 }, foot_r: { flex: 2 }, upperarm_l: { flex: 18 }, upperarm_r: { flex: 18 } } },
      { t: 1, label: 'stand', pose: {} },
    ],
  },
  {
    id: 'sl_rdl', name: 'Single-leg Romanian deadlift', category: 'control', duration: 9, loop: true, mirror: true,
    view: { az: 92, el: 6 }, areas: ['hip', 'low back'], targets: ['hip', 'lumbar spine', 'pelvis'],
    why: 'A hip hinge on one leg. Loads the hamstring and glute of the stance leg and tests the balance system at the same time.',
    cue: 'Hinge at the stance hip and let the other leg travel back as a counterweight. Hips stay square to the floor.',
    watch: 'The pelvis of the free leg rotating open, and the low back rounding near the bottom.',
    setup: [
      'Bare feet. Stand on one leg, standing knee softly bent — not locked.',
      'Fingertip on a wall or chair back for balance at first.',
      'Film from the SIDE for the back position and from BEHIND for the pelvis.',
    ],
    steps: [
      'Stand tall on one leg.',
      'Hinge forward at the hip, letting the free leg travel straight back behind you as a counterweight.',
      'Keep your back flat throughout — imagine a broomstick along your spine touching head, mid-back and tailbone.',
      'Go down only as far as you can keep the back flat. For most people that is nowhere near horizontal at first.',
      'Return to standing by driving the standing hip forward. Three seconds down, two up.',
    ],
    look: [
      { sign: 'The hips opening sideways',
        how: 'From behind, both hip bones should stay pointing at the floor. The free leg\'s hip tends to rotate open.',
        means: 'The most common fault. Point the toes of the free leg straight down at the floor and it usually corrects.' },
      { sign: 'The low back rounding near the bottom',
        how: 'From the side, watch the curve of the low back.',
        means: 'That is the end of your hip range. Stop just above it.' },
      { sign: 'The standing knee straightening or locking',
        how: 'It should keep the same soft bend the whole way.',
        means: 'Locking turns it into a hamstring stretch rather than a hip exercise.' },
    ],
    dose: '2 sets of 8 each leg, twice a week. Get the range and the control first; weight much later.',
    stop: 'A pull in the back of the standing thigh is expected. Low back pain is not — it means the range went too far.',
    holds: [{ kind: 'dumbbell', at: 'hand_r' }],
    props: [{ kind: 'rail', touch: 'hand_l', dir: '+y', gap: 5 }],
    from: 'standing', floor: 'balance', plant: ['foot_l'],
    frames: [
      { t: 0, label: 'tall', hold: 0.5, pose: { thigh_r: { flex: 14 }, shin_r: { flex: 24 } } },
      { t: 0.45, label: 'hinged', hold: 1.4,
        pose: { thigh_l: { flex: 62 }, shin_l: { flex: 16 },
          thigh_r: { flex: -18 }, shin_r: { flex: 14 }, foot_r: { flex: -20 },
          upperarm_l: { flex: -64 }, upperarm_r: { flex: -64 }, neck: { flex: -46 }, head: { flex: -8 } },
        root: { rot: { flex: 68 } } },
      { t: 1, label: 'tall', pose: { thigh_r: { flex: 14 }, shin_r: { flex: 24 } } },
    ],
  },
  {
    id: 'step_down', name: 'Step-down', category: 'control', duration: 8, loop: true, mirror: true,
    anchor: 'foot_l', anchorSpan: 0, lift: 21, props: [{ kind: 'step', under: 'foot_l', height: 21 }], view: { az: 2, el: 8 }, approx: 2,  // the free heel comes within a centimetre of the floor
    areas: ['knee', 'hip'], targets: ['knee', 'hip'],
    why: 'Slow lowering on one leg. The clearest look at whether the knee tracks or collapses inwards under load.',
    cue: 'Stand on one leg on a step and lower the other heel slowly towards the floor. Down slower than up.',
    watch: 'The knee falling inwards and the pelvis dropping on the free side. Both mean the same thing.',
    setup: [
      'Find a step, a low box or the bottom stair, 15-20 cm high. Higher makes it harder, not better.',
      'Stand on it with your LEFT foot only, close enough to the edge that your right foot can hang off with nothing under it.',
      'Put one fingertip on a wall or a door frame for balance. One finger, not a grip — if you need to hold on, the step is too high.',
      'Stand your phone on the floor two metres in front of you, camera at about knee height, and film. You will not be able to watch your own knee and balance at the same time.',
    ],
    steps: [
      'Stand tall on the left leg. Look straight ahead, not down at your feet.',
      'Bend the LEFT knee slowly and let the right heel travel straight down towards the floor. Count three seconds going down.',
      'Touch the right heel to the floor lightly — a tap, not a landing. Do not put weight on it.',
      'Push back up through the left heel to standing. Count one second coming up.',
      'That is one repetition. Down slower than up, every time.',
    ],
    look: [
      { sign: 'Your left kneecap drifts inwards, towards your other leg',
        how: 'At the top, line your kneecap up with your second toe. Watch that line in the video as you lower.',
        means: 'The hip is not controlling the thigh bone. This is the single most common finding, and it is what the side-lying hip work is for.' },
      { sign: 'The right side of your pelvis drops below the left as you go down',
        how: 'Put your thumbs on the top of your hip bones before you start, or watch your waistband in the video.',
        means: 'The left gluteus medius is not holding the pelvis level. Same cause as above, seen from a different angle.' },
      { sign: 'Your trunk leans over to the left to get down',
        how: 'Watch your head in the video: it should stay over the left foot, not travel sideways past it.',
        means: 'A way of borrowing from the trunk what the hip is not providing.' },
      { sign: 'Where in the range the pain starts',
        how: 'Note how far down the right heel got before you felt it — near the top, halfway, or only at the bottom.',
        means: 'Pain only in the last part of the range points at deep-flexion compression. Pain from the very start points at something more irritable.' },
    ],
    dose: 'Start with 2 sets of 6 on each leg, every other day. Do the sore side second so you have the good side as a reference. Build to 3 sets of 10 before you make the step higher.',
    stop: 'Stop the set if the pain goes above about 4/10, if it sharpens rather than aches, or if the knee catches. Mild soreness that settles within an hour is acceptable and expected.',
    props: [{ kind: 'step', under: 'foot_l', height: 18 }, { kind: 'rail', touch: 'hand_r', dir: '-y', gap: 5 }],
    from: 'standing', floor: 'balance', plant: ['foot_l'],
    frames: [
      { t: 0, label: 'tall', hold: 0.5,
        pose: { thigh_r: { flex: 26 }, shin_r: { flex: 10 }, foot_r: { flex: -12 } } },
      { t: 0.45, label: 'heel towards the floor', hold: 1.3,
        // the free leg has to actually reach the ground 18 cm below the step:
        // nearly straight and hanging, not tucked up in front
        pose: { thigh_l: { flex: 58, abd: 4 }, shin_l: { flex: 84 }, foot_l: { flex: 25 },
          thigh_r: { flex: 12 }, shin_r: { flex: 6 }, foot_r: { flex: -10 },
          pelvis: { abd: -5 }, lumbar_lower: { abd: 4 },
          upperarm_l: { flex: 36 }, upperarm_r: { flex: 36 }, forearm_l: { flex: 24 }, forearm_r: { flex: 24 } },
        root: { rot: { flex: 6 } } },
      { t: 1, label: 'tall',
        pose: { thigh_r: { flex: 26 }, shin_r: { flex: 10 }, foot_r: { flex: -12 } } },
    ],
  },
  {
    id: 'clamshell', name: 'Clamshell', category: 'strength', duration: 6, loop: true, mirror: true,
    anchor: 'thigh_l', contacts: ['upperarm_l', 'shin_l'], props: [{ kind: 'mat' }], view: { az: 4, el: 16 }, areas: ['hip'], targets: ['hip'],
    why: 'Hip external rotation against gravity with the hip flexed. A gentle way into the glutes when side-lying abduction is too much.',
    cue: 'Knees together and bent, heels together, open the top knee without rolling the pelvis back.',
    watch: 'The pelvis rolling backwards so the movement comes from the trunk instead of the hip.',
    setup: [
      'Lie on your side, hips and knees bent to about 45 and 90 degrees, heels together.',
      'Shoulder, hip and heel roughly in one line.',
      'Rest your top hand on the front of your top hip bone — you will use it to check yourself.',
    ],
    steps: [
      'Press your heels together and keep them touching for the whole set.',
      'Open the top knee towards the ceiling, like a clamshell hinging.',
      'Go only as far as you can WITHOUT the pelvis rolling backwards. For most people that is a lot less than they expect.',
      'Hold for two seconds at the top.',
      'Close slowly over three seconds.',
    ],
    look: [
      { sign: 'The pelvis rolling backwards',
        how: 'The hand on your hip bone: it should stay pointing straight ahead, not rotate back.',
        means: 'The moment it rolls, the movement has stopped coming from the hip. Stop there — that is your range.' },
      { sign: 'The heels coming apart',
        how: 'Feel for it. They should stay pressed together.',
        means: 'Separating the heels turns it into a different, easier movement.' },
    ],
    dose: '2 sets of 15 each side, daily. This is the gentler alternative to side-lying leg raises — use it if those cause pinching at the front of the hip.',
    stop: 'Should feel like work in the side and back of the hip. Nothing sharp.',
    from: 'sidelying_l',
    frames: [
      { t: 0, label: 'closed', hold: 0.5,
        pose: { thigh_l: { flex: 48 }, shin_l: { flex: 86 }, thigh_r: { flex: 48 }, shin_r: { flex: 86 },
          upperarm_l: { flex: 122 }, forearm_l: { flex: 28 } } },
      { t: 0.45, label: 'open', hold: 1.2,
        pose: { thigh_l: { flex: 48 }, shin_l: { flex: 86 }, thigh_r: { flex: 48, abd: 34, rot: 24 }, shin_r: { flex: 86 },
          upperarm_l: { flex: 122 }, forearm_l: { flex: 28 } } },
      { t: 1, label: 'closed',
        pose: { thigh_l: { flex: 48 }, shin_l: { flex: 86 }, thigh_r: { flex: 48 }, shin_r: { flex: 86 },
          upperarm_l: { flex: 122 }, forearm_l: { flex: 28 } } },
    ],
  },
  {
    id: 'sl_bridge', name: 'Single-leg glute bridge', category: 'strength', duration: 7, loop: true, mirror: true,
    props: [{ kind: 'mat' }], view: { az: 92, el: 8 }, areas: ['hip', 'low back'], targets: ['hip', 'lumbar spine'],
    why: 'The bridge with twice the load on one hip. Where a side-to-side difference in glute strength shows up.',
    cue: 'One foot planted, the other knee held up. Drive through the heel and keep the hips level at the top.',
    watch: 'The pelvis dropping on the lifted side, and cramping in the hamstring instead of work in the glute.',
    setup: [
      'Lie on your back on a mat, one knee bent with the foot flat, the other knee held up towards your chest.',
      'The foot on the floor should be close enough that you can just brush the heel with your fingertips.',
      'Film from the FRONT for the pelvis, from the SIDE for the height.',
    ],
    steps: [
      'Flatten the low back gently and tuck the tailbone slightly.',
      'Push through the HEEL of the planted foot and lift your hips.',
      'Stop at a straight line from knee to shoulder. Keep the hips LEVEL — this is the hard part.',
      'Hold three seconds at the top.',
      'Lower over three seconds. Do both sides even if only one is sore.',
    ],
    look: [
      { sign: 'The pelvis dropping on the lifted-leg side',
        how: 'From the front, or a hand on each hip bone. They should stay level.',
        means: 'This is the finding the exercise exists to expose. If it drops, go lower rather than pushing higher.' },
      { sign: 'Where you feel the work',
        how: 'The buttock of the planted leg.',
        means: 'Hamstring cramping means the heel is too far away. Low back means you went too high.' },
      { sign: 'A difference in how many you can do well on each side',
        how: 'Count good repetitions, not total ones.',
        means: 'That difference is the point of doing it one leg at a time.' },
    ],
    dose: '2 sets of 8 each side, holding three seconds, every other day. Fewer, level repetitions beat more uneven ones.',
    stop: 'Hamstring cramp means move the heel closer. Low back pain means reduce the height.',
    from: 'supine', floor: 'contacts', anchor: 'thorax_upper', pin: ['foot_l'], contacts: ['foot_l'],
    frames: [
      { t: 0, label: 'down', hold: 0.5,
        pose: { thigh_l: { flex: 62 }, shin_l: { flex: 92 }, thigh_r: { flex: 78 }, shin_r: { flex: 76 },
          upperarm_l: { abd: 26 }, upperarm_r: { abd: 26 } } },
      { t: 0.45, label: 'top', hold: 1.4,
        pose: { thigh_l: { flex: 16 }, shin_l: { flex: 92 }, thigh_r: { flex: 52 }, shin_r: { flex: 78 },
          pelvis: { flex: -8, abd: 3 }, lumbar_lower: { flex: 4 },
          upperarm_l: { abd: 26 }, upperarm_r: { abd: 26 } } },
      { t: 1, label: 'down',
        pose: { thigh_l: { flex: 62 }, shin_l: { flex: 92 }, thigh_r: { flex: 78 }, shin_r: { flex: 76 },
          upperarm_l: { abd: 26 }, upperarm_r: { abd: 26 } } },
    ],
  },
  {
    id: 'split_squat', name: 'Split squat', category: 'strength', duration: 8, loop: true, mirror: true,
    contacts: ['foot_l', 'toes_r'], view: { az: 92, el: 6 }, areas: ['hip', 'knee', 'ankle'], targets: ['hip', 'knee'],
    why: 'Loads one leg at a time with the balance demand of single-leg work but a base you can actually stay on.',
    cue: 'Feet in a long stride, drop the back knee straight down, keep the front shin fairly upright.',
    watch: 'The front knee falling in, and whether the two sides feel different at the same depth.',
    setup: [
      'Step into a long stride — front heel to back toes should be roughly the length of your own leg.',
      'Back heel stays UP the whole time; you are on the ball of the back foot.',
      'Fingertip on a wall for balance if you need it. Film from the side for depth, from the front for knee tracking.',
    ],
    steps: [
      'Stand tall, hips square and facing forward.',
      'Lower straight DOWN by bending both knees. Think of the back knee travelling towards the floor, not of leaning forward.',
      'Go down until the back knee is a couple of centimetres off the floor, or as far as is comfortable.',
      'Pause for a moment at the bottom.',
      'Drive up through the FRONT heel. Three seconds down, one second up.',
    ],
    look: [
      { sign: 'The front knee falling inwards',
        how: 'Film from the front. The kneecap should stay over the second toe throughout.',
        means: 'Hip control on the front leg.' },
      { sign: 'The front shin tipping a long way forward',
        how: 'From the side, the front shin should stay close to vertical.',
        means: 'A very forward shin loads the front of the knee much more. Lengthen the stride.' },
      { sign: 'Your weight drifting onto the back foot',
        how: 'You should be able to lift the back toes briefly at the bottom without falling.',
        means: 'The back leg is for balance, not for pushing. If it is carrying weight, the front leg is not being loaded.' },
      { sign: 'A difference in depth or steadiness between the two sides',
        how: 'Do both, count the reps you can do well on each.',
        means: 'That difference is the finding.' },
    ],
    dose: '2 sets of 8 each leg, twice a week, no weight to begin with. Add depth before you add weight.',
    stop: 'Front-of-knee pain that builds rep to rep means shorten the range. Sharp pain means stop the set.',
    props: [{ kind: 'mat' }, { kind: 'rail', touch: 'hand_l', dir: '+y', gap: 5 }],
    from: 'lunge_l', floor: 'contacts', contacts: ['foot_l', 'toes_r'], approx: 2.5,
    frames: [
      { t: 0, label: 'tall', hold: 0.5,
        pose: { pelvis: { rot: 0 }, lumbar_lower: { abd: 6 }, lumbar_upper: { abd: 4 },
          thigh_l: { flex: 26, abd: -5 }, shin_l: { flex: 22 },
          thigh_r: { flex: -22, abd: 3 }, shin_r: { flex: 22 }, foot_r: { flex: -38 }, toes_r: { flex: 48 } } },
      { t: 0.45, label: 'bottom', hold: 1.3,
        pose: { pelvis: { rot: 0 }, lumbar_lower: { abd: 6 }, lumbar_upper: { abd: 4 },
          thigh_l: { flex: 76, abd: -20 }, shin_l: { flex: 104 }, foot_l: { flex: 14 },
          thigh_r: { flex: -18, abd: -9 }, shin_r: { flex: 84 }, foot_r: { flex: -44 }, toes_r: { flex: 56 },
          upperarm_l: { flex: -12 }, upperarm_r: { flex: 12 } } },
      { t: 1, label: 'tall',
        pose: { pelvis: { rot: 0 }, lumbar_lower: { abd: 6 }, lumbar_upper: { abd: 4 },
          thigh_l: { flex: 26, abd: -5 }, shin_l: { flex: 22 },
          thigh_r: { flex: -22, abd: 3 }, shin_r: { flex: 22 }, foot_r: { flex: -38 }, toes_r: { flex: 48 } } },
    ],
  },
  {
    id: 'shoulder_er', name: 'Shoulder external rotation', category: 'strength', duration: 6, loop: true, mirror: true,
    view: { az: 2, el: 8 }, areas: ['shoulder'], targets: ['shoulder'],
    why: 'The rotator cuff, loaded where it is easiest to feel: elbow at the side, forearm turning outwards.',
    cue: 'Elbow tucked into your side and bent to ninety, turn the forearm out without letting the elbow drift.',
    watch: 'The elbow leaving the ribs, or the whole body turning to fake the range.',
    setup: [
      'Stand or sit tall. Elbow tucked into your side, bent to 90 degrees.',
      'Roll a small towel and hold it between your elbow and your ribs — if it drops, the elbow moved.',
      'A resistance band anchored at waist height, or a very light weight lying on your side.',
    ],
    steps: [
      'Keep the elbow pinned to your side, the towel held.',
      'Rotate your forearm OUTWARDS, away from your stomach, like opening a gate. The elbow does not move.',
      'Go as far as comfortable — usually about 45 degrees for most people.',
      'Hold one second.',
      'Return slowly over three seconds.',
    ],
    look: [
      { sign: 'The elbow drifting away from the ribs',
        how: 'The towel. If it drops, that repetition did not count.',
        means: 'Letting the elbow move turns it into a shoulder abduction and takes the cuff out of it.' },
      { sign: 'The whole body turning to get more range',
        how: 'Face a doorframe and keep your chest square to it.',
        means: 'Very common and very easy to do without noticing.' },
      { sign: 'Where you feel it',
        how: 'Deep in the back of the shoulder.',
        means: 'Pinching at the front or top of the shoulder means reduce the range.' },
    ],
    dose: '3 sets of 12 each side, slowly, every other day. Light resistance: this is not a strength lift.',
    stop: 'Pinching at the top of the shoulder means stop and reduce the range.',
    holds: [{ kind: 'band', from: 'hand_l', to: 'hand_r' }],
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'in', hold: 0.5,
        pose: { upperarm_l: { flex: 6, abd: 6, rot: -40 }, forearm_l: { flex: 90, rot: -60 } } },
      { t: 0.45, label: 'out', hold: 1.2,
        pose: { upperarm_l: { flex: 6, abd: 6, rot: 44 }, forearm_l: { flex: 90, rot: -60 } } },
      { t: 1, label: 'in',
        pose: { upperarm_l: { flex: 6, abd: 6, rot: -40 }, forearm_l: { flex: 90, rot: -60 } } },
    ],
  },
  {
    id: 'prone_ytw', name: 'Prone Y and T raises', category: 'control', duration: 9, loop: true,
    props: [{ kind: 'mat' }], view: { az: 0, el: 62 }, areas: ['shoulder', 'mid back'], targets: ['shoulder', 'thoracic spine'],
    why: 'Trains the lower and mid trapezius, which is what holds the shoulder blade steady while the arm works.',
    cue: 'Face down, thumbs up. Lift into a Y, then out into a T. Small movements, no shrugging.',
    watch: 'The shoulders lifting towards the ears, and the low back arching to get the arms higher.',
    setup: [
      'Lie face down on a mat, forehead resting on a folded towel so you can breathe.',
      'Arms out, thumbs pointing up at the ceiling.',
      'No weight to begin with — your arms are enough.',
    ],
    steps: [
      'Gently draw your shoulder blades down towards your back pockets BEFORE you lift anything.',
      'For the Y: arms out at roughly 45 degrees above your head, thumbs up. Lift them a few centimetres. Hold three seconds.',
      'For the T: arms straight out to the sides, thumbs up. Lift a few centimetres. Hold three seconds.',
      'Lower slowly between each.',
      'Six of each. Small movements — a few centimetres is enough.',
    ],
    look: [
      { sign: 'The shoulders shrugging up towards the ears',
        how: 'Have someone watch, or film from above.',
        means: 'Shrugging means the upper trapezius has taken over from the mid and lower trapezius, which are the target.' },
      { sign: 'The low back arching to get the arms higher',
        how: 'From the side, or a hand on your low back.',
        means: 'Height is not the goal. A few centimetres done from the shoulder blades beats a big lift from the back.' },
      { sign: 'The head lifting',
        how: 'The forehead stays on the towel.',
        means: 'Lifting the head brings the neck into it.' },
    ],
    dose: '2 sets of 6 of each shape, holding three seconds, every other day.',
    stop: 'Neck or low back ache means the movement got too big. Reduce the height.',
    from: 'prone',
    frames: [
      { t: 0, label: 'hands on the floor', hold: 0.5,
        pose: { upperarm_l: { flex: 18, abd: 30 }, upperarm_r: { flex: 18, abd: 30 },
          foot_l: { flex: -20 }, foot_r: { flex: -20 }, neck: { flex: -6 } } },
      { t: 0.3, label: 'Y \u00b7 arms lifted overhead', hold: 1.2,
        pose: { upperarm_l: { flex: -20, abd: 60, rot: 30 }, upperarm_r: { flex: -20, abd: 60, rot: 30 },
          clavicle_l: { flex: -12, abd: 10 }, clavicle_r: { flex: -12, abd: 10 },
          foot_l: { flex: -20 }, foot_r: { flex: -20 }, neck: { flex: -6 } } },
      { t: 0.5, label: 'hands on the floor', hold: 0.4,
        pose: { upperarm_l: { flex: 18, abd: 30 }, upperarm_r: { flex: 18, abd: 30 },
          foot_l: { flex: -20 }, foot_r: { flex: -20 }, neck: { flex: -6 } } },
      { t: 0.72, label: 'T \u00b7 arms lifted out sideways', hold: 1.2,
        pose: { upperarm_l: { flex: -18, abd: 85, rot: 26 }, upperarm_r: { flex: -18, abd: 85, rot: 26 },
          clavicle_l: { flex: -16 }, clavicle_r: { flex: -16 },
          foot_l: { flex: -20 }, foot_r: { flex: -20 }, neck: { flex: -6 } } },
      { t: 1, label: 'hands on the floor',
        pose: { upperarm_l: { flex: 18, abd: 30 }, upperarm_r: { flex: 18, abd: 30 },
          foot_l: { flex: -20 }, foot_r: { flex: -20 }, neck: { flex: -6 } } },
    ],
  },
  {
    id: 'toe_touch', name: 'Forward bend', category: 'test', duration: 8, loop: true,
    view: { az: 92, el: 6 }, areas: ['low back', 'hip'], targets: ['lumbar spine', 'hamstring', 'hip'],
    why: 'How far you bend forward, and more usefully, where the bend comes from.',
    cue: 'Knees soft, reach towards the floor without forcing it.',
    watch: 'Whether the hips travel back and the spine keeps its curve, or the low back does all of it at once.',
    setup: [
      'Bare feet, hip width apart, knees soft.',
      'Film from the SIDE. This is a test of WHERE the bend comes from, not of how far you get.',
    ],
    steps: [
      'Stand tall.',
      'Reach slowly towards the floor without forcing it.',
      'Go to the first point of real resistance and stop. Do not bounce.',
      'Note where your fingertips reach: mid-shin, ankle, floor.',
      'Stand up slowly, rolling the spine up from the bottom.',
    ],
    look: [
      { sign: 'Whether your hips travel BACKWARDS as you bend',
        how: 'From the side, watch your bottom. In a healthy bend it moves back over your heels.',
        means: 'Hips that stay put mean all the bend is coming from the spine.' },
      { sign: 'Where the curve appears first',
        how: 'From the side, watch the low back. It should keep a slight inward curve well into the movement.',
        means: 'A low back that rounds immediately is doing the hips\' job. That is the pattern the hip hinge drill exists to change.' },
      { sign: 'Where the pull is felt',
        how: 'Note it: back of the thighs, back of the knees, or the low back itself.',
        means: 'Hamstrings is normal. Low back means the spine is taking the load.' },
    ],
    dose: 'A test. Take it once, re-take it monthly.',
    stop: 'Stop at resistance, never at pain. If anything shoots down a leg, stop and mention it to someone in person.',
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'tall', hold: 0.5, pose: {} },
      { t: 0.5, label: 'bent', hold: 1.5,
        pose: { thigh_l: { flex: 56 }, thigh_r: { flex: 56 }, shin_l: { flex: 10 }, shin_r: { flex: 10 },
          lumbar_lower: { flex: 22 }, lumbar_upper: { flex: 20 }, thorax_lower: { flex: 14 }, thorax_upper: { flex: 10 },
          upperarm_l: { flex: -44 }, upperarm_r: { flex: -44 }, neck: { flex: 10 } },
        root: { rot: { flex: 52 } } },
      { t: 1, label: 'tall', pose: {} },
    ],
  },
  {
    id: 'shoulder_flexion_test', name: 'Overhead reach test', category: 'test', duration: 7, loop: true,
    view: { az: 72, el: 8 }, areas: ['shoulder', 'mid back'], targets: ['shoulder', 'thoracic spine'],
    why: 'How far the arms go overhead, and what the rest of the body does to get them there.',
    cue: 'Arms straight up beside the ears, ribs down, without arching the back.',
    watch: 'Ribs flaring, low back extending, or one arm stopping earlier than the other.',
    setup: [
      'Stand with your back against a wall, feet a little way out from it.',
      'Press the low back towards the wall so there is only a small gap.',
      'Film from the SIDE.',
    ],
    steps: [
      'Arms straight down by your sides, thumbs forward.',
      'Keeping the low back against the wall, raise both arms forward and up as far as they go.',
      'Stop the moment your low back leaves the wall, even if the arms could go further.',
      'Note how far each arm got — by the wall, or by the angle in the video.',
      'Do it again one arm at a time and compare the two.',
    ],
    look: [
      { sign: 'The low back arching off the wall',
        how: 'The hand-behind-the-back check, or the side-on video.',
        means: 'This is the point of doing it against a wall. Most people appear to have full overhead range only because their low back supplies the last thirty degrees.' },
      { sign: 'A difference between the arms',
        how: 'One at a time, measured.',
        means: 'A side-to-side difference matters more than the number.' },
      { sign: 'The shoulders shrugging',
        how: 'Watch the gap between shoulder and ear.',
        means: 'Shrugging is a way of getting the hand higher without the shoulder moving further.' },
    ],
    dose: 'A test. Take it once, re-take it every few weeks if you are working on it.',
    stop: 'Stop at pinching. The height at which pinching starts is itself the finding.',
    props: [{ kind: 'wall', touch: 'thorax_upper', dir: '-x' }],
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'down', hold: 0.5, pose: {} },
      { t: 0.45, label: 'overhead', hold: 1.6,
        pose: { upperarm_l: { flex: 166, abd: 10, rot: 26 }, upperarm_r: { flex: 166, abd: 10, rot: 26 },
          clavicle_l: { abd: 26, flex: -6 }, clavicle_r: { abd: 26, flex: -6 },
          thorax_upper: { flex: -7 }, thorax_lower: { flex: -5 } } },
      { t: 1, label: 'down', pose: {} },
    ],
  },
  {
    id: 'apley', name: 'Reach behind (Apley scratch)', category: 'test', duration: 9, loop: true, mirror: true,
    view: { az: 40, el: 8 }, areas: ['shoulder'], targets: ['shoulder'],
    why: 'Two combined shoulder movements in one. A difference between sides is more informative than either number alone.',
    cue: 'One hand over the shoulder down the back, then the same hand up behind the back from below.',
    watch: 'How far each hand reaches, and which of the two directions is the restricted one.',
    setup: [
      'Stand or sit tall.',
      'Have someone measure, or use a mirror and a ruler.',
    ],
    steps: [
      'Reach one hand over your shoulder and down your back as far as it goes.',
      'Note where your fingertips reach — a landmark on your spine, or measure from the base of your neck.',
      'Now take the SAME hand behind your back from below and reach up as far as it goes.',
      'Note where those fingertips reach.',
      'Repeat with the other arm and compare the two sides for both directions.',
    ],
    look: [
      { sign: 'A difference between the two sides',
        how: 'Measure, do not estimate. Fingertip to a fixed landmark.',
        means: 'The comparison is the finding; absolute reach varies enormously between people.' },
      { sign: 'Which of the two directions is restricted',
        how: 'Note them separately.',
        means: 'Over-the-top restriction and up-the-back restriction mean different things, so do not average them.' },
      { sign: 'Whether it is stiffness or pain that stops you',
        how: 'At the end of each reach, ask whether it feels like something has run out of length, or like something hurt and you flinched. They stop the movement at different points and mean different things.',
        means: 'Pain stopping the movement is a different problem from tightness stopping it.' },
    ],
    dose: 'A test. Take it once, re-take it monthly.',
    stop: 'Do not force either direction. Sharp shoulder pain means stop where it started.',
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'rest', hold: 0.4, pose: {} },
      { t: 0.3, label: 'over the top', hold: 1.2,
        pose: { upperarm_l: { flex: 150, abd: 26, rot: 60 }, forearm_l: { flex: 130 }, clavicle_l: { abd: 22 },
          neck: { rot: 10 } } },
      { t: 0.62, label: 'up the back', hold: 1.2,
        pose: { upperarm_l: { flex: -34, abd: 8, rot: -78 }, forearm_l: { flex: 88 }, clavicle_l: { flex: -14 },
          neck: { rot: -8 } } },
      { t: 1, label: 'rest', pose: {} },
    ],
  },
  {
    id: 'thomas_test', name: 'Thomas test', category: 'test', duration: 8, loop: true, mirror: true,
    props: [{ kind: 'seat', under: 'pelvis' }], propFrame: 1, view: { az: 92, el: 8 }, areas: ['hip', 'knee'], targets: ['hip'],
    why: 'Separates a short hip flexor from a short rectus femoris: one leg held to the chest, the other left to hang.',
    cue: 'Sit on the edge, roll back holding one knee to the chest, and let the other leg go.',
    watch: 'Whether the hanging thigh rests down, and whether its knee stays bent. Those two mean different things.',
    setup: [
      'You need a firm table, bed or bench you can lie on with your legs hanging off the end. A sofa is too soft.',
      'Sit on the very edge of it, with your backside right at the edge.',
      'You will probably need someone to watch, or to film from the side.',
    ],
    steps: [
      'Hold one knee to your chest and roll backwards until you are lying flat.',
      'Keep hugging that knee — it flattens your low back and stops it cheating.',
      'Let the OTHER leg hang freely off the edge. Do not help it.',
      'Look at what the hanging leg does, then swap sides.',
      'It is a test: the information is in what the hanging leg does on its own.',
    ],
    look: [
      { sign: 'Whether the hanging thigh rests down level with the table',
        how: 'From the side. Is the back of the thigh touching, or held up in the air?',
        means: 'Held up means a short hip flexor on that side.' },
      { sign: 'Whether the hanging knee stays bent to about 90 degrees',
        how: 'From the side. Does it straighten out on its own?',
        means: 'Straightening means a short rectus femoris — a different muscle from the one above, and a different stretch.' },
      { sign: 'Whether the hanging leg drifts out to the side',
        how: 'From directly in front or above.',
        means: 'Drifting out suggests a tight iliotibial band or tensor fasciae latae.' },
      { sign: 'A difference between the sides',
        how: 'Photograph both sides from exactly the same spot, ideally with the camera on something rather than hand-held, and compare the two pictures afterwards.',
        means: 'The comparison is more useful than either side alone.' },
    ],
    dose: 'A test. Take it once, re-take it after a few weeks of hip flexor work.',
    stop: 'Low back pain means you are not hugging the held knee tightly enough. Do not force the hanging leg down.',
    from: 'supine',
    frames: [
      { t: 0, label: 'both down', hold: 0.6,
        pose: { upperarm_l: { abd: 22 }, upperarm_r: { abd: 22 } } },
      { t: 0.45, label: 'one knee held', hold: 2.0,
        pose: { thigh_r: { flex: 108 }, shin_r: { flex: 118 },
          thigh_l: { flex: 14 }, shin_l: { flex: 52 },
          pelvis: { flex: -12 }, lumbar_lower: { flex: 8 },
          upperarm_l: { flex: 78, abd: 18 }, upperarm_r: { flex: 78, abd: 18 }, forearm_l: { flex: 92 }, forearm_r: { flex: 92 },
          neck: { flex: 10 } } },
      { t: 1, label: 'both down',
        pose: { upperarm_l: { abd: 22 }, upperarm_r: { abd: 22 } } },
    ],
  },

  /* ------------------------------------------------------------------------
   * The four the written plan calls for and the library did not have. Added
   * when the plan became a daily app: every line of the programme has to be
   * something you can tap and watch, or the app quietly teaches you that half
   * of it does not matter.
   * --------------------------------------------------------------------- */
  {
    id: 'push_up', name: 'Push-up', category: 'strength', duration: 5, loop: true,
    props: [{ kind: 'mat' }], view: { az: 92, el: 8 }, areas: ['shoulder', 'core', 'mid back'],
    targets: ['shoulder', 'elbow', 'lumbar spine'],
    why: 'The only upper-body exercise that needs nothing at all, which is exactly why it is in the morning anchor: it works in a hotel room in the wrong time zone with a three-year-old climbing on your back.',
    cue: 'One straight line from head to heels, held the whole way down and the whole way up. Elbows back at about forty-five degrees, not flared out level with your shoulders.',
    watch: 'The hips sagging, or the head reaching the floor before the chest does.',
    setup: [
      'Hands on the mat slightly wider than your shoulders, directly under them or a touch lower down your chest.',
      'Point your fingers forwards. Spread them. Grip the floor slightly.',
      'Legs straight back, toes tucked under, feet about hip width.',
      'Before you move, squeeze the buttocks and tuck the tailbone very slightly so the low back is flat rather than arched.',
      'Film from the SIDE, phone on the floor a couple of metres away. Everything that goes wrong with a push-up is a side-on fault and none of it can be felt.',
    ],
    steps: [
      'Start at the top with your elbows straight but not locked hard.',
      'Lower over about two seconds, keeping the line from head to heels rigid.',
      'Let your elbows travel BACKWARDS towards your hips, not sideways. The upper arms should make roughly a 45-degree arrow shape with your body, not a T.',
      'Go down until your chest is a fist off the floor, or as far as you can go while the line stays straight.',
      'Pause for a beat at the bottom. Do not bounce off the floor.',
      'Press back up over about one second, keeping the tailbone tucked so the hips do not lead.',
      'At the top, push the floor away so your upper back widens rather than sinking between your shoulder blades.',
    ],
    look: [
      { sign: 'The hips sagging, so the low back arches on the way down',
        how: 'From the side-on video, hold a straight edge up to the screen from your shoulder to your heel at the bottom of the rep. The hip should touch it.',
        means: 'The trunk has given up and the low back is taking the load. That rep is the last useful one — stop the set there rather than grinding out three more.' },
      { sign: 'The hips rising first on the way up, so you fold in the middle',
        how: 'Watch the order in the video. Shoulders and hips should rise together, at the same moment.',
        means: 'Your chest and arms cannot do the rep, so your hips are cheating it upwards. Drop to the knees or raise your hands onto a step.' },
      { sign: 'The head diving, so the chin reaches the floor before the chest',
        how: 'Watch the head. It should stay in line with the spine, eyes at a spot on the floor about thirty centimetres ahead of your hands.',
        means: 'It makes the rep look deeper than it is. The chest is the thing that has to travel.' },
      { sign: 'Elbows flaring out level with the shoulders',
        how: 'Film from ABOVE this once, phone propped on a chair. At the bottom, your body and upper arms should make an arrow shape, not a letter T.',
        means: 'The T position is the one that irritates shoulders over months. Tuck the elbows in.' },
      { sign: 'Half the range at the bottom',
        how: 'In the video, look at the gap between your chest and the floor at the lowest point. A fist is the target.',
        means: 'Short reps are how a set stops being hard without you noticing. Go deeper before you add reps.' },
    ],
    dose: 'Three sets, stopping two repetitions short of the point where your form would break, resting about a minute between. Daily as part of the anchor. When you can do 12 clean reps in all three sets, slow the lowering to four seconds rather than chasing a higher number. This is an anchor habit, not a chest-building programme.',
    stop: 'Shoulder pain at the front of the joint means the elbows are flaring — fix that first, and if it persists, stop the exercise and say so. Low back pain means the line broke: the set is over. Wrist pain usually means the wrist is bent too far — put your hands on a pair of dumbbells and grip those instead.',
    from: 'prone', floor: 'contacts', contacts: ['hand_l', 'hand_r', 'toes_l', 'toes_r'], approx: 2.5,
    frames: [
      { t: 0, label: 'top', hold: 0.6,
        pose: { upperarm_l: { flex: 86, abd: 14 }, upperarm_r: { flex: 86, abd: 14 },
          forearm_l: { flex: 6 }, forearm_r: { flex: 6 }, hand_l: { flex: -62 }, hand_r: { flex: -62 },
          foot_l: { flex: 14 }, foot_r: { flex: 14 }, toes_l: { flex: 54 }, toes_r: { flex: 54 },
          pelvis: { flex: -5 }, lumbar_lower: { flex: 3 }, neck: { flex: -6 } } },
      { t: 0.5, label: 'bottom', hold: 0.5,
        pose: { upperarm_l: { flex: 54, abd: 44 }, upperarm_r: { flex: 54, abd: 44 },
          forearm_l: { flex: 94 }, forearm_r: { flex: 94 }, hand_l: { flex: -62 }, hand_r: { flex: -62 },
          foot_l: { flex: 14 }, foot_r: { flex: 14 }, toes_l: { flex: 54 }, toes_r: { flex: 54 },
          pelvis: { flex: -5 }, lumbar_lower: { flex: 3 }, neck: { flex: -6 } } },
      { t: 1, label: 'top',
        pose: { upperarm_l: { flex: 86, abd: 14 }, upperarm_r: { flex: 86, abd: 14 },
          forearm_l: { flex: 6 }, forearm_r: { flex: 6 }, hand_l: { flex: -62 }, hand_r: { flex: -62 },
          foot_l: { flex: 14 }, foot_r: { flex: 14 }, toes_l: { flex: 54 }, toes_r: { flex: 54 },
          pelvis: { flex: -5 }, lumbar_lower: { flex: 3 }, neck: { flex: -6 } } },
    ],
  },

  {
    id: 'bent_row', name: 'Row · band or dumbbell', category: 'strength', duration: 6, loop: true,
    view: { az: 92, el: 8 }, areas: ['mid back', 'shoulder'], targets: ['shoulder', 'thoracic spine'],
    why: 'Pulls to the LOW chest rather than wide, which builds the muscles that hold your shoulder blades back without building the width across the top. It is the posture exercise disguised as a strength exercise.',
    cue: 'Lead with the elbow, drive it back past your ribs, and let the shoulder blade slide towards your spine at the end. Chest stays where it is.',
    watch: 'The torso rising as the weight comes up — swinging the load rather than pulling it.',
    setup: [
      'With a band: stand on the middle of it, one end in each hand. With dumbbells: one in each hand \u2014 that is the version drawn here. (A single-arm version braced on a bench works too, and is easier on the low back.)',
      'Feet hip width. Soft knees, not locked.',
      'Hinge at the HIPS until your chest is at about 45 degrees — push the hips back, do not bend the waist. Your back stays flat.',
      'Let the arms hang straight down from the shoulders. This is the start and the finish of every rep.',
      'Film from the SIDE. The fault in a row is torso movement, which you genuinely cannot feel.',
    ],
    steps: [
      'Set the hinge, arms hanging, back flat, eyes at the floor a metre or so in front of you.',
      'Pull by driving your ELBOW backwards towards your hip pocket. The hand follows the elbow; it does not lead.',
      'Bring the hands to your LOW chest or upper stomach, not to your armpits.',
      'At the top of the pull, let the shoulder blade slide the last centimetre in towards your spine, and hold it there for one second.',
      'Lower over three seconds, all the way to a straight arm, letting the shoulder blade travel forwards again at the end.',
      'The torso does not move at any point in this. If it does, the weight is too heavy.',
    ],
    look: [
      { sign: 'The torso lifting as the weight comes up',
        how: 'In the side-on video, pick a fixed point behind you — a door frame, a window edge — and watch your shoulder against it through a whole set. It should not travel.',
        means: 'You are rowing with your low back. Lighten the band or the dumbbell by a third and do it again.' },
      { sign: 'Elbows going out wide, away from your ribs',
        how: 'Film from behind or above for one set. The upper arms should stay close to the body, at about 30 degrees, not out at 90.',
        means: 'Wide elbows shift the work up into the top of the shoulder and the upper back — which is the width you said you did not want. Keep them tucked.' },
      { sign: 'Stopping short at the bottom',
        how: 'Watch the elbow angle at the lowest point. It should be completely straight before the next rep starts.',
        means: 'Half the benefit of a row is the stretched position at the bottom. Do not cut it off.' },
      { sign: 'The back rounding as you tire',
        how: 'In the video, lay a straight edge along your spine at rep one and at the last rep. It should look the same.',
        means: 'That is the set finished, whatever the rep count said.' },
    ],
    dose: 'Three sets of 10, twice a week, on Session A. Add a repetition before you add resistance. Three seconds on the way down every rep — that half is where the work is, and it is the half everybody skips.',
    stop: 'Low back ache means the hinge collapsed or the load is too heavy. Sharp pain at the front of the shoulder means you are pulling too wide or too high — bring the hands lower on the body.',
    holds: [{ kind: 'dumbbell', at: 'hand_l' }, { kind: 'dumbbell', at: 'hand_r' }],
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'arms long', hold: 0.6,
        pose: { thigh_l: { flex: 46 }, thigh_r: { flex: 46 }, shin_l: { flex: 18 }, shin_r: { flex: 18 },
          upperarm_l: { flex: 30, abd: 4 }, upperarm_r: { flex: 30, abd: 4 },
          forearm_l: { flex: 8 }, forearm_r: { flex: 8 },
          clavicle_l: { flex: 16 }, clavicle_r: { flex: 16 },
          neck: { flex: -38 }, head: { flex: -8 } },
        root: { rot: { flex: 56 } } },
      { t: 0.45, label: 'elbow to the hip', hold: 1.1,
        pose: { thigh_l: { flex: 46 }, thigh_r: { flex: 46 }, shin_l: { flex: 18 }, shin_r: { flex: 18 },
          upperarm_l: { flex: -4, abd: -10 }, upperarm_r: { flex: -4, abd: -10 },
          forearm_l: { flex: 98 }, forearm_r: { flex: 98 },
          clavicle_l: { flex: -20 }, clavicle_r: { flex: -20 },
          thorax_upper: { flex: -6 }, neck: { flex: -38 }, head: { flex: -8 } },
        root: { rot: { flex: 56 } } },
      { t: 1, label: 'arms long',
        pose: { thigh_l: { flex: 46 }, thigh_r: { flex: 46 }, shin_l: { flex: 18 }, shin_r: { flex: 18 },
          upperarm_l: { flex: 30, abd: 4 }, upperarm_r: { flex: 30, abd: 4 },
          forearm_l: { flex: 8 }, forearm_r: { flex: 8 },
          clavicle_l: { flex: 16 }, clavicle_r: { flex: 16 },
          neck: { flex: -38 }, head: { flex: -8 } },
        root: { rot: { flex: 56 } } },
    ],
  },

  {
    id: 'goblet_squat', name: 'Goblet squat to a box', category: 'strength', duration: 7, loop: true,
    props: [{ kind: 'seat', under: 'pelvis' }], propFrame: 1, view: { az: 60, el: 8 },
    areas: ['hip', 'knee', 'ankle'], targets: ['hip', 'knee', 'ankle'],
    why: 'A squat with the depth decided in advance by the height of the box, which is exactly what a sore knee needs: the range is a thing you choose once and then stop negotiating with rep by rep.',
    cue: 'Sit back to the box, touch it, stand up. Weight held at the chest keeps you upright so the knee does not have to travel as far forward.',
    watch: 'Whether you drop onto the box rather than lowering onto it, and whether the knees drift inwards near the bottom.',
    setup: [
      'Set a box, a bench or a chair behind you. Start HIGH — a dining chair — and only go lower once the knee is quiet.',
      'Stand just in front of it, feet a little wider than your hips, toes turned out about fifteen degrees.',
      'Hold the dumbbell vertically against your chest, both hands cupped under the top end, elbows tucked in.',
      'Film from the FRONT for the knee question and from the SIDE for the depth question. Two separate sets, two separate camera positions.',
    ],
    steps: [
      'Take a breath in and brace your stomach as though about to be poked.',
      'Push your hips BACK first, then let the knees bend. Hips before knees, every time.',
      'Lower over three seconds, staying tall through the chest.',
      'Touch the box with your backside. Touch it — do not sit down on it and do not drop onto it.',
      'Without rocking backwards, drive down through the middle of both feet and stand up.',
      'Stand all the way tall and squeeze the buttocks at the top before starting the next one.',
    ],
    look: [
      { sign: 'The knee drifting inwards towards the big toe',
        how: 'From the FRONT video, pause at the lowest point. Draw a line with your finger on the screen from your hip to your ankle: the kneecap should sit on it, over the second toe. On a painful knee it usually sits inside it.',
        means: 'The hip is not controlling the leg. It is the single most common finding in front-of-knee pain, and it is what the side-lying abduction work is for.' },
      { sign: 'Dropping onto the box instead of lowering onto it',
        how: 'Turn the sound on. You will hear the landing. Or count the seconds down and up — down should take longer.',
        means: 'The lowering is the half that builds control, and it is the half a sore knee needs most.' },
      { sign: 'The heels lifting near the bottom',
        how: 'Side-on video. Watch the back of the shoe.',
        means: 'Usually ankle stiffness. Your knee-to-wall was 14 and 15 cm, so this is not your limitation — if the heels lift, it is more likely the box is too low for now.' },
      { sign: 'The chest folding forwards so it becomes a hinge',
        how: 'Side-on video: watch the angle of your breastbone at the bottom versus at the top.',
        means: 'Fine in a deadlift, not here. Hold the weight higher on your chest and it usually corrects itself.' },
      { sign: 'A difference in the two knees',
        how: 'Front-on video, pause at the bottom, compare the two sides in the same frame rather than from memory.',
        means: 'That asymmetry is the finding worth reporting.' },
    ],
    dose: 'Three sets of 8, twice a week, on Session B. Progress the BOX height down before you progress the weight up — more range first, more load second. Three seconds down, one second up.',
    stop: 'Front-of-knee pain that builds rep to rep means the box is too low: raise it. Sharp pain, or pain that makes you stop mid-rep, ends the set. See knee.md.',
    holds: [{ kind: 'dumbbell', at: ['hand_l', 'hand_r'], axis: 'up', scale: 1.2 }],
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'tall', hold: 0.5,
        pose: { upperarm_l: { flex: 10, abd: 16 }, upperarm_r: { flex: 10, abd: 16 },
          forearm_l: { flex: 138 }, forearm_r: { flex: 138 } } },
      { t: 0.48, label: 'touching the box', hold: 1.3,
        pose: { pelvis: { flex: -4 }, thigh_l: { flex: 92, abd: 13, rot: 10 }, thigh_r: { flex: 92, abd: 13, rot: 10 },
          shin_l: { flex: 100 }, shin_r: { flex: 100 }, foot_l: { flex: 17, rot: 9 }, foot_r: { flex: 17, rot: 9 },
          lumbar_lower: { flex: 5 }, thorax_lower: { flex: 5 },
          upperarm_l: { flex: 14, abd: 16 }, upperarm_r: { flex: 14, abd: 16 },
          forearm_l: { flex: 140 }, forearm_r: { flex: 140 }, neck: { flex: -10 } },
        root: { rot: { flex: 24 } } },
      { t: 1, label: 'tall',
        pose: { upperarm_l: { flex: 10, abd: 16 }, upperarm_r: { flex: 10, abd: 16 },
          forearm_l: { flex: 138 }, forearm_r: { flex: 138 } } },
    ],
  },

  {
    id: 'band_pull_apart', name: 'Band pull-apart', category: 'control', duration: 6, loop: true,
    view: { az: 24, el: 8 }, areas: ['mid back', 'shoulder'], targets: ['shoulder', 'thoracic spine'],
    why: 'The highest-return exercise in the whole programme for how you want to look, and it adds no size at all. It trains the muscles that hold the shoulder blades back — which changes the shape of a slim frame more than muscle does.',
    cue: 'Arms straight, chest tall, pull the band apart until it touches your chest. Squeeze the shoulder blades together at the end and hold for a second.',
    watch: 'The shoulders creeping up towards the ears, and the ribs flaring so the low back arches.',
    setup: [
      'Hold a light band with both hands, arms straight out in front of you at chest height, hands about shoulder width apart.',
      'Use a LIGHTER band than feels right. This is a posture drill, not a strength lift.',
      'Stand tall, feet hip width, ribs down — imagine the front of your ribcage closing towards your hips.',
      'Film from the FRONT, and once from the SIDE to check the ribs.',
    ],
    steps: [
      'Start with arms straight out in front, band taut but not stretched.',
      'Keeping the elbows completely straight, pull your hands apart and out to the sides.',
      'Go until the band touches your chest and your arms make a wide letter T.',
      'At the end, squeeze the shoulder blades towards each other and HOLD for one full second.',
      'Return slowly over three seconds. Do not let the band snap your arms back.',
      'Keep your shoulders down and away from your ears throughout.',
    ],
    look: [
      { sign: 'The shoulders rising towards the ears',
        how: 'Front-on video: watch the gap between the top of your shoulder and your earlobe. It should not close as you pull.',
        means: 'The upper trapezius has taken over from the mid-back muscles you were aiming at — and that is the one muscle in this area that does add visible bulk at the top. Lighter band, shoulders down.' },
      { sign: 'The ribs flaring and the low back arching at the end',
        how: 'Side-on video. Your front rib cage should stay level; it should not tip up as your arms open.',
        means: 'The range is coming out of your spine rather than your shoulder blades. Keep the ribs down and stop the pull earlier.' },
      { sign: 'The elbows bending as you pull',
        how: 'Front-on video, pause at the widest point. Both arms should be straight lines.',
        means: 'Bending the elbows shortens the lever and makes it easier. Use a lighter band and keep them locked.' },
      { sign: 'Letting it snap back',
        how: 'Count three seconds on the return of every rep. If you cannot, the band is too strong.',
        means: 'The slow return is most of the benefit.' },
    ],
    dose: 'Three sets of 15, on Session B, and any time you have been at a desk for three hours. It is light enough to do daily and there is no reason not to.',
    stop: 'Front-of-shoulder pinching means you are pulling too far behind you — stop at the point where the band touches your chest. Neck ache means the shoulders rode up.',
    holds: [{ kind: 'band', from: 'hand_l', to: 'hand_r' }],
    from: 'standing', floor: 'balance',
    frames: [
      { t: 0, label: 'arms forward', hold: 0.6,
        pose: { upperarm_l: { flex: 84, abd: 6 }, upperarm_r: { flex: 84, abd: 6 },
          forearm_l: { flex: 10 }, forearm_r: { flex: 10 },
          clavicle_l: { flex: 18 }, clavicle_r: { flex: 18 } } },
      { t: 0.45, label: 'pulled apart', hold: 1.2,
        pose: { upperarm_l: { flex: 14, abd: 82, rot: 20 }, upperarm_r: { flex: 14, abd: 82, rot: 20 },
          forearm_l: { flex: 8 }, forearm_r: { flex: 8 },
          clavicle_l: { flex: -18, abd: -4 }, clavicle_r: { flex: -18, abd: -4 },
          thorax_upper: { flex: -5 } } },
      { t: 1, label: 'arms forward',
        pose: { upperarm_l: { flex: 84, abd: 6 }, upperarm_r: { flex: 84, abd: 6 },
          forearm_l: { flex: 10 }, forearm_r: { flex: 10 },
          clavicle_l: { flex: 18 }, clavicle_r: { flex: 18 } } },
    ],
  },

];
export const EXERCISE = (id) => EXERCISES.find((e) => e.id === id);
export const CATEGORIES = ['mobility', 'control', 'strength', 'test'];

/* -------------------------------------------------------------- player */
/** Remap normalised time so that frames carrying a `hold` dwell there. The
 *  holds are what make a demonstration legible: the eye needs a moment at
 *  each end of a rep to see what the end actually looks like. */
function timeline(ex) {
  const fr = ex.frames;
  const holds = fr.map((f) => f.hold || 0);
  const total = (ex.duration || 6) + holds.reduce((a, b) => a + b, 0);
  const segs = [];
  let acc = 0;
  for (let i = 0; i < fr.length; i++) {
    if (holds[i] > 0) { segs.push({ a: acc, b: acc + holds[i], from: i, to: i, hold: true }); acc += holds[i]; }
    if (i < fr.length - 1) {
      const dur = (fr[i + 1].t - fr[i].t) * (ex.duration || 6);
      segs.push({ a: acc, b: acc + dur, from: i, to: i + 1, hold: false });
      acc += dur;
    }
  }
  return { total, segs };
}

/** Sample an exercise at wall-clock second `time` into the cycle.
 *  Returns {pose, root, label, u} with the root re-solved so the figure keeps
 *  its feet on the floor through the whole movement. */
export function sampleExercise(skel, ex, time, { mirror = false } = {}) {
  const tl = ex._tl || (ex._tl = timeline(ex));
  const t = ((time % tl.total) + tl.total) % tl.total;
  const seg = tl.segs.find((s) => t < s.b) || tl.segs[tl.segs.length - 1];
  const u = seg.hold ? 0 : clamp((t - seg.a) / Math.max(1e-6, seg.b - seg.a), 0, 1);

  const base = baseOf(skel, ex);
  // a mirrored rep is supported by the other diagonal, so the contact and
  // plant lists have to flip with the pose
  const side = (n) => (!mirror ? n : n.endsWith('_l') ? n.slice(0, -2) + '_r' : n.endsWith('_r') ? n.slice(0, -2) + '_l' : n);
  const A = ex.frames[seg.from], B = ex.frames[seg.to];
  const mk = (f) => {
    let p = { ...clonePose(base.pose), ...clonePose(f.pose || {}) };
    return mirror ? mirrorPose(p) : p;
  };
  const e = easeHold(u);
  const pose = clampPose(skel, lerpPose(mk(A), mk(B), e));
  const rotA = (A.root && A.root.rot) || (ex.root && ex.root.rot) || base.rot || {};
  const rotB = (B.root && B.root.rot) || (ex.root && ex.root.rot) || base.rot || {};
  const rot = {
    flex: lerp(rotA.flex || 0, rotB.flex || 0, e),
    abd: lerp(rotA.abd || 0, rotB.abd || 0, e) * (mirror ? -1 : 1),
    rot: lerp(rotA.rot || 0, rotB.rot || 0, e) * (mirror ? -1 : 1),
  };
  // Only a figure that is standing on its feet has feet to keep flat. On
  // hands and knees, or lying down, "plant the feet on the floor" is not a
  // helpful constraint — it is a wrong one. And a foot the movement itself is
  // animating is never planted: a calf raise is exactly a heel leaving the
  // floor.
  const plant = (ex.plant || base.plant || (base.floor === 'balance' ? ['foot_l', 'foot_r'] : null) || [])
    .map(side)
    .filter((n) => !(A.pose && A.pose[n]) && !(B.pose && B.pose[n]));
  // A lying exercise keeps the orientation its starting posture settled into,
  // fixed for the whole rep. Re-running the settle search every frame would
  // both cost more than the rest of the app put together and let the figure
  // drift as the search found a different minimum halfway through a rep.
  const contacts = (ex.contacts || base.contacts || null) && (ex.contacts || base.contacts).map(side);
  const frozen = base.q && !contacts && !A.root && !B.root && !ex.root;
  const anchor = ex.anchor && side(ex.anchor);
  const placed = place(skel, pose, {
    rot, q: frozen ? base.q : null, floor: contacts ? 'contacts' : (ex.floor || base.floor || 'drop'),
    plant: plant.length ? plant : null, contacts,
    span: 26,      // wide enough that three contacts can actually be levelled
    lift: ex.lift || 0,
    anchor, anchorAt: anchor ? anchorPoint(skel, ex, mirror, anchor) : null,
    anchorSpan: ex.anchorSpan,
  });
  let { pose: outPose, root: outRoot } = placed;
  // A hand on the floor stays on the floor. Rounding the mid-back in cat-cow
  // lifts the shoulder girdle, and with it the whole arm, so without this the
  // figure demonstrates the movement while quietly floating its hands nine
  // centimetres above the ground. Placement can only rotate the body; keeping
  // a limb where it was put is what IK is for.
  const pins = ex.pin && ex.pin.map(side);
  if (pins && pins.length) {
    const anchors = pinAnchors(skel, ex, mirror);
    for (const name of pins) {
      const tgt = anchors[name];
      if (!tgt) continue;
      outPose = solveIK(skel, outPose, outRoot, {
        grab: { bone: name, local: [0, 0, 0] }, target: tgt, iterations: 10, maxStep: 14,
        stopAt: ex.pinStop,
      });
    }
    // Re-seat afterwards. With an anchor that means putting the anchored part
    // back on the floor, NOT dropping the whole figure onto whatever is now
    // lowest — dropping is the thing the anchor exists to stop.
    if (anchor) {
      const F2 = solveFrames(skel, outPose, outRoot);
      const low = segmentLowZ(skel.byName.get(anchor), F2.get(anchor));
      outRoot = { q: outRoot.q, p: [outRoot.p[0], outRoot.p[1], outRoot.p[2] - low + (ex.lift || 0)] };
    } else {
      outRoot = standOnFloor(skel, outPose, outRoot);
    }
  }
  // last word, after the pins and the re-seat: nothing through the floor
  {
    const low = lowestPoint(skel, solveFrames(skel, outPose, outRoot));
    if (low < -1e-6) outRoot = { q: outRoot.q, p: [outRoot.p[0], outRoot.p[1], outRoot.p[2] - low] };
  }
  return { pose: outPose, root: outRoot, label: (seg.hold ? A : (u < 0.5 ? A : B)).label, u: t / tl.total, cycle: tl.total };
}

/** Where the anchored part sits in the exercise's own first frame. Worked out
 *  once, with the anchoring switched off so the first frame is placed the
 *  ordinary way, then held for the whole repetition. */
function anchorPoint(skel, ex, mirror, anchor) {
  const key = mirror ? '_anchorM' : '_anchor';
  if (ex[key]) return ex[key];
  const saved = ex.anchor; ex.anchor = null;
  const s = sampleExercise(skel, ex, 0, { mirror });
  ex.anchor = saved;
  ex[key] = solveFrames(skel, s.pose, s.root).get(anchor).x.p;
  return ex[key];
}

/** Where each pinned segment sits in the exercise's own first frame — worked
 *  out once, then held for the whole rep. */
function pinAnchors(skel, ex, mirror) {
  const cacheKey = mirror ? '_pinM' : '_pin';
  if (ex[cacheKey]) return ex[cacheKey];
  const saved = ex.pin; ex.pin = null;                  // sample frame 0 unpinned
  const s = sampleExercise(skel, ex, 0, { mirror });
  ex.pin = saved;
  const F = solveFrames(skel, s.pose, s.root);
  const out = {};
  const side = (n) => (!mirror ? n : n.endsWith('_l') ? n.slice(0, -2) + '_r' : n.endsWith('_r') ? n.slice(0, -2) + '_l' : n);
  for (const n of saved) out[side(n)] = F.get(side(n)).x.p;
  ex[cacheKey] = out;
  return out;
}

function baseOf(skel, ex) {
  if (ex._base) return ex._base;
  let out;
  if (typeof ex.from === 'string') {
    const p = POSTURE(ex.from);
    if (p) {
      const mode = p.floor || (p.group === 'lying' ? 'settle' : 'balance');
      // Anything that is not standing on its feet keeps the orientation its
      // starting posture settled into, held fixed for the whole rep. Solving
      // it afresh every frame both costs more than the rest of the app and
      // lets the figure drift as the search finds a different answer halfway
      // through a repetition.
      out = {
        pose: clonePose(p.pose || {}), rot: (p.root && p.root.rot) || {},
        floor: mode === 'balance' ? 'balance' : 'drop',
        contacts: p.contacts, plant: p.plant,
        q: mode === 'balance' ? null : posturePlacement(skel, p).root.q,
      };
    } else out = { pose: {}, rot: {}, floor: 'balance' };
  } else {
    out = { pose: clonePose((ex.from && ex.from.pose) || {}), rot: (ex.from && ex.from.rot) || {}, floor: (ex.from && ex.from.floor) || 'balance' };
  }
  ex._base = out;
  return out;
}
/** The still frame an exercise starts from — what the card shows. */
export function exerciseStart(skel, ex, opts) { return sampleExercise(skel, ex, 0, opts); }

export class Player {
  constructor() {
    this.ex = null; this.t = 0; this.playing = false;
    this.speed = 1; this.mirror = false; this.label = '';
  }
  load(ex, { mirror = false } = {}) {
    this.ex = ex; this.t = 0; this.mirror = mirror; this.playing = !!ex;
    return this;
  }
  stop() { this.ex = null; this.playing = false; this.t = 0; }
  toggle() { if (this.ex) this.playing = !this.playing; }
  /** @returns true when the pose changed and the scene needs redrawing */
  advance(dt) {
    if (!this.ex || !this.playing) return false;
    this.t += dt * this.speed;
    return true;
  }
  sample(skel) {
    if (!this.ex) return null;
    const s = sampleExercise(skel, this.ex, this.t, { mirror: this.mirror });
    this.label = s.label || '';
    this.cycle = s.cycle;
    return s;
  }
  /** 0..1 through the current cycle, for the scrub bar. */
  progress() {
    if (!this.ex) return 0;
    const tl = this.ex._tl || (this.ex._tl = timeline(this.ex));
    return ((this.t % tl.total) + tl.total) % tl.total / tl.total;
  }
  seek(frac) {
    if (!this.ex) return;
    const tl = this.ex._tl || (this.ex._tl = timeline(this.ex));
    this.t = clamp(frac, 0, 1) * tl.total;
  }
}

/** Validate an exercise that arrived from the agent rather than from this
 *  file. Anything malformed is rejected with a reason rather than half-loaded
 *  — a demonstration that is subtly wrong is worse than none. */
export function validateExercise(raw, skel) {
  const errs = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errs: ['not an object'] };
  if (!raw.name) errs.push('missing name');
  if (!Array.isArray(raw.frames) || raw.frames.length < 2) errs.push('needs at least two frames');
  const known = (n) => skel.byName.has(n);
  for (const f of raw.frames || []) {
    if (typeof f.t !== 'number' || f.t < 0 || f.t > 1) errs.push(`frame t must be 0..1, got ${f.t}`);
    for (const j in (f.pose || {})) if (!known(j)) errs.push(`unknown joint "${j}"`);
  }
  if (raw.from && typeof raw.from === 'string' && !POSTURE(raw.from)) errs.push(`unknown starting posture "${raw.from}"`);
  if (errs.length) return { ok: false, errs };
  const ex = {
    id: raw.id || 'agent_' + Math.random().toString(36).slice(2, 7),
    name: raw.name, category: raw.category || 'mobility',
    duration: clamp(raw.duration || 6, 1.5, 30), loop: raw.loop !== false, mirror: !!raw.mirror,
    targets: raw.targets || [], areas: raw.areas || [], why: raw.why || '', cue: raw.cue || '', watch: raw.watch || '',
    // the verbose half: how to set up, the movement in order, and each
    // observable fault with a way of actually seeing it
    setup: Array.isArray(raw.setup) ? raw.setup : null,
    steps: Array.isArray(raw.steps) ? raw.steps : null,
    look: Array.isArray(raw.look) ? raw.look.filter((o) => o && o.sign) : null,
    dose: raw.dose || '', stop: raw.stop || '',
    props: raw.props, holds: raw.holds, view: raw.view, contacts: raw.contacts, anchor: raw.anchor, lift: raw.lift,
    from: raw.from || 'standing', floor: raw.floor, plant: raw.plant, root: raw.root,
    frames: raw.frames.slice().sort((a, b) => a.t - b.t),
    fromAgent: true,
  };
  return { ok: true, ex };
}
