/**
 * Связка транспорта с React.
 *
 * Вся работа со звуком живёт в классе Transport, который про React не знает.
 * Здесь только подписка: превратить события в состояние компонента. Когда
 * интерфейс редактора будут переписывать, этот файл выбросят, а Transport
 * останется как есть.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { releaseAudioUrl, resolveAudioUrl, type AudioSource } from '@player/player';

import { crossedStop } from './marks.js';
import { computePeaks, type Peak } from './peaks.js';
import { Transport, type TransportState } from './transport.js';

/**
 * Сколько колонок считать в огибающей.
 *
 * Число фиксировано и не зависит от ширины дорожки на экране. Пересчёт при
 * каждом изменении размера окна стоил бы прохода по 28.8 млн отсчётов —
 * замерено 26–44 мс, то есть два-три пропущенных кадра на каждое движение
 * рамки окна. Канвас растянет готовые колонки, и на дорожке шириной
 * порядка полутора тысяч пикселей разницы не видно.
 */
const PEAK_BUCKETS = 1600;

export interface TransportApi {
  readonly positionSeconds: number;
  readonly durationSeconds: number;
  readonly state: TransportState;
  readonly isPlaying: boolean;
  readonly peaks: readonly Peak[];
  /** Причина, по которой дорожка не загрузилась. undefined — всё в порядке. */
  readonly failure: string | undefined;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
}

/**
 * @param src путь к дорожке
 * @param declaredDuration длительность из проекта: она известна и без звука,
 *   поэтому линейка дорожки работает даже когда файла нет на диске
 * @param stopsAt секунды, на которых предпросмотр обязан встать сам, —
 *   времена гейтов текущего узла. Пустой список значит «играть насквозь».
 */
export function useTransport(
  source: AudioSource,
  declaredDuration: number,
  stopsAt: readonly number[] = [],
  offsetSeconds = 0,
): TransportApi {
  const sourceKey = source.kind === 'url' ? `url:${source.url}` : `file:${source.fileId}`;

  const [positionSeconds, setPositionSeconds] = useState(0);
  const [state, setState] = useState<TransportState>('idle');
  const [peaks, setPeaks] = useState<readonly Peak[]>([]);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [duration, setDuration] = useState(declaredDuration);

  const transportRef = useRef<Transport | null>(null);

  /**
   * Времена гейтов — через ref, а НЕ через зависимости эффекта: эффект
   * создаёт Transport и грузит дорожку заново, а гейты автор правит
   * постоянно. Попади они в deps — каждая правка метки перезагружала бы
   * звук. Тот же приём, что у positionRef в StageView.
   */
  const stopsRef = useRef<readonly number[]>(stopsAt);
  stopsRef.current = stopsAt;

  /** Позиция предыдущего кадра: пересечение гейта считается по паре кадров. */
  const previousRef = useRef(0);

  useEffect(() => {
    const transport = new Transport({
      onPosition: (seconds) => {
        const stop = crossedStop(stopsRef.current, previousRef.current, seconds);
        previousRef.current = seconds;
        setPositionSeconds(seconds);
        if (stop === undefined) return;
        // Только пауза, без перемотки на гейт. Перемотка здесь ЛОМАЕТ
        // остановку: `pause()` асинхронный — он снимает кадр сразу, но
        // состояние остаётся `playing` до конца `await freezeAt`, и `seek`
        // в этот момент переставляет ещё идущие часы, после чего звук просто
        // продолжается с новой точки. Проверено в браузере: с перемоткой
        // головка уезжала на 3.9 с через гейт на 1.175 с.
        //
        // Перелёт остаётся в пределах кадра-двух, как и у плеера (S2:
        // 18.57 мс), — `freezeAt` берёт позицию на момент вызова.
        void transport.pause();
      },
      onStateChange: setState,
      onLoadFailed: setFailure,
    });
    transportRef.current = transport;
    // Для проверок в браузере и e2e — тем же способом, каким плеер отдаёт
    // наружу себя, а редактор предпросмотр. Ждать звук иначе нечем:
    // о том, что дорожка действительно поехала, снаружи узнать не по чему.
    (window as unknown as { __transport: Transport }).__transport = transport;
    setFailure(undefined);
    setPeaks([]);
    // Смена src — это смена узла графа (Задача 9), а не только смена файла
    // на месте. Пока узел был один, `src` не менялся никогда, и оба сброса
    // ниже были бы no-op. Теперь меняется, и без них вылезают два дефекта:
    // 1. `useState(declaredDuration)` берёт значение один раз — до конца
    //    загрузки НОВОЙ дорожки `duration` остаётся длительностью старой.
    // 2. Головка (`positionSeconds`) не смещённая переживает переход с узла
    //    на 48.6 с (позиция, скажем, 20 с) на узел длиной 3 с — и `seek(20)`
    //    в StageView покажет все анимации в конечном состоянии. Дефект
    //    опасен именно тем, что рисует правдоподобную картинку, а не пустую.
    setPositionSeconds(0);
    setDuration(declaredDuration);
    previousRef.current = 0;

    let cancelled = false;
    // Источник превращается в адрес ровно здесь и сразу отпускается: адрес
    // загруженного файла держит в памяти байты целиком, а после декодирования
    // нужен уже только буфер.
    void resolveAudioUrl(source)
      .then((url) => transport
        .load(url, { offset: offsetSeconds, duration: declaredDuration })
        .finally(() => { releaseAudioUrl(source, url); }))
      .then((buffer) => {
      // Компонент могли снять, пока декодировался звук. Считать пики
      // и трогать состояние после этого незачем.
      if (cancelled || !buffer) return;

      // Длительность НЕ перетирается длиной файла. Раньше перетиралась, и это
      // было почти незаметно: часть занимала файл целиком. С окном (схема v4)
      // части делят один файл, и длина файла — уже не длина части: после
      // разреза линейка показывала бы автору чужую секунду в конце.
      // Источник истины про длину части — проект, а не декодер.

      // Волна тоже рисуется по СВОЕМУ участку: иначе автор видел бы форму
      // всей дорожки под куском, который к ней не относится.
      // Дорожка озвучки моно (docs/research/audio.md §4), поэтому канал один.
      const samples = buffer.getChannelData(0);
      const from = Math.max(0, Math.floor(offsetSeconds * buffer.sampleRate));
      const to = declaredDuration > 0
        ? Math.min(samples.length, Math.ceil((offsetSeconds + declaredDuration) * buffer.sampleRate))
        : samples.length;
      const windowed = from > 0 || to < samples.length ? samples.subarray(from, to) : samples;

      setPeaks(computePeaks(windowed, PEAK_BUCKETS));
    });

    return () => {
      cancelled = true;
      transportRef.current = null;
      transport.destroy();
    };
    // declaredDuration — в зависимостях: она меняется ВМЕСТЕ с src (оба
    // приходят от segmentOf на одном и том же переключении узла), и линтер
    // react-hooks/exhaustive-deps обязан видеть её как зависимость эффекта,
    // который её читает. Не через ref: значение не «сопутствующее» жесту
    // (как positionRef в StageView), а часть входных данных этого самого
    // эффекта — сброс на объявленную длительность ЕСТЬ его работа.
    //
    // offsetSeconds — по той же причине: смещение окна приходит от того же
    // segmentOf на том же переключении части. Две части могут делить ОДИН
    // файл (схема v4), и тогда `src` не меняется, а окно меняется — без
    // смещения в зависимостях дорожка осталась бы показывать прежний участок.
    //
    // В зависимостях стоит КЛЮЧ источника, а не сам объект: `segmentOf`
    // собирает `source` заново на каждый вызов, и объект в deps перезагружал
    // бы звук на каждом рендере редактора.
  }, [sourceKey, declaredDuration, offsetSeconds]);

  return useMemo(
    (): TransportApi => ({
      positionSeconds,
      durationSeconds: duration,
      state,
      isPlaying: state === 'playing',
      peaks,
      failure,
      play: () => void transportRef.current?.play(),
      pause: () => void transportRef.current?.pause(),
      toggle: () => {
        const transport = transportRef.current;
        if (!transport) return;
        if (transport.isPlaying) void transport.pause();
        else void transport.play();
      },
      seek: (seconds: number) => {
        const transport = transportRef.current;
        // Перемотка автором — не проигрывание: перескок через гейт мышью
        // не должен выглядеть как его пересечение и ставить паузу.
        previousRef.current = Math.max(0, Math.min(seconds, duration));
        if (transport) transport.seek(seconds);
        // Пока дорожка не загрузилась, транспорта ещё нет, но головка
        // всё равно обязана двигаться: сцена показывается и без звука.
        else setPositionSeconds(Math.max(0, Math.min(seconds, duration)));
      },
    }),
    [positionSeconds, duration, state, peaks, failure],
  );
}
