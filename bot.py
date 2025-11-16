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

# Устанавливаем кодировку для вывода
sys.stdout.reconfigure(encoding='utf-8')

import telebot
from flask import Flask, request
from telebot.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton, BotCommand

app = Flask(__name__)

# Конфигурация бота
BOT_TOKEN = os.environ.get('BOT_TOKEN', '8315566098:AAEIVhFSbWLkvdRsdRaWrrzwzU_hBlf8X64')
YOUR_USER_ID = 5160108515

bot = telebot.TeleBot(BOT_TOKEN)

# ⭐ НАСТРОЙКА КОМАНД БОТА (появится в меню слева от поля ввода)
def setup_bot_commands():
    try:
        commands = [
            BotCommand('start', 'Запустить бота'),
            BotCommand('calendar', 'Открыть календарь'),
            BotCommand('feedback', 'Обратная связь')
        ]
        bot.set_my_commands(commands)
        print("✅ Команды бота установлены")
        return True
    except Exception as e:
        print(f"❌ Ошибка установки команд: {e}")
        return False

# Устанавливаем команды при запуске
commands_setup_result = setup_bot_commands()

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    web_app = WebAppInfo("https://77anton77.github.io/vakhta-calendar/")
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(
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

*Доступ к календарю:*
• Кнопка ниже ⬇️
• Команда /calendar
• Иконка меню слева от поля ввода 📱
"""
    
    bot.send_message(
        message.chat.id,
        welcome_text,
        reply_markup=keyboard,
        parse_mode='Markdown',
        disable_web_page_preview=True
    )

@bot.message_handler(commands=['calendar'])
def quick_calendar(message):
    """Быстрый доступ к календарю"""
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
    """Обратная связь"""
    feedback_text = message.text.replace('/feedback', '').strip()
    
    user_info = f"Пользователь: {message.from_user.first_name}"
    if message.from_user.username:
        user_info += f" (@{message.from_user.username})"
    
    if not feedback_text:
        bot.reply_to(
            message,
            "📝 *Отправьте обратную связь*\n\n"
            "Напишите сообщение об ошибке или предложении:\n"
            "`/feedback ваш текст здесь`\n\n"
            "_Пример:_ /feedback не работает кнопка 'Старт вахты'",
            parse_mode='Markdown'
        )
        return
    
    bot.send_message(
        YOUR_USER_ID, 
        f"📝 Новый фидбек:\n{user_info}\nID: {message.from_user.id}\n\nСообщение: {feedback_text}"
    )
    bot.reply_to(message, "✅ Спасибо за обратную связь! Сообщение отправлено разработчику.")

@bot.message_handler(commands=['setup_commands'])
def setup_commands_manual(message):
    """Принудительная установка команд"""
    if message.from_user.id == YOUR_USER_ID:
        result = setup_bot_commands()
        if result:
            bot.reply_to(message, "✅ Команды бота установлены принудительно")
        else:
            bot.reply_to(message, "❌ Ошибка установки команд")
    else:
        bot.reply_to(message, "Эта команда только для разработчика")

@bot.message_handler(func=lambda message: True)
def echo_all(message):
    """Обработка любых других сообщений"""
    bot.reply_to(message, "Напишите /start для открытия календаря")

# Flask endpoints для health checks и webhook
@app.route('/')
def health_check():
    commands_status = "✅" if commands_setup_result else "❌"
    return f"🤖 Бот вахтового календаря работает! Команды: {commands_status} 🚀", 200

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
    print(f"🤖 Статус команд бота: {'✅ Установлены' if commands_setup_result else '❌ Не установлены'}")
    
    # Автоматически настраиваем webhook при запуске
    try:
        print("🔄 Настраиваю webhook...")
        app_url = os.environ.get('FLY_APP_NAME', 'vakhta-bot.fly.dev')
        webhook_url = f'https://{app_url}/webhook/{BOT_TOKEN}'
        
        # Удаляем старый webhook
        bot.remove_webhook()
        
        # Устанавливаем новый webhook
        bot.set_webhook(url=webhook_url)
        
        print(f"✅ Webhook установлен: {webhook_url}")
    except Exception as e:
        print(f"⚠️ Ошибка настройки webhook: {e}")
        print("🔄 Продолжаю запуск...")
    
    print("🤖 Бот запущен в режиме Webhook! 🚀")
    print("📡 Flask сервер запущен на порту 8080")
    
    # Запускаем Flask сервер (бот работает через webhook)
    app.run(host='0.0.0.0', port=8080, debug=False)
