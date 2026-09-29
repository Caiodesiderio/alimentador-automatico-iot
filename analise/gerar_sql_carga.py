#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera as migrations de carga do conjunto sintético no Supabase.

Por que existir: importar CSV pela interface do Supabase é lento e frágil
com 3 mil linhas. Um arquivo .sql que se cola no SQL Editor é mais rápido,
some com a chance de erro de mapeamento de coluna, e — o que mais importa
para um trabalho acadêmico — deixa a carga do banco versionada junto com
o resto, reprodutível por qualquer pessoa que clone o repositório.

Produz:
    supabase/migrations/0006_carga_dataset_sintetico.sql   (277 refeições)
    supabase/migrations/0007_carga_leituras_peso.sql       (2.700 pesagens)
    supabase/migrations/0008_carga_resultados_analise.sql  (K-means e Z-score)

Uso:
    python gerar_sql_carga.py
"""

import csv
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
DADOS = os.path.join(AQUI, "dados")
RESULTADOS = os.path.join(AQUI, "resultados")
SAIDA = os.path.join(RAIZ, "supabase", "migrations")

DEVICE_ID = "esp32-01"
LOTE = 200  # linhas por comando INSERT


def txt(valor) -> str:
    """Literal de texto SQL, com aspas simples escapadas."""
    if valor is None or valor == "":
        return "null"
    return "'" + str(valor).replace("'", "''") + "'"


def num(valor) -> str:
    return "null" if valor in (None, "") else str(valor)


def escrever_em_lotes(f, comando, colunas, linhas):
    for inicio in range(0, len(linhas), LOTE):
        fatia = linhas[inicio : inicio + LOTE]
        f.write(f"{comando} ({', '.join(colunas)}) values\n")
        f.write(",\n".join("  (" + ", ".join(v) + ")" for v in fatia))
        f.write(";\n\n")


# ---------------------------------------------------------------- 0006
def gerar_eventos():
    with open(os.path.join(DADOS, "feeding_events_sintetico.csv"), encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))

    valores = [
        [
            txt(e["id"]),
            txt(DEVICE_ID),
            txt(e["occurred_at"]),
            txt(e["trigger"]),
            num(e["grams_target"]),
            num(e["grams"]),
            num(e["bowl_grams_after"]),
            num(e["consumed_grams"]),
            "true" if e["consumed"] == "true" else "false",
            txt(e["settled_at"]),
            "'synthetic'",
        ]
        for e in linhas
    ]

    caminho = os.path.join(SAIDA, "0006_carga_dataset_sintetico.sql")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(
            "-- =====================================================================\n"
            "-- Migration 0006: carga do conjunto SINTÉTICO de alimentação\n"
            "-- =====================================================================\n"
            f"-- {len(linhas)} registros, de 2026-07-01 a 2026-09-28 (90 dias).\n"
            "--\n"
            "-- Gerado por analise/gerar_sql_carga.py a partir de\n"
            "-- analise/dados/feeding_events_sintetico.csv. Não editar à mão.\n"
            "--\n"
            "-- ATENÇÃO — ESTES DADOS SÃO SIMULADOS.\n"
            "-- Toda linha vai com source = 'synthetic'. É essa coluna que faz o\n"
            "-- aplicativo mostrar o aviso \"Dados simulados — em validação técnica\".\n"
            "-- Quando a coleta real começar, os registros do hardware chegam com\n"
            "-- source = 'device' e o aviso muda sozinho.\n"
            "--\n"
            "-- Os eventos já vêm com settled_at preenchido, ou seja, encerrados.\n"
            "-- Isso é proposital: o gatilho que recalcula consumo só mexe em evento\n"
            "-- aberto, então a carga não altera os valores do conjunto.\n"
            "--\n"
            "-- Pode rodar de novo sem duplicar: os ids são determinísticos e há\n"
            "-- on conflict do nothing.\n"
            "-- =====================================================================\n\n"
        )
        escrever_em_lotes(
            f,
            "insert into public.feeding_events",
            ["id", "device_id", "occurred_at", "trigger", "grams_target", "grams",
             "bowl_grams_after", "consumed_grams", "consumed", "settled_at", "source"],
            valores,
        )
        f.write("-- o on conflict fica no fim de cada lote acima via este ajuste:\n")
    # aplica o on conflict em cada insert
    conteudo = open(caminho, encoding="utf-8").read()
    conteudo = conteudo.replace(";\n\n", "\non conflict (id) do nothing;\n\n")
    conteudo = conteudo.split("-- o on conflict fica")[0]
    conteudo += (
        "-- conferência\n"
        "select count(*) as eventos_sinteticos,\n"
        "       min(occurred_at)::date as inicio,\n"
        "       max(occurred_at)::date as fim\n"
        "  from public.feeding_events where source = 'synthetic';\n"
    )
    open(caminho, "w", encoding="utf-8").write(conteudo)
    return len(linhas)


# ---------------------------------------------------------------- 0007
def gerar_leituras():
    with open(os.path.join(DADOS, "food_readings_sintetico.csv"), encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))

    valores = [[txt(DEVICE_ID), num(r["bowl_grams"]), txt(r["read_at"])] for r in linhas]

    caminho = os.path.join(SAIDA, "0007_carga_leituras_peso.sql")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(
            "-- =====================================================================\n"
            "-- Migration 0007: carga das leituras de peso da tigela (OPCIONAL)\n"
            "-- =====================================================================\n"
            f"-- {len(linhas)} leituras sintéticas, uma a cada 20 min nas 3 h\n"
            "-- seguintes a cada refeição.\n"
            "--\n"
            "-- É opcional: o K-means e o Z-score trabalham sobre feeding_events,\n"
            "-- não sobre esta série. Ela serve para as telas do aplicativo terem\n"
            "-- uma curva de peso para mostrar.\n"
            "--\n"
            "-- Arquivo grande. Se o SQL Editor engasgar, rode em duas partes ou\n"
            "-- simplesmente pule — nada depende dele.\n"
            "-- =====================================================================\n\n"
        )
        escrever_em_lotes(
            f,
            "insert into public.food_readings",
            ["device_id", "bowl_grams", "read_at"],
            valores,
        )
        f.write(
            "-- conferência\n"
            "select count(*) as leituras, min(read_at)::date as inicio,\n"
            "       max(read_at)::date as fim from public.food_readings;\n"
        )
    return len(linhas)


# ---------------------------------------------------------------- 0008
def gerar_analise():
    with open(os.path.join(RESULTADOS, "RESULTADO_ANALISE.json"), encoding="utf-8") as f:
        relatorio = json.load(f)

    caminho = os.path.join(SAIDA, "0008_carga_resultados_analise.sql")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(
            "-- =====================================================================\n"
            "-- Migration 0008: resultados do K-means e do Z-score\n"
            "-- =====================================================================\n"
            "-- Saída de analise/pipeline_analise.py sobre o conjunto sintético,\n"
            "-- para os períodos de 7, 30 e 90 dias — os três que o aplicativo\n"
            "-- oferece na aba Análise.\n"
            "--\n"
            "-- Sem esta carga a aba Análise mostra o gráfico de consumo (que é\n"
            "-- calculado do próprio histórico) mas nenhum agrupamento e nenhuma\n"
            "-- anomalia, porque essas duas coisas vêm do pipeline.\n"
            "--\n"
            "-- dataset_kind = 'synthetic' em toda execução: é o que mantém o aviso\n"
            "-- de dados simulados aceso na tela.\n"
            "--\n"
            "-- Gerado por analise/gerar_sql_carga.py. Não editar à mão.\n"
            "-- =====================================================================\n\n"
            "-- limpa execuções anteriores deste dispositivo (clusters e anomalias\n"
            "-- saem junto, por causa do on delete cascade)\n"
            f"delete from public.analysis_runs where device_id = {txt(DEVICE_ID)};\n\n"
        )

        for periodo, dados in relatorio["periodos"].items():
            silhueta = dados.get("silhueta")
            limiar = relatorio["parametros"]["limiar_z"]
            semente = relatorio["parametros"]["semente"]
            nota = txt(
                f"pipeline_analise.py; k escolhido por silhueta ({silhueta}); semente {semente}"
            )
            f.write(f"-- ---------- período de {periodo} dias ----------\n")
            f.write("with execucao as (\n")
            f.write(
                "  insert into public.analysis_runs\n"
                "    (device_id, period_days, events_count, dataset_kind, k_clusters, z_threshold, notes)\n"
                f"  values ({txt(DEVICE_ID)}, {periodo}, {dados['eventos']}, 'synthetic', "
                f"{dados['k_escolhido']}, {limiar}, {nota})\n"
                "  returning id\n)\n"
            )

            grupos = dados["clusters"]
            anomalias = dados["anomalias"]

            partes = []
            if grupos:
                linhas = ",\n".join(
                    "    (" + ", ".join([
                        txt(g["label"]),
                        txt(g["start_time"]),
                        txt(g["end_time"]),
                        str(g["avg_portion_grams"]),
                        str(g["event_count"]),
                        txt("{" + ",".join(str(m) for m in g["times_in_minutes"]) + "}"),
                    ]) + ")"
                    for g in grupos
                )
                partes.append(
                    "grupos as (\n"
                    "  insert into public.analysis_clusters\n"
                    "    (run_id, device_id, label, start_time, end_time, avg_portion_grams,\n"
                    "     event_count, times_in_minutes)\n"
                    f"  select execucao.id, {txt(DEVICE_ID)}, v.label, v.inicio::time, v.fim::time,\n"
                    "         v.porcao, v.eventos, v.minutos::integer[]\n"
                    "    from execucao,\n"
                    "         (values\n" + linhas + "\n"
                    "         ) as v(label, inicio, fim, porcao, eventos, minutos)\n"
                    "  returning 1\n)"
                )

            if anomalias:
                linhas = ",\n".join(
                    "    (" + ", ".join([
                        txt(a["event_date"]),
                        txt(a["type"]),
                        txt(a["description"]),
                        str(a["z_score"]),
                        txt(a["severity"]),
                    ]) + ")"
                    for a in anomalias
                )
                partes.append(
                    "desvios as (\n"
                    "  insert into public.analysis_anomalies\n"
                    "    (run_id, device_id, event_date, type, description, z_score, severity)\n"
                    f"  select execucao.id, {txt(DEVICE_ID)}, v.data::date, v.tipo, v.descricao,\n"
                    "         v.z, v.severidade\n"
                    "    from execucao,\n"
                    "         (values\n" + linhas + "\n"
                    "         ) as v(data, tipo, descricao, z, severidade)\n"
                    "  returning 1\n)"
                )

            if partes:
                f.write(", " + ",\n".join(partes) + "\n")
                f.write("select 'periodo " + periodo + " dias carregado' as status;\n\n")
            else:
                f.write("select 'periodo " + periodo + " dias sem resultados' as status;\n\n")

        f.write(
            "-- conferência\n"
            "select r.period_days, r.events_count, r.k_clusters, r.dataset_kind,\n"
            "       (select count(*) from public.analysis_clusters c where c.run_id = r.id) as grupos,\n"
            "       (select count(*) from public.analysis_anomalies a where a.run_id = r.id) as anomalias\n"
            "  from public.analysis_runs r\n"
            f" where r.device_id = {txt(DEVICE_ID)}\n"
            " order by r.period_days;\n"
        )


def main():
    os.makedirs(SAIDA, exist_ok=True)
    n_eventos = gerar_eventos()
    n_leituras = gerar_leituras()
    gerar_analise()
    print("Migrations de carga geradas em supabase/migrations/")
    print(f"  0006_carga_dataset_sintetico.sql .... {n_eventos} refeições")
    print(f"  0007_carga_leituras_peso.sql ........ {n_leituras} pesagens (opcional)")
    print("  0008_carga_resultados_analise.sql ... K-means e Z-score dos 3 períodos")


if __name__ == "__main__":
    main()
