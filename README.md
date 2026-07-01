# gRPC, byte a byte

> Explicador interativo do funcionamento do **gRPC** em sistemas distribuídos, com um
> benchmark experimental de serialização.
> Seminário da disciplina de **Sistemas Computacionais Distribuídos** — Equipe 07.

Este repositório reúne dois materiais complementares:

1. **Explicador interativo** — uma aplicação web de página única que torna visível o que
   acontece "por baixo do stub" quando dois serviços conversam por um contrato binário
   sobre HTTP/2: a serialização com Protocol Buffers, o transporte multiplexado, os quatro
   modos de streaming e um exemplo prático em C#/.NET.
2. **[`benchmark-serializacao/`](benchmark-serializacao/README.md)** — um experimento em
   C# que mede, na prática, a diferença de tempo de (de)serialização e tamanho de payload
   entre `System.Text.Json` e `Google.Protobuf`, sustentando os números apresentados na
   seção 02 do explicador.

---

## O que tem dentro

| Seção | Conteúdo |
|-------|----------|
| 01 · Simulador de chamada | Anima frames binários trafegando no canal HTTP/2, nos quatro modos (unária, server, client, bidirecional). |
| 02 · Por que é eficiente | As quatro decisões estruturais que explicam o desempenho. |
| 03 · O contrato vira código | Fluxo `.proto` → `protoc` → stubs em C#, Java, Go e Python. |
| 04 · gRPC ou REST? | Tabela comparativa entre as duas abordagens. |
| 05 · Na prática: C# / .NET | Servidor e cliente lado a lado, com execução simulada passo a passo em um terminal. |

## Benchmark de serialização (JSON vs Protobuf)

Experimento local e determinístico, 100% em memória (sem rede, sem transporte gRPC), que
compara `System.Text.Json` e `Google.Protobuf` para o mesmo objeto de domínio. Código,
instruções de execução e interpretação dos resultados estão em
[`benchmark-serializacao/README.md`](benchmark-serializacao/README.md) e
[`benchmark-serializacao/RESUMO.md`](benchmark-serializacao/RESUMO.md).

## Como abrir

### Opção 1 — Arquivo único (recomendado para apresentar)

Abra **`grpc-explicador.html`** com duplo clique em qualquer navegador moderno
(Chrome, Edge, Firefox). **Não precisa de internet, build ou instalação** — o React
está embutido no próprio arquivo. Ideal para levar em um pen drive e projetar ao vivo,
mesmo que a rede da sala falhe.

### Opção 2 — Componente React

O código-fonte do componente está em **`src/App.jsx`** (export default). Pode ser usado
em qualquer projeto React (Vite, Next, CRA). Requer apenas `react` e `react-dom`.

```bash
# exemplo com Vite
npm create vite@latest grpc-app -- --template react
# copie src/App.jsx para o projeto e importe em main.jsx
```

## Estrutura

```
.
├── grpc-explicador.html         # build autônomo (abre offline)
├── src/
│   ├── App.jsx                  # componente principal (todas as seções)
│   └── dotnet-section.jsx       # referência da seção 05, isolada
├── benchmark-serializacao/      # experimento JSON vs Protobuf (ver README próprio)
└── README.md
```

## Tecnologia

Construído com React (sem dependências de UI externas). Estilização inline com um sistema
de tokens próprio, tipografia de sistema (mono + sans) e animações em CSS puro. Respeita
`prefers-reduced-motion` e mantém foco de teclado visível.

## Licença

MIT. Veja [`LICENSE`](LICENSE).
