"""S5, шаг 3: независимый арбитр — сама осциллограмма.

Deepgram и edge-tts расходятся на ~85 мс систематически. Кто из них смещён,
по их собственным данным установить нельзя. Арбитром выступает момент, когда
энергия сигнала поднимается над тишиной: он не зависит от мнения ни одного
из инструментов.

Мерить можно только на словах ПОСЛЕ ПАУЗЫ. В слитной речи граница слова
размыта физически, и спорить о ней бессмысленно — там нет объективного ответа.

Запуск: .venv\\Scripts\\python.exe spikes/s5-words/onset_check.py
"""

import json
import subprocess
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
AUDIO = HERE / "audio"
OUT = HERE / "results"

SAMPLE_RATE = 16000
FRAME_MS = 5
MIN_PAUSE_S = 0.25       # какая тишина перед словом считается достаточной
SEARCH_BEFORE_S = 0.35   # окно поиска относительно заявленной позиции
SEARCH_AFTER_S = 0.45
# Порог: во сколько раз энергия должна превысить уровень тишины перед словом.
ONSET_FACTOR = 8.0
# Сколько тишины обязано быть непосредственно перед началом слова.
QUIET_BEFORE_S = 0.10


def decode_to_pcm(mp3: Path) -> np.ndarray:
    """ffmpeg -> моно 16 кГц PCM. Отдельным файлом, чтобы не гадать о формате."""
    wav = OUT / f"{mp3.stem}.pcm16k.wav"
    if not wav.exists():
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(mp3),
             "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(wav)],
            check=True,
        )
    with wave.open(str(wav), "rb") as fh:
        if fh.getframerate() != SAMPLE_RATE or fh.getnchannels() != 1:
            raise SystemExit(f"{wav.name}: ожидалось моно {SAMPLE_RATE} Гц")
        raw = fh.readframes(fh.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0


def frame_energy(signal: np.ndarray) -> np.ndarray:
    """Среднеквадратичная энергия по кадрам FRAME_MS."""
    size = int(SAMPLE_RATE * FRAME_MS / 1000)
    usable = len(signal) - len(signal) % size
    return np.sqrt((signal[:usable].reshape(-1, size) ** 2).mean(axis=1))


def find_onset(energy: np.ndarray, claimed_s: float) -> float | None:
    """Первый кадр в окне, где энергия устойчиво превысила уровень тишины."""
    per_frame = FRAME_MS / 1000
    lo = max(0, int((claimed_s - SEARCH_BEFORE_S) / per_frame))
    hi = min(len(energy), int((claimed_s + SEARCH_AFTER_S) / per_frame))
    if hi - lo < 10:
        return None

    window = energy[lo:hi]
    # Уровень тишины — по самым тихим 20% окна, чтобы не зависеть от громкости голоса.
    floor = np.quantile(window, 0.2)
    threshold = max(floor * ONSET_FACTOR, 1e-4)

    # Начало слова — это ПЕРЕХОД от тишины к звуку. Без требования тишины перед
    # ним детектор цепляется за вдох в паузе и уезжает на сотни миллисекунд.
    quiet_frames = int(QUIET_BEFORE_S / per_frame)

    for i in range(len(window) - 3):
        loud = window[i] > threshold and window[i + 1] > threshold and window[i + 2] > threshold
        if not loud:
            continue
        start = max(0, i - quiet_frames)
        if i - start < quiet_frames // 2:
            continue  # слева не хватает окна, чтобы судить о тишине
        if np.max(window[start:i]) > threshold * 0.5:
            continue  # перед этим местом не тишина, значит это не начало слова
        return (lo + i) * per_frame
    return None


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    deepgram_raw = {p.stem.replace(".deepgram-raw", ""): p for p in OUT.glob("*.deepgram-raw.json")}
    report = {}

    for meta_path in sorted(AUDIO.glob("*.words.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        voice = meta["voice"]
        words = meta["words"]

        energy = frame_energy(decode_to_pcm(AUDIO / meta["audio"]))

        raw_path = deepgram_raw.get(voice)
        dg_words = []
        if raw_path:
            payload = json.loads(raw_path.read_text(encoding="utf-8"))
            dg_words = payload["results"]["channels"][0]["alternatives"][0]["words"]

        # Кандидаты: слова, перед которыми есть настоящая пауза.
        candidates = []
        for i, word in enumerate(words):
            pause = word["start"] if i == 0 else word["start"] - words[i - 1]["end"]
            if pause >= MIN_PAUSE_S:
                candidates.append((i, word, pause))

        rows = []
        for index, word, pause in candidates:
            onset = find_onset(energy, word["start"])
            if onset is None:
                continue
            dg_start = dg_words[index]["start"] if index < len(dg_words) else None
            rows.append({
                "слово": word["text"],
                "паузаПеред_мс": round(pause * 1000),
                "осциллограмма_с": round(onset, 4),
                "edgeTts_с": round(word["start"], 4),
                "deepgram_с": round(dg_start, 4) if dg_start is not None else None,
                "edgeTtsМинусФакт_мс": round((word["start"] - onset) * 1000, 1),
                "deepgramМинусФакт_мс": (
                    round((dg_start - onset) * 1000, 1) if dg_start is not None else None
                ),
            })

        if not rows:
            print(f"{voice}: не нашлось слов после паузы — арбитраж невозможен")
            continue

        edge_err = [r["edgeTtsМинусФакт_мс"] for r in rows]
        dg_err = [r["deepgramМинусФакт_мс"] for r in rows if r["deepgramМинусФакт_мс"] is not None]

        report[voice] = {
            "проверенноСлов": len(rows),
            "edgeTts": {
                "медианноеСмещение_мс": round(percentile(edge_err, 0.5), 1),
                "модуль_p95_мс": round(percentile([abs(v) for v in edge_err], 0.95), 1),
            },
            "deepgram": {
                "медианноеСмещение_мс": round(percentile(dg_err, 0.5), 1) if dg_err else None,
                "модуль_p95_мс": round(percentile([abs(v) for v in dg_err], 0.95), 1) if dg_err else None,
            },
            "детали": rows,
        }

        print(f"\n{voice}: слов после паузы — {len(rows)}")
        print(f"  edge-tts относительно осциллограммы: медиана "
              f"{report[voice]['edgeTts']['медианноеСмещение_мс']:+.1f} мс, "
              f"|p95| {report[voice]['edgeTts']['модуль_p95_мс']} мс")
        if dg_err:
            print(f"  deepgram относительно осциллограммы: медиана "
                  f"{report[voice]['deepgram']['медианноеСмещение_мс']:+.1f} мс, "
                  f"|p95| {report[voice]['deepgram']['модуль_p95_мс']} мс")
        print("  примеры:")
        for row in rows[:6]:
            print(f"    {row['слово']:<14} факт {row['осциллограмма_с']:.3f}  "
                  f"edge {row['edgeTtsМинусФакт_мс']:+7.1f} мс   "
                  f"dg {row['deepgramМинусФакт_мс']:+7.1f} мс"
                  if row["deepgramМинусФакт_мс"] is not None else
                  f"    {row['слово']:<14} факт {row['осциллограмма_с']:.3f}  "
                  f"edge {row['edgeTtsМинусФакт_мс']:+7.1f} мс")

    (OUT / "onset.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nзаписано: {OUT / 'onset.json'}")


if __name__ == "__main__":
    main()
