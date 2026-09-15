/* daydata.js — the written plan, as data a page can render for TODAY.
 *
 * `profile/plan.md` is the document: it argues, it justifies, it is meant to
 * be read once and revisited monthly. This file is the same plan in the shape
 * a phone needs at 06:40 on a Wednesday — no argument, no justification, just
 * what today is.
 *
 * The two must not drift. When plan.md changes, this changes with it, and the
 * `source` field on each block says which section of the document it came
 * from so the correspondence can be checked rather than trusted.
 *
 * NO THREE.JS, NO DOM, NO IMPORTS. This is plain data and a pure function of
 * the date, so selftest.mjs can assert what a given Tuesday looks like under
 * bare node. The renderer is day.js; it knows nothing about the plan.
 */

/* The programme started on Monday 14 September 2026 — week 1, day 1. Weeks are
 * counted from there, and the phase follows from the week number. */
export const PROGRAMME = {
  start: '2026-09-14',
  wake: '06:00',
  bed: '22:45',
  coffeeCutoff: '14:00',
  lunch: '12:30',
  subject: { H: 185, mass: 70.5, waist: 87 },
};

/* THE HOUR.
 *
 * 06:00-07:00, defended. This replaced an eight-minute anchor and three gym
 * sessions a week, which was a programme designed for somebody whose problem
 * was getting started. That was the wrong read: the constraint was time in the
 * day, not willpower, and an hour has now been carved out for it.
 *
 * What did NOT change is the thing the old plan was actually right about — you
 * cannot build on 1,600 kcal. Training harder on the same intake buys fatigue,
 * not muscle. The food and the training move together now rather than in
 * sequence. */
export const HOUR = {
  window: '06:00-07:00',
  shape: [
    { at: '06:00', mins: 6, what: 'Warm-up', why: 'Six minutes. Not optional before a loaded session — it is what lets you use the range you have.' },
    { at: '06:06', mins: 38, what: 'The session', why: 'The part that builds anything. Rest 90 seconds between sets and do not skip the rest — the rest is what makes the next set hard enough to count.' },
    { at: '06:44', mins: 10, what: 'Conditioning or walk', why: 'Easy. Nose-breathing pace on the treadmill, or stairs. This is for the heart, not the legs.' },
    { at: '06:54', mins: 6, what: 'Down, and log it', why: 'Two minutes of breathing, then `node health.mjs log` while the kettle boils. Thirty seconds of typing is what turns the next month of data into findings.' },
  ],
};

/* Weeks 1-2 ramp the VOLUME, not the commitment. Tendon and connective tissue
 * adapt more slowly than muscle does, and the injuries that end a restart
 * happen in week three to a person who felt fine in week one. Two sets where
 * the programme says four, same exercises, same mornings. That is the only
 * difference. */
export const PHASES = [
  {
    id: 'ramp', name: 'Ramp', from: 1, to: 2, gym: true, sets: 'two sets of everything, not four',
    headline: 'Full programme, half the volume. Tendons lag muscle by weeks.',
    focus: [
      'The hour, every weekday. 06:00-07:00.',
      'Eat lunch. Every working day. This is what makes the training work.',
      'Two sets of everything, not four. You will feel able to do more. Do not.',
    ],
    note: 'Buy the bands and the adjustable dumbbells this week — see the kit list. Without them the sessions run out of load by about week four.',
  },
  {
    id: 'build', name: 'Build', from: 3, to: 12, gym: true, sets: 'full sets',
    headline: 'Full volume. Add a repetition before you add weight.',
    focus: [
      'Three strength sessions, two easy days, every week.',
      'A palm of protein at four meals. Four or five palms a day.',
      'Log the top set of every lift. Progress you cannot see does not motivate anybody.',
    ],
    note: 'If the scale has not moved up in six weeks, you are not eating enough. That is the likely failure mode here, and it is the one that makes training feel pointless.',
  },
  {
    id: 'press', name: 'Press', from: 13, to: 9999, gym: true, sets: 'full sets, heavier',
    headline: 'Twelve weeks in. The stretch goals are now the programme.',
    focus: [
      'Pick two stretch goals and train for them specifically.',
      'Re-test the battery properly. Numbers, not impressions.',
      'Reassess the whole plan against what the instruments said.',
    ],
    note: 'By here the question stops being "am I doing it" and becomes "is it working". That is what the monthly battery and the CGM block are for.',
  },
];

/* --------------------------------------------------------------- training */

/** Six minutes. The same every time, so it needs no thought at 06:00. */
export const WARMUP = {
  id: 'warmup', name: 'Warm-up', mins: 6,
  why: 'Not a stretch routine. This raises tissue temperature, opens the hips that a desk closes all day, and wakes up the glutes and the mid-back so the session uses them instead of your low back.',
  items: [
    { ex: 'cat_cow', label: 'Cat-cow', dose: '8 slow cycles' },
    { ex: 'hip_flexor_stretch', label: 'Half-kneeling hip flexor', dose: '45 s each side',
      note: 'Nine hours of sitting is what this undoes.' },
    { ex: 'glute_bridge', label: 'Glute bridge', dose: '15, squeezing at the top' },
    { ex: 'band_pull_apart', label: 'Band pull-apart', dose: '15' },
  ],
};

/* THREE STRENGTH SESSIONS, and they are the point of the hour.
 *
 * Selection is still steered by the look: slim, not broad. No overhead press,
 * no lateral raises, no wide-grip vertical pulling, no heavy bench — those
 * four build the shoulder-and-chest frame that was explicitly ruled out.
 *
 * Everything else is on the table, and now carries real load. Four sets rather
 * than three, a rep target with a REPS-IN-RESERVE stop rather than a round
 * number, and double progression: add a repetition before you add weight, and
 * when the top of the range is hit on every set, put the weight up and start
 * again at the bottom. That is what makes a home gym build strength rather
 * than maintain it. */
export const SESSIONS = {
  A: {
    id: 'A', name: 'Session A', day: 'Monday', length: '38 min', theme: 'Squat and push',
    why: 'The heaviest day. Knee-dominant legs, horizontal push, horizontal pull.',
    items: [
      { ex: 'goblet_squat', label: 'Goblet squat to a box', dose: '4 x 8', knee: true, log: true,
        note: 'The box sets the depth in advance, which is what a sore knee needs. Progress the box DOWN before the weight up.' },
      { ex: 'push_up', label: 'Push-up', dose: '4 sets, stopping 2 reps short of failure', log: true,
        note: 'When 15 clean reps is easy, slow the lowering to 4 seconds, then elevate the feet. Do not add a weighted vest — that is how you get the chest you said you did not want.' },
      { ex: 'bent_row', label: 'Row to the low chest', dose: '4 x 10-12', log: true,
        note: 'The heaviest pull of the week. Elbows tucked, to the low chest, never wide.' },
      { ex: 'sl_rdl', label: 'Single-leg Romanian deadlift', dose: '3 x 8 each side', knee: true, log: true },
      { ex: 'calf_raise', label: 'Single-leg calf raise', dose: '3 x 15 each side' },
      { ex: 'front_plank', label: 'Front plank', dose: '3 x 45 s' },
    ],
  },
  B: {
    id: 'B', name: 'Session B', day: 'Wednesday', length: '38 min', theme: 'Hinge and posture',
    why: 'Hip-dominant. The day that does the most for the waist-to-hip line and for how a slim frame carries itself.',
    items: [
      { ex: 'hip_hinge_drill', label: 'Romanian deadlift', dose: '4 x 8', knee: true, log: true,
        note: 'The animation shows the hinge unloaded. The RDL is this with a dumbbell in each hand. Hips back, back flat, no deep knee bend.' },
      { ex: 'glute_bridge', label: 'Hip thrust', dose: '4 x 12', log: true,
        note: 'Shoulders on the sofa edge, weight across the hips. This is the strongest lift you own and it should feel like it.' },
      { ex: 'bent_row', label: 'Row, lighter and slower', dose: '3 x 15, three seconds down', log: true },
      { ex: 'band_pull_apart', label: 'Band pull-apart', dose: '3 x 20',
        note: 'Highest-return item in the whole programme for the look you want, and it adds no size at all.' },
      { ex: 'side_plank', label: 'Side plank', dose: '3 x 35 s each side' },
      { ex: 'dead_bug', label: 'Dead bug', dose: '3 x 10 each side' },
    ],
  },
  C: {
    id: 'C', name: 'Session C', day: 'Friday', length: '38 min', theme: 'Single leg and trunk',
    why: 'Everything on one leg. This is where the knee case actually gets fixed, and single-leg work builds the legs without building anything that reads as bulk.',
    items: [
      { ex: 'split_squat', label: 'Split squat', dose: '4 x 8 each side', knee: true, log: true,
        note: 'Rear foot on the sofa once 4 x 8 flat is easy. That progression is worth more than added weight.' },
      { ex: 'step_down', label: 'Step-down', dose: '3 x 8 each side', knee: true, log: true,
        note: 'Also the diagnostic. Film the left one from the front every few weeks and watch the kneecap.' },
      { ex: 'sl_bridge', label: 'Single-leg hip thrust', dose: '3 x 12 each side', log: true },
      { ex: 'push_up', label: 'Push-up, slow', dose: '3 sets, 4 seconds down' },
      { ex: 'bird_dog', label: 'Bird dog', dose: '3 x 8 each side' },
      { ex: 'curl_up', label: 'Curl-up', dose: '3 x 8' },
    ],
  },
};

/** Tuesday and Thursday. Not rest days — the hour still happens, it is just
 *  not loaded. Movement quality, the knee work, and enough easy aerobic work
 *  to move the number that actually tracks fitness. */
export const EASY = {
  id: 'easy', name: 'Easy day', length: '45 min', theme: 'Mobility, knee work, and easy aerobic',
  why: 'Recovery is not the absence of training. These two days are where the hips get their range back, the knee work happens without competing with heavy legs, and the aerobic base gets built — which is the single biggest driver of how much energy an ordinary day costs you.',
  items: [
    { ex: 'cat_cow', label: 'Cat-cow', dose: '8 cycles' },
    { ex: 'thread_needle', label: 'Thread the needle', dose: '6 each side' },
    { ex: 'hip_flexor_stretch', label: 'Half-kneeling hip flexor', dose: '60 s each side' },
    { ex: 'figure_four', label: 'Figure-4 stretch', dose: '60 s each side' },
    { ex: 'side_lying_abd', label: 'Side-lying hip abduction', dose: '3 x 15 each side', knee: true,
      note: 'The hip control behind the front-of-knee pain. This is why it is here twice a week.' },
    { ex: 'wall_sit', label: 'Wall sit', dose: '3 x 45 s', knee: true },
    { ex: 'prone_ytw', label: 'Prone Y and T raises', dose: '2 x 8 of each' },
  ],
  after: '25 minutes easy on the treadmill or outside. Nose-breathing pace — if you cannot hold a conversation, it is too fast. This is zone 2 and it is supposed to feel too easy.',
};

/** What day is what. Five mornings loaded or easy, Saturday long and outdoors
 *  if the weather allows, Sunday genuinely off. */
export const WEEK = {
  1: { session: 'A' }, 3: { session: 'B' }, 5: { session: 'C' },
  2: { easy: true }, 4: { easy: true },
  6: { easy: true, note: 'Saturday: take it outside if Taipei allows. A long walk with your daughter counts and counts double.' },
  0: { rest: true, note: 'Sunday off. Read the week back: `node health.mjs report`.' },
};

export function sessionFor(week, weekday) {
  const d = WEEK[weekday];
  return d && d.session ? d.session : null;
}

/* ------------------------------------------------------------- the desk ---
 * The walking treadmill is probably worth more for the waist than the gym is,
 * and it costs no time at all — which makes it the only part of this plan with
 * no trade-off against anything. */
export const TREADMILL = {
  name: 'The desk treadmill',
  why: 'You sit for nine hours. Chronic under-eating quietly suppresses spontaneous movement, so the deficit is probably worse than it looks — and walking is the one form of activity that adds nothing to recovery debt, so it never competes with the strength work.',
  target: 'Three blocks of 30 minutes a day, 3.5-4.5 km/h. About 6,000-8,000 extra steps, and 200-300 kcal you were not spending.',
  when: [
    'Morning calls you are listening on rather than presenting.',
    'The hour after lunch, which is also when the glucose curve most wants it.',
    'Any reading or review block.',
  ],
  rules: [
    'Walk during INPUT, not output. Typing at 4 km/h is how people decide the treadmill does not work.',
    'Slow is the point. This is not exercise and it must not feel like it — if you finish a block breathing hard, it competed with the session.',
    'Shoes on. Barefoot treadmill walking for three hours a day is how you find out about plantar fascia.',
  ],
  check: 'The ring counts the steps. A month of treadmill days against a month without settles whether it is worth it, and `node health.mjs experiments` will show it in the lunch comparison too.',
};

/* ---------------------------------------------------------------- goals ---
 * Stretch goals, because "get stronger" is not a target and cannot be missed.
 * Every one of these is measurable, none of them requires getting bigger, and
 * all of them are reachable inside six months from where you are. */
export const STRETCH_GOALS = [
  { id: 'pushup', horizon: '3 months', what: '20 clean push-ups in one set',
    now: 'unmeasured — do it on the first battery', why: 'The simplest honest measure of upper-body strength you own, and it needs no equipment anywhere in the world.' },
  { id: 'split', horizon: '6 months', what: 'Rear-foot-elevated split squat, 4 x 8 each side with 2 x 12 kg',
    now: 'body weight, flat', why: 'The single best legs-and-glutes lift that does not need a barbell. Reaching this is a genuinely strong pair of legs.' },
  { id: 'plank', horizon: '3 months', what: 'A 90-second front plank with the line held',
    now: '3 x 45 s', why: 'Trunk endurance, and the thing that protects your low back when everything else gets heavier.' },
  { id: 'hinge', horizon: '6 months', what: 'Romanian deadlift 4 x 8 with 2 x 20 kg',
    now: 'unloaded pattern', why: 'Posterior chain. This is the lift that changes the shape of a slim frame more than any other.' },
  { id: 'balance', horizon: '3 months', what: '45 seconds single-leg stance, eyes closed, both sides equal',
    now: 'unmeasured', why: 'Ankle, hip and nervous system together. It is also the cleanest early signal that the knee case is resolved.' },
  { id: 'hrr', horizon: '6 months', what: 'Heart-rate recovery above 30 beats in the first minute',
    now: 'unmeasured', why: 'The best single "am I fitter" number you will have, and the one that tracks how much an ordinary day costs you.' },
  { id: 'rhr', horizon: '6 months', what: 'Resting heart rate below 55',
    now: 'unmeasured — the ring will say within a week', why: 'Aerobic base. Falls slowly and only with consistent easy work, which is what the treadmill and the easy days are for.' },
  { id: 'waist', horizon: '6 months', what: 'Waist 83 cm at 74 kg',
    now: '87 cm at 70.5 kg', why: 'The whole aesthetic goal in two numbers: heavier and narrower at the same time. That combination is only possible if the weight gained is muscle.' },
];

/* ------------------------------------------------------------------ kit ---
 * In order. The first two are the difference between a programme that builds
 * something and one that runs out of load in a month. */
export const KIT = [
  { what: 'Resistance bands with a door anchor', cost: 'about NT$600', have: false,
    why: 'Still unbought, and now blocking: the rows in every session need them. Weigh nothing, fit in a suitcase, and make the travel weeks trainable instead of written off.' },
  { what: 'Adjustable dumbbells, to at least 20 kg each', cost: 'NT$3,000-6,000', have: false,
    why: 'THE unlock. One 4.5 kg dumbbell cannot load a squat, a hinge or a row past about week three. A pair of adjustables makes the gym optional, which also solves the travel problem and the "no time to get there" problem in one purchase. Cheaper than a year of membership.' },
  { what: 'A sturdy box or bench, 40-45 cm', cost: 'you may already own one', have: false,
    why: 'Goblet squat depth, step-downs, hip thrusts, rear-foot-elevated split squats. A firm sofa arm or a dining chair against a wall will do to start.' },
  { what: 'Gym membership', cost: 'ongoing', have: false,
    why: 'Now optional rather than central. Worth it if you enjoy going; not required by anything in this programme. Decide after the dumbbells arrive, not before.' },
];

/* ------------------------------------------------------------------ eating */

/** The day's food, as a timeline. Weekdays and weekends differ in exactly one
 *  place and it is the important one: on a working day the office has already
 *  bought lunch, so lunch is a calendar problem. At the weekend nobody has,
 *  so it is a decision that has to be made in advance or it does not happen. */
export function meals(kind) {
  const office = kind === 'work';
  return [
    { at: '07:00', id: 'breakfast', what: 'Breakfast — eggs, or the protein milk',
      detail: 'Three eggs, or the protein milk you already buy, or both. Roughly 30 g of protein.',
      why: 'You currently eat nothing until the evening. This is the first of four protein hits, and the one that is missing entirely today.',
      kcal: 400, protein: 30, key: false },
    { at: PROGRAMME.lunch, id: 'lunch',
      what: office ? 'LUNCH — eat the one the office bought' : 'LUNCH — order it or make it',
      detail: office
        ? 'The food is there and it is already paid for. What is missing is fifteen minutes. Defend the block like a meeting. If it is mostly rice or noodles, add a protein to it.'
        : 'No office lunch today, so it will not happen by itself. Decide at breakfast what lunch is, and order it before midday if it is coming from outside.',
      why: 'The biggest single change available, and it costs nothing. This one meal is most of the gap between the intake you have and the intake the training needs.',
      kcal: 750, protein: 38, key: true },
    { at: PROGRAMME.coffeeCutoff, id: 'coffee', what: 'Last coffee of the day',
      detail: 'Caffeine has a five-to-six-hour half-life. A cup at 17:30 leaves about half of it circulating at bedtime — a strong espresso\u2019s worth, on board as you try to sleep.',
      why: 'The cheapest available win, and you will not notice the sleep it is costing you.',
      kcal: 0, protein: 0, key: true, cutoff: true },
    { at: '15:30', id: 'afternoon', what: 'Protein shake, and nuts if you want them',
      detail: 'You already do this one. Keep it exactly as it is — it is the easiest 28 g in the day.',
      why: 'The third of four protein hits. One meal a day is one stimulus a day; four is four, and it is the number of stimuli that builds tissue rather than the daily total alone.',
      kcal: 350, protein: 28, key: false },
    { at: '18:00', id: 'dinner', what: 'Dinner with your daughter',
      detail: 'A real palm-sized portion of meat, fish, eggs or tofu — not just whatever happens to be left in the fridge.',
      why: 'This is the meal you already eat. The change is that it has a deliberate protein portion in it rather than being whatever the fridge offers.',
      kcal: 750, protein: 34, key: false },
    { at: '20:30', id: 'evening', what: 'Evening snack, if hungry',
      detail: 'Fine, and planned for. This is also the FIRST thing to cut if the waist starts climbing — not the lunch, and not the breakfast.',
      why: 'The adjustable one. Everything above it is load-bearing; this is the dial.',
      kcal: 250, protein: 5, key: false },
  ];
}

/** What the meal timeline adds up to. Kept as a function rather than a
 *  constant so it cannot drift from the meals themselves. */
export function intakeOf(kind) {
  const ms = meals(kind);
  return {
    kcal: ms.reduce((a, m) => a + (m.kcal || 0), 0),
    protein: ms.reduce((a, m) => a + (m.protein || 0), 0),
  };
}

export const NUTRITION = {
  protein: '115-140 g a day',
  portions: 'A palm-sized piece of meat or fish is about 25-30 g. You need four or five of those a day, or their equivalent.',
  calories: '+300-500 kcal above where you are now, which lunch very nearly provides on its own.',
  expect: '0.25-0.5 kg a month of gain. Faster than that is fat, not muscle.',
  takeout: 'Takeout every other day is fine and what you order is already reasonable. Taiwanese takeout is carb-forward — ADD a protein to the order rather than replacing the order.',
};

/* ----------------------------------------------------------------- travel */

export const TRAVEL = {
  keep: [
    'The 8-minute anchor. It works in any hotel room.',
    'The bands.',
    'The walking.',
    'The protein floor — four palms, whatever else the day looks like.',
  ],
  drop: [
    'The gym sessions. Deliberately. Trying to hold three sessions a week together across a time-zone shift and failing is what turns one bad week into a month off.',
  ],
  arrive: [
    'Get outside into daylight during the destination’s morning.',
    'Put your meals onto destination time immediately, even when you are not hungry.',
  ],
  home: ['Anchor on day one. Gym on day three. Do not try to make up the missed sessions.'],
};

/* ----------------------------------------------------------------- checks */

export const GUARDRAILS = [
  { id: 'waist', label: 'Waist at the navel', target: '87 cm and falling',
    note: 'The win condition. Waist-to-height 0.47 today; 83 cm is the lean mark.' },
  { id: 'weight', label: 'Weight', target: 'up 0.25-0.5 kg a month, to a ceiling of about 75 kg',
    note: 'Not moving up after six weeks means you are not eating enough.' },
  { id: 'shoulder', label: 'Shoulder circumference', target: 'unchanged',
    note: 'The guardrail on the look. More than about 1 cm in three months means cut the pressing volume — not the food.' },
  { id: 'chest', label: 'Chest at the nipple line', target: 'unchanged',
    note: 'Same rule as the shoulders.' },
];

export const KNEE = {
  status: 'Patellofemoral pain, left. Tender under the edges of the kneecap; no locking, no swelling, no giving way. Ankle ruled out (knee-to-wall 14 cm left, 15 cm right).',
  rule: 'Nothing below a pain-free depth, and no deep-flexion loading until it settles.',
  open: 'The step-down findings are still outstanding — film one set from the front and report what the left kneecap does against the line from hip to ankle.',
  exercises: ['step_down', 'knee_to_wall', 'side_lying_abd', 'wall_sit'],
};

export const TESTS = {
  when: 'First Sunday of the month',
  why: 'Monthly HRV is noise — Oura is the HRV instrument. This battery is for the things that genuinely move on a monthly scale.',
  items: [
    'Waist, shoulder and chest circumference. Same time of day, breathed out, relaxed.',
    'Weight.',
    'Resting heart rate, lying, five minutes settled (Polar H10).',
    'Orthostatic test — five minutes lying, then stand, three minutes.',
    'Heart-rate recovery at 60 seconds after a hard three-minute effort.',
    'Push-ups to two-short-of-failure: the number.',
    'Single-leg stance, eyes closed, both sides: the seconds.',
  ],
};

/* ----------------------------------------------------------------- energy
 *
 * The question this answers is the one that gets asked standing on a scale,
 * not in a gym: "I have started eating the way you said. Where does that put
 * me in a month, and am I just getting fatter?"
 *
 * EVERYTHING HERE IS AN ESTIMATE AND THE UI SAYS SO. Three of the four inputs
 * are predictions rather than measurements:
 *
 *   - BMR is Mifflin-St Jeor, the least-bad equation for somebody who has
 *     never had a DEXA. It is driven by total mass and knows nothing about
 *     composition, so at low muscle mass it reads a little high.
 *   - The activity multiplier is a convention.
 *   - The kcal on each meal are portion estimates. Nothing is weighed, and
 *     prescribing weighing would not survive contact with this schedule.
 *
 * What is NOT an estimate is the direction of travel, and that is what the
 * projection is for. The scale over three weeks is the instrument; this is
 * the prior it updates.
 *
 * THE UNDER-REPORTING PROBLEM, which is the whole reason this section exists.
 * plan.md records intake as "1,500-1,700 kcal" and reads a stable weight as
 * proof that this is maintenance. That inference does not survive contact
 * with the arithmetic: predicted BMR alone is ~1,690. Sustained maintenance
 * BELOW resting metabolic rate is not a thing outside semi-starvation, and a
 * weight-stable man at BMI 20.5 is not in semi-starvation. The estimate is
 * simply low — recalled intake under-counts by 20-30% in every validation
 * study there is, and more in people who do not track. Real current intake is
 * almost certainly 2,200-2,400. That single correction changes the whole
 * reading: the metabolism is not broken, the record was.
 */

/** Mifflin-St Jeor, male. */
export function bmrOf({ mass, height, age }) {
  return Math.round(10 * mass + 6.25 * height - 5 * age + 5);
}

/** kcal for `mins` at `met`, NET of what sitting would have cost anyway.
 *  Net rather than gross because the alternative to a treadmill block is not
 *  lying down, it is sitting at the same desk — and gross numbers are how
 *  fitness trackers end up promising people a second dinner. */
export function kcalOf(mins, met, mass, { rest = 1.3 } = {}) {
  return Math.round(mins * Math.max(0, met - rest) * 3.5 * mass / 200);
}

const M = PROGRAMME.subject.mass;

export const ENERGY = {
  age: 35,
  mass: M,
  /** ~1,690. The floor: what the body spends doing nothing at all. */
  bmr: bmrOf({ mass: M, height: PROGRAMME.subject.H, age: 35 }),
  /** Sedentary desk work, no deliberate exercise. A convention, not a reading. */
  pal: 1.35,
  /** 30 min at 3.5-4.5 km/h ~ 3.0 MET, net of sitting. */
  treadmillBlock: kcalOf(30, 3.0, M),
  treadmillBlocks: 3,
  hour: {
    warmup: kcalOf(6, 3.3, M),
    /** Resistance work with 90 s rests ACTUALLY TAKEN averages far lower than
     *  people expect — the rests are most of the session. */
    session: kcalOf(38, 4.5, M),
    conditioning: kcalOf(10, 4.0, M),
    /** Tuesday and Thursday: mobility, then 25 min of nose-breathing walk. */
    easyMobility: kcalOf(20, 3.0, M),
    easyWalk: kcalOf(25, 3.5, M),
  },
  /** Excess post-exercise oxygen consumption. Real, and small enough at this
   *  intensity to be inside the error bars of everything else here. Named so
   *  that leaving it out is a decision rather than an oversight. */
  epoc: 0,
};

/** Baseline burn before anything deliberate: BMR carried through a desk day. */
export const BASELINE_BURN = Math.round(ENERGY.bmr * ENERGY.pal);

/** What one day of the plan spends, split so the parts are arguable. */
export function burnOf(plan) {
  const E = ENERGY;
  const hour = plan.session
    ? E.hour.warmup + E.hour.session + E.hour.conditioning
    : plan.easy
      ? E.hour.easyMobility + E.hour.easyWalk
      : 0;
  // The treadmill is a DESK object. It earns its keep on days spent at the
  // desk and is simply not there at the weekend, which is why Saturday and
  // Sunday burn measurably less than a working day even when Saturday trains.
  const blocks = plan.workday && !plan.travel ? E.treadmillBlocks : 0;
  const walk = blocks * E.treadmillBlock;
  return {
    baseline: BASELINE_BURN,
    hour, walk, blocks,
    total: BASELINE_BURN + hour + walk,
  };
}

/** The seven-day average, which is the only burn figure worth comparing an
 *  intake against — a single Monday is not a diet. Computed over a real week
 *  of the programme rather than asserted, so it cannot drift from WEEK. */
export function weeklyBurn(week = 3) {
  let total = 0;
  for (let wd = 0; wd < 7; wd++) {
    const slot = WEEK[wd] || {};
    total += burnOf({
      session: slot.session ? SESSIONS[slot.session] : null,
      easy: !!slot.easy, rest: !!slot.rest,
      workday: wd >= 1 && wd <= 5, travel: false,
    }).total;
  }
  return Math.round(total / 7);
}

/* ------------------------------------------------------------- projection
 *
 * WHY THIS IS NOT surplus / 7700.
 *
 * That arithmetic over-predicts change by roughly double, and it does it for
 * one reason: it holds non-exercise activity constant. NEAT is the single most
 * variable component of daily expenditure — it swings by hundreds of kcal
 * between people of the same size, and it moves WITH intake. Eat more and you
 * fidget, stand, walk and gesture more, mostly without noticing. Eat less and
 * you go still. That is most of what "my metabolism slowed down" actually
 * describes, and it is the part that comes back when the food does.
 *
 * So these rates are outcome-calibrated rather than balance-derived: what a
 * detrained-but-previously-trained 35-year-old starting resistance training at
 * ~1.9 g/kg of protein actually does over eight weeks. The lean rates are
 * favourable on purpose — retraining after a long lay-off is the one situation
 * where meaningful lean gain and fat loss genuinely happen at once, and this
 * is exactly that situation.
 *
 * The water term is the most useful line in the whole table and the one most
 * likely to be misread. Going from one carbohydrate-light meal a day to four
 * normal ones refills muscle and liver glycogen, and glycogen carries roughly
 * three grams of water per gram. That is 0.4-0.8 kg on the scale inside ten
 * days, it is not fat, and it is the thing most likely to make somebody quit
 * a plan that is working.
 */

const START = { mass: PROGRAMME.subject.mass, bodyFat: 0.19, waist: PROGRAMME.subject.waist };

export const SCENARIOS = [
  {
    id: 'hold', name: 'Hold', intake: 2300,
    what: 'Eat the meal timeline, skip the evening snack most nights.',
    verdict: 'Works, but spends the wrong currency.',
    detail: 'A small deficit. The waist falls and so does the scale — and at BMI 20.5 you do not have weight to give away. Lean gain nearly stalls because the energy to build with is not there. This is the trap the plan was written to avoid.',
    // -250 kcal/day against the weekly average. Allowing the usual ~30% of a
    // deficit to be given back as reduced NEAT, that is ~5,300 kcal a month
    // net, which buys about half a kilo of fat — and the lean rate is the
    // lowest of the three because there is no energy spare to build with.
    water: 0.4, leanPerMonth: 0.20, fatPerMonth: -0.55, waistPerMonth: -0.7,
  },
  {
    id: 'recomp', name: 'Recomp', intake: 2500, recommended: true,
    what: 'The meal timeline exactly as written. 135 g of protein.',
    verdict: 'What you asked for, in two numbers: waist down, weight flat.',
    detail: 'Roughly maintenance once the hour and the treadmill are in. Fat falls, lean rises, and the scale barely moves — which is why the scale is the wrong instrument for this and the tape measure is the right one. This is the only scenario where the waist and the density both go your way.',
    water: 0.6, leanPerMonth: 0.45, fatPerMonth: -0.35, waistPerMonth: -0.6,
  },
  {
    id: 'build', name: 'Build', intake: 2900,
    what: 'The timeline plus a second afternoon shake and a bigger dinner.',
    verdict: 'Faster muscle, and fat with it. Not what you said you wanted.',
    detail: 'A real surplus. Lean gain is the fastest of the three and so is fat gain — the waist stops falling and starts drifting up. Worth it only if the goal changes from the core to the numbers on the lifts.',
    water: 0.8, leanPerMonth: 0.60, fatPerMonth: 0.35, waistPerMonth: 0.2,
  },
];

export const HORIZONS = [
  { id: 'd14', label: 'Two weeks', months: 0.5 },
  { id: 'm1', label: 'One month', months: 1 },
  { id: 'm2', label: 'Two months', months: 2 },
];

/**
 * Where a scenario puts you after `months`.
 *
 * Water lands over the first ten days rather than linearly, because that is
 * what glycogen repletion does — so it is ramped to full by half a month and
 * flat thereafter, not spread across the whole horizon.
 */
export function project(scenarioId, months) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  if (!sc) throw new Error('no such scenario: ' + scenarioId);
  const fat0 = START.mass * START.bodyFat;
  const lean0 = START.mass - fat0;

  const water = sc.water * Math.min(1, months / 0.5);
  const lean = lean0 + sc.leanPerMonth * months + water;
  const fat = fat0 + sc.fatPerMonth * months;
  const mass = lean + fat;

  return {
    months,
    mass: Math.round(mass * 10) / 10,
    lean: Math.round(lean * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    water: Math.round(water * 10) / 10,
    bodyFat: Math.round((fat / mass) * 1000) / 10,
    waist: Math.round((START.waist + sc.waistPerMonth * months) * 10) / 10,
    dMass: Math.round((mass - START.mass) * 10) / 10,
    dFat: Math.round((fat - fat0) * 10) / 10,
    dLean: Math.round((lean - lean0) * 10) / 10,
    dWaist: Math.round((START.waist + sc.waistPerMonth * months - START.waist) * 10) / 10,
  };
}

export const PROJECTION_START = {
  ...START,
  fat: Math.round(START.mass * START.bodyFat * 10) / 10,
  lean: Math.round((START.mass - START.mass * START.bodyFat) * 10) / 10,
  bodyFatPct: Math.round(START.bodyFat * 1000) / 10,
};

/** The honest caveats, rendered under the table rather than buried here. */
export const PROJECTION_NOTES = [
  'Body fat starts at an ESTIMATED 19%. Nobody has measured it. If the real figure is 16% or 22% every absolute number here shifts, but the differences between the three columns do not.',
  'The scale will be up 0.4-0.8 kg inside ten days on any of these. That is glycogen and the water it carries, it arrives whatever you do, and it is not fat.',
  'Weigh once a week, same morning, after the bathroom, before anything else — and read the trend, never a single reading. Day-to-day swing from food, salt and hydration is about ±1 kg, which is larger than a whole month of real change.',
  'The waist at the navel is the measurement that settles this. If the tape falls and the scale is flat, it is working, whatever the scale says.',
];

/* ------------------------------------------------------------- the schedule
 *
 * ONE LIST, WAKE TO SLEEP. Not a training section and a food section and a
 * sleep section that the reader has to interleave in their head at 06:40.
 *
 * The old Today tab was organised by SUBJECT — "The hour", then "Eat", then
 * "Watch" — which is how the plan is written and how a document wants to be
 * read. It is not how a morning is lived. Lived forwards, the day is one
 * sequence: you get up, you train, you eat, you walk, you eat, you stop
 * drinking coffee, you eat, you put a child to bed, you sleep. The subject of
 * each block is incidental; its POSITION is the whole point.
 *
 * So this returns a single ordered array and the renderer does not sort it.
 * Every block carries a signed kcal — negative spent, positive eaten — which
 * is what lets the page total the day honestly instead of showing food and
 * training as unrelated lists.
 */
export function schedule(plan) {
  const E = ENERGY;
  const out = [];
  const meal = (id) => plan.meals.find((m) => m.id === id);
  const work = plan.workday && !plan.travel;

  /* An evening punt moves the training blocks and nothing else. The clock is
   * the only thing that changes: same warm-up, same session, same order, same
   * cost. Times are derived from the slot rather than written twice, so the
   * hour cannot drift out of shape when the slot moves. */
  const evening = !!(plan.punt && plan.punt.evening);
  const base = evening ? minutesOf(EVENING_SLOT) : minutesOf('06:00');
  const clock = (offset) => {
    const t = base + offset;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  };

  const add = (b) => { out.push(b); return b; };

  add({ at: PROGRAMME.wake, id: 'wake', kind: 'wake', what: evening ? 'Up. The hour is tonight.' : 'Up',
    detail: evening
      ? 'The session moved to ' + EVENING_SLOT + '. Nothing to do now but the coffee — and the treadmill blocks still count, so the day is not empty.'
      : work
      ? 'Coffee, and straight into the hour. This slot survives because nothing else has started yet — by 08:00 the day owns you.'
      : 'No alarm needed. The hour still happens, it just does not have to happen at 06:00 sharp.' });

  /* --- the hour ------------------------------------------------------- */
  if (plan.warmup) {
    add({ at: clock(0), id: 'warmup', kind: 'train', mins: 6, what: 'Warm-up',
      detail: plan.warmup.why, kcal: -E.hour.warmup, items: plan.warmup.items });
  }
  if (plan.session) {
    add({ at: clock(6), id: 'session', kind: 'train', mins: 38,
      what: plan.session.name + ' · ' + plan.session.theme,
      detail: plan.session.why, kcal: -E.hour.session, items: plan.session.items,
      sets: plan.phase.sets, key: true });
    add({ at: clock(44), id: 'cond', kind: 'train', mins: 10, what: 'Conditioning, easy',
      detail: 'Nose-breathing pace on the treadmill or the stairs. This is for the heart, not the legs — if you are breathing hard it has turned into a second session.',
      kcal: -E.hour.conditioning });
  } else if (plan.easy) {
    add({ at: clock(6), id: 'easy', kind: 'train', mins: 20, what: plan.easy.name,
      detail: plan.easy.why, kcal: -E.hour.easyMobility, items: plan.easy.items });
    add({ at: clock(30), id: 'easywalk', kind: 'train', mins: 25, what: 'Easy aerobic, 25 minutes',
      detail: plan.easy.after, kcal: -E.hour.easyWalk });
  }
  if (plan.warmup) {
    add({ at: clock(54), id: 'log', kind: 'admin', mins: 6, what: 'Down, and log it',
      detail: 'Two minutes of breathing, then `node health.mjs log` while the kettle boils. Thirty seconds of typing is what turns the next month into findings rather than a feeling.' });
  }
  if (plan.rest) {
    add({ at: '08:00', id: 'restnote', kind: 'rest', what: 'Nothing scheduled, deliberately',
      detail: plan.note || 'Rest is not the absence of the plan. It is the part where the adaptation you trained for actually happens. Eat properly today especially — the building goes on whether or not you are in the room.' });
  }

  /* --- the rest of it -------------------------------------------------- */
  const b = meal('breakfast');
  add({ at: b.at, id: 'breakfast', kind: 'eat', what: b.what, detail: b.detail,
    kcal: b.kcal, protein: b.protein });

  if (work) {
    add({ at: '08:00', id: 'daycare', kind: 'family', what: 'Daycare drop-off', detail: null });
    add({ at: '08:30', id: 'office', kind: 'work', what: 'Office. Calls, then go-go-go',
      detail: 'The part of the day you do not control. Everything that had to happen has already happened.' });
    add({ at: '09:00', id: 'walk1', kind: 'walk', mins: 30, what: 'Treadmill · block 1',
      detail: TREADMILL.when[0] + ' Walk during INPUT, not output — typing at 4 km/h is how people decide the treadmill does not work.',
      kcal: -E.treadmillBlock });
  }

  const l = meal('lunch');
  add({ at: l.at, id: 'lunch', kind: 'eat', what: l.what, detail: l.detail,
    kcal: l.kcal, protein: l.protein, key: true });

  if (work) {
    add({ at: '13:30', id: 'walk2', kind: 'walk', mins: 30, what: 'Treadmill · block 2',
      detail: TREADMILL.when[1], kcal: -E.treadmillBlock });
  }

  const c = meal('coffee');
  add({ at: c.at, id: 'coffee', kind: 'cutoff', what: c.what, detail: c.detail, key: true });

  const a = meal('afternoon');
  add({ at: a.at, id: 'afternoon', kind: 'eat', what: a.what, detail: a.detail,
    kcal: a.kcal, protein: a.protein });

  if (work) {
    add({ at: '16:00', id: 'walk3', kind: 'walk', mins: 30, what: 'Treadmill · block 3',
      detail: TREADMILL.when[2], kcal: -E.treadmillBlock });
    add({ at: '17:15', id: 'home', kind: 'family', what: 'Home, to catch her',
      detail: 'The reason the training is at 06:00 and not at 18:00.' });
  }

  const d = meal('dinner');
  add({ at: d.at, id: 'dinner', kind: 'eat', what: d.what, detail: d.detail,
    kcal: d.kcal, protein: d.protein });

  add({ at: '19:00', id: 'bedtime', kind: 'family', what: 'Her dinner, TV, shower, bed',
    detail: null });

  const e = meal('evening');
  /* On an evening-punt day this stops being an optional snack and becomes the
   * feeding after the session, so it moves behind it and says so. Same
   * calories either way — only the reason changes. */
  add(evening
    ? { at: '21:00', id: 'evening', kind: 'eat', what: 'After the session — eat something with protein in it',
      detail: 'You have just trained at 20:45. This is no longer an optional snack; it is the feeding that the session earns. Protein milk, yoghurt, eggs, whatever is quickest.',
      kcal: e.kcal, protein: e.protein }
    : { at: e.at, id: 'evening', kind: 'eat', what: e.what, detail: e.detail,
      kcal: e.kcal, protein: e.protein });

  add({ at: '22:00', id: 'wind', kind: 'wind', what: 'Wind down. Screens down.',
    detail: 'Seven and three-quarter hours in bed is not generous, so it has no room to be spent. The coffee cutoff at 14:00 is what makes this hour work.' });
  add({ at: PROGRAMME.bed, id: 'bed', kind: 'sleep', what: 'Bed',
    detail: 'Target ' + PROGRAMME.bed + '-' + PROGRAMME.wake + '. Sleep is not recovery time left over from the plan — at short sleep both halves of this goal move the wrong way at once.' });

  /* SORT BY THE CLOCK, not by emission order. The builder above adds blocks in
   * the order the plan thinks about them, which is the same as the order they
   * happen right up until a punt moves the hour to 19:45 — and then it is not.
   * A schedule that is not in time order is not a schedule. Array.sort is
   * stable, so blocks sharing a minute (06:00 waking and 06:00 warming up)
   * keep the order they were added in, which is the sensible one. */
  return out.sort((x, y) => minutesOf(x.at) - minutesOf(y.at));
}

/** What the schedule adds up to: eaten, spent, and the gap between them. */
export function ledger(plan) {
  const sch = schedule(plan);
  const burn = burnOf(plan);
  const inKcal = sch.reduce((t, b) => t + (b.kcal > 0 ? b.kcal : 0), 0);
  const protein = sch.reduce((t, b) => t + (b.protein || 0), 0);
  return {
    in: inKcal,
    protein,
    out: burn.total,
    earned: burn.hour + burn.walk,
    baseline: burn.baseline,
    net: inKcal - burn.total,
  };
}

const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ------------------------------------------------------------------ punts
 *
 * THE MORNING DOES NOT ALWAYS SURVIVE CONTACT. A toddler wakes at 05:20, a
 * call moves to 07:00, the knee is talking. The plan's whole design premise is
 * that it is built for the worst week rather than the best one, and a plan you
 * can only either complete or fail is not built for the worst week — it is
 * built to be abandoned in it.
 *
 * So the heavy session can be moved, in exactly two ways, and both of them
 * keep the hour rather than deleting it:
 *
 *   'evening'  — same day, moved to after the bedtime routine. The work still
 *                happens. Only the clock changes.
 *   'tomorrow' — the loaded session moves to the next day, and TODAY BECOMES
 *                AN EASY DAY rather than becoming nothing. That is faithful to
 *                the plan: Tuesday and Thursday are not rest days, the hour
 *                still happens, it is just not loaded.
 *
 * A punt is stored per DATE, on the device, and nothing else knows about it.
 * It is a fact about one morning, not a change to the programme.
 */

/** Where an evening-punted session lands: after her bedtime routine, and far
 *  enough from lights-out not to be bought with sleep. Finishing at 20:45
 *  against a 22:45 bed leaves two hours, which is the margin the sleep
 *  literature actually cares about — it is training INSIDE the last hour that
 *  costs you sleep onset, not training in the evening as such. */
export const EVENING_SLOT = '19:45';

export const PUNT_MODES = {
  evening: {
    id: 'evening', label: 'Tonight',
    blurb: 'Same day, after she is down. Starts ' + EVENING_SLOT + ', finishes 20:45.',
    note: 'Two hours clear of bed. Training inside the last hour before sleep is what costs you sleep onset; this is not that.',
  },
  tomorrow: {
    id: 'tomorrow', label: 'Tomorrow',
    blurb: 'The loaded session moves to tomorrow. Today becomes an easy day.',
    note: 'Not a skip. The hour still happens — mobility, the knee work and an easy walk — because the thing that breaks a restart is the morning going missing, not the load coming off it.',
  },
};

/**
 * Which loaded session a date actually has once punts are applied.
 *
 * A punt of 'tomorrow' on date D means: the session D would have had is
 * performed on D+1. For that session to reach some later date, EVERY day in
 * between must also have punted forward — otherwise it landed somewhere and
 * stopped. That walk-back is bounded at a week, because a session punted eight
 * days is not a punted session, it is a missed one.
 */
export function resolveSession(date, punts = {}) {
  const ownId = (WEEK[date.getDay()] || {}).session || null;
  const mine = punts[isoDay(date)] || {};

  let received = null;
  for (let back = 1; back <= 7; back++) {
    let chain = true;
    for (let k = 0; k < back; k++) {
      const m = new Date(date); m.setDate(m.getDate() - back + k);
      if ((punts[isoDay(m)] || {}).mode !== 'tomorrow') { chain = false; break; }
    }
    if (!chain) continue;
    const origin = new Date(date); origin.setDate(origin.getDate() - back);
    const originId = (WEEK[origin.getDay()] || {}).session || null;
    if (originId) { received = { id: originId, from: isoDay(origin), fromDay: DAYNAMES[origin.getDay()], hops: back }; break; }
  }

  // A day that already owns a loaded session cannot also receive one. The UI
  // refuses the punt before it gets here; this is the backstop, and it drops
  // the INBOUND one, because doing two loaded sessions in a day is the one
  // outcome nobody wants.
  const collide = !!(ownId && received);
  let sessionId = ownId || (received ? received.id : null);
  if (mine.mode === 'tomorrow') sessionId = null;

  return {
    sessionId,
    received: !ownId && received && mine.mode !== 'tomorrow' ? received : null,
    collide,
    mode: mine.mode || null,
    evening: mine.mode === 'evening' && !!sessionId,
    awayTomorrow: mine.mode === 'tomorrow',
  };
}

/** Can this date's session be punted, and to where? Returns the reasons, so
 *  the UI can disable a button and SAY WHY rather than silently not working. */
export function puntOptions(date, punts = {}) {
  const r = resolveSession(date, punts);
  if (!r.sessionId) return { evening: null, tomorrow: null, why: 'Nothing loaded to punt today.' };

  const next = new Date(date); next.setDate(next.getDate() + 1);
  const nextOwn = (WEEK[next.getDay()] || {}).session || null;

  return {
    evening: r.mode === 'evening' ? null : PUNT_MODES.evening,
    tomorrow: nextOwn
      ? null
      : (r.mode === 'tomorrow' ? null : PUNT_MODES.tomorrow),
    tomorrowBlocked: nextOwn
      ? `Tomorrow already has Session ${nextOwn}. Two loaded days back to back is more than this plan intends — do tonight instead, or let it go.`
      : null,
    current: r.mode,
  };
}

/* -------------------------------------------------------------- the day --- */


/** Local-midnight Date from a YYYY-MM-DD string. Constructing it from the
 *  bare string would be parsed as UTC and land on the previous day for
 *  anybody east of Greenwich, which is everybody this is for. */
export function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Programme week number, 1-based. Weeks run Monday to Sunday from the start
 *  date. Dates before the start return week 1 rather than zero or negative:
 *  opening the app early should show the plan, not an error. */
export function weekOf(date) {
  const start = parseDay(PROGRAMME.start);
  const days = Math.floor((parseDay(isoDay(date)) - start) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

export const phaseOf = (week) => PHASES.find((p) => week >= p.from && week <= p.to) || PHASES[PHASES.length - 1];

/** Is this the first Sunday of its month? The monthly battery wants a day
 *  that is predictable, unhurried and not a gym day. */
export function isTestDay(date) {
  return date.getDay() === 0 && date.getDate() <= 7;
}

/**
 * Everything the page needs for one date.
 *
 * A pure function of (date, options) so it can be asserted under node: the
 * whole point of keeping the plan out of the renderer is that "what does a
 * Wednesday in week 4 look like" is a question with a checkable answer.
 */
export function dayPlan(date, { travel = false, punts = {} } = {}) {
  const weekday = date.getDay();
  const week = weekOf(date);
  const phase = phaseOf(week);
  const workday = weekday >= 1 && weekday <= 5;
  const slot = WEEK[weekday] || {};

  /* Punts resolve BEFORE anything else reads the day, so every downstream
   * consumer — the schedule, the ledger, the week strip — sees one consistent
   * answer rather than each re-deriving it. */
  const punt = travel ? { sessionId: null } : resolveSession(date, punts);
  const sessionId = travel ? null : punt.sessionId;
  const session = sessionId ? SESSIONS[sessionId] : null;
  const rest = !travel && !!slot.rest;
  /* Punting the load away does not empty the morning, it downgrades it. The
   * hour still happens; that is the whole point of the easy day existing. */
  const easy = !travel && !rest && (!!slot.easy || (punt.awayTomorrow && !!slot.session));
  const test = isTestDay(date);

  let title, subtitle;
  if (!travel && punt.awayTomorrow && slot.session) {
    title = 'Easy day · Session ' + slot.session + ' punted';
    subtitle = 'The load moved to tomorrow. The hour did not move anywhere — mobility, the knee work and an easy walk, same window.';
  } else if (!travel && punt.received) {
    title = `${session.name} · ${session.theme}`;
    subtitle = `Punted from ${punt.received.fromDay}. ${session.why}`;
  } else if (travel) {
    title = 'Travel day';
    subtitle = 'The hour still happens: warm-up, bands, a walk, four palms of protein. Only the load comes off.';
  } else if (session) {
    title = `${session.name} · ${session.theme}`;
    subtitle = session.why;
  } else if (rest) {
    title = 'Rest';
    subtitle = slot.note || 'Nothing scheduled. Read the week back and eat properly.';
  } else if (easy) {
    title = 'Easy day';
    subtitle = slot.note || EASY.why;
  } else {
    title = 'Open';
    subtitle = 'Nothing scheduled.';
  }

  return {
    iso: isoDay(date),
    weekday, dayName: DAYNAMES[weekday],
    week, phase, workday, travel, test, rest,
    punt,
    title, subtitle,
    hour: HOUR,
    warmup: session || easy ? WARMUP : null,
    sessionId, session,
    easy: easy ? EASY : null,
    note: slot.note || null,
    treadmill: TREADMILL,
    meals: meals(travel ? 'travel' : workday ? 'work' : 'home'),
    get schedule() { return schedule(this); },
    get ledger() { return ledger(this); },
    exercises: [
      ...(session || easy ? WARMUP.items : []),
      ...(session ? session.items : []),
      ...(easy ? EASY.items : []),
    ],
  };
}

/** The seven-day strip at the top: what each day of THIS week is, so the week
 *  can be read at a glance rather than reconstructed a day at a time. */
export function weekStrip(date, opts = {}) {
  const out = [];
  /* SUNDAY-FIRST. The programme's weeks are still counted Monday-to-Sunday
   * from the start date — weekOf() is unchanged — but the strip is a calendar,
   * and the calendar this is read against runs Sunday to Saturday. Those are
   * two different questions and only one of them is about the programme. */
  const sunday = new Date(date);
  sunday.setDate(sunday.getDate() - date.getDay());
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const p = dayPlan(d, opts);
    out.push({
      iso: p.iso, letter: DAYNAMES[d.getDay()][0], dayName: p.dayName,
      date: d.getDate(), sessionId: p.sessionId, test: p.test,
      easy: !!p.easy, rest: !!p.rest,
      today: isoDay(d) === isoDay(date),
    });
  }
  return out;
}

/** Minutes from midnight, for the "what happens next" strip. */
export const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
