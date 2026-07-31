import { describe, expect, it } from 'vitest';

import { loadProject } from '@player/core';
import type { Element, Gate, Project, Slide } from '@player/core';

import {
  addOption,
  bindOption,
  createGate,
  gateInsideTransition,
  promptOf,
  removeOption,
  setAccept,
  setCaseSensitive,
  setCorrect,
  setGateKind,
  setMaxAttempts,
  setOnWrong,
  setOptionLabel,
  setPrompt,
} from '../src/state/gates.js';
import { serializeProject } from '../src/state/save.js';

/**
 * Главное требование к этим тестам: не только сравнение полей, но и прогон
 * результата через настоящую схему — `loadProject` из `@player/core`. Если
 * функция способна породить гейт, который схема не примет, тест обязан это
 * поймать раньше, чем автор.
 *
 * Второе требование: проверять не только то, что ЗАГРУЖАЕТСЯ, но и то, что
 * реально попадает в файл через `serializeProject` — она проверяет
 * РАЗОБРАННУЮ копию текста, а не исходный объект, и служебное поле редактора
 * могло бы уйти на диск целиком, оставшись незамеченным.
 */

function continueGate(overrides: Partial<Gate> = {}): Gate {
  return {
    id: 'gate-1',
    at: { kind: 'seconds', t: 1 },
    config: { kind: 'continue', label: 'Дальше' },
    onWrong: 'retry',
    maxAttempts: null,
    recordAs: 'gate-1',
    ...overrides,
  };
}

function choiceGate(overrides: Partial<Gate> = {}): Gate {
  return {
    id: 'gate-1',
    at: { kind: 'seconds', t: 1 },
    config: {
      kind: 'choice',
      prompt: 'Столица Франции?',
      options: [
        { id: 'paris', label: 'Париж' },
        { id: 'london', label: 'Лондон' },
      ],
      correctId: 'paris',
    },
    onWrong: 'retry',
    maxAttempts: null,
    recordAs: 'gate-1',
    ...overrides,
  };
}

function inputGate(overrides: Partial<Gate> = {}): Gate {
  return {
    id: 'gate-1',
    at: { kind: 'seconds', t: 1 },
    config: {
      kind: 'input',
      prompt: 'Столица Франции?',
      accept: ['париж', 'paris'],
      caseSensitive: false,
    },
    onWrong: 'retry',
    maxAttempts: null,
    recordAs: 'gate-1',
    ...overrides,
  };
}

function element(id: string): Element {
  return { id, type: 'shape', content: '' };
}

/** Минимальный проект с одним гейтом — ровно то, что нужно `loadProject`, не больше. */
function projectWithGate(gate: Gate, elements: readonly Element[] = []): Project {
  return {
    schemaVersion: 5,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
    entry: 'seg-1',
    segments: [
      {
        id: 'seg-1',
        title: '',
        audio: { src: 'audio/test.mp3', offset: 0, duration: 10, words: [] },
        elements: [...elements],
        slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
        gates: [gate],
        exit: { rules: [], default: null },
      },
    ],
  };
}

/** Прогоняет гейт через настоящую схему; бросает, если проект невалиден. */
function assertLoadable(gate: Gate, elements: readonly Element[] = []): Project {
  return loadProject(projectWithGate(gate, elements));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ищет ключи, которые есть в `raw` (то, что реально лежит в тексте файла),
 * но которых нет в `canonical` (то, что вернул `loadProject` — то есть то,
 * что описано схемой).
 */
function findExtraKeys(raw: unknown, canonical: unknown, path: string): string[] {
  if (Array.isArray(raw) && Array.isArray(canonical)) {
    return raw.flatMap((item, i) => findExtraKeys(item, canonical[i], `${path}[${i}]`));
  }
  if (isPlainObject(raw) && isPlainObject(canonical)) {
    return Object.keys(raw).flatMap((key) => {
      if (!(key in canonical)) return [`${path}.${key}`];
      return findExtraKeys(raw[key], canonical[key], `${path}.${key}`);
    });
  }
  return [];
}

describe('createGate: новый гейт вида «дальше»', () => {
  it('recordAs равен собственному id', () => {
    const gate = createGate('gate-9', { kind: 'seconds', t: 3 });
    expect(gate.recordAs).toBe('gate-9');
    expect(gate.id).toBe('gate-9');
    assertLoadable(gate);
  });

  it('вид по умолчанию — «дальше»', () => {
    const gate = createGate('gate-1', { kind: 'seconds', t: 0 });
    expect(gate.config).toEqual({ kind: 'continue', label: 'Дальше' });
  });
});

describe('setGateKind: базовые переходы', () => {
  it('переключение на тот же вид — no-op, гейт тот же объект по ссылке', () => {
    const gate = choiceGate();
    expect(setGateKind(gate, 'choice')).toBe(gate);
  });

  it('continue → choice: создаёт ровно два валидных варианта-заготовки, а не пустой список', () => {
    const next = setGateKind(continueGate(), 'choice');
    const config = next.config;
    if (config.kind !== 'choice') throw new Error('ожидался choice');
    expect(config.options.length).toBe(2);
    expect(config.options.some((o) => o.id === config.correctId)).toBe(true);
    assertLoadable(next);
  });

  it('continue → input: создаёт непустой accept, схема проходит', () => {
    const next = setGateKind(continueGate(), 'input');
    if (next.config.kind !== 'input') throw new Error('ожидался input');
    expect(next.config.accept.length).toBeGreaterThan(0);
    expect(next.config.accept.every((a) => a.trim().length > 0)).toBe(true);
    assertLoadable(next);
  });

  it('choice → input: prompt переносится буквально без третьего аргумента, схема проходит', () => {
    const source = choiceGate({
      config: {
        kind: 'choice',
        prompt: 'Столица Испании?',
        options: [
          { id: 'a', label: 'Мадрид' },
          { id: 'b', label: 'Барселона' },
        ],
        correctId: 'a',
      },
    });
    const next = setGateKind(source, 'input');
    if (next.config.kind !== 'input') throw new Error('ожидался input');
    expect(next.config.prompt).toBe('Столица Испании?');
    assertLoadable(next);
  });

  it('input → choice: prompt переносится, варианты — свежая валидная пара, а не старый accept', () => {
    const source = inputGate({
      config: { kind: 'input', prompt: 'Столица Италии?', accept: ['рим'], caseSensitive: false },
    });
    const next = setGateKind(source, 'choice');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.prompt).toBe('Столица Италии?');
    expect(next.config.options.length).toBe(2);
    assertLoadable(next);
  });

  it('choice → continue: вопрос уходит из видимого config, схема проходит', () => {
    const next = setGateKind(choiceGate(), 'continue');
    expect(next.config).toEqual({ kind: 'continue', label: 'Дальше' });
    assertLoadable(next);
  });

  it('input → continue: схема проходит', () => {
    const next = setGateKind(inputGate(), 'continue');
    expect(next.config.kind).toBe('continue');
    assertLoadable(next);
  });
});

describe('promptOf', () => {
  it('у choice и input возвращает prompt', () => {
    expect(promptOf(choiceGate())).toBe('Столица Франции?');
    expect(promptOf(inputGate())).toBe('Столица Франции?');
  });

  it('у continue возвращает undefined — вопроса нет физически, это не пустая строка', () => {
    expect(promptOf(continueGate())).toBeUndefined();
  });
});

describe('setGateKind: prompt переживает случайные переключения через явную память вызывающего', () => {
  it('choice → continue → choice: варианты не обязаны восстановиться, но переданный prompt возвращается', () => {
    const original = choiceGate();
    const remembered = promptOf(original);

    const viaContinue = setGateKind(original, 'continue');
    assertLoadable(viaContinue);

    const back = setGateKind(viaContinue, 'choice', remembered);
    if (back.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(back.config.prompt).toBe('Столица Франции?');
    expect(back.config.options.map((o) => o.id)).not.toEqual(['paris', 'london']);
    expect(back.config.options.length).toBe(2);
    assertLoadable(back);
  });

  it('choice → continue → choice БЕЗ переданной памяти: prompt пустой, а не старый — модуль ничего не хранит сам', () => {
    const original = choiceGate();
    const viaContinue = setGateKind(original, 'continue');
    const back = setGateKind(viaContinue, 'choice');
    if (back.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(back.config.prompt).toBe('');
    assertLoadable(back);
  });

  it('input → continue → input: переданный prompt возвращается тем же', () => {
    const original = inputGate({
      config: { kind: 'input', prompt: 'Сколько будет 2+2?', accept: ['4'], caseSensitive: false },
    });
    const remembered = promptOf(original);

    const viaContinue = setGateKind(original, 'continue');
    assertLoadable(viaContinue);

    const back = setGateKind(viaContinue, 'input', remembered);
    if (back.config.kind !== 'input') throw new Error('ожидался input');
    expect(back.config.prompt).toBe('Сколько будет 2+2?');
    assertLoadable(back);
  });

  it('choice → input → choice: prompt переживает прямой переход между choice и input без третьего аргумента', () => {
    const original = choiceGate({
      config: {
        kind: 'choice',
        prompt: 'Столица Германии?',
        options: [
          { id: 'a', label: 'Берлин' },
          { id: 'b', label: 'Мюнхен' },
        ],
        correctId: 'a',
      },
    });

    const viaInput = setGateKind(original, 'input');
    assertLoadable(viaInput);

    const back = setGateKind(viaInput, 'choice');
    if (back.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(back.config.prompt).toBe('Столица Германии?');
    assertLoadable(back);
  });

  it('continue → choice → input: цепочка из трёх переходов, каждый шаг валиден по схеме', () => {
    const step1 = setGateKind(continueGate(), 'choice', 'Вопрос из памяти');
    assertLoadable(step1);
    if (step1.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(step1.config.prompt).toBe('Вопрос из памяти');

    const step2 = setGateKind(step1, 'input');
    if (step2.config.kind !== 'input') throw new Error('ожидался input');
    expect(step2.config.prompt).toBe('Вопрос из памяти');
    assertLoadable(step2);
  });

  it('choice → input → continue → input: prompt из choice доезжает через input, а через continue — только если его передали', () => {
    const step1 = setGateKind(choiceGate(), 'input');
    assertLoadable(step1);
    const remembered = promptOf(step1);

    const step2 = setGateKind(step1, 'continue');
    assertLoadable(step2);

    const step3 = setGateKind(step2, 'input', remembered);
    if (step3.config.kind !== 'input') throw new Error('ожидался input');
    expect(step3.config.prompt).toBe('Столица Франции?');
    assertLoadable(step3);
  });
});

describe('setPrompt', () => {
  it('меняет prompt у choice', () => {
    const next = setPrompt(choiceGate(), 'Новый вопрос');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.prompt).toBe('Новый вопрос');
    assertLoadable(next);
  });

  it('меняет prompt у input', () => {
    const next = setPrompt(inputGate(), 'Новый вопрос');
    if (next.config.kind !== 'input') throw new Error('ожидался input');
    expect(next.config.prompt).toBe('Новый вопрос');
    assertLoadable(next);
  });

  it('тот же prompt — no-op по ссылке', () => {
    const gate = choiceGate();
    expect(setPrompt(gate, 'Столица Франции?')).toBe(gate);
  });

  it('у гейта «Дальше» нет вопроса — громкая ошибка на русском', () => {
    expect(() => setPrompt(continueGate(), 'Вопрос')).toThrow(/вопрос/i);
  });
});

describe('addOption', () => {
  it('добавляет вариант со свободным id, схема проходит', () => {
    const next = addOption(choiceGate());
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.options.length).toBe(3);
    expect(next.config.options[2]!.id).toBe('option-1');
    assertLoadable(next);
  });

  it('на не-choice гейте бросает ошибку', () => {
    expect(() => addOption(continueGate())).toThrow(/выбор/);
    expect(() => addOption(inputGate())).toThrow(/выбор/);
  });
});

describe('removeOption', () => {
  it('удаляет вариант, не являющийся correctId; correctId не трогает', () => {
    const gate = choiceGate({
      config: {
        kind: 'choice',
        prompt: 'П',
        options: [
          { id: 'paris', label: 'Париж' },
          { id: 'london', label: 'Лондон' },
          { id: 'berlin', label: 'Берлин' },
        ],
        correctId: 'paris',
      },
    });

    const next = removeOption(gate, 'london');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.options.map((o) => o.id)).toEqual(['paris', 'berlin']);
    expect(next.config.correctId).toBe('paris');
    assertLoadable(next);
  });

  it('удаление correctId переназначает correctId на первый из оставшихся вариантов', () => {
    const gate = choiceGate({
      config: {
        kind: 'choice',
        prompt: 'П',
        options: [
          { id: 'paris', label: 'Париж' },
          { id: 'london', label: 'Лондон' },
          { id: 'berlin', label: 'Берлин' },
        ],
        correctId: 'paris',
      },
    });

    const next = removeOption(gate, 'paris');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.options.map((o) => o.id)).toEqual(['london', 'berlin']);
    expect(next.config.correctId).toBe('london');
    assertLoadable(next);
  });

  it('удаление, после которого вариантов останется меньше двух, бросает громкую ошибку', () => {
    const gate = choiceGate(); // ровно два варианта
    expect(() => removeOption(gate, 'london')).toThrow(/не меньше двух/);
    expect(() => removeOption(gate, 'paris')).toThrow(/не меньше двух/);
  });

  it('удаление несуществующего варианта бросает ошибку', () => {
    expect(() => removeOption(choiceGate(), 'ghost')).toThrow(/ghost/);
  });

  it('на не-choice гейте бросает ошибку', () => {
    expect(() => removeOption(continueGate(), 'anything')).toThrow(/выбор/);
  });
});

describe('setOptionLabel', () => {
  it('переименовывает подпись, не трогая id', () => {
    const next = setOptionLabel(choiceGate(), 'paris', 'Пари');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.options[0]).toEqual({ id: 'paris', label: 'Пари' });
    assertLoadable(next);
  });

  it('та же подпись — no-op по ссылке', () => {
    const gate = choiceGate();
    expect(setOptionLabel(gate, 'paris', 'Париж')).toBe(gate);
  });

  it('переименование несуществующего варианта бросает ошибку', () => {
    expect(() => setOptionLabel(choiceGate(), 'ghost', 'X')).toThrow(/ghost/);
  });
});

describe('setCorrect', () => {
  it('меняет правильный вариант', () => {
    const next = setCorrect(choiceGate(), 'london');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.correctId).toBe('london');
    assertLoadable(next);
  });

  it('тот же correctId — no-op по ссылке', () => {
    const gate = choiceGate();
    expect(setCorrect(gate, 'paris')).toBe(gate);
  });

  it('несуществующий вариант нельзя отметить правильным', () => {
    expect(() => setCorrect(choiceGate(), 'ghost')).toThrow(/ghost/);
  });
});

describe('bindOption: привязка варианта к элементу сцены (ADR-011)', () => {
  it('переименовывает id варианта в id элемента', () => {
    const next = bindOption(choiceGate(), 'london', 'hero-image');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.options.map((o) => o.id)).toEqual(['paris', 'hero-image']);
    assertLoadable(next, [element('hero-image')]);
  });

  it('чинит correctId, если он указывал на старый id привязываемого варианта', () => {
    const next = bindOption(choiceGate(), 'paris', 'hero-image');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.correctId).toBe('hero-image');
    assertLoadable(next, [element('hero-image')]);
  });

  it('не трогает correctId, если он указывал на другой вариант', () => {
    const next = bindOption(choiceGate(), 'london', 'hero-image');
    if (next.config.kind !== 'choice') throw new Error('ожидался choice');
    expect(next.config.correctId).toBe('paris');
  });

  it('elementId, уже занятый другим вариантом этого гейта, — ошибка', () => {
    expect(() => bindOption(choiceGate(), 'london', 'paris')).toThrow(/занят/);
  });

  it('пустой elementId — ошибка', () => {
    expect(() => bindOption(choiceGate(), 'london', '')).toThrow(/пуст/i);
  });

  it('elementId с пробелом по краю — ошибка', () => {
    expect(() => bindOption(choiceGate(), 'london', ' hero ')).toThrow(/пробел/);
  });

  it('привязка несуществующего варианта — ошибка', () => {
    expect(() => bindOption(choiceGate(), 'ghost', 'hero-image')).toThrow(/ghost/);
  });

  it('привязка к тому же id — no-op по ссылке', () => {
    const gate = choiceGate();
    expect(bindOption(gate, 'paris', 'paris')).toBe(gate);
  });

  it('на не-choice гейте бросает ошибку', () => {
    expect(() => bindOption(continueGate(), 'x', 'hero-image')).toThrow(/выбор/);
  });
});

describe('setAccept', () => {
  it('обрезает пробелы по краям', () => {
    const next = setAccept(inputGate(), [' Париж ', 'paris']);
    if (next.config.kind !== 'input') throw new Error('ожидался input');
    expect(next.config.accept).toEqual(['Париж', 'paris']);
    assertLoadable(next);
  });

  it('выкидывает дубликаты после обрезки', () => {
    const next = setAccept(inputGate(), ['ответ', ' ответ ', 'ответ']);
    if (next.config.kind !== 'input') throw new Error('ожидался input');
    expect(next.config.accept).toEqual(['ответ']);
    assertLoadable(next);
  });

  it('пустой список — ошибка', () => {
    expect(() => setAccept(inputGate(), [])).toThrow(/один принимаемый ответ/);
  });

  it('список из одних пустых строк — ошибка', () => {
    expect(() => setAccept(inputGate(), ['', '   '])).toThrow(/пустой строкой/);
  });

  it('тот же нормализованный список — no-op по ссылке', () => {
    const gate = inputGate({
      config: { kind: 'input', prompt: 'П', accept: ['a', 'b'], caseSensitive: false },
    });
    expect(setAccept(gate, ['a', 'b'])).toBe(gate);
  });

  it('на не-input гейте бросает ошибку', () => {
    expect(() => setAccept(choiceGate(), ['a'])).toThrow(/ввод/);
  });
});

describe('setCaseSensitive', () => {
  it('переключает флаг', () => {
    const next = setCaseSensitive(inputGate(), true);
    if (next.config.kind !== 'input') throw new Error('ожидался input');
    expect(next.config.caseSensitive).toBe(true);
    assertLoadable(next);
  });

  it('то же значение — no-op по ссылке', () => {
    const gate = inputGate();
    expect(setCaseSensitive(gate, false)).toBe(gate);
  });

  it('на не-input гейте бросает ошибку', () => {
    expect(() => setCaseSensitive(choiceGate(), true)).toThrow(/ввод/);
  });
});

describe('setOnWrong', () => {
  it('меняет поведение при неверном ответе — общее поле, работает на любом виде', () => {
    const next = setOnWrong(choiceGate(), 'inline-explain');
    expect(next.onWrong).toBe('inline-explain');
    assertLoadable(next);

    const onContinueGate = setOnWrong(continueGate(), 'continue');
    expect(onContinueGate.onWrong).toBe('continue');
    assertLoadable(onContinueGate);
  });

  it('принимает inline-hint', () => {
    const next = setOnWrong(choiceGate(), 'inline-hint');
    expect(next.onWrong).toBe('inline-hint');
    assertLoadable(next);
  });

  it('то же значение — no-op по ссылке', () => {
    const gate = choiceGate();
    expect(setOnWrong(gate, 'retry')).toBe(gate);
  });
});

describe('setMaxAttempts', () => {
  it('устанавливает положительное целое', () => {
    const next = setMaxAttempts(choiceGate(), 3);
    expect(next.maxAttempts).toBe(3);
    assertLoadable(next);
  });

  it('null снимает ограничение', () => {
    const next = setMaxAttempts(choiceGate({ maxAttempts: 3 }), null);
    expect(next.maxAttempts).toBeNull();
    assertLoadable(next);
  });

  it('ноль — ошибка', () => {
    expect(() => setMaxAttempts(choiceGate(), 0)).toThrow(/положительное/);
  });

  it('отрицательное — ошибка', () => {
    expect(() => setMaxAttempts(choiceGate(), -1)).toThrow(/положительное/);
  });

  it('нецелое — ошибка', () => {
    expect(() => setMaxAttempts(choiceGate(), 1.5)).toThrow(/целое/);
  });

  it('то же значение — no-op по ссылке', () => {
    const gate = choiceGate({ maxAttempts: 5 });
    expect(setMaxAttempts(gate, 5)).toBe(gate);
  });
});

describe('охранник целостности: гейт, собранный последовательностью правок, грузится loadProject', () => {
  it('continue → choice → варианты → привязка к элементу → onWrong/maxAttempts', () => {
    let gate = continueGate();
    gate = setGateKind(gate, 'choice');
    gate = setPrompt(gate, 'Где столица России?');
    gate = addOption(gate);
    if (gate.config.kind !== 'choice') throw new Error('ожидался choice');
    const [optA, optB, optC] = gate.config.options;
    gate = setOptionLabel(gate, optA!.id, 'Москва');
    gate = setOptionLabel(gate, optB!.id, 'Казань');
    gate = setOptionLabel(gate, optC!.id, 'Сочи');
    gate = bindOption(gate, optA!.id, 'moscow-card');
    gate = setCorrect(gate, 'moscow-card');
    gate = setOnWrong(gate, 'inline-explain');
    gate = setMaxAttempts(gate, 2);

    const project = assertLoadable(gate, [element('moscow-card')]);
    const loadedGate = project.segments[0]!.gates[0]!;
    expect(loadedGate.config.kind).toBe('choice');
    expect(loadedGate.onWrong).toBe('inline-explain');
    expect(loadedGate.maxAttempts).toBe(2);
    if (loadedGate.config.kind === 'choice') {
      expect(loadedGate.config.correctId).toBe('moscow-card');
      expect(loadedGate.config.prompt).toBe('Где столица России?');
    }
  });
});

describe('охранник схемы: сериализованный файл не содержит служебных полей редактора', () => {
  it('после цепочки переходов и правок в тексте файла нет ключей сверх схемы', () => {
    let gate = choiceGate();
    const remembered = promptOf(gate); // достаём вопрос сам, до перехода на continue

    gate = setGateKind(gate, 'continue');
    gate = setGateKind(gate, 'input', remembered);
    gate = setAccept(gate, ['Париж', 'paris']);
    gate = setGateKind(gate, 'choice'); // choice → input → choice, без continue — прямой перенос
    if (gate.config.kind !== 'choice') throw new Error('ожидался choice');
    gate = bindOption(gate, gate.config.options[0]!.id, 'hero-image');
    gate = setOnWrong(gate, 'inline-explain');
    gate = setMaxAttempts(gate, 3);

    const project = projectWithGate(gate, [element('hero-image')]);
    const text = serializeProject(project);

    const raw: unknown = JSON.parse(text);
    const canonical = loadProject(JSON.parse(text));

    expect(findExtraKeys(raw, canonical, 'project')).toEqual([]);
  });
});

/**
 * Предупреждение автору про гейт внутри перехода.
 *
 * Не запрет: product.md §3 [Р] говорит, что переход будет доведён до конца
 * мгновенно и зритель увидит законную картинку. Но автор почти наверняка
 * промахнулся — он ставил вопрос к тому, что сейчас едет по экрану.
 */
describe('гейт внутри перехода между слайдами', () => {
  const slide = (id: string, t: number, transition: 'morph' | 'cut' = 'morph'): Slide => ({
    id,
    at: { kind: 'seconds', t },
    transition,
    states: {},
  });

  const at = (t: number): Gate => continueGate({ at: { kind: 'seconds', t } });

  /**
   * Метки 0, 1 и 3. После разворота (ADR-020) окна КОНЧАЮТСЯ на метках:
   * к `s-2` сцена едет по (0.4, 1.0), к `s-3` — по (2.4, 3.0).
   */
  const slides = [slide('s-1', 0), slide('s-2', 1), slide('s-3', 3)];

  it('гейт до начала окна — тихо', () => {
    expect(gateInsideTransition(at(0.2), slides, [])).toBe(false);
  });

  it('гейт посреди окна — предупреждение', () => {
    expect(gateInsideTransition(at(0.7), slides, [])).toBe(true);
  });

  /**
   * Ровно на метке окно УЖЕ КОНЧИЛОСЬ, доводить нечего — это законная
   * и частая расстановка «вопрос к новому слайду». До разворота здесь была
   * та же зелень, но по обратной причине: переход ещё не начинался.
   */
  it('гейт ровно на метке слайда — тихо', () => {
    expect(gateInsideTransition(at(1), slides, [])).toBe(false);
  });

  it('гейт между окнами — тихо', () => {
    expect(gateInsideTransition(at(1.7), slides, [])).toBe(false);
  });

  it('срез перехода не создаёт: гейт перед ним тихий', () => {
    const cut = [slide('s-1', 0), slide('s-2', 1, 'cut')];
    expect(gateInsideTransition(at(0.7), cut, [])).toBe(false);
  });

  /**
   * Окно урезается расстоянием до ПРЕДЫДУЩЕЙ метки, и предупреждение
   * обязано считать по тому же правилу: иначе редактор ругался бы на гейт,
   * стоящий до начала короткого окна.
   */
  it('урезанное окно укорачивает и окно предупреждения', () => {
    // Второй слайд — срез намеренно: иначе его собственное окно (0.4 … 1.0)
    // накрыло бы проверяемую точку, и тест был бы зелёным по неправильной
    // причине. На этом уже споткнулись при написании.
    const tight = [slide('s-1', 0), slide('s-2', 1, 'cut'), slide('s-3', 1.2)];
    expect(gateInsideTransition(at(1.1), tight, [])).toBe(true);
    // Полное окно начиналось бы на 0.6 — но предыдущая метка обрезала его до 1.0.
    expect(gateInsideTransition(at(0.9), tight, [])).toBe(false);
    expect(gateInsideTransition(at(1.2), tight, [])).toBe(false);
  });
});
