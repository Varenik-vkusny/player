"""S5, шаг 4а: подготовить корпус для Montreal Forced Aligner.

MFA ждёт каталог с парами <имя>.wav и <имя>.lab, где .lab — текст произнесённого.
Текст мы знаем заранее: это и есть весь смысл forced alignment — не угадывать,
что сказано, а искать только границы.

Запуск: .venv\\Scripts\\python.exe spikes/s5-words/mfa_prepare.py
"""

import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
AUDIO = HERE / "audio"
CORPUS = HERE / "corpus"

SAMPLE_RATE = 16000


def normalize_for_mfa(text: str) -> str:
    """Убираем то, чего нет в словаре: пунктуацию и ё. Порядок слов не трогаем."""
    text = text.replace("ё", "е").replace("Ё", "Е")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    CORPUS.mkdir(parents=True, exist_ok=True)
    prepared = 0

    for meta_path in sorted(AUDIO.glob("*.words.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        name = meta["voice"]

        wav = CORPUS / f"{name}.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(AUDIO / meta["audio"]),
             "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(wav)],
            check=True,
        )

        # Транскрипт собираем из тех же слов, что дал синтезатор: так порядок
        # и состав гарантированно совпадают с эталоном, и сравнение пословное.
        words = [normalize_for_mfa(w["text"]) for w in meta["words"]]
        words = [w for w in words if w]
        (CORPUS / f"{name}.lab").write_text(" ".join(words), encoding="utf-8")

        prepared += 1
        print(f"{name}: {len(words)} слов, wav {wav.stat().st_size // 1024} КБ")

    if not prepared:
        raise SystemExit("Не найдено ни одного файла с границами слов — сначала generate.py")
    print(f"\nкорпус готов: {CORPUS}")


if __name__ == "__main__":
    main()
