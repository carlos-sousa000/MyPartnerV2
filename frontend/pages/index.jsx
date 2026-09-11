import React, { useEffect, useState } from "react";
import ChatWithGraphs from "../components/ChatWithGraphs";
import { firebaseAuth, firebaseConfigured } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const money = (value) =>
  `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const DashboardCard = ({ title, value, detail }) => (
  <article className="kpi">
    <div className="kpi-label">{title}</div>
    <div className="kpi-value">{value}</div>
    <div className="stock-meta">{detail}</div>
  </article>
);

function LoginPanel() {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await signInWithEmailAndPassword(firebaseAuth, email, password)
          : await createUserWithEmailAndPassword(firebaseAuth, email, password);
      
      if (mode === "signup") {
        const token = await result.user.getIdToken();
        console.log("[DEBUG] Criando empresa:", { nome: company || "Minha empresa" });
        const createRes = await fetch(`${backendUrl}/api/empresas`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nome: company || "Minha empresa",
            segmento: "Negócios",
          }),
        });
        const createData = await createRes.json();
        console.log("[DEBUG] Resposta de /api/empresas:", { status: createRes.status, data: createData });
        
        if (createRes.ok && createData && createData.id) {
          console.log("[DEBUG] Gravando empresa_id no localStorage:", createData.id);
          localStorage.setItem("my_partner_company_id", String(createData.id));
        } else {
          console.warn("[WARN] Resposta não contém id válido ou status não-ok", createData);
          // Fallback: usar company_id padrão
          localStorage.setItem("my_partner_company_id", "1");
        }
      }
    } catch (err) {
      console.error("[ERROR] Erro no login/signup:", err);
      setError(err.message || "Não foi possível autenticar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <img className="auth-logo" src="/logo/%E2%89%88.svg" alt="My Partner" />
        <p className="eyebrow">My Partner</p>
        <h1>
          {mode === "login" ? "Entrar no workspace" : "Criar sua empresa"}
        </h1>
        <p className="subtle">Seus dados ficam separados por empresa.</p>
        {mode === "signup" && (
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nome da empresa"
            required
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          minLength={6}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button className="primary-action auth-submit" disabled={busy}>
          {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}
        </button>
      </form>
    </main>
  );
}

export default function Home() {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  const [companyId, setCompanyId] = useState(
    Number(process.env.NEXT_PUBLIC_COMPANY_ID || 1)
  );
  const [dashboard, setDashboard] = useState({
    stock: [],
    capital: { revenue: 0, expenses: 0, profit: 0 },
    finance: [],
  });
  const [activeView, setActiveView] = useState("overview");
  const [user, setUser] = useState(undefined);
  const [stockForm, setStockForm] = useState({
    produto: "",
    quantidade: "",
    tipo: "entrada",
    preco_unitario: "",
  });
  const [financeForm, setFinanceForm] = useState({
    mes: "",
    faturamento: "",
    despesas: "",
  });
  const [settings, setSettings] = useState({
    empresa_nome: "",
    notificacoes: true,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    if (!firebaseConfigured) {
      setUser(null);
      return undefined;
    }
    return onAuthStateChanged(firebaseAuth, setUser);
  }, []);

  // Sync companyId from localStorage on mount (client-side only)
  useEffect(() => {
    const stored = localStorage.getItem("my_partner_company_id");
    if (stored) {
      setCompanyId(Number(stored));
    }
  }, []);

  async function authHeaders() {
    return user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
  }

  const loadDashboard = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/dashboard?company_id=${companyId}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        console.warn("Failed to load dashboard", res.status);
        // don't override existing dashboard state with error payloads
        return;
      }
      const data = await res.json();
      setDashboard(
        data && typeof data === "object"
          ? data
          : { stock: [], capital: { revenue: 0, expenses: 0, profit: 0 }, finance: [] },
      );
      // Also load settings (company name)
      if (data && data.company && !settingsLoaded) {
        setSettings(prev => ({
          ...prev,
          empresa_nome: data.company.nome || "Minha Empresa",
        }));
        setSettingsLoaded(true);
      }
    } catch (err) {
      console.warn("Error loading dashboard", err);
    }
  };

  useEffect(() => {
    // Avoid calling the backend while Firebase auth is unresolved (user === undefined).
    if (user === undefined) return;
    
    // After user logs in, always fetch their company_id from backend (isolate per user)
    if (user) {
      console.log("[DEBUG] Usuário logado; sincronizando company_id vinculado ao perfil...");
      (async () => {
        try {
          const token = await user.getIdToken();
          const res = await fetch(`${backendUrl}/api/empresa`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.id) {
              console.log("[DEBUG] Company_id do usuário logado:", data.id);
              setCompanyId(data.id);
              localStorage.setItem("my_partner_company_id", String(data.id));
            }
          } else {
            console.warn("[WARN] Falha ao recuperar company_id do usuário:", res.status);
          }
        } catch (err) {
          console.warn("[WARN] Falha ao sincronizar company_id:", err);
        }
      })();
    }
    
    loadDashboard();
  }, [backendUrl, user]);

  // When the selected company changes (for example after login or sync),
  // reload the dashboard and allow settings to be updated with the
  // correct company data.
  useEffect(() => {
    if (!companyId) return;
    setSettingsLoaded(false);
    loadDashboard();
  }, [companyId]);

  async function submitStock(event) {
    event.preventDefault();
    if (!stockForm.produto || !stockForm.quantidade) return;
    if (
      !window.confirm(
        `Confirmar ${stockForm.tipo} de ${stockForm.quantidade} unidade(s) de ${stockForm.produto}?`
      )
    )
      return;
    const response = await fetch(
      `${backendUrl}/api/estoque/movimentar?company_id=${companyId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          ...stockForm,
          quantidade: Number(stockForm.quantidade),
          preco_unitario: Number(stockForm.preco_unitario || 0),
        }),
      }
    );
    const result = await response.json();
    if (!response.ok)
      return window.alert(
        result.detail || "Não foi possível atualizar o estoque."
      );
    setStockForm({
      produto: "",
      quantidade: "",
      tipo: "entrada",
      preco_unitario: "",
    });
    loadDashboard();
  }

  async function submitFinance(event) {
    event.preventDefault();
    if (!financeForm.mes) return;
    if (
      !window.confirm(`Confirmar lançamento financeiro de ${financeForm.mes}?`)
    )
      return;
    const response = await fetch(
      `${backendUrl}/api/financeiro/lancar?company_id=${companyId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          ...financeForm,
          faturamento: Number(financeForm.faturamento || 0),
          despesas: Number(financeForm.despesas || 0),
        }),
      }
    );
    const result = await response.json();
    if (!response.ok)
      return window.alert(
        result.detail || "Não foi possível lançar o financeiro."
      );
    setFinanceForm({ mes: "", faturamento: "", despesas: "" });
    loadDashboard();
  }

  const chartData = {
    grafico: true,
    tipo: "line",
    titulo: "Faturamento por mês",
    data: (dashboard?.finance || []).map((row) => ({
      label: row.mes,
      valor: row.faturamento,
    })),
  };

  const views = {
    overview: {
      eyebrow: "Central de gestão",
      title: "Bom dia, vamos aos números.",
    },
    stock: { eyebrow: "Operação", title: "Controle de estoque." },
    capital: { eyebrow: "Financeiro", title: "Capital sob controle." },
    chat: { eyebrow: "Assistente", title: "Converse com seus dados." },
    settings: { eyebrow: "Administração", title: "Configurações da empresa." },
  };
  const currentView = views[activeView];

  if (firebaseConfigured && user === undefined)
    return (
      <main className="auth-shell">
        <p>Carregando sessão...</p>
      </main>
    );
  if (firebaseConfigured && !user) return <LoginPanel />;

  const renderChart = () => (
    <div className="chart-frame">
      {chartData.data.length > 0 ? (
        <ResponsiveContainer>
          <LineChart
            data={chartData.data.map((item) => ({
              name: item.label,
              value: item.valor,
            }))}
          >
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => money(value)} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#176b55"
              strokeWidth={3}
              dot={{ r: 4, fill: "#176b55" }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="subtle">Ainda não há dados financeiros para exibir.</p>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/logo/%E2%89%88.svg" alt="" />
          <span>My Partner</span>
        </div>
        <p className="nav-label">Workspace</p>
        <button
          className={`nav-item ${activeView === "overview" ? "active" : ""}`}
          onClick={() => setActiveView("overview")}
        >
          ▦ <span>Visão geral</span>
        </button>
        <button
          className={`nav-item ${activeView === "chat" ? "active" : ""}`}
          onClick={() => setActiveView("chat")}
        >
          ◉ <span>Chat</span>
        </button>
        <button
          className={`nav-item ${activeView === "stock" ? "active" : ""}`}
          onClick={() => setActiveView("stock")}
        >
          ◫ <span>Estoque</span>
        </button>
        <button
          className={`nav-item ${activeView === "capital" ? "active" : ""}`}
          onClick={() => setActiveView("capital")}
        >
          ◒ <span>Capital</span>
        </button>
        <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <button
            className={`nav-item ${activeView === "settings" ? "active" : ""}`}
            onClick={() => setActiveView("settings")}
          >
            ⚙ <span>Configurações</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{currentView.eyebrow}</p>
            <h1>{currentView.title}</h1>
            <p className="subtle">
              Uma leitura rápida do negócio e um Partner pronto para conversar.
            </p>
          </div>
          <div className="status">
            <span className="status-dot" />{" "}
            {firebaseConfigured ? "Nuvem conectada" : "Modo local"}{" "}
            {firebaseConfigured && (
              <button
                className="logout-button"
                onClick={() => signOut(firebaseAuth)}
              >
                Sair
              </button>
            )}
          </div>
        </header>

        {activeView === "overview" && (
          <section className="kpi-grid">
            <DashboardCard
              title="Faturamento acumulado"
              value={money(dashboard?.capital?.revenue)}
              detail="Período disponível no banco"
            />
            <DashboardCard
              title="Despesas acumuladas"
              value={money(dashboard?.capital?.expenses)}
              detail="Custos registrados"
            />
            <DashboardCard
              title="Resultado"
              value={money(dashboard?.capital?.profit)}
              detail="Faturamento menos despesas"
            />
          </section>
        )}

        {activeView === "overview" && (
          <section className="overview-grid">
            <article className="panel">
              <div className="panel-heading">
                <h2>Estoque</h2>
                <span className="tag">ao vivo</span>
              </div>
              <ul className="stock-list">
                {(dashboard?.stock || []).map((item) => (
                  <li className="stock-item" key={item.produto}>
                    <div>
                      <div className="stock-name">{item.produto}</div>
                      <div className="stock-meta">
                        {money(item.preco_unitario)} por unidade
                      </div>
                    </div>
                    <div className="stock-qty">{item.quantidade} un.</div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Visão financeira</p>
                  <h2>Faturamento por mês</h2>
                </div>
                <span className="tag">gráfico</span>
              </div>
              {renderChart()}
            </article>
          </section>
        )}

        {activeView === "stock" && (
          <section className="panel page-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Operação</p>
                <h2>Todos os itens</h2>
              </div>
              <span className="tag">{(dashboard?.stock || []).length} produtos</span>
            </div>
            <ul className="stock-list stock-list-wide">
              {(dashboard?.stock || []).map((item) => (
                <li className="stock-item" key={item.produto}>
                  <div>
                    <div className="stock-name">{item.produto}</div>
                    <div className="stock-meta">
                      Preço unitário: {money(item.preco_unitario)}
                    </div>
                  </div>
                  <div className="stock-qty">{item.quantidade} unidades</div>
                </li>
              ))}
            </ul>
            <form className="operation-form" onSubmit={submitStock}>
              <div className="form-heading">
                <h3>Registrar movimentação</h3>
                <span className="subtle">
                  A alteração só acontece após confirmação.
                </span>
              </div>
              <div className="form-grid">
                <input
                  value={stockForm.produto}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, produto: e.target.value })
                  }
                  placeholder="Produto"
                />
                <input
                  type="number"
                  min="1"
                  value={stockForm.quantidade}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, quantidade: e.target.value })
                  }
                  placeholder="Quantidade"
                />
                <select
                  value={stockForm.tipo}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, tipo: e.target.value })
                  }
                >
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stockForm.preco_unitario}
                  onChange={(e) =>
                    setStockForm({
                      ...stockForm,
                      preco_unitario: e.target.value,
                    })
                  }
                  placeholder="Preço unitário"
                />
                <button className="primary-action" type="submit">
                  Confirmar lançamento
                </button>
              </div>
            </form>
          </section>
        )}

        {activeView === "capital" && (
          <section className="capital-view">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Financeiro</p>
                  <h2>Histórico de faturamento</h2>
                </div>
                <span className="tag">{(dashboard?.finance || []).length} períodos</span>
              </div>
              {renderChart()}
            </article>
            <article className="panel">
              <div className="panel-heading">
                <h2>Resumo por período</h2>
              </div>
              <ul className="stock-list">
                {(dashboard?.finance || []).map((row) => (
                  <li className="stock-item" key={row.mes}>
                    <div>
                      <div className="stock-name">{row.mes}</div>
                      <div className="stock-meta">
                        Despesas: {money(row.despesas)}
                      </div>
                    </div>
                    <div className="stock-qty">{money(row.faturamento)}</div>
                  </li>
                ))}
              </ul>
              <form className="operation-form" onSubmit={submitFinance}>
                <div className="form-heading">
                  <h3>Novo período</h3>
                  <span className="subtle">Faturamento e despesas</span>
                </div>
                <div className="form-grid one-column">
                  <input
                    value={financeForm.mes}
                    onChange={(e) =>
                      setFinanceForm({ ...financeForm, mes: e.target.value })
                    }
                    placeholder="Mês ou período"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={financeForm.faturamento}
                    onChange={(e) =>
                      setFinanceForm({
                        ...financeForm,
                        faturamento: e.target.value,
                      })
                    }
                    placeholder="Faturamento"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={financeForm.despesas}
                    onChange={(e) =>
                      setFinanceForm({
                        ...financeForm,
                        despesas: e.target.value,
                      })
                    }
                    placeholder="Despesas"
                  />
                  <button className="primary-action" type="submit">
                    Confirmar lançamento
                  </button>
                </div>
              </form>
            </article>
          </section>
        )}

        {activeView === "chat" && (
          <section className="chat-section">
            <ChatWithGraphs
              backendUrl={backendUrl}
              companyId={companyId}
              user={user}
              initialChartData={null}
            />
          </section>
        )}

        {activeView === "settings" && (
          <section className="panel page-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Administração</p>
                <h2>Configurações da empresa</h2>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <article style={{ padding: "16px", backgroundColor: "#f9fafb", borderRadius: "12px" }}>
                <h3 style={{ marginBottom: "12px" }}>Informações da Empresa</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: "700", marginBottom: "8px" }}>
                      Nome da Empresa
                    </label>
                    <input
                      type="text"
                      value={settings.empresa_nome}
                      onChange={(e) => setSettings({ ...settings, empresa_nome: e.target.value })}
                      placeholder="Nome da empresa"
                      style={{
                        width: "100%",
                        padding: "12px",
                        border: "2px solid #ddd",
                        borderRadius: "6px",
                        fontSize: "24px",
                        fontWeight: "700",
                        color: "#176b55",
                      }}
                    />
                  </div>
                  <div style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                      Editar nome
                    </label>
                    <input
                      id="empresaNomeInput"
                      type="text"
                      value={settings.empresa_nome}
                      onChange={(e) => setSettings({ ...settings, empresa_nome: e.target.value })}
                      placeholder="Nome da empresa"
                      style={{
                        width: "100%",
                        padding: "12px",
                        paddingRight: "44px",
                        border: "2px solid #ddd",
                        borderRadius: "6px",
                        fontSize: "24px",
                        fontWeight: "700",
                        color: "#176b55",
                      }}
                    />
                    <button
                      title="Editar nome"
                      onClick={() => document.getElementById("empresaNomeInput")?.focus()}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "18px",
                        color: "#6b7280",
                      }}
                    >
                      ✎
                    </button>
                  </div>
                  <button
                    className="primary-action"
                    onClick={async () => {
                      const res = await fetch(`${backendUrl}/api/empresas/${companyId}`, {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          ...(await authHeaders()),
                        },
                        body: JSON.stringify({
                          nome: settings.empresa_nome,
                        }),
                      });
                      if (res.ok) {
                        window.alert("Configurações salvas com sucesso!");
                      } else {
                        window.alert("Erro ao salvar configurações.");
                      }
                    }}
                  >
                    Salvar Configurações
                  </button>
                </div>
              </article>

              <article style={{ padding: "16px", backgroundColor: "#f9fafb", borderRadius: "12px" }}>
                <h3 style={{ marginBottom: "12px" }}>Notificações</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={settings.notificacoes}
                      onChange={(e) => setSettings({ ...settings, notificacoes: e.target.checked })}
                    />
                    <span style={{ fontSize: "14px" }}>Ativar notificações por email</span>
                  </label>
                </div>
              </article>
            </div>

            <article style={{ marginTop: "24px", padding: "16px", backgroundColor: "#fef2f2", borderRadius: "12px", borderLeft: "4px solid #dc2626" }}>
              <h3 style={{ marginBottom: "12px", color: "#7f1d1d" }}>Zona de Risco</h3>
              <p style={{ fontSize: "14px", color: "#7f1d1d", marginBottom: "12px" }}>
                Estas ações são irreversíveis. Prossiga com cuidado.
              </p>
              <button
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
                onClick={() => {
                  if (window.confirm("Tem certeza que deseja fazer logout?")) {
                    localStorage.removeItem("my_partner_company_id");
                    setCompanyId(Number(process.env.NEXT_PUBLIC_COMPANY_ID || 1));
                    signOut(firebaseAuth);
                  }
                }}
              >
                Fazer Logout
              </button>
              <button
                style={{
                  marginLeft: "8px",
                  padding: "8px 16px",
                  backgroundColor: "#b91c1c",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
                onClick={async () => {
                  if (window.confirm("Tem certeza que deseja deletar esta empresa e todos seus dados? Esta ação não pode ser desfeita.")) {
                    try {
                      const headers = await authHeaders();
                      const res = await fetch(`${backendUrl}/api/empresas/${companyId}`, {
                        method: "DELETE",
                        headers,
                      });
                      if (res.ok) {
                        window.alert("Empresa deletada com sucesso!");
                        localStorage.removeItem("my_partner_company_id");
                        setCompanyId(Number(process.env.NEXT_PUBLIC_COMPANY_ID || 1));
                        signOut(firebaseAuth);
                      } else {
                        const errData = await res.json();
                        window.alert(`Erro ao deletar: ${errData.detail || res.statusText}`);
                      }
                    } catch (err) {
                      console.error("[ERROR] Erro ao deletar empresa:", err);
                      window.alert(`Erro ao deletar empresa: ${err.message}`);
                    }
                  }
                }}
              >
                Deletar Empresa
              </button>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}