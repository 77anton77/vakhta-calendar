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

# ⭐ ПРОСТОЕ МЕНЮ С КНОПКАМИ ПОД ПОЛЕМ ВВОДА
def create_main_keyboard():
    keyboard = ReplyKeyboardMarkup(resize_keyboard=True)
    keyboard.add(KeyboardButton("📅 Открыть календарь"))
    keyboard.add(KeyboardButton("ℹ️ Помощь"), KeyboardButton("📊 Статистика"))
    return keyboard

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    web_app = WebAppInfo("https://77anton77.github.io/vakhta-calendar/")
    
    # Инлайн кнопка в сообщении
    inline_keyboard = InlineKeyboardMarkup()
    inline_keyboard.add(
        InlineKeyboardButton(
            "📅 Открыть календарь вахтовика", 
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

*Откройте календарь одной из кнопок ниже:*
"""
    
    # Отправляем сообщение с инлайн кнопкой И обычной клавиатурой
    bot.send_message(
        message.chat.id,
        welcome_text,
        reply_markup=inline_keyboard,
        parse_mode='Markdown',
        disable_web_page_preview=True
    )
    
    # Отправляем отдельное сообщение с постоянными кнопками
    bot.send_message(
        message.chat.id,
        "📱 *Быстрый доступ к функциям:*",
        reply_markup=create_main_keyboard(),
        parse_mode='Markdown'
    )

@bot.message_handler(func=lambda message: message.text == "📅 Открыть календарь")
def open_calendar_from_button(message):
    """Обработка нажатия на кнопку 'Открыть календарь'"""
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
        "Открываю календарь вахтовика...",
        reply_markup=keyboard
    )

@bot.message_handler(func=lambda message: message.text == "ℹ️ Помощь")
def show_help(message):
    help_text = """
*📋 Справка по календарю вахтовика*

*Основные функции:*
• *Стандарт/Сахалин* - выбор режима работы
• *Старт вахты* - установка даты начала вахты
• *Статистика* - просмотр статистики
• *Сбросить изменения* - вернуть исходные настройки

*Как пользоваться:*
1. Нажмите 'Старт вахты' и выберите дату
2. Календарь автоматически построит график 28/28
3. Меняйте тип дней кликом по датам
"""
    bot.send_message(message.chat.id, help_text, parse_mode='Markdown')

@bot.message_handler(func=lambda message: message.text == "📊 Статистика")
def show_stats_info(message):
    bot.send_message(message.chat.id, "📊 Статистика доступна в веб-версии календаря. Нажмите '📅 Открыть календарь' и затем кнопку 'Статистика'.")

@bot.message_handler(commands=['calendar'])
def quick_calendar(message):
    web_app = WebAppInfo("https://77anton77.github.io/vakhta-calendar/")
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(
        InlineKeyboardButton(
            "📅 Открыть календарь вахтовика", 
            web_app=web_app
        )
    )
    
    bot.send_message(
        message.chat.id,
        "Нажмите кнопку чтобы открыть календарь вахтовика:",
        reply_markup=keyboard
    )

@bot.message_handler(commands=['feedback'])
def get_feedback(message):
    feedback_text = message.text.replace('/feedback', '').strip()
    
    if not feedback_text:
        bot.reply_to(
            message,
            "📝 *Отправьте обратную связь*\n\n"
            "Напишите сообщение об ошибке или предложении:\n"
            "`/feedback ваш текст здесь`",
            parse_mode='Markdown'
        )
        return
    
    user_info = f"Пользователь: {message.from_user.first_name}"
    if message.from_user.username:
        user_info += f" (@{message.from_user.username})"
    
    bot.send_message(
        YOUR_USER_ID, 
        f"📝 Новый фидбек:\n{user_info}\nID: {message.from_user.id}\n\nСообщение: {feedback_text}"
    )
    bot.reply_to(message, "✅ Спасибо за обратную связь! Сообщение отправлено разработчику.")

@bot.message_handler(func=lambda message: True)
def echo_all(message):
    bot.send_message(
        message.chat.id, 
        "Напишите /start для открытия календаря\nИли используйте кнопки ниже:",
        reply_markup=create_main_keyboard()
    )

# Flask endpoints
@app.route('/')
def health_check():
    return "🤖 Бот вахтового календаря работает! 🚀", 200

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
    print("🤖 Бот запускается...")
    
    try:
        app_url = os.environ.get('FLY_APP_NAME', 'vakhta-bot.fly.dev')
        webhook_url = f'https://{app_url}/webhook/{BOT_TOKEN}'
        bot.remove_webhook()
        bot.set_webhook(url=webhook_url)
        print(f"✅ Webhook установлен: {webhook_url}")
    except Exception as e:
        print(f"⚠️ Ошибка webhook: {e}")
    
    print("🤖 Бот запущен! 🚀")
    app.run(host='0.0.0.0', port=8080, debug=False)
