namespace BenchmarkSerializacao.Modelo;

/// <summary>
/// Status do pedido no caminho JSON. Espelha o enum <c>Status</c> do .proto.
/// Serializado como inteiro pelo System.Text.Json (default), que e' a forma
/// mais compacta e a comparacao mais justa contra o varint do protobuf.
/// </summary>
public enum StatusJson
{
    Pendente = 0,
    Pago = 1,
    Enviado = 2,
}

/// <summary>Item de um pedido. Equivalente ao <c>ItemPedido</c> do .proto.</summary>
public sealed class ItemPedidoJson
{
    public string ProdutoId { get; set; } = string.Empty;
    public int Quantidade { get; set; }
    public double PrecoUnitario { get; set; }
}

/// <summary>
/// POCO de dominio serializado via System.Text.Json. Equivalente 1:1 a'
/// mensagem <c>PedidoRequest</c> do protobuf, com os mesmos campos e tipos.
/// </summary>
public sealed class PedidoJson
{
    public string PedidoId { get; set; } = string.Empty;
    public string ClienteId { get; set; } = string.Empty;
    public DateTimeOffset CriadoEm { get; set; }
    public List<ItemPedidoJson> Itens { get; set; } = [];
    public StatusJson Status { get; set; }
}
