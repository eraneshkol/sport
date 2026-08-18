const { useState, useEffect, useLayoutEffect, useRef, useReducer, useCallback } = React;

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

// ===================== Timer Tab =====================

const PHASE_LABELS = { idle: 'Ready', countdown: 'Get Ready', work: 'Work', rest: 'Rest', done: 'Done! 🎉' };
const COUNTDOWN_SEC = 3;

function TimerTab({ category, categories, onSelectCategory, soundEnabled, onToggleSound }) {
  const phaseRef = useRef('idle'); // idle | countdown | work | rest | done
  const roundRef = useRef(1);
  const remainingRef = useRef(category.workSec);
  const phaseTotalRef = useRef(category.workSec);
  const phaseEndAtRef = useRef(0);
  const runningRef = useRef(false);
  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const compressorRef = useRef(null);
  const audioElRef = useRef(null);
  const wakeLockRef = useRef(null);
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

  const phase = phaseRef.current;
  const round = roundRef.current;
  const remaining = remainingRef.current;
  const total = phaseTotalRef.current;
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

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${category.name} — ${PHASE_LABELS[phaseRef.current] || ''}`,
        artist: `Round ${roundRef.current} of ${category.rounds}`,
      });
      navigator.mediaSession.playbackState = runningRef.current ? 'playing' : 'paused';
    } catch (e) { /* unsupported */ }
  }

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
      try { if ('audioSession' in navigator) navigator.audioSession.type = 'playback'; } catch (e) {}
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    if (audioElRef.current && audioElRef.current.paused) {
      const p = audioElRef.current.play();
      if (p && p.catch) p.catch(() => {});
    }
    return audioCtxRef.current;
  }

  function playTone(ctx, freq, startTime, duration, volume = 0.85) {
    const dest = compressorRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);

    // Quieter octave-up layer for a richer, more cut-through timbre.
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    gain2.gain.setValueAtTime(0, startTime);
    gain2.gain.linearRampToValueAtTime(volume * 0.35, startTime + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc2.connect(gain2);
    gain2.connect(dest);
    osc2.start(startTime);
    osc2.stop(startTime + duration + 0.05);
  }

  function playChime(type) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    if (type === 'rest') { playTone(ctx, 880, t0, 0.30); playTone(ctx, 587, t0 + 0.18, 0.36); }
    else if (type === 'work') { playTone(ctx, 587, t0, 0.30); playTone(ctx, 880, t0 + 0.18, 0.36); }
    else if (type === 'finish') { playTone(ctx, 659, t0, 0.28); playTone(ctx, 784, t0 + 0.20, 0.30); playTone(ctx, 988, t0 + 0.42, 0.55, 0.95); }
  }

  // Sharp, percussive movie-clock-style tick, deliberately distinct in timbre
  // from the chimes above so it reads as "counting down" rather than a phase change.
  function playTick(n) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dest = compressorRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.95, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t0);
    osc.stop(t0 + 0.15);
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
    updateMediaSession();
  }

  function advancePhase() {
    if (phaseRef.current === 'work') {
      if (category.restSec > 0) {
        playChime('rest');
        phaseRef.current = 'rest';
        phaseTotalRef.current = category.restSec;
        remainingRef.current = category.restSec;
        phaseEndAtRef.current = Date.now() + category.restSec * 1000;
        updateMediaSession();
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
          phaseTotalRef.current = category.workSec;
          remainingRef.current = category.workSec;
          phaseEndAtRef.current = now + category.workSec * 1000;
          updateMediaSession();
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
    if (phaseRef.current === 'idle' || phaseRef.current === 'done') {
      phaseRef.current = 'countdown';
      roundRef.current = 1;
      phaseTotalRef.current = COUNTDOWN_SEC;
      remainingRef.current = COUNTDOWN_SEC;
      phaseEndAtRef.current = Date.now() + COUNTDOWN_SEC * 1000;
      runningRef.current = true;
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, 200);
      ensureAudio();
      playTick(COUNTDOWN_SEC);
      updateMediaSession();
      forceRender();
      return;
    }
    runningRef.current = true;
    phaseEndAtRef.current = Date.now() + remainingRef.current * 1000;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 200);
    ensureAudio();
    updateMediaSession();
    forceRender();
  }

  function pause() {
    if (phaseRef.current === 'countdown') return; // the countdown is atomic and can't be paused
    runningRef.current = false;
    clearInterval(intervalRef.current);
    updateMediaSession();
    forceRender();
  }

  function reset() {
    clearInterval(intervalRef.current);
    runningRef.current = false;
    phaseRef.current = 'idle';
    roundRef.current = 1;
    phaseTotalRef.current = category.workSec;
    remainingRef.current = category.workSec;
    updateMediaSession();
    forceRender();
  }

  function skip() {
    if (phaseRef.current === 'idle' || phaseRef.current === 'done') return;
    clearInterval(intervalRef.current);
    if (phaseRef.current === 'countdown') {
      phaseRef.current = 'work';
      phaseTotalRef.current = category.workSec;
      remainingRef.current = category.workSec;
      phaseEndAtRef.current = Date.now() + category.workSec * 1000;
    } else {
      advancePhase();
    }
    if (runningRef.current) intervalRef.current = setInterval(tick, 200);
    updateMediaSession();
    forceRender();
  }

  const CIRC = 2 * Math.PI * 90;
  const fraction = total > 0 ? remaining / total : 0;
  const ringColor = phase === 'work' ? '#33A34F' : phase === 'rest' ? '#007AFF' : phase === 'done' ? '#34C759' : '#33A34F';
  const phaseLabel = PHASE_LABELS[phase];

  function nextUpLabel() {
    const isLastRound = round >= category.rounds;
    if (phase === 'work') {
      if (category.restSec > 0) return `Next · Rest ${fmtTime(category.restSec)}`;
      return isLastRound ? 'Last interval' : `Next · Work ${fmtTime(category.workSec)}`;
    }
    if (phase === 'rest') return isLastRound ? 'Almost there' : `Next · Work ${fmtTime(category.workSec)}`;
    if (phase === 'idle') return `Starts with Work ${fmtTime(category.workSec)}`;
    return '';
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold">Timer</h1>
        <IconButton onClick={onToggleSound} title="Toggle sound">
          {soundEnabled ? <VolumeIcon className="w-5 h-5" /> : <MuteIcon className="w-5 h-5" />}
        </IconButton>
      </div>

      <div className="flex justify-center">
        <select value={category.id} onChange={e => onSelectCategory(e.target.value)}
          className="bg-iosseparator/70 rounded-full pl-4 pr-4 py-2 text-[16px] font-semibold outline-none text-center">
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-ioscard shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-full px-3.5 py-1.5">
          <span className="text-[11px] text-iossecondary font-medium">Work</span>
          <span className="text-[13px] font-semibold tabular-nums">{fmtTime(category.workSec)}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-ioscard shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-full px-3.5 py-1.5">
          <span className="text-[11px] text-iossecondary font-medium">Rest</span>
          <span className="text-[13px] font-semibold tabular-nums">{fmtTime(category.restSec)}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-ioscard shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-full px-3.5 py-1.5">
          <span className="text-[11px] text-iossecondary font-medium">Rounds</span>
          <span className="text-[13px] font-semibold tabular-nums">{category.rounds}</span>
        </div>
      </div>
      <div className="text-center text-[11px] text-iossecondary -mt-4">Edit times in the Categories tab</div>

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
            <div className="text-[13px] text-iossecondary mt-1">Round {round} of {category.rounds}</div>
            <div className="text-[12px] text-iossecondary mt-2">{nextUpLabel()}</div>
          </div>
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center pointer-events-none">
          <div className="text-white text-[160px] font-extrabold leading-none tabular-nums drop-shadow-2xl">{remaining}</div>
        </div>
      )}
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
        {categories.map(cat => (
          <Card key={cat.id} className={`p-4 ${cat.id === selectedCategoryId ? 'ring-2 ring-iosblue' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <input
                value={cat.name}
                onChange={e => onRenameCategory(cat.id, e.target.value)}
                onBlur={() => onEnsureNamed(cat.id)}
                className="text-[17px] font-semibold bg-transparent outline-none flex-1 min-w-0"
              />
              <IconButton onClick={() => onDeleteCategory(cat.id)} className="text-iosred shrink-0">
                <TrashIcon className="w-4 h-4" />
              </IconButton>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <TimeRow label="Work Time" sec={cat.workSec} onCommit={v => onUpdateCategory(cat.id, { workSec: v })} />
              <TimeRow label="Rest Time" sec={cat.restSec} onCommit={v => onUpdateCategory(cat.id, { restSec: v })} />
              <div className="flex flex-col gap-1.5 items-center bg-iosbg rounded-xl px-2 py-2.5">
                <label className="text-[11px] text-iossecondary font-medium">Rounds</label>
                <input type="number" min="1" max="99" value={cat.rounds}
                  onChange={e => onUpdateCategory(cat.id, { rounds: clamp(Number(e.target.value) || 1, 1, 99) })}
                  className="w-12 text-center bg-white rounded-md py-0.5 text-[16px] font-semibold outline-none focus:ring-2 focus:ring-iosblue" />
              </div>
            </div>
          </Card>
        ))}
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
          className="flex-1 font-semibold text-[16px] bg-iosbg rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-iosblue" />
        <IconButton onClick={onDelete} className="text-iosred"><TrashIcon className="w-4 h-4" /></IconButton>
      </div>
      <input value={exercise.description} placeholder="How to identify (optional)"
        onChange={e => onChange({ ...exercise, description: e.target.value })}
        className="text-[16px] bg-iosbg rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-iosblue text-iossecondary" />
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
          className="bg-iosbg rounded-xl p-3 text-[16px] outline-none focus:ring-2 focus:ring-iosblue resize-y" />
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
      <div className={tab === 'timer' ? 'contents' : 'hidden'}>
        <TimerTab
          category={selectedCategory}
          categories={state.categories}
          onSelectCategory={id => setState(s => ({ ...s, selectedCategoryId: id }))}
          soundEnabled={state.soundEnabled}
          onToggleSound={() => setState(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
        />
      </div>

      <div className={tab === 'categories' ? 'contents' : 'hidden'}>
        <CategoriesTab
          categories={state.categories}
          selectedCategoryId={state.selectedCategoryId}
          onUpdateCategory={updateCategory}
          onRenameCategory={renameCategory}
          onEnsureNamed={ensureCategoryNamed}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCategory}
        />
      </div>

      <div className={tab === 'workouts' ? 'contents' : 'hidden'}>
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
      </div>

      <TabBar tab={tab} onChange={setTab} />
      <CompletionOverlay celebration={celebration} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
