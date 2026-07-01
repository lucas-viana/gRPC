namespace BenchmarkSerializacao.Estatistica;

/// <summary>
/// Agregados de uma serie de medicoes: media, mediana, p95, p99, desvio padrao
/// (amostral, n-1) alem de min/max para contexto.
/// </summary>
public readonly record struct ResumoEstatistico(
    double Media,
    double Mediana,
    double P95,
    double P99,
    double DesvioPadrao,
    double Min,
    double Max)
{
    /// <summary>
    /// Calcula os agregados. A entrada e' copiada e ordenada internamente
    /// (nao muta o array original). Percentis por nearest-rank.
    /// </summary>
    public static ResumoEstatistico Calcular(ReadOnlySpan<double> valores)
    {
        if (valores.IsEmpty)
            throw new ArgumentException("Serie vazia.", nameof(valores));

        int n = valores.Length;

        // Media e desvio padrao amostral em passagem unica (soma e soma de quadrados).
        double soma = 0;
        double somaQuadrados = 0;
        foreach (double v in valores)
        {
            soma += v;
            somaQuadrados += v * v;
        }

        double media = soma / n;
        double variancia = n > 1
            ? (somaQuadrados - soma * soma / n) / (n - 1)
            : 0;
        double desvio = Math.Sqrt(Math.Max(0, variancia));

        var ordenado = valores.ToArray();
        Array.Sort(ordenado);

        return new ResumoEstatistico(
            Media: media,
            Mediana: Percentil(ordenado, 50),
            P95: Percentil(ordenado, 95),
            P99: Percentil(ordenado, 99),
            DesvioPadrao: desvio,
            Min: ordenado[0],
            Max: ordenado[^1]);
    }

    /// <summary>Percentil por nearest-rank sobre um array ja ordenado.</summary>
    private static double Percentil(double[] ordenado, double p)
    {
        int n = ordenado.Length;
        int rank = (int)Math.Ceiling(p / 100.0 * n);
        int indice = Math.Clamp(rank - 1, 0, n - 1);
        return ordenado[indice];
    }
}
