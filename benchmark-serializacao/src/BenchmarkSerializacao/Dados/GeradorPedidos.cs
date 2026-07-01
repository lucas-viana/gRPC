using BenchmarkSerializacao.Modelo;
using Google.Protobuf.WellKnownTypes;
using ProtoPedido = BenchmarkSerializacao.Protobuf;

namespace BenchmarkSerializacao.Dados;

/// <summary>
/// Gera dados de pedido de forma <b>deterministica</b> a partir de um
/// <see cref="Random"/> semeado. O padrao de consumo do gerador (quantidade e
/// ordem das chamadas ao RNG) e' identico independentemente do formato de saida,
/// entao reiniciar o RNG com a mesma semente antes de cada bloco (JSON e Protobuf)
/// produz exatamente os mesmos objetos logicos nas duas medicoes — condicao
/// necessaria para uma comparacao justa.
/// </summary>
public static class GeradorPedidos
{
    // Data-base arbitraria (UTC) para o campo criado_em; somamos um offset aleatorio.
    private static readonly DateTime BaseUtc = new(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>Estrutura neutra: primeiro sorteamos os dados, depois mapeamos
    /// para JSON ou Protobuf sem novas chamadas ao RNG.</summary>
    public readonly record struct DadosPedido(
        string PedidoId,
        string ClienteId,
        DateTime CriadoEmUtc,
        (string ProdutoId, int Quantidade, double PrecoUnitario)[] Itens,
        int Status);

    /// <summary>Sorteia um pedido realista dentro de faixas plausiveis.</summary>
    public static DadosPedido Gerar(Random rng)
    {
        string pedidoId = GuidDeterministico(rng);
        string clienteId = GuidDeterministico(rng);

        // Ate ~1 ano de janela, com resolucao de segundos.
        DateTime criadoEm = BaseUtc.AddSeconds(rng.Next(0, 60 * 60 * 24 * 365));

        int qtdItens = rng.Next(1, 9); // 1..8 itens
        var itens = new (string, int, double)[qtdItens];
        for (int i = 0; i < qtdItens; i++)
        {
            string produtoId = $"PRD-{rng.Next(0, 1_000_000):D6}";
            int quantidade = rng.Next(1, 21);              // 1..20
            double preco = Math.Round(1 + rng.NextDouble() * 998.99, 2); // 1.00..999.99
            itens[i] = (produtoId, quantidade, preco);
        }

        int status = rng.Next(0, 3); // 0..2

        return new DadosPedido(pedidoId, clienteId, criadoEm, itens, status);
    }

    /// <summary>Mapeia os dados neutros para o POCO serializado via System.Text.Json.</summary>
    public static PedidoJson ParaJson(in DadosPedido d)
    {
        var itens = new List<ItemPedidoJson>(d.Itens.Length);
        foreach (var (produtoId, quantidade, preco) in d.Itens)
        {
            itens.Add(new ItemPedidoJson
            {
                ProdutoId = produtoId,
                Quantidade = quantidade,
                PrecoUnitario = preco,
            });
        }

        return new PedidoJson
        {
            PedidoId = d.PedidoId,
            ClienteId = d.ClienteId,
            CriadoEm = new DateTimeOffset(d.CriadoEmUtc),
            Itens = itens,
            Status = (StatusJson)d.Status,
        };
    }

    /// <summary>Mapeia os dados neutros para a mensagem Protobuf gerada.</summary>
    public static ProtoPedido.PedidoRequest ParaProto(in DadosPedido d)
    {
        var pedido = new ProtoPedido.PedidoRequest
        {
            PedidoId = d.PedidoId,
            ClienteId = d.ClienteId,
            CriadoEm = Timestamp.FromDateTime(d.CriadoEmUtc),
            Status = (ProtoPedido.Status)d.Status,
        };

        foreach (var (produtoId, quantidade, preco) in d.Itens)
        {
            pedido.Itens.Add(new ProtoPedido.ItemPedido
            {
                ProdutoId = produtoId,
                Quantidade = quantidade,
                PrecoUnitario = preco,
            });
        }

        return pedido;
    }

    /// <summary>
    /// Constroi um GUID a partir de 16 bytes do RNG semeado. Reproduz o
    /// comprimento/forma de um identificador real (36 chars) sem depender de
    /// <see cref="Guid.NewGuid"/>, que nao seria deterministico.
    /// </summary>
    private static string GuidDeterministico(Random rng)
    {
        Span<byte> bytes = stackalloc byte[16];
        rng.NextBytes(bytes);
        return new Guid(bytes).ToString();
    }
}
