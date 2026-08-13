/**
 * Видео как ведомая картинка (ADR-028).
 *
 * Предмет проверки — РЕШЕНИЕ о записи, а не её значение: сверка обязана
 * молчать, пока расхождение меньше порога, и срабатывать за ним. Замерено,
 * почему это несущее свойство: запись `currentTime` каждый кадр роняет показ
 * с 30 до 10.1 кадра в секунду с провалами до 866 мс.
 *
 * Среда юнит-тестов — `node` без DOM (`vitest.config.ts`), поэтому здесь
 * подставные видео, а не `<video>`. Это не обход: `syncVideos` работает
 * с узким типом `TimedVideo` именно затем, чтобы граница модуля была
 * проверяема.
 *
 * **Чего эти тесты НЕ проверяют.** Того, что плееру передаётся позиция
 * ДОРОЖКИ, а не сегмента. Функция принимает `position` готовым и не решает,
 * какая это шкала, — проверка была бы верна при любой реализации выбора
 * (то есть пуста по тождеству). Мина ловится только там, где есть настоящий
 * плеер: e2e на фикстуре с непустым `audio.offset`.
 */
import { describe, expect, it } from 'vitest';
import { pauseVideos, startVideos, syncVideos, VIDEO_RESYNC_S, type TimedVideo } from '@player/player';

interface Fake extends TimedVideo {
  readonly writes: number[];
  readonly calls: string[];
}

/** Подставное видео, помнящее КАЖДУЮ запись позиции и каждый вызов. */
function fakeVideo(src = '/video/head.mp4', at = 0): Fake {
  const writes: number[] = [];
  const calls: string[] = [];
  let time = at;
  return {
    src,
    writes,
    calls,
    get currentTime(): number {
      return time;
    },
    set currentTime(value: number) {
      time = value;
      writes.push(value);
    },
    get paused(): boolean {
      return !calls.includes('play') || calls.lastIndexOf('pause') > calls.lastIndexOf('play');
    },
    async play(): Promise<void> {
      calls.push('play');
    },
    pause(): void {
      calls.push('pause');
    },
  };
}

describe('сверка видео по порогу', () => {
  it('МОЛЧИТ, пока расхождение меньше порога', () => {
    // Полкадра при 30 fps — обычное состояние: замерено, что свободное
    // видео отстаёт на 17.4–18.1 мс постоянно. Правка здесь означала бы
    // перемотку каждый кадр, то есть 10.1 fps вместо 30.
    const video = fakeVideo('/video/head.mp4', 10.018);

    const corrected = syncVideos([video], 10);

    expect(corrected).toBe(0);
    expect(video.writes).toEqual([]);
  });

  it('молчит и у самой границы порога', () => {
    const video = fakeVideo('/video/head.mp4', VIDEO_RESYNC_S);

    expect(syncVideos([video], 0)).toBe(0);
    expect(video.writes).toEqual([]);
  });

  it('ПРАВИТ, когда расхождение перевалило порог', () => {
    // Залипший декодер: картинка отстала на секунду. Это и есть тот случай,
    // ради которого механизм существует.
    const video = fakeVideo('/video/head.mp4', 9);

    const corrected = syncVideos([video], 10);

    expect(corrected).toBe(1);
    expect(video.writes).toEqual([10]);
  });

  it('правит и когда видео УБЕЖАЛО вперёд, а не отстало', () => {
    // Расхождение берётся по модулю. Односторонняя проверка оставила бы
    // половину случаев без страховки, и это не поймал бы тест выше.
    const video = fakeVideo('/video/head.mp4', 11);

    expect(syncVideos([video], 10)).toBe(1);
    expect(video.writes).toEqual([10]);
  });

  it('не трогает узел без источника', () => {
    // Пустой src — видео, которое автор поставил, но файла ещё не дал.
    // Запись позиции в такой узел заставила бы браузер искать файл по
    // адресу самой страницы.
    const empty = fakeVideo('', 0);

    expect(syncVideos([empty], 10)).toBe(0);
    expect(empty.writes).toEqual([]);
  });
});

describe('пуск по расписанию', () => {
  it('ставит позицию БЕЗУСЛОВНО, а не по порогу', () => {
    // Отличие старта от сверки. Замерено: старт, опоздавший на 60 мс,
    // даёт постоянный сдвиг −40…−47 мс, который дальше никуда не уходит.
    // Реализация, переиспользовавшая бы здесь сверку, оставила бы
    // расхождение до 0.25 с навсегда — и оно НЕ рассосалось бы.
    const video = fakeVideo('/video/head.mp4', 10.1);

    startVideos([video], 10);

    expect(video.writes).toEqual([10]);
    expect(video.calls).toEqual(['play']);
  });

  it('не пускает узел без источника', () => {
    const empty = fakeVideo('', 0);

    startVideos([empty], 5);

    expect(empty.calls).toEqual([]);
    expect(empty.writes).toEqual([]);
  });
});

describe('остановка', () => {
  it('останавливает видео с источником', () => {
    const video = fakeVideo('/video/head.mp4', 3);
    startVideos([video], 3);

    pauseVideos([video]);

    expect(video.calls).toEqual(['play', 'pause']);
    expect(video.paused).toBe(true);
  });

  it('не трогает узел без источника', () => {
    const empty = fakeVideo('', 0);

    pauseVideos([empty]);

    expect(empty.calls).toEqual([]);
  });
});
