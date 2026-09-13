const { useState, useEffect, useLayoutEffect, useRef, useReducer, useCallback } = React;

// ===================== Storage / data model =====================

const STORAGE_KEY = 'fitnessApp.v1';

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// An exercise carries its own complete set of parameters — there is no
// category (or any other shared timing profile) sitting behind it anymore.
// That is the whole point of this model: adding, removing or reordering an
// exercise can never change how any *other* exercise runs, and what the
// Timer counts down is always exactly what the exercise itself says.
//
// sides: 'together' (both arms/legs work at once, e.g. a squat or bench
// press) or 'alternating' (you work one side, then the other, e.g. a
// one-arm row or reverse lunges). It labels the exercise and seeds the
// default work/rest times of a new one — nothing reads it at runtime.
// sets: how many work/rest rounds this exercise runs before it's done.
// workSec/restSec: the length of the work and rest halves of one round.
const DEFAULT_WORK_SEC = 80;
const DEFAULT_REST_SEC = 30;
// One side at a time takes longer to work through and needs less rest
// afterwards, so a new 'alternating' exercise starts from these instead.
const DEFAULT_ALT_WORK_SEC = 105;
const DEFAULT_ALT_REST_SEC = 20;
const DEFAULT_SETS = 3;

function defaultWorkSecFor(sides) { return sides === 'alternating' ? DEFAULT_ALT_WORK_SEC : DEFAULT_WORK_SEC; }
function defaultRestSecFor(sides) { return sides === 'alternating' ? DEFAULT_ALT_REST_SEC : DEFAULT_REST_SEC; }

function ex(name, description, sides = 'together', sets = DEFAULT_SETS, workSec = null, restSec = null, weightKg = null, supersetWithNext = false) {
  return {
    id: uid('ex'),
    name,
    description,
    sides,
    sets,
    workSec: workSec != null ? workSec : defaultWorkSecFor(sides),
    restSec: restSec != null ? restSec : defaultRestSecFor(sides),
    weightKg,
    supersetWithNext,
  };
}

// Every read of an exercise's parameters goes through these, so a
// half-filled exercise still runs with something sane instead of NaN.
function exWorkSec(e) { return e && e.workSec != null ? e.workSec : DEFAULT_WORK_SEC; }
function exRestSec(e) { return e && e.restSec != null ? e.restSec : DEFAULT_REST_SEC; }
function exSets(e) { return e && e.sets != null ? e.sets : DEFAULT_SETS; }

// The one place an exercise is turned back into a fully-shaped, in-range
// object — used by the settings sheet, the workout editor and the state
// migration alike, so every path into storage produces the same shape.
function normalizeExercise(e) {
  const sides = e.sides === 'alternating' ? 'alternating' : 'together';
  // Number(null) is 0, not NaN, so absent/blank has to be caught before the
  // conversion — otherwise a missing rest time would silently become "no rest".
  const work = e.workSec == null || e.workSec === '' ? NaN : Number(e.workSec);
  const rest = e.restSec == null || e.restSec === '' ? NaN : Number(e.restSec);
  return {
    id: e.id || uid('ex'),
    name: (e.name || '').trim(),
    description: (e.description || '').trim(),
    sides,
    sets: clamp(Number(e.sets) || DEFAULT_SETS, 1, 50),
    workSec: clamp(Number.isFinite(work) && work > 0 ? work : defaultWorkSecFor(sides), 1, 3599),
    restSec: clamp(Number.isFinite(rest) && rest >= 0 ? rest : defaultRestSecFor(sides), 0, 3599),
    weightKg: e.weightKg == null || Number.isNaN(Number(e.weightKg)) ? null : Number(e.weightKg),
    supersetWithNext: !!e.supersetWithNext,
  };
}

// One-line "what this exercise does" recap, shown wherever an exercise is
// listed but not opened — the checklist card and the workout editor.
function exerciseSummary(e) {
  const parts = [`Work ${fmtTime(exWorkSec(e))}`, `Rest ${fmtTime(exRestSec(e))}`, `${exSets(e)} sets`];
  if (e.sides === 'alternating') parts.push('One side');
  if (e.weightKg != null) parts.push(`${formatWeightKg(e.weightKg)} kg`);
  return parts.join(' · ');
}

// Weight is always stored in kg — entry can happen in kg or lb, converted
// on the way in, so the plan only ever needs to display one unit.
const LB_PER_KG = 2.20462262185;
function kgToLb(kg) { return kg * LB_PER_KG; }
function lbToKg(lb) { return lb / LB_PER_KG; }
function formatWeightKg(kg) {
  return (Math.round(kg * 100) / 100).toString();
}

// A superset is a run of consecutive exercises chained by `supersetWithNext`
// (exercise N sets it to link itself to exercise N+1): they run back-to-back
// with no rest in between, sharing the round count of the first (leader)
// exercise, with rest only after the last member of each round. Grouping
// exercises this way (instead of a separate group-id field) means chain
// length falls out of a single boolean per exercise with no extra state to
// keep in sync when exercises are added, removed, or reordered.
function computeExerciseGroups(exercises) {
  const groups = [];
  let i = 0;
  while (i < exercises.length) {
    const start = i;
    while (i < exercises.length && exercises[i].supersetWithNext) i++;
    if (i < exercises.length) i++; // include the member that ends the chain
    groups.push(exercises.slice(start, i));
  }
  return groups;
}
function findGroupFor(exercises, exerciseId) {
  return computeExerciseGroups(exercises).find(g => g.some(e => e.id === exerciseId)) || null;
}

// Maps each exercise name to its old Hebrew cue and new English cue, so we
// can both seed fresh installs in English and migrate already-saved Hebrew
// descriptions (from earlier versions of this app) without touching any
// custom text a user typed in themselves.
const EXERCISE_DESCRIPTIONS = {
  'Dumbbell RDL': ['כיפוף מפרק הירך בלבד, דחיפת הישבן אחורה והורדת משקולות צמוד לשוקיים.', 'Hinge at the hips only, push your hips back, and lower the dumbbells close to your shins.'],
  'Dumbbell Bench Press': ['שכיבה על ספסל שטוח ודחיפת משקולות ישר למעלה.', 'Lie on a flat bench and press the dumbbells straight up.'],
  'Lat Pulldown': ['ישיבה במכונה ומשיכת מוט רחב מלמעלה למטה אל קו החזה.', 'Sit at the machine and pull a wide bar down from overhead to chest level.'],
  'Seated DB Shoulder Press': ['ישיבה על ספסל זקוף ודחיפת משקולות מגובה הכתפיים מעל הראש.', 'Sit upright on a bench and press the dumbbells overhead from shoulder height.'],
  'Dumbbell Bicep Curls': ['עמידה והרמת משקולות אל הכתפיים על ידי כיפוף המרפקים.', 'Stand and curl the dumbbells toward your shoulders by bending your elbows.'],
  'Plank Mountain Climbers': ['מצב פלאנק על האמות והבאת ברכיים חלופיות לכיוון החזה.', 'Hold a forearm plank and drive alternating knees toward your chest.'],
  'Goblet Squat': ['ירידה לסקוואט כששתי הידיים מחזיקות משקולת אחת צמודה לחזה.', 'Squat down while holding a single dumbbell with both hands close to your chest.'],
  'Incline Dumbbell Press': ['לחיצת משקולות למעלה כשהספסל בשיפוע אלכסוני (חצי ישיבה).', 'Press the dumbbells upward on a bench set to an incline (half-seated position).'],
  'One-Arm Dumbbell Row': ['ברך ויד אחת נשענות על ספסל, והיד השנייה מושכת משקולת אל האגן.', 'One knee and hand rest on a bench while the other hand pulls a dumbbell toward your hip.'],
  'Dumbbell Reverse Lunges': ['עמידה עם משקולות בידיים ולקיחת צעד גדול אחורה תוך ירידה לברך.', 'Stand holding dumbbells and take a big step backward while lowering into a lunge.'],
  'Tricep Pushdown': ['עמידה מול הפולי עליון ודחיפת החבל למטה עד יישור הזרועות.', 'Stand facing the high pulley and push the rope down until your arms are fully extended.'],
  'Side Plank Dips': ['פלאנק על הצד והרמה/הורדה של האגן באוויר.', 'Hold a side plank and raise/lower your hips in the air.'],
};
const LEGACY_DESCRIPTION_TO_ENGLISH = Object.fromEntries(
  Object.values(EXERCISE_DESCRIPTIONS).map(([legacy, english]) => [legacy, english])
);

// Best-effort default `sides` for the seeded exercise names, used only to
// backfill installs saved before that field existed (see migrateState) —
// exercises the user has actually set (or created themselves) always keep
// their real value.
const DEFAULT_SIDES_BY_NAME = {
  'One-Arm Dumbbell Row': 'alternating',
  'Dumbbell Reverse Lunges': 'alternating',
  'Side Plank Dips': 'alternating',
};

function defaultWorkouts() {
  return [
    {
      id: 'wk-a',
      name: 'Workout A',
      inRotation: true,
      exercises: [
        ex('Dumbbell RDL', EXERCISE_DESCRIPTIONS['Dumbbell RDL'][1]),
        ex('Dumbbell Bench Press', EXERCISE_DESCRIPTIONS['Dumbbell Bench Press'][1]),
        ex('Lat Pulldown', EXERCISE_DESCRIPTIONS['Lat Pulldown'][1]),
        ex('Seated DB Shoulder Press', EXERCISE_DESCRIPTIONS['Seated DB Shoulder Press'][1]),
        ex('Dumbbell Bicep Curls', EXERCISE_DESCRIPTIONS['Dumbbell Bicep Curls'][1]),
        ex('Plank Mountain Climbers', EXERCISE_DESCRIPTIONS['Plank Mountain Climbers'][1]),
      ],
    },
    {
      id: 'wk-b',
      name: 'Workout B',
      inRotation: true,
      exercises: [
        ex('Goblet Squat', EXERCISE_DESCRIPTIONS['Goblet Squat'][1]),
        ex('Incline Dumbbell Press', EXERCISE_DESCRIPTIONS['Incline Dumbbell Press'][1]),
        ex('One-Arm Dumbbell Row', EXERCISE_DESCRIPTIONS['One-Arm Dumbbell Row'][1], 'alternating'),
        ex('Dumbbell Reverse Lunges', EXERCISE_DESCRIPTIONS['Dumbbell Reverse Lunges'][1], 'alternating'),
        ex('Tricep Pushdown', EXERCISE_DESCRIPTIONS['Tricep Pushdown'][1]),
        ex('Side Plank Dips', EXERCISE_DESCRIPTIONS['Side Plank Dips'][1], 'alternating'),
      ],
    },
  ];
}

function defaultState() {
  const workouts = defaultWorkouts();
  return {
    workouts,
    workoutProgress: {},
    activeWorkoutId: workouts[0].id,
    soundEnabled: true,
    currentExerciseOverride: {},
    autoRunWorkoutId: null,
  };
}

function loadRawState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load state', e);
  }
  return null;
}

// Fills in anything missing so older saved states (or a first-ever visit)
// always end up with a fully-shaped, usable object.
function migrateState(loaded) {
  const state = loaded ? { ...loaded } : defaultState();
  // Categories are gone: an exercise that used to borrow its timing from one
  // now owns that timing outright. Which category to bake in is decided the
  // same way Auto mode used to pick one — the one with alternating-sides
  // timing configured (the weights profile this app is actually used with),
  // else whatever was selected last — so a saved install keeps running with
  // the exact numbers it ran with before this refactor.
  const legacyCats = Array.isArray(state.categories) ? state.categories : [];
  const legacyCat = legacyCats.find(c => c.altWorkSec != null)
    || legacyCats.find(c => c.id === state.selectedCategoryId)
    || legacyCats[0]
    || null;
  delete state.categories;
  delete state.selectedCategoryId;
  if (!state.workouts || state.workouts.length === 0) state.workouts = defaultWorkouts();
  // Translate any leftover Hebrew exercise cues from earlier versions of
  // this app into English, without touching text the user typed themselves.
  // Also backfill `sides`/`sets` on exercises saved before those fields existed.
  state.workouts = state.workouts.map(w => ({
    ...w,
    // Only the two original workouts auto-advance into each other after a
    // finish; any other workout (imported, duplicated, or otherwise added)
    // defaults to manual-only — you switch to it yourself when you want it.
    inRotation: typeof w.inRotation === 'boolean' ? w.inRotation : (w.id === 'wk-a' || w.id === 'wk-b'),
    exercises: w.exercises.map(e => {
      const translated = LEGACY_DESCRIPTION_TO_ENGLISH[e.description];
      // Only ever backfill when the field is truly absent (pre-migration
      // data) — once `sides` exists, it's the user's real choice and is
      // never second-guessed by name again.
      const sides = e.sides == null ? (DEFAULT_SIDES_BY_NAME[e.name] || 'together') : e.sides;
      const alt = sides === 'alternating';
      // null work/rest used to mean "inherit from the category" — that's
      // what gets resolved into a real number here, once.
      const inheritedWork = legacyCat ? ((alt && legacyCat.altWorkSec != null) ? legacyCat.altWorkSec : legacyCat.workSec) : null;
      const inheritedRest = legacyCat ? ((alt && legacyCat.altRestSec != null) ? legacyCat.altRestSec : legacyCat.restSec) : null;
      return normalizeExercise({
        ...e,
        description: translated || e.description,
        sides,
        sets: e.sets != null ? e.sets : (legacyCat && legacyCat.rounds) || DEFAULT_SETS,
        workSec: e.workSec != null ? e.workSec : inheritedWork,
        restSec: e.restSec != null ? e.restSec : inheritedRest,
        weightKg: e.weightKg === undefined ? null : e.weightKg,
      });
    }),
  }));
  if (!state.workoutProgress) state.workoutProgress = {};
  if (!state.activeWorkoutId || !state.workouts.find(w => w.id === state.activeWorkoutId)) {
    state.activeWorkoutId = state.workouts[0].id;
  }
  if (typeof state.soundEnabled !== 'boolean') state.soundEnabled = true;
  if (!state.currentExerciseOverride) state.currentExerciseOverride = {};
  if (state.autoRunWorkoutId === undefined) state.autoRunWorkoutId = null;
  return state;
}

function fmtTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ===================== Icons (thin line, SF-Symbol style) =====================

function Icon({ children, className = 'w-5 h-5', ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className={className} {...rest}>
      {children}
    </svg>
  );
}
const PlayIcon = (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M8 5v14l11-7L8 5Z" /></Icon>;
const PauseIcon = (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></Icon>;
const ResetIcon = (p) => <Icon {...p}><path d="M4 4v6h6" /><path d="M20 20a9 9 0 1 0-3-16.7L4 10" /></Icon>;
const SkipIcon = (p) => <Icon {...p}><path d="M5 4v16l10-8-10-8Z" /><path d="M18 5v14" /></Icon>;
const VolumeIcon = (p) => <Icon {...p}><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a9 9 0 0 1 0 13" /></Icon>;
const MuteIcon = (p) => <Icon {...p}><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M17 9l4 6M21 9l-4 6" /></Icon>;
const PlusIcon = (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
const TrashIcon = (p) => <Icon {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Icon>;
const GearIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5c.04-.5.04-1 0-1.5l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.3-.8L15.3 5h-4l-.4 2.2c-.5.2-.9.5-1.3.8l-2.3-.9-2 3.4L7.2 12c-.04.5-.04 1 0 1.5l-1.9 1.5 2 3.4 2.3-.9c.4.3.8.6 1.3.8L11.3 20h4l.4-2.2c.5-.2.9-.5 1.3-.8l2.3.9 2-3.4-1.9-1.5Z" /></Icon>;
const ChevronLeftIcon = (p) => <Icon {...p}><path d="M15 18l-6-6 6-6" /></Icon>;
const CheckIcon = (p) => <Icon {...p} fill="none" strokeWidth="2.4"><path d="M5 13l4 4L19 7" /></Icon>;
const ClockIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Icon>;
const ChecklistIcon = (p) => <Icon {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.2 1.2L6.8 5" /><path d="m3.5 12 1.2 1.2L6.8 11" /><path d="m3.5 18 1.2 1.2L6.8 17" /></Icon>;

// ===================== Small shared UI =====================

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="flex bg-iosseparator rounded-xl p-1 gap-1">
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 text-[13px] font-medium rounded-lg transition-all ${
            value === opt.value ? 'bg-white text-ioslabel shadow-sm' : 'text-iossecondary'
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TabBar({ tab, onChange }) {
  const items = [
    { value: 'workouts', label: 'Workouts', Icon: ChecklistIcon },
    { value: 'timer', label: 'Timer', Icon: ClockIcon },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-md border-t border-iosseparator"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md mx-auto flex">
        {items.map(({ value, label, Icon }) => {
          const active = tab === value;
          return (
            <button key={value} onClick={() => onChange(value)}
              className="flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5">
              <Icon className={`w-6 h-6 ${active ? 'text-iosblue' : 'text-iossecondary'}`} strokeWidth={active ? '2' : '1.6'} />
              <span className={`text-[10px] font-medium ${active ? 'text-iosblue' : 'text-iossecondary'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompletionOverlay({ celebration }) {
  if (!celebration) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-10">
      <div className="bg-white rounded-3xl shadow-2xl px-8 py-9 flex flex-col items-center gap-2.5 text-center max-w-xs w-full animate-[popIn_0.28s_cubic-bezier(0.34,1.56,0.64,1)]">
        <div className="w-16 h-16 rounded-full bg-[#34C75926] flex items-center justify-center mb-1">
          <CheckIcon className="w-8 h-8 text-iosgreen" strokeWidth="2.8" />
        </div>
        <div className="text-[20px] font-bold">Great job!</div>
        <div className="text-[14px] text-iossecondary">You finished {celebration.finishedName}.</div>
        {celebration.nextName && (
          <div className="text-[13px] text-iosblue font-medium mt-1">Switching to {celebration.nextName}…</div>
        )}
      </div>
    </div>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-ioscard rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </div>
  );
}

function IconButton({ onClick, children, className = '', title }) {
  return (
    <button onClick={onClick} title={title}
      className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-iossecondary hover:bg-iosseparator active:scale-95 transition ${className}`}>
      {children}
    </button>
  );
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ---- iOS-style scrolling wheel picker (like the alarm clock time picker) ----
const WHEEL_ITEM_HEIGHT = 40;
const WHEEL_VISIBLE_COUNT = 5;

function WheelColumn({ values, value, onChange, formatItem }) {
  const containerRef = useRef(null);
  const settleTimer = useRef(null);
  const readyRef = useRef(false);
  const padding = (WHEEL_ITEM_HEIGHT * (WHEEL_VISIBLE_COUNT - 1)) / 2;

  // Positioning is entirely JS-driven (no CSS scroll-snap) so there is only
  // one system ever setting scrollTop — CSS scroll-snap fighting a JS-set
  // position (especially while an ancestor is mid CSS-animation) is what
  // caused this to silently reset back to 0 before.
  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = values.indexOf(value) * WHEEL_ITEM_HEIGHT;
    }
    readyRef.current = true;
    // eslint-disable-next-line
  }, []);

  function handleScroll() {
    if (!readyRef.current) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const idx = clamp(Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT), 0, values.length - 1);
      el.scrollTo({ top: idx * WHEEL_ITEM_HEIGHT, behavior: 'smooth' });
      if (values[idx] !== value) onChange(values[idx]);
    }, 120);
  }

  return (
    <div ref={containerRef} onScroll={handleScroll}
      className="overflow-y-scroll no-scrollbar w-24"
      style={{ height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT, paddingTop: padding, paddingBottom: padding }}>
      {values.map(v => (
        <div key={v} className="flex items-center justify-center text-[22px] font-semibold tabular-nums transition-colors"
          style={{ height: WHEEL_ITEM_HEIGHT, color: v === value ? '#1C1C1E' : '#C7C7CC' }}>
          {formatItem(v)}
        </div>
      ))}
    </div>
  );
}

function TimePickerSheet({ title, sec, onCancel, onDone }) {
  const [min, setMin] = useState(Math.floor(sec / 60));
  const [s, setS] = useState(sec % 60);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const seconds = Array.from({ length: 60 }, (_, i) => i);

  function handleDone() {
    let total = min * 60 + s;
    if (total === 0) total = 1;
    onDone(total);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/30" />
      <div onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_ease]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-iosseparator">
          <button onClick={onCancel} className="text-iosblue text-[16px] px-1">Cancel</button>
          <div className="font-semibold text-[16px]">{title}</div>
          <button onClick={handleDone} className="text-iosblue font-semibold text-[16px] px-1">Done</button>
        </div>
        <div className="relative flex items-center justify-center py-3">
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-10 bg-iosbg rounded-xl pointer-events-none" />
          <div className="flex items-center relative">
            <WheelColumn values={minutes} value={min} onChange={setMin} formatItem={v => `${v} min`} />
            <WheelColumn values={seconds} value={s} onChange={setS} formatItem={v => `${String(v).padStart(2, '0')} sec`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeRow({ label, sec, onCommit }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex flex-col gap-1.5 items-center bg-iosbg rounded-xl px-2 py-2.5 active:bg-iosseparator transition-colors">
        <span className="text-[11px] text-iossecondary font-medium">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums">{fmtTime(sec)}</span>
      </button>
      {open && (
        <TimePickerSheet title={label} sec={sec}
          onCancel={() => setOpen(false)}
          onDone={v => { onCommit(v); setOpen(false); }} />
      )}
    </>
  );
}

// Single-wheel counter picker (rounds, sets, etc.) — same sheet chrome as
// TimePickerSheet, but one column of plain integers instead of min/sec.
function CountPickerSheet({ title, value, max, onCancel, onDone }) {
  const [v, setV] = useState(value);
  const values = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/30" />
      <div onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_ease]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-iosseparator">
          <button onClick={onCancel} className="text-iosblue text-[16px] px-1">Cancel</button>
          <div className="font-semibold text-[16px]">{title}</div>
          <button onClick={() => onDone(v)} className="text-iosblue font-semibold text-[16px] px-1">Done</button>
        </div>
        <div className="relative flex items-center justify-center py-3">
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-10 bg-iosbg rounded-xl pointer-events-none" />
          <WheelColumn values={values} value={v} onChange={setV} formatItem={n => `${n}`} />
        </div>
      </div>
    </div>
  );
}

function CountRow({ label, value, max, onCommit }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex flex-col gap-1.5 items-center bg-iosbg rounded-xl px-2 py-2.5 active:bg-iosseparator transition-colors">
        <span className="text-[11px] text-iossecondary font-medium">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums">{value}</span>
      </button>
      {open && (
        <CountPickerSheet title={label} value={value} max={max}
          onCancel={() => setOpen(false)}
          onDone={v => { onCommit(v); setOpen(false); }} />
      )}
    </>
  );
}

// ===================== Timer Tab =====================

const PHASE_LABELS = { idle: 'Ready', countdown: 'Get Ready', work: 'Work', rest: 'Rest', done: 'Done! 🎉' };
const COUNTDOWN_SEC = 3;

function TimerTab({ soundEnabled, onToggleSound, currentExercise, workoutName,
  currentGroup, nextExercise, autoRun, onAutoExerciseComplete, onStopAuto }) {
  const phaseRef = useRef('idle'); // idle | countdown | work | rest | done
  const roundRef = useRef(1);
  const remainingRef = useRef(DEFAULT_WORK_SEC);
  const phaseTotalRef = useRef(DEFAULT_WORK_SEC);
  const phaseEndAtRef = useRef(0);
  const runningRef = useRef(false);
  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const compressorRef = useRef(null);
  const audioElRef = useRef(null);
  const wakeLockRef = useRef(null);
  const effectiveRef = useRef({ workSec: DEFAULT_WORK_SEC, restSec: DEFAULT_REST_SEC, rounds: DEFAULT_SETS });
  // Which member of a superset group is currently in its work phase — always
  // 0 for a plain single exercise. Reset to 0 whenever a fresh round begins.
  const groupMemberIndexRef = useRef(0);
  const groupRef = useRef([]);
  const autoStartedForRef = useRef(null); // id of the exercise the current Auto cycle was started for
  const autoCompletedForRef = useRef(null); // guards against double-firing completion for the same 'done' state
  const autoFirstDoneRef = useRef(false); // true once this Auto *run* has done its one countdown
  const [, forceRender] = useReducer(x => x + 1, 0);

  // If the app is closed/reloaded while Auto is active, `autoRun` comes back
  // true again on the very first render from persisted state — but that
  // should NOT resume the timer on its own; the user should have to press
  // Play. Lazily captured once, on this component's actual first render, so
  // pressing the Auto button later in the same live session (a real false ->
  // true transition, not "already true on mount") is unaffected.
  const autoSuppressedRef = useRef(null);
  if (autoSuppressedRef.current === null) autoSuppressedRef.current = autoRun;

  // The current exercise (or, for a superset, the active member of the
  // current group) can change mid-phase (e.g. you tap a different exercise
  // on the checklist while resting) — that must NOT interrupt a running
  // phase. So this is just a plain assignment on every render (not a
  // useEffect), and every phase-transition function below reads from these
  // refs at the moment it fires rather than closing over props directly.
  // That means: a running phase always finishes with whatever timing it
  // started with, and only the *next* phase transition picks up whatever is
  // newly current.
  groupRef.current = (currentGroup && currentGroup.length) ? currentGroup : (currentExercise ? [currentExercise] : []);
  // Every number the engine runs on comes straight off the exercise itself.
  function effectiveFor(member) {
    return { workSec: exWorkSec(member), restSec: exRestSec(member) };
  }
  const activeMember = groupRef.current[groupMemberIndexRef.current] || groupRef.current[0] || currentExercise;
  effectiveRef.current = {
    ...effectiveFor(activeMember),
    // A superset takes its round count from the exercise that leads it.
    rounds: exSets(groupRef.current[0] || activeMember),
  };

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  // Moving to a different exercise (you tapped another one, checked this one
  // off, or edited which exercise leads the group) rewinds the timer to the
  // start of that exercise — but never mid-phase: a phase that is actually
  // running always finishes on the numbers it started with, and only the
  // next phase picks up anything new. That is what keeps editing an exercise
  // from breaking a run already in progress.
  const leaderId = (groupRef.current[0] && groupRef.current[0].id) || null;
  useEffect(() => {
    if (runningRef.current) return;
    clearInterval(intervalRef.current);
    phaseRef.current = 'idle';
    roundRef.current = 1;
    groupMemberIndexRef.current = 0;
    phaseTotalRef.current = effectiveRef.current.workSec;
    remainingRef.current = effectiveRef.current.workSec;
    forceRender();
    // eslint-disable-next-line
  }, [leaderId]);

  const phase = phaseRef.current;
  const round = roundRef.current;
  const remaining = phase === 'idle' ? effectiveRef.current.workSec : remainingRef.current;
  const total = phase === 'idle' ? effectiveRef.current.workSec : phaseTotalRef.current;
  const running = runningRef.current;

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (e) { /* not visible / unsupported */ }
  }
  function releaseWakeLock() {
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
  }
  useEffect(() => {
    if (running) acquireWakeLock(); else releaseWakeLock();
  }, [running]);
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && runningRef.current) acquireWakeLock();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Auto mode resets its "first exercise of this run" tracking at the exact
  // moment a new Auto run begins (autoRun going false -> true), so stopping
  // and starting it again later still gets one fresh countdown for whatever
  // exercise it resumes on.
  useEffect(() => {
    if (autoRun) autoFirstDoneRef.current = false;
  }, [autoRun]);

  // Auto mode, part 1: whenever a new exercise becomes current while nothing
  // is actively running (idle, or just finished), kick off its work/rest
  // cycle on its own — no Start tap needed. Only the very first exercise of
  // an Auto run gets the 3-2-1 countdown; every exercise after that jumps
  // straight into work (see beginWorkDirectly). Guarded so it only fires
  // once per exercise (never interrupts a phase already in progress).
  useEffect(() => {
    if (!autoRun || !currentExercise) return;
    if (autoSuppressedRef.current) return; // resumed after a reload — wait for a manual Start/Resume
    if (currentExercise.id === autoStartedForRef.current) return;
    if (phase !== 'idle' && phase !== 'done') return;
    autoStartedForRef.current = currentExercise.id;
    autoCompletedForRef.current = null;
    if (autoFirstDoneRef.current) {
      beginWorkDirectly();
    } else {
      autoFirstDoneRef.current = true;
      start();
    }
    // eslint-disable-next-line
  }, [autoRun, currentExercise && currentExercise.id, phase]);

  // Auto mode, part 2: once an exercise's sets are all done, check it off —
  // which advances the App's "current exercise" to the next one, which part
  // 1 above then picks up automatically.
  useEffect(() => {
    // Reads phaseRef (not the `phase` snapshot from this render) because Auto
    // mode's part-1 effect above can run in the same pass and immediately
    // move the ref off 'done' (e.g. Auto gets switched on while a previous
    // *manual* run had been left sitting at 'done') — checking the stale
    // snapshot here would otherwise mark the exercise complete without it
    // ever actually having run under Auto.
    if (!autoRun || phaseRef.current !== 'done' || !currentExercise) return;
    if (autoCompletedForRef.current === currentExercise.id) return;
    autoCompletedForRef.current = currentExercise.id;
    onAutoExerciseComplete(currentExercise.id);
    // eslint-disable-next-line
  }, [autoRun, phase]);

  // Keeps the tone pipeline routed through a real, continuously-playing <audio>
  // element (via a MediaStream) instead of straight to ctx.destination, since
  // mobile browsers are far more lenient about background execution/audio for
  // tabs that are actively playing an <audio>/<video> element than for raw
  // Web Audio oscillators, which are normally treated as "ambient" and can be
  // throttled or silenced once the app is minimized.
  function ensureAudio() {
    if (!soundEnabled) return null;
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const compressor = ctx.createDynamicsCompressor();
      audioCtxRef.current = ctx;
      compressorRef.current = compressor;
      let streamed = false;
      try {
        if (ctx.createMediaStreamDestination) {
          const dest = ctx.createMediaStreamDestination();
          compressor.connect(dest);
          if (!audioElRef.current) audioElRef.current = new Audio();
          audioElRef.current.srcObject = dest.stream;
          audioElRef.current.playsInline = true;
          const p = audioElRef.current.play();
          if (p && p.catch) p.catch(() => {});
          streamed = true;
        }
      } catch (e) { /* fall back below */ }
      if (!streamed) compressor.connect(ctx.destination);
      // 'playback' is exclusive on iOS: activating it PAUSES Spotify/Music
      // outright, immediately, not just a brief duck — confirmed too
      // disruptive to keep. 'transient' is the category actually meant for
      // sounds that layer on top of other audio without taking it over.
      // The real tradeoff this leaves unsolved: the web platform has no
      // category that is both non-exclusive AND guaranteed to keep running
      // once another app is frontmost, so under 'transient' iOS can suspend
      // this page while backgrounded and a missed round-end only plays (in
      // a burst) once you switch back. Not pausing your music is the
      // priority for now — see the reply in chat for the full tradeoff.
      try { if ('audioSession' in navigator) navigator.audioSession.type = 'transient'; } catch (e) {}
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    if (audioElRef.current && audioElRef.current.paused) {
      const p = audioElRef.current.play();
      if (p && p.catch) p.catch(() => {});
    }
    return audioCtxRef.current;
  }

  // Every sound in the app is built from this one block: two oscillators of
  // the same waveform, a few Hz apart, both with a near-instant attack. The
  // slight detuning creates an audible "beating" edge — the same trick
  // sports watches and alarms use to make a tone impossible to tune out —
  // and reusing one engine everywhere is what keeps the very different
  // sounds below (a piercing countdown tick, a clean medical-monitor beep,
  // high alert chimes, a low buzzer) feeling like one consistent voice
  // instead of unrelated noises bolted together.
  function playBeep(ctx, freq, startTime, duration, volume = 1, type = 'square', detuneHz = 8) {
    const dest = compressorRef.current;
    [freq, freq + detuneHz].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const v = i === 0 ? volume : volume * 0.75;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(v, startTime + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  const TICK_DURATION = 0.10;

  function playChime(type) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    if (type === 'rest') {
      // Descending pair, same high "sports watch" register as the ticks.
      playBeep(ctx, 2349, t0, 0.11, 1, 'square', 8);
      playBeep(ctx, 1760, t0 + 0.14, 0.15, 1, 'square', 8);
    } else if (type === 'work') {
      // Ascending pair — mirror image of 'rest' so the two are easy to tell apart by ear.
      playBeep(ctx, 1760, t0, 0.11, 1, 'square', 8);
      playBeep(ctx, 2349, t0 + 0.14, 0.15, 1, 'square', 8);
    } else if (type === 'finish') {
      // The exact same voice as the countdown ticks (same pitch/waveform/
      // detune) so finishing all rounds is instantly recognizable as
      // "that countdown sound again" — just 4 pulses instead of 3, and
      // each one held a bit longer.
      for (let i = 0; i < 4; i++) {
        playBeep(ctx, 2637, t0 + i * 0.24, 0.16, 1, 'square', 10);
      }
    }
  }

  // Sharp, piercing, high-pitched countdown tick — deliberately far higher
  // than the chimes below so it reads unmistakably as "counting down."
  function playTick(n) {
    const ctx = ensureAudio();
    if (!ctx) return;
    playBeep(ctx, 2637, ctx.currentTime, TICK_DURATION, 1, 'square', 10);
  }

  // Fires once, right as the countdown hits zero and work actually begins.
  // Deliberately built differently from the tick/chime family — a clean,
  // lower, sine-based tone (closer to a hospital heart-monitor beep) held
  // twice as long as a tick — so the "go" moment is unmistakable. Driven at
  // 3x the gain used everywhere else (the compressor absorbs the extra
  // headroom as loudness rather than clipping), plus a quieter octave-up
  // layer so it still cuts through on small phone speakers, not just louder
  // on paper.
  function playGoSignal() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    playBeep(ctx, 900, t0, TICK_DURATION * 2, 3, 'sine', 4);
    playBeep(ctx, 1800, t0, TICK_DURATION * 2, 1.4, 'sine', 4);
  }

  function finishRoundOrDone() {
    if (roundRef.current >= effectiveRef.current.rounds) {
      playChime('finish');
      phaseRef.current = 'done';
      runningRef.current = false;
      clearInterval(intervalRef.current);
      remainingRef.current = 0;
    } else {
      playChime('work');
      roundRef.current += 1;
      groupMemberIndexRef.current = 0;
      const eff = effectiveFor(groupRef.current[0]);
      phaseRef.current = 'work';
      phaseTotalRef.current = eff.workSec;
      remainingRef.current = eff.workSec;
      phaseEndAtRef.current = Date.now() + eff.workSec * 1000;
    }
  }

  function advancePhase() {
    if (phaseRef.current === 'work') {
      const group = groupRef.current;
      // Superset members run back-to-back with no rest between them — only
      // the last member of the group in this round triggers a rest (or, if
      // there's no rest configured, the next round directly).
      if (groupMemberIndexRef.current < group.length - 1) {
        groupMemberIndexRef.current += 1;
        const eff = effectiveFor(group[groupMemberIndexRef.current]);
        playChime('work');
        phaseRef.current = 'work';
        phaseTotalRef.current = eff.workSec;
        remainingRef.current = eff.workSec;
        phaseEndAtRef.current = Date.now() + eff.workSec * 1000;
        return;
      }
      if (effectiveRef.current.restSec > 0) {
        playChime('rest');
        phaseRef.current = 'rest';
        phaseTotalRef.current = effectiveRef.current.restSec;
        remainingRef.current = effectiveRef.current.restSec;
        phaseEndAtRef.current = Date.now() + effectiveRef.current.restSec * 1000;
      } else {
        finishRoundOrDone();
      }
    } else if (phaseRef.current === 'rest') {
      finishRoundOrDone();
    }
  }

  function tick() {
    const now = Date.now();
    if (phaseRef.current === 'countdown') {
      const n = Math.max(0, Math.round((phaseEndAtRef.current - now) / 1000));
      if (n !== remainingRef.current) {
        remainingRef.current = n;
        if (n > 0) {
          playTick(n);
        } else {
          phaseRef.current = 'work';
          phaseTotalRef.current = effectiveRef.current.workSec;
          remainingRef.current = effectiveRef.current.workSec;
          phaseEndAtRef.current = now + effectiveRef.current.workSec * 1000;
          playGoSignal();
        }
      }
      forceRender();
      return;
    }
    remainingRef.current = Math.max(0, Math.round((phaseEndAtRef.current - now) / 1000));
    if (remainingRef.current <= 0) advancePhase();
    forceRender();
  }

  function start() {
    autoSuppressedRef.current = false; // any manual Start/Resume re-arms Auto's own auto-advancing
    // A manual Start while Auto is active (e.g. resuming after a reload)
    // IS this run's one countdown — later exercises still shouldn't get
    // another one just because the auto-effect itself never fired here.
    if (autoRun) autoFirstDoneRef.current = true;
    if (phaseRef.current === 'idle' || phaseRef.current === 'done') {
      phaseRef.current = 'countdown';
      roundRef.current = 1;
      groupMemberIndexRef.current = 0;
      phaseTotalRef.current = COUNTDOWN_SEC;
      remainingRef.current = COUNTDOWN_SEC;
      phaseEndAtRef.current = Date.now() + COUNTDOWN_SEC * 1000;
      runningRef.current = true;
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, 200);
      ensureAudio();
      playTick(COUNTDOWN_SEC);
      forceRender();
      return;
    }
    runningRef.current = true;
    phaseEndAtRef.current = Date.now() + remainingRef.current * 1000;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 200);
    ensureAudio();
    forceRender();
  }

  // Used only by Auto mode's exercise-to-exercise handoff: goes straight
  // into round 1's work phase, skipping the 3-2-1 countdown. The rest
  // period at the end of the previous exercise already served as the
  // transition buffer, so a second "get ready" pause would just be extra
  // dead time in an otherwise hands-free run. Only the very first exercise
  // of an Auto run still gets the full countdown (called via start()).
  function beginWorkDirectly() {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'done') return;
    phaseRef.current = 'work';
    roundRef.current = 1;
    groupMemberIndexRef.current = 0;
    const eff = effectiveFor(groupRef.current[0]);
    phaseTotalRef.current = eff.workSec;
    remainingRef.current = eff.workSec;
    phaseEndAtRef.current = Date.now() + eff.workSec * 1000;
    runningRef.current = true;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 200);
    ensureAudio();
    playChime('work');
    forceRender();
  }

  function pause() {
    if (phaseRef.current === 'countdown') return; // the countdown is atomic and can't be paused
    runningRef.current = false;
    clearInterval(intervalRef.current);
    forceRender();
  }

  function reset() {
    clearInterval(intervalRef.current);
    runningRef.current = false;
    phaseRef.current = 'idle';
    roundRef.current = 1;
    groupMemberIndexRef.current = 0;
    phaseTotalRef.current = effectiveRef.current.workSec;
    remainingRef.current = effectiveRef.current.workSec;
    forceRender();
  }

  function skip() {
    if (phaseRef.current === 'idle' || phaseRef.current === 'done') return;
    clearInterval(intervalRef.current);
    if (phaseRef.current === 'countdown') {
      phaseRef.current = 'work';
      phaseTotalRef.current = effectiveRef.current.workSec;
      remainingRef.current = effectiveRef.current.workSec;
      phaseEndAtRef.current = Date.now() + effectiveRef.current.workSec * 1000;
      playGoSignal();
    } else {
      advancePhase();
    }
    if (runningRef.current) intervalRef.current = setInterval(tick, 200);
    forceRender();
  }

  const CIRC = 2 * Math.PI * 90;
  // Uses continuous elapsed time (not the rounded whole-second `remaining`)
  // so the ring sweeps smoothly instead of snapping once per second.
  const msRemaining = phase === 'idle' ? total * 1000 : Math.max(0, Math.min(total * 1000, phaseEndAtRef.current - Date.now()));
  const fraction = total > 0 ? msRemaining / (total * 1000) : 0;
  const ringColor = phase === 'work' ? '#33A34F' : phase === 'rest' ? '#007AFF' : phase === 'done' ? '#34C759' : '#33A34F';
  const phaseLabel = PHASE_LABELS[phase];

  function nextUpLabel() {
    const isLastRound = round >= effectiveRef.current.rounds;
    if (phase === 'work') {
      if (groupMemberIndexRef.current < groupRef.current.length - 1) {
        const upNext = groupRef.current[groupMemberIndexRef.current + 1];
        const weight = upNext.weightKg != null ? ` (${formatWeightKg(upNext.weightKg)} kg ea)` : '';
        return `Next · ${upNext.name}${weight}`;
      }
      if (effectiveRef.current.restSec > 0) return `Next · Rest ${fmtTime(effectiveRef.current.restSec)}`;
      return isLastRound ? 'Last set' : `Next · Work ${fmtTime(effectiveRef.current.workSec)}`;
    }
    if (phase === 'rest') return isLastRound ? 'Almost there' : `Next · Work ${fmtTime(effectiveRef.current.workSec)}`;
    if (phase === 'idle') return `Starts with Work ${fmtTime(effectiveRef.current.workSec)}`;
    return '';
  }

  const isSuperset = groupRef.current.length > 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold">Timer</h1>
        <IconButton onClick={onToggleSound} title="Toggle sound">
          {soundEnabled ? <VolumeIcon className="w-5 h-5" /> : <MuteIcon className="w-5 h-5" />}
        </IconButton>
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <div className="text-[19px] font-bold text-center">
          {activeMember ? activeMember.name : 'No exercise selected'}
        </div>
        <div className="text-[12px] text-iossecondary">
          {activeMember ? (workoutName || '') : 'Pick one in the Workouts tab'}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-ioscard shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-full px-3.5 py-1.5">
          <span className="text-[11px] text-iossecondary font-medium">Work</span>
          <span className="text-[13px] font-semibold tabular-nums">{fmtTime(effectiveRef.current.workSec)}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-ioscard shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-full px-3.5 py-1.5">
          <span className="text-[11px] text-iossecondary font-medium">Rest</span>
          <span className="text-[13px] font-semibold tabular-nums">{fmtTime(effectiveRef.current.restSec)}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-ioscard shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-full px-3.5 py-1.5">
          <span className="text-[11px] text-iossecondary font-medium">Sets</span>
          <span className="text-[13px] font-semibold tabular-nums">{effectiveRef.current.rounds}</span>
        </div>
      </div>
      {isSuperset ? (
        <div className="text-center text-[12px] text-iosorange font-medium -mt-4">
          Superset · {groupMemberIndexRef.current + 1} of {groupRef.current.length} · {groupRef.current.map(m => m.name).join(' + ')}
        </div>
      ) : activeMember ? (
        <div className="text-center text-[12px] text-iossecondary -mt-4">
          {activeMember.sides === 'alternating' ? 'One side at a time' : 'Both sides together'}
          {activeMember.weightKg != null && ` · ${formatWeightKg(activeMember.weightKg)} kg ea`}
        </div>
      ) : (
        <div className="text-center text-[11px] text-iossecondary -mt-4">Tap the ⚙ next to an exercise to set its times</div>
      )}
      {autoRun && (
        <div className="flex items-center justify-center gap-2 -mt-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-iosorange bg-[#FF950026] px-2.5 py-1 rounded-full">Auto</span>
          {nextExercise && (
            <span className="text-[12px] text-iossecondary">
              Up next: {nextExercise.name}
              {nextExercise.weightKg != null && ` (${formatWeightKg(nextExercise.weightKg)} kg ea)`}
            </span>
          )}
          <button onClick={onStopAuto} className="text-[12px] text-iosred font-medium">Stop</button>
        </div>
      )}

      <div className="flex flex-col items-center justify-center py-2 relative">
        <div className="relative w-[260px] h-[260px]">
          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
            <circle cx="100" cy="100" r="90" fill="none" stroke="#F2F2F7" strokeWidth="16" />
            <circle cx="100" cy="100" r="90" fill="none" stroke={ringColor} strokeWidth="16"
              strokeLinecap="round" strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - fraction)} className="progress-ring-fg" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-iossecondary">{phaseLabel}</div>
            <div className="text-[56px] font-bold font-mono tabular-nums leading-none">{fmtTime(remaining)}</div>
            <div className="text-[13px] text-iossecondary mt-1">Set {round} of {effectiveRef.current.rounds}</div>
            <div className="text-[12px] text-iossecondary mt-2">{nextUpLabel()}</div>
          </div>
          {phase === 'countdown' && (
            <div className="absolute inset-0 z-50 flex items-center justify-center">
              <div className="text-white text-[140px] font-extrabold leading-none tabular-nums drop-shadow-2xl">{remaining}</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button onClick={start} disabled={running}
            className={`flex-1 flex items-center justify-center gap-2 py-4 min-h-[44px] rounded-full font-semibold text-[16px] active:scale-95 transition ${
              !running ? 'bg-iosblue text-white shadow-lg' : 'bg-iosseparator text-iossecondary'
            }`}>
            <PlayIcon className="w-5 h-5" /> {phase === 'idle' || phase === 'done' ? 'Start' : 'Resume'}
          </button>
          <button onClick={pause} disabled={!running || phase === 'countdown'}
            className={`flex-1 flex items-center justify-center gap-2 py-4 min-h-[44px] rounded-full font-semibold text-[16px] active:scale-95 transition ${
              running && phase !== 'countdown' ? 'bg-iosblue text-white shadow-lg' : 'bg-iosseparator text-iossecondary'
            }`}>
            <PauseIcon className="w-5 h-5" /> Pause
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reset}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 min-h-[44px] rounded-full bg-iosseparator text-ioslabel font-medium text-[14px] active:scale-95 transition">
            <ResetIcon className="w-4 h-4" /> Reset
          </button>
          <button onClick={skip}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 min-h-[44px] rounded-full bg-iosseparator text-ioslabel font-medium text-[14px] active:scale-95 transition">
            <SkipIcon className="w-4 h-4" /> Skip
          </button>
        </div>
      </div>

      {phase === 'countdown' && (
        <div className="fixed inset-0 z-[45] bg-black/40 pointer-events-none" />
      )}
    </div>
  );
}

// ===================== Workouts Tab =====================

// Press-and-hold detection shared by the checklist cards (hold to enter
// reorder mode) — a plain tap still fires onClick, and any real finger
// movement cancels the hold so scrolling the list never triggers it.
function useLongPress(onLongPress, onClick) {
  const pressTimer = useRef(null);
  const longPressFired = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  function clearPressTimer() {
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  return {
    onClick: () => {
      // Swallow the click the browser fires after a long press.
      if (longPressFired.current) { longPressFired.current = false; return; }
      if (onClick) onClick();
    },
    onPointerDown: (e) => {
      longPressFired.current = false;
      startPos.current = { x: e.clientX, y: e.clientY };
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        longPressFired.current = true;
        if (onLongPress) onLongPress();
      }, 500);
    },
    onPointerMove: (e) => {
      if (!pressTimer.current) return;
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.hypot(dx, dy) > 10) clearPressTimer();
    },
    onPointerUp: clearPressTimer,
    onPointerCancel: clearPressTimer,
    onPointerLeave: clearPressTimer,
  };
}

// The single place an exercise is edited, opened by the ⚙ next to it
// wherever exercises are listed. Everything that decides how this exercise
// looks and how the Timer runs it lives in here — there is no second screen
// (and no category) holding some of it.
function ExerciseSettingsSheet({ exercise, showSuperset, otherWorkouts, onCopyTo, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => ({ ...exercise }));
  // Purely a display/entry choice — the exercise always stores weightKg, so
  // flipping this only changes how the number in the box is read while typing.
  const [weightUnit, setWeightUnit] = useState('kg');

  function patch(p) { setDraft(d => ({ ...d, ...p })); }

  const weightDisplay = draft.weightKg == null ? ''
    : (weightUnit === 'kg' ? formatWeightKg(draft.weightKg) : formatWeightKg(kgToLb(draft.weightKg)));

  function handleWeightChange(raw) {
    if (raw.trim() === '') { patch({ weightKg: null }); return; }
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    patch({ weightKg: weightUnit === 'kg' ? n : lbToKg(n) });
  }

  // Switching sides re-seeds the times only while they are still the
  // untouched defaults of the other mode, so an exercise whose times you
  // already dialled in never silently loses them.
  function handleSides(sides) {
    setDraft(d => {
      const untouched = exWorkSec(d) === defaultWorkSecFor(d.sides) && exRestSec(d) === defaultRestSecFor(d.sides);
      return untouched
        ? { ...d, sides, workSec: defaultWorkSecFor(sides), restSec: defaultRestSecFor(sides) }
        : { ...d, sides };
    });
  }

  function handleDone() {
    const clean = normalizeExercise(draft);
    if (!clean.name) { alert('Please give the exercise a name'); return; }
    onSave(clean);
  }

  return (
    <div className="fixed inset-0 z-[45] flex items-end" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/30" />
      <div onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_ease] flex flex-col max-h-[88vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-iosseparator shrink-0">
          <button onClick={onCancel} className="text-iosblue text-[16px] px-1">Cancel</button>
          <div className="font-semibold text-[16px]">Exercise</div>
          <button onClick={handleDone} className="text-iosblue font-semibold text-[16px] px-1">Done</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-3">
          <input value={draft.name} placeholder="Exercise name" autoFocus={!draft.name}
            onChange={e => patch({ name: e.target.value })}
            className="font-semibold text-[16px] bg-iosbg rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-iosblue" />
          <input value={draft.description || ''} placeholder="How to identify (optional)"
            onChange={e => patch({ description: e.target.value })}
            className="text-[15px] bg-iosbg rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-iosblue text-iossecondary" />

          <SegmentedControl
            options={[{ value: 'together', label: 'Both sides together' }, { value: 'alternating', label: 'One side at a time' }]}
            value={draft.sides === 'alternating' ? 'alternating' : 'together'}
            onChange={handleSides}
          />

          <div className="grid grid-cols-3 gap-2">
            <TimeRow label="Work Time" sec={exWorkSec(draft)} onCommit={v => patch({ workSec: v })} />
            <TimeRow label="Rest Time" sec={exRestSec(draft)} onCommit={v => patch({ restSec: v })} />
            <CountRow label="Sets" value={exSets(draft)} max={50} onCommit={v => patch({ sets: v })} />
          </div>
          <div className="text-[11px] text-iossecondary text-center -mt-1">
            {exSets(draft)} × ({fmtTime(exWorkSec(draft))} work + {fmtTime(exRestSec(draft))} rest)
          </div>

          <div className="flex items-center justify-between gap-2 bg-iosbg rounded-xl px-3 py-2.5">
            <span className="text-[14px] font-medium">Weight (per dumbbell)</span>
            <div className="flex items-center gap-1.5">
              <input type="number" min="0" step="0.5" placeholder="—" value={weightDisplay}
                onChange={e => handleWeightChange(e.target.value)}
                className="w-20 text-center bg-white rounded-lg py-1.5 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-iosblue" />
              <button type="button" onClick={() => setWeightUnit(u => u === 'kg' ? 'lbs' : 'kg')}
                className="text-[12px] font-semibold text-iosblue px-2 py-1.5 rounded-lg bg-white">
                {weightUnit}
              </button>
            </div>
          </div>

          {showSuperset && (
            <label className="flex items-center justify-between gap-2 bg-iosbg rounded-xl px-3 py-2.5">
              <span className="text-[14px] font-medium">
                Superset with next exercise
                <span className="block text-[11px] text-iossecondary font-normal">Run them back-to-back, rest only after the last one</span>
              </span>
              <input type="checkbox" checked={!!draft.supersetWithNext}
                onChange={e => patch({ supersetWithNext: e.target.checked })}
                className="w-5 h-5 accent-iosblue shrink-0" />
            </label>
          )}

          {otherWorkouts && otherWorkouts.length > 0 && onCopyTo && (
            <select value="" onChange={e => { if (e.target.value) onCopyTo(normalizeExercise(draft), e.target.value); }}
              className="bg-iosbg rounded-xl px-3 py-2.5 text-[14px] text-iossecondary outline-none focus:ring-2 focus:ring-iosblue">
              <option value="" disabled>Duplicate to another workout…</option>
              {otherWorkouts.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}

          {onDelete && (
            <button onClick={onDelete}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FF3B3014] text-iosred font-semibold text-[15px]">
              <TrashIcon className="w-4 h-4" /> Delete Exercise
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkoutEditView({ workout, workouts, onCancel, onSave, onCopyExercise }) {
  const [name, setName] = useState(workout ? workout.name : '');
  const [exercises, setExercises] = useState(workout ? workout.exercises.map(e => ({ ...e })) : []);
  const [importText, setImportText] = useState('');
  const [settingsId, setSettingsId] = useState(null); // exercise whose settings sheet is open

  function parseWorkoutText(text) {
    const lines = text.split(/\r?\n/)
      .map(raw => ({ indent: (raw.match(/^(\s*)/) || ['', ''])[1].length, content: raw.trim().replace(/^[-*•]\s*/, '') }))
      .filter(l => l.content);
    if (lines.length === 0) return [];

    // Nested/bulleted format: exercise names sit at the lowest indentation
    // level, recurring more than once, with one or more indented description
    // line(s) folded underneath each one.
    const minIndent = Math.min(...lines.map(l => l.indent));
    const lowIndentCount = lines.filter(l => l.indent === minIndent).length;
    const looksNested = lowIndentCount >= 2 && lowIndentCount < lines.length;

    if (looksNested) {
      const parsed = [];
      lines.forEach(({ indent, content }) => {
        if (indent === minIndent) {
          parsed.push(ex(content, ''));
        } else if (parsed.length > 0) {
          const m = content.match(/(?:how to identify|איך מזהים):\s*(.*)/i);
          const descText = (m ? m[1] : content).trim();
          const last = parsed[parsed.length - 1];
          last.description = last.description ? last.description + ' ' + descText : descText;
        }
      });
      return parsed;
    }

    // Flat text with no indentation/bullets to lean on (e.g. pasted straight
    // from an AI chat): if every consecutive pair of lines looks like a short
    // name followed by a longer, sentence-like description, treat it as
    // alternating name/description pairs instead of one exercise per line.
    if (lines.length % 2 === 0) {
      const pairsLookRight = lines.every((l, i) => {
        if (i % 2 === 1) return true; // checked together with its preceding name line
        const name = l, desc = lines[i + 1];
        const nameWords = name.content.split(/\s+/).length;
        const descWords = desc.content.split(/\s+/).length;
        const descLooksLikeSentence = /[.,]/.test(desc.content) || descWords >= 5;
        return nameWords <= 6 && descWords > nameWords && descLooksLikeSentence;
      });
      if (pairsLookRight) {
        const parsed = [];
        for (let i = 0; i < lines.length; i += 2) parsed.push(ex(lines[i].content, lines[i + 1].content));
        return parsed;
      }
    }

    // Otherwise: a plain list, one exercise per line, no description.
    return lines.map(l => ex(l.content, ''));
  }

  function doImport() {
    const parsed = parseWorkoutText(importText);
    if (parsed.length === 0) { alert("Couldn't find any exercises in that text."); return; }
    setExercises(prev => prev.concat(parsed));
    setImportText('');
  }

  function save() {
    const cleanName = name.trim();
    if (!cleanName) { alert('Please give the workout a name'); return; }
    const clean = exercises.filter(e => e.name && e.name.trim()).map(normalizeExercise);
    if (clean.length === 0) { alert('Add at least one exercise'); return; }
    // A brand-new workout defaults to manual-only (not in rotation); editing
    // an existing one preserves whatever it already had.
    const inRotation = workout ? workout.inRotation !== false : false;
    onSave({ id: workout ? workout.id : uid('wk'), name: cleanName, exercises: clean, inRotation });
  }

  const settingsIndex = exercises.findIndex(e => e.id === settingsId);
  const settingsEx = settingsIndex === -1 ? null : exercises[settingsIndex];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconButton onClick={onCancel}><ChevronLeftIcon className="w-5 h-5" /></IconButton>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Workout name (e.g. Workout C)"
          className="text-[20px] font-bold bg-transparent outline-none flex-1" />
      </div>

      <Card className="p-4 flex flex-col gap-2">
        <label className="text-[13px] text-iossecondary">Paste an exercise list — either a bulleted/indented list, or plain alternating lines of name then description</label>
        <textarea rows="5" value={importText} onChange={e => setImportText(e.target.value)}
          placeholder={'* Exercise name\n   * How to identify: ...\n\n— or —\n\nExercise name\nHow to identify it'}
          className="bg-iosbg rounded-xl p-3 text-[16px] outline-none focus:ring-2 focus:ring-iosblue resize-y" />
        <button onClick={doImport} className="self-start px-4 py-2 rounded-full bg-iosseparator text-[13px] font-medium">
          Import to list
        </button>
      </Card>

      <Card className="p-4">
        {exercises.length === 0 && <div className="text-iossecondary text-[13px] py-2">No exercises yet.</div>}
        {exercises.map((exr, i) => (
          <ExerciseListRow key={exr.id} exercise={exr}
            isGroupContinuation={i > 0 && !!exercises[i - 1].supersetWithNext}
            onOpenSettings={() => setSettingsId(exr.id)} />
        ))}
        <button onClick={() => { const created = ex('', ''); setExercises(prev => prev.concat(created)); setSettingsId(created.id); }}
          className="mt-3 w-full py-2.5 rounded-full bg-iosbg text-[14px] font-medium text-iosblue">
          + Add exercise manually
        </button>
      </Card>

      <button onClick={save} className="w-full py-3.5 rounded-2xl bg-iosblue text-white font-semibold text-[16px]">
        Save Workout
      </button>

      {settingsEx && (
        <ExerciseSettingsSheet
          exercise={settingsEx}
          showSuperset={settingsIndex < exercises.length - 1}
          otherWorkouts={(workouts || []).filter(w => w.id !== (workout && workout.id))}
          onCopyTo={(copied, targetId) => {
            const target = (workouts || []).find(w => w.id === targetId);
            if (!target) return;
            onCopyExercise(copied, targetId);
            alert(`Copied "${copied.name || 'exercise'}" to ${target.name}.`);
          }}
          onCancel={() => {
            // Backing out of a brand-new, still-empty exercise drops it
            // again, so cancelling never leaves a blank row behind.
            if (!settingsEx.name) setExercises(prev => prev.filter(e => e.id !== settingsId));
            setSettingsId(null);
          }}
          onSave={(updated) => {
            setExercises(prev => prev.map(e => e.id === settingsId ? updated : e));
            setSettingsId(null);
          }}
          onDelete={() => {
            setExercises(prev => prev.filter(e => e.id !== settingsId));
            setSettingsId(null);
          }}
        />
      )}
    </div>
  );
}

function WorkoutManageView({ workouts, onBack, onEdit, onAdd, onDelete, onToggleRotation }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconButton onClick={onBack}><ChevronLeftIcon className="w-5 h-5" /></IconButton>
        <h2 className="text-[20px] font-bold flex-1">Manage Workouts</h2>
        <IconButton onClick={onAdd} className="bg-iosblue text-white"><PlusIcon className="w-5 h-5" /></IconButton>
      </div>
      <div className="flex flex-col gap-3">
        {workouts.map(wk => (
          <Card key={wk.id} className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-[16px]">{wk.name}</div>
                <div className="text-[13px] text-iossecondary">{wk.exercises.length} exercises</div>
              </div>
              <div className="flex items-center gap-1">
                <IconButton onClick={() => onEdit(wk.id)} title="Edit workout"><GearIcon className="w-4 h-4" /></IconButton>
                <IconButton onClick={() => onDelete(wk.id)} className="text-iosred" title="Delete workout"><TrashIcon className="w-4 h-4" /></IconButton>
              </div>
            </div>
            <label className="flex items-center justify-between gap-2 text-[13px] font-medium text-iossecondary pt-2 border-t border-iosseparator">
              <span>Switch to it automatically after a finish</span>
              <input type="checkbox" checked={wk.inRotation !== false}
                onChange={e => onToggleRotation(wk.id, e.target.checked)}
                className="w-5 h-5 accent-iosblue shrink-0" />
            </label>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Compact, read-only summary of one exercise with a ⚙ that opens its
// settings — the shape every list of exercises uses outside the checklist.
function ExerciseListRow({ exercise, isGroupContinuation, onOpenSettings }) {
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-iosseparator last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`font-semibold text-[15px] truncate ${exercise.name ? '' : 'text-iossecondary'}`}>
            {exercise.name || 'Untitled exercise'}
          </span>
          {(exercise.supersetWithNext || isGroupContinuation) && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-iosorange bg-[#FF950026] px-2 py-0.5 rounded-full shrink-0">Superset</span>
          )}
        </div>
        <div className="text-[11px] text-iossecondary truncate tabular-nums">{exerciseSummary(exercise)}</div>
      </div>
      <IconButton onClick={onOpenSettings} title="Exercise settings" className="shrink-0">
        <GearIcon className="w-5 h-5" />
      </IconButton>
    </div>
  );
}

function CheckCircle({ checked }) {
  return (
    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-iosblue border-iosblue' : 'border-iosseparator bg-white'
      }`}>
      {checked && <CheckIcon className="w-4 h-4 text-white" />}
    </div>
  );
}

// Two gestures and a button on one card: tap the circle to mark it done,
// tap the card to make it the current exercise (the one the Timer runs),
// tap ⚙ to open everything about it, hold the card to reorder the list.
function ExerciseCard({ exercise, checked, isCurrent, isGroupContinuation, onToggle, onSetCurrent, onLongPress, onOpenSettings }) {
  const press = useLongPress(onLongPress, onSetCurrent);

  return (
    <Card className={`overflow-hidden ${isCurrent ? 'ring-2 ring-iosblue' : ''}`}>
      <div className={`w-full flex items-center gap-3 pl-4 pr-1 py-3.5 transition-colors ${checked ? 'opacity-50' : ''}`}>
        <button onClick={onToggle} aria-label={checked ? 'Mark not done' : 'Mark done'} className="shrink-0">
          <CheckCircle checked={checked} />
        </button>
        <div role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSetCurrent(); } }}
          {...press}
          className="flex-1 min-w-0 text-left cursor-pointer select-none active:bg-iosbg -my-3.5 py-3.5 rounded-lg transition-colors">
          <div className="flex items-center gap-1.5">
            {isCurrent && <span className="text-iosblue text-[10px] font-bold uppercase tracking-wide shrink-0">Now</span>}
            <div className={`font-semibold text-[15px] truncate ${checked ? 'line-through text-iossecondary' : ''}`}>{exercise.name}</div>
            {exercise.weightKg != null && (
              <span className="text-[12px] text-iossecondary font-medium shrink-0">{formatWeightKg(exercise.weightKg)} kg ea</span>
            )}
            {(exercise.supersetWithNext || isGroupContinuation) && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-iosorange bg-[#FF950026] px-2 py-0.5 rounded-full shrink-0">Superset</span>
            )}
          </div>
          {exercise.description && <div className="text-[13px] text-iossecondary mt-0.5">{exercise.description}</div>}
          <div className="text-[11px] text-iossecondary mt-0.5 tabular-nums">{exerciseSummary(exercise)}</div>
        </div>
        <IconButton onClick={onOpenSettings} title="Exercise settings" className="shrink-0">
          <GearIcon className="w-5 h-5" />
        </IconButton>
      </div>
    </Card>
  );
}

function WorkoutRunView({ workout, progress, currentExercise, onToggleExercise, onSetCurrentExercise, onResetProgress,
  onSwitchWorkout, workouts, onManage, onSaveWorkout, isAutoRunning, onStartAuto, onStopAuto, onCopyExercise }) {
  const doneCount = workout.exercises.filter(e => progress[e.id]).length;
  const total = workout.exercises.length;
  const [editList, setEditList] = useState(null); // non-null = reorder/edit mode is active
  const [settingsId, setSettingsId] = useState(null); // exercise whose settings sheet is open
  const sortableContainerRef = useRef(null);
  const sortableInstanceRef = useRef(null);

  useEffect(() => {
    if (!editList || !sortableContainerRef.current || typeof Sortable === 'undefined') return;
    sortableInstanceRef.current = Sortable.create(sortableContainerRef.current, {
      animation: 150,
      // Dragging is limited to the ⠿ grip so the rest of the row stays free
      // for tapping ⚙ and for scrolling a list longer than the screen.
      handle: '.drag-handle',
      onEnd: (evt) => {
        setEditList(prev => {
          if (!prev || evt.oldIndex === evt.newIndex) return prev;
          const next = prev.slice();
          const [moved] = next.splice(evt.oldIndex, 1);
          next.splice(evt.newIndex, 0, moved);
          return next;
        });
      },
    });
    return () => { if (sortableInstanceRef.current) { sortableInstanceRef.current.destroy(); sortableInstanceRef.current = null; } };
    // eslint-disable-next-line
  }, [!!editList]);

  // In edit mode the sheet edits the pending draft (saved together with the
  // new order); outside it, it writes straight through to the workout.
  const listForSettings = editList || workout.exercises;
  const settingsIndex = listForSettings.findIndex(e => e.id === settingsId);
  const settingsEx = settingsIndex === -1 ? null : listForSettings[settingsIndex];

  function applySettings(updated) {
    if (editList) setEditList(prev => prev.map(e => e.id === updated.id ? updated : e));
    else onSaveWorkout({ ...workout, exercises: workout.exercises.map(e => e.id === updated.id ? updated : e) });
    setSettingsId(null);
  }
  function deleteFromSettings() {
    if (!confirm('Delete this exercise?')) return;
    if (editList) setEditList(prev => prev.filter(e => e.id !== settingsId));
    else onSaveWorkout({ ...workout, exercises: workout.exercises.filter(e => e.id !== settingsId) });
    setSettingsId(null);
  }
  function cancelSettings() {
    // Backing out of a brand-new, never-named exercise drops it again, so
    // cancelling never leaves a blank row behind.
    if (editList && settingsEx && !settingsEx.name) setEditList(prev => prev.filter(e => e.id !== settingsId));
    setSettingsId(null);
  }
  function addExercise() {
    const created = ex('', '');
    setEditList(prev => (prev || workout.exercises.map(e => ({ ...e }))).concat(created));
    setSettingsId(created.id);
  }
  function confirmEdits() {
    onSaveWorkout({ ...workout, exercises: editList.filter(e => e.name) });
    setEditList(null);
  }

  const settingsSheet = settingsEx ? (
    <ExerciseSettingsSheet
      exercise={settingsEx}
      showSuperset={settingsIndex < listForSettings.length - 1}
      otherWorkouts={(workouts || []).filter(w => w.id !== workout.id)}
      onCopyTo={(copied, targetId) => {
        const target = (workouts || []).find(w => w.id === targetId);
        if (!target || !onCopyExercise) return;
        onCopyExercise(copied, targetId);
        alert(`Copied "${copied.name || 'exercise'}" to ${target.name}.`);
      }}
      onCancel={cancelSettings}
      onSave={applySettings}
      onDelete={deleteFromSettings}
    />
  ) : null;

  if (editList) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold">Edit List</h1>
          <IconButton onClick={confirmEdits} className="bg-iosblue text-white" title="Done editing">
            <CheckIcon className="w-5 h-5" />
          </IconButton>
        </div>
        <div className="text-center text-[13px] text-iossecondary -mt-2">Drag ⠿ to reorder · tap ⚙ to set times, sets and weight</div>

        <div ref={sortableContainerRef} className="flex flex-col gap-2.5">
          {editList.map((exr, i) => (
            <div key={exr.id}
              className="flex items-center gap-1 bg-ioscard rounded-2xl pl-1 pr-1 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <span className="drag-handle shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-iossecondary text-[18px] leading-none select-none cursor-grab active:cursor-grabbing"
                style={{ touchAction: 'none' }} aria-hidden="true">⠿</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold text-[15px] truncate ${exr.name ? '' : 'text-iossecondary'}`}>
                    {exr.name || 'Untitled exercise'}
                  </span>
                  {(exr.supersetWithNext || (i > 0 && !!editList[i - 1].supersetWithNext)) && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-iosorange bg-[#FF950026] px-2 py-0.5 rounded-full shrink-0">Superset</span>
                  )}
                </div>
                <div className="text-[11px] text-iossecondary truncate tabular-nums">{exerciseSummary(exr)}</div>
              </div>
              <IconButton onClick={() => setSettingsId(exr.id)} title="Exercise settings" className="shrink-0">
                <GearIcon className="w-5 h-5" />
              </IconButton>
            </div>
          ))}
        </div>

        <button onClick={addExercise}
          className="w-full py-2.5 rounded-full bg-ioscard text-[14px] font-medium text-iosblue shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          + Add exercise
        </button>

        <button onClick={confirmEdits}
          className="w-full py-3.5 rounded-2xl bg-iosblue text-white font-semibold text-[16px] flex items-center justify-center gap-2">
          <CheckIcon className="w-5 h-5" /> Done
        </button>

        {settingsSheet}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold">Workouts</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => isAutoRunning ? onStopAuto() : onStartAuto(workout.id)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition bg-iosseparator text-ioslabel">
            {isAutoRunning ? <PauseIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />} Auto
          </button>
          <IconButton onClick={onManage} title="Manage workouts"><GearIcon className="w-5 h-5" /></IconButton>
        </div>
      </div>

      {workouts.length > 1 ? (
        <SegmentedControl
          options={workouts.map(w => ({ value: w.id, label: w.name }))}
          value={workout.id}
          onChange={onSwitchWorkout}
        />
      ) : (
        <div className="text-center text-[15px] font-semibold text-iosblue">{workout.name}</div>
      )}

      <div className="text-center text-[13px] text-iossecondary -mt-1">{doneCount} of {total} done · long-press to reorder</div>

      <div className="flex flex-col gap-2.5">
        {workout.exercises.map((exr, i) => (
          <ExerciseCard key={exr.id} exercise={exr} checked={!!progress[exr.id]}
            isCurrent={!!currentExercise && currentExercise.id === exr.id}
            isGroupContinuation={i > 0 && !!workout.exercises[i - 1].supersetWithNext}
            onToggle={() => onToggleExercise(exr.id, !progress[exr.id])}
            onSetCurrent={() => onSetCurrentExercise(exr.id)}
            onOpenSettings={() => setSettingsId(exr.id)}
            onLongPress={() => setEditList(workout.exercises.map(e => ({ ...e })))} />
        ))}
      </div>

      {total === 0 ? (
        <button onClick={addExercise} className="w-full py-3 rounded-2xl bg-iosblue text-white font-semibold text-[15px]">
          + Add your first exercise
        </button>
      ) : (
        <button onClick={onResetProgress} className="w-full py-3 rounded-2xl bg-iosseparator text-[15px] font-medium text-ioslabel">
          Reset Checkmarks
        </button>
      )}

      {settingsSheet}
    </div>
  );
}

function WorkoutsTab({ workouts, workoutProgress, activeWorkoutId, currentExercise, onToggleExercise, onResetProgress, onSetActiveWorkout,
  onSaveWorkout, onDeleteWorkout, onSetCurrentExercise, autoRunWorkoutId, onStartAuto, onStopAuto, onCopyExercise, onToggleRotation }) {
  const [view, setView] = useState('run'); // run | manage | edit
  const [editingId, setEditingId] = useState(null);

  const activeWorkout = workouts.find(w => w.id === activeWorkoutId) || workouts[0];

  if (workouts.length === 0 || !activeWorkout) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[28px] font-bold">My Workouts</h1>
        <Card className="p-8 text-center flex flex-col items-center gap-3">
          <div className="text-iossecondary text-[14px]">No workouts yet.</div>
          <button onClick={() => { setEditingId(null); setView('edit'); }}
            className="px-5 py-2.5 rounded-full bg-iosblue text-white font-medium text-[14px]">
            + Create your first workout
          </button>
        </Card>
      </div>
    );
  }

  if (view === 'edit') {
    const wk = editingId ? workouts.find(w => w.id === editingId) : null;
    return (
      <WorkoutEditView
        workout={wk}
        workouts={workouts}
        onCancel={() => setView('manage')}
        onSave={(saved) => { onSaveWorkout(saved); setView('manage'); }}
        onCopyExercise={onCopyExercise}
      />
    );
  }

  if (view === 'manage') {
    return (
      <WorkoutManageView
        workouts={workouts}
        onBack={() => setView('run')}
        onEdit={(id) => { setEditingId(id); setView('edit'); }}
        onAdd={() => { setEditingId(null); setView('edit'); }}
        onDelete={(id) => { if (confirm('Delete this workout?')) onDeleteWorkout(id); }}
        onToggleRotation={onToggleRotation}
      />
    );
  }

  return (
    <WorkoutRunView
      workout={activeWorkout}
      progress={workoutProgress[activeWorkout.id] || {}}
      currentExercise={currentExercise}
      onToggleExercise={(exId, checked) => onToggleExercise(activeWorkout.id, exId, checked)}
      onSetCurrentExercise={(exId) => onSetCurrentExercise(activeWorkout.id, exId)}
      onResetProgress={() => { if (confirm(`Reset all checkmarks for "${activeWorkout.name}"?`)) onResetProgress(activeWorkout.id); }}
      onSwitchWorkout={onSetActiveWorkout}
      workouts={workouts}
      onManage={() => setView('manage')}
      onSaveWorkout={onSaveWorkout}
      isAutoRunning={autoRunWorkoutId === activeWorkout.id}
      onStartAuto={onStartAuto}
      onStopAuto={onStopAuto}
      onCopyExercise={onCopyExercise}
    />
  );
}

// ===================== App =====================

function App() {
  const [state, setState] = useState(() => migrateState(loadRawState()));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const [tab, setTab] = useState('timer');
  const [celebration, setCelebration] = useState(null);

  // The exercise the Timer should adapt its timing to: a manual override (if
  // still unchecked) takes priority, otherwise it's simply the first
  // unchecked exercise in the active workout — so it advances on its own as
  // you check things off, with zero extra taps.
  function getCurrentExercise(workoutId) {
    const workout = state.workouts.find(w => w.id === workoutId);
    if (!workout) return null;
    const progress = state.workoutProgress[workoutId] || {};
    const overrideId = state.currentExerciseOverride[workoutId];
    if (overrideId) {
      const overrideEx = workout.exercises.find(e => e.id === overrideId);
      // Tapping any member of a superset always resumes the group from its
      // leader — the engine only knows how to run a group start-to-finish.
      if (overrideEx && !progress[overrideEx.id]) {
        const group = findGroupFor(workout.exercises, overrideEx.id);
        return (group && group[0]) || overrideEx;
      }
    }
    return workout.exercises.find(e => !progress[e.id]) || null;
  }
  const currentExercise = getCurrentExercise(state.activeWorkoutId);
  const activeWorkoutForGroup = state.workouts.find(w => w.id === state.activeWorkoutId);
  const currentGroup = currentExercise && activeWorkoutForGroup
    ? (findGroupFor(activeWorkoutForGroup.exercises, currentExercise.id) || [currentExercise])
    : null;

  // The exercise Auto mode (and the Timer's "up next" preview) will move to
  // once the current one's sets are done — the next not-yet-checked
  // exercise after the current *group* (a superset advances as one unit).
  function getNextExercise(workoutId, currentEx) {
    if (!currentEx) return null;
    const workout = state.workouts.find(w => w.id === workoutId);
    if (!workout) return null;
    const progress = state.workoutProgress[workoutId] || {};
    const group = findGroupFor(workout.exercises, currentEx.id) || [currentEx];
    const lastMember = group[group.length - 1];
    const idx = workout.exercises.findIndex(e => e.id === lastMember.id);
    if (idx === -1) return null;
    return workout.exercises.slice(idx + 1).find(e => !progress[e.id]) || null;
  }
  const nextExercise = getNextExercise(state.activeWorkoutId, currentExercise);
  const autoRun = !!state.autoRunWorkoutId && state.autoRunWorkoutId === state.activeWorkoutId;

  function startAuto(workoutId) {
    setState(s => {
      const currentExerciseOverride = { ...s.currentExerciseOverride };
      delete currentExerciseOverride[workoutId]; // auto mode always follows the real order, not a manual pin
      return { ...s, activeWorkoutId: workoutId, autoRunWorkoutId: workoutId, currentExerciseOverride };
    });
    setTab('timer');
  }
  function stopAuto() {
    setState(s => ({ ...s, autoRunWorkoutId: null }));
  }
  function completeAutoExercise(exerciseId) {
    toggleExercise(state.activeWorkoutId, exerciseId, true);
  }

  function setCurrentExercise(workoutId, exerciseId) {
    setState(s => {
      const workout = s.workouts.find(w => w.id === workoutId);
      const group = workout ? findGroupFor(workout.exercises, exerciseId) : null;
      const leaderId = (group && group[0].id) || exerciseId;
      return { ...s, currentExerciseOverride: { ...s.currentExerciseOverride, [workoutId]: leaderId } };
    });
  }
  function clearCurrentExerciseOverride(workoutId) {
    setState(s => {
      if (!(workoutId in s.currentExerciseOverride)) return s;
      const currentExerciseOverride = { ...s.currentExerciseOverride };
      delete currentExerciseOverride[workoutId];
      return { ...s, currentExerciseOverride };
    });
  }

  function toggleExercise(workoutId, exerciseId, checked) {
    setState(s => {
      const workout = s.workouts.find(w => w.id === workoutId);
      // A superset is done or not as one unit — check/uncheck every member
      // together, since they're never run separately.
      const group = findGroupFor(workout.exercises, exerciseId) || [{ id: exerciseId }];
      const nextProgress = { ...(s.workoutProgress[workoutId] || {}) };
      group.forEach(e => { nextProgress[e.id] = checked; });
      const allDone = workout.exercises.every(e => nextProgress[e.id]);
      const currentExerciseOverride = { ...s.currentExerciseOverride };
      // Checking off the exercise that was manually set as "current" clears
      // the override, so the next unchecked exercise takes over automatically.
      if (checked && group.some(e => currentExerciseOverride[workoutId] === e.id)) delete currentExerciseOverride[workoutId];
      // Finishing the workout also ends Auto mode for it — Auto mode is
      // scoped to running through one workout, not chaining into the next.
      const autoRunWorkoutId = (checked && allDone && s.autoRunWorkoutId === workoutId) ? null : s.autoRunWorkoutId;
      const next = { ...s, workoutProgress: { ...s.workoutProgress, [workoutId]: nextProgress }, currentExerciseOverride, autoRunWorkoutId };

      if (checked && allDone) {
        // Auto-advance only cycles within the workouts marked "in rotation"
        // (Workout A/B by default) — a workout outside that set (e.g. one
        // you imported) is never switched into automatically; you pick it
        // yourself when you actually want it.
        const rotation = s.workouts.filter(w => w.inRotation !== false);
        const idxInRotation = rotation.findIndex(w => w.id === workoutId);
        const nextWorkout = (idxInRotation !== -1 && rotation.length > 1)
          ? rotation[(idxInRotation + 1) % rotation.length]
          : null;
        celebrate(workout.name, nextWorkout ? nextWorkout.name : null);
        setTimeout(() => {
          setState(s2 => {
            const override2 = { ...s2.currentExerciseOverride };
            delete override2[workoutId];
            return {
              ...s2,
              workoutProgress: { ...s2.workoutProgress, [workoutId]: {} },
              activeWorkoutId: nextWorkout ? nextWorkout.id : s2.activeWorkoutId,
              currentExerciseOverride: override2,
            };
          });
          setCelebration(null);
        }, 2200);
      }
      return next;
    });
  }

  function resetProgress(workoutId) {
    setState(s => {
      const currentExerciseOverride = { ...s.currentExerciseOverride };
      delete currentExerciseOverride[workoutId];
      return { ...s, workoutProgress: { ...s.workoutProgress, [workoutId]: {} }, currentExerciseOverride };
    });
  }

  function setActiveWorkout(id) {
    setState(s => ({ ...s, activeWorkoutId: id }));
  }

  function saveWorkout(workout) {
    setState(s => {
      const exists = s.workouts.find(w => w.id === workout.id);
      const workouts = exists ? s.workouts.map(w => w.id === workout.id ? workout : w) : [...s.workouts, workout];
      return { ...s, workouts, activeWorkoutId: exists ? s.activeWorkoutId : workout.id };
    });
  }

  function copyExerciseToWorkout(exercise, targetWorkoutId) {
    setState(s => ({
      ...s,
      workouts: s.workouts.map(w => w.id === targetWorkoutId
        // supersetWithNext is reset — the exercise it was paired with lives
        // in the source workout, not this one, so pairing it here by default
        // would silently (and wrongly) merge it with whatever ends up next.
        ? { ...w, exercises: [...w.exercises, { ...exercise, id: uid('ex'), supersetWithNext: false }] }
        : w),
    }));
  }

  function toggleWorkoutRotation(workoutId, inRotation) {
    setState(s => ({
      ...s,
      workouts: s.workouts.map(w => w.id === workoutId ? { ...w, inRotation } : w),
    }));
  }

  function deleteWorkout(id) {
    setState(s => {
      const workouts = s.workouts.filter(w => w.id !== id);
      const workoutProgress = { ...s.workoutProgress };
      delete workoutProgress[id];
      const currentExerciseOverride = { ...s.currentExerciseOverride };
      delete currentExerciseOverride[id];
      const activeWorkoutId = s.activeWorkoutId === id ? (workouts[0] ? workouts[0].id : null) : s.activeWorkoutId;
      const autoRunWorkoutId = s.autoRunWorkoutId === id ? null : s.autoRunWorkoutId;
      return { ...s, workouts, workoutProgress, currentExerciseOverride, activeWorkoutId, autoRunWorkoutId };
    });
  }

  function celebrate(finishedName, nextName) {
    setCelebration({ finishedName, nextName });
    if (typeof confetti !== 'function') return;
    confetti({ particleCount: 100, spread: 90, origin: { y: 0.5 }, colors: ['#007AFF', '#34C759', '#FF9500', '#FF3B30'] });
    setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 70, origin: { x: 0, y: 0.6 } }), 150);
    setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 70, origin: { x: 1, y: 0.6 } }), 150);
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col px-4 pt-6 gap-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}>
      <div className={tab === 'timer' ? 'contents' : 'hidden'}>
        <TimerTab
          soundEnabled={state.soundEnabled}
          onToggleSound={() => setState(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
          currentExercise={currentExercise}
          workoutName={activeWorkoutForGroup ? activeWorkoutForGroup.name : null}
          currentGroup={currentGroup}
          nextExercise={nextExercise}
          autoRun={autoRun}
          onAutoExerciseComplete={completeAutoExercise}
          onStopAuto={stopAuto}
        />
      </div>

      <div className={tab === 'workouts' ? 'contents' : 'hidden'}>
        <WorkoutsTab
          workouts={state.workouts}
          workoutProgress={state.workoutProgress}
          activeWorkoutId={state.activeWorkoutId}
          currentExercise={currentExercise}
          onToggleExercise={toggleExercise}
          onResetProgress={resetProgress}
          onSetActiveWorkout={setActiveWorkout}
          onSaveWorkout={saveWorkout}
          onDeleteWorkout={deleteWorkout}
          onSetCurrentExercise={setCurrentExercise}
          autoRunWorkoutId={state.autoRunWorkoutId}
          onStartAuto={startAuto}
          onStopAuto={stopAuto}
          onCopyExercise={copyExerciseToWorkout}
          onToggleRotation={toggleWorkoutRotation}
        />
      </div>

      <TabBar tab={tab} onChange={setTab} />
      <CompletionOverlay celebration={celebration} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
