import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatWithGraphs({
  backendUrl,
  companyId = 1,
  user = null,
  initialChartData = null,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [chartData, setChartData] = useState(initialChartData);
  const ocrInput = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setChartData(initialChartData);
  }, [initialChartData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages, isSending]);

  function speak(text) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    window.speechSynthesis.speak(utterance);
  }

  // Play base64 audio (mp3/wav)
  function playBase64Audio(b64) {
    try {
      const byteChars = atob(b64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch (e) {
      console.error(e);
    }
  }

  async function ask(text, showUserMessage = true) {
    if (!text || isSending) return;
    if (showUserMessage) setMessages((m) => [...m, { from: "user", text }]);
    setIsSending(true);
    try {
      const authorization = user
        ? { Authorization: `Bearer ${await user.getIdToken()}` }
        : {};
      const res = await fetch(`${backendUrl}/api/pergunta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authorization },
        body: JSON.stringify({ pergunta: text, company_id: companyId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail || "Falha no backend");
      setMessages((m) => [
        ...m,
        { from: "bot", text: j.resposta || "Resposta vazia" },
      ]);
      setChartData(j.chart_data || null);
      speak(j.resposta || "Resposta vazia");
    } catch (e) {
      setMessages((m) => [
        ...m,
        { from: "bot", text: `Erro de comunicação: ${e.message}` },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    await ask(text);
  }

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        padding: 20,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        background: "rgba(255,255,255,.86)",
        boxShadow: "var(--shadow)",
      }}
    >
      <div className={`chat-window ${messages.length === 0 ? "empty" : ""}`}>
        {messages.length === 0 && (
          <div className="chat-welcome">
            <img className="welcome-logo" src="/logo/%E2%89%88.svg" alt="" />
            <p className="eyebrow">Seu Partner</p>
            <h2>Por onde começamos?</h2>
            <p className="subtle">
              Consulte seus números, organize uma ideia ou traga um arquivo para
              análise.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              margin: "8px 6px",
              padding: "9px 11px",
              borderRadius: 9,
              color: m.from === "user" ? "#fff" : "var(--ink)",
              background: m.from === "user" ? "var(--green)" : "#edf5f0",
              marginLeft: m.from === "user" ? "18%" : 6,
            }}
          >
            <div
              style={{
                marginBottom: 4,
                fontSize: 11,
                fontWeight: 700,
                opacity: 0.7,
              }}
            >
              {m.from === "user" ? "Você" : "My Partner"}
            </div>
            {m.from === "user" ? (
              m.text
            ) : (
              <div className="chat-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {m.text}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {isSending && (
          <div className="typing-indicator">
            My Partner está analisando<span>...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div
        className={`chat-composer ${messages.length === 0 ? "first-message" : ""}`}
      >
        <div className="composer-row">
          <span className="composer-plus">+</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Pergunte sobre estoque, vendas ou finanças"
            className="composer-input"
          />
          <button className="send-button" disabled={isSending} onClick={send}>
            {isSending ? "..." : "↑"}
          </button>
        </div>

        <div className="chat-actions">
          <input
            ref={ocrInput}
            id="ocr-file"
            className="visually-hidden"
            type="file"
            accept="image/*"
          />
          <label className="file-action" htmlFor="ocr-file">
            <span>＋</span> Escolher arquivo
          </label>
          <button
            className="secondary-action"
            onClick={async () => {
              const f = ocrInput.current?.files?.[0];
              if (!f) return alert("Selecione uma imagem");
              const fd = new FormData();
              fd.append("file", f);
              const authorization = user
                ? { Authorization: `Bearer ${await user.getIdToken()}` }
                : {};
              const res = await fetch(
                `${backendUrl}/api/ocr?company_id=${companyId}`,
                {
                  method: "POST",
                  headers: authorization,
                  body: fd,
                },
              );
              const j = await res.json();
              if (!res.ok) throw new Error(j.detail || "Falha no OCR");
              setMessages((m) => [
                ...m,
                { from: "bot", text: "OCR: " + JSON.stringify(j) },
              ]);
            }}
          >
            <span>▧</span> Processar NF-e
          </button>
          <button
            className={`secondary-action voice-action ${isRecording ? "recording" : ""}`}
            onClick={async () => {
              if (isRecording) {
                recorder.stop();
                setIsRecording(false);
                return;
              }
              if (!navigator.mediaDevices)
                return alert("Navegador não suporta gravação");
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
              });
              const mr = new MediaRecorder(stream);
              const chunks = [];
              mr.ondataavailable = (e) => chunks.push(e.data);
              mr.onstop = async () => {
                stream.getTracks().forEach((track) => track.stop());
                const blob = new Blob(chunks, { type: "audio/webm" });
                const fd = new FormData();
                fd.append("file", blob, "voice.webm");
                const authorization = user
                  ? { Authorization: `Bearer ${await user.getIdToken()}` }
                  : {};
                const res = await fetch(
                  `${backendUrl}/api/voice?company_id=${companyId}`,
                  {
                    method: "POST",
                    headers: authorization,
                    body: fd,
                  },
                );
                const j = await res.json();
                const transcript = (j.text || "").trim();
                if (!res.ok || !transcript) {
                  setMessages((m) => [
                    ...m,
                    {
                      from: "bot",
                      text: "Não consegui transcrever esse áudio.",
                    },
                  ]);
                  return;
                }
                setMessages((m) => [...m, { from: "user", text: transcript }]);
                await ask(transcript, false);
              };
              mr.start();
              setRecorder(mr);
              setIsRecording(true);
            }}
          >
            <span>{isRecording ? "■" : "●"}</span>{" "}
            {isRecording ? "Parar gravação" : "Gravar voz"}
          </button>
        </div>
      </div>
    </div>
  );
}
