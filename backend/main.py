import os
import io
import json
import re
import base64
import sqlite3
import time
from pathlib import Path
import tempfile
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import firebase_admin
from firebase_admin import auth, credentials, firestore
import uvicorn


load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app = FastAPI(title="My Partner Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Firebase init (optional)
FIREBASE_CRED = os.getenv('FIREBASE_CRED_JSON')
if FIREBASE_CRED and os.path.exists(FIREBASE_CRED):
    cred = credentials.Certificate(FIREBASE_CRED)
elif FIREBASE_CRED and FIREBASE_CRED.lstrip().startswith("{"):
    cred = credentials.Certificate(json.loads(FIREBASE_CRED))
else:
    cred = None

if cred:
    firebase_options = {}
    storage_bucket = os.getenv('FIREBASE_STORAGE_BUCKET')
    if storage_bucket:
        firebase_options['storageBucket'] = storage_bucket
    firebase_admin.initialize_app(cred, firebase_options)
    db = firestore.client()
else:
    db = None

USE_FIRESTORE = os.getenv("USE_FIRESTORE", "false").lower() == "true" and db is not None
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "false").lower() == "true"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY não configurada. Defina-a em backend/.env ou nas variáveis do deploy.")
client = Groq(api_key=GROQ_API_KEY)

DB_PATH = os.path.join(os.path.dirname(__file__), "empresa.db")
DEFAULT_COMPANY_ID = int(os.getenv("DEFAULT_COMPANY_ID", "1"))


def ensure_local_schema():
    """Create the local multi-company schema and migrate the demo database."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS empresas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                segmento TEXT NOT NULL DEFAULT '',
                criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        if not conn.execute("SELECT 1 FROM empresas WHERE id = ?", (DEFAULT_COMPANY_ID,)).fetchone():
            conn.execute(
                "INSERT INTO empresas (id, nome, segmento) VALUES (?, ?, ?)",
                (DEFAULT_COMPANY_ID, "Minha Empresa", "Negócios")
            )

        conn.execute("""
            CREATE TABLE IF NOT EXISTS financeiro (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mes TEXT NOT NULL,
                faturamento REAL NOT NULL DEFAULT 0,
                despesas REAL NOT NULL DEFAULT 0,
                lucro REAL NOT NULL DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS estoque (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                produto TEXT NOT NULL,
                quantidade INTEGER NOT NULL DEFAULT 0,
                preco_unitario REAL NOT NULL DEFAULT 0
            )
        """)

        for table in ("estoque", "financeiro"):
            columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
            if "empresa_id" not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN empresa_id INTEGER")
                conn.execute(f"UPDATE {table} SET empresa_id = ? WHERE empresa_id IS NULL", (DEFAULT_COMPANY_ID,))
        conn.commit()


ensure_local_schema()


def verify_identity(authorization: Optional[str]) -> Optional[dict]:
    if not authorization:
        if REQUIRE_AUTH:
            raise HTTPException(status_code=401, detail="Login obrigatório")
        return None
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    if not firebase_admin._apps:
        # If the server requires authentication, failing to have Firebase admin
        # configured is a real server-side error. Otherwise log a warning and
        # continue treating the request as unauthenticated.
        if REQUIRE_AUTH:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Firebase Auth não configurado. Defina FIREBASE_CRED_JSON "
                    "no ambiente do backend ou ajuste REQUIRE_AUTH para false."
                ),
            )
        else:
            print("[WARN] Authorization header received but Firebase Admin is not configured; proceeding without verification.")
            return None
    try:
        return auth.verify_id_token(authorization.split(" ", 1)[1])
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Sessão inválida: {exc}")


def company_document(company_id: int):
    return db.collection("empresas").document(str(company_id))


def resolve_company_id(company_id: int, authorization: Optional[str]) -> int:
    identity = verify_identity(authorization)
    if not identity:
        return company_id
    claimed_company = identity.get("company_id")
    if claimed_company is None and db:
        user = db.collection("usuarios").document(identity["uid"]).get()
        if user.exists:
            claimed_company = user.to_dict().get("empresa_id")
    if claimed_company is None:
        raise HTTPException(status_code=403, detail="Usuário sem empresa vinculada")
    return int(claimed_company)


async def save_upload(upload: UploadFile, company_id: int) -> Path:
    """Store one upload temporarily; no Firebase Storage bucket is required."""
    get_company(company_id)
    extension = Path(upload.filename or "arquivo.bin").suffix.lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temporary_file:
        temporary_file.write(await upload.read())
        return Path(temporary_file.name)


def call_groq_whisper(audio_path: str, model: str = "whisper-large-v3-turbo") -> str:
    """Send audio file to Groq Speech/Whisper endpoint using HTTP multipart.

    Returns the transcribed text or raises an exception on failure.
    This uses the GROQ_API_KEY present in the environment or the hardcoded key.
    """
    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
    try:
        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "application/octet-stream")}
            data = {"model": model}
            resp = requests.post(url, headers=headers, files=files, data=data, timeout=60)
        resp.raise_for_status()
        j = resp.json()
        # Attempt common keys
        if isinstance(j, dict):
            if 'text' in j:
                return j['text']
            if 'transcription' in j:
                return j['transcription']
            # Some APIs return results array
            if 'results' in j and isinstance(j['results'], list) and len(j['results'])>0:
                candidate = j['results'][0]
                if isinstance(candidate, dict) and 'text' in candidate:
                    return candidate['text']
        # Fallback to raw string
        return str(j)
    except Exception as e:
        raise RuntimeError(f"Groq STT failed: {e}")


def placeholder_tts(text: str) -> bytes:
    # Keep placeholder for TTS until integration requested
    # If ElevenLabs key is provided, use it to synthesize audio (MP3)
    ELEVEN_API_KEY = os.getenv('ELEVENLABS_API_KEY')
    if ELEVEN_API_KEY:
        try:
            url = "https://api.elevenlabs.io/v1/text-to-speech/default"
            headers = {
                "xi-api-key": ELEVEN_API_KEY,
                "Content-Type": "application/json"
            }
            payload = {"text": text, "voice": "alloy"}
            r = requests.post(url, headers=headers, json=payload, timeout=30)
            r.raise_for_status()
            return r.content
        except Exception as e:
            print('ElevenLabs TTS failed:', e)
            # fallback to text bytes
    return text.encode('utf-8')


@app.post('/api/voice')
async def receive_voice(file: UploadFile = File(...), company_id: int = DEFAULT_COMPANY_ID, authorization: Optional[str] = Header(default=None)):
    company_id = resolve_company_id(company_id, authorization)
    try:
        saved_audio = await save_upload(file, company_id)
        text = call_groq_whisper(str(saved_audio))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Não foi possível transcrever o áudio: {e}")
    finally:
        if 'saved_audio' in locals():
            saved_audio.unlink(missing_ok=True)

    response = {"text": text}

    # TTS placeholder
    audio_bytes = placeholder_tts(text)
    audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
    response['audio_base64'] = audio_b64
    response['audio_mime'] = 'audio/mpeg' if os.getenv('ELEVENLABS_API_KEY') else 'text/plain'

    # Optional Firestore write (simple record)
    if db:
        try:
            db.collection('transactions').add({'text': text})
        except Exception as e:
            print('Firestore write failed', e)

    return JSONResponse(response)


@app.post('/api/ocr')
async def ocr_upload(file: UploadFile = File(...), company_id: int = DEFAULT_COMPANY_ID, authorization: Optional[str] = Header(default=None)):
    company_id = resolve_company_id(company_id, authorization)
    saved_image = await save_upload(file, company_id)
    try:
        content = saved_image.read_bytes()
        extracted_text = ''
        import pytesseract
        from PIL import Image
        image = Image.open(io.BytesIO(content))
        extracted_text = pytesseract.image_to_string(image, lang='por')
    except Exception:
        # OCR remains usable without the native Tesseract binary, but reports
        # that extraction needs local OCR setup instead of inventing products.
        extracted_text = ''
    finally:
        saved_image.unlink(missing_ok=True)

    parsed = {
        'items': [],
        'text': extracted_text,
        'status': 'processed' if extracted_text.strip() else 'ocr_not_configured',
        'company_id': company_id,
    }
    return JSONResponse(parsed)


class RAGRequest(BaseModel):
    query: str
    company_id: int = DEFAULT_COMPANY_ID


class CompanyCreate(BaseModel):
    nome: str
    segmento: str = ""


class StockMovement(BaseModel):
    produto: str
    quantidade: int
    tipo: str
    preco_unitario: float = 0


class FinanceEntry(BaseModel):
    mes: str
    faturamento: float = 0
    despesas: float = 0


def get_company(company_id: int):
    if USE_FIRESTORE:
        snapshot = company_document(company_id).get()
        if not snapshot.exists:
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
        data = snapshot.to_dict()
        return {"id": company_id, "nome": data.get("nome", "Empresa"), "segmento": data.get("segmento", "")}
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        company = conn.execute("SELECT id, nome, segmento FROM empresas WHERE id = ?", (company_id,)).fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return dict(company)


@app.post('/api/rag/search')
async def rag_search(req: RAGRequest, authorization: Optional[str] = Header(default=None)):
    # Local, dependency-free retrieval for now: the same database-grounded
    # assistant is exposed under the old RAG route for frontend compatibility.
    result = await processar_pergunta(PerguntaRequest(pergunta=req.query, company_id=req.company_id), authorization)
    return JSONResponse({
        'answers': [result['resposta']],
        'chart_data': result.get('chart_data'),
        'fonte': result.get('fonte')
    })


@app.post('/api/webhook/stripe')
async def stripe_webhook(request: Request):
    payload = await request.body()
    # TODO: verify signature and update user subscription in DB
    return JSONResponse({'status': 'ok'})


class PerguntaRequest(BaseModel):
    pergunta: str
    company_id: int = DEFAULT_COMPANY_ID


def consultar_banco_relacional(pergunta: str, company_id: int = DEFAULT_COMPANY_ID) -> tuple[str, str]:
    try:
        if USE_FIRESTORE:
            company = get_company(company_id)
            stock = [{"produto": item.id, **item.to_dict()} for item in company_document(company_id).collection("estoque").stream()]
            finance = [{"mes": item.id, **item.to_dict()} for item in company_document(company_id).collection("financeiro").stream()]
            p = pergunta.lower()
            wants_stock = any(word in p for word in ["estoque", "produto", "item", "quantidade", "unidade"])
            wants_finance = any(word in p for word in ["faturamento", "lucro", "despesa", "financeiro", "vendas", "receita", "dinheiro"])
            if wants_stock and not wants_finance:
                return f"Empresa: {company['nome']} | Estoque: {stock}", "Firestore / estoque"
            if wants_finance and not wants_stock:
                return f"Empresa: {company['nome']} | Financeiro: {finance}", "Firestore / financeiro"
            return f"Empresa: {company['nome']} | Estoque: {stock} | Financeiro: {finance}", "Firestore"
        if not os.path.exists(DB_PATH):
            return "Banco de dados não encontrado.", "Nenhum"

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        p = pergunta.lower()

        keywords_estoque = [
            "estoque", "produto", "produtos", "item", "itens", "notebook", "monitor", "teclado",
            "quantidade", "quantidades", "unidade", "unidades", "disponivel", "disponiveis",
            "disponível", "disponíveis", "catalogo", "catálogo", "temos", "tenho", "lista",
            "listar", "equipamento", "equipamentos", "modelo", "modelos", "material", "materiais", "quais"
        ]

        keywords_financeiro = [
            "faturamento", "lucro", "despesa", "despesas", "financeiro", "vendas", "faturou",
            "ganho", "ganhos", "gasto", "gastos", "receita", "receitas", "balanço", "balanco", "mes", "mês", "dinheiro"
        ]

        is_estoque = any(w in p for w in keywords_estoque)
        is_financeiro = any(w in p for w in keywords_financeiro)

        contextos = []
        fontes = []

        if is_estoque:
            cursor.execute("SELECT produto, quantidade, preco_unitario FROM estoque WHERE empresa_id = ?", (company_id,))
            dados_estoque = cursor.fetchall()
            contextos.append(f"Estoque Atual Completo: {dados_estoque}")
            fontes.append("Tabela estoque")

        if is_financeiro:
            cursor.execute("SELECT mes, faturamento, despesas, lucro FROM financeiro WHERE empresa_id = ?", (company_id,))
            dados_fin = cursor.fetchall()
            contextos.append(f"Relatórios Financeiros: {dados_fin}")
            fontes.append("Tabela financeiro")

        if not contextos:
            cursor.execute("SELECT produto, quantidade, preco_unitario FROM estoque WHERE empresa_id = ?", (company_id,))
            dados_estoque = cursor.fetchall()
            cursor.execute("SELECT mes, faturamento, despesas, lucro FROM financeiro WHERE empresa_id = ?", (company_id,))
            dados_fin = cursor.fetchall()
            contextos.append(f"Visão Geral da Empresa - Estoque: {dados_estoque} | Financeiro: {dados_fin}")
            fontes.append("Visão Geral do Banco")

        conn.close()
        return " | ".join(contextos), ", ".join(fontes)

    except Exception as e:
        return f"Erro na consulta SQL: {e}", "Erro DB"


@app.get("/")
def home():
    return {"status": "Backend My Partner Ativo"}


@app.get("/api/empresa")
def current_company(company_id: int = DEFAULT_COMPANY_ID, authorization: Optional[str] = Header(default=None)):
    company_id = resolve_company_id(company_id, authorization)
    return get_company(company_id)


@app.post("/api/empresas", status_code=201)
def create_company(payload: CompanyCreate, authorization: Optional[str] = Header(default=None)):
    identity = verify_identity(authorization)
    if USE_FIRESTORE:
        company_id = int(time.time() * 1000)
        company_document(company_id).set({"nome": payload.nome.strip(), "segmento": payload.segmento.strip()})
        if identity:
            db.collection("usuarios").document(identity["uid"]).set({"empresa_id": company_id}, merge=True)
        return {"id": company_id, "nome": payload.nome.strip(), "segmento": payload.segmento.strip()}
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            "INSERT INTO empresas (nome, segmento) VALUES (?, ?)",
            (payload.nome.strip(), payload.segmento.strip()),
        )
        company_id = cursor.lastrowid
    return get_company(company_id)


@app.get("/api/dashboard")
def dashboard(company_id: int = DEFAULT_COMPANY_ID, authorization: Optional[str] = Header(default=None)):
    """Return the local SQLite snapshot used by the Next.js dashboard."""
    company_id = resolve_company_id(company_id, authorization)
    company = get_company(company_id)
    if USE_FIRESTORE:
        stock = [{"produto": item.id, **item.to_dict()} for item in company_document(company_id).collection("estoque").stream()]
        finance = [{"mes": item.id, **item.to_dict()} for item in company_document(company_id).collection("financeiro").stream()]
        return {
            "company": company,
            "stock": stock,
            "finance": finance,
            "capital": {
                "revenue": sum(row.get("faturamento", 0) for row in finance),
                "expenses": sum(row.get("despesas", 0) for row in finance),
                "profit": sum(row.get("lucro", 0) for row in finance),
            },
        }
    if not os.path.exists(DB_PATH):
        return {"stock": [], "capital": {"revenue": 0, "expenses": 0, "profit": 0}, "finance": []}

    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            stock = [dict(row) for row in conn.execute(
                "SELECT produto, quantidade, preco_unitario FROM estoque WHERE empresa_id = ? ORDER BY produto",
                (company_id,)
            )]
            finance = [dict(row) for row in conn.execute(
                "SELECT mes, faturamento, despesas, lucro FROM financeiro WHERE empresa_id = ? ORDER BY id",
                (company_id,)
            )]
        return {
            "company": company,
            "stock": stock,
            "finance": finance,
            "capital": {
                "revenue": sum(row["faturamento"] for row in finance),
                "expenses": sum(row["despesas"] for row in finance),
                "profit": sum(row["lucro"] for row in finance),
            },
        }
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao ler o banco: {exc}")


@app.post("/api/estoque/movimentar")
def move_stock(payload: StockMovement, company_id: int = DEFAULT_COMPANY_ID, authorization: Optional[str] = Header(default=None)):
    company_id = resolve_company_id(company_id, authorization)
    get_company(company_id)
    movement_type = payload.tipo.lower().strip()
    if movement_type not in {"entrada", "saida"}:
        raise HTTPException(status_code=400, detail="tipo deve ser entrada ou saida")
    if not payload.produto.strip() or payload.quantidade <= 0:
        raise HTTPException(status_code=400, detail="produto e quantidade são obrigatórios")

    if USE_FIRESTORE:
        reference = company_document(company_id).collection("estoque").document(payload.produto.strip())
        current = reference.get().to_dict() or {}
        current_quantity = int(current.get("quantidade", 0))
        new_quantity = current_quantity + payload.quantidade if movement_type == "entrada" else current_quantity - payload.quantidade
        if new_quantity < 0:
            raise HTTPException(status_code=400, detail="Estoque insuficiente para essa saída")
        if movement_type == "saida" and not current:
            raise HTTPException(status_code=400, detail="Produto não existe no estoque")
        reference.set({"quantidade": new_quantity, "preco_unitario": payload.preco_unitario or current.get("preco_unitario", 0)}, merge=True)
        return {"status": "ok", "produto": payload.produto.strip(), "quantidade": new_quantity}

    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT id, quantidade, preco_unitario FROM estoque WHERE empresa_id = ? AND produto = ?",
            (company_id, payload.produto.strip()),
        ).fetchone()
        current_quantity = row[1] if row else 0
        new_quantity = current_quantity + payload.quantidade if movement_type == "entrada" else current_quantity - payload.quantidade
        if new_quantity < 0:
            raise HTTPException(status_code=400, detail="Estoque insuficiente para essa saída")
        price = payload.preco_unitario or (row[2] if row else 0)
        if row:
            conn.execute(
                "UPDATE estoque SET quantidade = ?, preco_unitario = ? WHERE id = ?",
                (new_quantity, price, row[0]),
            )
        else:
            if movement_type == "saida":
                raise HTTPException(status_code=400, detail="Produto não existe no estoque")
            conn.execute(
                "INSERT INTO estoque (produto, quantidade, preco_unitario, empresa_id) VALUES (?, ?, ?, ?)",
                (payload.produto.strip(), payload.quantidade, price, company_id),
            )
        conn.commit()
    return {"status": "ok", "produto": payload.produto.strip(), "quantidade": new_quantity}


@app.post("/api/financeiro/lancar")
def add_finance_entry(payload: FinanceEntry, company_id: int = DEFAULT_COMPANY_ID, authorization: Optional[str] = Header(default=None)):
    company_id = resolve_company_id(company_id, authorization)
    get_company(company_id)
    if not payload.mes.strip() or payload.faturamento < 0 or payload.despesas < 0:
        raise HTTPException(status_code=400, detail="Dados financeiros inválidos")
    if USE_FIRESTORE:
        company_document(company_id).collection("financeiro").document(payload.mes.strip()).set({
            "faturamento": payload.faturamento,
            "despesas": payload.despesas,
            "lucro": payload.faturamento - payload.despesas,
        }, merge=True)
        return {"status": "ok"}
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO financeiro (mes, faturamento, despesas, lucro, empresa_id) VALUES (?, ?, ?, ?, ?)",
            (payload.mes.strip(), payload.faturamento, payload.despesas, payload.faturamento - payload.despesas, company_id),
        )
        conn.commit()
    return {"status": "ok"}


@app.post("/api/pergunta")
async def processar_pergunta(req: PerguntaRequest, authorization: Optional[str] = Header(default=None)):
    company_id = resolve_company_id(req.company_id, authorization)
    company = get_company(company_id)
    contexto, fonte = consultar_banco_relacional(req.pergunta, company_id)

    system_prompt = (
        f"Você é o 'My Partner', Gestor Executivo Corporativo da empresa {company['nome']} ({company['segmento']}).\n"
        "Sua função é responder dúvidas operacionais, analisar dados e fornecer conselhos estratégicos apenas quando solicitado.\n\n"
        "REGRAS DE RESPOSTA:\n"
        "1. DICAS SOMENTE SOB DEMANDA: Apresente dicas ou recomendações APENAS se o usuário pedir explicitamente (ex: 'me dê dicas', 'o que recomenda?'). Se não pedir, responda apenas com os dados e a análise direta.\n"
        "2. MODO SOMENTE LEITURA: Você NÃO altera dados no banco. Se pedirem alteração, diga exatamente: 'O sistema opera exclusivamente em modo de consulta. Não tenho permissão para alterar os dados no banco.'\n"
        "3. GERADOR DE GRÁFICOS: SE O USUÁRIO PEDIR UM GRÁFICO, você DEVE OBRIGATORIAMENTE incluir ao final da resposta um bloco JSON válido contendo exatamente esta estrutura:\n"
        "```json\n"
        '{"grafico": true, "tipo": "bar", "titulo": "Título do Gráfico", "data": [{"label": "Jan", "valor": 150000}, {"label": "Fev", "valor": 180000}]}\n'
        "```\n"
        "(Use 'bar' para barras, 'line' para linhas ou 'pie' para pizza).\n\n"
        f"Contexto Atual do Banco de Dados: {contexto}"
    )

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.pergunta}
            ],
            temperature=0.1,
            max_completion_tokens=600
        )

        resposta_bruta = completion.choices[0].message.content.strip()

        dados_grafico = None
        texto_limpo = resposta_bruta

        match_json = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', resposta_bruta, re.DOTALL)
        if match_json:
            json_str = match_json.group(1)
            try:
                parsed = json.loads(json_str)
                if parsed.get("grafico"):
                    dados_grafico = parsed
                    texto_limpo = resposta_bruta.replace(match_json.group(0), "").strip()
            except Exception:
                pass

        return {"resposta": texto_limpo, "fonte": fonte, "chart_data": dados_grafico}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no motor de IA: {str(e)}")


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8000)