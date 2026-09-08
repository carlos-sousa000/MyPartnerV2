# My Partner — Assistente Físico e Digital

Estrutura do repositório:

- `firmware/` — código PlatformIO para ESP32-S3 (`src/main.cpp`)
- `backend/` — FastAPI app centralizador (`main.py`, `requirements.txt`)
- `frontend/` — Next.js demo dashboard (`pages/index.jsx`, `components`)
- `docs/` — documentação e esquema elétrico

Execução rápida (desenvolvimento):

1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

2. Frontend (demo Next.js)

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:3000`. Esta é a interface principal: ela consulta o
SQLite pelo endpoint `/api/dashboard`, usa `/api/pergunta` para o chat, permite
gravar voz pelo navegador e enviar imagem de NF-e. O botão de voz usa a fala
nativa do navegador como TTS gratuito; nenhuma chave ElevenLabs é necessária.

O arquivo `frontend/index.html` é a interface HTML antiga. Ele continua
disponível, mas o fluxo recomendado é o Next.js com `npm run dev`.

3. Firmware (ESP32‑S3)

- Abra `firmware/platformio.ini` no VS Code PlatformIO e faça upload para o ESP32‑S3.
- Ajuste `ssid`, `password` e `backend_url` em `firmware/src/main.cpp` antes do upload.

## Demonstração na escola sem servidor externo

Você não precisa comprar ou contratar um servidor para apresentar o projeto.
O notebook usado na apresentação executa o backend e o frontend localmente.
Isso já é um servidor de desenvolvimento: o FastAPI atende a API e o Next.js
atende a interface.

Depois de instalar as dependências uma vez, no Windows você pode iniciar tudo
com PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\iniciar_mypartner.ps1
```

Ou iniciar separadamente:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Em outro terminal:

```powershell
cd frontend
npm run dev -- -H 0.0.0.0
```

Abra `http://localhost:3000` no notebook. Para a IA Groq funcionar, o
notebook precisa ter internet e a chave configurada. SQLite, uploads locais e
TTS do navegador funcionam sem Firebase.

Se outra pessoa estiver na mesma rede Wi-Fi, descubra o IPv4 do notebook com
`ipconfig` e abra no outro dispositivo:

```text
http://IP_DO_NOTEBOOK:3000
```

O firewall do Windows pode pedir autorização para Node/Python. Permita acesso
na rede privada. Fora da rede local, sem hospedagem, o sistema não fica
acessível.

## Publicação em nuvem

O repositório inclui `render.yaml` para o backend FastAPI. No Render, conecte
este repositório e crie o serviço usando esse blueprint. No Vercel, importe o
mesmo repositório e defina `frontend` como **Root Directory**.

No backend hospedado, configure como secrets:

```text
GROQ_API_KEY=<sua chave Groq>
FIREBASE_CRED_JSON=<conteúdo inteiro do JSON da conta de serviço>
USE_FIRESTORE=true
REQUIRE_AUTH=true
```

No frontend hospedado, configure:

```text
NEXT_PUBLIC_BACKEND_URL=https://<seu-backend>.onrender.com
NEXT_PUBLIC_FIREBASE_API_KEY=<Firebase Web API key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<projeto>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projeto>
NEXT_PUBLIC_FIREBASE_APP_ID=<Firebase App ID>
```

Ative no Firebase Authentication o provedor **Email/Password**. O primeiro
cadastro no site cria também uma empresa no Firestore. O backend usa o token do
Firebase para descobrir a empresa do usuário; o `company_id` da URL deixa de
ser uma fonte de confiança.

Não configure `FIREBASE_STORAGE_BUCKET`: esta versão processa áudio e imagens
em arquivos temporários e os apaga depois. O Firestore fica apenas com dados
estruturados.

Notas rápidas:

- O backend usa por padrão a chave Groq presente em `backend/main.py` como fallback. Recomendado: definir `GROQ_API_KEY` via variável de ambiente.
- Para usar ElevenLabs TTS, defina `ELEVENLABS_API_KEY` no ambiente; o backend tentará sintetizar áudio se a variável existir.
- Firebase opcional: defina `FIREBASE_CRED_JSON` e `FIREBASE_STORAGE_BUCKET` ao rodar o backend.
- O Storage não é obrigatório: sem bucket, áudios e imagens são processados em arquivos temporários e apagados ao final. Isso evita cobrança e não mistura arquivos entre empresas.
- Os uploads locais já são separados em `backend/uploads/{company_id}/`. Isso simula o isolamento entre empresas; quando houver login Firebase, o backend deverá obter o `company_id` do usuário autenticado, em vez de confiar no parâmetro enviado pelo navegador.
- A base local agora possui `empresas` e usa `empresa_id` em estoque, financeiro e consultas. A empresa 1 é a empresa de demonstração; crie outra com `POST /api/empresas` antes de testar isolamento.
- Alterações locais podem ser feitas pelas telas Estoque e Capital, sempre com confirmação, ou pelos endpoints `/api/estoque/movimentar` e `/api/financeiro/lancar`.
- OCR local: o backend usa Pillow + `pytesseract`; para extrair texto de verdade, instale também o programa Tesseract no Windows. Sem ele, a rota informa `ocr_not_configured` em vez de inventar produtos.
- O endpoint `/api/rag/search` mantém o nome antigo por compatibilidade, mas agora encaminha perguntas para o assistente com contexto do SQLite. Indexação vetorial de PDFs ainda é uma etapa futura.

## Escopo recomendado para o mini-TCC

O sistema já é uma entrega funcional para um mini-TCC: dashboard, banco SQLite,
chat com Groq, gráficos, Markdown, voz no navegador e estrutura de OCR. Você
não precisa ativar todos os serviços planejados.

| Módulo                            | Custo para testar                   | Situação                  |
| --------------------------------- | ----------------------------------- | ------------------------- |
| SQLite                            | Gratuito                            | Usado agora               |
| Next.js + FastAPI                 | Gratuito                            | Usado agora               |
| Groq                              | Pode exigir créditos conforme o uso | Chat e Whisper            |
| TTS do navegador                  | Gratuito                            | Usado agora               |
| Firebase                          | Gratuito até limites do plano       | Futuro, login e nuvem     |
| Tesseract                         | Gratuito                            | Opcional para OCR local   |
| RAG vetorial                      | Pode ser gratuito localmente        | Futuro, PDFs e documentos |
| ElevenLabs, Stripe e Mercado Pago | Serviços pagos/opcionais            | Não necessários agora     |

Para o TCC principal, você pode evoluir depois para autenticação, Firebase,
OCR estruturado, RAG de documentos e aplicativo mobile. No mini-TCC, o recorte
atual demonstra o problema, a arquitetura e um fluxo de IA funcionando sem
exigir toda a infraestrutura de uma SaaS comercial.

## Ponto de parada antes do Firebase

O projeto agora está preparado para a próxima etapa: a aplicação local já
separa dados por `empresa_id`, mas ainda usa SQLite e uma seleção de empresa
local. O próximo passo manual é criar o projeto Firebase, ativar Auth e
Firestore, gerar a credencial de serviço e preencher `backend/.env` a partir de
`backend/.env.example`. Depois disso, a autenticação substituirá a seleção
local e as regras do Firestore garantirão o isolamento por empresa.

Como enviar este projeto ao seu repositório GitHub (ex.: https://github.com/carlos-sousa000/MyPartner)

```bash
# No diretório raiz do projeto
git init
git add .
git commit -m "My Partner: initial import with firmware, backend, frontend and docs"
git remote add origin https://github.com/carlos-sousa000/MyPartner.git
git branch -M main
git push -u origin main
```

Observação: se o repositório remoto já existe e você não tem um histórico local, `git init` seguido de `git push -u origin main` funciona. Se houver divergências, pode ser necessário `git pull --rebase origin main` antes de `push`.
