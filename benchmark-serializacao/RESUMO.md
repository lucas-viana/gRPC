# Resumo — Benchmark local JSON vs Protobuf

Experimento local, em processo único, medindo **serialização**, **desserialização** e
**tamanho de payload** de um mesmo objeto de domínio (`PedidoRequest`) em dois formatos:
`System.Text.Json` e `Google.Protobuf`. Sem rede, sem gRPC de transporte — apenas
codificação/decodificação em memória.

> Os números abaixo são de uma execução representativa na máquina do autor. Foram feitas
> **3 execuções completas** e os resultados ficaram consistentes (medianas de tempo
> variando poucos pontos percentuais; tamanhos idênticos, pois são determinísticos).
> Reproduza localmente — valores absolutos dependem de CPU/OS/versões.

## Configuração da medição

- **100.000 iterações** por formato, execução sequencial (sem paralelismo).
- **500 iterações de warm-up** descartadas antes de medir (elimina JIT a frio).
- `GC.Collect()` + `GC.WaitForPendingFinalizers()` **antes** de cada bloco, nunca durante.
- Build em **Release**.
- Mesma **semente de RNG** nos dois blocos → os dois formatos serializam exatamente os
  mesmos objetos lógicos (comparação justa).
- Tempo via `Stopwatch.GetTimestamp()` (alta resolução). Nesta máquina
  `Stopwatch.Frequency = 10 MHz` → **1 tick = 100 ns**.

## Resultados (execução representativa)

### Tempo de serialização (ns)

| Formato  | Média  | Mediana | p95    | p99    | Desvio |
|----------|--------|---------|--------|--------|--------|
| JSON     | 6014.1 | 4800.0  | 12300  | 25301  | 21824  |
| Protobuf | 1964.3 | 1400.0  | 3900   | 7000   | 14835  |

### Tempo de desserialização (ns)

| Formato  | Média  | Mediana | p95    | p99    | Desvio |
|----------|--------|---------|--------|--------|--------|
| JSON     | 7710.3 | 6000.0  | 16000  | 31800  | 27264  |
| Protobuf | 2139.1 | 1500.0  | 4500   | 8300   | 9354   |

### Tamanho do payload (bytes)

| Formato  | Média | Mediana | p95 | p99 | Min | Max |
|----------|-------|---------|-----|-----|-----|-----|
| JSON     | 456.4 | 484.0   | 685 | 687 | 223 | 690 |
| Protobuf | 198.0 | 209.0   | 286 | 286 | 109 | 286 |

### Razões JSON / Protobuf (medianas)

| Métrica          | JSON é ... |
|------------------|-----------|
| Serialização     | **~3,4x** mais lento |
| Desserialização  | **~4,0x** mais lento |
| Tamanho          | **~2,3x** maior |

## Interpretação

- **Tamanho.** O JSON gasta ~2,3x mais bytes para o mesmo pedido. Isso é estrutural:
  JSON carrega nomes de campos por texto (`"preco_unitario"`, `"produto_id"`…),
  aspas, chaves e um `criado_em` como string ISO-8601 (~25 chars). O Protobuf usa
  *field tags* numéricas de 1 byte, varints para inteiros/enum e um `Timestamp` binário
  (dois varints). Quanto mais campos aninhados e repetidos (`itens`), maior a vantagem
  do Protobuf — e o payload deste experimento tem lista variável de 1 a 8 itens.

- **Tempo.** A desserialização é o ponto mais caro dos dois lados, mas o JSON sofre
  mais: precisa *tokenizar* texto e converter strings (inclusive o parsing da data
  ISO-8601), enquanto o Protobuf faz leitura direta de campos binários. Daí o JSON ser
  ~4x mais lento para desserializar e ~3,4x para serializar (medianas).

- **Cauda (p95/p99) e desvio.** As médias ficam acima das medianas e os desvios são
  altos por causa de outliers de **GC e scheduling do SO** — inevitáveis num benchmark
  in-process com alocação por iteração. Por isso a **mediana e os percentis** são mais
  representativos do custo típico do que a média isolada. O Protobuf também tem cauda
  menor (menos alocação → menos pressão de GC).

## Limitações metodológicas (honestas)

- **Quantização do timer.** Com 100 ns/tick, uma operação individual de ~200–500 ns cai
  em 1–5 ticks: as medidas *por iteração* são grosseiras (medianas aparecem como
  múltiplos de 100 ns). O agregado sobre 100k amostras continua válido para comparação
  relativa, mas não trate os ns por iteração como precisão real de nanosegundo. Para
  medir uma única operação com precisão, o correto seria cronometrar um *lote* e dividir
  — ou usar BenchmarkDotNet (deliberadamente evitado aqui por didática).
- **Enum como inteiro no JSON.** Não foi usado `JsonStringEnumConverter`; o `status` vai
  como número. É a configuração que mais favorece o JSON em tamanho — ou seja, a
  vantagem do Protobuf mostrada é *conservadora*. Com enum textual o JSON seria maior.
- **Custo de construção do objeto não entra na conta.** Apenas as chamadas de
  serialização/desserialização são cronometradas; geração e mapeamento dos dados ficam
  fora do `Stopwatch`.
- **STJ reflexivo.** Usou-se `System.Text.Json` por reflexão com `JsonSerializerOptions`
  em cache. Source generation (`JsonSerializerContext`) reduziria o tempo do JSON, mas
  não muda o tamanho e dificilmente inverteria o resultado.

## Conclusão

Para um payload de domínio realista, o Protobuf foi consistentemente **~2,3x menor** e
**~3–4x mais rápido** que JSON em serialização/desserialização, em processo único e sem
qualquer custo de rede. Num cenário de gRPC real (muitas mensagens/segundo entre
serviços), essa diferença de tamanho vira menos banda e menos latência de
(de)serialização por chamada — a evidência prática que motiva o uso de Protobuf como
formato de fio no gRPC.
