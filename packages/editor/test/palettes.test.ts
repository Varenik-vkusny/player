/**
 * Каталог палитр.
 *
 * Тест на количество палитр здесь НЕ пишется намеренно: он ничего не держит
 * и краснеет от любого пополнения каталога, то есть наказывает за работу.
 * Держать надо ПОЛНОТУ — палитра, оставившая роль пустой, красит сославшиеся
 * элементы в «унаследованное» молча (S11, S14).
 */
import { ThemeSchema } from '@player/core';
import { describe, expect, it } from 'vitest';

import { PALETTES, paletteById } from '../src/state/palettes.js';

const ROLES = Object.keys(ThemeSchema.shape);

describe('каталог палитр', () => {
  it('каждая палитра заполняет ВСЕ роли темы', () => {
    // ЧЕСТНО ПРО ЭТОТ ТЕСТ. Настоящую охрану несёт ТИП: палитры объявлены
    // литералами типа `Theme`, у которого все десять ролей обязательны,
    // поэтому неполная палитра не компилируется вовсе — проверено сломом,
    // `Property '--scene-line' is missing`.
    //
    // Первая редакция теста была ПУСТА ПО ПОСТРОЕНИЮ: палитры проходили
    // через `ThemeSchema.parse`, а он сам проставляет умолчания, так что
    // выход был полон при любом входе. Слом не покраснел, и это выяснилось
    // только прогоном.
    //
    // Тест оставлен как страховка от приведения типа (`as Theme`), которое
    // тип обошло бы, а он — нет.
    for (const palette of PALETTES) {
      expect(Object.keys(palette.theme).sort(), `палитра «${palette.name}»`).toEqual(
        [...ROLES].sort(),
      );
    }
  });

  it('каждая палитра проходит схему темы без правок', () => {
    for (const palette of PALETTES) {
      expect(() => ThemeSchema.parse(palette.theme), palette.name).not.toThrow();
    }
  });

  it('идентификаторы не повторяются', () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('палитры РАЗЛИЧАЮТСЯ фоном — иначе каталог показывал бы одно и то же', () => {
    // Проверка на пустоту наоборот: без неё восемь копий одной палитры
    // прошли бы все тесты выше.
    const backgrounds = PALETTES.map((p) => p.theme['--scene-bg']);
    expect(new Set(backgrounds).size).toBe(PALETTES.length);
  });

  it('есть и светлые, и тёмные', () => {
    const tones = new Set(PALETTES.map((p) => p.tone));
    expect(tones).toEqual(new Set(['dark', 'light']));
  });

  it('первая палитра воспроизводит сегодняшний вид сцены', () => {
    // Умолчания схемы. Автор обязан иметь возврат к исходному одним щелчком,
    // иначе выбор палитры — дорога в один конец.
    expect(PALETTES[0]!.theme).toEqual(ThemeSchema.parse({}));
  });

  it('запрос несуществующей палитры падает громко', () => {
    expect(() => paletteById('нет-такой')).toThrow(/нет-такой/);
  });
});
