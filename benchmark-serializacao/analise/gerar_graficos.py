"""
Gera graficos comparativos JSON vs Protobuf a partir dos CSVs brutos do benchmark.

Uso:
    python gerar_graficos.py

Le  : ../resultados/resultados_json.csv e ../resultados/resultados_protobuf.csv
Gera: ../graficos/*.png  e  ../resultados/estatisticas_python.csv

Dependencias: pandas, matplotlib.
"""

from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # backend sem tela; salva direto em arquivo
import matplotlib.pyplot as plt
import pandas as pd

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
DIR_RESULTADOS = RAIZ / "resultados"
DIR_GRAFICOS = RAIZ / "graficos"

COR = {"JSON": "#c0504d", "Protobuf": "#4f81bd"}


def carregar() -> dict[str, pd.DataFrame]:
    arquivos = {
        "JSON": DIR_RESULTADOS / "resultados_json.csv",
        "Protobuf": DIR_RESULTADOS / "resultados_protobuf.csv",
    }
    dados = {}
    for nome, caminho in arquivos.items():
        if not caminho.exists():
            raise FileNotFoundError(
                f"CSV nao encontrado: {caminho}. Rode o console app antes (ver README)."
            )
        dados[nome] = pd.read_csv(caminho)
    return dados


def tabela_estatisticas(dados: dict[str, pd.DataFrame]) -> pd.DataFrame:
    linhas = []
    for nome, df in dados.items():
        for coluna, rotulo in [
            ("tempo_serializacao", "serializacao_ns"),
            ("tempo_desserializacao", "desserializacao_ns"),
            ("bytes", "bytes"),
        ]:
            s = df[coluna]
            linhas.append(
                {
                    "formato": nome,
                    "metrica": rotulo,
                    "media": s.mean(),
                    "mediana": s.median(),
                    "p95": s.quantile(0.95),
                    "p99": s.quantile(0.99),
                    "desvio_padrao": s.std(),
                    "min": s.min(),
                    "max": s.max(),
                }
            )
    return pd.DataFrame(linhas)


def grafico_tempos_medianos(dados: dict[str, pd.DataFrame]) -> None:
    formatos = list(dados.keys())
    ser = [dados[f]["tempo_serializacao"].median() for f in formatos]
    des = [dados[f]["tempo_desserializacao"].median() for f in formatos]

    x = range(len(formatos))
    largura = 0.35
    fig, ax = plt.subplots(figsize=(7, 4.5))
    b1 = ax.bar([i - largura / 2 for i in x], ser, largura, label="Serializacao",
                color=[COR[f] for f in formatos])
    b2 = ax.bar([i + largura / 2 for i in x], des, largura, label="Desserializacao",
                color=[COR[f] for f in formatos], alpha=0.6)

    ax.set_xticks(list(x))
    ax.set_xticklabels(formatos)
    ax.set_ylabel("Tempo mediano (ns) — menor e' melhor")
    ax.set_title("Tempo mediano por operacao (100k iteracoes)")
    ax.legend()
    for barras in (b1, b2):
        ax.bar_label(barras, fmt="%.0f", padding=2, fontsize=8)
    ax.grid(axis="y", linestyle=":", alpha=0.5)
    salvar(fig, "tempos_medianos.png")


def grafico_tamanho(dados: dict[str, pd.DataFrame]) -> None:
    formatos = list(dados.keys())
    medianas = [dados[f]["bytes"].median() for f in formatos]

    fig, ax = plt.subplots(figsize=(6, 4.5))
    barras = ax.bar(formatos, medianas, color=[COR[f] for f in formatos], width=0.5)
    ax.set_ylabel("Tamanho mediano do payload (bytes) — menor e' melhor")
    ax.set_title("Tamanho do payload por formato")
    ax.bar_label(barras, fmt="%.0f B", padding=3)
    ax.grid(axis="y", linestyle=":", alpha=0.5)
    salvar(fig, "tamanho_payload.png")


def grafico_distribuicao(dados: dict[str, pd.DataFrame], coluna: str, titulo: str,
                         arquivo: str) -> None:
    # Recorta no p99 agregado para os outliers (GC/scheduling) nao achatarem o histograma.
    limite = max(dados[f][coluna].quantile(0.99) for f in dados)
    fig, ax = plt.subplots(figsize=(7, 4.5))
    for nome, df in dados.items():
        serie = df[coluna]
        serie = serie[serie <= limite]
        ax.hist(serie, bins=60, alpha=0.55, label=nome, color=COR[nome])
    ax.set_xlabel("Tempo (ns) — recortado no p99")
    ax.set_ylabel("Frequencia")
    ax.set_title(titulo)
    ax.legend()
    ax.grid(axis="y", linestyle=":", alpha=0.5)
    salvar(fig, arquivo)


def salvar(fig, nome: str) -> None:
    DIR_GRAFICOS.mkdir(parents=True, exist_ok=True)
    destino = DIR_GRAFICOS / nome
    fig.tight_layout()
    fig.savefig(destino, dpi=130)
    plt.close(fig)
    print(f"grafico gravado: {destino}")


def main() -> None:
    dados = carregar()

    stats = tabela_estatisticas(dados)
    destino_stats = DIR_RESULTADOS / "estatisticas_python.csv"
    stats.to_csv(destino_stats, index=False)
    print(f"estatisticas gravadas: {destino_stats}\n")
    print(stats.to_string(index=False, float_format=lambda v: f"{v:,.1f}"))
    print()

    grafico_tempos_medianos(dados)
    grafico_tamanho(dados)
    grafico_distribuicao(dados, "tempo_serializacao",
                         "Distribuicao — tempo de serializacao", "dist_serializacao.png")
    grafico_distribuicao(dados, "tempo_desserializacao",
                         "Distribuicao — tempo de desserializacao", "dist_desserializacao.png")


if __name__ == "__main__":
    main()
