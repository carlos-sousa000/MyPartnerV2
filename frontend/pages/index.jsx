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
        if (createRes.ok && createData.id) {
          localStorage.setItem("my_partner_company_id", String(createData.id));
        }
      }
    } catch (err) {
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
    () => Number(localStorage.getItem("my_partner_company_id")) || Number(process.env.NEXT_PUBLIC_COMPANY_ID || 1)
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

  useEffect(() => {
    if (!firebaseConfigured) {
      setUser(null);
      return undefined;
    }
    return onAuthStateChanged(firebaseAuth, setUser);
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
    } catch (err) {
      console.warn("Error loading dashboard", err);
    }
  };

  useEffect(() => {
    // Avoid calling the backend while Firebase auth is unresolved (user === undefined).
    // When `user` becomes null (no auth) or a valid user object, we call loadDashboard.
    if (user === undefined) return;
    // Also ensure companyId is synced to state after auth
    const storedId = Number(localStorage.getItem("my_partner_company_id"));
    if (storedId && storedId !== companyId) {
      setCompanyId(storedId);
    }
    loadDashboard();
  }, [backendUrl, companyId, user]);

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
      </main>
    </div>
  );
}