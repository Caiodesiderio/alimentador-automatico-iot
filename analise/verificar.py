#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verificação independente do conjunto de dados e da análise.

Este script existe para que QUALQUER PESSOA possa conferir sozinha, sem
acesso ao banco de ninguém e sem falar com os autores, que:

  1. os arquivos publicados são exatamente os que a documentação descreve
     (conferência por SHA-256);
  2. o gerador é reprodutível — regerar do zero produz os MESMOS arquivos,
     byte a byte;
  3. os números citados no DATASET.md e no artigo saem mesmo do pipeline,
     e não foram digitados à mão.

Qualquer divergência derruba o script com código de saída 1 e diz qual.

Uso:
    pip install -r requirements.txt
    python verificar.py
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))

# Valores publicados. Se o pipeline passar a devolver outra coisa, este
# script acusa — é essa a função dele.
ESPERADO = {
    "registros_feeding_events": 277,
    "registros_food_readings": 2700,
    "dias_cobertos": 90,
    "dias_com_anomalia_injetada": 12,
    "periodo_inicio": "2026-07-01",
    "periodo_fim": "2026-09-28",
    "consumo_medio_diario_g": 331.28,
    "k_90_dias": 4,
    "silhueta_90_dias": 0.946,
    "z_classico_detectadas": 5,
    "z_classico_injetadas": 12,
    "z_robusto_detectadas": 12,
}

falhas = []


def ok(texto):
    print(f"  \033[92mOK\033[0m   {texto}")


def falhou(texto):
    print(f"  \033[91mFALHA\033[0m {texto}")
    falhas.append(texto)


def sha256(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def quase_igual(a, b, tolerancia=0.001):
    return abs(float(a) - float(b)) <= tolerancia


# =====================================================================
print("\n[1/4] Integridade dos arquivos publicados (SHA-256)")
# =====================================================================
caminho_checksums = os.path.join(AQUI, "CHECKSUMS.sha256")
if not os.path.exists(caminho_checksums):
    falhou("CHECKSUMS.sha256 não encontrado")
else:
    for linha in open(caminho_checksums, encoding="utf-8"):
        linha = linha.strip()
        if not linha:
            continue
        esperado, arquivo = linha.split(None, 1)
        caminho = os.path.join(AQUI, arquivo.strip())
        if not os.path.exists(caminho):
            falhou(f"{arquivo} não existe")
        elif sha256(caminho) == esperado:
            ok(f"{arquivo}")
        else:
            falhou(f"{arquivo} tem conteúdo diferente do publicado")

# =====================================================================
print("\n[2/4] Reprodutibilidade — regerando o conjunto do zero")
# =====================================================================
temporario = tempfile.mkdtemp(prefix="verificacao_")
try:
    subprocess.run(
        [sys.executable, os.path.join(AQUI, "gerar_dataset.py"), "--saida", temporario],
        check=True, capture_output=True, text=True,
    )
    for arquivo in ["feeding_events_sintetico.csv", "food_readings_sintetico.csv",
                    "ground_truth_anomalias.csv", "DATASET_INFO.json"]:
        original = os.path.join(AQUI, "dados", arquivo)
        novo = os.path.join(temporario, arquivo)
        if not os.path.exists(novo):
            falhou(f"{arquivo} não foi gerado")
        elif sha256(original) == sha256(novo):
            ok(f"{arquivo} idêntico ao publicado")
        else:
            falhou(f"{arquivo} MUDOU ao ser regerado — gerador não é determinístico")
except subprocess.CalledProcessError as e:
    falhou(f"gerar_dataset.py falhou: {e.stderr[:300]}")
finally:
    shutil.rmtree(temporario, ignore_errors=True)

# =====================================================================
print("\n[3/4] Números do conjunto conferem com o DATASET.md")
# =====================================================================
caminho_info = os.path.join(AQUI, "dados", "DATASET_INFO.json")
if not os.path.exists(caminho_info):
    falhou("DATASET_INFO.json não encontrado")
else:
    info = json.load(open(caminho_info, encoding="utf-8"))
    for chave in ["registros_feeding_events", "registros_food_readings", "dias_cobertos",
                  "dias_com_anomalia_injetada", "periodo_inicio", "periodo_fim"]:
        if str(info.get(chave)) == str(ESPERADO[chave]):
            ok(f"{chave} = {info[chave]}")
        else:
            falhou(f"{chave}: publicado {ESPERADO[chave]}, encontrado {info.get(chave)}")

    if quase_igual(info.get("consumo_medio_diario_g", 0), ESPERADO["consumo_medio_diario_g"], 0.01):
        ok(f"consumo_medio_diario_g = {info['consumo_medio_diario_g']}")
    else:
        falhou(f"consumo médio: publicado {ESPERADO['consumo_medio_diario_g']}, "
               f"encontrado {info.get('consumo_medio_diario_g')}")

    for chave in ["contem_dado_pessoal", "contem_dado_de_animal_real", "contem_dado_de_terceiros"]:
        if info.get(chave) is False:
            ok(f"{chave} = false")
        else:
            falhou(f"{chave} deveria ser false")

# =====================================================================
print("\n[4/4] Resultados do K-means e do Z-score")
# =====================================================================
saida_temp = tempfile.mkdtemp(prefix="resultados_")
try:
    subprocess.run(
        [sys.executable, os.path.join(AQUI, "pipeline_analise.py"),
         "--dados", os.path.join(AQUI, "dados"), "--saida", saida_temp],
        check=True, capture_output=True, text=True,
    )
    relatorio = json.load(open(os.path.join(saida_temp, "RESULTADO_ANALISE.json"), encoding="utf-8"))
    p90 = relatorio["periodos"]["90"]

    if p90["k_escolhido"] == ESPERADO["k_90_dias"]:
        ok(f"K-means escolheu k = {p90['k_escolhido']} em 90 dias")
    else:
        falhou(f"k: publicado {ESPERADO['k_90_dias']}, encontrado {p90['k_escolhido']}")

    if quase_igual(p90["silhueta"], ESPERADO["silhueta_90_dias"], 0.001):
        ok(f"silhueta = {p90['silhueta']:.3f}")
    else:
        falhou(f"silhueta: publicada {ESPERADO['silhueta_90_dias']}, encontrada {p90['silhueta']}")

    v = p90["validacao"]
    classico, robusto = v["z_classico"], v["z_robusto"]

    if classico["anomalias_injetadas"] == ESPERADO["z_classico_injetadas"]:
        ok(f"{classico['anomalias_injetadas']} anomalias injetadas no conjunto")
    else:
        falhou("número de anomalias injetadas diverge")

    if classico["verdadeiros_positivos"] == ESPERADO["z_classico_detectadas"]:
        ok(f"Z-score clássico detectou {classico['verdadeiros_positivos']}/12 "
           f"(revocação {classico['revocacao']:.2f}) — a limitação relatada")
    else:
        falhou(f"Z-score clássico: publicado {ESPERADO['z_classico_detectadas']}, "
               f"encontrado {classico['verdadeiros_positivos']}")

    if robusto["verdadeiros_positivos"] == ESPERADO["z_robusto_detectadas"]:
        ok(f"Z-score robusto detectou {robusto['verdadeiros_positivos']}/12 "
           f"(revocação {robusto['revocacao']:.2f}, F1 {robusto['f1']:.2f})")
    else:
        falhou(f"Z-score robusto: publicado {ESPERADO['z_robusto_detectadas']}, "
               f"encontrado {robusto['verdadeiros_positivos']}")

except subprocess.CalledProcessError as e:
    falhou(f"pipeline_analise.py falhou: {e.stderr[:300]}")
finally:
    shutil.rmtree(saida_temp, ignore_errors=True)

# =====================================================================
print()
if falhas:
    print(f"\033[91m{len(falhas)} verificação(ões) falharam:\033[0m")
    for f in falhas:
        print(f"  - {f}")
    sys.exit(1)

print("\033[92mTudo conferido.\033[0m O conjunto publicado é reprodutível e os")
print("números da documentação saem do pipeline.")
sys.exit(0)
