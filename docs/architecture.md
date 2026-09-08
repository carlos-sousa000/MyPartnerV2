# Arquitetura — My Partner

Visão de alto nível dos componentes:

- Firmware (ESP32-S3): conecta via Wi-Fi, captura voz (I2S), envia áudio ao backend e reproduz TTS recebido.
- Backend (FastAPI): pipeline STT (Groq Whisper), LLM (Groq/OpenAI), TTS (ElevenLabs/OpenAI), integra com Firebase (Firestore + Storage) e gerencia webhooks de pagamento.
- Firebase: autenticação (Firebase Auth), Firestore para dados NoSQL, Storage para documentos/receipts.
- Frontend: Next.js dashboard com gráficos em Recharts, chat integrado que exibe respostas da IA e gera componentes visuais quando necessário.
- RAG: indexação vetorial de documentos do usuário (PDFs/NF-e). Vetores podem ser armazenados em Pinecone/Weaviate ou localmente (Faiss).

Fluxos principais:

1. Voz -> ESP32 captura -> POST /api/voice -> STT -> LLM interpreta -> atualiza Firestore (ex: vendas) -> TTS gera áudio -> ESP32 reproduz e exibe texto.
2. Foto NF-e -> Frontend envia /api/ocr -> OCR + LLM extrai itens -> atualiza estoque no Firestore.
3. Webhooks de pagamento -> /api/webhook/stripe -> atualiza assinaturas e limitações por plano.
