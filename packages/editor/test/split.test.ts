/**
 * Разрез части по развилке.
 *
 * Главное здесь — не «функция вернула объект», а три вещи, каждая из которых
 * ломается тихо:
 *
 *   стык невидим — первый слайд продолжения обязан быть точным снимком сцены
 *   на момент разреза, иначе зритель увидит скачок именно на границе;
 *
 *   метки переехали согласованно — слова второй половины уезжают в новую
 *   часть, их индексы сдвигаются, и всё, что на них ссылалось, обязано
 *   указывать на ТЕ ЖЕ слова (инвариант №10);
 *
 *   результат ПРОХОДИМ — разрезанный проект не просто валиден, а доводит
 *   зрителя по любой ветке. Валидность данных не равна достижимости поведения.
 */
import {
  loadProject, resolveTimeRef, SCHEMA_VERSION, ThemeSchema, type Project, type Segment, type Word,
} from '@player/core';
import { describe, expect, it } from 'vitest';

import { splitAtGate, splitAtTime } from '../src/state/project.js';
import {
  speechLossWarning, splitAtTimeBlockedReason, splitSegmentAtGate, splitSegmentAtTime, SplitError,
} from '../src/state/split.js';

/** Десять слов по секунде: «w0» в 0.000, «w1» в 1.000 и так далее. */
const WORDS: Word[] = Array.from({ length: 10 }, (_, index) => ({
  text: `w${index}`,
  start: index,
  end: index + 0.5,
  source: 'manual' as const,
}));

const wordRef = (index: number) => ({
  kind: 'word' as const,
  wordIndex: index,
  offset: 0,
  anchor: { text: `w${index}`, before: '', after: '' },
});

const box = (x: number) => ({
  x, y: 0, width: 100, height: 100,
  rotation: 0, zIndex: 0, opacity: 1, visible: true, flipX: false, flipY: false, style: {},
});

/**
 * Часть длиной 10 секунд: слайды на 0, на слове №3 и на слове №7,
 * остановка-выбор на пятой секунде. Ровно то, что автор разрезает.
 */
function project(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Разрез', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry: 'whole',
    styles: [],
    segments: [{
      id: 'whole',
      title: 'Цельное повествование',
      description: '',
      audio: { src: '/track.mp3', offset: 0, duration: 10, words: WORDS },
      elements: [
        { id: 'hero', type: 'text', content: 'Заголовок', locked: false },
        { id: 'late', type: 'shape', content: '', locked: false },
      ],
      slides: [
        { id: 'sl-0', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: { hero: box(0) } },
        { id: 'sl-3', at: wordRef(3), transition: 'morph', transitionSeconds: 0.6, states: { hero: box(300) } },
        { id: 'sl-7', at: wordRef(7), transition: 'morph', transitionSeconds: 0.6, states: { hero: box(700), late: box(50) } },
      ],
      gates: [{
        id: 'g-fork',
        at: { kind: 'seconds', t: 5 },
        config: {
          kind: 'choice',
          prompt: 'Куда дальше?',
          options: [{ id: 'left', label: 'Налево' }, { id: 'right', label: 'Направо' }],
          correctId: 'left',
        },
        onWrong: 'continue',
        maxAttempts: null,
        recordAs: 'куда',
      }],
      exit: { rules: [], default: null },
    }],
  } as Project;
}

const split = () => splitAtGate(project(), 'whole', 'g-fork');
const parts = () => splitSegmentAtGate(project().segments[0]!, 'g-fork', project().segments);

describe('разрез делит повествование, а не копирует его', () => {
  it('голова кончается на развилке', () => {
    const { head } = parts();
    expect(head.audio.duration).toBe(5);
    expect(head.slides.map((s) => s.id)).toEqual(['sl-0', 'sl-3']);
  });

  it('остановка становится развилкой: верного ответа у неё больше нет', () => {
    const gate = parts().head.gates[0]!;
    expect(gate.config.kind).toBe('choice');
    expect(gate.config.kind === 'choice' && gate.config.correctId).toBe(null);
  });

  it('на каждый вариант ответа появляется своя часть', () => {
    const { branches } = parts();
    expect(branches).toHaveLength(2);
    expect(branches.map((b) => b.title)).toEqual(['Налево', 'Направо']);
  });

  it('ветки сходятся обратно в продолжение, а не обрываются', () => {
    const { branches, tail } = parts();
    expect(tail).not.toBeNull();
    for (const branch of branches) {
      expect(branch.exit.default).toBe(tail!.id);
    }
  });

  it('выход головы ведёт в ветки по варианту ответа', () => {
    const { head, branches } = parts();
    expect(head.exit.rules.map((r) => r.goto)).toEqual(branches.map((b) => b.id));
    expect(head.exit.rules.map((r) => r.when[0]!.kind === 'equals' && r.when[0]!.value))
      .toEqual(['left', 'right']);
  });

  it('решение о продолжении переезжает в продолжение вместе с повествованием', () => {
    // Выход отвечает на вопрос «что дальше, когда договорили». Договаривает
    // теперь хвост, значит выход исходной части принадлежит ему.
    const source = project().segments[0]!;
    expect(parts().tail!.exit).toEqual(source.exit);
  });
});

describe('аудио не режется: два окна одного файла', () => {
  it('обе половины ссылаются на один и тот же файл', () => {
    const { head, tail } = parts();
    expect(head.audio.src).toBe('/track.mp3');
    expect(tail!.audio.src).toBe('/track.mp3');
  });

  it('окно продолжения начинается там, где кончилось окно головы', () => {
    const { head, tail } = parts();
    expect(head.audio.offset).toBe(0);
    expect(tail!.audio.offset).toBe(5);
    expect(tail!.audio.duration).toBe(5);
  });

  it('окна вместе покрывают исходную дорожку без нахлёста и без дыры', () => {
    const source = project().segments[0]!.audio;
    const { head, tail } = parts();
    expect(head.audio.offset).toBe(source.offset);
    expect(head.audio.offset + head.audio.duration).toBe(tail!.audio.offset);
    expect(tail!.audio.offset + tail!.audio.duration).toBe(source.offset + source.duration);
  });
});

describe('стык невидим', () => {
  it('первый слайд продолжения — точный снимок сцены на момент разреза', () => {
    const { head, tail } = parts();
    const lastBeforeCut = head.slides.at(-1)!;
    expect(tail!.slides[0]!.states).toEqual(lastBeforeCut.states);
  });

  it('первый слайд продолжения стоит на нуле и не морфится', () => {
    const first = parts().tail!.slides[0]!;
    expect(first.at).toEqual({ kind: 'seconds', t: 0 });
    // На стыке частей анимировать нечего: картинка уже совпадает.
    expect(first.transition).toBe('cut');
  });

  it('снимок берётся у слайда, который ДЕЙСТВУЕТ на разрезе, а не у ближайшего', () => {
    // Разрез на 5-й секунде: действует слайд со слова №3, а не следующий.
    const tail = parts().tail!;
    expect(tail.slides[0]!.states['hero']!.x).toBe(300);
  });
});

describe('метки времени переезжают согласованно со словами', () => {
  it('слова делятся по точке разреза', () => {
    const { head, tail } = parts();
    expect(head.audio.words.map((w) => w.text)).toEqual(['w0', 'w1', 'w2', 'w3', 'w4']);
    expect(tail!.audio.words.map((w) => w.text)).toEqual(['w5', 'w6', 'w7', 'w8', 'w9']);
  });

  it('слова продолжения отсчитываются от нуля своей части', () => {
    expect(parts().tail!.audio.words[0]!.start).toBe(0);
  });

  it('ссылка на слово указывает на ТО ЖЕ слово после переезда', () => {
    // Слайд стоял на слове «w7» (7-я секунда исходной части). После разреза
    // он обязан стоять на нём же — то есть на 2-й секунде продолжения.
    const tail = parts().tail!;
    const moved = tail.slides.find((slide) => slide.id === 'sl-7')!;
    expect(moved.at.kind === 'word' && moved.at.wordIndex).toBe(2);
    expect(tail.audio.words[2]!.text).toBe('w7');
    expect(resolveTimeRef(moved.at, tail.audio.words)).toBe(2);
  });

  it('якорь не перепривязывается: текст вокруг слова не менялся', () => {
    const moved = parts().tail!.slides.find((slide) => slide.id === 'sl-7')!;
    expect(moved.at.kind === 'word' && moved.at.anchor.text).toBe('w7');
  });
});

describe('элементы едут туда, где они используются', () => {
  it('часть не тащит за собой элементы, которых на её слайдах нет', () => {
    const { head } = parts();
    expect(head.elements.map((e) => e.id)).toEqual(['hero']);
  });

  it('элемент, появляющийся после разреза, уезжает в продолжение', () => {
    const tail = parts().tail!;
    expect(tail.elements.map((e) => e.id).sort()).toEqual(['hero', 'late']);
  });
});

describe('разрезанный проект пригоден к показу, а не только валиден', () => {
  it('открывается загрузкой без единой жалобы схемы', () => {
    expect(() => loadProject(split())).not.toThrow();
  });

  it('части не теряются и не задваиваются', () => {
    const ids = split().segments.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Исходная часть, две ветки, продолжение.
    expect(ids).toHaveLength(4);
  });

  it('обе ветки достижимы, и обе доводят до продолжения', () => {
    const result = loadProject(split());
    const head = result.segments.find((s) => s.id === 'whole')!;
    const tailId = result.segments.at(-1)!.id;

    for (const rule of head.exit.rules) {
      const branch = result.segments.find((s) => s.id === rule.goto)!;
      expect(branch, `ветка «${rule.goto}» существует`).toBeTruthy();
      expect(branch.exit.default, `ветка «${rule.goto}» доводит до продолжения`).toBe(tailId);
    }
  });

  it('выход головы тотален: ответ не может оказаться в тупике', () => {
    // Схема отказала бы при загрузке, но проверить стоит и здесь: правило
    // на каждый вариант — это и есть тотальность без запасного выхода.
    const head = loadProject(split()).segments.find((s) => s.id === 'whole')!;
    expect(head.exit.default).toBe(null);
    expect(head.exit.rules).toHaveLength(2);
  });
});

describe('разрез отказывается делать бессмыслицу', () => {
  it('остановки нет', () => {
    expect(() => splitAtGate(project(), 'whole', 'нет-такой')).toThrow(SplitError);
  });

  it('остановка без вариантов ответа ветвить не может', () => {
    const source = project();
    source.segments[0]!.gates[0]!.config = { kind: 'continue', label: 'Дальше' };
    expect(() => splitAtGate(source, 'whole', 'g-fork')).toThrow(/ветвить нечем/);
  });

  it('развилка в самом начале главы: делить нечего', () => {
    const source = project();
    source.segments[0]!.gates[0]!.at = { kind: 'seconds', t: 0 };
    // Образец прибит к ТЕКСТУ, а не к типу ошибки, намеренно: голый
    // `toThrow(SplitError)` был бы зелёным и когда разрез падает по другой
    // причине — например, не найдя остановку. Слово поменялось с «части»
    // на «главы» по решению владельца (product.md §2з), проверяемое
    // свойство при этом то же.
    expect(() => splitAtGate(source, 'whole', 'g-fork')).toThrow(/в начале главы/);
  });
});

describe('развилка в конце дорожки: продолжения не возникает', () => {
  function atTheEnd() {
    const source = project();
    source.segments[0]!.gates[0]!.at = { kind: 'seconds', t: 10 };
    return source;
  }

  it('продолжения нет — резать после развилки нечего', () => {
    const { tail } = splitSegmentAtGate(atTheEnd().segments[0]!, 'g-fork', []);
    expect(tail).toBeNull();
  });

  it('ветки заканчивают объяснение, а не ведут в пустоту', () => {
    const { branches } = splitSegmentAtGate(atTheEnd().segments[0]!, 'g-fork', []);
    for (const branch of branches) {
      expect(branch.exit.default).toBeNull();
      expect(branch.exit.rules).toEqual([]);
    }
  });

  it('и такой проект тоже открывается', () => {
    expect(() => loadProject(splitAtGate(atTheEnd(), 'whole', 'g-fork'))).not.toThrow();
  });
});

/**
 * Часть с расшифровкой из четырёх слов («Кошка» 0с, «бежит» 1с, «быстро» 2с,
 * «домой» 3с), остановкой-выбором `g1` на 2-й секунде и текстом озвучки из
 * тех же четырёх слов, где одно взято в другой форме («бежит» → «бежала»).
 * Расхождение формы — не опечатка теста, а ровно то, ради чего нужно
 * сопоставление, а не деление по индексу.
 */
function segmentWithSpeechAndWords(): Segment {
  const words: Word[] = [
    { text: 'Кошка', start: 0, end: 0.5, source: 'manual' },
    { text: 'бежит', start: 1, end: 1.5, source: 'manual' },
    { text: 'быстро', start: 2, end: 2.5, source: 'manual' },
    { text: 'домой', start: 3, end: 3.5, source: 'manual' },
  ];
  return {
    id: 'speech-source',
    title: 'Кусок с озвучкой',
    description: '',
    speech: 'Кошка бежала быстро домой',
    audio: { src: '/track.mp3', offset: 0, duration: 4, words },
    elements: [],
    slides: [{ id: 'sl-0', at: { kind: 'seconds', t: 0 }, transition: 'cut', transitionSeconds: 0.6, states: {} }],
    gates: [{
      id: 'g1',
      at: { kind: 'seconds', t: 2 },
      config: {
        kind: 'choice',
        prompt: 'Куда дальше?',
        options: [{ id: 'a', label: 'Налево' }, { id: 'b', label: 'Направо' }],
        correctId: 'a',
      },
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: 'куда',
    }],
    exit: { rules: [], default: null },
  };
}

describe('разрез делит текст озвучки', () => {
  it('голова и продолжение делят речь по шву расшифровки', () => {
    const segment = segmentWithSpeechAndWords();
    const { head, tail } = splitSegmentAtGate(segment, 'g1', []);

    // Точные значения, а не тождество «голова + хвост == исходный текст» —
    // такое тождество верно при ЛЮБОМ шве (`slice(0, n)` + `slice(n)` всегда
    // даёт исходный массив), поэтому не проверяет, что шов встал ПРАВИЛЬНО.
    // Расшифровка режется на секунде 2 после слов «Кошка»(0с) и «бежит»(1с) —
    // `wordsCut` равен 2, — и ровно эти же по счёту два слова речи достаются
    // голове.
    expect(head.speech).toBe('Кошка бежала');
    expect(tail?.speech).toBe('быстро домой');
  });

  it('ветки речи не получают: их повествования ещё нет', () => {
    const { branches } = splitSegmentAtGate(segmentWithSpeechAndWords(), 'g1', []);
    for (const branch of branches) expect(branch.speech).toBeUndefined();
  });

  it('шов речи не равен шву расшифровки, когда диктор проглотил слово', () => {
    // В речи перед швом есть слово «первая», которого нет в расшифровке —
    // операция `removed`, потребляющая только сторону речи. Расшифровка
    // по-прежнему режется после 2 слов (`wordsCut` = 2), но голова обязана
    // получить на одно слово речи БОЛЬШЕ: «первая» досталось ей, хотя не
    // считается расшифровкой вовсе. Если бы разрез делил речь тем же
    // числовым индексом `wordsCut`, что и расшифровку (не сопоставлением),
    // голова получила бы лишь «Кошка первая» — на слово «бежит» короче.
    const base = segmentWithSpeechAndWords();
    const segment = { ...base, speech: 'Кошка первая бежит быстро домой' };
    const { head, tail } = splitSegmentAtGate(segment, 'g1', []);

    expect(head.speech).toBe('Кошка первая бежит');
    expect(tail?.speech).toBe('быстро домой');
  });

  it('расшифровки нет — шва нет: речь целиком у головы', () => {
    const base = segmentWithSpeechAndWords();
    const segment = { ...base, audio: { ...base.audio, words: [] } };
    const { head, tail } = splitSegmentAtGate(segment, 'g1', []);

    expect(head.speech).toBe(segment.speech);
    expect(tail?.speech).toBeUndefined();
  });

  it('речи не было — её нет ни у кого, и это не ошибка', () => {
    const segment = { ...segmentWithSpeechAndWords(), speech: undefined };
    const { head, tail } = splitSegmentAtGate(segment, 'g1', []);

    expect(head.speech).toBeUndefined();
    expect(tail?.speech).toBeUndefined();
  });
});

/**
 * ADR-022, перенесённое из Задачи 4: автор обязан узнать о потере текста
 * озвучки СРАЗУ после разреза (см. `speechLossWarning` в `split.ts`).
 */
describe('предупреждение о потере текста озвучки при разрезе', () => {
  it('есть текст, нет расшифровки, есть продолжение — предупреждение звучит', () => {
    const base = segmentWithSpeechAndWords();
    const segment = { ...base, audio: { ...base.audio, words: [] } };

    const warning = speechLossWarning(segment, segment.gates[0]!);

    expect(warning).toBeDefined();
    expect(warning).toContain('текста озвучки');
    expect(warning).toContain('расшифровки');
    // Словарь автора, не схемы (CLAUDE.md, constraints.md).
    expect(warning).not.toContain('speech');
    expect(warning).not.toContain('audio.words');
  });

  it('речи не было вовсе — молчит: терять нечего', () => {
    const base = segmentWithSpeechAndWords();
    const segment = { ...base, speech: undefined, audio: { ...base.audio, words: [] } };

    expect(speechLossWarning(segment, segment.gates[0]!)).toBeUndefined();
  });

  it('расшифровка есть — шов есть, ничего не потеряется', () => {
    const segment = segmentWithSpeechAndWords();

    expect(speechLossWarning(segment, segment.gates[0]!)).toBeUndefined();
  });

  it('развилка в конце дорожки — продолжения не будет, предупреждать не о чем', () => {
    const base = segmentWithSpeechAndWords();
    const segment = {
      ...base,
      audio: { ...base.audio, words: [] },
      gates: [{ ...base.gates[0]!, at: { kind: 'seconds' as const, t: base.audio.duration } }],
    };

    expect(speechLossWarning(segment, segment.gates[0]!)).toBeUndefined();
  });
});

/**
 * Метка режет главу ГДЕ УГОДНО (`product.md` §2з [Р], отменяет прежнее [Р]
 * «разрезать можно только на гейте»).
 *
 * ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: проверки «после разреза глав стало две». Она
 * верна при ЛЮБОЙ реализации разреза, включая ту, что копирует главу целиком
 * и оставляет обеим один и тот же кусок звука. Пуста по построению.
 *
 * Несущее утверждение другое: ОКНО ПОДЕЛЕНО, а не продублировано — звук
 * второй главы начинается ровно там, где кончился звук первой, и сумма
 * их длительностей равна исходной. Ложно, если `offset` скопирован.
 */
describe('метка режет главу где угодно', () => {
  const at = 4;
  const cut = () => splitSegmentAtTime(project().segments[0]!, at, project().segments);

  it('окно звука ПОДЕЛЕНО, а не скопировано обеим главам', () => {
    const source = project().segments[0]!;
    const { head, tail } = cut();

    // Файл один и тот же — «аудио физически не режется» ([Р], branches.md §2.1).
    expect(tail.audio.src).toBe(head.audio.src);

    // Вторая глава начинается там, где кончилась первая.
    expect(head.audio.offset + head.audio.duration).toBe(tail.audio.offset);
    // И вместе они дают исходное окно целиком: ни нахлёста, ни дыры.
    expect(head.audio.duration + tail.audio.duration).toBe(source.audio.duration);
    // Скопированный offset дал бы здесь 0 — то самое, что ловит эта проверка.
    expect(tail.audio.offset).toBe(source.audio.offset + at);
  });

  it('стык невидим: первый слайд второй главы — снимок сцены на разрезе', () => {
    const { tail } = cut();
    const first = tail.slides[0]!;

    expect(resolveTimeRef(first.at, tail.audio.words)).toBe(0);
    expect(first.transition).toBe('cut');
    // На разрезе в 4 с последним наступившим был sl-3 (слово №3 = 3.0 с).
    expect(first.states['hero']!.x).toBe(300);
  });

  it('слайды и слова расходятся по шву, индексы слов сдвигаются согласованно', () => {
    const { head, tail } = cut();

    expect(head.slides.map((s) => s.id)).toEqual(['sl-0', 'sl-3']);
    // Слова 0..3 остались в голове, 4..9 уехали и начались заново с нуля.
    expect(head.audio.words.map((w) => w.text)).toEqual(['w0', 'w1', 'w2', 'w3']);
    expect(tail.audio.words[0]!.text).toBe('w4');
    expect(tail.audio.words[0]!.start).toBe(0);

    // sl-7 ссылался на слово №7 исходного транскрипта; в новом оно стоит
    // третьим, и метка обязана указывать на ТО ЖЕ слово (инвариант №10).
    const moved = tail.slides.find((s) => s.id === 'sl-7')!;
    expect(tail.audio.words[(moved.at as { wordIndex: number }).wordIndex]!.text).toBe('w7');
  });

  it('голова уходит в продолжение, продолжение забирает прежний выход', () => {
    const source = project().segments[0]!;
    const { head, tail } = cut();

    expect(head.exit.default).toBe(tail.id);
    expect(head.exit.rules).toEqual([]);
    expect(tail.exit).toEqual(source.exit);
  });

  it('веток не рождается: метка — это шов, а не развилка', () => {
    const { head, tail } = cut();
    // Остановка на 5 с уехала во вторую главу и осталась обычной остановкой:
    // разрез меткой не объявляет её развилкой и correctId не трогает.
    expect(head.gates).toEqual([]);
    expect(tail.gates).toHaveLength(1);
    expect(tail.gates[0]!.config).toMatchObject({ correctId: 'left' });
  });

  it('проект собирается: вторая глава встаёт СРАЗУ ПОСЛЕ первой', () => {
    const after = splitAtTime(project(), 'whole', at);

    expect(after.segments.map((s) => s.id)[0]).toBe('whole');
    expect(after.segments).toHaveLength(2);
    // Результат обязан быть не просто валидным, а загружаемым схемой.
    expect(() => loadProject(after)).not.toThrow();
  });
});

describe('метка отказывается делать бессмыслицу', () => {
  it('в самом начале главы делить нечего', () => {
    expect(() => splitSegmentAtTime(project().segments[0]!, 0, project().segments))
      .toThrow(/в самом начале главы/);
  });

  it('в самом конце главы вторая была бы пустой', () => {
    expect(() => splitSegmentAtTime(project().segments[0]!, 10, project().segments))
      .toThrow(/в самом конце главы/);
  });

  /**
   * Одна правда на отказ разреза и на гашение кнопки. Разъехавшись, они дали бы
   * кнопку, которая нажимается и падает, — и это молчаливый дефект.
   */
  it('причина отказа у кнопки и у разреза — одна и та же функция', () => {
    expect(splitAtTimeBlockedReason(0, 10)).toMatch(/в самом начале главы/);
    expect(splitAtTimeBlockedReason(10, 10)).toMatch(/в самом конце главы/);
    expect(splitAtTimeBlockedReason(4, 10)).toBeUndefined();
    expect(splitAtTimeBlockedReason(Number.NaN, 10)).toMatch(/это не время/);
  });
});

/**
 * Имена продолжений не повторяются (найдено глазами 15.08.2026).
 *
 * Метка режет главу ГДЕ УГОДНО — значит резать одну и ту же главу будут
 * многократно, и второе продолжение получало ровно то же имя, что и первое.
 * В виде «Ветки» автор видел две плитки с одинаковой подписью и не мог их
 * различить. Схема имена не проверяет, поэтому не жаловался ни один тест.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: возврат безусловного `${title} — продолжение`.
 * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет — проверяется, что имена РАЗЛИЧНЫ,
 * а это ложно ровно для той реализации, которая была.
 */
describe('имена глав после многократного разреза', () => {
  it('второй разрез той же главы не повторяет имя первого', () => {
    const first = splitAtTime(project(), 'whole', 6);
    const second = splitAtTime(first, 'whole', 3);

    const titles = second.segments.map((segment) => segment.title);
    expect(new Set(titles).size, `имена повторились: ${titles.join(' | ')}`).toBe(titles.length);
  });

  it('первое продолжение остаётся без числа', () => {
    // Приписка «1» к единственному продолжению обещала бы второе, которого нет.
    const after = splitAtTime(project(), 'whole', 6);
    const tail = after.segments.find((segment) => segment.id !== 'whole')!;
    expect(tail.title).toBe('Цельное повествование — продолжение');
  });
});
