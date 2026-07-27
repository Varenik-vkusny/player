"""S5, шаг 1: сгенерировать озвучку и получить эталонные границы слов.

Почему эталон берётся у самого синтезатора: он не распознаёт речь, а знает,
когда какое слово произнёс. Это не оценка, а факт из движка. Ошибка выравнивания
измеряется относительно него.

Критично: по умолчанию edge-tts отдаёт границы ПРЕДЛОЖЕНИЙ. Пословные границы
включаются недокументированным параметром boundary="WordBoundary".

Запуск: .venv\\Scripts\\python.exe spikes/s5-words/generate.py
"""

import asyncio
import inspect
import json
from pathlib import Path

import edge_tts

HERE = Path(__file__).parent
OUT = HERE / "audio"

# ~60 секунд связного русского текста. Тема выбрана так, чтобы встречались
# и длинные термины, и короткие служебные слова — на них выравнивание сложнее.
TEXT = (
    "Представь, что ты смотришь объяснение и в какой-то момент оно останавливается. "
    "Не потому что закончилось, а потому что автор поставил здесь вопрос. "
    "Пока ты не ответишь, дальше не поедет. Это и есть главная идея нашего формата. "
    "Обычное видео течёт мимо зрителя ровным потоком, и проверить понимание негде. "
    "Здесь же остановка встроена в саму дорожку, а не приклеена сверху. "
    "Звук замирает, картинка ждёт, и внимание возвращается к тому, что происходит на экране. "
    "Когда ответ дан, воспроизведение продолжается ровно с той секунды, на которой прервалось. "
    "Никакой перемотки, никакого повторения последней фразы. "
    "Энергия зрителя тратится на смысл, а не на борьбу с интерфейсом."
)

# Два заметно разных голоса: женский и мужской, разная скорость речи.
VOICES = ["ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural"]

# edge-tts отдаёт смещения в единицах по 100 наносекунд.
TICKS_PER_SECOND = 10_000_000


def assert_boundary_supported() -> None:
    """Падаем громко, если параметра нет: молча получить границы предложений
    вместо пословных — это тихо неверное измерение, худший из возможных исходов."""
    params = inspect.signature(edge_tts.Communicate.__init__).parameters
    if "boundary" not in params:
        raise SystemExit(
            "edge_tts.Communicate не принимает параметр boundary. "
            f"Доступны: {sorted(p for p in params if p != 'self')}. "
            "Без него эталон будет по предложениям, а не по словам."
        )


async def synth(voice: str) -> dict:
    communicate = edge_tts.Communicate(TEXT, voice, boundary="WordBoundary")
    audio_path = OUT / f"{voice}.mp3"

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
                        "start": chunk["offset"] / TICKS_PER_SECOND,
                        "end": (chunk["offset"] + chunk["duration"]) / TICKS_PER_SECOND,
                    }
                )
            else:
                other_events[kind] = other_events.get(kind, 0) + 1

    if not words:
        raise SystemExit(f"{voice}: не получено ни одной пословной границы. События: {other_events}")

    return {
        "voice": voice,
        "audio": audio_path.name,
        "text": TEXT,
        "words": words,
        "wordCount": len(words),
        "speechDuration": words[-1]["end"],
        "otherEvents": other_events,
    }


async def main() -> None:
    assert_boundary_supported()
    OUT.mkdir(parents=True, exist_ok=True)

    for voice in VOICES:
        result = await synth(voice)
        (OUT / f"{voice}.words.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        wps = result["wordCount"] / result["speechDuration"]
        print(
            f"{voice}: {result['wordCount']} слов, "
            f"{result['speechDuration']:.2f} с, "
            f"{wps:.2f} слов/с, прочие события: {result['otherEvents']}"
        )
        print(f"  первые слова: {[w['text'] for w in result['words'][:6]]}")


if __name__ == "__main__":
    asyncio.run(main())
