/* day.js — the plan, on a phone, for today.
 *
 * Three tabs and a player. The tabs are thin: everything they draw comes out
 * of daydata.js (the plan) or anim.js (the movements), and this file does not
 * decide anything about either. If a dose looks wrong, it is wrong in
 * daydata.js; if a movement looks wrong, it is wrong in anim.js.
 *
 * The player is the reason this is not a static page. A written instruction
 * like "step down slowly, watching the kneecap" is a thing you either already
 * understand or you do not, and the figure is what closes that gap — the same
 * figure, the same solver and the same 47 movements as the desktop app, in a
 * viewport 400 pixels wide.
 *
 * WHAT IS DELIBERATELY NOT HERE: posing, marking, anatomy, the knee close-up,
 * URL state. Those are for sitting down with, and they are what index.html is
 * for. This is for standing in a kitchen deciding what today is.
 */
import { buildSkeleton, solveFrames } from './body.js';
import { EXERCISES, EXERCISE, Player, sampleExercise } from './anim.js';
import { placeProps, placeHeld, mirrorHolds, propsNeeded } from './props.js';

/* three.js is NOT imported here.
 *
 * It is 670 KB — more than everything else in this app put together — and the
 * Today tab, which is what the icon on the home screen opens to, needs none of
 * it. Loading it up front means staring at an empty screen every morning to
 * make the figure ready a few hundred milliseconds sooner on the one tap in
 * ten that opens one. So it is fetched on the first tap and cached by the
 * service worker from then on. */
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js';
let THREE = null, FIG = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = src; el.async = true;
    el.onload = res; el.onerror = () => rej(new Error('could not load ' + src));
    document.head.append(el);
  });
}

async function loadThree() {
  if (THREE) return;
  if (!globalThis.THREE) await loadScript(THREE_URL);
  THREE = globalThis.THREE;
  if (!THREE) throw new Error('three.js loaded but defined nothing');
  FIG = await import('./figure.js');
}
import {
  PROGRAMME, PHASES, NUTRITION, TRAVEL, GUARDRAILS, KNEE, TESTS,
  HOUR, TREADMILL, STRETCH_GOALS, KIT, SESSIONS, EASY,
  dayPlan, weekStrip, isoDay, parseDay, minutesOf,
  ENERGY, BASELINE_BURN, weeklyBurn, SCENARIOS, HORIZONS, project,
  PROJECTION_START, PROJECTION_NOTES,
  puntOptions, PUNT_MODES, EVENING_SLOT,
} from './daydata.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------------------------------------------------------- state */
/* Storage, behind a try/catch on EVERY path including the read at start-up.
 * Not defensiveness for its own sake: this page is served from a sandboxed
 * origin, and in a sandbox the localStorage ACCESSOR itself throws rather than
 * returning null. An unguarded read at module scope means the module never
 * finishes evaluating, and the result is a page that renders its entire shell,
 * looks completely finished, and does nothing at all when touched. Ticks are a
 * convenience; they are not worth the whole app. */
const store = {
  get(k, fallback = null) { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sandboxed, private, or full */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* same */ } },
  /* Every key under a prefix. Used to load the punts, which are sparse — most
   * days have none — so they are stored one key per date rather than as one
   * blob that has to be rewritten whenever any day changes. */
  under(prefix) {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        try { out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch { /* skip */ }
      }
    } catch { /* sandboxed: no punts, app still works */ }
    return out;
  },
};

const S = {
  date: new Date(),
  viewing: new Date(),          // the day being LOOKED at, which may not be today
  tab: 'schedule',
  travel: store.get('pt.travel') === '1',
  ticks: new Set(),
  /* { '2026-09-14': { mode: 'evening' } } — sparse, per-date, device-local. */
  punts: store.under('pt.punt.'),
};

const PUNT_KEY = (iso) => 'pt.punt.' + iso;

/** Record or clear a punt, then re-render. This is the only writer. */
function setPunt(iso, mode) {
  if (mode) { S.punts[iso] = { mode }; store.set(PUNT_KEY(iso), JSON.stringify({ mode })); }
  else { delete S.punts[iso]; store.del(PUNT_KEY(iso)); }
  render();
}

function loadTicks() {
  try { S.ticks = new Set(JSON.parse(store.get('pt.tick.' + isoDay(S.viewing), '[]'))); }
  catch { S.ticks = new Set(); }
}
function saveTicks() { store.set('pt.tick.' + isoDay(S.viewing), JSON.stringify([...S.ticks])); }

/* ------------------------------------------------------------- plumbing */
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
  }
  for (const kd of kids.flat()) if (kd != null && kd !== false) e.append(kd.nodeType ? kd : document.createTextNode(kd));
  return e;
}
const card = (...kids) => h('div', { class: 'card' }, kids);
const sect = (title, ...kids) => h('section', {}, title ? h('h2', {}, title) : null, kids);

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = '0'; }, 2100);
}

const TICK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';

/** One tickable line, optionally with a play button that opens the figure. */
function taskRow(id, title, { dose, note, time, exId, tag, tagClass } = {}) {
  const on = S.ticks.has(id);
  const tick = h('button', {
    class: 'tick' + (on ? ' on' : ''), html: TICK_SVG, 'aria-label': 'done',
    onclick: (e) => {
      e.stopPropagation();
      if (S.ticks.has(id)) S.ticks.delete(id); else S.ticks.add(id);
      saveTicks(); render();
    },
  });
  const main = h('div', { class: 'rmain' },
    h('div', { class: 'rtitle' }, title, tag ? h('span', { class: 'tag ' + (tagClass || '') }, tag) : null),
    time ? h('div', { class: 'rtime mono' }, time) : null,
    dose ? h('div', { class: 'rdose mono' }, dose) : null,
    note ? h('div', { class: 'rnote' }, note) : null);
  const row = h('div', { class: 'row' + (on ? ' done' : '') }, tick, main,
    exId ? h('button', { class: 'play', html: PLAY_SVG, 'aria-label': 'show me',
      onclick: (e) => { e.stopPropagation(); openPlayer(exId); } }) : null);
  return row;
}

/* ------------------------------------------------------------- the header */
function renderHeader(P) {
  const d = S.viewing;
  const same = isoDay(d) === isoDay(S.date);
  const today = S.tab === 'schedule';
  // The week strip is ninety pixels of a nine-hundred-pixel screen and it
  // means nothing on the other two tabs, so it goes away there and the header
  // names the tab instead. On a phone, chrome that does not earn its height is
  // chrome that pushes the thing you came for below the fold.
  $('#dayname').textContent = today ? P.dayName : S.tab === 'library' ? 'Movements' : 'Plan & goals';
  $('#datesub').textContent = today
    ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) +
      '  ·  week ' + P.week + '  ·  ' + P.phase.name + (same ? '' : '  ·  not today')
    : S.tab === 'library' ? EXERCISES.length + ' movements, every one with a figure'
      : 'The standing version. The Schedule tab is what to do with it.';
  $('#travel').hidden = !today;
  $('#travel').classList.toggle('on', S.travel);
  $('#strip').hidden = !today;
  if (!today) return;

  const strip = $('#strip'); strip.textContent = '';
  for (const d2 of weekStrip(S.viewing, { travel: S.travel, punts: S.punts })) {
    const b = h('button', {
      class: 'dbtn' + (d2.today ? ' today' : '') + (d2.iso === isoDay(S.viewing) ? ' sel' : ''),
      onclick: () => { S.viewing = parseDay(d2.iso); loadTicks(); render(); },
    },
      h('div', { class: 'l' }, d2.letter),
      h('div', { class: 'n mono' }, String(d2.date)),
      h('div', { class: 't' }, d2.test ? 'TEST' : d2.sessionId || ''));
    strip.append(b);
  }
}

/* ------------------------------------------------------------- what's next */
/** The one line at the top that makes this a today-app rather than a document:
 *  at 06:40 it says eat something, at 13:10 it says the coffee window closes
 *  in fifty minutes, at 15:00 it says it has closed. */
function nowStrip(P) {
  const el = h('div', { id: 'now' }, h('div', { class: 'dot' }), h('div', { class: 'txt' }));
  if (isoDay(S.viewing) !== isoDay(S.date)) {
    el.querySelector('.txt').innerHTML = '<b>Looking ahead.</b> Tap the highlighted day to come back to today.';
    el.classList.add('past');
    return el;
  }
  const mins = S.date.getHours() * 60 + S.date.getMinutes();
  const cut = minutesOf(PROGRAMME.coffeeCutoff);
  const lunch = minutesOf(PROGRAMME.lunch);
  const fmt = (m) => (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '') : m + ' min').trim();
  let msg, cls = '';

  if (mins < lunch - 30) {
    msg = `<b>Lunch at ${PROGRAMME.lunch}.</b> ${fmt(lunch - mins)} from now. ` +
      (P.workday && !S.travel ? 'It is already bought and already paid for.' : 'Decide what it is now, while you are thinking about it.');
  } else if (mins < lunch + 90) {
    msg = '<b>Lunch, now.</b> This is the single biggest thing in the whole plan and it takes fifteen minutes.';
  } else if (mins < cut) {
    msg = `<b>Coffee window closes in ${fmt(cut - mins)}</b>, at ${PROGRAMME.coffeeCutoff}. Last one, if you want one.`;
    cls = 'alert';
  } else if (mins < minutesOf('18:30')) {
    msg = '<b>Coffee window closed.</b> Anything now is still half on board at bedtime.';
    cls = 'past';
  } else if (mins < minutesOf('22:00')) {
    msg = `<b>Dinner, then wind down.</b> Bed at ${PROGRAMME.bed} — seven and a quarter hours is not generous, so it has no room to be spent.`;
    cls = 'past';
  } else {
    msg = `<b>Bed.</b> Target ${PROGRAMME.bed}–${PROGRAMME.wake}.`;
    cls = 'past';
  }
  el.classList.add(...(cls ? [cls] : []));
  el.querySelector('.txt').innerHTML = msg;
  return el;
}

/* ---------------------------------------------------------- schedule view */
/* ONE LIST, WAKE TO SLEEP.
 *
 * What replaced what, and why: this used to be three stacked sections — the
 * hour, then eat, then watch — which is the shape of the written plan. Read at
 * 06:40 that shape makes you do the interleaving yourself: you are looking at
 * a training card wondering whether breakfast comes before or after it. The
 * plan is a document and wants to be grouped by subject. A morning is a
 * sequence and wants to be in order. This is the sequence.
 *
 * The kcal on the right of each block are the second half of the request and
 * they are ESTIMATES, which the running total says out loud rather than
 * implying otherwise with a precise-looking number. */

const KIND_LABEL = {
  wake: 'wake', train: 'train', admin: 'log', eat: 'eat', walk: 'walk',
  work: 'work', family: 'family', cutoff: 'coffee', wind: 'wind down',
  sleep: 'sleep', rest: 'rest',
};

/** A signed kcal chip. Positive is eaten, negative is spent, and they are
 *  coloured differently because at a glance the sign is the whole message. */
function kcalChip(kcal) {
  if (!kcal) return null;
  const inbound = kcal > 0;
  return h('div', { class: 'kcal mono ' + (inbound ? 'in' : 'out') },
    (inbound ? '+' : '−') + Math.abs(kcal));
}

function scheduleBlock(P, b) {
  const id = 'b:' + b.id;
  const on = S.ticks.has(id);
  const tickable = ['train', 'eat', 'walk', 'admin', 'cutoff'].includes(b.kind);

  const tick = tickable
    ? h('button', {
      class: 'tick' + (on ? ' on' : ''), html: TICK_SVG, 'aria-label': 'done',
      onclick: (e) => {
        e.stopPropagation();
        if (S.ticks.has(id)) S.ticks.delete(id); else S.ticks.add(id);
        saveTicks(); render();
      },
    })
    : h('div', { class: 'dotcol' }, h('div', { class: 'blockdot k-' + b.kind }));

  const head = h('div', { class: 'bhead' },
    h('div', { class: 'btitle' }, b.what,
      b.mins ? h('span', { class: 'tag mono' }, b.mins + ' min') : null,
      b.key ? h('span', { class: 'tag key' }, b.kind === 'eat' ? 'the big one' : 'the point') : null),
    kcalChip(b.kcal));

  const body = h('div', { class: 'bmain' }, head,
    b.protein ? h('div', { class: 'rdose mono' }, b.protein + ' g protein') : null,
    b.sets && b.sets !== 'full sets' ? h('div', { class: 'rdose' }, 'This week: ' + b.sets) : null,
    b.detail ? h('div', { class: 'rnote' }, b.detail) : null);

  /* The exercises live INSIDE their block rather than as siblings, so the
   * sequence stays readable when a session has six movements in it. */
  if (b.items && b.items.length) {
    const inner = h('div', { class: 'subrows' });
    for (const it of b.items) {
      inner.append(taskRow('x:' + b.id + ':' + it.ex, it.label, {
        dose: it.dose, note: it.note, exId: it.ex,
        tag: it.knee ? 'knee' : it.log ? 'log it' : null, tagClass: it.knee ? 'knee' : '',
      }));
    }
    body.append(inner);
  }

  /* The punt lives ON the loaded session, because that is the thing being
   * moved and the place you are looking when you decide you cannot do it. */
  if (b.id === 'session') {
    const pc = puntControls(P);
    if (pc) body.append(pc);
  }

  return h('div', { class: 'block' + (on ? ' done' : '') + (isNow(b, P) ? ' now' : '') },
    h('div', { class: 'btime mono' }, b.at),
    tick, body);
}

/** Is this the block you are in right now? Only ever true for today. */
function isNow(b, P) {
  if (isoDay(S.viewing) !== isoDay(S.date)) return false;
  const sch = P.schedule;
  const mins = S.date.getHours() * 60 + S.date.getMinutes();
  let cur = null;
  for (const x of sch) if (minutesOf(x.at) <= mins) cur = x;
  return cur === b;
}

/* ------------------------------------------------------------------ punts */
/* The morning does not always survive contact. This is the control that lets
 * the plan bend instead of breaking, and it is deliberately TWO buttons and no
 * menu: at 06:05, with a toddler awake, the interaction budget is one tap. */

function puntControls(P) {
  const opts = puntOptions(S.viewing, S.punts);
  if (!opts.evening && !opts.tomorrow && !opts.current) return null;

  const btn = (mode, label) => h('button', {
    class: 'puntb',
    onclick: () => {
      setPunt(P.iso, mode);
      toast(mode === 'evening' ? 'Session moved to ' + EVENING_SLOT : 'Session moved to tomorrow');
    },
  }, label);

  const wrap = h('div', { class: 'punt' });

  if (opts.current) {
    const m = PUNT_MODES[opts.current];
    wrap.append(
      h('div', { class: 'puntnow' },
        h('div', { class: 'pn1' }, 'Punted — ' + m.label.toLowerCase()),
        h('div', { class: 'pn2' }, m.note)),
      h('button', { class: 'puntb undo', onclick: () => { setPunt(P.iso, null); toast('Punt undone'); } },
        'Put it back'));
    // still allow switching between the two
    if (opts.current === 'tomorrow' && opts.evening) wrap.append(btn('evening', 'Tonight instead'));
    if (opts.current === 'evening' && opts.tomorrow) wrap.append(btn('tomorrow', 'Tomorrow instead'));
    return wrap;
  }

  wrap.append(h('div', { class: 'puntlab' }, 'Cannot do it now?'));
  if (opts.evening) wrap.append(btn('evening', 'Tonight'));
  if (opts.tomorrow) wrap.append(btn('tomorrow', 'Tomorrow'));
  if (opts.tomorrowBlocked) wrap.append(h('div', { class: 'puntwhy' }, opts.tomorrowBlocked));
  return wrap;
}

function renderSchedule(root) {
  const P = dayPlan(S.viewing, { travel: S.travel, punts: S.punts });
  const L = P.ledger;

  const head = h('div', { id: 'headline', class: P.session ? 'gym' : '' },
    h('div', { class: 't' }, P.title),
    h('div', { class: 's' }, P.subtitle),
    h('div', { class: 'w mono' }, `WEEK ${P.week}  ·  ${P.phase.name.toUpperCase()}` + (P.session ? `  ·  ${P.session.length}` : '')));
  root.append(head, nowStrip(P));

  /* The day's arithmetic, above the schedule that produces it. */
  root.append(h('div', { class: 'ledger' },
    h('div', { class: 'lcell' }, h('div', { class: 'lk' }, 'eat'), h('div', { class: 'lv mono in' }, L.in)),
    h('div', { class: 'lcell' }, h('div', { class: 'lk' }, 'burn'), h('div', { class: 'lv mono out' }, L.out)),
    h('div', { class: 'lcell' }, h('div', { class: 'lk' }, 'net'),
      h('div', { class: 'lv mono ' + (L.net > 120 ? 'warn' : '') }, (L.net > 0 ? '+' : '−') + Math.abs(L.net))),
    h('div', { class: 'lcell' }, h('div', { class: 'lk' }, 'protein'), h('div', { class: 'lv mono' }, L.protein + ' g'))));
  root.append(h('div', { class: 'lnote' },
    `Estimates. ${n(BASELINE_BURN)} of the burn is just being alive at a desk; ${L.earned} is the hour and the walking. `
    + 'Read the week, not the day.'));

  if (P.test) {
    root.append(sect('Monthly battery — today', card(
      h('div', { class: 'cpad prose' }, TESTS.why),
      ...TESTS.items.map((t, i) => taskRow('test' + i, t, {})))));
  }

  /* A day whose load went to tomorrow has no session block to hang the undo
   * on, so the control is promoted to its own card. Without this the punt is
   * a one-way door, which is how you end up never using it. */
  if (P.punt && P.punt.awayTomorrow) {
    root.append(card(
      h('div', { class: 'cpad' },
        h('div', { class: 'rtitle' }, 'Session punted to tomorrow'),
        h('div', { class: 'rnote' }, PUNT_MODES.tomorrow.note)),
      h('div', { class: 'cpad hair' },
        h('button', { class: 'puntb undo', onclick: () => { setPunt(P.iso, null); toast('Punt undone'); } },
          'Put it back on today'))));
  }

  const list = h('div', { class: 'timeline' });
  for (const b of P.schedule) list.append(scheduleBlock(P, b));
  root.append(list);

  if (P.travel) {
    root.append(sect('Travelling', card(h('div', { class: 'cpad prose' },
      h('p', { html: '<b>Keep:</b> ' + TRAVEL.keep.join(' ') }),
      h('p', { html: '<b>Drop, deliberately:</b> ' + TRAVEL.drop.join(' ') })))));
  }

  root.append(sect('Watch', card(
    h('div', { class: 'cpad prose' },
      h('p', { html: '<b>Left knee.</b> ' + KNEE.status }),
      h('p', { html: '<b>Still outstanding:</b> ' + KNEE.open })),
    ...KNEE.exercises.map((id) => {
      const ex = EXERCISE(id);
      return ex ? taskRow('k:' + id, ex.name, { note: ex.why, exId: id }) : null;
    }).filter(Boolean))));

  root.append(sect('This week', card(
    h('div', { class: 'cpad prose' }, h('p', { html: '<b>' + P.phase.headline + '</b>' })),
    ...P.phase.focus.map((f, i) => taskRow('f:' + P.week + ':' + i, f, {})),
    h('div', { class: 'cpad prose hair' }, P.phase.note))));
}

/* ------------------------------------------------------------ library view */
const LIB = { q: '', cat: 'all' };
function renderLibrary(root) {
  const search = h('input', {
    id: 'search', type: 'search', placeholder: 'Search 47 movements…', value: LIB.q,
    oninput: (e) => { LIB.q = e.target.value; drawList(); },
  });
  const cats = h('div', { id: 'cats' });
  const areas = [...new Set(EXERCISES.flatMap((e) => e.areas || []))].sort();
  for (const c of ['all', 'mobility', 'control', 'strength', 'test', ...areas]) {
    cats.append(h('button', {
      class: 'chip' + (LIB.cat === c ? ' on' : ''),
      onclick: () => { LIB.cat = c; render(); },
    }, c === 'all' ? 'Everything' : c));
  }
  const list = h('div', {});
  root.append(search, cats, list);

  function drawList() {
    list.textContent = '';
    const q = LIB.q.trim().toLowerCase();
    const hits = EXERCISES.filter((e) => {
      if (LIB.cat !== 'all' && e.category !== LIB.cat && !(e.areas || []).includes(LIB.cat)) return false;
      if (!q) return true;
      return (e.name + ' ' + (e.areas || []).join(' ') + ' ' + (e.targets || []).join(' ') + ' ' + (e.why || ''))
        .toLowerCase().includes(q);
    });
    if (!hits.length) { list.append(h('div', { class: 'cpad prose' }, 'Nothing matches that.')); return; }
    const c = card();
    for (const e of hits) {
      c.append(h('div', { class: 'row', onclick: () => openPlayer(e.id) },
        h('div', { class: 'rmain' },
          h('div', { class: 'rtitle' }, e.name, h('span', { class: 'tag' }, e.category)),
          h('div', { class: 'rnote' }, e.why)),
        h('button', { class: 'play', html: PLAY_SVG, 'aria-label': 'show me' })));
    }
    list.append(c);
  }
  drawList();
}

/** Thousands separator. The projection prose mixes computed figures with
 *  written ones, and "2550" beside "2,200-2,400" reads as a different kind of
 *  quantity rather than the same one. */
const n = (x) => x.toLocaleString('en-US');

/* --------------------------------------------------------- the projection */
/* "I started eating the way you said and it feels like my metabolism slowed
 * down. Where am I in a month?"
 *
 * This is the section that answers it, and it goes FIRST in the plan tab
 * because it is the thing actually being asked. Three scenarios, three
 * horizons, and the honest caveats underneath rather than in a footnote —
 * the biggest risk here is not being wrong, it is being believed to one
 * decimal place. */

function projRow(sc) {
  const rows = HORIZONS.map((hz) => {
    const r = project(sc.id, hz.months);
    return h('div', { class: 'prow' },
      h('div', { class: 'ph' }, hz.label),
      h('div', { class: 'pv mono' }, r.mass + ' kg'),
      h('div', { class: 'pv mono ' + (r.dFat > 0.05 ? 'warn' : 'good') },
        (r.dFat > 0 ? '+' : '−') + Math.abs(r.dFat) + ' fat'),
      h('div', { class: 'pv mono ' + (r.dWaist < 0 ? 'good' : r.dWaist > 0 ? 'warn' : '') },
        r.waist + ' cm'),
      h('div', { class: 'pv mono' }, r.bodyFat + '%'));
  });

  return card(
    h('div', { class: 'cpad' },
      h('div', { class: 'rtitle' }, sc.name,
        h('span', { class: 'tag mono' }, n(sc.intake) + ' kcal'),
        sc.recommended ? h('span', { class: 'tag key' }, 'do this one') : null),
      h('div', { class: 'rdose' }, sc.what),
      h('div', { class: 'rnote' }, h('b', {}, sc.verdict), ' ', sc.detail)),
    h('div', { class: 'ptable hair' },
      h('div', { class: 'prow phead' },
        h('div', { class: 'ph' }, ''),
        h('div', { class: 'pv' }, 'weight'),
        h('div', { class: 'pv' }, 'fat'),
        h('div', { class: 'pv' }, 'waist'),
        h('div', { class: 'pv' }, 'bf%')),
      ...rows));
}

function renderProjection(root) {
  const burn = weeklyBurn();

  root.append(sect('Where this puts you', card(h('div', { class: 'cpad prose big' },
    h('p', { html: '<b>Your metabolism has not slowed down. The record was wrong, not the body.</b>' }),
    h('p', { html: `The plan wrote your intake down as ~1,600 kcal and read your stable weight as proof that this was maintenance. That cannot be right: your resting metabolic rate alone is about <b>${n(ENERGY.bmr)}</b>, and nobody maintains weight below their own RMR outside a starvation ward. Recalled intake under-counts by 20–30% in every study that has checked it. You were almost certainly eating <b>2,200–2,400</b> and simply not seeing it.` }),
    h('p', { html: 'So the correct read is not that your metabolism shrank. It is that one meal a day gave you <b>one protein stimulus a day</b>, and you therefore never built anything. That is why it looks soft rather than lean, and it is fixable from exactly where you are.' }),
    h('p', { html: `Against that, the plan now spends about <b>${n(burn)} kcal a day</b> averaged across the week — ${n(BASELINE_BURN)} of it just being a person at a desk, the rest the hour and the treadmill. The meal timeline delivers <b>2,500</b>. You are, near enough, at maintenance with a lot more protein and a lot more stimulus, which is the single best position to be in for what you actually asked for.` })))));

  root.append(sect('Three ways this goes', h('div', {},
    ...SCENARIOS.map((sc) => projRow(sc)))));

  root.append(sect('Reading that table', card(
    h('div', { class: 'cpad prose' },
      h('p', { html: `Starting point: <b>${PROJECTION_START.mass} kg</b>, waist <b>${PROJECTION_START.waist} cm</b>, body fat an estimated <b>${PROJECTION_START.bodyFatPct}%</b> — roughly ${PROJECTION_START.fat} kg of fat on ${PROJECTION_START.lean} kg of everything else.` }),
      h('p', { html: '<b>The answer to the question you asked:</b> on Recomp your fat mass <b>falls</b> by about 0.7 kg over two months while lean rises about 1.5 kg. The scale barely moves — 70.5 to 71.3 — and roughly 0.6 kg of even that is water in refilled muscle glycogen. Body fat goes from ~19% to ~17.8%. You do not get fatter; you get denser, and the tape says so before the scale does.' }),
      h('p', { html: '<b>Build is the one to avoid given what you just said.</b> It gains muscle fastest and gains fat with it, and the waist stops falling. That is the right trade for somebody chasing lifts. It is the wrong one for a thin, tight core.' })),
    h('div', { class: 'cpad hair' },
      h('ul', { class: 'plain' }, ...PROJECTION_NOTES.map((n) => h('li', {}, n)))))));

  root.append(sect('On ramping the protein', card(h('div', { class: 'cpad prose' },
    h('p', { html: `You said you would ramp protein and calories. <b>Ramp the protein, hold the calories.</b> The timeline already carries <b>135 g</b> — about 1.9 g per kg, which is at the top of where the evidence shows any further benefit. Going to 170 g buys nothing but a more expensive shopping list.` }),
    h('p', { html: 'Protein is also the one macronutrient worth adding on its own terms: 20–30% of it is burned in digestion against 5–10% for carbohydrate and fat, and it is by some distance the most satiating. If you want to add food, add it as protein and the fat gain largely takes care of itself.' }),
    h('p', { html: '<b>Where the calories should go if you add them:</b> the two meals around the session — breakfast and lunch. Not the evening snack, which is the dial you want free when the waist needs one.' })))));

  root.append(sect('Protein, without weighing anything', card(
    h('div', { class: 'cpad prose' },
      h('p', { html: '<b>Target ' + NUTRITION.protein + '.</b> You will not track it and prescribing tracking would not survive your schedule, so use portions instead.' }),
      h('p', { html: NUTRITION.portions }),
      h('p', { html: '<b>Takeout:</b> ' + NUTRITION.takeout })),
    ...[['morning', 'Two or three eggs, or the protein milk you already buy'],
      ['lunch', 'The office lunch, plus a protein if it is mostly rice or noodles'],
      ['afternoon', 'The shake you already have — keep it'],
      ['dinner', 'A real palm-sized portion, not just what happens to be left']]
      .map(([when, what]) => h('div', { class: 'row' }, h('div', { class: 'rmain' },
        h('div', { class: 'rtitle' }, what, h('span', { class: 'tag mono' }, when))))))));

  root.append(sect('The decision rule', card(h('div', { class: 'cpad prose' },
    h('p', { html: 'Monthly, on the first Sunday, with a tape measure:' }),
    h('p', { html: '<b>Waist down, weight flat or up.</b> Working. Change nothing.' }),
    h('p', { html: '<b>Waist flat, weight up more than 0.5 kg in a month.</b> The surplus is too big. Take out the evening snack — <b>not</b> the lunch and <b>not</b> the breakfast.' }),
    h('p', { html: '<b>Waist down, weight down more than 0.5 kg.</b> You have drifted into a deficit at a BMI where you cannot afford one. Add 250 kcal back at breakfast.' }),
    h('p', { html: '<b>Nothing moves for six weeks.</b> The likeliest cause by far is that intake is lower than you think it is. Weigh your food for three days — not forever, just long enough to calibrate the guess.' })))));
}

/* --------------------------------------------------------------- plan view */
function renderPlan(root) {
  renderProjection(root);

  root.append(sect('The finding', card(h('div', { class: 'cpad prose big' },
    h('p', { html: 'You eat roughly <b>one meal a day, at night</b> — about 1,500–1,700 kcal, almost all of it after 18:00.' }),
    h('p', { html: 'Your weight is stable, so that is now your maintenance. At 185 cm and 70 kg that is not a reassurance: it is what low muscle mass, a desk job and years of under-eating produce together.' }),
    h('p', { html: '<b>This is a building problem, not a losing one.</b> Eating less would cost the muscle that is the actual fix.' })))));

  root.append(sect('Order of leverage', card(
    ...['Eat lunch. Biggest single change available, and it costs nothing.',
      'Protein at every meal.',
      'Lift three times a week.',
      'Last coffee at 14:00.',
      'Everything else.'].map((t, i) =>
      h('div', { class: 'row' }, h('div', { class: 'tick mono', style: 'border-color:var(--line-strong);color:var(--accent);font-weight:700;font-size:14px' }, String(i + 1)),
        h('div', { class: 'rmain' }, h('div', { class: 'rtitle' }, t)))),
    h('div', { class: 'cpad prose hair' }, 'Training is third. Training on 1,600 kcal with 70 g of protein mostly produces fatigue.'))));

  root.append(sect('The look', card(h('div', { class: 'cpad prose' },
    h('p', { html: '<b>Slim and toned, not broad.</b> Out of both sessions: overhead press, lateral raises, wide-grip pulldowns, heavy bench — the four that build the shoulder-and-chest frame you do not want.' }),
    h('p', { html: 'Shoulder width is skeletal and does not change. What does change is the waist, the posture, and about 3–4 kg of muscle spread over a 185 cm frame, which is invisible as size and very visible as shape.' }),
    h('p', { html: '<b>Ceiling: about 75 kg.</b> Not a waypoint.' })))));

  root.append(sect('The hour · ' + HOUR.window, card(
    ...HOUR.shape.map((b) => h('div', { class: 'row' },
      h('div', { class: 'tick mono', style: 'border-color:var(--line-strong);color:var(--accent);font-weight:700;font-size:12px' }, String(b.mins)),
      h('div', { class: 'rmain' },
        h('div', { class: 'rtitle' }, b.what, h('span', { class: 'tag mono' }, b.at)),
        h('div', { class: 'rnote' }, b.why)))),
    h('div', { class: 'cpad prose hair' },
      h('p', { html: 'Three loaded sessions (Monday, Wednesday, Friday), two easy days, Saturday outside, Sunday off. The hour is the same hour every day so it needs no decision at 06:00.' })))));

  root.append(sect('Stretch goals', card(
    h('div', { class: 'cpad prose' },
      h('p', { html: '<b>"Get stronger" is not a target and cannot be missed.</b> Every one of these is measurable, none requires getting bigger, and all are reachable inside six months.' })),
    ...STRETCH_GOALS.map((g2) => h('div', { class: 'row' },
      h('div', { class: 'rmain' },
        h('div', { class: 'rtitle' }, g2.what, h('span', { class: 'tag' }, g2.horizon)),
        h('div', { class: 'rdose' }, 'now: ' + g2.now),
        h('div', { class: 'rnote' }, g2.why)))))));

  root.append(sect('Kit, in order', card(
    ...KIT.map((k) => h('div', { class: 'row' },
      h('div', { class: 'rmain' },
        h('div', { class: 'rtitle' }, k.what, h('span', { class: 'tag mono' }, k.cost)),
        h('div', { class: 'rnote' }, k.why)))))));

  root.append(sect('The desk treadmill', card(
    h('div', { class: 'cpad prose' },
      h('p', { html: '<b>' + TREADMILL.target + '</b>' }),
      h('p', {}, TREADMILL.why)),
    h('div', { class: 'cpad hair' }, h('ul', { class: 'plain' }, ...TREADMILL.rules.map((r) => h('li', {}, r)))))));

  const g = card();
  for (const r of GUARDRAILS) {
    g.append(h('div', { class: 'row' }, h('div', { class: 'rmain' },
      h('div', { class: 'rtitle' }, r.label),
      h('div', { class: 'rdose' }, r.target),
      h('div', { class: 'rnote' }, r.note))));
  }
  root.append(sect('Guardrails — measured monthly', g));

  root.append(sect('Travelling', card(
    h('details', { open: true }, h('summary', {}, 'What you keep'),
      h('div', { class: 'body' }, h('ul', { class: 'plain' }, ...TRAVEL.keep.map((t) => h('li', {}, t))))),
    h('details', {}, h('summary', {}, 'What you drop, deliberately'),
      h('div', { class: 'body' }, h('ul', { class: 'plain' }, ...TRAVEL.drop.map((t) => h('li', {}, t))))),
    h('details', {}, h('summary', {}, 'On arrival'),
      h('div', { class: 'body' }, h('ul', { class: 'plain' }, ...TRAVEL.arrive.map((t) => h('li', {}, t))))),
    h('details', {}, h('summary', {}, 'Coming home'),
      h('div', { class: 'body' }, h('ul', { class: 'plain' }, ...TRAVEL.home.map((t) => h('li', {}, t))))))));

  root.append(sect('Monthly battery', card(
    h('div', { class: 'cpad prose' }, h('p', { html: '<b>' + TESTS.when + '.</b> ' + TESTS.why })),
    h('div', { class: 'cpad hair' }, h('ul', { class: 'plain' }, ...TESTS.items.map((t) => h('li', {}, t)))))));

  root.append(sect('One-off', card(h('div', { class: 'cpad prose' },
    h('p', { html: '<b>Get a baseline blood panel.</b> You have never had blood work. Cheap in Taiwan.' }),
    h('p', { html: 'Ask for: fasting glucose and HbA1c; a lipid panel; ALT and AST; TSH; vitamin D; full blood count and ferritin.' }),
    h('p', {}, 'It is a baseline, not a worry. Having it means the next one means something.')))));

  root.append(h('div', { class: 'prose', style: 'font-size:14px;color:var(--text-3);text-align:center;margin:22px 0 6px' },
    'build 2026-09-15 22:53'));

  root.append(sect('The three sessions', card(
    ...Object.values(SESSIONS).map((x) => h('div', { class: 'row', onclick: () => { S.tab = 'schedule'; render(); } },
      h('div', { class: 'rmain' },
        h('div', { class: 'rtitle' }, x.name + ' · ' + x.theme, h('span', { class: 'tag' }, x.day)),
        h('div', { class: 'rdose' }, x.items.map((i) => i.label).join('  ·  ')),
        h('div', { class: 'rnote' }, x.why)))),
    h('div', { class: 'row' }, h('div', { class: 'rmain' },
      h('div', { class: 'rtitle' }, EASY.name + ' · ' + EASY.theme, h('span', { class: 'tag' }, 'Tue, Thu, Sat')),
      h('div', { class: 'rnote' }, EASY.why))))));

  root.append(sect('Weeks', card(...PHASES.map((p) => h('div', { class: 'row' },
    h('div', { class: 'rmain' },
      h('div', { class: 'rtitle' }, p.name, h('span', { class: 'tag mono' }, p.to > 100 ? 'week ' + p.from + '+' : 'weeks ' + p.from + '–' + p.to)),
      h('div', { class: 'rnote' }, p.headline)))))));
}

/* ------------------------------------------------------------------ render */
function render() {
  const P = dayPlan(S.viewing, { travel: S.travel, punts: S.punts });
  renderHeader(P);
  const root = $('#scroll');
  const y = root.scrollTop;
  root.textContent = '';
  if (S.tab === 'schedule') renderSchedule(root);
  else if (S.tab === 'library') renderLibrary(root);
  else renderPlan(root);
  root.scrollTop = y;
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === S.tab));
}

/* ============================================================== THE FIGURE */
/* The same skeleton, solver and movement library as the desktop app, drawn
 * into a 400-pixel viewport. Orthographic for the same reason as there: every
 * judgement on this figure is a comparison between two things at different
 * depths, and perspective makes the near leg longer than the far one. */
const skel = buildSkeleton({ sex: 'male', height: PROGRAMME.subject.H, mass: PROGRAMME.subject.mass });
const player = new Player();

let R = null;   // the renderer bundle, built on first open so the page boots fast
function boot3D() {
  if (R) return R;
  const canvas = $('#cv');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.castShadow = true;
  // 1024 rather than the desktop's 2048: on a phone this is the difference
  // between a smooth demonstration and a slideshow, and at this size nobody
  // can see the shadow edge anyway.
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.7;
  key.shadow.camera.near = 1; key.shadow.camera.far = 900;
  Object.assign(key.shadow.camera, { left: -140, right: 140, top: 220, bottom: -40 });
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  const rim = new THREE.DirectionalLight(0xffc79a, 0.55);
  scene.add(key, key.target, fill, rim);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -800, 1400);
  camera.up.set(0, 0, 1);

  const figure = new FIG.Figure(skel);
  const ground = FIG.makeGround(skel.subject.H);
  const props = new FIG.PropLayer();
  const held = new FIG.HeldLayer();
  const ghost = new FIG.Ghost(skel);
  scene.add(figure.root, ground, props.group, held.group, ghost.root);

  R = { renderer, scene, camera, figure, ground, props, held, ghost, key, fill, rim,
    cam: { az: 24, el: 8, d: 210 }, target: new THREE.Vector3(0, 0, 88) };
  placeCamera();
  return R;
}

function placeCamera() {
  const { camera, cam, target, key, fill, rim } = R;
  const e = cam.el * Math.PI / 180, a = cam.az * Math.PI / 180;
  camera.position.set(
    target.x + cam.d * Math.cos(e) * Math.cos(a),
    target.y + cam.d * Math.cos(e) * Math.sin(a),
    target.z + cam.d * Math.sin(e));
  camera.lookAt(target);
  const fwd = target.clone().sub(camera.position).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const put = (l, rx, ry, rz) => {
    l.position.copy(target).addScaledVector(right, rx * 300).addScaledVector(up, ry * 300).addScaledVector(fwd, -rz * 300);
    if (l.target) { l.target.position.copy(target); l.target.updateMatrixWorld(); }
  };
  put(key, 0.55, 0.75, 0.6); put(fill, -0.7, 0.1, 0.5); put(rim, 0.1, 0.35, -0.9);
}

function resize3D() {
  if (!R) return;
  const st = $('#stage');
  const w = st.clientWidth, ht = st.clientHeight;
  if (!w || !ht) return;
  R.renderer.setSize(w, ht, false);
  const asp = w / ht, half = R.cam.d * 0.5;
  R.camera.left = -half * asp; R.camera.right = half * asp;
  R.camera.top = half; R.camera.bottom = -half;
  R.camera.updateProjectionMatrix();
}

/** Frame the figure so the whole movement fits, not just the current instant.
 *  A step-down framed on its top position walks off the bottom of the screen
 *  at the bottom of the rep — so the box is the union over the whole cycle. */
function frameExercise(ex, mirror) {
  const box = new THREE.Box3();
  const tot = (ex.duration || 6) + ex.frames.reduce((a, f) => a + (f.hold || 0), 0);
  for (let i = 0; i <= 12; i++) {
    const s = sampleExercise(skel, ex, (i / 12) * tot, { mirror });
    const F = solveFrames(skel, s.pose, s.root);
    for (const b of skel.bones) {
      const f = F.get(b.name);
      const r = b.shape.type === 'limb' ? Math.max(...b.shape.r) : Math.max(b.shape.rx, b.shape.ry, b.shape.rz);
      box.expandByPoint(new THREE.Vector3(f.x.p[0] + r, f.x.p[1] + r, f.x.p[2] + r));
      box.expandByPoint(new THREE.Vector3(f.tip[0] - r, f.tip[1] - r, f.tip[2] - r));
      box.expandByPoint(new THREE.Vector3(f.x.p[0] - r, f.x.p[1] - r, f.x.p[2] - r));
      box.expandByPoint(new THREE.Vector3(f.tip[0] + r, f.tip[1] + r, f.tip[2] + r));
    }
  }
  const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const st = $('#stage');
  const asp = Math.max(0.4, st.clientWidth / Math.max(1, st.clientHeight));
  // camera.top/bottom are +-d/2 and left/right are +-d/2*aspect, so the span
  // that must fit vertically is d and horizontally is d*aspect. 1.22 is the
  // margin: enough that a lifted heel does not touch the edge, little enough
  // that a prone figure is not a stick in the middle of an empty screen.
  const spanV = Math.max(sz.z, 40), spanH = Math.max(Math.hypot(sz.x, sz.y), 30);
  R.cam.d = Math.max(spanV, spanH / asp) * 1.22;
  R.target.set(c.x, c.y, c.z);
  placeCamera(); resize3D();
}

/* ------------------------------------------------------------- the player */
const PL = { ex: null, mirror: false, speed: 1, raf: 0, last: 0 };

async function openPlayer(id) {
  const ex = EXERCISE(id);
  if (!ex) { toast('No movement called that.'); return; }
  PL.ex = ex; PL.mirror = false; PL.speed = 1;
  $('#player').hidden = false;
  $('#pname').textContent = ex.name;
  // the text is useful on its own, so it goes up before the figure exists
  renderPlayerText(ex);
  $('#plabel').textContent = THREE ? '' : 'loading\u2026';
  try {
    await loadThree();
  } catch (err) {
    $('#plabel').textContent = '';
    $('#stage').style.display = 'none';
    toast('The figure needs a connection the first time. The instructions below work without it.');
    return;
  }
  $('#stage').style.display = '';
  boot3D();
  loadEx();
  requestAnimationFrame(() => { resize3D(); frameExercise(ex, PL.mirror); });
  PL.last = performance.now();
  if (!PL.raf) PL.raf = requestAnimationFrame(tick);
}

const PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
function setPlayIcon() { $('#pplay').innerHTML = player.playing ? PAUSE_SVG : PLAY_SVG; }

function loadEx() {
  const ex = PL.ex;
  player.load(ex, { mirror: PL.mirror });
  player.speed = PL.speed;
  if (ex.view) { R.cam.az = ex.view.az * (PL.mirror ? -1 : 1); R.cam.el = ex.view.el; }
  const pf = Math.min(ex.propFrame || 0, ex.frames.length - 1);
  const at = ex.frames[pf];
  const shot = sampleExercise(skel, ex, (at.t || 0) * (ex.duration || 6) + 0.05, { mirror: PL.mirror });
  R.props.set(placeProps(skel, solveFrames(skel, shot.pose, shot.root), ex.props || [], skel.subject.H,
    { az: (ex.view ? ex.view.az : 24) * (PL.mirror ? -1 : 1) }));
  const start = sampleExercise(skel, ex, 0, { mirror: PL.mirror });
  R.ghost.showAt(solveFrames(skel, start.pose, start.root));
  $('#pmirror').textContent = PL.mirror ? 'R' : 'L';
  $('#pslow').textContent = PL.speed === 1 ? '1×' : PL.speed === 0.5 ? '½×' : '¼×';
  $('#pmirror').classList.toggle('on', PL.mirror);
  $('#pslow').classList.toggle('on', PL.speed !== 1);
  setPlayIcon();
  placeCamera();
}

function closePlayer() {
  $('#player').hidden = true;
  player.stop();
  cancelAnimationFrame(PL.raf); PL.raf = 0; PL.ex = null;
}

function tick(now) {
  PL.raf = requestAnimationFrame(tick);
  if (!PL.ex) return;
  const dt = Math.min(0.05, (now - PL.last) / 1000); PL.last = now;
  player.advance(dt);
  const s = player.sample(skel);
  if (s) {
    const F = solveFrames(skel, s.pose, s.root);
    R.figure.apply(F);
    // equipment follows the hands, so it is re-solved every frame rather than
    // placed once like the furniture
    R.held.set(placeHeld(skel, F, mirrorHolds(PL.ex.holds, PL.mirror), skel.subject.H));
    $('#plabel').textContent = s.label || '';
    if (!PL.scrubbing) $('#scrub').value = String(Math.round(player.progress() * 1000));
  }
  R.renderer.render(R.scene, R.camera);
}

/** The verbose half. This is the whole reason the app exists rather than a
 *  list of exercise names: somebody alone in a room cannot act on "watch the
 *  knee", and every observation here comes with a way of actually making it. */
function renderPlayerText(ex) {
  const p = $('#pscroll'); p.textContent = '';
  p.append(h('div', { id: 'pcue' }, h('b', {}, 'The one thing'), ex.cue));

  const need = propsNeeded(ex);
  if (need.length) {
    p.append(h('div', { class: 'psec' }, h('h3', {}, 'You need'),
      h('div', { class: 'prose big' }, need.join(', '))));
  }
  p.append(h('div', { class: 'psec' }, h('h3', {}, 'What it is for'),
    h('div', { class: 'prose' }, ex.why)));
  if (ex.setup) {
    p.append(h('div', { class: 'psec' }, h('h3', {}, 'Set up'),
      h('ul', { class: 'plain' }, ...ex.setup.map((s) => h('li', {}, s)))));
  }
  if (ex.steps) {
    p.append(h('div', { class: 'psec' }, h('h3', {}, 'The movement'),
      h('ol', { class: 'steps' }, ...ex.steps.map((s) => h('li', {}, s)))));
  }
  if (ex.look && ex.look.length) {
    const c = card();
    for (const o of ex.look) {
      c.append(h('div', { class: 'look' },
        h('div', { class: 'sg' }, o.sign),
        h('div', { class: 'hw' }, o.how),
        h('div', { class: 'mn' }, o.means)));
    }
    p.append(h('div', { class: 'psec' }, h('h3', {}, 'What to look for'), c));
  }
  if (ex.dose) {
    p.append(h('div', { class: 'psec' }, h('h3', {}, 'How much, how often'),
      h('div', { class: 'prose big' }, ex.dose)));
  }
  if (ex.stop) {
    p.append(h('div', { class: 'psec card warn', style: 'padding:15px 16px' },
      h('h3', {}, 'When to stop'), h('div', { class: 'prose' }, ex.stop)));
  }
}

/* --------------------------------------------------------------- controls */
$('#pclose').onclick = closePlayer;
$('#pplay').onclick = () => { player.toggle(); setPlayIcon(); };
$('#pmirror').onclick = () => { PL.mirror = !PL.mirror; loadEx(); frameExercise(PL.ex, PL.mirror); };
$('#pslow').onclick = () => {
  PL.speed = PL.speed === 1 ? 0.5 : PL.speed === 0.5 ? 0.25 : 1;
  player.speed = PL.speed; loadEx();
};
const scrub = $('#scrub');
scrub.addEventListener('pointerdown', () => { PL.scrubbing = true; player.playing = false; setPlayIcon(); });
scrub.addEventListener('pointerup', () => { PL.scrubbing = false; });
scrub.addEventListener('input', () => { player.seek(+scrub.value / 1000); player.sample(skel); });

/* One finger on the figure turns it. Two-finger pinch is left to the browser
 * on purpose: a zoomed-in mannequin on a phone is never what you want, and
 * fighting the page's own scroll gestures makes the whole thing feel broken. */
{
  const st = $('#stage');
  let drag = null;
  st.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, az: R ? R.cam.az : 0, el: R ? R.cam.el : 0 };
    st.setPointerCapture(e.pointerId);
    $('#phint').hidden = true;
  });
  st.addEventListener('pointermove', (e) => {
    if (!drag || !R) return;
    R.cam.az = drag.az - (e.clientX - drag.x) * 0.55;
    R.cam.el = Math.max(-45, Math.min(70, drag.el + (e.clientY - drag.y) * 0.4));
    placeCamera();
  });
  const end = () => { drag = null; };
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', end);
}

$$('.tab').forEach((t) => { t.onclick = () => { S.tab = t.dataset.tab; $('#scroll').scrollTop = 0; render(); }; });
$('#travel').onclick = () => {
  S.travel = !S.travel;
  store.set('pt.travel', S.travel ? '1' : '0');
  toast(S.travel ? 'Travel mode: anchor, bands, walking, four palms.' : 'Back to the normal week.');
  render();
};
addEventListener('resize', () => { resize3D(); });
/* Chrome on iOS resizes the viewport as the address bar collapses, which
 * happens on the first scroll and would otherwise leave the canvas stretched. */
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => resize3D());

/* The date has to be re-read rather than captured at load: this page is meant
 * to be left open on a nightstand, and at 00:01 it should be tomorrow. */
setInterval(() => {
  const now = new Date();
  const rolled = isoDay(now) !== isoDay(S.date);
  const wasToday = isoDay(S.viewing) === isoDay(S.date);
  S.date = now;
  if (rolled && wasToday) { S.viewing = now; loadTicks(); }
  if (S.tab === 'schedule') render();
}, 30000);

/* If anything above threw, the page would be a fully-styled corpse: header
 * stubs, empty body, tabs that do nothing. Say so instead. A phone app that
 * fails silently is indistinguishable from one that is merely slow, and the
 * person holding it has no console. */
function fatal(err) {
  const m = $('#scroll');
  if (m) {
    m.textContent = '';
    m.append(h('div', { class: 'card', style: 'padding:18px 16px' },
      h('div', { class: 'rtitle' }, 'This did not load'),
      h('div', { class: 'rnote' }, String((err && err.message) || err)),
      h('div', { class: 'rnote' }, 'Reload once. If it says the same thing again, that message is the bug report.')));
  }
  $('#dayname').textContent = 'Error';
  $('#datesub').textContent = 'the page loaded, the app did not';
  throw err;
}

try {
  loadTicks();
  render();
} catch (err) { fatal(err); }

/* Offline, and instant on the second open. Wrapped because a sandboxed origin
 * (an artifact preview, say) refuses to register one, and that must not take
 * the app down with it — everything above works without a service worker, it
 * just needs a network. */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* not available here */ });
  });
}
addEventListener('error', (e) => { if (!$('#scroll').children.length) fatal(e.error || e.message); });
