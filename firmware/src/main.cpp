#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// Note: This firmware is a focused, documented scaffold for ESP32-S3.
// It shows OLED idle animation, connects to Wi-Fi, and demonstrates
// sending recorded audio to backend. Actual I2S microphone capture
// and playback implementations are indicated as placeholders.

// --- Config
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define SDA_PIN 8
#define SCL_PIN 9

// Replace with your network and backend
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASS";
const char* backend_url = "http://YOUR_BACKEND_IP:8000/api/voice"; // POST audio

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

unsigned long lastAnim = 0;
int animFrame = 0;

void setupWiFi() {
  WiFi.begin(ssid, password);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
    for(;;);
  }
  display.clearDisplay();

  setupWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected");
  } else {
    Serial.println("WiFi not connected");
  }

  // Initialize I2S microphone and speaker here (placeholder)
  // e.g. i2s_driver_install(), set_pin(), i2s_read(), etc.
}

void drawIdleFace(int frame) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  // Simple two-frame blinking face and looking
  display.setCursor(32, 8);
  display.setTextSize(1);
  if (frame % 4 < 2) {
    display.println("( ^_^)  My Partner");
  } else {
    display.println("( o_o)  My Partner");
  }
  display.display();
}

// Placeholder: simulate capturing audio and returning buffer
// In a real implementation, capture from I2S microphone, encode as WAV/PCM
bool captureAudioToBuffer(String &mimeType, std::vector<uint8_t> &buf) {
  // For demo, we simulate a small buffer
  mimeType = "audio/wav";
  const char *demo = "RIFF....WAVEfmt ";
  buf.assign(demo, demo + strlen(demo));
  return true;
}

bool postAudioAndHandleResponse(const String &backend, const String &mimeType, const std::vector<uint8_t> &buf) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.begin(backend);
  http.addHeader("Content-Type", mimeType);
  int httpCode = http.POST((uint8_t*)buf.data(), buf.size());
  if (httpCode > 0) {
    String payload = http.getString();
    Serial.printf("Response %d: %s\n", httpCode, payload.c_str());
    // Expect JSON: { "text": "...", "audio_base64": "..." }
    // Very small parser for `text` field
    int tpos = payload.indexOf("\"text\"");
    if (tpos > 0) {
      int col = payload.indexOf(':', tpos);
      int q1 = payload.indexOf('"', col);
      int q2 = payload.indexOf('"', q1+1);
      if (q1>0 && q2>q1) {
        String text = payload.substring(q1+1, q2);
        // Normalize accents to ASCII: simple replacement example
        text.replace("á","a"); text.replace("é","e"); text.replace("í","i"); text.replace("ó","o"); text.replace("ú","u");
        // Draw single-line scrolling text at Y=28
        display.clearDisplay();
        display.setTextSize(1);
        display.setCursor(0,28);
        display.println(text);
        display.display();
      }
    }
    // For audio_base64, you would decode and send to I2S DAC for playback.
    http.end();
    return true;
  } else {
    Serial.printf("HTTP POST failed: %s\n", http.errorToString(httpCode).c_str());
    http.end();
    return false;
  }
}

void loop() {
  // Idle animation
  if (millis() - lastAnim > 500) {
    animFrame++;
    drawIdleFace(animFrame);
    lastAnim = millis();
  }

  // Placeholder: check a button or voice activity detector to start capture
  // For demo, we'll trigger capture if Serial input received
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 'r') {
      Serial.println("Capturing audio (simulated)...");
      String mime;
      std::vector<uint8_t> buf;
      if (captureAudioToBuffer(mime, buf)) {
        postAudioAndHandleResponse(String(backend_url), mime, buf);
      }
    }
  }
}
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_SDA 8
#define OLED_SCL 9

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Para Wokwi use: http://host.wokwi.internal:8000/api/pergunta
// Para ESP32 Físico use o IP do seu PC na rede local: http://192.168.x.x:8000/api/pergunta
const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* backend_url = "http://host.wokwi.internal:8000/api/pergunta";

bool processando = false;
unsigned long ultimoTempoAnimacao = 0;
int frameAnimacao = 0;

void desenharCarinhaAnimada();
void exibirTextoUmaLinha(String texto);
String limparMarkdownETratarAcentos(String str);
void enviarParaBackend(String pergunta);

void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(OLED_SDA, OLED_SCL);
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERRO] Falha OLED");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(10, 28);
    display.println("Conectando WiFi...");
    display.display();
  }

  // Define modo Estação obrigatoriamente para o Wokwi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 30) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[SISTEMA] Conectado ao Wi-Fi com sucesso!");
    Serial.println(">>> Digite sua pergunta no Monitor Serial e aperte ENTER <<<");
    exibirTextoUmaLinha("SISTEMA PRONTO");
  } else {
    Serial.println("\n[ERRO] Falha de conexao Wi-Fi no Wokwi.");
    exibirTextoUmaLinha("ERRO CONEXAO WIFI");
  }
}

void loop() {
  if (!processando) {
    if (millis() - ultimoTempoAnimacao > 400) {
      ultimoTempoAnimacao = millis();
      desenharCarinhaAnimada();
    }
  }

  if (Serial.available() > 0) {
    String comandoUsuario = Serial.readStringUntil('\n');
    comandoUsuario.trim();

    if (comandoUsuario.length() > 0) {
      processando = true;
      exibirTextoUmaLinha("ANALISANDO DADOS...");
      enviarParaBackend(comandoUsuario);
      processando = false;
    }
  }
}

void desenharCarinhaAnimada() {
  display.clearDisplay();
  
  int eyeX_Offset = 0;
  bool piscar = false;

  frameAnimacao = (frameAnimacao + 1) % 10;
  if (frameAnimacao == 3) piscar = true;
  if (frameAnimacao == 6) eyeX_Offset = -5;
  if (frameAnimacao == 8) eyeX_Offset = 5;

  if (piscar) {
    display.drawLine(35, 25, 49, 25, SSD1306_WHITE);
    display.drawLine(79, 25, 93, 25, SSD1306_WHITE);
  } else {
    display.fillCircle(42 + eyeX_Offset, 25, 6, SSD1306_WHITE);
    display.fillCircle(86 + eyeX_Offset, 25, 6, SSD1306_WHITE);
  }

  display.drawCircleHelper(64, 38, 16, 4, SSD1306_WHITE);
  display.drawCircleHelper(64, 38, 16, 8, SSD1306_WHITE);
  display.drawLine(48, 38, 80, 38, SSD1306_WHITE);
  display.display();
}

String limparMarkdownETratarAcentos(String str) {
  str.replace("**", ""); str.replace("*", ""); str.replace("#", "");
  str.replace("`", ""); str.replace("_", ""); str.replace("\n", " ");
  
  str.replace("á", "a"); str.replace("ã", "a"); str.replace("â", "a");
  str.replace("é", "e"); str.replace("ê", "e"); str.replace("í", "i");
  str.replace("ó", "o"); str.replace("õ", "o"); str.replace("ô", "o");
  str.replace("ú", "u"); str.replace("ç", "c");
  return str;
}

void exibirTextoUmaLinha(String texto) {
  texto = limparMarkdownETratarAcentos(texto);
  display.setTextWrap(false);
  int textWidth = texto.length() * 6;

  if (texto.length() <= 20) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 28);
    display.print(texto);
    display.display();
    delay(3000);
  } else {
    for (int x = 128; x >= -textWidth; x -= 2) {
      display.clearDisplay();
      display.setTextSize(1);
      display.setCursor(x, 28);
      display.print(texto);
      display.display();
      delay(25);
    }
  }
}

void enviarParaBackend(String pergunta) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(backend_url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(12000);

    pergunta.replace("\"", "\\\"");
    String jsonPayload = "{\"pergunta\": \"" + pergunta + "\"}";

    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode == 200) {
      String response = http.getString();
      int inicioTexto = response.indexOf("\"resposta\":\"");
      if (inicioTexto != -1) {
        inicioTexto += 12;
        int fimTexto = response.indexOf("\"", inicioTexto);
        if (fimTexto != -1) {
          String respostaFinal = response.substring(inicioTexto, fimTexto);
          Serial.println("\n[MY PARTNER]: " + respostaFinal);
          exibirTextoUmaLinha(respostaFinal);
        }
      }
    } else {
      Serial.print("[ERRO HTTP]: ");
      Serial.println(httpResponseCode);
      exibirTextoUmaLinha("ERRO HTTP " + String(httpResponseCode));
    }
    http.end();
  }
}