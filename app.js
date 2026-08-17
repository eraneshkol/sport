// ===== Storage =====
const STORAGE_KEY = 'fitnessApp.v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load state', e);
  }
  return null;
}

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function ex(name, description) {
  return { id: uid('ex'), name, description };
}

function defaultWorkouts() {
  return [
    {
      id: 'wk-a',
      name: 'אימון A',
      exercises: [
        ex('Dumbbell RDL', 'כיפוף מפרק הירך בלבד, דחיפת הישבן אחורה והורדת משקולות צמוד לשוקיים.'),
        ex('Dumbbell Bench Press', 'שכיבה על ספסל שטוח ודחיפת משקולות ישר למעלה.'),
        ex('Lat Pulldown', 'ישיבה במכונה ומשיכת מוט רחב מלמעלה למטה אל קו החזה.'),
        ex('Seated DB Shoulder Press', 'ישיבה על ספסל זקוף ודחיפת משקולות מגובה הכתפיים מעל הראש.'),
        ex('Dumbbell Bicep Curls', 'עמידה והרמת משקולות אל הכתפיים על ידי כיפוף המרפקים.'),
        ex('Plank Mountain Climbers', 'מצב פלאנק על האמות והבאת ברכיים חלופיות לכיוון החזה.'),
      ],
    },
    {
      id: 'wk-b',
      name: 'אימון B',
      exercises: [
        ex('Goblet Squat', 'ירידה לסקוואט כששתי הידיים מחזיקות משקולת אחת צמודה לחזה.'),
        ex('Incline Dumbbell Press', 'לחיצת משקולות למעלה כשהספסל בשיפוע אלכסוני (חצי ישיבה).'),
        ex('One-Arm Dumbbell Row', 'ברך ויד אחת נשענות על ספסל, והיד השנייה מושכת משקולת אל האגן.'),
        ex('Dumbbell Reverse Lunges', 'עמידה עם משקולות בידיים ולקיחת צעד גדול אחורה תוך ירידה לברך.'),
        ex('Tricep Pushdown', 'עמידה מול הפולי עליון ודחיפת החבל למטה עד יישור הזרועות.'),
        ex('Side Plank Dips', 'פלאנק על הצד והרמה/הורדה של האגן באוויר.'),
      ],
    },
  ];
}

function defaultState() {
  const workouts = defaultWorkouts();
  return {
    selectedCategoryId: 'cat-weights',
    categories: [
      { id: 'cat-weights', name: 'דחיקת משקולות', workSec: 80, restSec: 30, rounds: 3 },
      { id: 'cat-abs',     name: 'בטן',            workSec: 40, restSec: 20, rounds: 4 },
      { id: 'cat-walk',    name: 'הליכה',          workSec: 300, restSec: 60, rounds: 2 },
    ],
    workouts: workouts,
    workoutProgress: {},
    activeWorkoutId: workouts[0].id,
  };
}

let state = loadState() || defaultState();
if (!state.categories || state.categories.length === 0) {
  state = defaultState();
}
if (!state.categories.find(c => c.id === state.selectedCategoryId)) {
  state.selectedCategoryId = state.categories[0].id;
}
// Migrate older saved states that predate the workout feature.
if (!state.workouts || state.workouts.length === 0) {
  state.workouts = defaultWorkouts();
}
if (!state.workoutProgress) {
  state.workoutProgress = {};
}
if (!state.activeWorkoutId || !state.workouts.find(w => w.id === state.activeWorkoutId)) {
  state.activeWorkoutId = state.workouts[0].id;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSelectedCategory() {
  return state.categories.find(c => c.id === state.selectedCategoryId);
}

function getActiveWorkout() {
  return state.workouts.find(w => w.id === state.activeWorkoutId);
}

// ===== Tabs =====
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'categories') renderCategoryList();
    if (tab.dataset.tab === 'workout') {
      showWorkoutRunView();
      renderActiveWorkoutPicker();
      renderRunView();
    }
  });
});

function switchToTimerTab() {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'timer'));
  panels.forEach(p => p.classList.toggle('active', p.id === 'tab-timer'));
}

// ===== Config inputs =====
const categoryPicker = document.getElementById('categoryPicker');
const workMin = document.getElementById('workMin');
const workSec = document.getElementById('workSec');
const restMin = document.getElementById('restMin');
const restSec = document.getElementById('restSec');
const roundsInput = document.getElementById('roundsInput');

function renderCategoryPicker() {
  categoryPicker.innerHTML = '';
  state.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    categoryPicker.appendChild(opt);
  });
  categoryPicker.value = state.selectedCategoryId;
}

function loadConfigInputsFromCategory() {
  const cat = getSelectedCategory();
  workMin.value = Math.floor(cat.workSec / 60);
  workSec.value = cat.workSec % 60;
  restMin.value = Math.floor(cat.restSec / 60);
  restSec.value = cat.restSec % 60;
  roundsInput.value = cat.rounds;
}

function clampInput(el, min, max) {
  let v = parseInt(el.value, 10);
  if (isNaN(v)) v = min;
  v = Math.max(min, Math.min(max, v));
  el.value = v;
  return v;
}

function saveConfigInputsToCategory() {
  const cat = getSelectedCategory();
  const wm = clampInput(workMin, 0, 59);
  const ws = clampInput(workSec, 0, 59);
  const rm = clampInput(restMin, 0, 59);
  const rs = clampInput(restSec, 0, 59);
  const rounds = clampInput(roundsInput, 1, 99);
  cat.workSec = wm * 60 + ws;
  cat.restSec = rm * 60 + rs;
  cat.rounds = rounds;
  if (cat.workSec === 0) { cat.workSec = 1; workSec.value = 1; }
  saveState();
  renderCategoryList();
  resetTimerToConfig();
}

[workMin, workSec, restMin, restSec, roundsInput].forEach(el => {
  el.addEventListener('change', saveConfigInputsToCategory);
});

categoryPicker.addEventListener('change', () => {
  state.selectedCategoryId = categoryPicker.value;
  saveState();
  stopTimer();
  loadConfigInputsFromCategory();
  resetTimerToConfig();
});

// ===== Categories tab =====
const categoryList = document.getElementById('categoryList');
const addCategoryBtn = document.getElementById('addCategoryBtn');

function fmtTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderCategoryList() {
  categoryList.innerHTML = '';
  state.categories.forEach(cat => {
    const li = document.createElement('li');
    li.className = 'category-item' + (cat.id === state.selectedCategoryId ? ' selected' : '');

    const top = document.createElement('div');
    top.className = 'category-item-top';

    const nameInput = document.createElement('input');
    nameInput.className = 'category-name-input';
    nameInput.value = cat.name;
    nameInput.addEventListener('change', () => {
      cat.name = nameInput.value.trim() || cat.name;
      nameInput.value = cat.name;
      saveState();
      renderCategoryPicker();
    });

    const openBtn = document.createElement('button');
    openBtn.className = 'icon-btn';
    openBtn.title = 'פתח בטיימר';
    openBtn.textContent = '⏱';
    openBtn.addEventListener('click', () => {
      state.selectedCategoryId = cat.id;
      saveState();
      renderCategoryPicker();
      stopTimer();
      loadConfigInputsFromCategory();
      resetTimerToConfig();
      switchToTimerTab();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.title = 'מחק קטגוריה';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => {
      if (state.categories.length <= 1) {
        alert('חייבת להישאר לפחות קטגוריה אחת');
        return;
      }
      if (!confirm(`למחוק את "${cat.name}"?`)) return;
      state.categories = state.categories.filter(c => c.id !== cat.id);
      if (state.selectedCategoryId === cat.id) {
        state.selectedCategoryId = state.categories[0].id;
      }
      saveState();
      renderCategoryPicker();
      loadConfigInputsFromCategory();
      resetTimerToConfig();
      renderCategoryList();
    });

    top.appendChild(nameInput);
    top.appendChild(openBtn);
    top.appendChild(delBtn);

    const summary = document.createElement('div');
    summary.className = 'category-summary';
    summary.textContent = `עבודה ${fmtTime(cat.workSec)} · מנוחה ${fmtTime(cat.restSec)} · ${cat.rounds} סיבובים`;

    li.appendChild(top);
    li.appendChild(summary);
    categoryList.appendChild(li);
  });
}

addCategoryBtn.addEventListener('click', () => {
  const newCat = { id: uid('cat'), name: 'קטגוריה חדשה', workSec: 60, restSec: 30, rounds: 3 };
  state.categories.push(newCat);
  state.selectedCategoryId = newCat.id;
  saveState();
  renderCategoryPicker();
  loadConfigInputsFromCategory();
  resetTimerToConfig();
  renderCategoryList();
});

// ===== Timer =====
const phaseLabel = document.getElementById('phaseLabel');
const timerDisplay = document.getElementById('timerDisplay');
const roundCounter = document.getElementById('roundCounter');
const progressRing = document.getElementById('progressRing');
const startPauseBtn = document.getElementById('startPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const skipBtn = document.getElementById('skipBtn');

const RING_CIRCUMFERENCE = 2 * Math.PI * 90;

let timerPhase = 'idle'; // 'idle' | 'work' | 'rest' | 'done'
let currentRound = 1;
let phaseTotalSec = 0;
let phaseEndAt = 0;      // timestamp when current phase ends
let remainingSec = 0;
let running = false;
let tickHandle = null;

function resetTimerToConfig() {
  stopTimer();
  const cat = getSelectedCategory();
  timerPhase = 'idle';
  currentRound = 1;
  phaseTotalSec = cat.workSec;
  remainingSec = cat.workSec;
  updateDisplay();
}

function updateDisplay() {
  const cat = getSelectedCategory();
  timerDisplay.textContent = fmtTime(remainingSec);
  roundCounter.textContent = `סיבוב ${currentRound} מתוך ${cat.rounds}`;

  if (timerPhase === 'work') {
    phaseLabel.textContent = 'עבודה';
    progressRing.style.stroke = 'var(--work)';
  } else if (timerPhase === 'rest') {
    phaseLabel.textContent = 'מנוחה';
    progressRing.style.stroke = 'var(--rest)';
  } else if (timerPhase === 'done') {
    phaseLabel.textContent = 'סיום! 🎉';
    progressRing.style.stroke = 'var(--accent)';
  } else {
    phaseLabel.textContent = 'מוכן';
    progressRing.style.stroke = 'var(--work)';
  }

  const fraction = phaseTotalSec > 0 ? remainingSec / phaseTotalSec : 0;
  progressRing.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);

  startPauseBtn.textContent = running ? 'השהה' : (timerPhase === 'idle' || timerPhase === 'done' ? 'התחל' : 'המשך');
  startPauseBtn.classList.toggle('running', running);
}

function tick() {
  const now = Date.now();
  remainingSec = Math.max(0, Math.round((phaseEndAt - now) / 1000));
  updateDisplay();
  if (remainingSec <= 0) {
    advancePhase();
  }
}

function startTimer() {
  const cat = getSelectedCategory();
  if (timerPhase === 'idle' || timerPhase === 'done') {
    timerPhase = 'work';
    currentRound = 1;
    phaseTotalSec = cat.workSec;
    remainingSec = cat.workSec;
  }
  running = true;
  phaseEndAt = Date.now() + remainingSec * 1000;
  tickHandle = setInterval(tick, 200);
  updateDisplay();
}

function pauseTimer() {
  running = false;
  clearInterval(tickHandle);
  tickHandle = null;
  updateDisplay();
}

function stopTimer() {
  running = false;
  clearInterval(tickHandle);
  tickHandle = null;
}

function advancePhase() {
  const cat = getSelectedCategory();
  if (timerPhase === 'work') {
    if (cat.restSec > 0) {
      playChime('rest');
      timerPhase = 'rest';
      phaseTotalSec = cat.restSec;
      remainingSec = cat.restSec;
      phaseEndAt = Date.now() + remainingSec * 1000;
    } else {
      goToNextRoundOrFinish(cat);
      return;
    }
  } else if (timerPhase === 'rest') {
    goToNextRoundOrFinish(cat);
    return;
  }
  updateDisplay();
}

function goToNextRoundOrFinish(cat) {
  if (currentRound >= cat.rounds) {
    playChime('finish');
    timerPhase = 'done';
    running = false;
    clearInterval(tickHandle);
    tickHandle = null;
    remainingSec = 0;
    updateDisplay();
    return;
  }
  playChime('work');
  currentRound += 1;
  timerPhase = 'work';
  phaseTotalSec = cat.workSec;
  remainingSec = cat.workSec;
  phaseEndAt = Date.now() + remainingSec * 1000;
  updateDisplay();
}

startPauseBtn.addEventListener('click', () => {
  ensureAudio();
  if (running) {
    pauseTimer();
  } else {
    startTimer();
  }
});

resetBtn.addEventListener('click', () => {
  resetTimerToConfig();
});

skipBtn.addEventListener('click', () => {
  if (timerPhase === 'idle' || timerPhase === 'done') return;
  ensureAudio();
  clearInterval(tickHandle);
  advancePhase();
  if (running) {
    tickHandle = setInterval(tick, 200);
  }
});

// ===== Sound (Web Audio API pleasant chime) =====
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, startTime, duration, volume = 0.25) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function playChime(type) {
  ensureAudio();
  const t0 = audioCtx.currentTime;
  if (type === 'rest') {
    // work -> rest: descending two-tone
    playTone(880, t0, 0.18);
    playTone(587, t0 + 0.16, 0.22);
  } else if (type === 'work') {
    // rest -> work: ascending two-tone
    playTone(587, t0, 0.18);
    playTone(880, t0 + 0.16, 0.22);
  } else if (type === 'finish') {
    // finish: little triumphant triad
    playTone(659, t0, 0.18);
    playTone(784, t0 + 0.16, 0.18);
    playTone(988, t0 + 0.32, 0.4, 0.3);
  }
}

// ===== Workout tab =====
const activeWorkoutPicker = document.getElementById('activeWorkoutPicker');
const manageWorkoutsBtn = document.getElementById('manageWorkoutsBtn');
const runProgress = document.getElementById('runProgress');
const exerciseRunList = document.getElementById('exerciseRunList');
const workoutEmptyState = document.getElementById('workoutEmptyState');
const emptyStateAddBtn = document.getElementById('emptyStateAddBtn');
const resetChecksBtn = document.getElementById('resetChecksBtn');

const workoutRunViewEl = document.getElementById('workoutRunView');
const workoutManageViewEl = document.getElementById('workoutManageView');
const workoutEditViewEl = document.getElementById('workoutEditView');

const backFromManageBtn = document.getElementById('backFromManageBtn');
const addWorkoutBtn = document.getElementById('addWorkoutBtn');
const workoutList = document.getElementById('workoutList');

const backFromEditBtn = document.getElementById('backFromEditBtn');
const workoutNameInput = document.getElementById('workoutNameInput');
const importTextarea = document.getElementById('importTextarea');
const importBtn = document.getElementById('importBtn');
const exerciseEditList = document.getElementById('exerciseEditList');
const addExerciseRowBtn = document.getElementById('addExerciseRowBtn');
const saveWorkoutBtn = document.getElementById('saveWorkoutBtn');

let editingWorkoutId = null;
let draftExercises = [];

function showWorkoutRunView() {
  workoutRunViewEl.style.display = '';
  workoutManageViewEl.style.display = 'none';
  workoutEditViewEl.style.display = 'none';
}

function showWorkoutManageView() {
  workoutRunViewEl.style.display = 'none';
  workoutManageViewEl.style.display = '';
  workoutEditViewEl.style.display = 'none';
  renderWorkoutManageList();
}

function showWorkoutEditView() {
  workoutRunViewEl.style.display = 'none';
  workoutManageViewEl.style.display = 'none';
  workoutEditViewEl.style.display = '';
}

// ---- Parse pasted exercise lists (e.g. copied from Gemini) ----
// Top-level bullet lines (no leading whitespace) become exercise names.
// Indented bullet lines are treated as the description of the exercise above them.
function parseWorkoutText(text) {
  const lines = text.split(/\r?\n/);
  const exercises = [];
  lines.forEach(raw => {
    if (!raw.trim()) return;
    const leadingSpaces = raw.match(/^(\s*)/)[1].length;
    const content = raw.trim().replace(/^[-*•]\s*/, '');
    if (!content) return;
    if (leadingSpaces === 0) {
      exercises.push(ex(content, ''));
    } else if (exercises.length > 0) {
      const m = content.match(/איך מזהים:\s*(.*)/);
      const descText = (m ? m[1] : content).trim();
      const last = exercises[exercises.length - 1];
      last.description = last.description ? last.description + ' ' + descText : descText;
    }
  });
  return exercises;
}

// ---- Run view: today's workout checklist ----
function renderActiveWorkoutPicker() {
  activeWorkoutPicker.innerHTML = '';
  state.workouts.forEach(wk => {
    const opt = document.createElement('option');
    opt.value = wk.id;
    opt.textContent = wk.name;
    activeWorkoutPicker.appendChild(opt);
  });
  activeWorkoutPicker.value = state.activeWorkoutId || '';
}

activeWorkoutPicker.addEventListener('change', () => {
  state.activeWorkoutId = activeWorkoutPicker.value;
  saveState();
  renderRunView();
});

manageWorkoutsBtn.addEventListener('click', () => {
  showWorkoutManageView();
});

function renderRunView() {
  const hasWorkouts = state.workouts.length > 0;
  activeWorkoutPicker.style.display = hasWorkouts ? '' : 'none';
  workoutEmptyState.style.display = hasWorkouts ? 'none' : 'flex';
  resetChecksBtn.style.display = hasWorkouts ? '' : 'none';
  exerciseRunList.innerHTML = '';
  runProgress.textContent = '';

  if (!hasWorkouts) return;

  const wk = getActiveWorkout();
  if (!wk) return;

  const progress = state.workoutProgress[wk.id] || (state.workoutProgress[wk.id] = {});
  const doneCount = wk.exercises.filter(e => progress[e.id]).length;
  const total = wk.exercises.length;
  runProgress.textContent = `${doneCount} מתוך ${total} הושלמו`;

  const firstUndoneIndex = wk.exercises.findIndex(e => !progress[e.id]);

  wk.exercises.forEach((exercise, index) => {
    const li = document.createElement('li');
    const isDone = !!progress[exercise.id];
    const isCurrent = !isDone && index === firstUndoneIndex;
    li.className = 'exercise-run-item' + (isDone ? ' done' : '') + (isCurrent ? ' current' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isDone;
    checkbox.addEventListener('change', () => {
      progress[exercise.id] = checkbox.checked;
      saveState();
      renderRunView();
    });

    const textWrap = document.createElement('div');
    textWrap.className = 'exercise-run-text';

    if (isCurrent) {
      const badge = document.createElement('div');
      badge.className = 'exercise-run-badge';
      badge.textContent = '▶ עכשיו';
      textWrap.appendChild(badge);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'exercise-run-name';
    nameEl.textContent = exercise.name;
    textWrap.appendChild(nameEl);

    if (exercise.description) {
      const descEl = document.createElement('div');
      descEl.className = 'exercise-run-desc';
      descEl.textContent = exercise.description;
      textWrap.appendChild(descEl);
    }

    li.appendChild(checkbox);
    li.appendChild(textWrap);
    exerciseRunList.appendChild(li);
  });

  if (doneCount === total) {
    const banner = document.createElement('li');
    banner.className = 'workout-complete-banner';
    banner.textContent = 'כל הכבוד! סיימת את האימון 🎉';
    exerciseRunList.appendChild(banner);
  }
}

resetChecksBtn.addEventListener('click', () => {
  const wk = getActiveWorkout();
  if (!wk) return;
  if (!confirm(`לאפס את כל הסימונים של "${wk.name}"?`)) return;
  state.workoutProgress[wk.id] = {};
  saveState();
  renderRunView();
});

emptyStateAddBtn.addEventListener('click', () => {
  openWorkoutEdit(null);
});

// ---- Manage view: list of workout templates ----
function renderWorkoutManageList() {
  workoutList.innerHTML = '';
  state.workouts.forEach(wk => {
    const li = document.createElement('li');
    li.className = 'workout-item';

    const top = document.createElement('div');
    top.className = 'workout-item-top';

    const name = document.createElement('div');
    name.className = 'workout-item-name';
    name.textContent = wk.name;

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'ערוך';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => openWorkoutEdit(wk.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.title = 'מחק אימון';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => {
      if (!confirm(`למחוק את "${wk.name}"?`)) return;
      state.workouts = state.workouts.filter(w => w.id !== wk.id);
      delete state.workoutProgress[wk.id];
      if (state.activeWorkoutId === wk.id) {
        state.activeWorkoutId = state.workouts.length ? state.workouts[0].id : null;
      }
      saveState();
      renderWorkoutManageList();
      renderActiveWorkoutPicker();
      renderRunView();
    });

    top.appendChild(name);
    top.appendChild(editBtn);
    top.appendChild(delBtn);

    const summary = document.createElement('div');
    summary.className = 'workout-item-summary';
    summary.textContent = `${wk.exercises.length} תרגילים`;

    li.appendChild(top);
    li.appendChild(summary);
    workoutList.appendChild(li);
  });
}

backFromManageBtn.addEventListener('click', () => {
  showWorkoutRunView();
  renderRunView();
});

addWorkoutBtn.addEventListener('click', () => {
  openWorkoutEdit(null);
});

// ---- Edit view: create / edit a workout template ----
function openWorkoutEdit(workoutId) {
  editingWorkoutId = workoutId;
  if (workoutId) {
    const wk = state.workouts.find(w => w.id === workoutId);
    workoutNameInput.value = wk.name;
    draftExercises = wk.exercises.map(e => ({ ...e }));
  } else {
    workoutNameInput.value = '';
    draftExercises = [];
  }
  importTextarea.value = '';
  renderExerciseEditList();
  showWorkoutEditView();
}

function renderExerciseEditList() {
  exerciseEditList.innerHTML = '';
  draftExercises.forEach((exercise, index) => {
    const li = document.createElement('li');
    li.className = 'exercise-edit-item';

    const row1 = document.createElement('div');
    row1.className = 'exercise-edit-item-row';

    const nameInput = document.createElement('input');
    nameInput.className = 'exercise-name-field';
    nameInput.placeholder = 'שם התרגיל';
    nameInput.value = exercise.name;
    nameInput.addEventListener('input', () => { exercise.name = nameInput.value; });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => {
      draftExercises.splice(index, 1);
      renderExerciseEditList();
    });

    row1.appendChild(nameInput);
    row1.appendChild(delBtn);

    const descInput = document.createElement('input');
    descInput.placeholder = 'איך מזהים (תיאור, אופציונלי)';
    descInput.value = exercise.description || '';
    descInput.addEventListener('input', () => { exercise.description = descInput.value; });

    li.appendChild(row1);
    li.appendChild(descInput);
    exerciseEditList.appendChild(li);
  });
}

importBtn.addEventListener('click', () => {
  const parsed = parseWorkoutText(importTextarea.value);
  if (parsed.length === 0) {
    alert('לא הצלחתי לזהות תרגילים בטקסט שהודבק');
    return;
  }
  draftExercises = draftExercises.concat(parsed);
  importTextarea.value = '';
  renderExerciseEditList();
});

addExerciseRowBtn.addEventListener('click', () => {
  draftExercises.push(ex('', ''));
  renderExerciseEditList();
});

backFromEditBtn.addEventListener('click', () => {
  showWorkoutManageView();
});

saveWorkoutBtn.addEventListener('click', () => {
  const name = workoutNameInput.value.trim();
  if (!name) {
    alert('צריך לתת שם לאימון');
    return;
  }
  const cleanExercises = draftExercises
    .filter(e => e.name && e.name.trim())
    .map(e => ({ id: e.id || uid('ex'), name: e.name.trim(), description: (e.description || '').trim() }));
  if (cleanExercises.length === 0) {
    alert('צריך לפחות תרגיל אחד');
    return;
  }

  if (editingWorkoutId) {
    const wk = state.workouts.find(w => w.id === editingWorkoutId);
    wk.name = name;
    wk.exercises = cleanExercises;
  } else {
    const newWorkout = { id: uid('wk'), name, exercises: cleanExercises };
    state.workouts.push(newWorkout);
    state.activeWorkoutId = newWorkout.id;
  }
  saveState();
  renderActiveWorkoutPicker();
  showWorkoutManageView();
});

// ===== Init =====
renderCategoryPicker();
loadConfigInputsFromCategory();
resetTimerToConfig();
renderCategoryList();
renderActiveWorkoutPicker();
renderRunView();
