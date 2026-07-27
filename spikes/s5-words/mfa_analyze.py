"""S5, шаг 4б: разобрать результат выравнивания и посчитать ошибку.

Сравниваются три источника пословных границ на одном и том же аудио:
  MFA        — настоящее forced alignment, текст известен заранее
  Deepgram   — распознавание с последующим сопоставлением
  edge-tts   — то, что сообщил синтезатор

Плюс независимый арбитр: момент подъёма энергии над тишиной (только для слов
после паузы — в слитной речи объективной границы не существует).

Критерий, согласованный с владельцем продукта: p95 < 150 мс и ни одной
ошибки больше 300 мс.

Запуск: .venv\\Scripts\\python.exe spikes/s5-words/mfa_analyze.py
"""

import json
import re
from pathlib import Path

from deepgram_align import align, normalize
from onset_check import (
    AUDIO,
    MIN_PAUSE_S,
    OUT,
    decode_to_pcm,
    find_onset,
    frame_energy,
    percentile,
)

HERE = Path(__file__).parent
ALIGNED = HERE / "aligned"


def parse_textgrid_words(path: Path) -> list[dict]:
    """Минимальный разбор длинного формата TextGrid: только ярус words."""
    text = path.read_text(encoding="utf-8")

    tiers = re.split(r'\n\s*item \[\d+\]:', text)
    words_tier = next((t for t in tiers if re.search(r'name\s*=\s*"words"', t)), None)
    if words_tier is None:
        raise SystemExit(f"{path.name}: не найден ярус words")

    intervals = []
    pattern = re.compile(
        r'xmin\s*=\s*([\d.]+)\s*\n\s*xmax\s*=\s*([\d.]+)\s*\n\s*text\s*=\s*"([^"]*)"'
    )
    for xmin, xmax, label in pattern.findall(words_tier):
        label = label.strip()
        # Пустые интервалы — это паузы между словами, они не слова.
        if label and label not in {"<eps>", "sil", "sp", "spn"}:
            intervals.append({"text": label, "start": float(xmin), "end": float(xmax)})
    return intervals


def stats(errors: list[float]) -> dict:
    absolute = [abs(e) for e in errors]
    return {
        "n": len(errors),
        "смещение_мс": round(percentile(errors, 0.5), 1),
        "медиана_мс": round(percentile(absolute, 0.5), 1),
        "p95_мс": round(percentile(absolute, 0.95), 1),
        "максимум_мс": round(max(absolute), 1) if absolute else None,
        "больше300мс": sum(1 for e in absolute if e > 300),
    }


def verdict(s: dict) -> str:
    return "ПРОШЁЛ" if s["p95_мс"] < 150 and s["больше300мс"] == 0 else "ПРОВАЛ"


def main() -> None:
    if not ALIGNED.exists():
        raise SystemExit(f"Нет результатов выравнивания в {ALIGNED} — сначала mfa align")

    deepgram_raw = {p.stem.replace(".deepgram-raw", ""): p for p in OUT.glob("*.deepgram-raw.json")}
    report = {}

    for meta_path in sorted(AUDIO.glob("*.words.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        voice = meta["voice"]
        truth = meta["words"]

        grid = ALIGNED / f"{voice}.TextGrid"
        if not grid.exists():
            print(f"{voice}: TextGrid не найден, пропускаю")
            continue
        mfa = parse_textgrid_words(grid)

        # По индексам сравнивать нельзя: нормализация MFA может разбить или
        # склеить токен, и тогда всё поедет на позицию, давая правдоподобные
        # числа с видом настоящих. Сопоставляем последовательности.
        mapping = {}
        for ref_index, mfa_index in align([normalize(w["text"]) for w in truth],
                                          [normalize(w["text"]) for w in mfa]):
            if ref_index is not None and mfa_index is not None:
                mapping[ref_index] = mfa_index

        if len(mfa) != len(truth):
            print(f"{voice}: MFA дал {len(mfa)} слов при {len(truth)} в эталоне — "
                  f"сопоставлено по содержанию {len(mapping)} пар.")

        dg = []
        if voice in deepgram_raw:
            payload = json.loads(deepgram_raw[voice].read_text(encoding="utf-8"))
            dg = payload["results"]["channels"][0]["alternatives"][0]["words"]

        mfa_vs_edge = [
            (mfa[j]["start"] - truth[i]["start"]) * 1000 for i, j in sorted(mapping.items())
        ]

        entry = {
            "словВЭталоне": len(truth),
            "словУMFA": len(mfa),
            "сопоставленоПар": len(mapping),
            "MFA_против_edgeTts": stats(mfa_vs_edge),
        }

        if dg:
            entry["MFA_против_Deepgram"] = stats([
                (mfa[j]["start"] - dg[i]["start"]) * 1000
                for i, j in sorted(mapping.items()) if i < len(dg)
            ])

        # Независимый арбитр по словам после паузы.
        energy = frame_energy(decode_to_pcm(AUDIO / meta["audio"]))
        mfa_vs_onset, edge_vs_onset = [], []
        for i in sorted(mapping):
            pause = truth[i]["start"] if i == 0 else truth[i]["start"] - truth[i - 1]["end"]
            if pause < MIN_PAUSE_S:
                continue
            onset = find_onset(energy, truth[i]["start"])
            if onset is None:
                continue
            mfa_vs_onset.append((mfa[mapping[i]]["start"] - onset) * 1000)
            edge_vs_onset.append((truth[i]["start"] - onset) * 1000)

        if mfa_vs_onset:
            entry["MFA_против_осциллограммы"] = stats(mfa_vs_onset)
            entry["edgeTts_против_осциллограммы"] = stats(edge_vs_onset)

        report[voice] = entry

        print(f"\n=== {voice} ===")
        for key in ("MFA_против_edgeTts", "MFA_против_Deepgram",
                    "MFA_против_осциллограммы", "edgeTts_против_осциллограммы"):
            if key not in entry:
                continue
            s = entry[key]
            mark = f"  [{verdict(s)}]" if key.startswith("MFA_против_осц") else ""
            print(f"  {key:<32} n={s['n']:<4} смещение {s['смещение_мс']:+7.1f}  "
                  f"медиана {s['медиана_мс']:6.1f}  p95 {s['p95_мс']:6.1f}  "
                  f"макс {s['максимум_мс']:6.1f}  >300мс: {s['больше300мс']}{mark}")

    (OUT / "mfa.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nзаписано: {OUT / 'mfa.json'}")


if __name__ == "__main__":
    main()
