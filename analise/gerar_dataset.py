#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gerador do conjunto de dados SINTÉTICO do alimentador automático.

PIBIC SISPROJ 59635 — UEA — Eng. de Controle e Automação
Orientação: Prof. Dr. Almir Kimura Júnior

=======================================================================
POR QUE ESTE CONJUNTO É SINTÉTICO
=======================================================================
O protótipo ainda está em bancada e nenhum animal foi monitorado até
agora. Os algoritmos de análise (K-means e Z-score), porém, precisavam
ser validados antes de existir coleta real. Este script produz um
conjunto artificial com estatísticas plausíveis para essa validação.

O conjunto NÃO representa medições de um animal real e não deve ser
usado para nenhuma conclusão sobre comportamento animal. Essa limitação
foi declarada formalmente aos avaliadores do artigo.

=======================================================================
POR QUE ELE É REPRODUTÍVEL
=======================================================================
1. A semente do gerador é fixa (SEMENTE).
2. O período é fixo (DATA_INICIAL a DATA_FINAL), e não "os últimos 90
   dias" — do contrário o conjunto mudaria a cada execução e o número
   citado no artigo deixaria de bater.
3. Os identificadores são UUIDv5 derivados de um namespace fixo, então
   a mesma linha recebe sempre o mesmo id.
4. Usa apenas a biblioteca padrão do Python. Sem dependência, sem
   diferença de versão de numpy mudando o resultado.

Rodar duas vezes produz arquivos byte a byte idênticos.

=======================================================================
ANOMALIAS COM RÓTULO CONHECIDO
=======================================================================
As anomalias são injetadas em dias escolhidos de propósito, e o rótulo
de cada uma é salvo à parte (ground_truth_anomalias.csv). Isso permite
MEDIR o acerto do detector Z-score em vez de só olhar o gráfico e achar
que ficou bom. É o que transforma "implementamos Z-score" em "o Z-score
detectou N de M anomalias injetadas".

Uso:
    python gerar_dataset.py
    python gerar_dataset.py --saida ./dados
"""

import argparse
import csv
import json
import random
import uuid
from datetime import date, datetime, timedelta, timezone

# =====================================================================
#  PARÂMETROS FIXOS — mudar qualquer um destes muda o conjunto inteiro
# =====================================================================

SEMENTE = 59635  # o número do SISPROJ, para ser fácil de lembrar e citar

DATA_INICIAL = date(2026, 7, 1)
DATA_FINAL = date(2026, 9, 28)  # inclusive -> 90 dias completos

DEVICE_ID = "esp32-01"
FUSO = timezone(timedelta(hours=-4))  # America/Manaus, sem horário de verão

# Namespace fixo para os UUIDs determinísticos
NAMESPACE = uuid.UUID("6f1c9a7e-1f2b-5d3c-9e4a-7b8c9d0e1f20")

# Perfil alimentar: cão de porte médio, 8,4 kg, meta de 360 g/dia.
# Três refeições, com desvio de horário típico de rotina doméstica.
REFEICOES = [
    {"rotulo": "Manhã", "hora": 7, "minuto": 0, "porcao": 120, "desvio_min": 9},
    {"rotulo": "Tarde", "hora": 12, "minuto": 30, "porcao": 100, "desvio_min": 12},
    {"rotulo": "Noite", "hora": 19, "minuto": 0, "porcao": 140, "desvio_min": 10},
]

DESVIO_PORCAO_G = 4.0  # dispersão da porção realmente liberada (malha fechada)
CONSUMO_NORMAL = (0.90, 1.00)  # fração da porção consumida em dia normal
PROB_REFEICAO_MANUAL = 0.08  # parte das refeições disparadas pelo app
PROB_EXTRA_MANUAL = 0.07  # dias que ganham um petisco fora de hora

# Anomalias injetadas: dia do período (0 = DATA_INICIAL) -> tipo
#   skipped = ração liberada e não retirada
#   low     = consumo muito abaixo da média
#   high    = consumo muito acima da média
ANOMALIAS = {
    9: "low",
    16: "skipped",
    24: "high",
    31: "low",
    38: "skipped",
    45: "high",
    52: "low",
    58: "skipped",
    66: "high",
    71: "low",
    79: "skipped",
    86: "low",
}

CAPACIDADE_TIGELA_RESIDUO = 6.0  # sobra típica na tigela entre refeições


# =====================================================================
#  geração
# =====================================================================


def uuid_determinstico(chave: str) -> str:
    return str(uuid.uuid5(NAMESPACE, chave))


def gerar():
    rnd = random.Random(SEMENTE)
    total_dias = (DATA_FINAL - DATA_INICIAL).days + 1

    eventos = []
    leituras = []
    rotulos = []

    for indice_dia in range(total_dias):
        dia = DATA_INICIAL + timedelta(days=indice_dia)
        anomalia = ANOMALIAS.get(indice_dia)
        if anomalia:
            rotulos.append({"data": dia.isoformat(), "tipo": anomalia})

        # sobra na tigela do dia anterior
        peso_tigela = round(max(0.0, rnd.gauss(CAPACIDADE_TIGELA_RESIDUO, 2.0)), 2)

        for ordem, refeicao in enumerate(REFEICOES):
            minuto_base = refeicao["hora"] * 60 + refeicao["minuto"]
            minuto = int(round(rnd.gauss(minuto_base, refeicao["desvio_min"])))
            minuto = max(0, min(24 * 60 - 1, minuto))

            momento = datetime(
                dia.year, dia.month, dia.day, minuto // 60, minuto % 60,
                rnd.randint(0, 59), tzinfo=FUSO,
            )

            alvo = float(refeicao["porcao"])
            # Quanto realmente caiu. A malha fechada segura o erro em
            # poucos gramas — é por isso que o desvio aqui é pequeno.
            liberado = round(max(5.0, rnd.gauss(alvo, DESVIO_PORCAO_G)), 2)

            # Uma anomalia "high" significa porção extra liberada pelo tutor
            if anomalia == "high" and ordem == 2:
                liberado = round(liberado + rnd.uniform(55, 75), 2)

            peso_apos = round(peso_tigela + liberado, 2)

            # Quanto o animal retirou da tigela
            if anomalia == "skipped" and ordem == 1:
                consumido = 0.0
            elif anomalia == "low":
                consumido = round(liberado * rnd.uniform(0.25, 0.45), 2)
            elif anomalia == "high" and ordem == 2:
                consumido = round(liberado * rnd.uniform(0.95, 1.0), 2)
            else:
                consumido = round(liberado * rnd.uniform(*CONSUMO_NORMAL), 2)

            consumido = min(consumido, liberado)
            consumiu_tudo = consumido >= 0.8 * liberado

            disparo = "manual" if rnd.random() < PROB_REFEICAO_MANUAL else "scheduled"
            encerrado = momento + timedelta(minutes=rnd.randint(25, 180))

            chave = f"{dia.isoformat()}#{ordem}"
            eventos.append(
                {
                    "id": uuid_determinstico(chave),
                    "device_id": DEVICE_ID,
                    "occurred_at": momento.isoformat(),
                    "trigger": disparo,
                    "grams_target": f"{alvo:.2f}",
                    "grams": f"{liberado:.2f}",
                    "bowl_grams_after": f"{peso_apos:.2f}",
                    "consumed_grams": f"{consumido:.2f}",
                    "consumed": "true" if consumiu_tudo else "false",
                    "settled_at": encerrado.isoformat(),
                    "source": "synthetic",
                }
            )

            # Série de peso da tigela: uma leitura a cada 20 min durante
            # 3 h após a refeição, com o peso caindo conforme o animal come.
            passos = 9
            for passo in range(passos + 1):
                fracao = passo / passos
                # o consumo não é linear: o animal come mais no começo
                comido = consumido * (1 - (1 - fracao) ** 2)
                leituras.append(
                    {
                        "device_id": DEVICE_ID,
                        "bowl_grams": f"{max(0.0, peso_apos - comido):.2f}",
                        "read_at": (momento + timedelta(minutes=20 * passo)).isoformat(),
                        "source": "synthetic",
                    }
                )

            peso_tigela = round(max(0.0, peso_apos - consumido), 2)

        # petisco fora de hora
        if rnd.random() < PROB_EXTRA_MANUAL:
            minuto = rnd.randint(15 * 60, 17 * 60)
            momento = datetime(
                dia.year, dia.month, dia.day, minuto // 60, minuto % 60,
                rnd.randint(0, 59), tzinfo=FUSO,
            )
            alvo = float(rnd.choice([30, 40, 50]))
            liberado = round(max(5.0, rnd.gauss(alvo, 3.0)), 2)
            peso_apos = round(peso_tigela + liberado, 2)
            consumido = round(liberado * rnd.uniform(0.85, 1.0), 2)
            eventos.append(
                {
                    "id": uuid_determinstico(f"{dia.isoformat()}#extra"),
                    "device_id": DEVICE_ID,
                    "occurred_at": momento.isoformat(),
                    "trigger": "manual",
                    "grams_target": f"{alvo:.2f}",
                    "grams": f"{liberado:.2f}",
                    "bowl_grams_after": f"{peso_apos:.2f}",
                    "consumed_grams": f"{consumido:.2f}",
                    "consumed": "true",
                    "settled_at": (momento + timedelta(minutes=rnd.randint(20, 90))).isoformat(),
                    "source": "synthetic",
                }
            )
            peso_tigela = round(max(0.0, peso_apos - consumido), 2)

    eventos.sort(key=lambda e: e["occurred_at"])
    leituras.sort(key=lambda r: r["read_at"])
    return eventos, leituras, rotulos, total_dias


# =====================================================================
#  saída
# =====================================================================


def escrever_csv(caminho, linhas, colunas):
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=colunas)
        escritor.writeheader()
        escritor.writerows(linhas)


def main():
    p = argparse.ArgumentParser(description="Gera o conjunto sintético do alimentador.")
    p.add_argument("--saida", default="dados", help="pasta de saída (padrão: dados)")
    args = p.parse_args()

    import os

    os.makedirs(args.saida, exist_ok=True)

    eventos, leituras, rotulos, total_dias = gerar()

    escrever_csv(
        os.path.join(args.saida, "feeding_events_sintetico.csv"),
        eventos,
        ["id", "device_id", "occurred_at", "trigger", "grams_target", "grams",
         "bowl_grams_after", "consumed_grams", "consumed", "settled_at", "source"],
    )
    escrever_csv(
        os.path.join(args.saida, "food_readings_sintetico.csv"),
        leituras,
        ["device_id", "bowl_grams", "read_at", "source"],
    )
    escrever_csv(
        os.path.join(args.saida, "ground_truth_anomalias.csv"),
        rotulos,
        ["data", "tipo"],
    )

    # ------------------------------------------------------------------
    # Estatísticas. São ESTES números que vão para o formulário da
    # Samsung e para o artigo — nada é digitado à mão em lugar nenhum.
    # ------------------------------------------------------------------
    consumo_total = sum(float(e["consumed_grams"]) for e in eventos)
    liberado_total = sum(float(e["grams"]) for e in eventos)
    manuais = sum(1 for e in eventos if e["trigger"] == "manual")

    por_tipo = {}
    for r in rotulos:
        por_tipo[r["tipo"]] = por_tipo.get(r["tipo"], 0) + 1

    info = {
        "nome": "PetFeeder-Synthetic-FeedingLog",
        "versao": "1.0",
        "semente": SEMENTE,
        "periodo_inicio": DATA_INICIAL.isoformat(),
        "periodo_fim": DATA_FINAL.isoformat(),
        "dias_cobertos": total_dias,
        "registros_feeding_events": len(eventos),
        "registros_food_readings": len(leituras),
        "dias_com_anomalia_injetada": len(rotulos),
        "anomalias_por_tipo": por_tipo,
        "refeicoes_agendadas": len(eventos) - manuais,
        "refeicoes_manuais": manuais,
        "racao_liberada_total_g": round(liberado_total, 2),
        "racao_consumida_total_g": round(consumo_total, 2),
        "consumo_medio_diario_g": round(consumo_total / total_dias, 2),
        "animais": 1,
        "dispositivos": 1,
        "origem": "self-produced synthetic",
        "contem_dado_pessoal": False,
        "contem_dado_de_animal_real": False,
        "contem_dado_de_terceiros": False,
    }

    with open(os.path.join(args.saida, "DATASET_INFO.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print("Conjunto gerado em:", os.path.abspath(args.saida))
    print()
    for chave, valor in info.items():
        print(f"  {chave:.<34} {valor}")


if __name__ == "__main__":
    main()
