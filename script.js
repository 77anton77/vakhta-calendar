// ========================
// Состояние приложения
// ========================
let currentDate = new Date();
let vakhtaStartDate = null;
let manualOverrides = {};
let currentSchedule = 'standard'; // 'standard', 'sakhalin', 'standard-day', 'sakhalin-day'
let currentView = 'year';         // 'month' | 'year'
// чувствительность к движению до старта long-press (адаптация под DPR)

const LONG_PRESS_MS = 380; // было 450 — чуть быстрее, удобнее
const MOVE_CANCEL_PX = Math.max(14, Math.round(10 * (window.devicePixelRatio || 1))); // минимум 14px
const DRAG_MIN_DATES = 2; // минимум 2 даты для массового окна (оставляем)



// Жесты редактирования на телефоне: 'single' | 'double'
let editGestureMode = localStorage.getItem('editGestureMode') || 'double';
let lastTapTime = 0, lastTapDateStr = null, lastTapX = 0, lastTapY = 0; // для double‑tap

// Свайпы (мобильная навигация)
let swipeTracking = false;
let swipeStartX = 0, swipeStartY = 0;
let swipeConsumed = false;
let disableSwipe = false; // блокируем свайпы во время рисования диапазона

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

// Запоминать последний выбранный статус для диапазона
let lastBulkStatus = localStorage.getItem('lastBulkStatus') || 'auto';

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
// Годовой вид (CSS‑сетка, без JS‑масштабирования)
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
    yearContainer.appendChild(createMonthOverview(month));
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
  monthEl.addEventListener('click', () => {
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
    const color = getStatusColor(status);
    const isToday = isTodayDate(date);
    const cls = `month-day ${isToday ? 'today' : ''}`;
    const sym = getStatusSymbol(status);
    html += `
      <div class="${cls}" style="background:${color};" title="${d} ${monthNameRu(month)} - ${getStatusText(status)}">
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
      const d = new Date(data.vakhtaStartDate);
      if (!isNaN(d)) vakhtaStartDate = d;
    }
    if (data.manualOverrides) manualOverrides = data.manualOverrides;
    if (data.currentView) currentView = data.currentView === 'year' ? 'year' : 'month';
  }
  updateScheduleButtonText();
}

function saveData() {
  localStorage.setItem('vakhtaCalendarData', JSON.stringify({
    vakhtaStartDate: vakhtaStartDate ? vakhtaStartDate.toISOString() : null,
    manualOverrides,
    currentSchedule,
    currentView
  }));
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
  processPrintParams();
}

function initTelegramApp() {
  if (window.Telegram && Telegram.WebApp) {
    Telegram.WebApp.expand();
    Telegram.WebApp.setHeaderColor('#2c3e50');
    Telegram.WebApp.setBackgroundColor('#1e3c72');
    Telegram.WebApp.BackButton.show();
    Telegram.WebApp.BackButton.onClick(() => Telegram.WebApp.close());
  }
}

function setupEventListeners() {
  // Гасим системное контекстное меню по долгому тапу в календаре
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest && e.target.closest('.calendar')) {
    e.preventDefault();
  }
});

// Запрещаем старт выделения текста внутри календаря (кроме input/textarea)
document.addEventListener('selectstart', (e) => {
  const el = e.target;
  if (el && el.closest && el.closest('.calendar')) {
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
    }
  }
});

// На всякий случай снимаем любое текущее выделение при начале рисования диапазона
document.addEventListener('touchstart', (e) => {
  if (e.target.closest && e.target.closest('.calendar')) {
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
  }
}, { passive: true });

  document.getElementById('prev-month').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById('prev-year').addEventListener('click', () => {
    currentDate.setFullYear(currentDate.getFullYear() - 1);
    renderCalendar();
  });
  document.getElementById('next-year').addEventListener('click', () => {
    currentDate.setFullYear(currentDate.getFullYear() + 1);
    renderCalendar();
  });
  document.getElementById('today').addEventListener('click', () => {
    currentDate = new Date();
    renderCalendar();
  });

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
      // если кликнули по дню без удержания Shift — снимаем выделение
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

  const dateStr = date.toISOString().split('T')[0];
  if (manualOverrides[dateStr]) classes.push('manual-override');

  dayEl.className = classes.join(' ');
  dayEl.innerHTML = `
    <div class="day-number">${date.getDate()}</div>
    <div class="day-status">${getStatusText(status)}</div>
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

  if (currentView === 'year') {
    dayHeaders.forEach(h => h.style.display = 'none');
    calendarEl.classList.add('year-mode');
    const controls = document.querySelector('.controls');
if (controls) controls.classList.add('hide-date-controls');


    const oldYear = calendarEl.querySelector('.year-view');
    if (oldYear) oldYear.remove();

    renderYearView();
    return;
  }

  calendarEl.classList.remove('year-mode');
  const controls = document.querySelector('.controls');
if (controls) controls.classList.remove('hide-date-controls');

  dayHeaders.forEach(h => h.style.display = 'grid');

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
  dateInput.value = today.toISOString().split('T')[0];

  modal.querySelector('#quick-today').addEventListener('click', () => {
    dateInput.value = today.toISOString().split('T')[0];
  });

  modal.querySelector('#confirm-date').addEventListener('click', () => {
    if (dateInput.value) {
      const inputDate = new Date(dateInput.value);
      if (!isNaN(inputDate.getTime())) {
        vakhtaStartDate = inputDate;
        saveData();
        renderCalendar();
        alert(`Дата начала вахты установлена: ${inputDate.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' })}`);
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
  const dateStr = date.toISOString().split('T')[0];
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
  const dateStr = date.toISOString().split('T')[0];
  const currentStatus = calculateVakhtaStatus(date);

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 300px;">
      <h3 style="margin-bottom: 15px; text-align: center;">
        Редактирование дня<br>
        <small>${date.toLocaleDateString('ru-RU')}</small>
      </h3>
      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px;">Текущий статус:</label>
        <div style="padding: 8px; background: #f8f9fa; border-radius: 5px; margin-bottom: 10px;">
          ${getStatusText(currentStatus)}
        </div>
      </div>
      <select id="status-select" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 5px;">
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
      <div style="display: flex; gap: 10px;">
        <button id="save-edit" style="flex: 1; padding: 10px; background: #27ae60; color: white; border: none; border-radius: 5px;">Сохранить</button>
        <button id="cancel-edit" style="flex: 1; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 5px;">Отмена</button>
        ${manualOverrides[dateStr] ? `<button id="reset-edit" style="flex: 1; padding: 10px; background: #e67e22; color: white; border: none; border-radius: 5px;">Сбросить</button>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const select = modal.querySelector('#status-select');
  if (manualOverrides[dateStr]) select.value = manualOverrides[dateStr];

  modal.querySelector('#save-edit').addEventListener('click', () => {
    if (select.value === 'auto') delete manualOverrides[dateStr];
    else manualOverrides[dateStr] = select.value;
    saveData();
    renderCalendar();
    document.body.removeChild(modal);
  });

  if (manualOverrides[dateStr]) {
    modal.querySelector('#reset-edit').addEventListener('click', () => {
      delete manualOverrides[dateStr];
      saveData();
      renderCalendar();
      document.body.removeChild(modal);
    });
  }

  modal.querySelector('#cancel-edit').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

// ========================
// Массовое редактирование (тач + ПК)
// ========================
function addDayTouchHandlers(el) {
  let touchStartTime = 0;
  let startX = 0, startY = 0;
  let moved = false;
  let tapTargetDateStr = null;

  el.addEventListener('touchstart', (e) => {
    if (currentView !== 'month') return;

    // если был старый диапазон — снимем
    if (selectionEls && selectionEls.size) {
      clearSelectionHighlight();
    }

    const ds = e.currentTarget.getAttribute('data-date');
    if (!ds) return;

    tapTargetDateStr = ds;
    moved = false;
    touchStartTime = Date.now();

    const t = e.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;

    if (longPressTimer) clearTimeout(longPressTimer);
    selecting = false;
    selectionStartDate = new Date(ds);
    selectionEndDate = new Date(ds);

    // long-press — включаем выбор, только если не было движения
    longPressTimer = setTimeout(() => {
      if (moved) return;            // если уже двигались — не включаем выбор
      selecting = true;
      disableSwipe = true;          // блокируем свайпы, пока рисуем диапазон
      document.body.classList.add('range-selecting');
      updateSelectionHighlight();
    }, LONG_PRESS_MS);
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!tapTargetDateStr) return;
    const t = e.touches[0];
    if (!t) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // Отменяем long-press до старта выбора только при ЯВНОМ вертикальном скролле
    // Горизонтальное смещение до старта НЕ отменяет — чтобы легче было включить выбор
    if (!selecting) {
      const dist = Math.hypot(dx, dy);
      if (dist > MOVE_CANCEL_PX && Math.abs(dy) > Math.abs(dx)) {
        moved = true;
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      }
    }

    // Если уже рисуем диапазон — обновляем конечную дату под пальцем
    if (selecting) {
      const node = document.elementFromPoint(t.clientX, t.clientY);
      const dayEl = node && node.closest ? node.closest('.day') : null;
      const ds = dayEl && dayEl.getAttribute('data-date');
      if (ds) {
        selectionEndDate = new Date(ds);
        updateSelectionHighlight();
        e.preventDefault(); // не даём странице прокручиваться пока рисуем
      }
    }
  }, { passive: false });

  const finish = (e) => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

    // Если рисовали диапазон — уточним конечную дату под пальцем
    if (selecting && e && e.changedTouches && e.changedTouches[0]) {
      const t = e.changedTouches[0];
      const node = document.elementFromPoint(t.clientX, t.clientY);
      const dayEl = node && node.closest ? node.closest('.day') : null;
      const ds = dayEl && dayEl.getAttribute('data-date');
      if (ds) selectionEndDate = new Date(ds);
    }

    if (selecting) {
      selecting = false;
      document.body.classList.remove('range-selecting');
      disableSwipe = false;
      e && e.preventDefault();

      const picked = getDateStringsBetween(selectionStartDate, selectionEndDate);

      if (picked.length >= DRAG_MIN_DATES) {
        // Реальный диапазон — открываем массовое
        openBulkEditModalForRange();
      } else {
        // Всего 1 день:
        if (!moved && tapTargetDateStr) {
          // долгий тап без движения — открыть редактор одного дня
          editDayManually(new Date(tapTargetDateStr));
        } else {
          // был скролл/свайп — просто снимаем подсветку
          clearSelectionHighlight();
        }
      }
    } else {
      // Обычный тап: один/двойной — только если не было движения
      const dt = Date.now() - touchStartTime;
      if (!moved && dt < 300 && tapTargetDateStr && !swipeConsumed) {
        if (editGestureMode === 'single') {
          e && e.preventDefault();
          editDayManually(new Date(tapTargetDateStr));
        } else {
          const now = Date.now();
          const same = (lastTapDateStr === tapTargetDateStr);
          const timeOk = (now - lastTapTime) < 280;
          const dist = Math.hypot(startX - lastTapX, startY - lastTapY);
          if (same && timeOk && dist < 12) {
            e && e.preventDefault();
            editDayManually(new Date(tapTargetDateStr));
            lastTapTime = 0; lastTapDateStr = null;
          } else {
            lastTapTime = now;
            lastTapDateStr = tapTargetDateStr;
            lastTapX = startX; lastTapY = startY;
          }
        }
      }
    }

    tapTargetDateStr = null;
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
    selectionStartDate = new Date(ds);
    selectionEndDate = new Date(ds);
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
    selectionEndDate = new Date(ds);
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
// Подсветка диапазона и утилиты дат (восстановлено)
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
// ========================
// Модалка массового редактирования диапазона
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
    <div style="background: white; padding: 20px; border-radius: 10px; width: 92%; max-width: 340px;">
      <h3 style="margin-bottom: 10px; text-align: center;">Массовое редактирование дат</h3>
      <div style="font-size: 13px; color: #7f8c8d; text-align: center; margin-bottom: 12px;">
        Даты: ${selectionStartDate.toLocaleDateString('ru-RU')} — ${selectionEndDate.toLocaleDateString('ru-RU')}<br>
        Всего: ${count} ${pluralDays(count)}
      </div>
      <select id="bulk-status" style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 6px;">
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
      <div style="display: flex; gap: 10px;">
        <button id="bulk-apply" style="flex: 1; padding: 10px; background: #27ae60; color:#fff; border:none; border-radius:6px;">Применить</button>
        <button id="bulk-cancel" style="flex: 1; padding: 10px; background: #e74c3c; color:#fff; border:none; border-radius:6px;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const selectEl = modal.querySelector('#bulk-status');
  // восстановить последний выбранный статус
  try {
    const saved = localStorage.getItem('lastBulkStatus') || 'auto';
    selectEl.value = saved;
  } catch {}

  const closeModal = () => {
    document.body.removeChild(modal);
  };

  modal.querySelector('#bulk-apply').addEventListener('click', () => {
    const val = selectEl.value;
    // запомнить выбранный статус на будущее
    try { localStorage.setItem('lastBulkStatus', val); } catch {}

    dsList.forEach(ds => {
      if (val === 'auto') delete manualOverrides[ds];
      else manualOverrides[ds] = val;
    });
    saveData();
    clearSelectionHighlight(); // снять подсветку
    renderCalendar();
    closeModal();
  });

  modal.querySelector('#bulk-cancel').addEventListener('click', () => {
    clearSelectionHighlight();
    closeModal();
  });

  // клик по фону — как отмена
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      clearSelectionHighlight();
      closeModal();
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
  const arr = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    arr.push(d.toISOString().split('T')[0]);
  }
  return arr;
}

// ========================
// Свайпы (месяц/год) — при рисовании диапазона отключены
// ========================
function setupSwipeNavigation() {
  const cal = document.getElementById('calendar');
  if (!cal || cal.dataset.swipeAttached === '1') return;
  cal.dataset.swipeAttached = '1';

  const SWIPE_X = 50, SWIPE_Y = 30;

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
      e.preventDefault();
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
      e.preventDefault();
    }
  }, { passive: false });

  cal.addEventListener('touchcancel', () => {
    if (disableSwipe) return;
    swipeTracking = false;
    swipeConsumed = false;
  });
}

// ========================
// Сброс ручных изменений
// ========================
function resetManualChanges() {
  if (Object.keys(manualOverrides).length === 0) {
    alert('Нет ручных изменений для сброса');
    return;
  }
  if (confirm('Вы уверены, что хотите сбросить ВСЕ ручные изменения?')) {
    manualOverrides = {};
    saveData();
    renderCalendar();
    alert('Все ручные изменения сброшены');
  }
}

// ========================
// Статистика
// ========================
function showStatistics() {
  const currentYear = currentDate.getFullYear();
  let stats = {
    sick: { total: 0, work: 0, rest: 0 },
    businessTrip: { total: 0, work: 0, rest: 0 },
    vacation: { total: 0, work: 0, rest: 0 }
  };
  
  Object.keys(manualOverrides).forEach(dateStr => {
    const date = new Date(dateStr);
    if (date.getFullYear() === currentYear) {
      const status = manualOverrides[dateStr];
      const autoStatus = calculateAutoStatus(date);
      if (status === 'sick') {
        stats.sick.total++;
        if (isWorkDay(autoStatus)) stats.sick.work++; else stats.sick.rest++;
      } else if (status === 'business-trip') {
        stats.businessTrip.total++;
        if (isWorkDay(autoStatus)) stats.businessTrip.work++; else stats.businessTrip.rest++;
      } else if (status === 'vacation') {
        stats.vacation.total++;
        if (isWorkDay(autoStatus)) stats.vacation.work++; else stats.vacation.rest++;
      }
    }
  });
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 400px;">
      <h3 style="margin-bottom: 15px; text-align: center;">Статистика за ${currentYear} год</h3>
      <div style="margin-bottom: 15px;">
        <h4 style="margin-bottom: 10px; color: #f1c40f;">🟨 Больничные:</h4>
        <div style="padding: 10px; background: #fffbf0; border-radius: 5px;">
          Всего: ${stats.sick.total} ${pluralDays(stats.sick.total)}<br>
          В рабочие дни: ${stats.sick.work} ${pluralDays(stats.sick.work)}<br>
          В дни отдыха: ${stats.sick.rest} ${pluralDays(stats.sick.rest)}
        </div>
      </div>
      <div style="margin-bottom: 15px;">
        <h4 style="margin-bottom: 10px; color: #1abc9c;">🧳 Командировки:</h4>
        <div style="padding: 10px; background: #f0f9f7; border-radius: 5px;">
          Всего: ${stats.businessTrip.total} ${pluralDays(stats.businessTrip.total)}<br>
          В рабочие дни: ${stats.businessTrip.work} ${pluralDays(stats.businessTrip.work)}<br>
          В дни отдыха: ${stats.businessTrip.rest} ${pluralDays(stats.businessTrip.rest)}
        </div>
      </div>
      <div style="margin-bottom: 15px;">
        <h4 style="margin-bottom: 10px; color: #95a5a6;">🏖️ Отпуск:</h4>
        <div style="padding: 10px; background: #f8f9fa; border-radius: 5px;">
          Всего: ${stats.vacation.total} ${pluralDays(stats.vacation.total)}<br>
          В рабочие дни: ${stats.vacation.work} ${pluralDays(stats.vacation.work)}<br>
          В дни отдыха: ${stats.vacation.rest} ${pluralDays(stats.vacation.rest)}
        </div>
      </div>
      <button id="close-stats" style="width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 5px;">Закрыть</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#close-stats').addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

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
function isWorkDay(status) { return ['travel-to','work-day','work-night','travel-from','travel-from-day'].includes(status); }

function pluralDays(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'дня';
  return 'дней';
}

// ========================
// Справка (сворачиваемые разделы + тексты)
// ========================
function showHelp() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto;">
      <h3 style="margin-bottom: 15px; text-align: center;">📋 Справка по календарю вахтовика</h3>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #3498db; margin-bottom: 10px;">🎯 Основная логика графика</h4>
        <p><strong>График 28/28:</strong> 28 дней вахта → 28 дней отдых<br>
        <strong>Логистика = отдых:</strong> Самолет и поезд считаются днями отдыха<br>
        <strong>Рабочие дни:</strong> Заезд, дневные/ночные смены, выезд</p>
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #3498db; margin-bottom: 10px;">🎛️ Режимы работы</h4>
        <p><strong>Стандартный (дневные/ночные смены)</strong> — с самолетами; 14 дневных + 14 ночных; выезд: ночь + выезд</p>
        <p><strong>Сахалинский (дневные/ночные смены)</strong> — без самолетов; 14 дневных + 14 ночных; выезд: ночь + выезд</p>
        <p><strong>Стандартный дневной</strong> — с самолетами; 28 дневных; выезд: день + выезд</p>
        <p><strong>Сахалинский дневной</strong> — без самолетов; 28 дневных; выезд: день + выезд</p>
        <p>Активный график подсвечивается зеленым цветом.</p>
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #3498db; margin-bottom: 10px;">✏️ Редактирование дней</h4>
        <p>
          • ПК: двойной клик по дню — открыть редактор статуса.<br>
          • Смартфон: по умолчанию — двойной тап. Можно переключить на один тап: «Режимы вахты» → «Настройки» → «Ручное редактирование даты».
        </p>
        <p style="margin-top: 6px;">
          В редакторе можно назначить: <strong>🟨 Больничный</strong>, <strong>🧳 Командировка</strong>, <strong>🏖️ Отпуск</strong> и т.п.
          Ручные изменения подсвечиваются оранжевой рамкой и сохраняются автоматически.
        </p>
        <p style="margin-top: 8px;">
          <strong>Массовое редактирование дат:</strong><br>
          • ПК: Shift + протяжка мышью — выделится диапазон, далее выберите статус.<br>
          • Смартфон: долго удерживайте (~0.45 с), затем проведите пальцем по датам и отпустите — появится окно массового редактирования.<br>
          Свайпы листают месяц/год и имеют приоритет.
        </p>
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #3498db; margin-bottom: 10px;">🗂️ Виды отображения</h4>
        <p><strong>Годовой вид:</strong> 12 мини‑месяцев на одном экране. Тап по месяцу — переход к месяцу.</p>
        <p><strong>Месячный вид:</strong> подробные статусы каждого дня, двойной клик — редактор.</p>
        <p><strong>Переключение:</strong> кнопка «📊 Годовой вид» / «📅 Месячный вид».</p>
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #3498db; margin-bottom: 10px;">📊 Статистика</h4>
        <p>Показывает число отпусков/командировок/больничных за год и делит их на <em>в рабочие</em> / <em>в дни отдыха</em>.</p>
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="color: #3498db; margin-bottom: 10px;">🔄 Сброс изменений</h4>
        <p>Удаляет ВСЕ ручные изменения. Основной график вахты сохраняется.</p>
      </div>
      <div style="margin-bottom: 15px;">
        <h4 style="color: #3498db; margin-bottom: 10px;">💾 Сохранение данных</h4>
        <p>Все настройки сохраняются в браузере. При повторном открытии всё восстановится.</p>
      </div>
      <button id="close-help" style="width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 5px;">Закрыть</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#close-help').addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });

  // Аккордеон: открыт только первый раздел
  (function makeCollapsibleHelp() {
    const headers = modal.querySelectorAll('h4');
    headers.forEach((h4, idx) => {
      h4.style.cursor = 'pointer';
      h4.style.display = 'flex';
      h4.style.alignItems = 'center';
      h4.style.justifyContent = 'space-between';
      const chevron = document.createElement('span');
      chevron.textContent = '▼';
      chevron.style.fontSize = '12px';
      chevron.style.opacity = '0.7';
      chevron.style.marginLeft = '8px';
      chevron.style.transition = 'transform .2s ease';
      h4.appendChild(chevron);

      const contentNodes = [];
      let el = h4.nextElementSibling;
      while (el && el.tagName !== 'H4' && el.id !== 'close-help') {
        contentNodes.push(el);
        el = el.nextElementSibling;
      }
      const setCollapsed = (collapsed) => {
        contentNodes.forEach(node => node.style.display = collapsed ? 'none' : '');
        chevron.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
      };
      setCollapsed(idx !== 0);
      h4.addEventListener('click', () => {
        const collapsedNow = contentNodes.length ? contentNodes[0].style.display === 'none' : false;
        setCollapsed(!collapsedNow);
      });
    });
  })();
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
      <h3 style="margin-bottom: 15px; text-align: center;">Выберите месяц и год</h3>
      <div style="display: flex; gap: 10px; margin-bottom: 15px;">
        <select id="year-select" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
          ${generateYearOptions(currentYear)}
        </select>
        <select id="month-select" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
          ${generateMonthOptions(currentMonth)}
        </select>
      </div>
      <div style="display: flex; gap: 10px;">
        <button id="confirm-picker" style="flex: 1; padding: 10px; background: #27ae60; color: white; border: none; border-radius: 5px;">OK</button>
        <button id="cancel-picker" style="flex: 1; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 5px;">Отмена</button>
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
// Режимы (добавлены настройки жестов)
// ========================
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

function showScheduleSelector() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 420px;">
      <h3 style="margin-bottom: 20px; text-align: center;">📋 Выберите режим вахты</h3>
      <div style="margin-bottom: 25px;">
        <div style="font-size: 14px; color: #7f8c8d; margin-bottom: 10px; text-align: center;">
          Текущий режим: <strong>${getCurrentScheduleName()}</strong>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${renderScheduleOption('standard', '📋 Стандартный', 'С самолетами, дневные/ночные смены')}
          ${renderScheduleOption('sakhalin', '🏝️ Сахалинский', 'Без самолетов, дневные/ночные смены')}
          ${renderScheduleOption('standard-day', '☀️ Стандартный дневной', 'С самолетами, только дневные смены')}
          ${renderScheduleOption('sakhalin-day', '☀️ Сахалинский дневной', 'Без самолетов, только дневные смены')}
        </div>
      </div>

      <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #eee;">
        <div style="font-weight:600; margin-bottom:8px;">Настройки</div>
        <div style="font-size:12px; color:#7f8c8d; margin-bottom:6px;">
          Ручное редактирование даты (на телефоне):
        </div>
        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px;">
            <input type="radio" name="edit-gesture" value="single"> Один тап
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:12px;">
            <input type="radio" name="edit-gesture" value="double"> Двойной тап
          </label>
        </div>
        <div style="font-size:12px; color:#7f8c8d; margin-top:6px;">
          Массовое редактирование дат: долго удерживайте и тяните по датам. Свайпы листают месяц/год и имеют приоритет.
        </div>
      </div>

      <button id="close-schedule" style="margin-top:14px; width: 100%; padding: 12px; background: #3498db; color: white; border: none; border-radius: 8px; font-weight: 600;">Закрыть</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('.schedule-option').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSchedule = btn.getAttribute('data-value');
      saveData();
      renderCalendar();
      updateScheduleButtonText();
      document.body.removeChild(modal);
    });
  });

  const savedGesture = localStorage.getItem('editGestureMode') || 'double';
  const radio = modal.querySelector(`input[name="edit-gesture"][value="${savedGesture}"]`);
  if (radio) radio.checked = true;

  modal.querySelectorAll('input[name="edit-gesture"]').forEach(r => {
    r.addEventListener('change', (e) => {
      editGestureMode = e.target.value;
      localStorage.setItem('editGestureMode', editGestureMode);
    });
  });

  modal.querySelector('#close-schedule').addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

function renderScheduleOption(value, title, subtitle) {
  const active = currentSchedule === value;
  return `
    <button class="schedule-option ${active ? 'active-option' : ''}" data-value="${value}"
      style="padding: 15px; border: 2px solid ${active ? '#27ae60' : '#3498db'}; border-radius: 8px; background: ${active ? '#f8fff9' : 'white'}; text-align: left; cursor: pointer;">
      <div style="font-weight: bold; color: #2c3e50; margin-bottom: 4px;">${title}</div>
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

// ========================
// Вспомогательное
// ========================
function monthNameRu(m) {
  return new Date(currentDate.getFullYear(), m).toLocaleDateString('ru-RU', { month: 'long' });
}
function isWorkStatus(st) { return ['travel-to','work-day','work-night','travel-from','travel-from-day'].includes(st); }
function isSpecialStatus(st) { return ['sick','business-trip','vacation'].includes(st); }
function isTodayDate(d) {
  const t = new Date();
  return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear();
}
function getStatusSymbol(st) {
  const map = {
    'work-day':'☀️','work-night':'🌙','travel-to':'➡️','travel-from':'⬅️','travel-from-day':'⬅️',
    'plane-from-home':'✈️','plane-to-home':'✈️','train':'🚂','sick':'🟨','business-trip':'🧳','vacation':'🏖️','rest':''
  }; return map[st] || '';
}
function getStatusColor(st) {
  const c = {'work-day':'#ff6b6b','work-night':'#9b59b6','travel-to':'#3498db','travel-from':'#3498db','travel-from-day':'#3498db','plane-from-home':'#3498db','plane-to-home':'#3498db','train':'#3498db','rest':'#bdc3c7','sick':'#f1c40f','business-trip':'#1abc9c','vacation':'#95a5a6'};
  return c[st] || '#bdc3c7';
}

// Заголовки для печати
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
    const mode = (typeof getCurrentScheduleName === 'function') ? getCurrentScheduleName() : '';
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
    const mode = (typeof getCurrentScheduleName === 'function') ? getCurrentScheduleName() : '';
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
// Поделиться: Экспорт / Импорт / Печать
// ========================
function buildExportPayload(full = false) {
  const payload = {
    v: 1,
    generatedAt: new Date().toISOString(),
    currentSchedule: typeof currentSchedule === 'string' ? currentSchedule : 'standard',
    vakhtaStartDate: vakhtaStartDate ? vakhtaStartDate.toISOString().split('T')[0] : null
  };
  if (full) payload.manualOverrides = manualOverrides || {};
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

function openShareModal() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,.5);
    display:flex; align-items:center; justify-content:center; z-index:1000;
  `;

  const basicCode = buildExportCode(false);
  const fullCode  = buildExportCode(true);

  modal.innerHTML = `
    <div style="background:#fff; padding:16px; border-radius:10px; width:92%; max-width:560px;">
      <h3 style="text-align:center; margin-bottom:12px;">Поделиться / Экспорт · Импорт</h3>

      <div style="display:flex; flex-direction:column; gap:14px;">

        <div style="border:1px solid #eee; border-radius:8px; padding:12px;">
          <div style="font-weight:600; margin-bottom:8px;">Экспорт (базовый график)</div>
          <div style="font-size:12px; color:#7f8c8d; margin-bottom:8px;">
            Дата начала вахты + выбранный режим. Подходит, чтобы у получателя построился такой же график без ваших ручных правок.
          </div>
          <textarea id="export-basic" readonly style="width:100%; height:70px; font-size:12px; padding:8px; border:1px solid #ddd; border-radius:6px;">${basicCode}</textarea>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button id="copy-basic" style="flex:0 0 auto; padding:8px 10px; background:#27ae60; color:#fff; border:none; border-radius:6px;">Скопировать</button>
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
            <button id="copy-full" style="flex:0 0 auto; padding:8px 10px; background:#27ae60; color:#fff; border:none; border-radius:6px;">Скопировать</button>
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
            Печатается выбранный период: «Печать: текущий месяц» — месяц из шапки календаря, «Печать: год» — текущий год.<br>
            Чтобы напечатать другой период, сначала переключите дату в шапке, затем снова нажмите «Печать».<br>
            В системном окне выберите «Сохранить как PDF».
          </div>
        </div>

      </div>

      <div style="display:flex; gap:10px; margin-top:14px;">
        <button id="close-share" style="flex:1; padding:10px; background:#e74c3c; color:#fff; border:none; border-radius:6px;">Закрыть</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const content = modal.firstElementChild;
  if (content) {
    content.style.maxHeight = '85vh';
    content.style.overflowY = 'auto';
  }

  const basicCopied = modal.querySelector('#basic-copied');
  modal.querySelector('#copy-basic').addEventListener('click', () => {
    const ta = modal.querySelector('#export-basic');
    copyText(ta.value).then(() => {
      basicCopied.style.display = 'inline';
      setTimeout(() => basicCopied.style.display = 'none', 1500);
    });
  });
  const fullCopied = modal.querySelector('#full-copied');
  modal.querySelector('#copy-full').addEventListener('click', () => {
    const ta = modal.querySelector('#export-full');
    copyText(ta.value).then(() => {
      fullCopied.style.display = 'inline';
      setTimeout(() => fullCopied.style.display = 'none', 1500);
    });
  });

  modal.querySelector('#apply-import').addEventListener('click', () => {
    const code = modal.querySelector('#import-code').value.trim();
    if (!code) { alert('Вставьте код для импорта'); return; }
    const obj = decodeImportCode(code);
    if (!obj || typeof obj !== 'object' || (obj.v !== 1 && obj.v !== undefined)) {
      alert('Неподдерживаемый формат кода');
      return;
    }
    const mode = modal.querySelector('input[name="import-mode"]:checked').value;
    const applyBasic = () => {
      if (obj.vakhtaStartDate) {
        const d = new Date(obj.vakhtaStartDate);
        if (!isNaN(d)) vakhtaStartDate = d;
      }
      if (obj.currentSchedule) {
        currentSchedule = obj.currentSchedule;
      }
    };
    if (mode === 'basic') {
      applyBasic();
    } else {
      applyBasic();
      if (obj.manualOverrides && typeof obj.manualOverrides === 'object') {
        manualOverrides = obj.manualOverrides;
      } else {
        manualOverrides = {};
      }
    }
    saveData();
    renderCalendar();
    alert('Импорт завершён');
    document.body.removeChild(modal);
  });

  modal.querySelector('#print-month').addEventListener('click', () => {
    document.body.removeChild(modal);
    tryPrint('month');
  });
  modal.querySelector('#print-year').addEventListener('click', () => {
    document.body.removeChild(modal);
    tryPrint('year');
  });

  modal.querySelector('#close-share').addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
}

function applyImported(obj, full) {
  try {
    if (obj.v !== 1) { /* допускаем и без версии */ }
    if (obj.vakhtaStartDate) {
      const d = new Date(obj.vakhtaStartDate);
      if (!isNaN(d)) vakhtaStartDate = d;
    }
    if (obj.currentSchedule) {
      if (typeof currentSchedule !== 'undefined') currentSchedule = obj.currentSchedule;
    }
    if (full && obj.manualOverrides) {
      manualOverrides = obj.manualOverrides;
    }
    saveData && saveData();
    renderCalendar && renderCalendar();
    alert('Импорт применён');
  } catch (e) {
    alert('Ошибка применения импорта');
  }
}

// ========================
// Печать: fallback для Telegram WebView
// ========================
function isTelegramWebApp() {
  try { return !!(window.Telegram && Telegram.WebApp); } catch { return false; }
}

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
  const d = currentDate ? currentDate.toISOString().split('T')[0] : '';
  const url = new URL(location.href.split('#')[0]);
  url.searchParams.set('code', code);
  url.searchParams.set('print', kind);
  if (d) url.searchParams.set('d', d);
  const href = url.toString();
  try {
    if (isTelegramWebApp()) Telegram.WebApp.openLink(href);
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
        const dt = new Date(obj.vakhtaStartDate);
        if (!isNaN(dt)) vakhtaStartDate = dt;
      }
      if (obj.currentSchedule) currentSchedule = obj.currentSchedule;
    }
  }
  if (d) {
    const dd = new Date(d);
    if (!isNaN(dd)) currentDate = dd;
  }

  if (print === 'month' || print === 'year') {
    saveData();
    renderCalendar();
    updateViewButton();
    setTimeout(() => { print === 'month' ? ensureMonthThenPrint() : ensureYearThenPrint(); }, 100);
  }
}

// ========================
// Запуск (с "страховкой" от фатальных ошибок)
// ========================
document.addEventListener('DOMContentLoaded', () => {
  try { initCalendar(); }
  catch (e) {
    console.error('FATAL:', e);
    alert('Ошибка запуска: ' + (e && e.message ? e.message : e));
  }
});
