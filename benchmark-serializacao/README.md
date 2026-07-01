# benchmark-serializacao — JSON vs Protobuf

Experimento **local e determinístico** que mede, em código, a diferença de
**tempo de (de)serialização** e **tamanho de payload** entre `System.Text.Json`
e `Google.Protobuf`, para um mesmo objeto de domínio (`PedidoRequest`).

100% em memória, processo único — **sem rede, sem gRPC de transporte, sem VMs/proxy/
ferramentas de carga**. O foco é exclusivamente codificação/decodificação.

Veja a interpretação dos números em [`RESUMO.md`](RESUMO.md).

## Estrutura

```
benchmark-serializacao/
├─ src/BenchmarkSerializacao/
│  ├─ BenchmarkSerializacao.csproj   # Google.Protobuf + Grpc.Tools (só mensagens)
│  ├─ Program.cs                     # orquestra warmup, medição, CSVs e estatísticas
│  ├─ Protos/pedido.proto            # PedidoRequest / ItemPedido / Status
│  ├─ Modelo/PedidoJson.cs           # POCO equivalente para System.Text.Json
│  ├─ Dados/GeradorPedidos.cs        # gera dados determinísticos p/ ambos formatos
│  └─ Estatistica/ResumoEstatistico.cs  # média, mediana, p95, p99, desvio
├─ analise/gerar_graficos.py         # gráficos (matplotlib/pandas) a partir dos CSVs
├─ resultados/                       # saída: CSVs + estatísticas (geradas ao rodar)
│  ├─ resultados_json.csv            # 100k linhas: iteracao,tempo_serializacao,tempo_desserializacao,bytes
│  ├─ resultados_protobuf.csv
│  ├─ estatisticas.md                # agregados (gerado pelo C#)
│  └─ estatisticas_python.csv        # agregados (gerado pelo Python, validação cruzada)
└─ graficos/                         # PNGs (gerados pelo Python)
```

> **Unidades dos CSVs:** as colunas `tempo_serializacao` e `tempo_desserializacao` estão
> em **nanossegundos**, derivadas de `Stopwatch.GetTimestamp()`. `bytes` é o tamanho do
> array serializado. Veja a nota sobre quantização do timer no `RESUMO.md`.

## Pré-requisitos

- **.NET SDK 10** (`dotnet --version`). Compilar/rodar **sempre em Release**.
- **Python 3** com `pandas` e `matplotlib` (só para os gráficos).

## Como rodar

Do diretório `benchmark-serializacao/`:

```bash
# 1) build em Release (Debug distorce os tempos)
dotnet build src/BenchmarkSerializacao/BenchmarkSerializacao.csproj -c Release

# 2) executa o benchmark (gera os CSVs e estatisticas.md em ./resultados)
dotnet run --project src/BenchmarkSerializacao/BenchmarkSerializacao.csproj -c Release --no-build

# 3) (opcional) gera os graficos e o estatisticas_python.csv
python analise/gerar_graficos.py
```

O programa aceita um argumento opcional com a pasta de saída dos CSVs; sem argumento,
grava em `benchmark-serializacao/resultados/`.

Para checar consistência, rode o passo 2 **duas a três vezes** e compare as medianas
impressas no console (o `RESUMO.md` foi escrito a partir de 3 execuções).

## Decisões de projeto

- **`GrpcServices="None"`** no `.proto`: só geramos as classes de mensagem; não há
  cliente/servidor gRPC, porque o experimento não usa transporte.
- **Mesma semente de RNG** nos dois blocos: JSON e Protobuf serializam exatamente os
  mesmos objetos lógicos → comparação justa.
- **Warm-up + GC controlado** antes de cada bloco; medição sequencial; apenas as
  chamadas de (de)serialização entram no `Stopwatch`.
- **Enum como inteiro** no JSON (sem `JsonStringEnumConverter`): configuração que mais
  favorece o JSON em tamanho, tornando a vantagem do Protobuf conservadora.
