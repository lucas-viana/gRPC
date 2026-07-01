using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using BenchmarkSerializacao.Dados;
using BenchmarkSerializacao.Estatistica;
using BenchmarkSerializacao.Modelo;
using Google.Protobuf;
using ProtoPedido = BenchmarkSerializacao.Protobuf;

// =====================================================================================
// Benchmark local: System.Text.Json vs Google.Protobuf
// Mede, por iteracao, tempo de serializacao, tempo de desserializacao e tamanho em bytes
// de um mesmo objeto de dominio. 100% em memoria, processo unico, sem rede.
// =====================================================================================

const int Iteracoes = 100_000;
const int Warmup = 500;         // iteracoes descartaveis para aquecer o JIT
const int Semente = 20240601;   // mesma semente nos dois blocos => mesmos dados medidos

// Resolucao do Stopwatch nesta maquina. Em Windows normalmente ~10 MHz (100 ns/tick).
double nsPorTick = 1_000_000_000.0 / Stopwatch.Frequency;

// System.Text.Json: reutilizar as options e' idiomatico e evita custo por chamada.
// Sem JsonStringEnumConverter de proposito: enum como inteiro e' a forma mais compacta
// e a comparacao mais justa contra o varint do protobuf.
var jsonOptions = new JsonSerializerOptions();

string pastaSaida = ResolverPastaSaida(args);
Directory.CreateDirectory(pastaSaida);

Console.WriteLine("Benchmark serializacao JSON vs Protobuf");
Console.WriteLine($"  Iteracoes por formato : {Iteracoes:N0}");
Console.WriteLine($"  Warmup por formato    : {Warmup:N0}");
Console.WriteLine($"  Modo build            : {(EhDebug() ? "DEBUG (!)" : "Release")}");
Console.WriteLine($"  Stopwatch.Frequency   : {Stopwatch.Frequency:N0} Hz ({nsPorTick:F1} ns/tick)");
Console.WriteLine($"  Saida                 : {pastaSaida}");
Console.WriteLine();

if (EhDebug())
    Console.WriteLine("AVISO: binario compilado em Debug distorce os tempos. Use -c Release.\n");

// Guarda para impedir que o JIT elimine (dead-code) as chamadas de desserializacao.
long sink = 0;

var blocoJson = MedirJson();
var blocoProto = MedirProtobuf();

Console.WriteLine($"(checksum anti-DCE: {sink})\n");

// ----- Persistencia dos CSVs brutos (um por formato) --------------------------------
string csvJson = Path.Combine(pastaSaida, "resultados_json.csv");
string csvProto = Path.Combine(pastaSaida, "resultados_protobuf.csv");
EscreverCsv(csvJson, blocoJson);
EscreverCsv(csvProto, blocoProto);
Console.WriteLine($"CSV gravado: {csvJson}");
Console.WriteLine($"CSV gravado: {csvProto}");

// ----- Estatisticas agregadas -------------------------------------------------------
string mdStats = Path.Combine(pastaSaida, "estatisticas.md");
EscreverEstatisticas(mdStats, blocoJson, blocoProto, nsPorTick);
Console.WriteLine($"Estatisticas: {mdStats}\n");

ImprimirResumoConsole(blocoJson, blocoProto);

return;

// =====================================================================================
// Medicao
// =====================================================================================

BlocoResultado MedirJson()
{
    var serNs = new double[Iteracoes];
    var desNs = new double[Iteracoes];
    var bytes = new int[Iteracoes];

    // --- warmup (descartado) ---
    var rng = new Random(Semente);
    for (int i = 0; i < Warmup; i++)
    {
        var dados = GeradorPedidos.Gerar(rng);
        var pedido = GeradorPedidos.ParaJson(dados);
        byte[] b = JsonSerializer.SerializeToUtf8Bytes(pedido, jsonOptions);
        var volta = JsonSerializer.Deserialize<PedidoJson>(b, jsonOptions);
        sink += volta!.Itens.Count;
    }

    // GC controlado ANTES do bloco (nunca durante a medicao).
    ColetarLixo();

    // Reinicia o RNG: os dados medidos passam a ser identicos aos do bloco Protobuf.
    rng = new Random(Semente);
    for (int i = 0; i < Iteracoes; i++)
    {
        var dados = GeradorPedidos.Gerar(rng);
        var pedido = GeradorPedidos.ParaJson(dados);

        long t0 = Stopwatch.GetTimestamp();
        byte[] b = JsonSerializer.SerializeToUtf8Bytes(pedido, jsonOptions);
        long t1 = Stopwatch.GetTimestamp();
        var volta = JsonSerializer.Deserialize<PedidoJson>(b, jsonOptions);
        long t2 = Stopwatch.GetTimestamp();

        serNs[i] = (t1 - t0) * nsPorTick;
        desNs[i] = (t2 - t1) * nsPorTick;
        bytes[i] = b.Length;
        sink += volta!.Itens.Count + b.Length + (int)volta.Status;
    }

    return BlocoResultado.Criar("JSON", serNs, desNs, bytes);
}

BlocoResultado MedirProtobuf()
{
    var serNs = new double[Iteracoes];
    var desNs = new double[Iteracoes];
    var bytes = new int[Iteracoes];

    // --- warmup (descartado) ---
    var rng = new Random(Semente);
    for (int i = 0; i < Warmup; i++)
    {
        var dados = GeradorPedidos.Gerar(rng);
        var pedido = GeradorPedidos.ParaProto(dados);
        byte[] b = pedido.ToByteArray();
        var volta = ProtoPedido.PedidoRequest.Parser.ParseFrom(b);
        sink += volta.Itens.Count;
    }

    ColetarLixo();

    rng = new Random(Semente);
    for (int i = 0; i < Iteracoes; i++)
    {
        var dados = GeradorPedidos.Gerar(rng);
        var pedido = GeradorPedidos.ParaProto(dados);

        long t0 = Stopwatch.GetTimestamp();
        byte[] b = pedido.ToByteArray();
        long t1 = Stopwatch.GetTimestamp();
        var volta = ProtoPedido.PedidoRequest.Parser.ParseFrom(b);
        long t2 = Stopwatch.GetTimestamp();

        serNs[i] = (t1 - t0) * nsPorTick;
        desNs[i] = (t2 - t1) * nsPorTick;
        bytes[i] = b.Length;
        sink += volta.Itens.Count + b.Length + (int)volta.Status;
    }

    return BlocoResultado.Criar("Protobuf", serNs, desNs, bytes);
}

static void ColetarLixo()
{
    GC.Collect();
    GC.WaitForPendingFinalizers();
    GC.Collect();
}

// =====================================================================================
// I/O de resultados
// =====================================================================================

static void EscreverCsv(string caminho, BlocoResultado bloco)
{
    var ci = CultureInfo.InvariantCulture;
    using var sw = new StreamWriter(caminho, append: false, Encoding.UTF8);
    sw.WriteLine("iteracao,tempo_serializacao,tempo_desserializacao,bytes");

    var sb = new StringBuilder(64);
    for (int i = 0; i < bloco.SerNs.Length; i++)
    {
        sb.Clear();
        sb.Append(i + 1).Append(',')
          .Append(bloco.SerNs[i].ToString("F1", ci)).Append(',')
          .Append(bloco.DesNs[i].ToString("F1", ci)).Append(',')
          .Append(bloco.Bytes[i].ToString(ci));
        sw.WriteLine(sb);
    }
}

static void EscreverEstatisticas(string caminho, BlocoResultado json, BlocoResultado proto, double nsPorTick)
{
    var ci = CultureInfo.InvariantCulture;
    var sb = new StringBuilder();
    sb.AppendLine("# Estatisticas agregadas — JSON vs Protobuf");
    sb.AppendLine();
    sb.AppendLine($"- Iteracoes por formato: {json.SerNs.Length:N0}");
    sb.AppendLine($"- Resolucao do Stopwatch: {nsPorTick.ToString("F1", ci)} ns/tick");
    sb.AppendLine("- Tempos em **nanosegundos (ns)**; tamanho em **bytes**.");
    sb.AppendLine();

    TabelaMetrica(sb, "Tempo de serializacao (ns)", json.Ser, proto.Ser, ci);
    TabelaMetrica(sb, "Tempo de desserializacao (ns)", json.Des, proto.Des, ci);
    TabelaMetrica(sb, "Tamanho do payload (bytes)", json.Tam, proto.Tam, ci);

    // Razoes JSON/Protobuf (quantas vezes o JSON e' maior/mais lento) usando medianas.
    sb.AppendLine("## Razoes JSON / Protobuf (medianas)");
    sb.AppendLine();
    sb.AppendLine("| Metrica | JSON / Protobuf |");
    sb.AppendLine("|---|---|");
    sb.AppendLine($"| Serializacao   | {Razao(json.Ser.Mediana, proto.Ser.Mediana).ToString("F2", ci)}x |");
    sb.AppendLine($"| Desserializacao| {Razao(json.Des.Mediana, proto.Des.Mediana).ToString("F2", ci)}x |");
    sb.AppendLine($"| Tamanho        | {Razao(json.Tam.Mediana, proto.Tam.Mediana).ToString("F2", ci)}x |");
    sb.AppendLine();

    File.WriteAllText(caminho, sb.ToString(), Encoding.UTF8);
}

static double Razao(double jsonValor, double protoValor) => protoValor == 0 ? double.NaN : jsonValor / protoValor;

static void TabelaMetrica(StringBuilder sb, string titulo, ResumoEstatistico json, ResumoEstatistico proto, CultureInfo ci)
{
    sb.AppendLine($"## {titulo}");
    sb.AppendLine();
    sb.AppendLine("| Formato | Media | Mediana | p95 | p99 | Desvio padrao | Min | Max |");
    sb.AppendLine("|---|---|---|---|---|---|---|---|");
    sb.AppendLine(Linha("JSON", json, ci));
    sb.AppendLine(Linha("Protobuf", proto, ci));
    sb.AppendLine();

    static string Linha(string nome, ResumoEstatistico r, CultureInfo ci) =>
        $"| {nome} | {r.Media.ToString("F1", ci)} | {r.Mediana.ToString("F1", ci)} | " +
        $"{r.P95.ToString("F1", ci)} | {r.P99.ToString("F1", ci)} | " +
        $"{r.DesvioPadrao.ToString("F1", ci)} | {r.Min.ToString("F1", ci)} | {r.Max.ToString("F1", ci)} |";
}

static void ImprimirResumoConsole(BlocoResultado json, BlocoResultado proto)
{
    Console.WriteLine("Resumo (mediana):");
    Console.WriteLine($"  Serializacao   JSON {json.Ser.Mediana,8:F0} ns | Proto {proto.Ser.Mediana,8:F0} ns");
    Console.WriteLine($"  Desserializac. JSON {json.Des.Mediana,8:F0} ns | Proto {proto.Des.Mediana,8:F0} ns");
    Console.WriteLine($"  Tamanho        JSON {json.Tam.Mediana,8:F0} B  | Proto {proto.Tam.Mediana,8:F0} B");
}

// =====================================================================================
// Utilitarios
// =====================================================================================

static bool EhDebug()
{
#if DEBUG
    return true;
#else
    return false;
#endif
}

static string ResolverPastaSaida(string[] args)
{
    if (args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
        return Path.GetFullPath(args[0]);

    // Sobe a arvore de diretorios a partir do binario ate achar "benchmark-serializacao".
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    while (dir is not null && !dir.Name.Equals("benchmark-serializacao", StringComparison.OrdinalIgnoreCase))
        dir = dir.Parent;

    string raiz = dir?.FullName ?? Directory.GetCurrentDirectory();
    return Path.Combine(raiz, "resultados");
}

// =====================================================================================
// Tipos de apoio
// =====================================================================================

/// <summary>Resultado bruto + agregados de um formato.</summary>
internal sealed record BlocoResultado(
    string Formato,
    double[] SerNs,
    double[] DesNs,
    int[] Bytes,
    ResumoEstatistico Ser,
    ResumoEstatistico Des,
    ResumoEstatistico Tam)
{
    public static BlocoResultado Criar(string formato, double[] serNs, double[] desNs, int[] bytes)
    {
        var tam = new double[bytes.Length];
        for (int i = 0; i < bytes.Length; i++) tam[i] = bytes[i];

        return new BlocoResultado(
            formato,
            serNs,
            desNs,
            bytes,
            ResumoEstatistico.Calcular(serNs),
            ResumoEstatistico.Calcular(desNs),
            ResumoEstatistico.Calcular(tam));
    }
}
