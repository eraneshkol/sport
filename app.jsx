const { useState, useEffect, useRef, useReducer, useCallback } = React;

// ===================== Storage / data model =====================

const STORAGE_KEY = 'fitnessApp.v1';

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function ex(name, description) {
  return { id: uid('ex'), name, description };
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

function defaultWorkouts() {
  return [
    {
      id: 'wk-a',
      name: 'Workout A',
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
      exercises: [
        ex('Goblet Squat', EXERCISE_DESCRIPTIONS['Goblet Squat'][1]),
        ex('Incline Dumbbell Press', EXERCISE_DESCRIPTIONS['Incline Dumbbell Press'][1]),
        ex('One-Arm Dumbbell Row', EXERCISE_DESCRIPTIONS['One-Arm Dumbbell Row'][1]),
        ex('Dumbbell Reverse Lunges', EXERCISE_DESCRIPTIONS['Dumbbell Reverse Lunges'][1]),
        ex('Tricep Pushdown', EXERCISE_DESCRIPTIONS['Tricep Pushdown'][1]),
        ex('Side Plank Dips', EXERCISE_DESCRIPTIONS['Side Plank Dips'][1]),
      ],
    },
  ];
}

function defaultCategories() {
  return [
    { id: 'cat-weights', name: 'Weight Press', icon: 'dumbbell', workSec: 80, restSec: 30, rounds: 3 },
    { id: 'cat-abs', name: 'Ab Time', icon: 'activity', workSec: 40, restSec: 20, rounds: 4 },
    { id: 'cat-walk', name: 'Walking', icon: 'footprints', workSec: 300, restSec: 60, rounds: 2 },
  ];
}

function defaultState() {
  const workouts = defaultWorkouts();
  return {
    selectedCategoryId: 'cat-weights',
    categories: defaultCategories(),
    workouts,
    workoutProgress: {},
    activeWorkoutId: workouts[0].id,
    soundEnabled: true,
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
  if (!state.categories || state.categories.length === 0) state.categories = defaultCategories();
  if (!state.categories.find(c => c.id === state.selectedCategoryId)) {
    state.selectedCategoryId = state.categories[0].id;
  }
  if (!state.workouts || state.workouts.length === 0) state.workouts = defaultWorkouts();
  // Translate any leftover Hebrew exercise cues from earlier versions of
  // this app into English, without touching text the user typed themselves.
  state.workouts = state.workouts.map(w => ({
    ...w,
    exercises: w.exercises.map(e => {
      const translated = LEGACY_DESCRIPTION_TO_ENGLISH[e.description];
      return translated ? { ...e, description: translated } : e;
    }),
  }));
  if (!state.workoutProgress) state.workoutProgress = {};
  if (!state.activeWorkoutId || !state.workouts.find(w => w.id === state.activeWorkoutId)) {
    state.activeWorkoutId = state.workouts[0].id;
  }
  if (typeof state.soundEnabled !== 'boolean') state.soundEnabled = true;
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
const DumbbellIcon = (p) => <Icon {...p}><path d="M6.5 6.5 17.5 17.5M4 8l2-2 2 2-2 2-2-2ZM16 16l2-2 2 2-2 2-2-2ZM2.5 9.5l2-2M19.5 16.5l2-2M9.5 4.5l-2 2M14.5 19.5l2-2" /></Icon>;
const ActivityIcon = (p) => <Icon {...p}><path d="M3 12h4l3 8 4-16 3 8h4" /></Icon>;
const FootprintsIcon = (p) => <Icon {...p}><path d="M8 16c1.5 0 2.5-1 2.5-2.5S9.5 9 8 9s-2.5 1.5-2.5 2.5S6.5 16 8 16Z" /><path d="M16 21c1.5 0 2.5-1 2.5-2.5S17.5 14 16 14s-2.5 1.5-2.5 2.5S14.5 21 16 21Z" /><path d="M8 9c0-2 1-3 1-5M16 14c0-2 1-3 1-5" /></Icon>;
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
const GridIcon = (p) => <Icon {...p}><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8" /><rect x="13" y="13" width="7.5" height="7.5" rx="1.8" /></Icon>;

function iconForCategory(name = '') {
  const n = name.toLowerCase();
  if (n.includes('walk') || n.includes('run') || n.includes('cardio')) return FootprintsIcon;
  if (n.includes('ab') || n.includes('core') || n.includes('plank')) return ActivityIcon;
  return DumbbellIcon;
}

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
    { value: 'categories', label: 'Categories', Icon: GridIcon },
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

function TimeField({ label, sec, onCommit }) {
  const min = Math.floor(sec / 60);
  const s = sec % 60;

  function commit(nextMin, nextS) {
    let total = clamp(nextMin, 0, 59) * 60 + clamp(nextS, 0, 59);
    if (total === 0) total = 1;
    onCommit(total);
  }

  return (
    <div className="flex flex-col gap-1.5 items-center">
      <label className="text-[11px] text-iossecondary font-medium">{label}</label>
      <div className="flex items-center gap-1" dir="ltr">
        <input type="number" value={min} min="0" max="59"
          onChange={e => commit(Number(e.target.value) || 0, s)}
          className="w-11 text-center bg-iosbg rounded-lg py-1.5 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-iosblue" />
        <span className="text-iossecondary font-bold">:</span>
        <input type="number" value={String(s).padStart(2, '0')} min="0" max="59"
          onChange={e => commit(min, Number(e.target.value) || 0)}
          className="w-11 text-center bg-iosbg rounded-lg py-1.5 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-iosblue" />
      </div>
    </div>
  );
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ===================== Timer Tab =====================

function TimerTab({ category, categories, onSelectCategory, soundEnabled, onToggleSound }) {
  const phaseRef = useRef('idle'); // idle | work | rest | done
  const roundRef = useRef(1);
  const remainingRef = useRef(category.workSec);
  const phaseTotalRef = useRef(category.workSec);
  const phaseEndAtRef = useRef(0);
  const runningRef = useRef(false);
  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [, forceRender] = useReducer(x => x + 1, 0);

  useEffect(() => {
    clearInterval(intervalRef.current);
    runningRef.current = false;
    phaseRef.current = 'idle';
    roundRef.current = 1;
    phaseTotalRef.current = category.workSec;
    remainingRef.current = category.workSec;
    forceRender();
    return () => clearInterval(intervalRef.current);
  }, [category.id, category.workSec, category.restSec, category.rounds]);

  function ensureAudio() {
    if (!soundEnabled) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  function playTone(ctx, freq, startTime, duration, volume = 0.25) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  function playChime(type) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    if (type === 'rest') { playTone(ctx, 880, t0, 0.18); playTone(ctx, 587, t0 + 0.16, 0.22); }
    else if (type === 'work') { playTone(ctx, 587, t0, 0.18); playTone(ctx, 880, t0 + 0.16, 0.22); }
    else if (type === 'finish') { playTone(ctx, 659, t0, 0.18); playTone(ctx, 784, t0 + 0.16, 0.18); playTone(ctx, 988, t0 + 0.32, 0.4, 0.3); }
  }

  function finishRoundOrDone() {
    if (roundRef.current >= category.rounds) {
      playChime('finish');
      phaseRef.current = 'done';
      runningRef.current = false;
      clearInterval(intervalRef.current);
      remainingRef.current = 0;
    } else {
      playChime('work');
      roundRef.current += 1;
      phaseRef.current = 'work';
      phaseTotalRef.current = category.workSec;
      remainingRef.current = category.workSec;
      phaseEndAtRef.current = Date.now() + category.workSec * 1000;
    }
  }

  function advancePhase() {
    if (phaseRef.current === 'work') {
      if (category.restSec > 0) {
        playChime('rest');
        phaseRef.current = 'rest';
        phaseTotalRef.current = category.restSec;
        remainingRef.current = category.restSec;
        phaseEndAtRef.current = Date.now() + category.restSec * 1000;
      } else {
        finishRoundOrDone();
      }
    } else if (phaseRef.current === 'rest') {
      finishRoundOrDone();
    }
  }

  function tick() {
    const now = Date.now();
    remainingRef.current = Math.max(0, Math.round((phaseEndAtRef.current - now) / 1000));
    if (remainingRef.current <= 0) advancePhase();
    forceRender();
  }

  function start() {
    if (phaseRef.current === 'idle' || phaseRef.current === 'done') {
      phaseRef.current = 'work';
      roundRef.current = 1;
      phaseTotalRef.current = category.workSec;
      remainingRef.current = category.workSec;
    }
    runningRef.current = true;
    phaseEndAtRef.current = Date.now() + remainingRef.current * 1000;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 200);
    ensureAudio();
    forceRender();
  }

  function pause() {
    runningRef.current = false;
    clearInterval(intervalRef.current);
    forceRender();
  }

  function reset() {
    clearInterval(intervalRef.current);
    runningRef.current = false;
    phaseRef.current = 'idle';
    roundRef.current = 1;
    phaseTotalRef.current = category.workSec;
    remainingRef.current = category.workSec;
    forceRender();
  }

  function skip() {
    if (phaseRef.current === 'idle' || phaseRef.current === 'done') return;
    clearInterval(intervalRef.current);
    advancePhase();
    if (runningRef.current) intervalRef.current = setInterval(tick, 200);
    forceRender();
  }

  const phase = phaseRef.current;
  const round = roundRef.current;
  const remaining = remainingRef.current;
  const total = phaseTotalRef.current;
  const running = runningRef.current;

  const CIRC = 2 * Math.PI * 90;
  const fraction = total > 0 ? remaining / total : 0;
  const ringColor = phase === 'work' ? '#FF3B30' : phase === 'rest' ? '#007AFF' : phase === 'done' ? '#34C759' : '#FF3B30';
  const phaseLabel = { idle: 'Ready', work: 'Work', rest: 'Rest', done: 'Done! 🎉' }[phase];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold">Timer</h1>
        <IconButton onClick={onToggleSound} title="Toggle sound">
          {soundEnabled ? <VolumeIcon className="w-5 h-5" /> : <MuteIcon className="w-5 h-5" />}
        </IconButton>
      </div>

      <Card className="p-3">
        <label className="text-[13px] text-iossecondary block mb-1">Category</label>
        <select value={category.id} onChange={e => onSelectCategory(e.target.value)}
          className="w-full bg-iosbg rounded-lg px-3 py-2 text-[15px] font-medium outline-none">
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Card>

      <Card className="p-4">
        <div className="grid grid-cols-3 divide-x divide-iosseparator text-center">
          <div className="px-2">
            <div className="text-[11px] text-iossecondary font-medium mb-1">Work Time</div>
            <div className="text-[17px] font-semibold">{fmtTime(category.workSec)}</div>
          </div>
          <div className="px-2">
            <div className="text-[11px] text-iossecondary font-medium mb-1">Rest Time</div>
            <div className="text-[17px] font-semibold">{fmtTime(category.restSec)}</div>
          </div>
          <div className="px-2">
            <div className="text-[11px] text-iossecondary font-medium mb-1">Rounds</div>
            <div className="text-[17px] font-semibold">{category.rounds}</div>
          </div>
        </div>
      </Card>
      <div className="text-center text-[12px] text-iossecondary -mt-3">Edit times in the Categories tab</div>

      <div className="flex flex-col items-center justify-center py-2 relative">
        <div className="relative w-[260px] h-[260px]">
          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
            <circle cx="100" cy="100" r="90" fill="none" stroke="#F2F2F7" strokeWidth="12" />
            <circle cx="100" cy="100" r="90" fill="none" stroke={ringColor} strokeWidth="12"
              strokeLinecap="round" strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - fraction)} className="progress-ring-fg" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-iossecondary">{phaseLabel}</div>
            <div className="text-[56px] font-bold tabular-nums leading-none">{fmtTime(remaining)}</div>
            <div className="text-[13px] text-iossecondary mt-1">Round {round} of {category.rounds}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        <IconButton onClick={reset} className="bg-ioscard shadow-[0_4px_20px_rgba(0,0,0,0.04)] w-12 h-12">
          <ResetIcon className="w-5 h-5" />
        </IconButton>
        <button onClick={running ? pause : start}
          className="w-20 h-20 rounded-full bg-ioslabel text-white flex items-center justify-center shadow-lg active:scale-95 transition">
          {running ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8 ml-1" />}
        </button>
        <IconButton onClick={skip} className="bg-ioscard shadow-[0_4px_20px_rgba(0,0,0,0.04)] w-12 h-12">
          <SkipIcon className="w-5 h-5" />
        </IconButton>
      </div>
    </div>
  );
}

// ===================== Categories Tab =====================

function CategoriesTab({ categories, selectedCategoryId, onUpdateCategory, onRenameCategory, onEnsureNamed, onAddCategory, onDeleteCategory }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold">Categories</h1>
        <IconButton onClick={onAddCategory} className="bg-iosblue text-white">
          <PlusIcon className="w-5 h-5" />
        </IconButton>
      </div>

      <div className="flex flex-col gap-3">
        {categories.map(cat => {
          const CatIcon = iconForCategory(cat.name);
          return (
            <Card key={cat.id} className={`p-4 ${cat.id === selectedCategoryId ? 'ring-2 ring-iosblue' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <input
                  value={cat.name}
                  onChange={e => onRenameCategory(cat.id, e.target.value)}
                  onBlur={() => onEnsureNamed(cat.id)}
                  className="text-[17px] font-semibold bg-transparent outline-none flex-1 min-w-0"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <div className="w-9 h-9 rounded-full bg-iosbg flex items-center justify-center text-ioslabel">
                    <CatIcon className="w-4 h-4" />
                  </div>
                  <IconButton onClick={() => onDeleteCategory(cat.id)} className="text-iosred">
                    <TrashIcon className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <TimeField label="Work Time" sec={cat.workSec} onCommit={v => onUpdateCategory(cat.id, { workSec: v })} />
                <TimeField label="Rest Time" sec={cat.restSec} onCommit={v => onUpdateCategory(cat.id, { restSec: v })} />
                <div className="flex flex-col gap-1.5 items-center">
                  <label className="text-[11px] text-iossecondary font-medium">Rounds</label>
                  <input type="number" min="1" max="99" value={cat.rounds}
                    onChange={e => onUpdateCategory(cat.id, { rounds: clamp(Number(e.target.value) || 1, 1, 99) })}
                    className="w-14 text-center bg-iosbg rounded-lg py-1.5 text-[15px] font-semibold outline-none focus:ring-2 focus:ring-iosblue" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ===================== Workouts Tab =====================

function ExerciseEditRow({ exercise, onChange, onDelete }) {
  return (
    <div className="flex flex-col gap-2 py-3 border-b border-iosseparator last:border-0">
      <div className="flex items-center gap-2">
        <input value={exercise.name} placeholder="Exercise name"
          onChange={e => onChange({ ...exercise, name: e.target.value })}
          className="flex-1 font-semibold text-[15px] bg-iosbg rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-iosblue" />
        <IconButton onClick={onDelete} className="text-iosred"><TrashIcon className="w-4 h-4" /></IconButton>
      </div>
      <input value={exercise.description} placeholder="How to identify (optional)"
        onChange={e => onChange({ ...exercise, description: e.target.value })}
        className="text-[13px] bg-iosbg rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-iosblue text-iossecondary" />
    </div>
  );
}

function WorkoutEditView({ workout, onCancel, onSave }) {
  const [name, setName] = useState(workout ? workout.name : '');
  const [exercises, setExercises] = useState(workout ? workout.exercises.map(e => ({ ...e })) : []);
  const [importText, setImportText] = useState('');

  function parseWorkoutText(text) {
    const lines = text.split(/\r?\n/);
    const parsed = [];
    lines.forEach(raw => {
      if (!raw.trim()) return;
      const leadingSpaces = raw.match(/^(\s*)/)[1].length;
      const content = raw.trim().replace(/^[-*•]\s*/, '');
      if (!content) return;
      if (leadingSpaces === 0) {
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

  function doImport() {
    const parsed = parseWorkoutText(importText);
    if (parsed.length === 0) { alert("Couldn't find any exercises in that text."); return; }
    setExercises(prev => prev.concat(parsed));
    setImportText('');
  }

  function save() {
    const cleanName = name.trim();
    if (!cleanName) { alert('Please give the workout a name'); return; }
    const clean = exercises.filter(e => e.name && e.name.trim())
      .map(e => ({ id: e.id || uid('ex'), name: e.name.trim(), description: (e.description || '').trim() }));
    if (clean.length === 0) { alert('Add at least one exercise'); return; }
    onSave({ id: workout ? workout.id : uid('wk'), name: cleanName, exercises: clean });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconButton onClick={onCancel}><ChevronLeftIcon className="w-5 h-5" /></IconButton>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Workout name (e.g. Workout C)"
          className="text-[20px] font-bold bg-transparent outline-none flex-1" />
      </div>

      <Card className="p-4 flex flex-col gap-2">
        <label className="text-[13px] text-iossecondary">Paste an exercise list (e.g. from Gemini) to import it</label>
        <textarea rows="5" value={importText} onChange={e => setImportText(e.target.value)}
          placeholder={'* Exercise name\n   * How to identify: ...'}
          className="bg-iosbg rounded-xl p-3 text-[14px] outline-none focus:ring-2 focus:ring-iosblue resize-y" />
        <button onClick={doImport} className="self-start px-4 py-2 rounded-full bg-iosseparator text-[13px] font-medium">
          Import to list
        </button>
      </Card>

      <Card className="p-4">
        {exercises.length === 0 && <div className="text-iossecondary text-[13px] py-2">No exercises yet.</div>}
        {exercises.map((exr, i) => (
          <ExerciseEditRow key={exr.id} exercise={exr}
            onChange={updated => setExercises(prev => prev.map((e, idx) => idx === i ? updated : e))}
            onDelete={() => setExercises(prev => prev.filter((_, idx) => idx !== i))} />
        ))}
        <button onClick={() => setExercises(prev => prev.concat(ex('', '')))}
          className="mt-3 w-full py-2.5 rounded-full bg-iosbg text-[14px] font-medium text-iosblue">
          + Add exercise manually
        </button>
      </Card>

      <button onClick={save} className="w-full py-3.5 rounded-2xl bg-iosblue text-white font-semibold text-[16px]">
        Save Workout
      </button>
    </div>
  );
}

function WorkoutManageView({ workouts, onBack, onEdit, onAdd, onDelete }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconButton onClick={onBack}><ChevronLeftIcon className="w-5 h-5" /></IconButton>
        <h2 className="text-[20px] font-bold flex-1">Manage Workouts</h2>
        <IconButton onClick={onAdd} className="bg-iosblue text-white"><PlusIcon className="w-5 h-5" /></IconButton>
      </div>
      <div className="flex flex-col gap-3">
        {workouts.map(wk => (
          <Card key={wk.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold text-[16px]">{wk.name}</div>
              <div className="text-[13px] text-iossecondary">{wk.exercises.length} exercises</div>
            </div>
            <div className="flex items-center gap-1">
              <IconButton onClick={() => onEdit(wk.id)}><GearIcon className="w-4 h-4" /></IconButton>
              <IconButton onClick={() => onDelete(wk.id)} className="text-iosred"><TrashIcon className="w-4 h-4" /></IconButton>
            </div>
          </Card>
        ))}
      </div>
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

function ExerciseCard({ exercise, checked, onToggle }) {
  return (
    <Card className="overflow-hidden">
      <div role="button" tabIndex={0} onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className={`w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-iosbg transition-colors ${checked ? 'opacity-50' : ''}`}>
        <CheckCircle checked={checked} />
        <div className="flex-1 min-w-0 text-left">
          <div className={`font-semibold text-[15px] ${checked ? 'line-through text-iossecondary' : ''}`}>{exercise.name}</div>
          {exercise.description && <div className="text-[13px] text-iossecondary mt-0.5">{exercise.description}</div>}
        </div>
      </div>
    </Card>
  );
}

function WorkoutRunView({ workout, progress, onToggleExercise, onResetProgress, onSwitchWorkout, workouts, onManage }) {
  const doneCount = workout.exercises.filter(e => progress[e.id]).length;
  const total = workout.exercises.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold">Workouts</h1>
        <IconButton onClick={onManage} title="Manage workouts"><GearIcon className="w-5 h-5" /></IconButton>
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

      <div className="text-center text-[13px] text-iossecondary -mt-1">{doneCount} of {total} done</div>

      <div className="flex flex-col gap-2.5">
        {workout.exercises.map(exr => (
          <ExerciseCard key={exr.id} exercise={exr} checked={!!progress[exr.id]}
            onToggle={() => onToggleExercise(exr.id, !progress[exr.id])} />
        ))}
      </div>

      <button onClick={onResetProgress} className="w-full py-3 rounded-2xl bg-iosseparator text-[15px] font-medium text-ioslabel">
        Reset Checkmarks
      </button>
    </div>
  );
}

function WorkoutsTab({ workouts, workoutProgress, activeWorkoutId, onToggleExercise, onResetProgress, onSetActiveWorkout,
  onSaveWorkout, onDeleteWorkout }) {
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
        onCancel={() => setView('manage')}
        onSave={(saved) => { onSaveWorkout(saved); setView('manage'); }}
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
      />
    );
  }

  return (
    <WorkoutRunView
      workout={activeWorkout}
      progress={workoutProgress[activeWorkout.id] || {}}
      onToggleExercise={(exId, checked) => onToggleExercise(activeWorkout.id, exId, checked)}
      onResetProgress={() => { if (confirm(`Reset all checkmarks for "${activeWorkout.name}"?`)) onResetProgress(activeWorkout.id); }}
      onSwitchWorkout={onSetActiveWorkout}
      workouts={workouts}
      onManage={() => setView('manage')}
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

  const selectedCategory = state.categories.find(c => c.id === state.selectedCategoryId) || state.categories[0];

  function updateCategory(id, patch) {
    setState(s => ({ ...s, categories: s.categories.map(c => c.id === id ? { ...c, ...patch } : c) }));
  }
  function renameCategory(id, name) {
    updateCategory(id, { name });
  }
  function ensureCategoryNamed(id) {
    const cat = state.categories.find(c => c.id === id);
    if (cat && !cat.name.trim()) updateCategory(id, { name: 'Category' });
  }
  function addCategory() {
    const newCat = { id: uid('cat'), name: 'New Category', icon: 'dumbbell', workSec: 60, restSec: 30, rounds: 3 };
    setState(s => ({ ...s, categories: [...s.categories, newCat], selectedCategoryId: newCat.id }));
  }
  function deleteCategory(id) {
    if (state.categories.length <= 1) { alert('At least one category must remain'); return; }
    if (!confirm('Delete this category?')) return;
    setState(s => {
      const categories = s.categories.filter(c => c.id !== id);
      const selectedCategoryId = s.selectedCategoryId === id ? categories[0].id : s.selectedCategoryId;
      return { ...s, categories, selectedCategoryId };
    });
  }

  function toggleExercise(workoutId, exerciseId, checked) {
    setState(s => {
      const workout = s.workouts.find(w => w.id === workoutId);
      const nextProgress = { ...(s.workoutProgress[workoutId] || {}), [exerciseId]: checked };
      const allDone = workout.exercises.every(e => nextProgress[e.id]);
      const next = { ...s, workoutProgress: { ...s.workoutProgress, [workoutId]: nextProgress } };

      if (checked && allDone) {
        const idx = s.workouts.findIndex(w => w.id === workoutId);
        const nextWorkout = s.workouts.length > 1 ? s.workouts[(idx + 1) % s.workouts.length] : null;
        celebrate(workout.name, nextWorkout ? nextWorkout.name : null);
        setTimeout(() => {
          setState(s2 => ({
            ...s2,
            workoutProgress: { ...s2.workoutProgress, [workoutId]: {} },
            activeWorkoutId: nextWorkout ? nextWorkout.id : s2.activeWorkoutId,
          }));
          setCelebration(null);
        }, 2200);
      }
      return next;
    });
  }

  function resetProgress(workoutId) {
    setState(s => ({ ...s, workoutProgress: { ...s.workoutProgress, [workoutId]: {} } }));
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

  function deleteWorkout(id) {
    setState(s => {
      const workouts = s.workouts.filter(w => w.id !== id);
      const workoutProgress = { ...s.workoutProgress };
      delete workoutProgress[id];
      const activeWorkoutId = s.activeWorkoutId === id ? (workouts[0] ? workouts[0].id : null) : s.activeWorkoutId;
      return { ...s, workouts, workoutProgress, activeWorkoutId };
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
      {tab === 'timer' && (
        <TimerTab
          category={selectedCategory}
          categories={state.categories}
          onSelectCategory={id => setState(s => ({ ...s, selectedCategoryId: id }))}
          soundEnabled={state.soundEnabled}
          onToggleSound={() => setState(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
        />
      )}

      {tab === 'categories' && (
        <CategoriesTab
          categories={state.categories}
          selectedCategoryId={state.selectedCategoryId}
          onUpdateCategory={updateCategory}
          onRenameCategory={renameCategory}
          onEnsureNamed={ensureCategoryNamed}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCategory}
        />
      )}

      {tab === 'workouts' && (
        <WorkoutsTab
          workouts={state.workouts}
          workoutProgress={state.workoutProgress}
          activeWorkoutId={state.activeWorkoutId}
          onToggleExercise={toggleExercise}
          onResetProgress={resetProgress}
          onSetActiveWorkout={setActiveWorkout}
          onSaveWorkout={saveWorkout}
          onDeleteWorkout={deleteWorkout}
        />
      )}

      <TabBar tab={tab} onChange={setTab} />
      <CompletionOverlay celebration={celebration} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
