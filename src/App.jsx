import React, { useState, useEffect, useRef, useCallback } from "react";


// ============================================================
// gRPC — Explicador interativo (Sistemas Distribuídos)
// Autor: Lucas Viana da Silva — Equipe 07
// ============================================================

const T = {
  ink: "#0E2A30",
  panel: "#0B1F24",
  paper: "#F4F7F6",
  card: "#FFFFFF",
  teal: "#16A394",
  tealDk: "#0E7A6E",
  mint: "#7FD8C9",
  amber: "#E8A13D",
  red: "#D2685F",
  blue: "#6FA8D4",
  line: "#D3E2DE",
  gray: "#5C6F73",
  inkSoft: "#21474F",
};

const MONO = "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const MODES = {
  unary: {
    label: "Unária",
    sub: "1 requisição → 1 resposta",
    proto: "rpc Criar (Pedido) returns (Confirmacao);",
    desc: "Equivale a uma chamada REST tradicional. O cliente envia uma mensagem e aguarda uma única resposta.",
    use: "Operações simples: criar registro, buscar por id, autenticar.",
    reqs: 1, resps: 1, interleave: false,
  },
  server: {
    label: "Streaming de servidor",
    sub: "1 requisição → fluxo de respostas",
    proto: "rpc Acompanhar (Pedido) returns (stream Evento);",
    desc: "O cliente faz uma requisição e o servidor devolve uma sequência contínua de mensagens pelo mesmo stream.",
    use: "Notificações, cotações em tempo real, envio de logs, progresso de tarefa.",
    reqs: 1, resps: 4, interleave: false,
  },
  client: {
    label: "Streaming de cliente",
    sub: "fluxo de requisições → 1 resposta",
    proto: "rpc Enviar (stream Amostra) returns (Resumo);",
    desc: "O cliente envia várias mensagens e o servidor responde uma única vez, ao final do fluxo.",
    use: "Upload fracionado, ingestão de telemetria de sensores, envio em lote.",
    reqs: 4, resps: 1, interleave: false,
  },
  bidi: {
    label: "Streaming bidirecional",
    sub: "fluxos independentes nos dois sentidos",
    proto: "rpc Conversar (stream Msg) returns (stream Msg);",
    desc: "Ambos os lados enviam fluxos de mensagens de forma independente, ao mesmo tempo, sobre o mesmo stream.",
    use: "Chat, jogos multiplayer, sincronização contínua de estado.",
    reqs: 4, resps: 4, interleave: true,
  },
};

// ---- pipeline de etapas para a animação ----
function buildSteps(mode) {
  const m = MODES[mode];
  const steps = [];
  steps.push({ side: "client", node: "app", text: "Aplicação invoca o método no stub" });
  if (mode === "bidi") {
    const n = Math.max(m.reqs, m.resps);
    steps.push({ side: "client", node: "stub", text: "Stub serializa a mensagem (Protobuf)" });
    for (let i = 0; i < n; i++) {
      steps.push({ dir: "send", text: `→ frame de requisição ${i + 1} (binário) no stream` });
      steps.push({ dir: "recv", text: `← frame de resposta ${i + 1} (binário) no stream` });
    }
    steps.push({ side: "server", node: "impl", text: "Handler processa o fluxo em tempo real" });
  } else {
    steps.push({ side: "client", node: "stub", text: "Stub serializa parâmetros (marshalling → bytes)" });
    for (let i = 0; i < m.reqs; i++) {
      steps.push({ dir: "send", text: m.reqs > 1 ? `→ frame de requisição ${i + 1}/${m.reqs}` : "→ requisição enviada como frames HTTP/2" });
    }
    steps.push({ side: "server", node: "stub", text: "Servidor desserializa (unmarshalling)" });
    steps.push({ side: "server", node: "impl", text: "Implementação executa o método" });
    for (let i = 0; i < m.resps; i++) {
      steps.push({ dir: "recv", text: m.resps > 1 ? `← frame de resposta ${i + 1}/${m.resps}` : "← resposta serializada de volta" });
    }
    steps.push({ side: "client", node: "stub", text: "Cliente reconstrói o objeto tipado" });
  }
  steps.push({ side: "client", node: "app", text: "Status OK retornado ao chamador", done: true });
  return steps;
}

// =================== componentes visuais ===================

function Frame({ kind }) {
  const color = kind === "req" ? T.teal : kind === "resp" ? T.amber : T.blue;
  return (
    <span style={{
      display: "inline-block", width: 13, height: 13, borderRadius: 2,
      background: color, margin: "0 2px", verticalAlign: "middle",
      boxShadow: `0 0 0 1px ${T.panel}`,
    }} />
  );
}

function Node({ title, sub, active, accent, mono }) {
  return (
    <div style={{
      border: `1.5px solid ${active ? accent : T.line}`,
      background: active ? accent : T.card,
      color: active ? "#fff" : T.ink,
      borderRadius: 10, padding: "10px 12px", textAlign: "center",
      transition: "all .25s ease", minHeight: 52,
      boxShadow: active ? `0 6px 18px ${accent}44` : "0 1px 2px #0000000a",
    }}>
      <div style={{ fontFamily: mono ? MONO : SANS, fontWeight: 600, fontSize: 13.5, lineHeight: 1.2 }}>{title}</div>
      {sub && <div style={{ fontSize: 10.5, opacity: active ? 0.9 : 0.6, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// =================== simulador ===================

function Simulator({ mode }) {
  const m = MODES[mode];
  const [steps, setSteps] = useState(() => buildSteps(mode));
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [frames, setFrames] = useState([]);
  const timer = useRef(null);
  const fid = useRef(0);

  useEffect(() => {
    setSteps(buildSteps(mode));
    clearTimeout(timer.current);
    setPlaying(false); setIdx(-1); setFrames([]);
  }, [mode]);

  const reset = () => {
    clearTimeout(timer.current);
    setPlaying(false); setIdx(-1); setFrames([]);
  };

  const advance = useCallback((cur) => {
    setIdx(cur);
    const st = steps[cur];
    if (st && (st.dir === "send" || st.dir === "recv")) {
      const id = fid.current++;
      setFrames((f) => [...f, { id, kind: st.dir === "send" ? "req" : "resp" }]);
      setTimeout(() => setFrames((f) => f.filter((x) => x.id !== id)), 900);
    }
    if (cur >= steps.length - 1) { setPlaying(false); return; }
    timer.current = setTimeout(() => advance(cur + 1), 950);
  }, [steps]);

  const play = () => {
    if (playing) return;
    setFrames([]); setPlaying(true);
    advance(0);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const cur = steps[idx] || {};
  const clientActive = cur.side === "client";
  const serverActive = cur.side === "server";
  const channelActive = cur.dir === "send" || cur.dir === "recv";

  return (
    <div>
      {/* contrato */}
      <div style={{
        fontFamily: MONO, fontSize: 12.5, background: T.panel, color: T.mint,
        borderRadius: 8, padding: "10px 14px", marginBottom: 18, overflowX: "auto",
        borderLeft: `3px solid ${T.teal}`,
      }}>
        <span style={{ color: "#5f8a86" }}>// contrato .proto</span><br />
        <span style={{ color: T.amber }}>service</span> Modelador {"{"}<br />
        &nbsp;&nbsp;<span style={{ color: T.amber }}>{m.proto.split(" ")[0]}</span>{" " + m.proto.split(" ").slice(1).join(" ")}<br />
        {"}"}
      </div>

      {/* diagrama */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1.25fr 1fr", gap: 10,
        alignItems: "center", marginBottom: 6,
      }}>
        {/* CLIENTE */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.2, color: T.gray, fontWeight: 700, textAlign: "center" }}>MÁQUINA CLIENTE</div>
          <Node title="Aplicação" sub="lógica de negócio" active={clientActive && cur.node === "app"} accent={T.tealDk} />
          <Node title="Stub gRPC" sub="gerado do .proto" active={clientActive && cur.node === "stub"} accent={T.teal} mono />
        </div>

        {/* CANAL */}
        <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.2, color: T.gray, fontWeight: 700 }}>CANAL HTTP/2</div>
          <div style={{
            width: "100%", borderRadius: 10, padding: "12px 8px",
            background: channelActive ? T.ink : T.inkSoft, transition: "background .25s",
            border: `1.5px solid ${channelActive ? T.teal : "transparent"}`,
            minHeight: 78, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8,
          }}>
            <div style={{ textAlign: "center", color: T.mint, fontFamily: MONO, fontSize: 11 }}>
              uma conexão TCP · streams multiplexados
            </div>
            <div style={{ minHeight: 20, textAlign: "center", whiteSpace: "nowrap" }}>
              {frames.length === 0
                ? <span style={{ color: "#ffffff33", fontSize: 11, fontFamily: MONO }}>· · · · ·</span>
                : frames.map((f) => <FlyingFrame key={f.id} kind={f.kind} />)}
            </div>
          </div>
          <div style={{ fontSize: 10, color: T.gray, fontFamily: MONO }}>
            <Frame kind="req" /> requisição &nbsp; <Frame kind="resp" /> resposta
          </div>
        </div>

        {/* SERVIDOR */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.2, color: T.gray, fontWeight: 700, textAlign: "center" }}>MÁQUINA SERVIDORA</div>
          <Node title="Implementação" sub="handler do método" active={serverActive && cur.node === "impl"} accent={T.tealDk} />
          <Node title="Stub gRPC" sub="skeleton gerado" active={serverActive && cur.node === "stub"} accent={T.teal} mono />
        </div>
      </div>

      {/* narração */}
      <div style={{
        marginTop: 14, minHeight: 46, borderRadius: 8, padding: "12px 14px",
        background: cur.done ? "#16a39418" : T.paper, border: `1px solid ${T.line}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{
          fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#fff",
          background: idx < 0 ? T.gray : cur.done ? T.teal : T.inkSoft,
          borderRadius: 5, padding: "3px 7px", flexShrink: 0,
        }}>
          {idx < 0 ? "—" : `${String(idx + 1).padStart(2, "0")}/${String(steps.length).padStart(2, "0")}`}
        </span>
        <span style={{ fontSize: 14, color: T.ink }}>
          {idx < 0 ? "Pressione “Executar chamada” para ver os bytes percorrerem o canal." : cur.text}
        </span>
      </div>

      {/* controles */}
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button onClick={play} disabled={playing} style={btn(playing ? T.gray : T.teal)}>
          {playing ? "Executando…" : "▶ Executar chamada"}
        </button>
        <button onClick={reset} style={btn(T.inkSoft)}>Reiniciar</button>
      </div>
    </div>
  );
}

function FlyingFrame({ kind }) {
  const color = kind === "req" ? T.teal : T.amber;
  const dir = kind === "req" ? 1 : -1;
  return (
    <span style={{
      display: "inline-block", width: 15, height: 15, borderRadius: 3, margin: "0 3px",
      background: color, boxShadow: `0 0 10px ${color}aa`,
      animation: `fly${dir > 0 ? "R" : "L"} .9s ease forwards`,
    }} />
  );
}

function btn(bg) {
  return {
    fontFamily: SANS, fontSize: 14, fontWeight: 600,
    color: "#fff", background: bg, border: "none", borderRadius: 8,
    padding: "10px 18px", cursor: "pointer", transition: "transform .1s, opacity .2s",
    opacity: 1,
  };
}

// =================== seções de conteúdo ===================

function Why() {
  const items = [
    ["Serialização binária", "O Protocol Buffers transmite tags numéricas e valores em binário — não nomes de campos repetidos em texto, como o JSON. Mensagens menores, parsing mais rápido."],
    ["Contrato em primeiro lugar", "O arquivo .proto é a fonte única de verdade. Cliente e servidor são gerados dele, então incompatibilidades viram erro de compilação, não erro em produção."],
    ["HTTP/2 multiplexado", "Várias chamadas dividem uma única conexão TCP em frames intercalados. Sem o bloqueio de cabeça de fila do HTTP/1.1."],
    ["Streaming nativo", "Os quatro modos de comunicação fazem parte do contrato. Não precisa de WebSocket ou SSE por fora."],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
      {items.map(([h, d], i) => (
        <div key={i} style={{
          background: T.card, border: `1px solid ${T.line}`, borderRadius: 12,
          padding: "16px 18px", borderTop: `3px solid ${T.teal}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 6 }}>{h}</div>
          <div style={{ fontSize: 13, color: T.gray, lineHeight: 1.5 }}>{d}</div>
        </div>
      ))}
    </div>
  );
}

function Compare() {
  const rows = [
    ["Contrato", "Obrigatório (.proto), código gerado", "Opcional (OpenAPI)"],
    ["Formato no fio", "Binário, compacto", "Texto (JSON), verboso"],
    ["Transporte", "HTTP/2 multiplexado", "HTTP/1.1 ou HTTP/2"],
    ["Streaming", "Nativo, 4 modos", "Limitado (SSE/WebSocket)"],
    ["Navegador", "Indireto (gRPC-Web)", "Universal"],
    ["Cache HTTP", "Limitado", "Natural (GET, CDN)"],
    ["Cenário ideal", "Serviço ↔ serviço interno", "APIs públicas e web"],
  ];
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 520 }}>
        <thead>
          <tr style={{ background: T.ink, color: "#fff" }}>
            {["Critério", "gRPC", "REST / JSON"].map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "11px 14px", fontWeight: 600, fontFamily: i === 0 ? SANS : MONO }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? "#fff" : T.paper }}>
              <td style={{ padding: "10px 14px", fontWeight: 600, color: T.ink, borderTop: `1px solid ${T.line}` }}>{r[0]}</td>
              <td style={{ padding: "10px 14px", color: T.tealDk, borderTop: `1px solid ${T.line}` }}>{r[1]}</td>
              <td style={{ padding: "10px 14px", color: T.gray, borderTop: `1px solid ${T.line}` }}>{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =================== app principal ===================


// =================== app principal ===================

export default function App() {
  const [mode, setMode] = useState("unary");

  return (
    <div style={{
      fontFamily: SANS, background: T.paper, color: T.ink, minHeight: "100vh",
      WebkitFontSmoothing: "antialiased",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes flyR { from { transform: translateX(-90px); opacity:0 } 20%{opacity:1} to { transform: translateX(90px); opacity:0 } }
        @keyframes flyL { from { transform: translateX(90px); opacity:0 } 20%{opacity:1} to { transform: translateX(-90px); opacity:0 } }
        @keyframes blink { 50% { opacity: 0 } }
        button:hover:not(:disabled) { transform: translateY(-1px); }
        button:active:not(:disabled) { transform: translateY(0); }
        button:focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
      `}</style>

      {/* HERO */}
      <header style={{ background: T.ink, color: "#fff", padding: "44px 24px 38px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: T.mint, letterSpacing: 2, marginBottom: 14 }}>
            SISTEMAS DISTRIBUÍDOS · EQUIPE 07
          </div>
          <h1 style={{ fontSize: "clamp(34px, 6vw, 58px)", margin: 0, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.05 }}>
            gRPC, byte a byte
          </h1>
          <p style={{ fontSize: 17, color: "#c4dad6", maxWidth: 620, marginTop: 16, lineHeight: 1.55 }}>
            Uma chamada remota que parece local. Veja o que acontece por baixo do stub
            quando dois serviços conversam por um contrato binário sobre HTTP/2.
          </p>
          <div style={{ display: "flex", gap: 22, marginTop: 24, flexWrap: "wrap" }}>
            {[["2015", "open source pelo Google"], ["HTTP/2", "transporte multiplexado"], ["4 modos", "de comunicação"]].map(([a, b], i) => (
              <div key={i}>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: T.mint }}>{a}</div>
                <div style={{ fontSize: 12, color: "#9fbcb7" }}>{b}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 920, margin: "0 auto", padding: "0 24px 70px" }}>

        {/* SIMULADOR */}
        <Section n="01" title="O simulador de chamada" lead="Escolha um modo de comunicação e execute. Os quadrados são frames binários trafegando no canal.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {Object.entries(MODES).map(([k, v]) => (
              <button key={k} onClick={() => setMode(k)} style={{
                fontFamily: SANS, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${mode === k ? T.teal : T.line}`,
                background: mode === k ? T.teal : "#fff",
                color: mode === k ? "#fff" : T.inkSoft,
                borderRadius: 20, padding: "8px 16px", transition: "all .2s",
              }}>{v.label}</button>
            ))}
          </div>

          <div style={{
            background: T.card, border: `1px solid ${T.line}`, borderRadius: 16,
            padding: "22px 22px 24px", boxShadow: "0 2px 14px #0e2a3008",
          }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{MODES[mode].label}</div>
              <div style={{ fontFamily: MONO, fontSize: 12.5, color: T.teal, marginTop: 2 }}>{MODES[mode].sub}</div>
              <p style={{ fontSize: 13.5, color: T.gray, marginTop: 8, marginBottom: 0, lineHeight: 1.55 }}>{MODES[mode].desc}</p>
            </div>
            <Simulator mode={mode} />
            <div style={{
              marginTop: 16, fontSize: 12.5, color: T.inkSoft, background: T.paper,
              borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${T.amber}`,
            }}>
              <strong>Quando usar:</strong> {MODES[mode].use}
            </div>
          </div>
        </Section>

        {/* POR QUE É EFICIENTE */}
        <Section n="02" title="Por que é eficiente" lead="O desempenho do gRPC vem do design, não de truques pontuais. Quatro decisões estruturais.">
          <Why />
        </Section>

        {/* PROTOBUF EXPLICADO */}
        <Section n="03" title="O contrato vira código" lead="Um único arquivo .proto gera as classes de mensagem e os stubs dos dois lados.">
          <ProtoFlow />
        </Section>

        {/* COMPARAÇÃO */}
        <Section n="04" title="gRPC ou REST?" lead="Não é um ou outro. Sistemas maduros usam REST na borda e gRPC entre serviços internos.">
          <Compare />
        </Section>

        {/* EXEMPLO .NET INTERATIVO */}
        <Section n="05" title="Na prática: C# / .NET" lead="O mesmo contrato gera o cliente e o servidor. Rode os dois projetos e veja a chamada acontecer linha a linha.">
          <DotnetDemo />
        </Section>
      </main>

      <footer style={{ background: T.ink, color: "#8fb0ac", padding: "26px 24px", textAlign: "center", fontSize: 13 }}>
        <div style={{ fontFamily: MONO, color: T.mint, marginBottom: 4 }}>// fim do stream</div>
        Lucas Viana da Silva · IFSULDEMINAS — Campus Machado · Sistemas Computacionais Distribuídos
      </footer>
    </div>
  );
}

function Section({ n, title, lead, children }) {
  return (
    <section style={{ marginTop: 52 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: T.teal, fontWeight: 700 }}>{n}</span>
        <h2 style={{ fontSize: "clamp(22px, 3.5vw, 28px)", margin: 0, fontWeight: 700, letterSpacing: -0.5 }}>{title}</h2>
      </div>
      <p style={{ fontSize: 15, color: T.gray, margin: "0 0 20px", maxWidth: 640, lineHeight: 1.55 }}>{lead}</p>
      {children}
    </section>
  );
}

function ProtoFlow() {
  const langs = ["C# / .NET", "Java", "Go", "Python"];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{
        fontFamily: MONO, fontSize: 12.5, background: T.panel, color: "#dcebe8",
        borderRadius: 10, padding: "16px 18px", overflowX: "auto", lineHeight: 1.7,
      }}>
        <span style={{ color: "#5f8a86" }}>// modelador.proto — fonte única de verdade</span><br />
        <span style={{ color: T.amber }}>message</span> Amostra {"{"}<br />
        &nbsp;&nbsp;<span style={{ color: T.mint }}>string</span> lote_id <span style={{ color: "#7a9b97" }}>= 1;</span> &nbsp;<span style={{ color: "#5f8a86" }}>// tag 1, não o nome, vai no fio</span><br />
        &nbsp;&nbsp;<span style={{ color: T.mint }}>double</span> temperatura <span style={{ color: "#7a9b97" }}>= 2;</span><br />
        &nbsp;&nbsp;<span style={{ color: T.mint }}>int64</span> &nbsp;timestamp <span style={{ color: "#7a9b97" }}>= 3;</span><br />
        {"}"}
      </div>
      <div style={{ textAlign: "center", color: T.gray, fontSize: 20, lineHeight: 1 }}>↓ <span style={{ fontFamily: MONO, fontSize: 12 }}>compilador protoc</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px,1fr))", gap: 10 }}>
        {langs.map((l, i) => (
          <div key={i} style={{
            background: "#fff", border: `1.5px solid ${T.teal}`, borderRadius: 10,
            padding: "12px 8px", textAlign: "center", fontWeight: 600, fontSize: 13.5,
            color: T.tealDk, fontFamily: MONO,
          }}>{l}</div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 12.5, color: T.gray }}>
        classes de mensagem + stubs cliente/servidor gerados automaticamente em cada linguagem
      </div>
    </div>
  );
}


// ============================================================
// Seção 05 — Exemplo C# / .NET interativo
// Servidor e cliente lado a lado, com "execução" simulada.
// ============================================================

const DEMO = {
  proto: [
    { t: 'syntax = "proto3";', c: "cm" },
    { t: "", c: "" },
    { t: 'option csharp_namespace = "Modelador";', c: "cm" },
    { t: "", c: "" },
    { t: "service Agendamentos {", c: "kw" },
    { t: "  rpc Criar (CriarPedido) returns (Confirmacao);", c: "rpc" },
    { t: "}", c: "pl" },
    { t: "", c: "" },
    { t: "message CriarPedido {", c: "kw" },
    { t: "  string cliente_id = 1;", c: "ty" },
    { t: "  string servico    = 2;", c: "ty" },
    { t: "}", c: "pl" },
    { t: "", c: "" },
    { t: "message Confirmacao {", c: "kw" },
    { t: "  string protocolo = 1;", c: "ty" },
    { t: "  bool   sucesso   = 2;", c: "ty" },
    { t: "}", c: "pl" },
  ],
  server: [
    "public class AgendamentosService",
    "    : Agendamentos.AgendamentosBase",
    "{",
    "    public override Task<Confirmacao> Criar(",
    "        CriarPedido req, ServerCallContext ctx)",
    "    {",
    "        var conf = new Confirmacao {",
    "            Protocolo = Guid.NewGuid().ToString(),",
    "            Sucesso   = true",
    "        };",
    "        return Task.FromResult(conf);",
    "    }",
    "}",
  ],
  client: [
    'using var canal = GrpcChannel.ForAddress(',
    '    "https://localhost:5001");',
    "",
    "var cliente =",
    "    new Agendamentos.AgendamentosClient(canal);",
    "",
    "var resposta = await cliente.CriarAsync(",
    '    new CriarPedido {',
    '        ClienteId = "42", Servico = "corte" },',
    "    deadline: DateTime.UtcNow.AddSeconds(2));",
    "",
    'Console.WriteLine(',
    '    $"Protocolo: {resposta.Protocolo}");',
  ],
};

function protoColor(c) {
  return {
    cm: "#5f8a86", kw: "#E8A13D", rpc: "#7FD8C9",
    ty: "#9fd0c9", pl: "#dcebe8", "": "#dcebe8",
  }[c] || "#dcebe8";
}

// destaca palavras-chave do C# de forma simples
function CSharpLine({ line }) {
  const kws = ["public", "class", "override", "Task", "var", "new", "return", "using", "await", "string", "bool", "true"];
  const parts = line.split(/(\s+|[(){};,])/);
  return (
    <span>
      {parts.map((p, i) => {
        let color = "#dcebe8";
        if (kws.includes(p.trim())) color = "#E8A13D";
        else if (/^".*"?$|"$/.test(p.trim()) || p.includes('"')) color = "#7FD8C9";
        else if (/^[A-Z]\w+/.test(p.trim())) color = "#9fd0c9";
        else if (p.includes("//")) color = "#5f8a86";
        return <span key={i} style={{ color }}>{p}</span>;
      })}
    </span>
  );
}

function CodePane({ title, badge, lines, csharp, activeLine }) {
  return (
    <div style={{
      background: "#0B1F24", borderRadius: 12, overflow: "hidden",
      border: "1px solid #14323a", display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 13px", background: "#102a31", borderBottom: "1px solid #14323a",
      }}>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#fff", fontWeight: 600 }}>{title}</span>
        <span style={{
          fontFamily: MONO, fontSize: 10, color: "#0B1F24", background: "#7FD8C9",
          padding: "2px 7px", borderRadius: 4, fontWeight: 700,
        }}>{badge}</span>
      </div>
      <pre style={{
        margin: 0, padding: "12px 14px", fontFamily: MONO, fontSize: 11.5,
        lineHeight: 1.65, overflowX: "auto", flex: 1,
      }}>
        {lines.map((ln, i) => (
          <div key={i} style={{
            background: activeLine === i ? "#16a39426" : "transparent",
            borderLeft: activeLine === i ? "2px solid #16A394" : "2px solid transparent",
            paddingLeft: 8, marginLeft: -8, transition: "background .2s",
            minHeight: 19,
          }}>
            {csharp
              ? <CSharpLine line={ln} />
              : <span style={{ color: protoColor(ln.c) }}>{ln.t || " "}</span>}
          </div>
        ))}
      </pre>
    </div>
  );
}

function DotnetDemo() {
  const [running, setRunning] = React.useState(false);
  const [log, setLog] = React.useState([]);
  const [srvLine, setSrvLine] = React.useState(-1);
  const [cliLine, setCliLine] = React.useState(-1);
  const timers = React.useRef([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  React.useEffect(() => () => clearTimers(), []);

  const seq = [
    { d: 200, log: "$ dotnet run --project Servidor", srv: null, cli: null, kind: "cmd" },
    { d: 700, log: "info: servidor gRPC ouvindo em https://localhost:5001", srv: null, cli: null, kind: "info" },
    { d: 600, log: "$ dotnet run --project Cliente", srv: null, cli: null, kind: "cmd" },
    { d: 500, log: "cliente: abrindo canal HTTP/2…", srv: null, cli: 0, kind: "info" },
    { d: 600, log: "cliente: invocando CriarAsync(...)", srv: null, cli: 6, kind: "info" },
    { d: 600, log: "→ requisição serializada (Protobuf) enviada", srv: null, cli: 6, kind: "wire" },
    { d: 600, log: "servidor: método Criar() recebido", srv: 3, cli: null, kind: "info" },
    { d: 600, log: "servidor: gerando protocolo e respondendo", srv: 6, cli: null, kind: "info" },
    { d: 600, log: "← resposta serializada de volta ao cliente", srv: 10, cli: null, kind: "wire" },
    { d: 500, log: "cliente: resposta desserializada", srv: null, cli: 11, kind: "info" },
    { d: 400, log: "Protocolo: 7f3a9c12-... | Sucesso: true", srv: null, cli: 11, kind: "ok" },
  ];

  const run = () => {
    if (running) return;
    clearTimers();
    setRunning(true); setLog([]); setSrvLine(-1); setCliLine(-1);
    let acc = 0;
    seq.forEach((s, i) => {
      acc += s.d;
      const id = setTimeout(() => {
        setLog((l) => [...l, { text: s.log, kind: s.kind }]);
        if (s.srv !== null) setSrvLine(s.srv);
        if (s.cli !== null) setCliLine(s.cli);
        if (i === seq.length - 1) setRunning(false);
      }, acc);
      timers.current.push(id);
    });
  };

  const reset = () => {
    clearTimers();
    setRunning(false); setLog([]); setSrvLine(-1); setCliLine(-1);
  };

  const logColor = (k) => ({
    cmd: "#7FD8C9", info: "#9fbcb7", wire: "#E8A13D", ok: "#16A394", error: "#D2685F",
  }[k] || "#9fbcb7");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* contrato compartilhado */}
      <CodePane title="agendamentos.proto" badge="CONTRATO" lines={DEMO.proto} />

      {/* servidor + cliente lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <CodePane title="AgendamentosService.cs" badge="SERVIDOR" lines={DEMO.server} csharp activeLine={srvLine} />
        <CodePane title="Program.cs (cliente)" badge="CLIENTE" lines={DEMO.client} csharp activeLine={cliLine} />
      </div>

      {/* terminal */}
      <div style={{
        background: "#08171b", borderRadius: 12, border: "1px solid #14323a",
        fontFamily: MONO, fontSize: 12, overflow: "hidden",
      }}>
        <div style={{
          padding: "8px 13px", background: "#102a31", borderBottom: "1px solid #14323a",
          display: "flex", alignItems: "center", gap: 7,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#D2685F", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#E8A13D", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#16A394", display: "inline-block" }} />
          <span style={{ color: "#7a9b97", marginLeft: 8, fontSize: 11 }}>terminal — dois processos</span>
        </div>
        <div style={{ padding: "12px 14px", minHeight: 150, maxHeight: 230, overflowY: "auto" }}>
          {log.length === 0
            ? <div style={{ color: "#3c5a5f" }}>aguardando execução…</div>
            : log.map((l, i) => (
              <div key={i} style={{ color: logColor(l.kind), lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {l.kind === "ok" ? "✓ " : l.kind === "wire" ? "  " : ""}{l.text}
              </div>
            ))}
          {running && <span style={{ color: "#16A394", animation: "blink 1s step-start infinite" }}>▋</span>}
        </div>
      </div>

      {/* controles */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={run} disabled={running} style={btn(running ? T.gray : T.teal)}>
          {running ? "Executando…" : "▶ Rodar os dois projetos"}
        </button>
        <button onClick={reset} style={btn(T.inkSoft)}>Limpar terminal</button>
      </div>

      <div style={{
        fontSize: 12.5, color: T.inkSoft, background: T.paper,
        borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${T.teal}`,
      }}>
        <strong>O ponto-chave:</strong> o tipo <code style={{ fontFamily: MONO, color: T.tealDk }}>AgendamentosClient</code>,
        a mensagem <code style={{ fontFamily: MONO, color: T.tealDk }}>CriarPedido</code> e a assinatura de <code style={{ fontFamily: MONO, color: T.tealDk }}>Criar</code> foram
        gerados do mesmo <code style={{ fontFamily: MONO, color: T.tealDk }}>.proto</code>. Divergência de contrato vira erro de compilação — não um 400 em produção.
      </div>
    </div>
  );
}
