// ========================
// Состояние приложения
// ========================
let currentDate = new Date();
let vakhtaStartDate = null;
let manualOverrides = {};
let manualNotes = {};           // заметки по датам { 'YYYY-MM-DD': 'текст' }
let currentSchedule = 'standard'; // 'standard', 'sakhalin', 'standard-day', 'sakhalin-day'
let currentView = 'year';         // 'month' | 'year'

// чувствительность к движению до старта long-press (адаптация под DPR)
const LONG_PRESS_MS = 380;
const MOVE_CANCEL_PX = Math.max(14, Math.round(10 * (window.devicePixelRatio || 1)));
const DRAG_MIN_DATES = 2;

// Жесты редактирования на телефоне: 'single' | 'double'
let editGestureMode = localStorage.getItem('editGestureMode') || 'double';
let lastTapTime = 0, lastTapDateStr = null, lastTapX = 0, lastTapY = 0;

// Свайпы (мобильная навигация)
let swipeTracking = false;
let swipeStartX = 0, swipeStartY = 0;
let swipeConsumed = false;
let disableSwipe = false;

// Наблюдатели
let yearResizeObserver = null;
let monthResizeObserver = null;

// Массовое редактирование (тач‑диапазон)
let selecting = false;
let selectionStartDate = null;
let selectionEndDate = null;
let selectionEls = new Set();
let longPressTimer = null;

// Массовое редактирование (мышь: Shift + drag)
let mouseSelecting = false;

// ========================
// Переключение вида
// ========================
function toggleView() {
  currentView = currentView === 'month' ? 'year' : 'month';
  saveData();
  renderCalendar();
  updateViewButton();
}

function updateViewButton() {
  const btn = document.getElementById('toggle-view');
  if (!btn) return;
  if (currentView === 'month') {
    btn.innerHTML = '📊 Годовой вид';
    btn.title = 'Показать весь год одним взглядом';
  } else {
    btn.innerHTML = '📅 Месячный вид';
    btn.title = 'Вернуться к детальному просмотру по месяцам';
  }
}

// ========================
// Годовой вид
// ========================
function renderYearView() {
  const calendarEl = document.getElementById('calendar');
  const currentMonthEl = document.getElementById('current-month');

  while (calendarEl.children.length > 7) {
    calendarEl.removeChild(calendarEl.lastChild);
  }
  currentMonthEl.textContent = currentDate.getFullYear();

  const yearContainer = document.createElement('div');
  yearContainer.className = 'year-view';
  yearContainer.style.gridColumn = '1 / -1';

  for (let month = 0; month < 12; month++) {
    const mini = createMonthOverview(month);
    if (mini && mini.nodeType === 1) {
      yearContainer.appendChild(mini);
    }
  }
  calendarEl.appendChild(yearContainer);
}

// ========================
// Месячный вид: подгоняем высоту ячеек
// ========================
function fitMonthRows() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl || currentView !== 'month') return;

  const dayHeaders = Array.from(calendarEl.querySelectorAll(':scope > .day-header'));
  const dayCells   = Array.from(calendarEl.querySelectorAll(':scope > .day'));
  if (dayHeaders.length !== 7 || dayCells.length === 0) return;

  const headerH = Math.max(...dayHeaders.map(h => h.offsetHeight || 0));
  const cs = getComputedStyle(calendarEl);
  const rowGap = parseFloat(cs.rowGap || cs.gap || '0') || 0;

  const availH = calendarEl.clientHeight - headerH - rowGap;
  if (availH <= 0) return;

  const plannedCellH = Math.floor((availH - rowGap * 5 - 2) / 6);
  const MIN_COMFORT = 60;

  if (plannedCellH < MIN_COMFORT) {
    dayCells.forEach(cell => {
      cell.style.minHeight = '';
      cell.style.height = '';
    });
    calendarEl.style.overflowY = 'auto';
    return;
  }
  dayCells.forEach(cell => {
    cell.style.minHeight = plannedCellH + 'px';
    cell.style.height    = plannedCellH + 'px';
  });
}

// ========================
// Мини‑месяц для годового вида
// ========================
function createMonthOverview(month) {
  const monthEl = document.createElement('div');
  monthEl.className = 'month-overview';

  let lastTap = 0;

  monthEl.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  monthEl.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastTap = now;
  }, { passive: false });

  monthEl.addEventListener('click', (e) => {
    e.preventDefault();
    currentDate.setMonth(month);
    currentView = 'month';
    saveData();
    renderCalendar();
    updateViewButton();
  });

  const mName = new Date(currentDate.getFullYear(), month).toLocaleDateString('ru-RU', { month: 'long' });
  monthEl.innerHTML = `
    <div class="month-header">
      <div class="month-name">${mName}</div>
      <div class="month-stats">${getMonthStats(month)}</div>
    </div>
    <div class="month-days-grid">
      ${generateMonthDays(month)}
    </div>
  `;
  return monthEl;
}

function generateMonthDays(month) {
  const year = currentDate.getFullYear();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  const fdw = firstDay.getDay();
  const leading = fdw === 0 ? 6 : fdw - 1;

  let html = '';
  for (let i = 0; i < leading; i++) html += '<div class="month-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const status = calculateVakhtaStatus(date);
    const isToday = isTodayDate(date);
    const cls = `month-day ${isToday ? 'today' : ''}`;
    const sym = getStatusSymbol(status);

    let bg = '';
    if (status === 'travel-to') {
      bg = 'background: linear-gradient(to right, #3498db 50%, #ff6b6b 50%);';
    } else if (status === 'travel-from') {
      bg = 'background: linear-gradient(to right, #9b59b6 50%, #3498db 50%);';
    } else if (status === 'travel-from-day') {
      bg = 'background: linear-gradient(to right, #ff6b6b 50%, #3498db 50%);';
    } else {
      bg = `background:${getStatusColor(status)};`;
    }

    html += `
      <div class="${cls}" style="${bg}" title="${d} ${monthNameRu(month)} - ${getStatusText(status)}">
        <div class="day-number">${d}</div>
        ${sym ? `<div class="day-symbol">${sym}</div>` : ''}
      </div>
    `;
  }

  let used = leading + daysInMonth;
  let toFullWeeks = Math.ceil(used / 7) * 7 - used;
  for (let i = 0; i < toFullWeeks; i++) html += '<div class="month-day empty"></div>';
  used += toFullWeeks;
  const toSix = 42 - used;
  for (let i = 0; i < toSix; i++) html += '<div class="month-day empty"></div>';

  return html;
}

function getMonthStats(month) {
  const year = currentDate.getFullYear();
  const lastDay = new Date(year, month + 1, 0);
  let work = 0, rest = 0, spec = 0;
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    const st = calculateVakhtaStatus(date);
    if (isWorkStatus(st)) work++;
    else if (isSpecialStatus(st)) spec++;
    else rest++;
  }
  return `${work}р/${rest}о`;
}

// ========================
// Вспомогательное
// ========================
function fmtYMDLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseYMDLocal(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function isTodayDate(d) {
  const t = new Date();
  return d.getDate() === t.getDate()
      && d.getMonth() === t.getMonth()
      && d.getFullYear() === t.getFullYear();
}
function monthNameRu(m) {
  return new Date(currentDate.getFullYear(), m)
    .toLocaleDateString('ru-RU', { month: 'long' });
}
function getStatusSymbol(st) {
  const map = {
    'work-day': '☀️', 'work-night': '🌙', 'travel-to': '➡️',
    'travel-from': '⬅️', 'travel-from-day': '⬅️',
    'plane-from-home': '✈️','plane-to-home': '✈️','train': '🚂',
    'sick': '🟨','business-trip': '🧳','vacation': '🏖️','rest': ''
  };
  return map[st] || '';
}
function getStatusColor(st) {
  const c = {'work-day':'#ff6b6b','work-night':'#9b59b6','travel-to':'#3498db','travel-from':'#3498db','travel-from-day':'#3498db','plane-from-home':'#3498db','plane-to-home':'#3498db','train':'#3498db','rest':'#bdc3c7','sick':'#f1c40f','business-trip':'#1abc9c','vacation':'#95a5a6'};
  return c[st] || '#bdc3c7';
}
function escapeHtml(s) {
  try {
    return String(s).replace(/[&<>"']/g, ch => (
      ch === '&' ? '&amp;' :
      ch === '<' ? '&lt;'  :
      ch === '>' ? '&gt;'  :
      ch === '"' ? '&quot;': '&#39;'
    ));
  } catch { return ''; }
}
function isWorkStatus(st) { return ['travel-to','work-day','work-night','travel-from','travel-from-day'].includes(st); }
function isSpecialStatus(st) { return ['sick','business-trip','vacation'].includes(st); }

// ========================
// Данные
// ========================
function loadSavedData() {
  const saved = localStorage.getItem('vakhtaCalendarData');
  if (saved) {
    const data = JSON.parse(saved);
    if (data.isSakhalinMode !== undefined) {
      currentSchedule = data.isDayMode
        ? (data.isSakhalinMode ? 'sakhalin-day' : 'standard-day')
        : (data.isSakhalinMode ? 'sakhalin' : 'standard');
    } else if (data.currentSchedule) {
      currentSchedule = data.currentSchedule;
    }

    if (data.vakhtaStartDate) {
      if (typeof data.vakhtaStartDate === 'string' && data.vakhtaStartDate.length === 10) {
        const d = parseYMDLocal(data.vakhtaStartDate);
        if (!isNaN(d)) vakhtaStartDate = d;
      } else {
        const d = new Date(data.vakhtaStartDate);
        if (!isNaN(d)) vakhtaStartDate = d;
      }
    }

    if (data.manualOverrides) manualOverrides = data.manualOverrides;
    if (data.manualNotes && typeof data.manualNotes === 'object') manualNotes = data.manualNotes;

    if (data.currentView) currentView = data.currentView === 'year' ? 'year' : 'month';
  }
  updateScheduleButtonText();
}

function saveData() {
  localStorage.setItem('vakhtaCalendarData', JSON.stringify({
    vakhtaStartDate: vakhtaStartDate ? fmtYMDLocal(vakhtaStartDate) : null,
    manualOverrides,
    manualNotes,
    currentSchedule,
    currentView
  }));
}

function updateScheduleButtonText() {
  const btn = document.getElementById('schedule-select-btn');
  if (!btn) return;
  const texts = {
    'standard': '📋 Стандартный',
    'sakhalin': '🏝️ Сахалинский',
    'standard-day': '☀️ Стандартный дневной',
    'sakhalin-day': '☀️ Сахалинский дневной'
  };
  const currentText = texts[currentSchedule] || 'Режимы вахты';
  btn.innerHTML = `
    <div style="font-size: 10px; line-height: 1; margin-bottom: 2px; opacity: .8;">РЕЖИМ ВАХТЫ</div>
    <div style="font-size: 12px; line-height: 1.1;">${currentText} ▼</div>
  `;
  btn.title = `Текущий режим: ${currentText}. Нажмите для изменения`;
}

// ========================
// Инициализация
// ========================
function initCalendar() {
  loadSavedData();
  initTelegramApp();
  updateViewButton();
  renderCalendar();
  setupEventListeners();
  setupMouseRangeSelection();
  setupSwipeNavigation();
  updateLegendVisibility();
  updateScheduleButtonText();
  ensureActionsBar();   // гарантируем панель для тест-кнопок
  addTgTestButton();    // рисуем тест‑кнопки TG
  processPrintParams();
  showDebugBanner();    // маленький бейдж диагностики
}

// Улучшенный детектор WebApp: объект или hash-параметры
function isTelegramWebApp() {
  try {
    if (window.Telegram && Telegram.WebApp) return true;
    const h = String(location.hash || '');
    if (/tgwebapp/i.test(h)) return true;
    if (/tgwebappdata/i.test(h)) return true;
    if (/tgwebappversion/i.test(h)) return true;
    if (/tgwebappthemeparams/i.test(h)) return true;
    return false;
  } catch { return false; }
}

function initTelegramApp() {
  try {
    const inTG = isTelegramWebApp();

    if (window.Telegram && Telegram.WebApp) {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
      Telegram.WebApp.setHeaderColor('#2c3e50');
      Telegram.WebApp.setBackgroundColor('#1e3c72');
      Telegram.WebApp.BackButton.show();
      Telegram.WebApp.BackButton.onClick(() => Telegram.WebApp.close());
      console.log('[TG] WebApp OK:', { platform: Telegram.WebApp.platform, version: Telegram.WebApp.version });
    } else if (inTG) {
      // WebApp распознан по hash — объект может отсутствовать в некоторых клиентах
      console.log('[TG] WebApp detected via hash (no window.Telegram.WebApp).');
    } else {
      console.log('[TG] WebApp not detected (открыто не из бота)');
    }
  } catch (e) {
    console.warn('[TG] initTelegramApp error:', e);
  }
}

function setupEventListeners() {
  // Блокируем системное меню "копировать"
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('.calendar')) e.preventDefault();
  });
  document.addEventListener('selectstart', (e) => {
    const el = e.target;
    if (el && el.closest && el.closest('.calendar')) {
      const tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
    }
  });
  document.addEventListener('touchstart', (e) => {
    if (e.target.closest && e.target.closest('.calendar')) {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    }
  }, { passive: true });

  document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
  document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
  document.getElementById('prev-year').addEventListener('click', () => { currentDate.setFullYear(currentDate.getFullYear() - 1); renderCalendar(); });
  document.getElementById('next-year').addEventListener('click', () => { currentDate.setFullYear(currentDate.getFullYear() + 1); renderCalendar(); });
  document.getElementById('today').addEventListener('click', () => { currentDate = new Date(); renderCalendar(); });

  const shareBtn = document.getElementById('share');
  if (shareBtn) shareBtn.addEventListener('click', openShareModal);

  document.getElementById('set-vakhta').addEventListener('click', setVakhtaStartDate);
  document.getElementById('show-stats').addEventListener('click', showStatistics);
  document.getElementById('reset-changes').addEventListener('click', resetManualChanges);
  document.getElementById('show-help').addEventListener('click', showHelp);

  document.getElementById('schedule-select-btn').addEventListener('click', showScheduleSelector);
  document.getElementById('current-month').addEventListener('click', showMonthYearPicker);
  document.getElementById('toggle-view').addEventListener('click', toggleView);

  // ПК: клик по пустому месту снимает подсветку диапазона
  document.addEventListener('mousedown', (e) => {
    if (selectionEls && selectionEls.size) {
      const cell = e.target.closest && e.target.closest('.day');
      if (!e.shiftKey || !cell) clearSelectionHighlight();
    }
  });
}

// ========================
// Легенда
// ========================
function updateLegendVisibility() {
  const planeLegend = document.getElementById('legend-plane');
  if (!planeLegend) return;
  const hidePlane = currentSchedule === 'sakhalin' || currentSchedule === 'sakhalin-day';
  planeLegend.style.display = hidePlane ? 'none' : 'flex';
}

// ========================
// Месячный рендер
// ========================
function createDayElement(date, isOtherMonth) {
  const dayEl = document.createElement('div');
  const classes = ['day'];

  const today = new Date(); today.setHours(0,0,0,0);
  if (date.getTime() === today.getTime()) classes.push('today');
  if (isOtherMonth) classes.push('other-month');

  const status = calculateVakhtaStatus(date);
  classes.push(`status-${status}`);

  const dateStr = fmtYMDLocal(date);
  if (manualOverrides[dateStr]) classes.push('manual-override');

  dayEl.className = classes.join(' ');

  const statusHtml = (status === 'business-trip' && manualNotes[dateStr])
    ? `${escapeHtml(manualNotes[dateStr])}`
    : getStatusText(status);

  dayEl.innerHTML = `
    <div class="day-number">${date.getDate()}</div>
    <div class="day-status">${statusHtml}</div>
  `;
  dayEl.setAttribute('data-date', dateStr);

  dayEl.addEventListener('dblclick', () => editDayManually(date));
  addDayTouchHandlers(dayEl);
  return dayEl;
}

function renderCalendar() {
  const calendarEl = document.getElementById('calendar');
  const dayHeaders = calendarEl.querySelectorAll('.day-header');

  if (yearResizeObserver) { try { yearResizeObserver.disconnect(); } catch {} yearResizeObserver = null; }
  if (monthResizeObserver) { try { monthResizeObserver.disconnect(); } catch {} monthResizeObserver = null; }

  const controls = document.querySelector('.controls');

 if (currentView === 'year') {
  dayHeaders.forEach(h => h.style.display = 'none');
  calendarEl.classList.add('year-mode');
  if (controls) controls.classList.add('hide-month-nav'); // фикс: убрана лишняя ')'
  const oldYear = calendarEl.querySelector('.year-view');
  if (oldYear) oldYear.remove();
  renderYearView();
  return;
}



  calendarEl.classList.remove('year-mode');
  dayHeaders.forEach(h => h.style.display = 'grid');
  if (controls) controls.classList.remove('hide-month-nav');

  clearSelectionHighlight();
  document.body.classList.remove('range-selecting');
  selecting = false;
  mouseSelecting = false;
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

  const currentMonthEl = document.getElementById('current-month');

  while (calendarEl.children.length > 7) {
    calendarEl.removeChild(calendarEl.lastChild);
  }

  currentMonthEl.textContent = currentDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  let firstDayOfWeek = firstDay.getDay();
  firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const prevMonthLastDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    calendarEl.appendChild(createDayElement(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, d), true));
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    calendarEl.appendChild(createDayElement(new Date(currentDate.getFullYear(), currentDate.getMonth(), d), false));
  }

  const totalCells = 42;
  const daysSoFar = firstDayOfWeek + lastDay.getDate();
  const nextDays = totalCells - daysSoFar;
  for (let d = 1; d <= nextDays; d++) {
    calendarEl.appendChild(createDayElement(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, d), true));
  }

  fitMonthRows();
  monthResizeObserver = new ResizeObserver(() => fitMonthRows());
  monthResizeObserver.observe(calendarEl);

  updateLegendVisibility();
}

// ========================
// Установка старта вахты
// ========================
function setVakhtaStartDate() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 300px;">
      <h3 style="margin-bottom: 15px; text-align: center;">Выберите дату начала вахты</h3>
      <div style="margin-bottom: 15px;">
        <button id="quick-today" style="width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 5px;">Выбрать сегодня</button>
      </div>
      <input type="date" id="date-input" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 5px;">
      <div style="display: flex; gap: 10px;">
        <button id="confirm-date" style="flex: 1; padding: 10px; background: #27ae60; color: white; border: none; border-radius: 5px;">OK</button>
        <button id="cancel-date" style="flex: 1; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 5px;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const dateInput = modal.querySelector('#date-input');
  const today = new Date();
  dateInput.value = fmtYMDLocal(today);

  modal.querySelector('#quick-today').addEventListener('click', () => {
    dateInput.value = fmtYMDLocal(new Date());
  });

  modal.querySelector('#confirm-date').addEventListener('click', () => {
    if (dateInput.value) {
      const inputDate = parseYMDLocal(dateInput.value);
      if (!isNaN(inputDate.getTime())) {
        vakhtaStartDate = inputDate;
        saveData();
        renderCalendar();
        alert(`Дата начала вахты установлена: ${inputDate.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' })}`);
        queueTgSync('set-start');
      }
    }
    document.body.removeChild(modal);
  });

  modal.querySelector('#cancel-date').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

// ========================
// Логика статусов
// ========================
function calculateVakhtaStatus(date) {
  const dateStr = fmtYMDLocal(date);
  if (manualOverrides[dateStr]) return manualOverrides[dateStr];
  if (!vakhtaStartDate) return 'rest';

  const dateStart = new Date(date); dateStart.setHours(0,0,0,0);
  const vakhtaStart = new Date(vakhtaStartDate); vakhtaStart.setHours(0,0,0,0);

  const diffDays = Math.floor((dateStart - vakhtaStart) / (1000 * 60 * 60 * 24));
  const cycleDay = ((diffDays % 56) + 56) % 56;

  switch (currentSchedule) {
    case 'standard':
      if (cycleDay === 54) return 'plane-from-home';
      if (cycleDay === 55) return 'train';
      if (cycleDay === 0)  return 'travel-to';
      if (cycleDay === 28) return 'travel-from';
      if (cycleDay === 29) return 'plane-to-home';
      if (cycleDay >= 1 && cycleDay <= 14) return 'work-day';
      if (cycleDay >= 15 && cycleDay <= 27) return 'work-night';
      return 'rest';
    case 'sakhalin':
      if (cycleDay === 55) return 'train';
      if (cycleDay === 0)  return 'travel-to';
      if (cycleDay === 28) return 'travel-from';
      if (cycleDay >= 1 && cycleDay <= 14) return 'work-day';
      if (cycleDay >= 15 && cycleDay <= 27) return 'work-night';
      return 'rest';
    case 'standard-day':
      if (cycleDay === 54) return 'plane-from-home';
      if (cycleDay === 55) return 'train';
      if (cycleDay === 0)  return 'travel-to';
      if (cycleDay === 28) return 'travel-from-day';
      if (cycleDay === 29) return 'plane-to-home';
      if (cycleDay >= 1 && cycleDay <= 27) return 'work-day';
      return 'rest';
    case 'sakhalin-day':
      if (cycleDay === 55) return 'train';
      if (cycleDay === 0)  return 'travel-to';
      if (cycleDay === 28) return 'travel-from-day';
      if (cycleDay >= 1 && cycleDay <= 27) return 'work-day';
      return 'rest';
    default:
      return 'rest';
  }
}

function getStatusText(status) {
  switch (status) {
    case 'plane-from-home': return '✈️ Самолет';
    case 'train': return '🚂 Поезд';
    case 'travel-to': return 'Заезд + день';
    case 'work-day': return 'День';
    case 'work-night': return 'Ночь';
    case 'travel-from': return 'Ночь + выезд';
    case 'travel-from-day': return 'День + выезд';
    case 'plane-to-home': return '✈️ Самолет';
    case 'rest': return 'Отдых';
    case 'sick': return '🟨 Больничный';
    case 'business-trip': return '🧳 Командировка';
    case 'vacation': return '🏖️ Отпуск';
    default: return 'Отдых';
  }
}

// ========================
// Редактирование дня (один день)
// ========================
function editDayManually(date) {
  const dateStr = fmtYMDLocal(date);
  const currentStatus = calculateVakhtaStatus(date);

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 320px;">
      <h3 style="margin-bottom: 15px; text-align: center;">
        Редактирование дня<br>
        <small>${date.toLocaleDateString('ru-RU')}</small>
      </h3>

      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 6px;">Текущий статус:</label>
        <div style="padding: 8px; background: #f8f9fa; border-radius: 5px; margin-bottom: 10px;">
          ${getStatusText(currentStatus)}
        </div>
      </div>

      <label style="display:block; margin: 10px 0 6px;">Новый статус</label>
      <select id="status-select" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px;">
        <option value="auto">Автоматически (по графику)</option>
        <option value="rest">Отдых</option>
        <option value="plane-from-home">✈️ Самолет</option>
        <option value="train">🚂 Поезд</option>
        <option value="travel-to">Заезд + день</option>
        <option value="work-day">День</option>
        <option value="work-night">Ночь</option>
        <option value="travel-from">Ночь + выезд</option>
        <option value="travel-from-day">День + выезд</option>
        <option value="sick">🟨 Больничный</option>
        <option value="business-trip">🧳 Командировка</option>
        <option value="vacation">🏖️ Отпуск</option>
      </select>

      <div id="note-wrap" style="display:none; margin-bottom: 10px;">
        <label for="note-input" style="display:block; margin-bottom:6px;">Заметка (что за командировка):</label>
        <input id="note-input" type="text"
               placeholder="например: мед.осмотр, обучение ОТ, тренинг"
               style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;" />
        <div style="margin-top:6px; font-size:11px; color:#7f8c8d;">
          Заметка отобразится маленьким текстом вместо слова «Командировка».
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button id="save-edit" style="flex: 1; padding: 10px; background: #27ae60; color: white; border: none; border-radius: 6px;">Сохранить</button>
        <button id="cancel-edit" style="flex: 1; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 6px;">Отмена</button>
        ${manualOverrides[dateStr] ? `<button id="reset-edit" style="flex: 1; padding: 10px; background: #e67e22; color: white; border: none; border-radius: 6px;">Сбросить</button>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const select = modal.querySelector('#status-select');
  const noteWrap = modal.querySelector('#note-wrap');
  const noteInput = modal.querySelector('#note-input');

  if (manualOverrides[dateStr]) select.value = manualOverrides[dateStr];

  const syncNoteVisibility = () => {
    if (select.value === 'business-trip') {
      noteWrap.style.display = '';
      noteInput.value = manualNotes[dateStr] || '';
    } else {
      noteWrap.style.display = 'none';
    }
  };
  syncNoteVisibility();
  select.addEventListener('change', syncNoteVisibility);

  modal.querySelector('#save-edit').addEventListener('click', () => {
    const val = select.value;
    if (val === 'auto') {
      delete manualOverrides[dateStr];
      delete manualNotes[dateStr];
    } else {
      manualOverrides[dateStr] = val;
      if (val === 'business-trip') {
        const t = (noteInput.value || '').trim();
        if (t) manualNotes[dateStr] = t; else delete manualNotes[dateStr];
      } else {
        delete manualNotes[dateStr];
      }
    }
    saveData();
    renderCalendar();
    document.body.removeChild(modal);
    queueTgSync('edit-day');
  });

  if (manualOverrides[dateStr]) {
    const btn = modal.querySelector('#reset-edit');
    if (btn) btn.addEventListener('click', () => {
      delete manualOverrides[dateStr];
      delete manualNotes[dateStr];
      saveData();
      renderCalendar();
      document.body.removeChild(modal);
      queueTgSync('edit-day');
    });
  }

  modal.querySelector('#cancel-edit').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

// ========================
// Массовое редактирование (тач) — прямоугольник по сетке
// ========================
// ========================
// ========================
// Массовое редактирование (тач) — линейно по индексам 0..41 с “умным якорем” и сбросом при развороте
// ========================
function addDayTouchHandlers(el) {
  let touchStartTime = 0;
  let startX = 0, startY = 0;
  let moved = false;
  let tapTargetDateStr = null;

  // Снимок сетки
  let cells = null;        // 42 .day
  let colCenters = null;   // 7 центров X
  let rowCenters = null;   // 6 центров Y
  let startIdx = null;     // 0..41
  let curIdx = null;       // 0..41 (текущий)
  let anchorIdx = null;    // якорь диапазона
  let minIdxVisited = null, maxIdxVisited = null;

  // Для детекции разворота по вертикали
  let lastRow = null;
  let lastRowDir = 0; // -1 вверх, +1 вниз, 0 нет

  const nearestIndex = (arr, v) => {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - v);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  };

  const buildGrid = (hitEl) => {
    const list = Array.from(document.querySelectorAll('#calendar > .day'));
    if (list.length < 42) return false;
    cells = list;

    startIdx = list.indexOf(hitEl);
    if (startIdx < 0) startIdx = 0;

    // центры строк
    rowCenters = [];
    for (let r = 0; r < 6; r++) {
      const cell = list[r * 7];
      const cr = cell.getBoundingClientRect();
      rowCenters.push((cr.top + cr.bottom) / 2);
    }
    // центры колонок (по строке старта — колонки одинаковой ширины)
    const startRow = Math.floor(startIdx / 7);
    colCenters = [];
    for (let c = 0; c < 7; c++) {
      const cell = list[startRow * 7 + c];
      const cr = cell.getBoundingClientRect();
      colCenters.push((cr.left + cr.right) / 2);
    }
    return true;
  };

  el.addEventListener('touchstart', (e) => {
    if (currentView !== 'month') return;

    if (selectionEls && selectionEls.size) clearSelectionHighlight();

    const t = e.touches && e.touches[0];
    if (!t) return;

    touchStartTime = Date.now();
    moved = false;
    startX = t.clientX;
    startY = t.clientY;

    const hit = (function () {
      const n = document.elementFromPoint(startX, startY);
      return n && n.closest ? n.closest('.day') : null;
    })() || e.currentTarget;

    const ds = hit && hit.getAttribute('data-date');
    if (!ds) return;
    tapTargetDateStr = ds;

    if (!buildGrid(hit)) return;

    // инициализация
    curIdx = startIdx;
    anchorIdx = startIdx;
    minIdxVisited = startIdx;
    maxIdxVisited = startIdx;

    lastRow = Math.floor(startIdx / 7);
    lastRowDir = 0;

    selecting = false;

    // для совместимости с ПК-диалогом (если выделение сорвётся раньше)
    selectionStartDate = parseYMDLocal(ds);
    selectionEndDate   = parseYMDLocal(ds);

    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (moved) return;
      selecting = true;
      disableSwipe = true;
      document.body.classList.add('range-selecting');
      updateSelectionHighlightIndices(anchorIdx, curIdx, cells);
    }, LONG_PRESS_MS);
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!tapTargetDateStr) return;
    const t = e.touches && e.touches[0];
    if (!t) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (!selecting) {
      const dist = Math.hypot(dx, dy);
      if (dist > MOVE_CANCEL_PX && Math.abs(dy) > Math.abs(dx)) {
        moved = true;
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      }
      return;
    }

    if (cells && colCenters && rowCenters) {
      const col = Math.max(0, Math.min(6, nearestIndex(colCenters, t.clientX)));
      const row = Math.max(0, Math.min(5, nearestIndex(rowCenters, t.clientY)));
      const idx = row * 7 + col;

      if (idx !== curIdx && idx >= 0 && idx < cells.length) {
        // детекция разворота по вертикали (изменился знак движения по рядам)
        const rowDir = (lastRow === null || row === lastRow) ? lastRowDir
                      : (row > lastRow ? 1 : -1);
        const turned = (lastRowDir !== 0 && rowDir !== 0 && rowDir !== lastRowDir);

        curIdx = idx;

        // Если развернулись вверх/вниз — обнуляем "дальние" экстремумы до текущей позиции,
        // чтобы диапазон начал сжиматься со стороны конца, как на ПК
        if (turned) {
          minIdxVisited = Math.min(startIdx, curIdx);
          maxIdxVisited = Math.max(startIdx, curIdx);
        } else {
          // обычный режим — накапливаем экстремумы
          minIdxVisited = Math.min(minIdxVisited, curIdx);
          maxIdxVisited = Math.max(maxIdxVisited, curIdx);
        }

        // “умный якорь” (только для прохождения через старт слева/справа)
        if (curIdx >= startIdx && minIdxVisited < startIdx) {
          anchorIdx = minIdxVisited;   // ушли влево и сейчас справа — держим левый край
        } else if (curIdx <= startIdx && maxIdxVisited > startIdx) {
          anchorIdx = maxIdxVisited;   // ушли вправо и сейчас слева — держим правый край
        } else {
          anchorIdx = startIdx;        // иначе — якорь на старте
        }

        updateSelectionHighlightIndices(anchorIdx, curIdx, cells);

        // обновляем "последний ряд/направление"
        if (row !== lastRow) {
          lastRowDir = rowDir;
          lastRow = row;
        }
      }
      if (e && e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  const finish = (e) => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

    if (selecting) {
      if (e && e.changedTouches && e.changedTouches[0] && cells && colCenters && rowCenters) {
        const t = e.changedTouches[0];
        const col = Math.max(0, Math.min(6, nearestIndex(colCenters, t.clientX)));
        const row = Math.max(0, Math.min(5, nearestIndex(rowCenters, t.clientY)));
        const idx = row * 7 + col;
        if (idx >= 0 && idx < cells.length) {
          // аналогично touchmove
          const rowDir = (lastRow === null || row === lastRow) ? lastRowDir
                        : (row > lastRow ? 1 : -1);
          const turned = (lastRowDir !== 0 && rowDir !== 0 && rowDir !== lastRowDir);

          curIdx = idx;

          if (turned) {
            minIdxVisited = Math.min(startIdx, curIdx);
            maxIdxVisited = Math.max(startIdx, curIdx);
          } else {
            minIdxVisited = Math.min(minIdxVisited, curIdx);
            maxIdxVisited = Math.max(maxIdxVisited, curIdx);
          }

          if (curIdx >= startIdx && minIdxVisited < startIdx) anchorIdx = minIdxVisited;
          else if (curIdx <= startIdx && maxIdxVisited > startIdx) anchorIdx = maxIdxVisited;
          else anchorIdx = startIdx;
        }
      }

      selecting = false;
      document.body.classList.remove('range-selecting');
      disableSwipe = false;
      if (e && e.cancelable) e.preventDefault();

      const dsList = getDsListBetweenIndices(anchorIdx, curIdx, cells);

      if (dsList.length >= DRAG_MIN_DATES) {
        openBulkEditModalForDs(dsList);
      } else {
        if (!moved && tapTargetDateStr) {
          editDayManually(parseYMDLocal(tapTargetDateStr));
        } else {
          clearSelectionHighlight();
        }
      }
    } else {
      const dt = Date.now() - touchStartTime;
      if (!moved && dt < 300 && tapTargetDateStr && !swipeConsumed) {
        if (editGestureMode === 'single') {
          if (e && e.cancelable) e.preventDefault();
          editDayManually(parseYMDLocal(tapTargetDateStr));
        } else {
          const now = Date.now();
          const same = (lastTapDateStr === tapTargetDateStr);
          const timeOk = (now - lastTapTime) < 280;
          const dist = Math.hypot(startX - lastTapX, startY - lastTapY);
          if (same && timeOk && dist < 12) {
            if (e && e.cancelable) e.preventDefault();
            editDayManually(parseYMDLocal(tapTargetDateStr));
            lastTapTime = 0; lastTapDateStr = null;
          } else {
            lastTapTime = now;
            lastTapDateStr = tapTargetDateStr;
            lastTapX = startX; lastTapY = startY;
          }
        }
      }
    }

    // сброс локального состояния
    tapTargetDateStr = null;
    cells = null; colCenters = null; rowCenters = null;
    startIdx = null; curIdx = null; anchorIdx = null;
    minIdxVisited = null; maxIdxVisited = null;
    lastRow = null; lastRowDir = 0;
  };

  el.addEventListener('touchend', finish, { passive: false });
  el.addEventListener('touchcancel', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (selecting) {
      selecting = false;
      document.body.classList.remove('range-selecting');
      clearSelectionHighlight();
    }
    disableSwipe = false;

    tapTargetDateStr = null;
    cells = null; colCenters = null; rowCenters = null;
    startIdx = null; curIdx = null; anchorIdx = null;
    minIdxVisited = null; maxIdxVisited = null;
    lastRow = null; lastRowDir = 0;
  });
}






// Свайпы (месяц/год) — при рисовании диапазона отключены
function setupSwipeNavigation() {
  const cal = document.getElementById('calendar');
  if (!cal || cal.dataset.swipeAttached === '1') return;
  cal.dataset.swipeAttached = '1';

  const SWIPE_X = 50, SWIPE_Y = 30;

  let swipeTracking = false;
  let swipeStartX = 0, swipeStartY = 0;
  let swipeConsumed = false;

  cal.addEventListener('touchstart', (e) => {
    if (disableSwipe) return;
    if (currentView !== 'month' && currentView !== 'year') return;
    if (e.touches.length !== 1) return;
    swipeTracking = true;
    swipeConsumed = false;
    const t = e.touches[0];
    swipeStartX = t.clientX;
    swipeStartY = t.clientY;
  }, { passive: true });

  cal.addEventListener('touchmove', (e) => {
    if (disableSwipe) return;
    if (!swipeTracking) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - swipeStartX;
    const dy = t.clientY - swipeStartY;
    if (!swipeConsumed && Math.abs(dx) > SWIPE_X && Math.abs(dy) < SWIPE_Y) {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      selecting = false;
      swipeConsumed = true;
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  cal.addEventListener('touchend', (e) => {
    if (disableSwipe) return;
    if (!swipeTracking) return;
    swipeTracking = false;
    if (swipeConsumed) {
      const touch = e.changedTouches && e.changedTouches[0];
      const endX = touch ? touch.clientX : swipeStartX;
      const dx = endX - swipeStartX;
      if (Math.abs(dx) >= SWIPE_X) {
        if (dx < 0) {
          if (currentView === 'month') currentDate.setMonth(currentDate.getMonth() + 1);
          else currentDate.setFullYear(currentDate.getFullYear() + 1);
        } else {
          if (currentView === 'month') currentDate.setMonth(currentDate.getMonth() - 1);
          else currentDate.setFullYear(currentDate.getFullYear() - 1);
        }
        renderCalendar();
      }
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  cal.addEventListener('touchcancel', () => {
    if (disableSwipe) return;
    swipeTracking = false;
    swipeConsumed = false;
  });
}

function setupMouseRangeSelection() {
  document.addEventListener('mousedown', (e) => {
    if (currentView !== 'month') return;
    if (!e.shiftKey || e.button !== 0) return;
    const dayEl = e.target.closest && e.target.closest('.day');
    if (!dayEl) return;
    const ds = dayEl.getAttribute('data-date');
    if (!ds) return;

    selecting = true;
    mouseSelecting = true;
    selectionStartDate = parseYMDLocal(ds);
    selectionEndDate = parseYMDLocal(ds);
    document.body.classList.add('range-selecting');
    updateSelectionHighlight();
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!mouseSelecting) return;
    const node = document.elementFromPoint(e.clientX, e.clientY);
    const dayEl = node && node.closest ? node.closest('.day') : null;
    if (!dayEl) return;
    const ds = dayEl.getAttribute('data-date');
    if (!ds) return;
    selectionEndDate = parseYMDLocal(ds);
    updateSelectionHighlight();
  });

  document.addEventListener('mouseup', () => {
    if (!mouseSelecting) return;
    mouseSelecting = false;
    selecting = false;
    document.body.classList.remove('range-selecting');
    openBulkEditModalForRange();
  });
}

// ========================
// Подсветка диапазона и утилиты дат
// ========================
function updateSelectionHighlight() {
  clearSelectionHighlight();
  if (!selectionStartDate || !selectionEndDate) return;

  const dateStrs = getDateStringsBetween(selectionStartDate, selectionEndDate);
  dateStrs.forEach(ds => {
    const el = document.querySelector(`.day[data-date="${ds}"]`);
    if (el) {
      el.classList.add('range-selected');
      selectionEls.add(el);
    }
  });
}
function clearSelectionHighlight() {
  selectionEls.forEach(el => el.classList.remove('range-selected'));
  selectionEls.clear();
}
function getDateStringsBetween(a, b) {
  if (!a || !b) return [];
  const start = new Date(Math.min(a, b));
  const end   = new Date(Math.max(a, b));
  start.setHours(0,0,0,0);
  end.setHours(0,0,0,0);
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(fmtYMDLocal(d));
  }
  return out;
}
// Подсветка по индексам (линейно, как на ПК)
// Подсветка по индексам (линейно)
function updateSelectionHighlightIndices(aIdx, bIdx, cells) {
  clearSelectionHighlight();
  if (!cells || !cells.length) return;
  const a = Math.min(aIdx, bIdx);
  const b = Math.max(aIdx, bIdx);
  for (let i = a; i <= b; i++) {
    const el = cells[i];
    if (el) {
      el.classList.add('range-selected');
      selectionEls.add(el);
    }
  }
}

// Список дат между двумя индексами (включительно)
function getDsListBetweenIndices(aIdx, bIdx, cells) {
  const out = [];
  if (!cells || !cells.length) return out;
  const a = Math.min(aIdx, bIdx);
  const b = Math.max(aIdx, bIdx);
  for (let i = a; i <= b; i++) {
    const el = cells[i];
    if (!el) continue;
    const ds = el.getAttribute && el.getAttribute('data-date');
    if (ds) out.push(ds);
  }
  return out;
}



// Прямоугольная подсветка по строкам/колонкам
function updateSelectionHighlightRect(startRow, startCol, curRow, curCol, cells) {
  clearSelectionHighlight();
  if (!cells || !cells.length) return;
  const r1 = Math.min(startRow, curRow), r2 = Math.max(startRow, curRow);
  const c1 = Math.min(startCol, curCol), c2 = Math.max(startCol, curCol);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const i = r * 7 + c;
      const el = cells[i];
      if (el) {
        el.classList.add('range-selected');
        selectionEls.add(el);
      }
    }
  }
}

// Список дат из прямоугольника
function getDsListForRect(startRow, startCol, curRow, curCol, cells) {
  const out = [];
  if (!cells || !cells.length) return out;
  const r1 = Math.min(startRow, curRow), r2 = Math.max(startRow, curRow);
  const c1 = Math.min(startCol, curCol), c2 = Math.max(startCol, curCol);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const i = r * 7 + c;
      const ds = cells[i] && cells[i].getAttribute ? cells[i].getAttribute('data-date') : null;
      if (ds) out.push(ds);
    }
  }
  return out;
}

// ========================
// Модалки массового редактирования
// ========================
function openBulkEditModalForRange() {
  if (!selectionStartDate || !selectionEndDate) return;
  const dsList = getDateStringsBetween(selectionStartDate, selectionEndDate);
  const count = dsList.length;
  if (count === 0) return;

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; width: 92%; max-width: 360px;">
      <h3 style="margin-bottom: 10px; text-align: center;">Массовое редактирование дат</h3>
      <div style="font-size: 13px; color: #7f8c8d; text-align: center; margin-bottom: 12px;">
        Даты: ${selectionStartDate.toLocaleDateString('ru-RU')} — ${selectionEndDate.toLocaleDateString('ru-RU')}<br>
        Всего: ${count} ${pluralDays(count)}
      </div>

      <label style="display:block; margin: 8px 0 6px;">Выберите статус</label>
      <select id="bulk-status" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px;">
        <option value="auto">Автоматически (по графику)</option>
        <option value="rest">Отдых</option>
        <option value="plane-from-home">✈️ Самолет</option>
        <option value="train">🚂 Поезд</option>
        <option value="travel-to">Заезд + день</option>
        <option value="work-day">День</option>
        <option value="work-night">Ночь</option>
        <option value="travel-from">Ночь + выезд</option>
        <option value="travel-from-day">День + выезд</option>
        <option value="sick">🟨 Больничный</option>
        <option value="business-trip">🧳 Командировка</option>
        <option value="vacation">🏖️ Отпуск</option>
      </select>

      <div id="bulk-note-wrap" style="display:none; margin-bottom: 10px;">
        <label for="bulk-note" style="display:block; margin-bottom:6px;">Заметка для всех дней (командировка):</label>
        <input id="bulk-note" type="text"
               placeholder="например: мед.осмотр, обучение ОТ, тренинг"
               style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;" />
        <div style="margin-top:6px; font-size:11px; color:#7f8c8d;">
          Одна и та же заметка будет показана вместо слова «Командировка» во всех выбранных датах.
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 10px;">
        <button id="bulk-apply" style="flex: 1; padding: 10px; background: #27ae60; color:#fff; border:none; border-radius:6px;">Применить</button>
        <button id="bulk-cancel" style="flex: 1; padding: 10px; background: #e74c3c; color:#fff; border:none; border-radius:6px;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const selectEl = modal.querySelector('#bulk-status');
  const noteWrap = modal.querySelector('#bulk-note-wrap');
  const noteInput = modal.querySelector('#bulk-note');

  // всегда по умолчанию "Автоматически"
  selectEl.value = 'auto';

  const sync = () => {
    if (noteWrap) noteWrap.style.display = (selectEl.value === 'business-trip') ? '' : 'none';
  };
  sync();
  selectEl.addEventListener('change', sync);

  const closeModal = () => document.body.removeChild(modal);

  modal.querySelector('#bulk-apply').addEventListener('click', () => {
    const val = selectEl.value;
    // не сохраняем прошлый выбор в localStorage
    const noteText = (noteInput && noteInput.value || '').trim();

    dsList.forEach(ds => {
      if (val === 'auto') {
        delete manualOverrides[ds];
        delete manualNotes[ds];
      } else {
        manualOverrides[ds] = val;
        if (val === 'business-trip') {
          if (noteText) manualNotes[ds] = noteText; else delete manualNotes[ds];
        } else {
          delete manualNotes[ds];
        }
      }
    });

    saveData();
    clearSelectionHighlight();
    renderCalendar();
    closeModal();
    queueTgSync('bulk');
  });

  modal.querySelector('#bulk-cancel').addEventListener('click', () => {
    clearSelectionHighlight();
    closeModal();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      clearSelectionHighlight();
      closeModal();
    }
  });
}

// Диалог массового редактирования для списка дат (прямоугольник)
function openBulkEditModalForDs(dsList) {
  if (!dsList || !dsList.length) return;

  const firstDate = parseYMDLocal(dsList[0]);
  const lastDate  = parseYMDLocal(dsList[dsList.length - 1]);
  const count = dsList.length;

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; width: 92%; max-width: 360px;">
      <h3 style="margin-bottom: 10px; text-align: center;">Массовое редактирование дат</h3>
      <div style="font-size: 13px; color: #7f8c8d; text-align: center; margin-bottom: 12px;">
        Даты: ${firstDate.toLocaleDateString('ru-RU')} — ${lastDate.toLocaleDateString('ru-RU')}<br>
        Всего: ${count} ${pluralDays(count)}
      </div>

      <label style="display:block; margin: 8px 0 6px;">Выберите статус</label>
      <select id="bulk-status" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px;">
        <option value="auto">Автоматически (по графику)</option>
        <option value="rest">Отдых</option>
        <option value="plane-from-home">✈️ Самолет</option>
        <option value="train">🚂 Поезд</option>
        <option value="travel-to">Заезд + день</option>
        <option value="work-day">День</option>
        <option value="work-night">Ночь</option>
        <option value="travel-from">Ночь + выезд</option>
        <option value="travel-from-day">День + выезд</option>
        <option value="sick">🟨 Больничный</option>
        <option value="business-trip">🧳 Командировка</option>
        <option value="vacation">🏖️ Отпуск</option>
      </select>

      <div id="bulk-note-wrap" style="display:none; margin-bottom: 10px;">
        <label for="bulk-note" style="display:block; margin-bottom:6px;">Заметка для всех дней (командировка):</label>
        <input id="bulk-note" type="text"
               placeholder="например: мед.осмотр, обучение ОТ, тренинг"
               style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;" />
        <div style="margin-top:6px; font-size:11px; color:#7f8c8d;">
          Одна и та же заметка будет показана вместо слова «Командировка» во всех выбранных датах.
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 10px;">
        <button id="bulk-apply" style="flex: 1; padding: 10px; background: #27ae60; color:#fff; border:none; border-radius:6px;">Применить</button>
        <button id="bulk-cancel" style="flex: 1; padding: 10px; background: #e74c3c; color:#fff; border:none; border-radius:6px;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const selectEl = modal.querySelector('#bulk-status');
  const noteWrap = modal.querySelector('#bulk-note-wrap');
  const noteInput = modal.querySelector('#bulk-note');

  selectEl.value = 'auto';
  const sync = () => { noteWrap.style.display = (selectEl.value === 'business-trip') ? '' : 'none'; };
  sync();
  selectEl.addEventListener('change', sync);

  const closeModal = () => document.body.removeChild(modal);

  modal.querySelector('#bulk-apply').addEventListener('click', () => {
    const val = selectEl.value;
    
    const noteText = (noteInput && noteInput.value || '').trim();

    dsList.forEach(ds => {
      if (val === 'auto') {
        delete manualOverrides[ds];
        delete manualNotes[ds];
      } else {
        manualOverrides[ds] = val;
        if (val === 'business-trip') {
          if (noteText) manualNotes[ds] = noteText; else delete manualNotes[ds];
        } else {
          delete manualNotes[ds];
        }
      }
    });

    saveData();
    clearSelectionHighlight();
    renderCalendar();
    closeModal();
    queueTgSync('bulk');
  });

  modal.querySelector('#bulk-cancel').addEventListener('click', () => { clearSelectionHighlight(); closeModal(); });
  modal.addEventListener('click', (e) => { if (e.target === modal) { clearSelectionHighlight(); closeModal(); } });
}
// Показ статистики за текущий год (по ручным правкам)
function showStatistics() {
  const currentYear = currentDate.getFullYear();
  // Собираем только по текущему году
  let stats = {
    sick:          { total: 0, work: 0, rest: 0 },
    businessTrip:  { total: 0, work: 0, rest: 0 },
    vacation:      { total: 0, work: 0, rest: 0 }
  };

  Object.keys(manualOverrides).forEach(dateStr => {
    const d = parseYMDLocal(dateStr);
    if (d.getFullYear() !== currentYear) return;
    const manual = manualOverrides[dateStr];           // что поставили вручную
    const auto   = calculateAutoStatus(d);             // что было бы по графику
    const onWork = isWorkDay(auto);

    if (manual === 'sick') {
      stats.sick.total++;
      onWork ? stats.sick.work++ : stats.sick.rest++;
    } else if (manual === 'business-trip') {
      stats.businessTrip.total++;
      onWork ? stats.businessTrip.work++ : stats.businessTrip.rest++;
    } else if (manual === 'vacation') {
      stats.vacation.total++;
      onWork ? stats.vacation.work++ : stats.vacation.rest++;
    }
  });

  // Модалка
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background:#fff; padding:20px; border-radius:10px; width:92%; max-width:400px;">
      <h3 style="margin-bottom: 15px; text-align:center;">Статистика за ${currentYear} год</h3>

      <div style="margin-bottom: 15px;">
        <h4 style="margin-bottom: 10px; color: #f1c40f;">🟨 Больничные</h4>
        <div style="padding:10px; background:#fffbf0; border-radius:5px;">
          Всего: ${stats.sick.total} ${pluralDays(stats.sick.total)}<br>
          В рабочие дни: ${stats.sick.work} ${pluralDays(stats.sick.work)}<br>
          В дни отдыха: ${stats.sick.rest} ${pluralDays(stats.sick.rest)}
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <h4 style="margin-bottom: 10px; color: #1abc9c;">🧳 Командировки</h4>
        <div style="padding:10px; background:#f0f9f7; border-radius:5px;">
          Всего: ${stats.businessTrip.total} ${pluralDays(stats.businessTrip.total)}<br>
          В рабочие дни: ${stats.businessTrip.work} ${pluralDays(stats.businessTrip.work)}<br>
          В дни отдыха: ${stats.businessTrip.rest} ${pluralDays(stats.businessTrip.rest)}
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <h4 style="margin-bottom: 10px; color: #95a5a6;">🏖️ Отпуск</h4>
        <div style="padding:10px; background:#f8f9fa; border-radius:5px;">
          Всего: ${stats.vacation.total} ${pluralDays(stats.vacation.total)}<br>
          В рабочие дни: ${stats.vacation.work} ${pluralDays(stats.vacation.work)}<br>
          В дни отдыха: ${stats.vacation.rest} ${pluralDays(stats.vacation.rest)}
        </div>
      </div>

      <button id="close-stats" style="width:100%; padding:10px; background:#3498db; color:#fff; border:none; border-radius:5px;">Закрыть</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#close-stats').addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

// ========================
// Статистика
// ========================
function calculateAutoStatus(date) {
  if (!vakhtaStartDate) return 'rest';
  const dateStart = new Date(date); dateStart.setHours(0,0,0,0);
  const vakhtaStart = new Date(vakhtaStartDate); vakhtaStart.setHours(0,0,0,0);
  const diffDays = Math.floor((dateStart - vakhtaStart) / (1000 * 60 * 60 * 24));
  const cycleDay = ((diffDays % 56) + 56) % 56;

  switch (currentSchedule) {
    case 'standard':
      if (cycleDay === 54) return 'plane-from-home';
      if (cycleDay === 55) return 'train';
      if (cycleDay === 0)  return 'travel-to';
      if (cycleDay === 28) return 'travel-from';
      if (cycleDay === 29) return 'plane-to-home';
      if (cycleDay >= 1 && cycleDay <= 14) return 'work-day';
      if (cycleDay >= 15 && cycleDay <= 27) return 'work-night';
      return 'rest';
    case 'sakhalin':
      if (cycleDay === 55) return 'train';
      if (cycleDay === 0)  return 'travel-to';
      if (cycleDay === 28) return 'travel-from';
      if (cycleDay >= 1 && cycleDay <= 14) return 'work-day';
      if (cycleDay >= 15 && cycleDay <= 27) return 'work-night';
      return 'rest';
    case 'standard-day':
      if (cycleDay === 54) return 'plane-from-home';
      if (cycleDay === 55) return 'train';
      if (cycleDay === 0)  return 'travel-to';
      if (cycleDay === 28) return 'travel-from-day';
      if (cycleDay === 29) return 'plane-to-home';
      if (cycleDay >= 1 && cycleDay <= 27) return 'work-day';
      return 'rest';
    case 'sakhalin-day':
      if (cycleDay === 55) return 'train';
      if (cycleDay === 0)  return 'travel-to';
      if (cycleDay === 28) return 'travel-from-day';
      if (cycleDay >= 1 && cycleDay <= 27) return 'work-day';
      return 'rest';
    default:
      return 'rest';
  }
}
function isWorkDay(st) { return ['travel-to','work-day','work-night','travel-from','travel-from-day'].includes(st); }

function pluralDays(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'дня';
  return 'дней';
}

// ========================
// Справка (аккордеон)
// ========================
function showHelp() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.5);
    display:flex; align-items:center; justify-content:center; z-index:1000;
  `;

  const curMode = (typeof getCurrentScheduleName === 'function') ? getCurrentScheduleName() : '';

  modal.innerHTML = `
    <div class="help-modal" style="
      background:#fff; width:92%; max-width:560px; border-radius:12px;
      display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,.2);
    ">
      <div class="help-header" style="padding:16px 16px 8px;">
        <h3 style="margin:0; font-size:18px; display:flex; align-items:center; gap:8px;">
          <span>📋</span>
          <span>Справка по календарю вахтовика</span>
        </h3>
      </div>

      <div id="help-scroll" style="padding:0 16px 8px; overflow:auto; max-height:70vh;">
        
        <h4 class="help-ttl">
          <span class="help-ico">🧭</span>
          <span class="help-txt">Основная логика графика</span>
          <span class="help-chev">▸</span>
        </h4>
        <div class="help-body">
          <p><b>График 28/28:</b> 28 дней вахта → 28 дней отдых</p>
          <p><b>Логистика = отдых:</b> Самолет и поезд считаются днями отдыха</p>
          <p><b>Рабочие дни:</b> Заезд, дневные/ночные смены, выезд</p>
        </div>

        
        <h4 class="help-ttl">
          <span class="help-ico">🎛️</span>
          <span class="help-txt">Режимы работы</span>
          <span class="help-chev">▸</span>
        </h4>
        <div class="help-body">
          ${curMode ? `<div style="margin:6px 0 10px;">
            <span style="display:inline-block; background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:6px; padding:4px 8px; font-size:12px;">
              Текущий режим: <b>${curMode}</b>
            </span>
          </div>` : ''}
          <p><b>Стандартный</b> (дневные/ночные смены) — с самолетами; 14 дневных + 14 ночных; выезд: ночь + выезд</p>
          <p><b>Сахалинский</b> (дневные/ночные смены) — без самолетов; 14 дневных + 14 ночных; выезд: ночь + выезд</p>
          <p><b>Стандартный дневной</b> — с самолетами; 28 дневных; выезд: день + выезд</p>
          <p><b>Сахалинский дневной</b> — без самолетов; 28 дневных; выезд: день + выезд</p>
        </div>

        
        <h4 class="help-ttl">
          <span class="help-ico">✏️</span>
          <span class="help-txt">Редактирование дней</span>
          <span class="help-chev">▸</span>
        </h4>
        <div class="help-body">
          <p><b>Одиночное редактирование</b></p>
          <ul class="help-ul">
            <li>ПК: двойной клик по дню — открыть редактор статуса.</li>
            <li>Смартфон: по умолчанию — двойной тап. Можно переключить на один тап: «Режимы вахты» → «Настройки» → «Ручное редактирование даты».</li>
          </ul>
          <p style="margin-top:8px;">В редакторе можно назначить: 🟨 Больничный, 🧳 Командировка, 🏖️ Отпуск и т.п. Ручные изменения подсвечиваются оранжевой рамкой и сохраняются автоматически.</p>

          <p style="margin:12px 0 6px;"><b>Массовое редактирование дат</b></p>
          <ul class="help-ul">
            <li>ПК: Shift + протяжка мышью — выделится диапазон, далее выберите статус.</li>
            <li>Смартфон: долго удерживайте (~0.45 с), затем проведите пальцем по датам и отпустите — появится окно массового редактирования.</li>
            <li>Свайпы листают месяц/год и имеют приоритет.</li>
          </ul>
        </div>

        
        <h4 class="help-ttl">
          <span class="help-ico">🗂️</span>
          <span class="help-txt">Виды отображения</span>
          <span class="help-chev">▸</span>
        </h4>
        <div class="help-body">
          <p><b>Годовой вид:</b> 12 мини‑месяцев на одном экране. Тап по месяцу — переход к месяцу.</p>
          <p><b>Месячный вид:</b> подробные статусы каждого дня, двойной клик — редактор.</p>
          <p><b>Переключение:</b> кнопка «📊 Годовой вид» / «📅 Месячный вид».</p>
        </div>

        
        <h4 class="help-ttl">
          <span class="help-ico">📊</span>
          <span class="help-txt">Статистика</span>
          <span class="help-chev">▸</span>
        </h4>
        <div class="help-body">
          <p>Показывает число отпусков/командировок/больничных за год и делит их на <em>в рабочие</em> / <em>в дни отдыха</em>.</p>
        </div>

        
        <h4 class="help-ttl">
          <span class="help-ico">🔄</span>
          <span class="help-txt">Сброс изменений</span>
          <span class="help-chev">▸</span>
        </h4>
        <div class="help-body">
          <p>Удаляет ВСЕ ручные изменения. Основной график вахты сохраняется.</p>
        </div>

        
        <h4 class="help-ttl">
          <span class="help-ico">🔗</span>
          <span class="help-txt">Поделиться / Экспорт · Импорт</span>
          <span class="help-chev">▸</span>
        </h4>
        <div class="help-body">
          <p>Кнопка «<b>Поделиться</b>» позволяет:</p>
          <ul class="help-ul">
            <li><b>Экспортировать базовый график</b> (дата начала + режим) — короткий код для пересылки;</li>
            <li><b>Экспортировать полный снимок</b> (включая ручные правки) — длинный код;</li>
            <li><b>Импортировать код</b> (заменить всё или применить только базовый график);</li>
            <li><b>Напечатать текущий месяц или весь год</b> (можно «Сохранить как PDF»).</li>
          </ul>
          <p>При печати сохраняется выбранный период: «Печать: текущий месяц» печатает месяц из шапки календаря, «Печать: год» — текущий год. Чтобы распечатать другой период, сначала переключите месяц/год в шапке, затем снова выполните печать.</p>
        </div>

        
        <h4 class="help-ttl">
          <span class="help-ico">💾</span>
          <span class="help-txt">Сохранение данных</span>
          <span class="help-chev">▸</span>
        </h4>
        <div class="help-body">
          <p>Все настройки сохраняются в браузере. При повторном открытии всё восстановится.</p>
        </div>
      </div>

      <div class="help-footer" style="
        position:sticky; bottom:0; background:#fff; padding:10px 16px 16px; border-top:1px solid #eee;
      ">
        <button id="close-help" style="
          width:100%; padding:10px; background:#3498db; color:#fff; border:none; border-radius:8px;
          font-weight:600; cursor:pointer;
        ">Закрыть</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Локальные стили
  const style = document.createElement('style');
  style.textContent = `
    .help-ttl {
      margin:10px 0; padding:8px 6px; border-radius:8px; background:#f7f9fc;
      display:flex; align-items:center; gap:8px; cursor:pointer;
      border:1px solid #e6eef8;
    }
    .help-ico { width:22px; text-align:center; }
    .help-txt { color:#2d7ef7; font-weight:600; flex:1; user-select:none; }
    .help-chev { color:#2d7ef7; transition:transform .2s ease; }
    .help-body { padding:8px 6px 10px 30px; }
    .help-body p { margin:6px 0; }
    .help-ul { margin:6px 0 0 18px; padding:0; }
    .help-ul li { margin:4px 0; }
    .help-ttl.open { background:#eef5ff; border-color:#cfe3ff; }
    .help-ttl.open .help-chev { transform:rotate(90deg); }
  `;
  modal.querySelector('.help-modal').appendChild(style);

  // Аккордеон
  const headers = Array.from(modal.querySelectorAll('.help-ttl'));
  const bodies  = Array.from(modal.querySelectorAll('.help-body'));
  const setCollapsed = (idx, collapsed) => {
    const h = headers[idx], b = bodies[idx];
    if (!h || !b) return;
    b.style.display = collapsed ? 'none' : '';
    if (collapsed) h.classList.remove('open'); else h.classList.add('open');
  };
  headers.forEach((h, idx) => setCollapsed(idx, idx !== 0));
  headers.forEach((h, idx) => {
    h.addEventListener('click', () => {
      const b = bodies[idx];
      const collapsedNow = b.style.display === 'none';
      setCollapsed(idx, !collapsedNow);
    });
  });

  // Закрыть
  modal.querySelector('#close-help').addEventListener('click', () => {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }});
}

// ========================
// Выбор месяца/года
// ========================
function showMonthYearPicker() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 320px;">
      <h3 style="margin-bottom: 12px; text-align: center;">Выберите месяц и год</h3>
      <div style="display: flex; gap: 10px; margin-bottom: 12px;">
        <select id="year-select" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
          ${generateYearOptions(currentYear)}
        </select>
        <select id="month-select" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
          ${generateMonthOptions(currentMonth)}
        </select>
      </div>
      <div style="display: flex; gap: 10px;">
        <button id="confirm-picker" style="flex: 1; padding: 10px; background: #27ae60; color: white; border: none; border-radius: 6px;">OK</button>
        <button id="cancel-picker" style="flex: 1; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 6px;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#confirm-picker').addEventListener('click', () => {
    const yearSelect = modal.querySelector('#year-select');
    const monthSelect = modal.querySelector('#month-select');
    currentDate.setFullYear(parseInt(yearSelect.value), parseInt(monthSelect.value), 1);
    renderCalendar();
    document.body.removeChild(modal);
  });
  modal.querySelector('#cancel-picker').addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

function generateYearOptions(currentYear) {
  let options = '';
  for (let year = currentYear - 5; year <= currentYear + 5; year++) {
    const selected = year === currentYear ? 'selected' : '';
    options += `<option value="${year}" ${selected}>${year}</option>`;
  }
  return options;
}
function generateMonthOptions(currentMonth) {
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return months.map((m, i) => `<option value="${i}" ${i===currentMonth?'selected':''}>${m}</option>`).join('');
}

// ========================
// Режимы (селектор)
// ========================
function updateScheduleButtonTextSafe() { try { updateScheduleButtonText(); } catch {} }

function renderScheduleOption(value, title, subtitle) {
  const active = currentSchedule === value;
  return `
    <button class="schedule-option ${active ? 'active-option' : ''}" data-value="${value}"
      style="padding: 12px; border: 2px solid ${active ? '#27ae60' : '#3498db'}; border-radius: 8px; background: ${active ? '#f8fff9' : 'white'}; text-align: left; cursor: pointer; width:100%;">
      <div style="font-weight:bold; color:#2c3e50; margin-bottom:4px;">${title}</div>
      <div style="font-size: 12px; color: #7f8c8d;">${subtitle}</div>
    </button>
  `;
}
function getCurrentScheduleName() {
  const names = {
    'standard': 'Стандартный',
    'sakhalin': 'Сахалинский',
    'standard-day': 'Стандартный дневной',
    'sakhalin-day': 'Сахалинский дневной'
  };
  return names[currentSchedule] || 'Не выбран';
}
function showScheduleSelector() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 12px; width: 90%; max-width: 420px;">
      <h3 style="margin-bottom: 12px; text-align: center;">📋 Выберите режим вахты</h3>
      <div style="font-size: 14px; color: #7f8c8d; margin-bottom: 10px; text-align: center;">
        Текущий режим: <strong>${getCurrentScheduleName()}</strong>
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;">
        ${renderScheduleOption('standard', '📋 Стандартный', 'С самолетами, дневные/ночные смены')}
        ${renderScheduleOption('sakhalin', '🏝️ Сахалинский', 'Без самолетов, дневные/ночные смены')}
        ${renderScheduleOption('standard-day', '☀️ Стандартный дневной', 'С самолетами, только дневные смены')}
        ${renderScheduleOption('sakhalin-day', '☀️ Сахалинский дневной', 'Без самолетов, только дневные смены')}
      </div>

      <div style="border-top:1px solid #eee; padding-top:10px;">
        <div style="font-weight:600; margin-bottom:6px;">Настройки</div>
        <div style="font-size:12px; color:#7f8c8d; margin-bottom:6px;">Ручное редактирование даты (на телефоне):</div>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; margin-right:12px;">
          <input type="radio" name="edit-gesture" value="single"> Один тап
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
          <input type="radio" name="edit-gesture" value="double"> Двойной тап
        </label>
      </div>

      <button id="close-schedule" style="margin-top: 12px; width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 8px; font-weight: 600;">Закрыть</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('.schedule-option').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSchedule = btn.getAttribute('data-value');
      saveData();
      renderCalendar();
      updateScheduleButtonTextSafe();
      document.body.removeChild(modal);
      queueTgSync('schedule');
    });
  });

  const savedGesture = localStorage.getItem('editGestureMode') || 'double';
  const savedRadio = modal.querySelector(`input[name="edit-gesture"][value="${savedGesture}"]`);
  if (savedRadio) savedRadio.checked = true;
  modal.querySelectorAll('input[name="edit-gesture"]').forEach(r => {
    r.addEventListener('change', (e) => {
      editGestureMode = e.target.value;
      localStorage.setItem('editGestureMode', editGestureMode);
    });
  });

  modal.querySelector('#close-schedule').addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

// ========================
// Сброс ручных изменений
// ========================
function resetManualChanges() {
  if (Object.keys(manualOverrides).length === 0 && Object.keys(manualNotes).length === 0) {
    alert('Нет ручных изменений для сброса');
    return;
  }
  if (confirm('Вы уверены, что хотите сбросить ВСЕ ручные изменения?')) {
    manualOverrides = {};
    manualNotes = {};
    saveData();
    renderCalendar();
    alert('Все ручные изменения сброшены');
    queueTgSync('reset');
  }
}

// ========================
// Печать (заголовок)
// ========================
function showPrintTitle(title, subtitle) {
  let el = document.getElementById('print-title');
  if (!el) {
    el = document.createElement('div');
    el.id = 'print-title';
    el.className = 'print-title';

    const sub = document.createElement('div');
    sub.id = 'print-subtitle';
    sub.className = 'print-subtitle';

    const container = document.querySelector('.container');
    const calendar = document.getElementById('calendar');
    if (container && calendar) {
      container.insertBefore(el, calendar);
      container.insertBefore(sub, calendar);
    }
  }
  el.textContent = title || '';
  const subEl = document.getElementById('print-subtitle');
  if (subEl) subEl.textContent = subtitle || '';
}

function hidePrintTitle() {
  const t = document.getElementById('print-title');
  const s = document.getElementById('print-subtitle');
  if (t && t.parentNode) t.parentNode.removeChild(t);
  if (s && s.parentNode) s.parentNode.removeChild(s);
}

// Печать: месяц
function ensureMonthThenPrint() {
  const prev = currentView;
  if (currentView !== 'month') {
    currentView = 'month';
    saveData();
    renderCalendar();
    updateViewButton();
  }
  setTimeout(() => {
    const title = 'Месяц: ' + currentDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const mode = getCurrentScheduleName();
    showPrintTitle(title, mode ? ('Режим: ' + mode) : '');

    const restore = () => {
      hidePrintTitle();
      if (prev !== currentView) {
        currentView = prev;
        saveData();
        renderCalendar();
        updateViewButton();
      }
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  }, 50);
}

// Печать: год
function ensureYearThenPrint() {
  const prev = currentView;
  if (currentView !== 'year') {
    currentView = 'year';
    saveData();
    renderCalendar();
    updateViewButton();
  }
  setTimeout(() => {
    const title = 'Год: ' + currentDate.getFullYear();
    const mode = getCurrentScheduleName();
    showPrintTitle(title, mode ? ('Режим: ' + mode) : '');
  
    const restore = () => {
      hidePrintTitle();
      if (prev !== currentView) {
        currentView = prev;
        saveData();
        renderCalendar();
        updateViewButton();
      }
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  }, 50);
}

// ========================
// Печать/Экспорт/Импорт
// ========================
function tryPrint(kind /* 'month'|'year' */) {
  const inTG = isTelegramWebApp();
  let printed = false;
  const onAfter = () => { printed = true; window.removeEventListener('afterprint', onAfter); };
  window.addEventListener('afterprint', onAfter);
  if (kind === 'month') ensureMonthThenPrint(); else ensureYearThenPrint();
  if (inTG) setTimeout(() => { if (!printed) openExternalPrint(kind); }, 800);
}

function openExternalPrint(kind) {
  const code = buildExportCode(false);
  const d = currentDate ? fmtYMDLocal(currentDate) : '';
  const url = new URL(location.href.split('#')[0]);
  url.searchParams.set('code', code);
  url.searchParams.set('print', kind);
  if (d) url.searchParams.set('d', d);
  const href = url.toString();
  try {
    if (isTelegramWebApp() && window.Telegram && Telegram.WebApp) Telegram.WebApp.openLink(href);
    else window.open(href, '_blank');
  } catch {
    window.location.href = href;
  }
}

function processPrintParams() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const print = params.get('print');
  const d = params.get('d');

  if (code) {
    const obj = decodeImportCode(code);
    if (obj && typeof obj === 'object') {
      if (obj.vakhtaStartDate) {
        const dt = parseYMDLocal(obj.vakhtaStartDate);
        if (!isNaN(dt)) vakhtaStartDate = dt;
      }
      if (obj.currentSchedule) currentSchedule = obj.currentSchedule;
    }
  }
  if (d) {
    const dd = parseYMDLocal(d);
    if (!isNaN(dd)) currentDate = dd;
  }

  if (print === 'month' || print === 'year') {
    saveData();
    renderCalendar();
    updateViewButton();
    setTimeout(() => { print === 'month' ? ensureMonthThenPrint() : ensureYearThenPrint(); }, 100);
  }
}

function buildExportPayload(full = false) {
  const payload = {
    v: 1,
    generatedAt: new Date().toISOString(),
    currentSchedule: typeof currentSchedule === 'string' ? currentSchedule : 'standard',
    vakhtaStartDate: vakhtaStartDate ? fmtYMDLocal(vakhtaStartDate) : null
  };
  if (full) {
    payload.manualOverrides = manualOverrides || {};
    payload.manualNotes     = manualNotes     || {};
  }
  return payload;
}

function buildExportCode(full = false) {
  const payload = buildExportPayload(full);
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
  return b64;
}

function decodeImportCode(code) {
  try {
    const b64 = code.trim().replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = decodeURIComponent(escape(atob(b64 + pad)));
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' ? obj : null;
  } catch { return null; }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    resolve();
  });
}

// Модалка «Поделиться» — стабильная версия без transform (центрирование по left/top)
function openShareModal() {
  // 1) Оверлей
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,.5);
    z-index: 1000;
  `;

  // 2) Контент модалки
  const content = document.createElement('div');
  content.id = 'share-content';
  content.style.cssText = `
    position: fixed;
    width: min(560px, calc(100vw - 16px));
    max-height: 85vh;
    overflow: auto;
    background: #fff;
    padding: 16px;
    border-radius: 10px;
    z-index: 1001;
    filter: none; backdrop-filter: none; -webkit-backdrop-filter: none;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  `;

  const basicCode = buildExportCode(false);
  const fullCode  = buildExportCode(true);

  content.innerHTML = `
    <h3 style="text-align:center; margin-bottom:12px; margin-top:0;">Поделиться / Экспорт · Импорт</h3>

    <div style="display:flex; flex-direction:column; gap:14px;">

      <div style="border:1px solid #eee; border-radius:8px; padding:12px;">
        <div style="font-weight:600; margin-bottom:8px;">Экспорт (базовый график)</div>
        <div style="font-size:12px; color:#7f8c8d; margin-bottom:8px;">
          Дата начала вахты + выбранный режим. Подходит, чтобы у получателя построился такой же график без ваших ручных правок.
        </div>
        <textarea id="export-basic" readonly style="width:100%; height:70px; font-size:12px; padding:8px; border:1px solid #ddd; border-radius:6px;">${basicCode}</textarea>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button id="copy-basic" style="padding:8px 10px; background:#27ae60; color:#fff; border:none; border-radius:6px;">Скопировать</button>
          <span id="basic-copied" style="font-size:12px; color:#27ae60; display:none;">Скопировано</span>
        </div>
      </div>

      <div style="border:1px solid #eee; border-radius:8px; padding:12px;">
        <div style="font-weight:600; margin-bottom:8px;">Экспорт (полный снимок)</div>
        <div style="font-size:12px; color:#7f8c8d; margin-bottom:8px;">
          Базовый график + ваши ручные правки. Передавайте только доверенным людям. 
        </div>
        <textarea id="export-full" readonly style="width:100%; height:90px; font-size:12px; padding:8px; border:1px solid #ddd; border-radius:6px;">${fullCode}</textarea>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button id="copy-full" style="padding:8px 10px; background:#27ae60; color:#fff; border:none; border-radius:6px;">Скопировать</button>
          <span id="full-copied" style="font-size:12px; color:#27ae60; display:none;">Скопировано</span>
        </div>
      </div>

      <div style="border:1px solid #eee; border-radius:8px; padding:12px;">
        <div style="font-weight:600; margin-bottom:8px;">Импорт</div>
        <textarea id="import-code" placeholder="Вставьте код здесь" style="width:100%; height:80px; font-size:12px; padding:8px; border:1px solid #ddd; border-radius:6px;"></textarea>
        <div style="display:flex; gap:10px; align-items:center; margin-top:8px; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px;">
            <input type="radio" name="import-mode" value="all" checked> Заменить всё (режим, дата, ручные правки)
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:12px;">
            <input type="radio" name="import-mode" value="basic"> Только базовый график (режим + дата)
          </label>
          <button id="apply-import" style="margin-left:auto; padding:8px 10px; background:#3498db; color:#fff; border:none; border-radius:6px;">Импортировать</button>
        </div>
      </div>

      <div style="border:1px solid #eee; border-radius:8px; padding:12px;">
        <div style="font-weight:600; margin-bottom:8px;">Печать</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="print-month" style="padding:8px 10px; background:#2ecc71; color:#fff; border:none; border-radius:6px;">Печать: текущий месяц</button>
          <button id="print-year"  style="padding:8px 10px; background:#2ecc71; color:#fff; border:none; border-radius:6px;">Печать: год</button>
        </div>
        <div style="font-size:12px; color:#7f8c8d; margin-top:6px;">
          Печатается выбранный период: «Печать: текущий месяц» — месяц из шапки календаря, «Печать: год» — текущий год.
        </div>
      </div>

    </div>

    <div style="display:flex; gap:10px; margin-top:14px;">
      <button id="close-share" style="padding:10px; width:100%; background:#e74c3c; color:#fff; border:none; border-radius:6px;">Закрыть</button>
    </div>
  `;

  // Добавляем в DOM
  document.body.appendChild(overlay);
  document.body.appendChild(content);

  // Центрируем по пикселям без transform
  const place = () => {
    const w = Math.round(content.offsetWidth);
    const h = Math.round(content.offsetHeight);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.round((vw - w) / 2));
    const top  = Math.max(8, Math.round((vh - h) / 2));
    content.style.left = left + 'px';
    content.style.top  = top + 'px';
  };
  requestAnimationFrame(place);
  window.addEventListener('resize', place);

  const safeClose = () => {
    try {
      window.removeEventListener('resize', place);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (content && content.parentNode) content.parentNode.removeChild(content);
    } catch {}
  };
  overlay.addEventListener('click', safeClose);
  content.querySelector('#close-share').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); safeClose(); });

  // Копирование
  const basicCopied = content.querySelector('#basic-copied');
  content.querySelector('#copy-basic').addEventListener('click', () => {
    const ta = content.querySelector('#export-basic');
    copyText(ta.value).then(() => {
      if (basicCopied) { basicCopied.style.display = 'inline'; setTimeout(() => basicCopied.style.display = 'none', 1500); }
    });
  });
  const fullCopied = content.querySelector('#full-copied');
  content.querySelector('#copy-full').addEventListener('click', () => {
    const ta = content.querySelector('#export-full');
    copyText(ta.value).then(() => {
      if (fullCopied) { fullCopied.style.display = 'inline'; setTimeout(() => fullCopied.style.display = 'none', 1500); }
    });
  });

  // Импорт
  content.querySelector('#apply-import').addEventListener('click', () => {
    const code = content.querySelector('#import-code').value.trim();
    if (!code) { alert('Вставьте код для импорта'); return; }
    const obj = decodeImportCode(code);
    if (!obj || typeof obj !== 'object' || (obj.v !== 1 && obj.v !== undefined)) {
      alert('Неподдерживаемый формат кода'); return;
    }
    const mode = content.querySelector('input[name="import-mode"]:checked').value;
    const applyBasic = () => {
      if (obj.vakhtaStartDate) {
        const d = parseYMDLocal(obj.vakhtaStartDate);
        if (!isNaN(d)) vakhtaStartDate = d;
      }
      if (obj.currentSchedule) currentSchedule = obj.currentSchedule;
    };
    if (mode === 'basic') {
      applyBasic();
    } else {
      applyBasic();
      manualOverrides = (obj.manualOverrides && typeof obj.manualOverrides === 'object') ? obj.manualOverrides : {};
      manualNotes     = (obj.manualNotes     && typeof obj.manualNotes     === 'object') ? obj.manualNotes     : {};
    }
    saveData();
    renderCalendar();
    alert('Импорт завершён');
    safeClose();
    queueTgSync('import');
  });

  // Печать
  content.querySelector('#print-month').addEventListener('click', () => { safeClose(); tryPrint('month'); });
  content.querySelector('#print-year').addEventListener('click', () => { safeClose(); tryPrint('year'); });
}

// ========================
// Автосинхронизация (TG)
// ========================
let tgSyncTimer = null;
function isTGWebApp() {
  // используем тот же детектор
  return isTelegramWebApp();
}
function queueTgSync(reason) {
  if (!isTGWebApp()) return;
  if (tgSyncTimer) clearTimeout(tgSyncTimer);
  tgSyncTimer = setTimeout(() => sendTgSnapshot(reason), 1200);
}
function sendTgSnapshot(reason) {
  try {
    const payload = buildExportPayload(true);
    const envelope = { kind: 'snapshot', data: payload, reason: reason || '' };
    console.log('[TG] sendData:', envelope);
    if (window.Telegram && Telegram.WebApp) {
      Telegram.WebApp.sendData(JSON.stringify(envelope));
    } else {
      // клиент без объекта WebApp — пропускаем (fallback через deep-link вручную)
      console.warn('[TG] WebApp object not available; use deep-link button.');
    }
  } catch (e) { console.warn('[TG] sendData error', e); }
}

// Панель действий (гарантия наличия)
function ensureActionsBar() {
  let actions = document.querySelector('.actions');
  if (!actions) {
    const container = document.querySelector('.container') || document.body;
    const controls = document.querySelector('.controls');
    actions = document.createElement('div');
    actions.className = 'actions';
    actions.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; margin:8px 0;';
    if (controls && controls.parentNode) {
      controls.parentNode.insertBefore(actions, controls.nextSibling);
    } else {
      container.prepend(actions);
    }
  }
  return actions;
}
// показать короткое уведомление (тост)
function showToast(msg, ms = 1800) {
  try {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
      background: rgba(0,0,0,.82); color: #fff; padding: 8px 12px; border-radius: 8px;
      font: 13px/1.25 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      z-index: 2000; max-width: 90%; text-align: center;
    `;
    document.body.appendChild(t);
    setTimeout(() => { try { t.remove(); } catch {} }, ms);
  } catch {}
}

// флажки из URL (?name=1|true|yes)
function queryFlag(name, def = false) {
  try {
    const v = new URLSearchParams(location.search).get(name);
    if (v == null) return def;
    return /^(1|true|yes)$/i.test(v);
  } catch { return def; }
}

// Тест-кнопки (рисуются всегда)
// Одна умная кнопка синхронизации
// Одна умная кнопка синхронизации (двойная отправка: sendData + опциональный deep-link)
function addTgTestButton() {
  const actions = ensureActionsBar();
  if (!actions) return;

  // убираем старые тест‑кнопки, если были
  actions.querySelectorAll('.tg-test-btn').forEach(b => b.remove());

  // логика видимости
  const inTG = isTelegramWebApp();                   // открыт в Telegram (по объекту или hash)
  const forceShow = queryFlag('sync', false);        // ?sync=1 — принудительно показать
  const forceHide = (new URLSearchParams(location.search).get('sync') === '0'); // ?sync=0 — скрыть

  if ((!inTG && !forceShow) || forceHide) return;

  const btn = document.createElement('button');
  btn.className = 'tg-test-btn';
  btn.textContent = '🔄 Синхронизировать с ботом';
  btn.title = 'Отправит актуальный календарь боту';
  btn.style.cssText = 'padding:6px 10px; background:#17a2b8; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:12px;';

  // вставляем рядом с "Поделиться" (если есть), иначе в конец actions
  const shareBtn = document.getElementById('share');
  if (shareBtn && shareBtn.parentNode === actions) {
    shareBtn.insertAdjacentElement('afterend', btn);
  } else {
    actions.appendChild(btn);
  }

  // ОБЯЗАТЕЛЬНО: имя твоего бота (без @) для резерва
  const BOT_USERNAME = 'VakhtaCalendarBot';

  let pending = false;
  const setPending = (v, label) => {
    pending = v;
    btn.disabled = v;
    btn.style.opacity = v ? '0.75' : '1';
    if (label) btn.textContent = label;
  };

  btn.addEventListener('click', () => {
    if (pending) return;
    const hasWA = !!(window.Telegram && Telegram.WebApp);
    const forceDeep = queryFlag('forcedeep', false); // ?forcedeep=1 — принудительно дублировать через deep-link

    setPending(true, '⏳ Синхронизация…');
    let sendOk = false;

    try {
      const payload = buildExportPayload(true);
      const envelope = { kind: 'snapshot', data: payload, reason: 'manual-sync' };

      // Путь 1: WebApp.sendData (если доступен)
      if (hasWA) {
        try {
          Telegram.WebApp.sendData(JSON.stringify(envelope));
          sendOk = true;
        } catch (e) {
          console.warn('[TG] sendData error:', e);
        }
      }

      // Путь 2: deep-link SNAP-… (если нет WebApp или включён forcedeep, или sendData не сработал)
      if (!hasWA || forceDeep || !sendOk) {
        const code = buildExportCode(true);
        const url = `https://t.me/${BOT_USERNAME}?start=SNAP-${code}`;
        try {
          if (hasWA && Telegram.WebApp.openLink) {
            Telegram.WebApp.openLink(url);
          } else {
            window.open(url, '_blank');
          }
        } catch {
          window.location.href = url;
        }
      }

      setPending(false, '✅ Отправлено');
      showToast('Отправлено боту');
      setTimeout(() => { btn.textContent = '🔄 Синхронизировать с ботом'; }, 1200);
    } catch (e) {
      console.warn('[TG] sync error:', e);
      setPending(false, '⚠️ Ошибка, повторите');
      showToast('Ошибка синхронизации', 2000);
      setTimeout(() => { btn.textContent = '🔄 Синхронизировать с ботом'; }, 1500);
    }
  });
}


// Маленький отладочный бейдж внизу
function showDebugBanner() {
  try {
    const params = new URLSearchParams(location.search);
    const dbg = params.get('debug');
    if (!(dbg === '1' || /^true$/i.test(dbg))) return; // по умолчанию НЕ показываем

    const hasTg = !!window.Telegram;
    const hasWA = !!(window.Telegram && window.Telegram.WebApp);
    const inTG = isTelegramWebApp();
    const hash = (location.hash || '').slice(0, 120);

    const div = document.createElement('div');
    div.textContent = `TG:${inTG ? 'YES' : 'NO'} | obj:${hasWA ? 'YES' : (hasTg ? 'tg-only' : 'no')} | hash:${hash}`;
    div.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:2000;background:#000c;color:#fff;padding:6px 8px;border-radius:6px;font:12px/1.2 system-ui';
    document.body.appendChild(div);
  } catch {}
}


// ========================
// Запуск
// ========================
document.addEventListener('DOMContentLoaded', () => {
  try { initCalendar(); }
  catch (e) {
    console.error('FATAL:', e);
    alert('Ошибка запуска: ' + (e && e.message ? e.message : e));
  }
});



