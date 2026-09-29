#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pipeline de análise do alimentador automático.

PIBIC SISPROJ 59635 — UEA — Eng. de Controle e Automação
Orientação: Prof. Dr. Almir Kimura Júnior

Dois algoritmos clássicos, nenhuma rede neural:

  1) K-MEANS (scikit-learn) — agrupa os horários das refeições para
     descobrir a rotina do animal. A entrada é um número só por evento:
     o minuto do dia. O número de grupos não é chutado — o script testa
     de 2 a 6 e escolhe pelo maior coeficiente de silhueta.

  2) Z-SCORE — detecta anomalias no consumo diário. Um dia é anômalo
     quando o total consumido se afasta mais de LIMIAR desvios-padrão
     da média do período.

O script também MEDE o próprio acerto: como o conjunto sintético traz
o rótulo das anomalias injetadas (ground_truth_anomalias.csv), dá para
calcular precisão, revocação e F1 em vez de olhar o gráfico e achar
que ficou bom.

Uso:
    pip install -r requirements.txt
    python pipeline_analise.py                      # lê os CSVs locais
    python pipeline_analise.py --enviar-supabase    # grava no banco

Para gravar no Supabase é preciso exportar, na sua máquina:
    export SUPABASE_URL="https://xxxx.supabase.co"
    export SUPABASE_SERVICE_ROLE="..."
A service_role NUNCA entra em arquivo versionado. Ela é usada só aqui,
porque as tabelas de análise são somente leitura para o app.
"""

import argparse
import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

# =====================================================================
#  parâmetros
# =====================================================================

LIMIAR_Z = 2.0          # desvios-padrão para considerar um dia anômalo
# Limiar da variante robusta (mediana/MAD). O valor 3.5 é o usual na
# literatura para o escore modificado de Iglewicz e Hoaglin.
LIMIAR_Z_ROBUSTO = 3.5
K_MINIMO, K_MAXIMO = 2, 6
SEMENTE = 59635         # mesma do gerador, para o K-means ser reprodutível
DEVICE_ID = "esp32-01"
PERIODOS = [7, 30, 90]

ROTULOS_GRUPO = {
    "madrugada": (0, 5 * 60),
    "Manhã": (5 * 60, 11 * 60),
    "Tarde": (11 * 60, 17 * 60),
    "Noite": (17 * 60, 24 * 60),
}


def nomear_grupo(centro_minutos: float) -> str:
    for rotulo, (ini, fim) in ROTULOS_GRUPO.items():
        if ini <= centro_minutos < fim:
            return rotulo
    return "Outro"


def hhmm(minutos: float) -> str:
    m = int(round(minutos))
    return f"{m // 60:02d}:{m % 60:02d}"


# =====================================================================
#  carga
# =====================================================================


def carregar_eventos(caminho: str) -> pd.DataFrame:
    df = pd.read_csv(caminho)
    df["occurred_at"] = pd.to_datetime(df["occurred_at"], format="ISO8601")
    df["data"] = df["occurred_at"].dt.date
    df["minuto_do_dia"] = df["occurred_at"].dt.hour * 60 + df["occurred_at"].dt.minute
    for coluna in ("grams", "consumed_grams", "grams_target"):
        df[coluna] = pd.to_numeric(df[coluna])
    return df


# =====================================================================
#  1) K-MEANS — rotinas de alimentação
# =====================================================================


def agrupar_rotinas(df: pd.DataFrame):
    """Devolve (lista de grupos, k escolhido, silhueta, tabela de silhuetas)."""
    X = df[["minuto_do_dia"]].to_numpy(dtype=float)

    if len(X) < K_MINIMO + 1:
        return [], 0, float("nan"), {}

    silhuetas = {}
    for k in range(K_MINIMO, min(K_MAXIMO, len(X) - 1) + 1):
        modelo = KMeans(n_clusters=k, n_init=10, random_state=SEMENTE)
        rotulos = modelo.fit_predict(X)
        if len(set(rotulos)) < 2:
            continue
        silhuetas[k] = float(silhouette_score(X, rotulos))

    if not silhuetas:
        return [], 0, float("nan"), {}

    melhor_k = max(silhuetas, key=silhuetas.get)
    modelo = KMeans(n_clusters=melhor_k, n_init=10, random_state=SEMENTE)
    df = df.copy()
    df["grupo"] = modelo.fit_predict(X)

    grupos = []
    for indice in sorted(range(melhor_k), key=lambda i: modelo.cluster_centers_[i][0]):
        parte = df[df["grupo"] == indice]
        if parte.empty:
            continue
        minutos = parte["minuto_do_dia"].tolist()
        grupos.append(
            {
                "label": nomear_grupo(float(modelo.cluster_centers_[indice][0])),
                "centro_minutos": round(float(modelo.cluster_centers_[indice][0]), 1),
                "start_time": hhmm(min(minutos)),
                "end_time": hhmm(max(minutos)),
                "avg_portion_grams": round(float(parte["grams"].mean()), 2),
                "event_count": int(len(parte)),
                "desvio_horario_min": round(float(np.std(minutos)), 1),
                "times_in_minutes": [int(m) for m in minutos],
            }
        )

    # dois grupos podem cair na mesma faixa do dia; desempata pelo horário
    vistos = {}
    for g in grupos:
        vistos[g["label"]] = vistos.get(g["label"], 0) + 1
        if vistos[g["label"]] > 1:
            g["label"] = f'{g["label"]} {vistos[g["label"]]}'

    return grupos, melhor_k, silhuetas[melhor_k], silhuetas


# =====================================================================
#  2) Z-SCORE — anomalias de consumo diário
# =====================================================================


def detectar_anomalias(df: pd.DataFrame):
    # "Não retirada" é a refeição que o animal praticamente não tocou
    # (menos de 5% da porção). Cuidado para não confundir com a coluna
    # `consumed` do banco, que é falsa sempre que o consumo fica abaixo
    # de 80% — isso inclui o dia de consumo baixo, em que o animal comeu,
    # só comeu pouco. Sem essa distinção, todo dia de consumo baixo seria
    # rotulado como refeição não consumida, e os dois tipos de anomalia
    # ficariam indistinguíveis no relatório.
    df = df.copy()
    df["nao_retirada"] = df["consumed_grams"] < 0.05 * df["grams"]

    por_dia = df.groupby("data").agg(
        consumido=("consumed_grams", "sum"),
        liberado=("grams", "sum"),
        refeicoes=("id", "count"),
        nao_consumidas=("nao_retirada", "sum"),
    )

    if len(por_dia) < 3:
        return [], por_dia, {}

    media = float(por_dia["consumido"].mean())
    desvio = float(por_dia["consumido"].std(ddof=0))

    # Variante robusta: mediana e MAD. A média e o desvio-padrão são
    # puxados pelas próprias anomalias que se quer detectar; a mediana
    # não é. Serve de comparação na discussão do artigo.
    mediana = float(por_dia["consumido"].median())
    mad = float(np.median(np.abs(por_dia["consumido"] - mediana))) or 1e-9

    por_dia["z"] = (por_dia["consumido"] - media) / (desvio or 1e-9)
    por_dia["z_robusto"] = 0.6745 * (por_dia["consumido"] - mediana) / mad

    anomalias = []
    for data, linha in por_dia.iterrows():
        if abs(linha["z"]) < LIMIAR_Z:
            continue

        if int(linha["nao_consumidas"]) > 0 and linha["z"] < 0:
            tipo = "Refeição não consumida"
            descricao = (
                f'{int(linha["nao_consumidas"])} refeição(ões) liberada(s) e não retirada(s); '
                f'consumo do dia {linha["consumido"]:.0f} g contra média de {media:.0f} g'
            )
        elif linha["z"] < 0:
            queda = (1 - linha["consumido"] / media) * 100
            tipo = "Consumo abaixo da média"
            descricao = f"Consumo {queda:.0f}% abaixo da média diária do período"
        else:
            alta = (linha["consumido"] / media - 1) * 100
            tipo = "Consumo acima da média"
            descricao = f"Consumo {alta:.0f}% acima da média diária do período"

        severidade = "high" if abs(linha["z"]) >= 3 else "medium" if abs(linha["z"]) >= 2.5 else "low"

        anomalias.append(
            {
                "event_date": str(data),
                "type": tipo,
                "description": descricao,
                "z_score": round(float(linha["z"]), 3),
                "z_robusto": round(float(linha["z_robusto"]), 3),
                "severity": severidade,
                "consumido_g": round(float(linha["consumido"]), 2),
            }
        )

    estatisticas = {
        "media_diaria_g": round(media, 2),
        "desvio_padrao_g": round(desvio, 2),
        "mediana_diaria_g": round(mediana, 2),
        "mad_g": round(mad, 2),
        "limiar_z": LIMIAR_Z,
    }
    return anomalias, por_dia, estatisticas


# =====================================================================
#  3) validação contra o rótulo conhecido
# =====================================================================


def medir(dias_detectados, verdade):
    """Precisão, revocação e F1 de um conjunto de dias detectados."""
    dias_reais = set(verdade["data"].astype(str))

    vp = len(dias_reais & dias_detectados)
    fp = len(dias_detectados - dias_reais)
    fn = len(dias_reais - dias_detectados)

    precisao = vp / (vp + fp) if (vp + fp) else 0.0
    revocacao = vp / (vp + fn) if (vp + fn) else 0.0
    f1 = 2 * precisao * revocacao / (precisao + revocacao) if (precisao + revocacao) else 0.0

    por_tipo = {}
    for _, linha in verdade.iterrows():
        tipo = linha["tipo"]
        por_tipo.setdefault(tipo, {"injetadas": 0, "detectadas": 0})
        por_tipo[tipo]["injetadas"] += 1
        if str(linha["data"]) in dias_detectados:
            por_tipo[tipo]["detectadas"] += 1

    return {
        "anomalias_injetadas": len(dias_reais),
        "anomalias_detectadas": len(dias_detectados),
        "verdadeiros_positivos": vp,
        "falsos_positivos": fp,
        "falsos_negativos": fn,
        "precisao": round(precisao, 3),
        "revocacao": round(revocacao, 3),
        "f1": round(f1, 3),
        "por_tipo": por_tipo,
        "dias_nao_detectados": sorted(dias_reais - dias_detectados),
    }


def validar(anomalias, por_dia, caminho_rotulos):
    """
    Compara os dois detectores contra as anomalias injetadas.

    O Z-score clássico usa média e desvio-padrão. O problema é que as
    próprias anomalias entram nessa conta e inflam o desvio — é o efeito
    de mascaramento. A variante robusta troca média por mediana e desvio
    por MAD, que quase não se movem com uma minoria de valores extremos.
    Medir os dois lado a lado é o que mostra o tamanho do efeito.
    """
    if not os.path.exists(caminho_rotulos):
        return None

    verdade = pd.read_csv(caminho_rotulos)
    classico = medir({a["event_date"] for a in anomalias}, verdade)
    robusto = medir(
        {str(d) for d, l in por_dia.iterrows() if abs(l["z_robusto"]) > LIMIAR_Z_ROBUSTO},
        verdade,
    )
    return {
        "z_classico": {**classico, "limiar": LIMIAR_Z},
        "z_robusto": {**robusto, "limiar": LIMIAR_Z_ROBUSTO},
    }


# =====================================================================
#  envio opcional ao Supabase
# =====================================================================


def enviar_supabase(periodo, grupos, anomalias, total_eventos, dataset_kind):
    import requests  # só é exigido quando se usa --enviar-supabase

    url = os.environ.get("SUPABASE_URL")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE")
    if not url or not chave:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE no ambiente.")

    cabecalhos = {
        "apikey": chave,
        "Authorization": f"Bearer {chave}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    execucao = requests.post(
        f"{url}/rest/v1/analysis_runs",
        headers=cabecalhos,
        json={
            "device_id": DEVICE_ID,
            "period_days": periodo,
            "events_count": total_eventos,
            "dataset_kind": dataset_kind,
            "k_clusters": len(grupos),
            "z_threshold": LIMIAR_Z,
            "notes": "gerado por pipeline_analise.py",
        },
        timeout=30,
    )
    execucao.raise_for_status()
    run_id = execucao.json()[0]["id"]

    if grupos:
        requests.post(
            f"{url}/rest/v1/analysis_clusters",
            headers=cabecalhos,
            json=[
                {
                    "run_id": run_id,
                    "device_id": DEVICE_ID,
                    "label": g["label"],
                    "start_time": g["start_time"],
                    "end_time": g["end_time"],
                    "avg_portion_grams": g["avg_portion_grams"],
                    "event_count": g["event_count"],
                    "times_in_minutes": g["times_in_minutes"],
                }
                for g in grupos
            ],
            timeout=30,
        ).raise_for_status()

    if anomalias:
        requests.post(
            f"{url}/rest/v1/analysis_anomalies",
            headers=cabecalhos,
            json=[
                {
                    "run_id": run_id,
                    "device_id": DEVICE_ID,
                    "event_date": a["event_date"],
                    "type": a["type"],
                    "description": a["description"],
                    "z_score": a["z_score"],
                    "severity": a["severity"],
                }
                for a in anomalias
            ],
            timeout=30,
        ).raise_for_status()

    print(f"  -> enviado ao Supabase (run_id {run_id})")


# =====================================================================
#  principal
# =====================================================================


def main():
    p = argparse.ArgumentParser(description="K-means e Z-score sobre o histórico de alimentação.")
    p.add_argument("--dados", default="dados", help="pasta com os CSVs")
    p.add_argument("--saida", default="resultados", help="pasta de saída")
    p.add_argument("--enviar-supabase", action="store_true", help="grava nas tabelas analysis_*")
    args = p.parse_args()

    caminho = os.path.join(args.dados, "feeding_events_sintetico.csv")
    if not os.path.exists(caminho):
        sys.exit(f"Não achei {caminho}. Rode antes: python gerar_dataset.py")

    os.makedirs(args.saida, exist_ok=True)
    df_total = carregar_eventos(caminho)
    dataset_kind = "synthetic" if (df_total["source"] == "synthetic").all() else "mixed"

    referencia = df_total["occurred_at"].max()
    relatorio = {
        "gerado_em": datetime.now().astimezone().isoformat(),
        "arquivo_origem": os.path.basename(caminho),
        "total_eventos": int(len(df_total)),
        "dataset_kind": dataset_kind,
        "parametros": {"limiar_z": LIMIAR_Z, "k_testado": [K_MINIMO, K_MAXIMO], "semente": SEMENTE},
        "periodos": {},
    }

    for periodo in PERIODOS:
        corte = referencia - pd.Timedelta(days=periodo)
        df = df_total[df_total["occurred_at"] >= corte]
        if df.empty:
            continue

        grupos, k, silhueta, silhuetas = agrupar_rotinas(df)
        anomalias, por_dia, estatisticas = detectar_anomalias(df)
        validacao = (
            validar(anomalias, por_dia, os.path.join(args.dados, "ground_truth_anomalias.csv"))
            if periodo == 90
            else None
        )

        print(f"\n=== Período de {periodo} dias — {len(df)} eventos ===")
        print(f"  K-means: k={k} (silhueta {silhueta:.3f})")
        for g in grupos:
            print(
                f'    {g["label"]:<10} {g["start_time"]}–{g["end_time"]}  '
                f'{g["event_count"]:>3} refeições  média {g["avg_portion_grams"]:.0f} g  '
                f'±{g["desvio_horario_min"]:.0f} min'
            )
        print(f"  Z-score: {len(anomalias)} dia(s) anômalo(s)")
        if estatisticas:
            print(
                f'    média {estatisticas["media_diaria_g"]:.0f} g/dia, '
                f'desvio {estatisticas["desvio_padrao_g"]:.0f} g, limiar |z| > {LIMIAR_Z}'
            )
        if validacao:
            print("  Validação contra as anomalias injetadas:")
            print(f'    {"detector":<26}{"VP":>4}{"FP":>4}{"FN":>4}{"prec.":>8}{"revoc.":>8}{"F1":>7}')
            for nome, v in (("Z-score clássico", validacao["z_classico"]),
                            ("Z-score robusto (MAD)", validacao["z_robusto"])):
                print(
                    f'    {nome + " |z|>" + str(v["limiar"]):<26}'
                    f'{v["verdadeiros_positivos"]:>4}{v["falsos_positivos"]:>4}{v["falsos_negativos"]:>4}'
                    f'{v["precisao"]:>8.2f}{v["revocacao"]:>8.2f}{v["f1"]:>7.2f}'
                )
            for nome, v in (("clássico", validacao["z_classico"]),
                            ("robusto", validacao["z_robusto"])):
                detalhe = ", ".join(
                    f'{t}: {d["detectadas"]}/{d["injetadas"]}' for t, d in v["por_tipo"].items()
                )
                print(f"    por tipo ({nome}): {detalhe}")

        relatorio["periodos"][str(periodo)] = {
            "eventos": int(len(df)),
            "dias": int(por_dia.shape[0]),
            "k_escolhido": k,
            "silhueta": round(float(silhueta), 4) if silhueta == silhueta else None,
            "silhueta_por_k": {str(kk): round(v, 4) for kk, v in silhuetas.items()},
            "clusters": grupos,
            "estatisticas_consumo": estatisticas,
            "anomalias": anomalias,
            "validacao": validacao,
        }

        if periodo == 90:
            pd.DataFrame(grupos).drop(columns=["times_in_minutes"], errors="ignore").to_csv(
                os.path.join(args.saida, "analysis_clusters.csv"), index=False
            )
            pd.DataFrame(anomalias).to_csv(
                os.path.join(args.saida, "analysis_anomalies.csv"), index=False
            )
            por_dia.to_csv(os.path.join(args.saida, "consumo_diario.csv"))

        if args.enviar_supabase:
            enviar_supabase(periodo, grupos, anomalias, len(df), dataset_kind)

    caminho_relatorio = os.path.join(args.saida, "RESULTADO_ANALISE.json")
    with open(caminho_relatorio, "w", encoding="utf-8") as f:
        json.dump(relatorio, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\nRelatório completo em {caminho_relatorio}")


if __name__ == "__main__":
    main()
