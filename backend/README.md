# My Partner — Backend

FastAPI backend scaffold for My Partner.

Run locally:

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Set environment variables:

- `FIREBASE_CRED_JSON` -> path to Firebase service account JSON
- `FIREBASE_STORAGE_BUCKET` -> storage bucket name

Endpoints:

- `POST /api/voice` (multipart file) -> transcribe, optional Firestore write, returns text + audio_base64
- Voice and OCR uploads are temporary: the backend processes them and deletes them after transcription/OCR. Firebase Storage is not required.
- `GET /api/dashboard` -> stock and financial totals from local SQLite
- `GET /api/empresa?company_id=1` -> current company profile
- `POST /api/empresas` -> create a local company tenant
- `POST /api/estoque/movimentar?company_id=1` -> confirmed stock entry/exit target
- `POST /api/financeiro/lancar?company_id=1` -> add a finance period
- `POST /api/ocr` (multipart image) -> local OCR when Tesseract is installed
- `POST /api/rag/search` -> compatibility route backed by the SQLite-aware assistant
- `POST /api/webhook/stripe` -> payment webhook (stub)

No file storage is enabled in this version. If permanent documents are needed
later, add a storage provider as a separate module; it is not required for the
current product flow.

The free browser TTS is handled by `window.speechSynthesis` in the Next.js
frontend. ElevenLabs is optional and only affects audio returned by the
backend voice endpoint.

For cloud mode, set `USE_FIRESTORE=true` and `REQUIRE_AUTH=true`. Provide the
full Firebase service-account JSON as `FIREBASE_CRED_JSON` in the platform's
secret manager. It can be a JSON string; no Storage bucket is required.
