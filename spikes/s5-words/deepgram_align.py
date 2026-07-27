"""S5, шаг 2: путь через распознавание (Deepgram) и его цена.

Задача: получить числом ответ на вопрос «можно ли строить тайминги на ASR,
если текст известен заранее». Deepgram не принимает известный текст — параметра
для forced alignment в API нет. Значит распознанную последовательность надо
сопоставлять с эталонной самим, а слова, которых распознаватель не услышал,
остаются без собственного тайминга.

Сопоставление — Нидлман-Вунш по нормализованным словам. Слова, не получившие
пары, помечаются как пропуски: именно они и есть цена этого пути.

Запуск: .venv\\Scripts\\python.exe spikes/s5-words/deepgram_align.py
"""

import json
import os
import re
import sys
from pathlib import Path

import requests

HERE = Path(__file__).parent
AUDIO = HERE / "audio"
OUT = HERE / "results"

API = "https://api.deepgram.com/v1/listen"
PARAMS = {"model": "nova-3", "language": "ru", "punctuate": "true", "smart_format": "false"}

MATCH, MISMATCH, GAP = 2, -1, -2


def load_key() -> str:
    """Ключ только из окружения. Нет ключа — падаем, а не притворяемся."""
    env = Path(__file__).resolve().parents[2] / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DEEPGRAM_API_KEY"):
                return line.split("=", 1)[1].strip().strip("\"'")
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        raise SystemExit("DEEPGRAM_API_KEY не найден ни в .env, ни в окружении")
    return key


def normalize(word: str) -> str:
    return re.sub(r"[^\w]", "", word.lower().replace("ё", "е"))


def transcribe(path: Path, key: str) -> list[dict]:
    """Ответ кэшируется на диск: повторный анализ не должен стоить нового запроса."""
    cache = OUT / f"{path.stem}.deepgram-raw.json"
    if cache.exists():
        payload = json.loads(cache.read_text(encoding="utf-8"))
    else:
        with path.open("rb") as fh:
            response = requests.post(
                API,
                params=PARAMS,
                headers={"Authorization": f"Token {key}", "Content-Type": "audio/mpeg"},
                data=fh,
                timeout=180,
            )
        if response.status_code != 200:
            raise SystemExit(f"Deepgram вернул {response.status_code}: {response.text[:400]}")
        payload = response.json()
        OUT.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    alternatives = payload["results"]["channels"][0]["alternatives"]
    if not alternatives:
        raise SystemExit(f"{path.name}: Deepgram не вернул ни одной гипотезы")
    return alternatives[0]["words"]


def align(reference: list[str], hypothesis: list[str]) -> list[tuple[int | None, int | None]]:
    """Нидлман-Вунш. Возвращает пары индексов; None означает пропуск."""
    n, m = len(reference), len(hypothesis)
    score = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        score[i][0] = i * GAP
    for j in range(1, m + 1):
        score[0][j] = j * GAP
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            hit = MATCH if reference[i - 1] == hypothesis[j - 1] else MISMATCH
            score[i][j] = max(
                score[i - 1][j - 1] + hit,
                score[i - 1][j] + GAP,
                score[i][j - 1] + GAP,
            )

    pairs: list[tuple[int | None, int | None]] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            hit = MATCH if reference[i - 1] == hypothesis[j - 1] else MISMATCH
            if score[i][j] == score[i - 1][j - 1] + hit:
                pairs.append((i - 1, j - 1))
                i, j = i - 1, j - 1
                continue
        if i > 0 and score[i][j] == score[i - 1][j] + GAP:
            pairs.append((i - 1, None))
            i -= 1
            continue
        pairs.append((None, j - 1))
        j -= 1
    pairs.reverse()
    return pairs


def percentile(values: list[float], q: float) -> float:
    if not values:
        return float("nan")
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))]


def main() -> None:
    key = load_key()
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}

    for meta_path in sorted(AUDIO.glob("*.words.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        voice = meta["voice"]
        truth = meta["words"]

        hypothesis = transcribe(AUDIO / meta["audio"], key)
        pairs = align([normalize(w["text"]) for w in truth],
                      [normalize(w["word"]) for w in hypothesis])

        # Знак сохраняем: постоянное смещение и случайный разброс дают
        # одинаковый модуль, но лечатся принципиально по-разному. Первое
        # вычитается константой, второе не лечится ничем.
        signed: list[float] = []
        missing: list[str] = []
        for ref_index, hyp_index in pairs:
            if ref_index is None:
                continue
            if hyp_index is None:
                missing.append(truth[ref_index]["text"])
                continue
            signed.append((hypothesis[hyp_index]["start"] - truth[ref_index]["start"]) * 1000)

        bias = percentile(signed, 0.5)                     # систематическое смещение
        raw = [abs(v) for v in signed]                     # ошибка как есть
        corrected = [abs(v - bias) for v in signed]        # ошибка после вычитания смещения

        coverage = len(signed) / len(truth) * 100
        report[voice] = {
            "словВЭталоне": len(truth),
            "словРаспознано": len(hypothesis),
            "покрытие_%": round(coverage, 1),
            "безТайминга": missing,
            "систематическоеСмещение_мс": round(bias, 1),
            "знак_минимум_мс": round(min(signed), 1),
            "знак_максимум_мс": round(max(signed), 1),
            "долиПоложительных_%": round(sum(1 for v in signed if v > 0) / len(signed) * 100, 1),
            "какЕсть": {
                "медиана_мс": round(percentile(raw, 0.5), 1),
                "p95_мс": round(percentile(raw, 0.95), 1),
                "максимум_мс": round(max(raw), 1),
                "больше300мс": sum(1 for e in raw if e > 300),
            },
            "послеВычитанияСмещения": {
                "медиана_мс": round(percentile(corrected, 0.5), 1),
                "p95_мс": round(percentile(corrected, 0.95), 1),
                "максимум_мс": round(max(corrected), 1),
                "больше300мс": sum(1 for e in corrected if e > 300),
            },
        }
        r = report[voice]
        print(f"{voice}: покрытие {coverage:.1f}%, положительных {r['долиПоложительных_%']}%")
        print(f"  систематическое смещение: {r['систематическоеСмещение_мс']} мс "
              f"(разброс от {r['знак_минимум_мс']} до {r['знак_максимум_мс']})")
        print(f"  как есть:            медиана {r['какЕсть']['медиана_мс']}, "
              f"p95 {r['какЕсть']['p95_мс']}, макс {r['какЕсть']['максимум_мс']}, "
              f">300мс: {r['какЕсть']['больше300мс']}")
        print(f"  минус смещение:      медиана {r['послеВычитанияСмещения']['медиана_мс']}, "
              f"p95 {r['послеВычитанияСмещения']['p95_мс']}, "
              f"макс {r['послеВычитанияСмещения']['максимум_мс']}, "
              f">300мс: {r['послеВычитанияСмещения']['больше300мс']}")
        if missing:
            print(f"  без тайминга остались: {missing}")

    (OUT / "deepgram.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nзаписано: {OUT / 'deepgram.json'}")


if __name__ == "__main__":
    sys.exit(main())
