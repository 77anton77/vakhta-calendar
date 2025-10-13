// Текущая дата и состояние календаря
let currentDate = new Date();
let vakhtaStartDate = null;
let manualOverrides = {};
let isSakhalinMode = false;

// Загрузка сохраненных данных
function loadSavedData() {
    const saved = localStorage.getItem('vakhtaCalendarData');
    if (saved) {
        const data = JSON.parse(saved);
        if (data.vakhtaStartDate) {
            vakhtaStartDate = new Date(data.vakhtaStartDate);
        }
        if (data.manualOverrides) {
            manualOverrides = data.manualOverrides;
        }
        if (data.isSakhalinMode !== undefined) {
            isSakhalinMode = data.isSakhalinMode;
        }
    }
    updateScheduleButtons();
}

// Сохранение данных
function saveData() {
    const data = {
        vakhtaStartDate: vakhtaStartDate ? vakhtaStartDate.toISOString() : null,
        manualOverrides: manualOverrides,
        isSakhalinMode: isSakhalinMode
    };
    localStorage.setItem('vakhtaCalendarData', JSON.stringify(data));
}

// Инициализация календаря
function initCalendar() {
    loadSavedData();
    initTelegramApp();
    renderCalendar();
    setupEventListeners();
    updateLegendVisibility();
}

// Инициализация Telegram Web App
function initTelegramApp() {
    if (window.Telegram && Telegram.WebApp) {
        Telegram.WebApp.expand();
        Telegram.WebApp.setHeaderColor('#2c3e50');
        Telegram.WebApp.setBackgroundColor('#1e3c72');
        
        Telegram.WebApp.BackButton.show();
        Telegram.WebApp.BackButton.onClick(() => {
            Telegram.WebApp.close();
        });
        
        console.log('Telegram Web App initialized');
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
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
    
    document.getElementById('set-vakhta').addEventListener('click', setVakhtaStartDate);
    document.getElementById('show-stats').addEventListener('click', showStatistics);
    document.getElementById('reset-changes').addEventListener('click', resetManualChanges);
    document.getElementById('show-help').addEventListener('click', showHelp);
    
    document.getElementById('schedule-standard').addEventListener('click', setStandardSchedule);
    document.getElementById('schedule-sakhalin').addEventListener('click', setSakhalinSchedule);
    
    document.getElementById('current-month').addEventListener('click', showMonthYearPicker);
}

// Функция переключения на стандартный график
function setStandardSchedule() {
    isSakhalinMode = false;
    saveData();
    updateScheduleButtons();
    renderCalendar();
    updateLegendVisibility();
}

// Функция переключения на сахалинский график
function setSakhalinSchedule() {
    isSakhalinMode = true;
    saveData();
    updateScheduleButtons();
    renderCalendar();
    updateLegendVisibility();
}

// Обновление состояния кнопок
function updateScheduleButtons() {
    const standardBtn = document.getElementById('schedule-standard');
    const sakhalinBtn = document.getElementById('schedule-sakhalin');
    
    if (standardBtn && sakhalinBtn) {
        if (isSakhalinMode) {
            standardBtn.classList.remove('active');
            sakhalinBtn.classList.add('active');
        } else {
            standardBtn.classList.add('active');
            sakhalinBtn.classList.remove('active');
        }
    }
}

// Установка даты начала вахты
function setVakhtaStartDate() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
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
                
                const formattedDate = inputDate.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                
                alert(`Дата начала вахты установлена: ${formattedDate}`);
            }
        }
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#cancel-date').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Форматирование даты
function formatDate(date) {
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Правильная логика расчета статуса дня
function calculateVakhtaStatus(date) {
    const dateStr = date.toISOString().split('T')[0];
    
    if (manualOverrides[dateStr]) {
        return manualOverrides[dateStr];
    }
    
    if (!vakhtaStartDate) return 'rest';
    
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    
    const vakhtaStart = new Date(vakhtaStartDate);
    vakhtaStart.setHours(0, 0, 0, 0);
    
    const diffTime = dateStart.getTime() - vakhtaStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const fullCycle = 56;
    const cycleDay = ((diffDays % fullCycle) + fullCycle) % fullCycle;
    
    if (isSakhalinMode) {
        // Режим Сахалина 28/28 (поезд есть, самолетов нет)
        if (cycleDay === 55) return 'train';             // Поезд за 1 день до заезда
        if (cycleDay === 0)  return 'travel-to';         // Заезд
        if (cycleDay === 28) return 'travel-from';       // Выезд
        
        if (cycleDay >= 1 && cycleDay <= 14) return 'work-day';
        if (cycleDay >= 15 && cycleDay <= 27) return 'work-night';
        
        return 'rest';
        
    } else {
        // Режим с самолетами 28/28
        if (cycleDay === 54) return 'plane-from-home';   // Самолет за 2 дня
        if (cycleDay === 55) return 'train';             // Поезд за 1 день
        if (cycleDay === 0)  return 'travel-to';         // Заезд
        if (cycleDay === 28) return 'travel-from';       // Выезд
        if (cycleDay === 29) return 'plane-to-home';     // Самолет возврат
        
        if (cycleDay >= 1 && cycleDay <= 14) return 'work-day';
        if (cycleDay >= 15 && cycleDay <= 27) return 'work-night';
        
        return 'rest';
    }
}

// Получение текстового описания статуса
function getStatusText(status) {
    switch(status) {
        case 'plane-from-home': return '✈️ Самолет';
        case 'train': return '🚂 Поезд';
        case 'travel-to': return 'Заезд + день';
        case 'work-day': return 'День';
        case 'work-night': return 'Ночь';
        case 'travel-from': return 'Ночь + выезд';
        case 'plane-to-home': return '✈️ Самолет';
        case 'rest': return 'Отдых';
        case 'sick': return '🟨 Больничный';
        case 'business-trip': return '🧳 Командировка';
        case 'vacation': return '🏖️ Отпуск';
        default: return 'Отдых';
    }
}

// Функция ручного редактирования дня
function editDayManually(date) {
    const dateStr = date.toISOString().split('T')[0];
    const currentStatus = calculateVakhtaStatus(date);
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
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
    
    if (manualOverrides[dateStr]) {
        select.value = manualOverrides[dateStr];
    }
    
    modal.querySelector('#save-edit').addEventListener('click', () => {
        if (select.value === 'auto') {
            delete manualOverrides[dateStr];
        } else {
            manualOverrides[dateStr] = select.value;
        }
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
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Функция сброса всех ручных изменений
function resetManualChanges() {
    if (Object.keys(manualOverrides).length === 0) {
        alert('Нет ручных изменений для сброса');
        return;
    }
    
    if (confirm('Вы уверены, что хотите сбросить ВСЕ ручные изменения? Это действие нельзя отменить.')) {
        manualOverrides = {};
        saveData();
        renderCalendar();
        alert('Все ручные изменения сброшены');
    }
}

// Функция показа статистики
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
                if (isWorkDay(autoStatus)) stats.sick.work++;
                else stats.sick.rest++;
            } else if (status === 'business-trip') {
                stats.businessTrip.total++;
                if (isWorkDay(autoStatus)) stats.businessTrip.work++;
                else stats.businessTrip.rest++;
            } else if (status === 'vacation') {
                stats.vacation.total++;
                if (isWorkDay(autoStatus)) stats.vacation.work++;
                else stats.vacation.rest++;
            }
        }
    });
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 400px;">
            <h3 style="margin-bottom: 15px; text-align: center;">Статистика за ${currentYear} год</h3>
            
            <div style="margin-bottom: 15px;">
                <h4 style="margin-bottom: 10px; color: #f1c40f;">🟨 Больничные:</h4>
                <div style="padding: 10px; background: #fffbf0; border-radius: 5px;">
                    Всего: ${stats.sick.total} дней<br>
                    В рабочие дни: ${stats.sick.work} дней<br>
                    В дни отдыха: ${stats.sick.rest} дней
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <h4 style="margin-bottom: 10px; color: #1abc9c;">🧳 Командировки:</h4>
                <div style="padding: 10px; background: #f0f9f7; border-radius: 5px;">
                    Всего: ${stats.businessTrip.total} дней<br>
                    В рабочие дни: ${stats.businessTrip.work} дней<br>
                    В дни отдыха: ${stats.businessTrip.rest} дней
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <h4 style="margin-bottom: 10px; color: #95a5a6;">🏖️ Отпуск:</h4>
                <div style="padding: 10px; background: #f8f9fa; border-radius: 5px;">
                    Всего: ${stats.vacation.total} дней<br>
                    В рабочие дни: ${stats.vacation.work} дней<br>
                    В дни отдыха: ${stats.vacation.rest} дней
                </div>
            </div>
            
            <button id="close-stats" style="width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 5px;">Закрыть</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#close-stats').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Вспомогательные функции для статистики
function calculateAutoStatus(date) {
    if (!vakhtaStartDate) return 'rest';
    
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    
    const vakhtaStart = new Date(vakhtaStartDate);
    vakhtaStart.setHours(0, 0, 0, 0);
    
    const diffTime = dateStart.getTime() - vakhtaStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const fullCycle = 56;
    const cycleDay = ((diffDays % fullCycle) + fullCycle) % fullCycle;
    
    if (cycleDay === 54) return 'plane-from-home';
    if (cycleDay === 55) return 'train';
    if (cycleDay === 0)  return 'travel-to';
    if (cycleDay === 28) return 'travel-from';
    if (cycleDay === 29) return 'plane-to-home';
    
    if (cycleDay >= 1 && cycleDay <= 14) return 'work-day';
    if (cycleDay >= 15 && cycleDay <= 27) return 'work-night';
    
    return 'rest';
}

function isWorkDay(status) {
    const workStatuses = ['travel-to', 'work-day', 'work-night', 'travel-from'];
    return workStatuses.includes(status);
}

// Функция показа справки
function showHelp() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto;">
            <h3 style="margin-bottom: 15px; text-align: center;">📋 Справка по календарю вахтовика</h3>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color: #3498db; margin-bottom: 10px;">🎯 Основная логика графика</h4>
                <p style="margin-bottom: 8px; line-height: 1.4;">
                    <strong>График 28/28:</strong> 28 дней вахта → 28 дней отдых<br>
                    <strong>Логистика = отдых:</strong> Самолет и поезд считаются днями отдыха<br>
                    <strong>Рабочие дни:</strong> Заезд, дневные/ночные смены, выезд
                </p>
            </div>
         

<!-- ВСТАВИТЬ ЭТОТ НОВЫЙ РАЗДЕЛ СЮДА ↓ -->
<div style="margin-bottom: 20px;">
    <h4 style="color: #3498db; margin-bottom: 10px;">🏝️ Выбор типа графика</h4>
    <p style="margin-bottom: 8px; line-height: 1.4;">
        <strong>Стандартный график:</strong><br>
        • Для вахтовиков, которые летят/едут на объект с материка<br>
        • Включает дни авиаперелета
    </p>
    <p style="margin-bottom: 8px; line-height: 1.4;">
        <strong>График для Сахалина:</strong><br>
        • Для работников, которые уже находятся на Сахалине<br> 
        • Без дней авиаперелета (самолетов)
    </p>
    <p style="margin-bottom: 8px; line-height: 1.4;">
        Активный график подсвечивается зеленым цветом
    </p>
</div>
            
           <div style="margin-bottom: 20px;">
    <h4 style="color: #3498db; margin-bottom: 10px;">🛠️ Управление календарем</h4>
    <div style="margin-bottom: 8px;">
        <strong>"Старт вахты"</strong> - задать дату начала рабочего цикла
    </div>
    <div style="margin-bottom: 8px;">
        <strong>"Сегодня"</strong> - вернуться к текущей дате
    </div>
    <div style="margin-bottom: 8px;">
        <strong>Клик на название месяца/года</strong> - быстрый переход к любой дате
    </div>
    <div style="margin-bottom: 8px;">
        <strong>Стрелки "Мес"/"Год"</strong> - пошаговая навигация
    </div>
    
</div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color: #3498db; margin-bottom: 10px;">✏️ Ручное редактирование</h4>
                <p style="margin-bottom: 8px; line-height: 1.4;">
                    <strong>Двойной клик на любой день</strong> открывает редактор<br>
                    Можно временно изменить статус дня на:<br>
                    • Больничный 🟨<br>
                    • Командировка 🧳<br>
                    • Отпуск 🏖️<br>
                    • Или любой другой статус
                </p>
                <p style="margin-bottom: 8px; line-height: 1.4;">
                    <strong>Ручные изменения:</strong><br>
                    • Подсвечиваются оранжевой рамкой<br>
                    • Не влияют на основной график<br>
                    • Сохраняются автоматически
                </p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color: #3498db; margin-bottom: 10px;">📊 Статистика</h4>
                <p style="margin-bottom: 8px; line-height: 1.4;">
                    Показывает количество дней больничных, командировок и отпуска<br>
                    с разделением на рабочие дни и дни отдыха за текущий год
                </p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color: #3498db; margin-bottom: 10px;">🔄 Сброс изменений</h4>
                <p style="margin-bottom: 8px; line-height: 1.4;">
                    Удаляет ВСЕ ручные изменения. Основной график вахты сохраняется.
                </p>
            </div>
            
            <div style="margin-bottom: 15px;">
                <h4 style="color: #3498db; margin-bottom: 10px;">💾 Сохранение данных</h4>
                <p style="margin-bottom: 8px; line-height: 1.4;">
                    Все настройки автоматически сохраняются в браузере.<br>
                    При повторном открытии календарь восстановит все данные.
                </p>
            </div>
            
            <button id="close-help" style="width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 5px;">Закрыть справку</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#close-help').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Функция выбора месяца и года
function showMonthYearPicker() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
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
        
        const selectedYear = parseInt(yearSelect.value);
        const selectedMonth = parseInt(monthSelect.value);
        
        currentDate.setFullYear(selectedYear, selectedMonth, 1);
        renderCalendar();
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#cancel-picker').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Генерация опций для годов (от -5 до +5 лет от текущего)
function generateYearOptions(currentYear) {
    let options = '';
    const startYear = currentYear - 5;
    const endYear = currentYear + 5;
    
    for (let year = startYear; year <= endYear; year++) {
        const selected = year === currentYear ? 'selected' : '';
        options += `<option value="${year}" ${selected}>${year}</option>`;
    }
    
    return options;
}

// Генерация опций для месяцев
function generateMonthOptions(currentMonth) {
    const months = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    
    let options = '';
    months.forEach((month, index) => {
        const selected = index === currentMonth ? 'selected' : '';
        options += `<option value="${index}" ${selected}>${month}</option>`;
    });
    
    return options;
}

// Функция скрытия самолетов в легенде
function updateLegendVisibility() {
    const planeLegend = document.getElementById('legend-plane');
    if (planeLegend) {
        planeLegend.style.display = isSakhalinMode ? 'none' : 'flex';
    }
}

// Создание элемента дня (общая функция)
function createDayElement(date, isOtherMonth) {
    const dayEl = document.createElement('div');
    
    let dayClasses = ['day'];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime()) {
        dayClasses.push('today');
    }
    
    if (isOtherMonth) {
        dayClasses.push('other-month');
    }
    
    const status = calculateVakhtaStatus(date);
    dayClasses.push(`status-${status}`);
    
    const dateStr = date.toISOString().split('T')[0];
    if (manualOverrides[dateStr]) {
        dayClasses.push('manual-override');
    }
    
    dayEl.className = dayClasses.join(' ');
    
    dayEl.innerHTML = `
        <div class="day-number">${date.getDate()}</div>
        <div class="day-status">${getStatusText(status)}</div>
    `;
    
    dayEl.addEventListener('dblclick', () => {
        editDayManually(date);
    });
    
    return dayEl;
}

// Отрисовка календаря
function renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    const currentMonthEl = document.getElementById('current-month');
    
    while (calendarEl.children.length > 7) {
        calendarEl.removeChild(calendarEl.lastChild);
    }
    
    currentMonthEl.textContent = currentDate.toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric'
    });
    
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    let firstDayOfWeek = firstDay.getDay();
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    
    const prevMonthLastDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, day);
        const dayEl = createDayElement(date, true);
        calendarEl.appendChild(dayEl);
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dayEl = createDayElement(date, false);
        calendarEl.appendChild(dayEl);
    }
    
    const totalCells = 35;
    const daysSoFar = firstDayOfWeek + lastDay.getDate();
    const nextMonthDays = totalCells - daysSoFar;
    
    for (let day = 1; day <= nextMonthDays; day++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, day);
        const dayEl = createDayElement(date, true);
        calendarEl.appendChild(dayEl);
    }
    
    updateLegendVisibility();
}

// Инициализация при загрузке страницы

document.addEventListener('DOMContentLoaded', initCalendar);
