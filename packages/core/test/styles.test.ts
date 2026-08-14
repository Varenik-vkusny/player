/**
 * Стили: схема v12.
 *
 * Каждый тест здесь отвечает на вопрос «что должно сломаться, чтобы он
 * покраснел», и — отдельно — на вопрос «верно ли это утверждение при ЛЮБОЙ
 * реализации предмета». Второй вопрос ловит то, что первый пропускает:
 * «проект со стилями загрузился» верно при любой реализации загрузки
 * и не проверяет ничего.
 *
 * → docs/adr/ADR-029-styles.md, docs/design/styles.md
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadProject } from '../src/load.js';
import { migrateToCurrent } from '../src/migrations.js';
import { SCHEMA_VERSION, StyleSchema } from '../src/schema.js';

const DIR = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));
const raw = (name: string): any => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

/** Эталонная фикстура стилей — она же образец для всех проверок ниже. */
const fixture = () => raw('styles.json');

describe('схема v12: стиль как объект проекта', () => {
  it('фикстура стилей загружается и несёт три стиля', () => {
    const project = loadProject(fixture());

    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.styles.map((s) => s.id)).toEqual(['heading', 'quiet', 'plate']);
  });

  it('геометрию в стиль положить нечем', () => {
    // Не «мы договорились не класть», а «схема не принимает». Проверяется
    // тем, что поля стиля — это `id`, `name`, `type`, `props`, и ключа
    // для координат среди них нет. Слом: добавить `x` в StyleSchema —
    // тест покраснеет на лишнем ключе.
    expect(Object.keys(StyleSchema.shape).sort()).toEqual(['id', 'name', 'props', 'type']);
  });
});

describe('схема v12: ссылка на стиль', () => {
  it('ссылка на несуществующий стиль НЕ загружается', () => {
    const broken = fixture();
    broken.segments[0].slides[0].states['title'].styleId = 'no-such-style';

    expect(() => loadProject(broken)).toThrow(/no-such-style/);
  });

  it('стиль текста НЕ встаёт на фигуру', () => {
    // Самый тихий из возможных дефектов: такой проект не упал бы и не
    // почернел — он применил бы `font-size` к тому, у чего нет текста,
    // и автор увидел бы, что «стиль не работает», без признака причины.
    const broken = fixture();
    broken.segments[0].slides[0].states['plate-1'].styleId = 'heading';

    expect(() => loadProject(broken)).toThrow(/heading/);
  });

  it('повторённый идентификатор стиля НЕ загружается', () => {
    const broken = fixture();
    broken.styles.push({ ...broken.styles[0], name: 'Двойник' });

    expect(() => loadProject(broken)).toThrow(/повторя/i);
  });

  it('идентификатор стиля с пробелом или кириллицей НЕ принимается', () => {
    // Он попадает в СЕЛЕКТОР CSS. Селектор с пробелом не ошибка, а молча
    // нерабочее правило: браузер отбрасывает нечитаемый селектор и молчит.
    // Стиль ДОБАВЛЯЕТСЯ, а не подменяется, и на него никто не ссылается.
    // Иначе подмена оставила бы висячую ссылку у соседнего элемента, тест
    // падал бы на «стиль не существует» и был бы зелёным по другой причине:
    // проверено сломом — при снятом ограничении идентификатора он не краснел.
    for (const bad of ['мой стиль', 'has space', 'Заголовок', 'quote"inside', 'точка.в.имени']) {
      const broken = fixture();
      broken.styles.push({ id: bad, name: 'Чужое имя', type: 'text', props: {} });

      expect(() => loadProject(broken), `идентификатор «${bad}»`).toThrow();
    }
  });

  it('законный идентификатор принимается — иначе предыдущий тест ловил бы что угодно', () => {
    const ok = fixture();
    ok.styles.push({ id: 'Zag-2_x', name: 'Законный', type: 'text', props: {} });

    expect(() => loadProject(ok)).not.toThrow();
  });
});

describe('схема v12: элемент вправе идти по РАЗНЫМ стилям на разных слайдах', () => {
  it('заголовок начинается Главным и становится Тихим', () => {
    // Решение владельца 14.08.2026, ради которого ссылка легла в состояние
    // слайда, а не на элемент. Слом: перенести `styleId` на элемент —
    // выразить это станет негде, и тест покраснеет.
    const project = loadProject(fixture());
    const slides = project.segments[0]!.slides;

    expect(slides[0]!.states['title']!.styleId).toBe('heading');
    expect(slides[1]!.states['title']!.styleId).toBe('quiet');
  });
});

describe('схема v12: отцепление выразимо ПО СВОЙСТВУ', () => {
  it('ключ в собственной карте есть только у отцепленного свойства', () => {
    // Признак «отличается от стиля» — НАЛИЧИЕ ключа, а не равенство
    // значений (ADR-029). Сравнение значений дало бы ложное «совпадает»
    // на свойстве, которое автор выставил руками в то же самое число.
    const project = loadProject(fixture());
    const first = project.segments[0]!.slides[0]!.states;

    expect(first['sub']!.styleId).toBe('heading');
    expect(Object.keys(first['sub']!.style)).toEqual(['font-size']);

    // Тот же стиль, ничего не тронуто рукой — карта пуста.
    expect(first['title']!.styleId).toBe('heading');
    expect(Object.keys(first['title']!.style)).toEqual([]);
  });
});

describe('миграция v11 → v12', () => {
  it('добавляет пустой список стилей и не трогает больше ничего', () => {
    const v11 = raw('groups.json');
    expect(v11.schemaVersion).toBe(11);

    const migrated = migrateToCurrent(v11) as any;

    expect(migrated.schemaVersion).toBe(12);
    expect(migrated.styles).toEqual([]);
    expect(migrated.meta).toEqual(v11.meta);
    expect(migrated.entry).toEqual(v11.entry);
    expect(migrated.segments).toEqual(v11.segments);
  });

  it('старая фикстура после миграции проходит схему и ни один элемент не получил стиля', () => {
    // Это и есть условие доказательства для ста скриншотных эталонов:
    // умолчание обязано воспроизвести сегодняшний вид. Слом: заставить
    // миграцию проставлять `styleId` — тест покраснеет здесь, а эталоны
    // покраснеют в e2e.
    const project = loadProject(raw('groups.json'));

    expect(project.styles).toEqual([]);
    const withStyle = project.segments
      .flatMap((segment) => segment.slides)
      .flatMap((slide) => Object.values(slide.states))
      .filter((state) => state.styleId !== undefined);

    expect(withStyle).toEqual([]);
  });
});
