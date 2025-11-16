import telebot
from telebot.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton

BOT_TOKEN = '8315566098:AAEIVhFSbWLkvdRsdRaWrrzwzU_hBlf8X64'
bot = telebot.TeleBot(BOT_TOKEN)

def get_main_keyboard():
    keyboard = ReplyKeyboardMarkup(resize_keyboard=True)
    keyboard.add(KeyboardButton("📅 ОТКРЫТЬ КАЛЕНДАРЬ"))
    keyboard.add(KeyboardButton("❓ Помощь"), KeyboardButton("📊 Статистика"))
    return keyboard

@bot.message_handler(commands=['start'])
def start_command(message):
    # Инлайн кнопка
    inline_kb = InlineKeyboardMarkup()
    inline_kb.add(InlineKeyboardButton(
        "📅 Открыть календарь", 
        web_app=WebAppInfo(url="https://77anton77.github.io/vakhta-calendar/")
    ))
    
    bot.send_message(
        message.chat.id,
        "Тестируем кнопки...",
        reply_markup=inline_kb
    )
    
    # Обычные кнопки под полем ввода
    bot.send_message(
        message.chat.id,
        "Постоянные кнопки:",
        reply_markup=get_main_keyboard()
    )

@bot.message_handler(func=lambda message: message.text == "📅 ОТКРЫТЬ КАЛЕНДАРЬ")
def open_calendar(message):
    inline_kb = InlineKeyboardMarkup()
    inline_kb.add(InlineKeyboardButton(
        "📅 Нажми чтобы открыть", 
        web_app=WebAppInfo(url="https://77anton77.github.io/vakhta-calendar/")
    ))
    bot.send_message(message.chat.id, "Открываем...", reply_markup=inline_kb)

print("🤖 Бот запущен в режиме polling...")
bot.polling(none_stop=True)
