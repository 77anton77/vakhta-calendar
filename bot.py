import sys
import os
import locale

# Устанавливаем русскую локаль
try:
    locale.setlocale(locale.LC_ALL, 'ru_RU.UTF-8')
except:
    try:
        locale.setlocale(locale.LC_ALL, 'Russian_Russia.1251')
    except:
        pass

sys.stdout.reconfigure(encoding='utf-8')

import telebot
from flask import Flask, request
from telebot.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton

app = Flask(__name__)

# Конфигурация бота
BOT_TOKEN = os.environ.get('BOT_TOKEN', '8315566098:AAEIVhFSbWLkvdRsdRaWrrzwzU_hBlf8X64')
YOUR_USER_ID = 5160108515

bot = telebot.TeleBot(BOT_TOKEN)

# ⭐ СОЗДАЕМ ПРОСТЫЕ КНОПКИ ПОД ПОЛЕМ ВВОДА
def create_main_keyboard():
    keyboard = ReplyKeyboardMarkup(resize_keyboard=True)
    keyboard.row(KeyboardButton("📅 ОТКРЫТЬ КАЛЕНДАРЬ"))
    keyboard.row(KeyboardButton("❓ Помощь"), KeyboardButton("📊 Статистика"))
    return keyboard

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    web_app = WebAppInfo("https://77anton77.github.io/vakhta-calendar/")
    
    # Инлайн кнопка в сообщении
    inline_keyboard = InlineKeyboardMarkup()
    inline_keyboard.add(
        InlineKeyboardButton(
            "📅 Нажмите чтобы открыть календарь", 
            web_app=web_app
        )
    )
    
    welcome_text = """
🗓️ *Добро пожаловать в календарь вахтовика!*

*Основные возможности:*
• График работы 28/28
• Два режима: Стандарт и Сахалин  
• Ручное редактирование дней
• Статистика больничных/отпусков
• Автосохранение данных

*Используйте кнопку «📅 ОТКРЫТЬ КАЛЕНДАРЬ» ниже для быстрого доступа!*
"""
    
    # Отправляем сообщение с инлайн кнопкой
    bot.send_message(
        message.chat.id,
        welcome_text,
        reply_markup=inline_keyboard,
        parse_mode='Markdown'
    )
    
    # Отправляем клавиатуру с кнопками
    bot.send_message(
        message.chat.id,
        "👇 *Быстрый доступ:*",
        reply_markup=create_main_keyboard(),
        parse_mode='Markdown'
    )

# ⭐ ОБРАБОТЧИКИ ДЛЯ КНОПОК
@bot.message_handler(func=lambda message: message.text == "📅 ОТКРЫТЬ КАЛЕНДАРЬ")
def open_calendar_button(message):
    web_app = WebAppInfo("https://77anton77.github.io/vakhta-calendar/")
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(
        InlineKeyboardButton(
            "📅 Нажмите чтобы открыть календарь", 
            web_app=web_app
        )
    )
    
    bot.send_message(
        message.chat.id,
        "🔄 Открываю календарь вахтовика...",
        reply_markup=keyboard
    )

@bot.message_handler(func=lambda message: message.text == "❓ Помощь")
def help_button(message):
    help_text = """
*❓ Справка по календарю*

*Как пользоваться:*
1. Нажмите «📅 ОТКРЫТЬ КАЛЕНДАРЬ»
2. В календаре нажмите «Старт вахты»
3. Выберите дату начала вахты
4. Календарь построит график 28/28 автоматически

*Функции:*
• Стандарт/Сахалин - режимы работы
• Клик по дню - изменить тип дня
• Статистика - просмотр статистики
"""
    bot.send_message(message.chat.id, help_text, parse_mode='Markdown')

@bot.message_handler(func=lambda message: message.text == "📊 Статистика")
def stats_button(message):
    web_app = WebAppInfo("https://77anton77.github.io/vakhta-calendar/")
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(
        InlineKeyboardButton(
            "📅 Открыть календарь для просмотра статистики", 
            web_app=web_app
        )
    )
    
    bot.send_message(
        message.chat.id,
        "📊 Статистика доступна в веб-версии календаря:",
        reply_markup=keyboard
    )

@bot.message_handler(commands=['calendar'])
def calendar_command(message):
    web_app = WebAppInfo("https://77anton77.github.io/vakhta-calendar/")
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(
        InlineKeyboardButton(
            "📅 Открыть календарь", 
            web_app=web_app
        )
    )
    
    bot.send_message(
        message.chat.id,
        "Нажмите кнопку чтобы открыть календарь:",
        reply_markup=keyboard
    )

@bot.message_handler(commands=['feedback'])
def feedback_command(message):
    feedback_text = message.text.replace('/feedback', '').strip()
    
    if not feedback_text:
        bot.reply_to(message, "Напишите: /feedback ваш_текст")
        return
    
    user_info = f"Пользователь: {message.from_user.first_name} (@{message.from_user.username})" if message.from_user.username else f"Пользователь: {message.from_user.first_name}"
    
    bot.send_message(
        YOUR_USER_ID, 
        f"📝 Фидбек:\n{user_info}\nID: {message.from_user.id}\n\n{feedback_text}"
    )
    bot.reply_to(message, "✅ Спасибо! Сообщение отправлено.")

# Обработка любых других сообщений
@bot.message_handler(func=lambda message: True)
def other_messages(message):
    bot.send_message(
        message.chat.id, 
        "Используйте кнопку «📅 ОТКРЫТЬ КАЛЕНДАРЬ» ниже 👇",
        reply_markup=create_main_keyboard()
    )

# Flask endpoints
@app.route('/')
def home():
    return "🤖 Бот работает! 🚀", 200

@app.route('/health')
def health():
    return "✅ OK", 200

@app.route('/webhook/' + BOT_TOKEN, methods=['POST'])
def webhook():
    if request.headers.get('content-type') == 'application/json':
        json_string = request.get_data().decode('utf-8')
        update = telebot.types.Update.de_json(json_string)
        bot.process_new_updates([update])
        return 'OK', 200
    return 'Forbidden', 403

if __name__ == "__main__":
    print("🤖 Запуск бота...")
    
    try:
        bot.remove_webhook()
        bot.set_webhook(url=f'https://vakhta-bot.fly.dev/webhook/{BOT_TOKEN}')
        print("✅ Webhook установлен")
    except Exception as e:
        print(f"⚠️ Ошибка webhook: {e}")
    
    print("🚀 Бот запущен!")
    app.run(host='0.0.0.0', port=8080, debug=False)
