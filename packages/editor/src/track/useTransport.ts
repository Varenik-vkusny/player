/**
 * Связка транспорта с React.
 *
 * Вся работа со звуком живёт в классе Transport, который про React не знает.
 * Здесь только подписка: превратить события в состояние компонента. Когда
 * интерфейс редактора будут переписывать, этот файл выбросят, а Transport
 * останется как есть.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

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
 */
export function useTransport(src: string, declaredDuration: number): TransportApi {
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [state, setState] = useState<TransportState>('idle');
  const [peaks, setPeaks] = useState<readonly Peak[]>([]);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [duration, setDuration] = useState(declaredDuration);

  const transportRef = useRef<Transport | null>(null);

  useEffect(() => {
    const transport = new Transport({
      onPosition: setPositionSeconds,
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

    let cancelled = false;
    void transport.load(src).then((buffer) => {
      // Компонент могли снять, пока декодировался звук. Считать пики
      // и трогать состояние после этого незачем.
      if (cancelled || !buffer) return;
      setDuration(buffer.duration);
      // Дорожка озвучки моно (docs/research/audio.md §4), поэтому канал один.
      setPeaks(computePeaks(buffer.getChannelData(0), PEAK_BUCKETS));
    });

    return () => {
      cancelled = true;
      transportRef.current = null;
      transport.destroy();
    };
  }, [src]);

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
        if (transport) transport.seek(seconds);
        // Пока дорожка не загрузилась, транспорта ещё нет, но головка
        // всё равно обязана двигаться: сцена показывается и без звука.
        else setPositionSeconds(Math.max(0, Math.min(seconds, duration)));
      },
    }),
    [positionSeconds, duration, state, peaks, failure],
  );
}
