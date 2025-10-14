import telebot
from telebot.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
import time

BOT_TOKEN = "8315566098:AAEIVhFSbWLkvdRsdRaWrrzwzU_hBlf8X64"
YOUR_USER_ID = 5160108515

bot = telebot.TeleBot(BOT_TOKEN)

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    web_app = WebAppInfo("https://77anton77.github.io/vakhta-calendar/")
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("📅 Открыть календарь", web_app=web_app))
    
    bot.send_message(message.chat.id, "🗓️ Календарь вахтовика", reply_markup=keyboard)

@bot.message_handler(commands=['feedback'])
def get_feedback(message):
    feedback_text = message.text.replace('/feedback', '').strip()
    if feedback_text:
        bot.send_message(YOUR_USER_ID, f"Фидбек: {feedback_text}")
        bot.reply_to(message, "✅ Спасибо!")
    else:
        bot.reply_to(message, "Напишите: /feedback ваш_текст")

@bot.message_handler(func=lambda message: True)
def echo_all(message):
    bot.reply_to(message, "Напишите /start")

if __name__ == "__main__":
    print("🤖 Бот запущен!")
    while True:
        try:
            bot.infinity_polling()
        except Exception as e:
            print(f"Ошибка: {e}")
            time.sleep(10)
