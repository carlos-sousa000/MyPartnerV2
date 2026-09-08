# Esquema elétrico (pin a pin) — ESP32-S3 DevKit

Resumo de conexões para `ESP32-S3` com os periféricos do projeto:

- OLED SSD1306 (I2C 128x64):
  - SDA -> GPIO 8
  - SCL -> GPIO 9
  - VCC -> 3.3V
  - GND -> GND

- Microfone I2S (INMP441):
  - BCLK -> GPIO 1 (I2S_BCK) (exemplo, verificar placa)
  - LRCL -> GPIO 2 (I2S_WS)
  - DOUT -> GPIO 3 (I2S_DATA_IN)
  - VCC -> 3.3V
  - GND -> GND

- Amplificador I2S (MAX98357A):
  - DIN -> GPIO 4 (I2S_DATA_OUT)
  - BCLK -> GPIO 1 (I2S_BCK)
  - LRC -> GPIO 2 (I2S_WS)
  - VIN -> 5V (ou 3.3V dependendo do módulo)
  - GND -> GND

- Botões / LEDs (opcionais):
  - Botão gravação -> GPIO 0 (pulled-up)
  - LED status -> GPIO 5

Observações:

- Os números de pino I2S são exemplos; consulte o datasheet do seu DevKit ESP32-S3.
- Use capacitores e layout de alimentação apropriado para o amplifier e microfone.
- Não conectar alto-falante diretamente no ESP32; sempre usar um amplificador.
