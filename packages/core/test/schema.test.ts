/**
 * Схема v4: что она принимает и, важнее, что отказывается принимать.
 *
 * Валидация обязана падать громко и называть место. Молчаливое принятие
 * битого проекта — это дефект, который доедет до зрителя.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { alignWords, splitIntoWords } from '../src/align.js';
import { loadProject, ProjectLoadError } from '../src/load.js';
import { ProjectSchema, SCHEMA_VERSION, TRANSITIONS } from '../src/schema.js';

const DIR = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));
const raw = (name: string): any => JSON.parse(readFileSync(join(DIR, name), 'utf8'));
const all = readdirSync(DIR).filter((name) => name.endsWith('.json'));

/**
 * Минимальное валидное объяснение версии 4 — основа отрицательных проверок.
 *
 * Собирается функцией, а не константой: каждый тест ломает свою копию,
 * и общий объект утёк бы правкой из одного теста в другой.
 */
function explanation(): any {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Проверка', stageWidth: 1920, stageHeight: 1080 },
    entry: 'intro',
    segments: [{
      id: 'intro',
      title: 'Введение',
      audio: { src: '/a.mp3', duration: 10, words: [] },
      elements: [{ id: 'box', type: 'shape', content: '' }],
      slides: [{
        id: 's1',
        at: { kind: 'seconds', t: 0 },
        transition: 'morph',
        states: { box: { x: 0, y: 0, width: 100, height: 100 } },
      }],
      gates: [],
      exit: { rules: [], default: null },
    }],
  };
}

const choiceGate = (recordAs: string) => ({
  id: 'g1',
  at: { kind: 'seconds', t: 1 },
  config: {
    kind: 'choice',
    prompt: 'Вопрос?',
    options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }],
    correctId: 'yes',
  },
  onWrong: 'continue',
  maxAttempts: null,
  recordAs,
});

/** Сообщения всех проблем одной строкой — чтобы искать по смыслу, а не по пути. */
function problems(project: unknown): string {
  const result = ProjectSchema.safeParse(project);
  expect(result.success, 'проект прошёл валидацию, хотя не должен был').toBe(false);
  return result.error!.issues.map((i) => i.message).join(' | ');
}

/**
 * Пути всех проблем. Нужны там, где сообщение пишет Zod, а не мы: текст чужой
 * библиотеки меняется от версии к версии, путь — нет.
 */
function problemPaths(project: unknown): string[] {
  const result = ProjectSchema.safeParse(project);
  expect(result.success, 'проект прошёл валидацию, хотя не должен был').toBe(false);
  return result.error!.issues.map((i) => i.path.join('.'));
}

describe('эталонные фикстуры валидны', () => {
  it.each(all)('%s', (name) => {
    expect(() => loadProject(raw(name))).not.toThrow();
  });

  it('заготовка отрицательных проверок сама по себе валидна', () => {
    // Иначе все отрицательные тесты зелены впустую: они падали бы
    // на постороннем дефекте заготовки, а не на том, что ломает тест.
    expect(ProjectSchema.safeParse(explanation()).success).toBe(true);
  });
});

describe('текст озвучки сегмента', () => {
  it('необязателен, но пустой строкой быть не может', () => {
    const base = explanation();

    expect(ProjectSchema.safeParse(base).success).toBe(true);

    const withSpeech = {
      ...base,
      segments: [{ ...base.segments[0], speech: 'Часы это позиция в дорожке.' }],
    };
    expect(ProjectSchema.safeParse(withSpeech).success).toBe(true);

    const empty = {
      ...base,
      segments: [{ ...base.segments[0], speech: '' }],
    };
    expect(problems(empty)).not.toBe('');
  });
});

describe('эталонная фикстура speech.json', () => {
  it('несёт все три расхождения из §4 product.md: перефразировал, пропустил, добавил лишнее', () => {
    const project = loadProject(raw('speech.json'));
    const segment = project.segments[0]!;

    expect(segment.speech).toBeTruthy();
    expect(segment.audio.words.length).toBeGreaterThan(0);

    const ops = alignWords(splitIntoWords(segment.speech!), segment.audio.words);
    const kinds = new Set(ops.map((op) => op.kind));

    // Слабая проверка «есть хоть одна операция кроме same» позеленела бы
    // и на фикстуре с единственным расхождением. §4 называет три разных
    // способа разойтись, и фикстура обязана нести все три операции сразу:
    // `replaced` (перефразировал), `added` (пропустил слово из текста),
    // `removed` (произнёс слово, которого в тексте не было).
    expect(kinds.has('replaced')).toBe(true);
    expect(kinds.has('added')).toBe(true);
    expect(kinds.has('removed')).toBe(true);
  });
});

describe('гейт не может ветвить, а развилка не может стоять в середине', () => {
  it('у гейта нет поля для рёбер: лишний ключ отбрасывается, а не создаёт ветку', () => {
    const project = explanation();
    project.segments[0].gates = [{ ...choiceGate('v1'), edges: [{ to: 'intro' }] }];
    const parsed = ProjectSchema.parse(project);
    expect(parsed.segments[0]!.gates[0]).not.toHaveProperty('edges');
  });

  it('выход есть поле сегмента: положить его в середину некуда', () => {
    // Проверка формы, а не поведения. Если однажды `exit` переедет внутрь
    // слайда или гейта, этот тест обязан упасть и заставить написать ADR.
    const parsed = ProjectSchema.parse(explanation());
    expect(parsed.segments[0]).toHaveProperty('exit');
    expect(parsed.segments[0]!.slides[0]).not.toHaveProperty('exit');
  });
});

describe('слайды', () => {
  it('сегмент без слайдов не открывается', () => {
    const project = explanation();
    project.segments[0].slides = [];
    expect(problemPaths(project)).toContain('segments.0.slides');
  });

  it('первый слайд обязан стоять ровно на нуле', () => {
    const project = explanation();
    project.segments[0].slides[0].at = { kind: 'seconds', t: 0.5 };
    expect(problems(project)).toMatch(/первый слайд обязан стоять на нуле/);
  });

  it('первый слайд нельзя привязать к слову', () => {
    const project = explanation();
    project.segments[0].audio.words = [
      { text: 'раз', start: 0, end: 0.3, source: 'manual' },
    ];
    project.segments[0].slides[0].at = {
      kind: 'word', wordIndex: 0, offset: 0, anchor: { text: 'раз', before: '', after: '' },
    };
    expect(problems(project)).toMatch(/первый слайд обязан стоять на нуле/);
  });

  it('два слайда на одной секунде — неоднозначность, а не мелочь', () => {
    const project = explanation();
    project.segments[0].slides.push({
      id: 's2', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {},
    });
    expect(problems(project)).toMatch(/два слайда на одной секунде/);
  });

  it('слайды не по порядку не проходят', () => {
    const project = explanation();
    project.segments[0].slides.push(
      { id: 's2', at: { kind: 'seconds', t: 5 }, transition: 'morph', transitionSeconds: 0.6, states: {} },
      { id: 's3', at: { kind: 'seconds', t: 2 }, transition: 'morph', transitionSeconds: 0.6, states: {} },
    );
    expect(problems(project)).toMatch(/идут не по порядку/);
  });

  it('направление у приёма, у которого его нет, — не проходит', () => {
    // Появилось в v10. Что должно сломаться, чтобы покраснел: снятие
    // superRefine со SlideSchema. Проверено прицельно — краснеет только он.
    //
    // Обе половины нужны. Без первой тест прошёл бы у схемы, которая
    // запрещает направление ВСЕМ; без второй — у схемы, которая
    // не проверяет ничего.
    const withDirection = (transition: string): any => {
      const project = explanation();
      project.segments[0].slides[0].transition = transition;
      project.segments[0].slides[0].transitionDirection = 'up';
      return project;
    };

    expect(problems(withDirection('dissolve'))).toMatch(/его не имеет/);
    expect(ProjectSchema.safeParse(withDirection('slide')).success).toBe(true);
  });

  /**
   * Группы (v11). Каждый запрет проверяется отдельно, потому что каждый
   * снимается отдельно: у всех четырёх свой слом внутри `superRefine`
   * сегмента, и убрав один, краснеет ровно один тест.
   *
   * Положительной половины «группа с ребёнком проходит» здесь нет намеренно:
   * её проверяет `grouped` внутри первых трёх тестов — они начинают
   * с законного проекта и портят ровно одно место.
   */
  describe('v11: вложенность в группу', () => {
    /** Законный проект: группа `g` и вложенный в неё `box`. */
    function grouped(): any {
      const project = explanation();
      const segment = project.segments[0];
      segment.elements = [
        { id: 'g', type: 'group', content: '' },
        { id: 'box', type: 'shape', content: '', parentId: 'g' },
      ];
      segment.slides[0].states = {
        g: { x: 0, y: 0, width: 400, height: 300 },
        box: { x: 0, y: 0, width: 100, height: 100 },
      };
      return project;
    }

    it('законная группа с ребёнком проходит', () => {
      expect(ProjectSchema.safeParse(grouped()).success).toBe(true);
    });

    it('ссылка на несуществующую группу не проходит', () => {
      const project = grouped();
      project.segments[0].elements[1].parentId = 'нет-такого';
      expect(problems(project)).toMatch(/которой нет в этом сегменте/);
    });

    it('вложение не в группу, а в обычный элемент, не проходит', () => {
      // Слом, отличающий его от соседа: снять проверку типа родителя.
      // Ссылка при этом остаётся разрешимой, поэтому предыдущий тест
      // от этого слома не краснеет.
      const project = grouped();
      project.segments[0].elements[0] = { id: 'g', type: 'shape', content: '' };
      expect(problems(project)).toMatch(/Вкладывать можно только в group/);
    });

    it('цикл вложенности не проходит', () => {
      // Группа внутри группы законна, поэтому цикл строится из двух групп.
      // Без проверки цикла подъём до корня не кончился бы никогда.
      const project = grouped();
      project.segments[0].elements = [
        { id: 'g', type: 'group', content: '', parentId: 'h' },
        { id: 'h', type: 'group', content: '', parentId: 'g' },
      ];
      project.segments[0].slides[0].states = {
        g: { x: 0, y: 0, width: 400, height: 300 },
        h: { x: 0, y: 0, width: 400, height: 300 },
      };
      expect(problems(project)).toMatch(/зациклена/);
    });

    it('ребёнок на слайде, где нет его группы, не проходит', () => {
      // Не выдумка: именно так выглядел бы слайд, с которого автор убрал
      // группу, не убрав её содержимое. Координаты ребёнка отсчитываются
      // от группы, поэтому позиции у него не было бы вовсе.
      const project = grouped();
      delete project.segments[0].slides[0].states.g;
      expect(problems(project)).toMatch(/а его группы .* — нет/);
    });
  });

  // Теста «отсутствие направления не превращается в „left"» здесь НЕТ,
  // и это результат проверки сломом. Слом (`.default('left')` у поля)
  // покрасил 138 тестов в 15 файлах: умолчание противоречит самому
  // superRefine — оно проставило бы направление и слайдам с `dissolve`, —
  // а лишний ключ в файле ловит roundtrip «в тексте файла нет ключей
  // сверх схемы». Свойство защищено и без отдельного теста; свой был бы
  // декоративным. Решение записано комментарием у поля в схеме.

  it('состояние несуществующего элемента не проходит', () => {
    const project = explanation();
    project.segments[0].slides[0].states['нет-такого'] = { x: 0, y: 0, width: 1, height: 1 };
    expect(problems(project)).toMatch(/которого нет в сегменте/);
  });

  it('нулевой размер законен: из него элемент вырастает', () => {
    const project = explanation();
    project.segments[0].slides[0].states['box'] = { x: 0, y: 0, width: 0, height: 0 };
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('отрицательный размер незаконен', () => {
    const project = explanation();
    project.segments[0].slides[0].states['box'] = { x: 0, y: 0, width: -1, height: 10 };
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });
});

describe('переменные зрителя', () => {
  it('две записи в одну переменную — неоднозначность на всё объяснение', () => {
    const project = explanation();
    project.segments[0].gates = [choiceGate('ответ'), { ...choiceGate('ответ'), id: 'g2' }];
    expect(problems(project)).toMatch(/записывается дважды/);
  });

  it('правило смотрит на переменную, которой никто не пишет', () => {
    const project = explanation();
    project.segments[0].exit = {
      rules: [{ id: 'r1', when: [{ kind: 'equals', variable: 'ниоткуда', value: 'yes' }], goto: 'intro' }],
      default: 'intro',
    };
    expect(problems(project)).toMatch(/не записывает ни один гейт/);
  });

  it('переменную можно записать в одном сегменте, а прочитать в другом', () => {
    // Ответы живут на всё объяснение и переживают переходы между сегментами.
    const project = explanation();
    project.segments[0].gates = [choiceGate('ответ')];
    project.segments.push({
      id: 'второй',
      title: '',
      description: '',
      audio: { src: '/b.mp3', duration: 5, words: [] },
      elements: [],
      slides: [{ id: 'b1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
      gates: [],
      exit: {
        rules: [{ id: 'r1', when: [{ kind: 'correct', variable: 'ответ' }], goto: 'intro' }],
        default: 'второй',
      },
    });
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('сравнивать значение переменной от гейта «дальше» не с чем', () => {
    const project = explanation();
    project.segments[0].gates = [{
      id: 'g1',
      at: { kind: 'seconds', t: 1 },
      config: { kind: 'continue', label: 'Дальше' },
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: 'дальше',
    }];
    project.segments[0].exit = {
      rules: [{ id: 'r1', when: [{ kind: 'equals', variable: 'дальше', value: 'x' }], goto: 'intro' }],
      default: 'intro',
    };
    expect(problems(project)).toMatch(/у него один исход/);
  });
});

describe('ссылки', () => {
  it('стартовый сегмент обязан существовать', () => {
    const project = explanation();
    project.entry = 'нет-такого';
    expect(problems(project)).toMatch(/Стартовый сегмент/);
  });

  it('идентификатор сегмента не повторяется', () => {
    const project = explanation();
    project.segments.push({ ...explanation().segments[0] });
    expect(problems(project)).toMatch(/Идентификатор сегмента повторяется/);
  });

  it('правило не ведёт в несуществующий сегмент', () => {
    const project = explanation();
    project.segments[0].gates = [choiceGate('ответ')];
    project.segments[0].exit = {
      rules: [{ id: 'r1', when: [{ kind: 'correct', variable: 'ответ' }], goto: 'нет-такого' }],
      default: 'intro',
    };
    expect(problems(project)).toMatch(/несуществующий сегмент/);
  });

  it('метка за пределами дорожки не проходит', () => {
    const project = explanation();
    project.segments[0].gates = [{ ...choiceGate('ответ'), at: { kind: 'seconds', t: 99 } }];
    expect(problems(project)).toMatch(/выходит за длительность/);
  });

  it('ссылка на слово при пустом транскрипте не проходит', () => {
    const project = explanation();
    project.segments[0].gates = [{
      ...choiceGate('ответ'),
      at: { kind: 'word', wordIndex: 0, offset: 0, anchor: { text: 'а', before: '', after: '' } },
    }];
    expect(problems(project)).toMatch(/пустом транскрипте/);
  });

  /**
   * Сирота (`product.md` §4) — метка, чьё слово не нашлось при выравнивании.
   * Её `wordIndex` это ДОГАДКА в актуальной расшифровке, а `lost` — якорь,
   * который искали. Схема обязана требовать от догадки того же, что от
   * обычной привязки: указывать на существующее слово.
   */
  const orphanGate = (wordIndex: number) => ({
    ...choiceGate('ответ'),
    at: {
      kind: 'orphan',
      wordIndex,
      offset: 0,
      lost: { text: 'энергия', before: '', after: 'не' },
    },
  });

  const withWords = () => {
    const project = explanation();
    project.segments[0].audio.words = [
      { text: 'раз', start: 0, end: 0.3, source: 'asr' },
      { text: 'два', start: 0.4, end: 0.7, source: 'asr' },
    ];
    return project;
  };

  it('сирота с догадкой на существующее слово — валидный проект', () => {
    const project = withWords();
    project.segments[0].gates = [orphanGate(1)];
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('догадка сироты за пределами транскрипта не проходит', () => {
    const project = withWords();
    project.segments[0].gates = [orphanGate(5)];
    expect(problems(project)).toMatch(/Слово №5 отсутствует/);
  });

  it('сирота при пустом транскрипте не проходит: догадке некуда указывать', () => {
    const project = explanation();
    project.segments[0].gates = [orphanGate(0)];
    expect(problems(project)).toMatch(/пустом транскрипте/);
  });

  it('сирота без якоря потерянного слова не проходит: нечего искать заново', () => {
    const project = withWords();
    const gate: any = orphanGate(1);
    delete gate.at.lost;
    project.segments[0].gates = [gate];
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });
});

describe('загрузка падает громко и перечисляет проблемы', () => {
  it('ошибка — ProjectLoadError со списком, а не «что-то пошло не так»', () => {
    const project = explanation();
    project.entry = 'нет-такого';
    project.segments[0].slides[0].at = { kind: 'seconds', t: 3 };
    try {
      loadProject(project);
      expect.unreachable('загрузка должна была упасть');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectLoadError);
      expect((error as ProjectLoadError).issues.length).toBeGreaterThan(1);
    }
  });
});

/**
 * Версия 4 добавила ровно две вещи, и обе — про то, чего схема раньше сказать
 * не давала: что у остановки может не быть верного ответа и что часть звучит
 * не с начала файла.
 */
describe('версия 4: развилка и окно дорожки', () => {
  /** Объяснение, где остановка — развилка: два равноправных исхода. */
  function withFork(): any {
    const project = explanation();
    project.segments[0].gates = [{
      id: 'g-fork',
      at: { kind: 'seconds', t: 5 },
      config: {
        kind: 'choice',
        prompt: 'Куда пойти?',
        options: [{ id: 'left', label: 'Налево' }, { id: 'right', label: 'Направо' }],
        correctId: null,
      },
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: 'куда',
    }];
    return project;
  }

  it('развилка не обязана назначать верный ответ', () => {
    expect(ProjectSchema.safeParse(withFork()).success).toBe(true);
  });

  it('вопрос по-прежнему обязан указывать на настоящий вариант', () => {
    const project = withFork();
    project.segments[0].gates[0].config.correctId = 'нет-такого-варианта';
    expect(problems(project)).toMatch(/correctId/);
  });

  it('о развилке нельзя вынести вердикт «верно»: сравнивать не с чем', () => {
    const project = withFork();
    project.segments[0].exit = {
      rules: [{ id: 'r', when: [{ kind: 'correct', variable: 'куда' }], goto: 'intro' }],
      default: 'intro',
    };
    expect(problems(project)).toMatch(/верного ответа|вердикт/i);
  });

  it('о вопросе вердикт «верно» по-прежнему законен', () => {
    const project = withFork();
    project.segments[0].gates[0].config.correctId = 'left';
    project.segments[0].exit = {
      rules: [{ id: 'r', when: [{ kind: 'correct', variable: 'куда' }], goto: 'intro' }],
      default: 'intro',
    };
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('окно дорожки по умолчанию начинается с начала файла', () => {
    const parsed = ProjectSchema.parse(explanation());
    expect(parsed.segments[0]!.audio.offset).toBe(0);
  });

  it('окно дорожки не может начинаться раньше начала файла', () => {
    const project = explanation();
    project.segments[0].audio.offset = -1;
    expect(problems(project).length).toBeGreaterThan(0);
  });

  it('смещение окна не сдвигает систему координат части', () => {
    // Часть звучит с 30-й секунды файла, но внутри неё время идёт от нуля:
    // первый слайд на нуле законен, а метка за длительностью окна — нет.
    const project = explanation();
    project.segments[0].audio.offset = 30;
    expect(ProjectSchema.safeParse(project).success).toBe(true);

    project.segments[0].slides[0].at = { kind: 'seconds', t: 999 };
    expect(problems(project)).toMatch(/выходит за длительность/);
  });
});

describe('схема v9: тема, описание части, приём и длительность перехода', () => {
  it('слайд без transitionSeconds получает 0.6', () => {
    // Число обязано совпасть с прежним MORPH_DURATION_S: умолчание
    // воспроизводит сегодняшний вид, иначе 80 скриншотных эталонов
    // покраснеют — и это единственная проверка, доказывающая, что v9
    // ничего не изменила.
    const project = ProjectSchema.parse(explanation());
    const slide = project.segments[0]!.slides[0]!;
    expect(slide.transitionSeconds).toBe(0.6);
    expect(slide.transition).toBe('morph');
  });

  it('каталог переходов несёт восемь приёмов', () => {
    // Поимённо, а не «длина восемь»: приём, подменённый другим, прошёл бы
    // проверку по длине. «Штора» и «Круг» стоят здесь по замеру S12,
    // а не по рассуждению.
    expect([...TRANSITIONS]).toEqual([
      'cut', 'morph', 'dissolve', 'slide', 'scale', 'blur', 'wipe', 'circle',
    ]);
  });

  it('неизвестный приём не принимается', () => {
    const project = explanation();
    project.segments[0].slides[0].transition = 'выдумка';
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it('отрицательная длительность перехода не принимается', () => {
    const project = explanation();
    project.segments[0].slides[0].transitionSeconds = -1;
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it('сегмент без описания получает пустую строку', () => {
    const project = ProjectSchema.parse(explanation());
    expect(project.segments[0]!.description).toBe('');
  });

  it('проект без темы получает десять ролей со значениями по умолчанию', () => {
    const project = ProjectSchema.parse(explanation());
    expect(Object.keys(project.meta.theme)).toHaveLength(10);
    expect(project.meta.theme['--scene-accent']).toBe('#4c8dff');
    expect(project.meta.theme['--scene-radius']).toBe('28px');
  });

  it('тема закрыта: лишняя роль отбрасывается, а не сохраняется молча', () => {
    // Закрытый список — условие того, чтобы каталог палитр остался данными.
    // Если чужая палитра принесёт свою роль, а мы её сохраним, элементы
    // сославшиеся на неё почернеют в проекте без этой палитры — молча,
    // без ошибки и предупреждения (измерено S11).
    const project = explanation();
    project.meta.theme = { '--scene-выдумка': '#ff0000' };
    const parsed = ProjectSchema.parse(project);
    expect(parsed.meta.theme).not.toHaveProperty('--scene-выдумка');
    expect(Object.keys(parsed.meta.theme)).toHaveLength(10);
  });

  it('автор может переопределить одну роль, остальные девять остаются', () => {
    const project = explanation();
    project.meta.theme = { '--scene-accent': '#ff0000' };
    const parsed = ProjectSchema.parse(project);
    expect(parsed.meta.theme['--scene-accent']).toBe('#ff0000');
    expect(parsed.meta.theme['--scene-bg']).toBe('#0f1620');
    expect(Object.keys(parsed.meta.theme)).toHaveLength(10);
  });
});

describe('схема v17: ключ байтов и контур', () => {
  /**
   * Проект с единственным элементом, поля которого задаёт вызывающий.
   * Тот же приём, что у `grouped()` выше (v11: вложенность в группу):
   * берём `explanation()` и подменяем ровно то, что нужно тесту, — элемент
   * и состояние слайда, — а не заводим третий способ собирать проект.
   */
  function projectWithElement(element: Record<string, unknown>): any {
    const project = explanation();
    const id = element['id'];
    project.segments[0].elements = [element];
    project.segments[0].slides[0].states = {
      [id as string]: { x: 0, y: 0, width: 100, height: 100 },
    };
    return project;
  }

  it('картинка принимает assetId', () => {
    const p = loadProject(projectWithElement({ id: 'e1', type: 'image', assetId: 'a1' }));
    expect(p.segments[0]!.elements[0]!.assetId).toBe('a1');
  });

  it('assetId у ТЕКСТА не проходит: ключ байтов бессмыслен без картинки', () => {
    expect(() => loadProject(projectWithElement({ id: 'e1', type: 'text', assetId: 'a1' })))
      .toThrow();
  });

  it('фигура принимает контур', () => {
    const p = loadProject(projectWithElement({
      id: 'e1', type: 'shape',
      path: { d: 'M 0 0 L 10 10', width: 10, height: 10 },
    }));
    expect(p.segments[0]!.elements[0]!.path!.d).toBe('M 0 0 L 10 10');
  });

  it('контур с нулевой шириной не проходит: делить на неё нечем', () => {
    expect(() => loadProject(projectWithElement({
      id: 'e1', type: 'shape',
      path: { d: 'M 0 0', width: 0, height: 10 },
    }))).toThrow();
  });

  it('список шрифтов проекта пуст по умолчанию, а не отсутствует', () => {
    expect(loadProject(explanation()).fonts).toEqual([]);
  });
});
