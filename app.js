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

function defaultState() {
  return {
    selectedCategoryId: 'cat-weights',
    categories: [
      { id: 'cat-weights', name: 'דחיקת משקולות', workSec: 80, restSec: 30, rounds: 3 },
      { id: 'cat-abs',     name: 'בטן',            workSec: 40, restSec: 20, rounds: 4 },
      { id: 'cat-walk',    name: 'הליכה',          workSec: 300, restSec: 60, rounds: 2 },
    ],
  };
}

let state = loadState() || defaultState();
if (!state.categories || state.categories.length === 0) {
  state = defaultState();
}
if (!state.categories.find(c => c.id === state.selectedCategoryId)) {
  state.selectedCategoryId = state.categories[0].id;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSelectedCategory() {
  return state.categories.find(c => c.id === state.selectedCategoryId);
}

function uid() {
  return 'cat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
  const newCat = { id: uid(), name: 'קטגוריה חדשה', workSec: 60, restSec: 30, rounds: 3 };
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

// ===== Init =====
renderCategoryPicker();
loadConfigInputsFromCategory();
resetTimerToConfig();
renderCategoryList();
