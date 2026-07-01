# Estatisticas agregadas — JSON vs Protobuf

- Iteracoes por formato: 100,000
- Resolucao do Stopwatch: 100.0 ns/tick
- Tempos em **nanosegundos (ns)**; tamanho em **bytes**.

## Tempo de serializacao (ns)

| Formato | Media | Mediana | p95 | p99 | Desvio padrao | Min | Max |
|---|---|---|---|---|---|---|---|
| JSON | 5326.1 | 5000.0 | 8400.0 | 14300.0 | 5826.4 | 1500.0 | 1214100.0 |
| Protobuf | 1676.8 | 1500.0 | 2800.0 | 3900.0 | 1028.9 | 500.0 | 138500.0 |

## Tempo de desserializacao (ns)

| Formato | Media | Mediana | p95 | p99 | Desvio padrao | Min | Max |
|---|---|---|---|---|---|---|---|
| JSON | 6714.2 | 6300.0 | 10500.0 | 18800.0 | 4801.9 | 1400.0 | 814100.0 |
| Protobuf | 2097.2 | 1900.0 | 3400.0 | 4300.0 | 1930.9 | 500.0 | 271500.0 |

## Tamanho do payload (bytes)

| Formato | Media | Mediana | p95 | p99 | Desvio padrao | Min | Max |
|---|---|---|---|---|---|---|---|
| JSON | 456.4 | 484.0 | 685.0 | 687.0 | 149.4 | 223.0 | 690.0 |
| Protobuf | 198.0 | 209.0 | 286.0 | 286.0 | 57.2 | 109.0 | 286.0 |

## Razoes JSON / Protobuf (medianas)

| Metrica | JSON / Protobuf |
|---|---|
| Serializacao   | 3.33x |
| Desserializacao| 3.32x |
| Tamanho        | 2.32x |

