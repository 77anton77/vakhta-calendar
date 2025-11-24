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

  // очищаем сетку, оставляя 7 заголовков дней
  while (calendarEl.children.length > 7) {
    calendarEl.removeChild(calendarEl.lastChild);
  }

  // в заголовке показываем год
  currentMonthEl.textContent = currentDate.getFullYear();

  // контейнер годового вида
  const yearContainer = document.createElement('div');
  yearContainer.className = 'year-view';
  yearContainer.style.gridColumn = '1 / -1';

  // добавляем 12 мини-месяцев
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

  // Блокируем системный зум по двойному клику/двойному тапу ТОЛЬКО на мини‑месяцах
  let lastTap = 0;

  // dblclick (эмулятор/десктоп)
  monthEl.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  // двойной тап (мобильный WebView/эмулятор)
  monthEl.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      // второй тап подряд — гасим, чтобы не было зума
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastTap = now;
  }, { passive: false });

  // Переход к месяцу
  monthEl.addEventListener('click', (e) => {
    e.preventDefault(); // на всякий случай — убрать нативные side‑эффекты
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

    // Цвет фона через градиент/цвет (без абсолютных слоёв)
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
// Вспомогательное (локальные ключи дат — без UTC-сдвигов)
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
// Сегодня?
function isTodayDate(d) {
  const t = new Date();
  return d.getDate() === t.getDate()
      && d.getMonth() === t.getMonth()
      && d.getFullYear() === t.getFullYear();
}

// Название месяца (для подсказок в годовом виде)
function monthNameRu(m) {
  return new Date(currentDate.getFullYear(), m)
    .toLocaleDateString('ru-RU', { month: 'long' });
}

// Символы статусов (используются в годовом виде)
function getStatusSymbol(st) {
  const map = {
    'work-day': '☀️',
    'work-night': '🌙',
    'travel-to': '➡️',
    'travel-from': '⬅️',
    'travel-from-day': '⬅️',
    'plane-from-home': '✈️',
    'plane-to-home': '✈️',
    'train': '🚂',
    'sick': '🟨',
    'business-trip': '🧳',
    'vacation': '🏖️',
    'rest': ''
  };
  return map[st] || '';
}

// Цвета статусов (для фона в годовом виде, когда не половинки)
function getStatusColor(st) {
  const c = {
    'work-day': '#ff6b6b',
    'work-night': '#9b59b6',
    'travel-to': '#3498db',
    'travel-from': '#3498db',
    'travel-from-day': '#3498db',
    'plane-from-home': '#3498db',
    'plane-to-home': '#3498db',
    'train': '#3498db',
    'rest': '#bdc3c7',
    'sick': '#f1c40f',
    'business-trip': '#1abc9c',
    'vacation': '#95a5a6'
  };
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
  } catch {
    return '';
  }
}

// Рабочие статусы для подсчёта/мини‑месяцев
function isWorkStatus(st) {
  return ['travel-to','work-day','work-night','travel-from','travel-from-day'].includes(st);
}

// Специальные статусы (не отдых и не работа)
function isSpecialStatus(st) {
  return ['sick','business-trip','vacation'].includes(st);
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
  if (typeof updateScheduleButtonText === 'function') updateScheduleButtonText();

}

function saveData() {
  localStorage.setItem('vakhtaCalendarData', JSON.stringify({
    vakhtaStartDate: vakhtaStartDate ? fmtYMDLocal(vakhtaStartDate) : null, // ЛОКАЛЬНО
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
  addTgTestButton(); // тест‑кнопка в TG WebApp
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

  // КЛЮЧ ДАТЫ — ЛОКАЛЬНЫЙ
  const dateStr = fmtYMDLocal(date);
  if (manualOverrides[dateStr]) classes.push('manual-override');

  dayEl.className = classes.join(' ');

  // Командировка: если есть заметка — показываем её вместо слова
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
    if (controls) controls.classList.add('hide-month-nav'); // скрываем только месячные кнопки
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
// Редактирование дня (один день) — с заметкой для командировки
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
function addDayTouchHandlers(el) {
  let touchStartTime = 0;
  let startX = 0, startY = 0;
  let moved = false;
  let tapTargetDateStr = null;

  // Снимок сетки
  let cells = null;        // 42 ячейки
  let colCenters = null;   // [7] X-центры
  let rowCenters = null;   // [6] Y-центры
  let startIdx = null;     // 0..41
  let endIdx = null;       // 0..41
  let startRow = null, startCol = null;
  let curRow = null, curCol = null;

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

    // индекс старта
    startIdx = list.indexOf(hitEl);
    if (startIdx < 0) startIdx = 0;
    startRow = Math.floor(startIdx / 7);
    startCol = startIdx % 7;

    // центры строк (первый столбец каждой строки)
    rowCenters = [];
    for (let r = 0; r < 6; r++) {
      const cell = list[r * 7];
      const cr = cell.getBoundingClientRect();
      rowCenters.push((cr.top + cr.bottom) / 2);
    }
    // центры колонок (по строке старта)
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

    endIdx = startIdx;
    selecting = false;

    selectionStartDate = parseYMDLocal(ds);
    selectionEndDate   = parseYMDLocal(ds);

    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (moved) return;
      selecting = true;
      disableSwipe = true;
      document.body.classList.add('range-selecting');
      // начальная 1x1 подсветка
      updateSelectionHighlightRect(startRow, startCol, startRow, startCol, cells);
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
      curCol = nearestIndex(colCenters, t.clientX);
      curRow = nearestIndex(rowCenters, t.clientY);
      const idx = curRow * 7 + curCol;

      if (idx !== endIdx && idx >= 0 && idx < cells.length) {
        endIdx = idx;
        updateSelectionHighlightRect(startRow, startCol, curRow, curCol, cells);
      }
      if (e && e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  const finish = (e) => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

    if (selecting) {
      if (e && e.changedTouches && e.changedTouches[0] && cells && colCenters && rowCenters) {
        const t = e.changedTouches[0];
        curCol = nearestIndex(colCenters, t.clientX);
        curRow = nearestIndex(rowCenters, t.clientY);
        const idx = curRow * 7 + curCol;
        if (idx >= 0 && idx < cells.length) endIdx = idx;
      }

      selecting = false;
      document.body.classList.remove('range-selecting');
      disableSwipe = false;
      if (e && e.cancelable) e.preventDefault();

      const dsList = getDsListForRect(startRow, startCol, curRow ?? startRow, curCol ?? startCol, cells);

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

    // сброс локальных переменных
    tapTargetDateStr = null;
    cells = null; colCenters = null; rowCenters = null;
    startIdx = null; endIdx = null;
    startRow = null; startCol = null;
    curRow = null; curCol = null;
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
    // сброс
    tapTargetDateStr = null;
    cells = null; colCenters = null; rowCenters = null;
    startIdx = null; endIdx = null;
    startRow = null; startCol = null;
    curRow = null; curCol = null;
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
    out.push(fmtYMDLocal(d)); // ЛОКАЛЬНЫЙ ключ
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

  try {
    const saved = localStorage.getItem('lastBulkStatus') || 'auto';
    selectEl.value = saved;
  } catch {}

  const sync = () => {
    if (noteWrap) noteWrap.style.display = (selectEl.value === 'business-trip') ? '' : 'none';
  };
  sync();
  selectEl.addEventListener('change', sync);

  const closeModal = () => document.body.removeChild(modal);

  modal.querySelector('#bulk-apply').addEventListener('click', () => {
    const val = selectEl.value;
    try { localStorage.setItem('lastBulkStatus', val); } catch {}
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

  try {
    const saved = localStorage.getItem('lastBulkStatus') || 'auto';
    selectEl.value = saved;
  } catch {}

  const sync = () => { noteWrap.style.display = (selectEl.value === 'business-trip') ? '' : 'none'; };
  sync();
  selectEl.addEventListener('change', sync);

  const closeModal = () => document.body.removeChild(modal);

  modal.querySelector('#bulk-apply').addEventListener('click', () => {
    const val = selectEl.value;
    try { localStorage.setItem('lastBulkStatus', val); } catch {}
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

// ========================
// Печать
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
// Печать и открытие внешней вкладки (Telegram WebView fallback)
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
  const d = currentDate ? fmtYMDLocal(currentDate) : '';
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

// ========================
// Поделиться: Экспорт / Импорт / Печать (полная реализация)
// ========================
function buildExportPayload(full = false) {
  const payload = {
    v: 1,
    generatedAt: new Date().toISOString(),
    currentSchedule: typeof currentSchedule === 'string' ? currentSchedule : 'standard',
    vakhtaStartDate: vakhtaStartDate ? fmtYMDLocal(vakhtaStartDate) : null // ЛОКАЛЬНО
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

function openShareModal() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,.5);
    display:flex; align-items:center; justify-content:center; z-index:1000;
  `;

  const basicCode = buildExportCode(false);
  const fullCode  = buildExportCode(true);

  modal.innerHTML = `
    <div id="share-content" style="background:#fff; padding:16px; border-radius:10px; width:92%; max-width:560px; filter:none;">
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

  // Безопасное закрытие — сразу
  const safeClose = () => { try { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); } catch {} };
  modal.addEventListener('click', (e) => { if (e.target === modal) safeClose(); });
  const closeBtn = modal.querySelector('#close-share');
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); safeClose(); });

  // Контент: прокрутка/чёткость
  const content = modal.querySelector('#share-content');
  if (content) {
    content.style.maxHeight = '85vh';
    content.style.overflowY = 'auto';
    content.style.filter = 'none';
    content.style.backdropFilter = 'none';
  }

  // Копирование
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

  // Импорт
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
  modal.querySelector('#print-month').addEventListener('click', () => { safeClose(); tryPrint('month'); });
  modal.querySelector('#print-year').addEventListener('click', () => { safeClose(); tryPrint('year'); });
}


// ========================
// Автосинхронизация в Telegram Bot (через WebApp.sendData) + тест‑кнопка
// ========================
let tgSyncTimer = null;
function isTGWebApp() {
  try { return !!(window.Telegram && Telegram.WebApp); } catch { return false; }
}
function queueTgSync(reason) {
  if (!isTGWebApp()) return;
  if (tgSyncTimer) clearTimeout(tgSyncTimer);
  tgSyncTimer = setTimeout(() => sendTgSnapshot(reason), 1200);
}
function sendTgSnapshot(reason) {
  try {
    const payload = (typeof buildExportPayload === 'function') ? buildExportPayload(true) : {};
    const envelope = { kind: 'snapshot', data: payload, reason: reason || '' };
    if (isTGWebApp()) Telegram.WebApp.sendData(JSON.stringify(envelope));
  } catch {}
}
// временная тест‑кнопка (видна только в Telegram WebApp)
function addTgTestButton() {
  if (!isTGWebApp()) return;
  const actions = document.querySelector('.actions');
  if (!actions || actions.querySelector('#tg-test-sync')) return;
  const btn = document.createElement('button');
  btn.id = 'tg-test-sync';
  btn.style.background = '#6c757d';
  btn.title = 'Проверка связи с ботом';
  btn.textContent = 'Тест синхронизации (TG)';
  btn.addEventListener('click', () => {
    sendTgSnapshot('manual-test');
    alert('Отправлено в бота: snapshot (manual-test). Проверьте чат бота.');
  });
  actions.prepend(btn);
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

