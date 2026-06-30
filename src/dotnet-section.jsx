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
