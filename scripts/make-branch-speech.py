"""Синтезирует настоящую русскую речь для дорожек веток.

Заменяет `make-tone-wav.mjs`: тот писал синусоиду, и на ней ветка была
непроверяема. Замерено 01.08.2026: у `ask.wav`, `branch-yes.wav`,
`branch-no.wav` отношение пик/RMS равнялось 1.4173 = √2 — чистый тон,
Deepgram возвращал ноль слов, а `ask.wav` и `branch-no.wav` совпадали
побайтово (MD5 1befd385…). То есть ни одна ветка ни разу не играла голосом.

Одноразовая оснастка: файлы коммитятся в репозиторий, а не пересобираются
на каждый прогон. Скрипт остаётся, чтобы озвучку можно было воспроизвести,
а не считать упавшей с неба.

Пословные границы берутся у самого синтезатора, а не у распознавания: он
не угадывает, а знает, когда произнёс каждое слово. Поэтому у слов
`source: 'tts'` — схема отделяет их от `'asr'` именно по этой причине.

КРИТИЧНО (грабли S5): по умолчанию edge-tts отдаёт границы ПРЕДЛОЖЕНИЙ.
Пословные включаются недокументированным параметром boundary="WordBoundary".
Без него получилось бы тихо неверное измерение — худший из исходов.

Запуск: python scripts/make-branch-speech.py
"""

import asyncio
import inspect
import json
from pathlib import Path

import edge_tts

HERE = Path(__file__).parent
OUT = HERE.parent / "apps" / "playground" / "public" / "audio"

TICKS_PER_SECOND = 10_000_000

# Три РАЗНЫЕ реплики. Прежние ask и branch-no были одним файлом, поэтому
# фикстура не могла отличить «спросили» от «ответили неверно».
#
# Голоса разные намеренно: развилка, озвученная одним голосом, не покажет,
# что источник звука действительно сменился на границе сегментов.
#
# Реплики КОРОТКИЕ, около трёх секунд, и это несущее свойство, а не вкус:
#   - e2e/editor-segments.spec.ts:112 требует длину дорожки ветки ~3 с;
#   - скриншотная регрессия берёт моменты долями duration, и на длинной
#     дорожке все четыре момента у morph уехали бы за последний слайд —
#     проверка морфинга позеленела бы, перестав что-либо проверять;
#   - e2e завершения доигрывает ветку до конца, и каждая лишняя секунда
#     умножается на число таких тестов.
# Требованием была настоящая речь, а не её длина.
REPLICAS = [
    {
        "name": "ask",
        "voice": "ru-RU-SvetlanaNeural",
        "text": "Выбери, куда идти дальше.",
    },
    {
        "name": "branch-yes",
        "voice": "ru-RU-DmitryNeural",
        # Без длинного тире: на «Часы — это дорожка» edge-tts отвечает
        # NoAudioReceived. Проверено прогоном 01.08.2026.
        "text": "Верно, это дорожка.",
    },
    {
        "name": "branch-no",
        "voice": "ru-RU-SvetlanaNeural",
        "text": "Разберём ещё раз.",
    },
]


def assert_boundary_supported() -> None:
    """Падаем громко, если параметра нет: молча получить границы предложений
    вместо пословных — тихо неверное измерение, а не мелкая неточность."""
    params = inspect.signature(edge_tts.Communicate.__init__).parameters
    if "boundary" not in params:
        raise SystemExit(
            "edge_tts.Communicate не принимает параметр boundary. "
            f"Доступны: {sorted(p for p in params if p != 'self')}. "
            "Без него границы будут по предложениям, а не по словам."
        )


async def synth(replica: dict) -> dict:
    communicate = edge_tts.Communicate(
        replica["text"], replica["voice"], boundary="WordBoundary"
    )
    audio_path = OUT / f"{replica['name']}.mp3"

    words: list[dict] = []
    other_events: dict[str, int] = {}

    with audio_path.open("wb") as fh:
        async for chunk in communicate.stream():
            kind = chunk["type"]
            if kind == "audio":
                fh.write(chunk["data"])
            elif kind == "WordBoundary":
                words.append(
                    {
                        "text": chunk["text"],
                        "start": round(chunk["offset"] / TICKS_PER_SECOND, 3),
                        "end": round(
                            (chunk["offset"] + chunk["duration"]) / TICKS_PER_SECOND, 3
                        ),
                        "source": "tts",
                    }
                )
            else:
                other_events[kind] = other_events.get(kind, 0) + 1

    if not words:
        raise SystemExit(
            f"{replica['name']}: ни одной пословной границы. События: {other_events}"
        )

    return {
        "name": replica["name"],
        "voice": replica["voice"],
        "audio": audio_path.name,
        "text": replica["text"],
        "words": words,
        "wordCount": len(words),
        "speechEnd": words[-1]["end"],
    }


async def main() -> None:
    assert_boundary_supported()
    OUT.mkdir(parents=True, exist_ok=True)

    results = []
    for replica in REPLICAS:
        result = await synth(replica)
        results.append(result)
        print(
            f"{result['name']:11s} {result['voice']:20s} "
            f"{result['wordCount']:3d} слов, конец речи {result['speechEnd']:.3f} с"
        )

    # Слова кладём рядом со скриптом, а не в public: в фикстуры их переносит
    # apply-branch-speech.mjs, и промежуточный файл в раздачу попадать не должен.
    (HERE / "branch-speech.words.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nСлова: {HERE / 'branch-speech.words.json'}")


if __name__ == "__main__":
    asyncio.run(main())
