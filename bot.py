from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'Bot is running!')
    
    def log_message(self, format, *args):
        pass  # Отключаем логи

def run_http_server():
    server = HTTPServer(('0.0.0.0', 10000), SimpleHandler)
    server.serve_forever()

if __name__ == "__main__":
    print("Бот запущен на Render! 🚀")
    
    # Запускаем HTTP сервер в отдельном потоке
    http_thread = threading.Thread(target=run_http_server)
    http_thread.daemon = True
    http_thread.start()
    
    # Запускаем бота
    bot.infinity_polling()
