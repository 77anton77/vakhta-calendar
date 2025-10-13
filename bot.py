import telebot
from telebot.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton

# ВАШ ТОКЕН ОТ BOTFATHER (замените на тот, что получите)
BOT_TOKEN = "8315566098:AAEIVhFSbWLkvdRsdRaWrrzwzU_hBlf8X64"

bot = telebot.TeleBot(BOT_TOKEN)

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    # ВАШ РЕАЛЬНЫЙ URL
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
• 📋 График работы 28/28
• 🏝️ Два режима: Стандарт и Сахалин  
• ✏️ Ручное редактирование дней
• 📊 Статистика больничных/отпусков
• 💾 Автосохранение данных

*Как пользоваться:*
1. Нажмите кнопку ниже чтобы открыть календарь
2. Установите дату начала вахты  
3. Двойной клик для редактирования дня
4. Данные сохраняются в вашем браузере
    """
    
    bot.send_message(
        message.chat.id,
        welcome_text,
        reply_markup=keyboard,
        parse_mode='Markdown'
    )

@bot.message_handler(commands=['calendar'])
def open_calendar(message):
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
        "Нажмите кнопку чтобы открыть календарь вахтовика:",
        reply_markup=keyboard
    )

@bot.message_handler(func=lambda message: True)
def echo_all(message):
    bot.reply_to(message, "Напишите /start для открытия календаря")

if __name__ == "__main__":
    print("Бот запущен! Ищите @VakhtaCalendarBot в Telegram")
    bot.polling(none_stop=True)
