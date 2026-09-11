#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

#define OLED_SDA 21
#define OLED_SCL 22

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

const char* ssid = "MyPartner";
const char* password = "12345678";
// Groq API key was removed from the repository for security reasons.
// Set the key at build time or load from a secure source (not committed).
// Example: add -DGROQ_KEY=\"your_key_here\" to compiler flags, or
// store it in a non-committed config file.
const char* groq_key = "<REDACTED_GROQ_KEY>";

WebServer server(80);
String banco_estoque = "[{\"produto\":\"Notebook\", \"qtd\":45}, {\"produto\":\"Monitor\", \"qtd\":120}]";

enum EyeState { STATE_IDLE, STATE_THINKING, STATE_TALKING };
EyeState currentEyeState = STATE_IDLE;

int eyeX = 0, eyeY = 0;
int targetEyeX = 0, targetEyeY = 0;
int blinkFactor = 0;
bool isBlinking = false;

unsigned long lastAnimationFrame = 0;
unsigned long nextBlinkTime = 0;
unsigned long nextLookChange = 0;

String textoRespostaAtual = "";
int marqueeX = 128;            
int marqueeWidth = 0;          
unsigned long lastMarqueeUpdate = 0;
int voltasMarqueeConcluidas = 0;

String limparMarkdownETratarAcentos(String str) {
  str.replace("**", ""); str.replace("*", ""); str.replace("#", "");
  str.replace("`", ""); str.replace("_", ""); str.replace("\n", " ");
  
  str.replace("á", "a"); str.replace("ã", "a"); str.replace("â", "a");
  str.replace("é", "e"); str.replace("ê", "e"); str.replace("í", "i");
  str.replace("ó", "o"); str.replace("õ", "o"); str.replace("ô", "o");
  str.replace("ú", "u"); str.replace("ç", "c");
  return str;
}

void renderSingleEye(int centerX, int centerY, int width, int height, int pupilOffsetX, int pupilOffsetY, int blinkPercent) {
  if (blinkPercent >= 100) return;

  int currentHeight = height * (100 - blinkPercent) / 100;
  int currentY = centerY - (currentHeight / 2);

  display.fillRoundRect(centerX - (width / 2), currentY, width, currentHeight, 8, SSD1306_WHITE);

  if (currentHeight > 10) {
    int px = centerX + pupilOffsetX;
    int py = centerY + pupilOffsetY;
    display.fillCircle(px, py, 5, SSD1306_BLACK);
  }
}

void drawEyeFrame() {
  display.clearDisplay();

  if (eyeX < targetEyeX) eyeX++;
  if (eyeX > targetEyeX) eyeX--;
  if (eyeY < targetEyeY) eyeY++;
  if (eyeY > targetEyeY) eyeY--;

  if (currentEyeState == STATE_THINKING) {
    renderSingleEye(36, 20, 26, 18, 0, -4, blinkFactor);
    renderSingleEye(92, 20, 26, 18, 0, -4, blinkFactor);

    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 48);
    display.print("ANALISANDO DADOS...");

  } else if (currentEyeState == STATE_TALKING) {
    renderSingleEye(36, 18, 26, 26, eyeX, eyeY, blinkFactor);
    renderSingleEye(92, 18, 26, 26, eyeX, eyeY, blinkFactor);

    display.setTextWrap(false);
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(marqueeX, 48);
    display.print(textoRespostaAtual);

    unsigned long now = millis();
    if (now - lastMarqueeUpdate > 30) {
      marqueeX -= 2; 
      lastMarqueeUpdate = now;

      if (marqueeX < -marqueeWidth) {
        marqueeX = 128;
        voltasMarqueeConcluidas++;

        if (voltasMarqueeConcluidas >= 2) {
          currentEyeState = STATE_IDLE;
        }
      }
    }

  } else {
    renderSingleEye(36, 30, 28, 36, eyeX, eyeY, blinkFactor);
    renderSingleEye(92, 30, 28, 36, eyeX, eyeY, blinkFactor);
  }

  display.display();
}

void updateEyeStateEngine() {
  unsigned long now = millis();

  if (now - lastAnimationFrame < 30) return;
  lastAnimationFrame = now;

  if (now > nextBlinkTime && !isBlinking) {
    isBlinking = true;
  }

  if (isBlinking) {
    blinkFactor += 25;
    if (blinkFactor >= 100) {
      blinkFactor = 100;
      isBlinking = false;
      nextBlinkTime = now + random(2000, 6000);
    }
  } else if (blinkFactor > 0) {
    blinkFactor -= 25;
    if (blinkFactor < 0) blinkFactor = 0;
  }

  if (currentEyeState == STATE_IDLE && now > nextLookChange) {
    targetEyeX = random(-6, 7);
    targetEyeY = random(-4, 5);
    nextLookChange = now + random(1500, 4500);
  }

  drawEyeFrame();
}

String executarPerguntaGroq(String pergunta) {
  Serial.printf("\n[SISTEMA] RAM Livre: %d bytes\n", ESP.getFreeHeap());

  currentEyeState = STATE_THINKING;
  drawEyeFrame();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERRO] Wi-Fi desconectado!");
    currentEyeState = STATE_IDLE;
    return "ERRO: WIFI DESCONECTADO";
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setTimeout(20000);

  if (!http.begin(client, "https://api.groq.com/openai/v1/chat/completions")) {
    Serial.println("[ERRO] Falha ao iniciar conexao HTTPS");
    currentEyeState = STATE_IDLE;
    return "ERRO CONEXAO HTTPS";
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + String(groq_key));

  DynamicJsonDocument docGroq(4096);

  docGroq["model"] = "openai/gpt-oss-120b";
  docGroq["max_tokens"] = 300;
  docGroq["reasoning_effort"] = "low";
  docGroq["include_reasoning"] = false;

  JsonArray messages = docGroq.createNestedArray("messages");

  JsonObject sysMsg = messages.createNestedObject();
  sysMsg["role"] = "system";
  sysMsg["content"] =
    "Responda somente com a resposta final. "
    "Nao mostre raciocinio, explicacoes internas ou markdown. "
    "Responda de forma direta e sem acentos. "
    "Estoque atual: " + banco_estoque;

  JsonObject userMsg = messages.createNestedObject();
  userMsg["role"] = "user";
  userMsg["content"] = pergunta;

  String requestBody;
  serializeJson(docGroq, requestBody);

  Serial.println("[GROQ] Enviando pergunta...");
  Serial.println("[GROQ] Request:");
  Serial.println(requestBody);

  int httpResponseCode = http.POST(requestBody);

  Serial.printf("[GROQ] HTTP: %d\n", httpResponseCode);

  String response = http.getString();

  Serial.println("[GROQ] Resposta completa:");
  Serial.println(response);

  http.end();

  if (httpResponseCode != 200) {
    currentEyeState = STATE_IDLE;

    Serial.println("[ERRO GROQ] Corpo do erro:");
    Serial.println(response);

    return "ERRO GROQ HTTP " + String(httpResponseCode);
  }

  DynamicJsonDocument docRes(8192);

  DeserializationError err = deserializeJson(docRes, response);

  if (err) {
    Serial.print("[ERRO PARSER] ");
    Serial.println(err.c_str());

    currentEyeState = STATE_IDLE;
    return "ERRO DESERIALIZAR JSON";
  }

  String respostaRaw = "";

  if (docRes["choices"][0]["message"]["content"].is<String>()) {
    respostaRaw = docRes["choices"][0]["message"]["content"].as<String>();
  }

  Serial.println("[DEBUG] Content:");
  Serial.println(respostaRaw);

  if (respostaRaw.length() == 0) {
    Serial.println("[ERRO] Content veio vazio!");

    if (docRes["choices"][0]["message"]["reasoning"].is<String>()) {
      String reasoning =
        docRes["choices"][0]["message"]["reasoning"].as<String>();

      Serial.println("[DEBUG] Mas existe reasoning:");
      Serial.println(reasoning);
    }

    if (docRes["choices"][0]["finish_reason"].is<String>()) {
      Serial.print("[DEBUG] Finish reason: ");
      Serial.println(
        docRes["choices"][0]["finish_reason"].as<String>()
      );
    }

    currentEyeState = STATE_IDLE;
    return "ERRO CONTEUDO VAZIO";
  }

  String respostaLimpa = limparMarkdownETratarAcentos(respostaRaw);

  Serial.println("[SISTEMA] Resposta Final:");
  Serial.println(respostaLimpa);

  textoRespostaAtual = respostaLimpa;
  marqueeWidth = textoRespostaAtual.length() * 6;
  marqueeX = 128;
  voltasMarqueeConcluidas = 0;
  currentEyeState = STATE_TALKING;

  return respostaLimpa;
}

void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>My Partner ESP32</title>
  <style>
    body { font-family: Arial, sans-serif; background: #181818; color: #fff; text-align: center; padding: 30px; }
    input { padding: 12px; width: 60%; border-radius: 6px; border: 1px solid #444; background: #282828; color: #fff; font-size: 16px; }
    button { padding: 12px 24px; border-radius: 6px; border: none; background: #007bff; color: #fff; font-size: 16px; cursor: pointer; margin-left: 8px; }
    button:hover { background: #0056b3; }
    #r { margin-top: 25px; font-size: 18px; color: #00ffcc; font-weight: bold; line-height: 1.4; }
  </style>
</head>
<body>
  <h1>My Partner ESP32</h1>
  <input id="p" placeholder="Digite sua pergunta...">
  <button onclick="enviar()">Enviar</button>
  <p id="r"></p>
  <script>
    async function enviar(){
      let input = document.getElementById('p');
      let resDiv = document.getElementById('r');
      if(!input.value.trim()) return;
      
      resDiv.innerText = 'Pensando...';
      try {
        let res = await fetch('/api/pergunta', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({pergunta: input.value})
        });
        let d = await res.json();
        resDiv.innerText = d.resposta;
      } catch(e) {
        resDiv.innerText = 'Erro na comunicacao com o ESP32.';
      }
    }
  </script>
</body>
</html>
)rawliteral";
  server.send(200, "text/html", html);
}

void handlePergunta() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

  if (server.method() == HTTP_OPTIONS) {
    server.send(200, "text/plain", "OK");
    return;
  }

  String body = server.arg("plain");
  String pergunta = "";

  if (body.length() > 0) {
    DynamicJsonDocument docReq(512);
    DeserializationError err = deserializeJson(docReq, body);
    if (!err && docReq.containsKey("pergunta")) {
      pergunta = docReq["pergunta"].as<String>();
    }
  }

  if (pergunta.length() == 0) {
    server.send(400, "application/json", "{\"resposta\":\"Pergunta vazia\"}");
    return;
  }

  String resposta = executarPerguntaGroq(pergunta);

  DynamicJsonDocument resFinal(512);
  resFinal["resposta"] = resposta;
  String output;
  serializeJson(resFinal, output);

  server.send(200, "application/json", output);
}

void setup() {
  Serial.begin(115200);

  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERRO] Falha ao inicializar OLED");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(10, 28);
    display.println("Conectando WiFi...");
    display.display();
  }

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[SISTEMA] Conectado ao Wi-Fi!");
  Serial.print("IP da pagina: http://");
  Serial.println(WiFi.localIP());

  server.on("/", HTTP_GET, handleRoot);
  server.on("/favicon.ico", HTTP_GET, []() { server.send(204); });
  server.on("/api/pergunta", HTTP_POST, handlePergunta);
  server.on("/api/pergunta", HTTP_OPTIONS, handlePergunta);

  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
      server.send(200, "text/plain", "OK");
    } else {
      server.send(404, "text/plain", "Rota nao encontrada");
    }
  });

  server.begin();
}

void loop() {
  server.handleClient();
  updateEyeStateEngine();

  if (Serial.available() > 0) {
    String comandoUsuario = Serial.readStringUntil('\n');
    comandoUsuario.trim();

    if (comandoUsuario.length() > 0) {
      Serial.println("\n[USER Serial]: " + comandoUsuario);
      String resposta = executarPerguntaGroq(comandoUsuario);
      Serial.println("[MY PARTNER]: " + resposta);
    }
  }
}