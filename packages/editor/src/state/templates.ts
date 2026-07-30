/**
 * Шаблоны сцены: готовый набор элементов и анимаций, который применение
 * кладёт на сцену одним действием — ДАННЫЕ, а не код (тот же приём, что
 * `state/library.ts`, и то же требование теста: пополнение каталога — это
 * дописанная запись в `SCENE_TEMPLATES`, а не правка React, см.
 * `test/templates.test.ts`, «пополнение не требует правок в React»).
 *
 * Шаблон описывает элементы через `dx`/`dy` — смещение от центра сцены,
 * а не абсолютные `x`/`y`: так шаблон остаётся годным для любого размера
 * сцены (см. `createElement`, тот же приём для одиночной вставки).
 *
 * `applyTemplate` — единственная функция этого модуля, которая трогает
 * `Scene`. Она ДОБАВЛЯЕТ к сцене, а не заменяет её: у автора уже могло
 * что-то лежать (см. комментарий самой функции).
 */
import type { Cue, Element, Gate, Scene, TimeRef } from '@player/core';

import { freeId } from './elements.js';
import { ANIMATION_PRESETS, libraryItem, type AnimationPreset } from './library.js';

/** Что шаблон кладёт на сцену: элемент из библиотеки со сдвигом и своим текстом. */
export interface TemplateElement {
  /** id заготовки из ELEMENT_LIBRARY. */
  readonly item: string;
  /** Смещение центра элемента относительно центра сцены, в единицах сцены. */
  readonly dx: number;
  readonly dy: number;
  readonly width?: number;
  readonly height?: number;
  readonly content?: string;
  readonly style?: Readonly<Record<string, string | number>>;
  /** id заготовки анимации из ANIMATION_PRESETS. undefined — без анимации. */
  readonly preset?: string;
  /** Когда появляется, секунды от начала узла. Не длиннее 3 с (см. applyTemplate). */
  readonly atSeconds: number;
}

/**
 * Гейт шаблона. Варианты ссылаются на элементы `SceneTemplate.elements`
 * по ПОРЯДКОВОМУ номеру, а не по id: id элемента вычисляется через `freeId`
 * только в момент вставки и заранее неизвестен.
 */
export interface TemplateGate {
  readonly atSeconds: number;
  readonly prompt: string;
  readonly optionIndexes: readonly number[];
  readonly correctIndex: number;
}

export interface SceneTemplate {
  readonly id: string;
  readonly label: string;
  readonly elements: readonly TemplateElement[];
  readonly gate?: TemplateGate;
}

const WHITE = '#f5f7fa';
const MUTED = '#9fb0c4';
const PANEL = '#1b2430';
const SANS = 'system-ui, sans-serif';

/**
 * Пять заготовок сцены. Метки времени — секунды, не слова (инвариант №10):
 * у произвольной дорожки, на которую ляжет шаблон, слов может не быть.
 *
 * Ни одна метка не позже 3 с — короче любой дорожки в фикстурах проекта,
 * включая трёхсекундные узлы `branching.json` (см. test/templates.test.ts).
 */
export const SCENE_TEMPLATES: readonly SceneTemplate[] = [
  {
    id: 'title',
    label: 'Заголовок',
    elements: [
      {
        item: 'text',
        dx: 0,
        dy: 0,
        width: 1400,
        height: 220,
        content: 'Заголовок',
        style: {
          'font-family': SANS,
          'font-size': '96px',
          'font-weight': '700',
          color: WHITE,
          'text-align': 'center',
        },
        preset: 'fade-in',
        atSeconds: 0,
      },
    ],
  },
  {
    id: 'title-text',
    label: 'Заголовок и текст',
    elements: [
      {
        item: 'text',
        dx: 0,
        dy: -260,
        width: 1400,
        height: 160,
        content: 'Заголовок',
        style: {
          'font-family': SANS,
          'font-size': '64px',
          'font-weight': '700',
          color: WHITE,
          'text-align': 'center',
        },
        preset: 'fade-in',
        atSeconds: 0,
      },
      {
        item: 'text',
        dx: 0,
        dy: 60,
        width: 1200,
        height: 300,
        content: 'Поясняющий текст под заголовком.',
        style: {
          'font-family': SANS,
          'font-size': '32px',
          color: MUTED,
          'line-height': '1.5',
          'text-align': 'center',
        },
        preset: 'fade-in',
        atSeconds: 0.6,
      },
    ],
  },
  {
    id: 'two-columns',
    label: 'Сравнение двух колонок',
    elements: [
      // Панели-подложки сперва — идут в сцену первыми и остаются позади
      // текста (zIndex растёт по порядку заготовки, см. applyTemplate).
      {
        item: 'shape',
        dx: -440,
        dy: 0,
        width: 720,
        height: 640,
        style: { background: PANEL, 'border-radius': '20px' },
        preset: 'fade-in',
        atSeconds: 0,
      },
      {
        item: 'shape',
        dx: 440,
        dy: 0,
        width: 720,
        height: 640,
        style: { background: PANEL, 'border-radius': '20px' },
        preset: 'fade-in',
        atSeconds: 0.2,
      },
      {
        item: 'text',
        dx: -440,
        dy: -220,
        width: 640,
        height: 120,
        content: 'Вариант A',
        style: { 'font-family': SANS, 'font-size': '44px', 'font-weight': '700', color: WHITE, 'text-align': 'center' },
        preset: 'fade-in',
        atSeconds: 0.4,
      },
      {
        item: 'text',
        dx: 440,
        dy: -220,
        width: 640,
        height: 120,
        content: 'Вариант Б',
        style: { 'font-family': SANS, 'font-size': '44px', 'font-weight': '700', color: WHITE, 'text-align': 'center' },
        preset: 'fade-in',
        atSeconds: 0.6,
      },
      {
        item: 'text',
        dx: -440,
        dy: 40,
        width: 640,
        height: 400,
        content: 'Описание первого варианта.',
        style: { 'font-family': SANS, 'font-size': '28px', color: MUTED, 'line-height': '1.5', 'text-align': 'center' },
        preset: 'fade-in',
        atSeconds: 0.8,
      },
      {
        item: 'text',
        dx: 440,
        dy: 40,
        width: 640,
        height: 400,
        content: 'Описание второго варианта.',
        style: { 'font-family': SANS, 'font-size': '28px', color: MUTED, 'line-height': '1.5', 'text-align': 'center' },
        preset: 'fade-in',
        atSeconds: 1,
      },
    ],
  },
  {
    id: 'bullets',
    label: 'Список пунктов',
    elements: [
      {
        item: 'text',
        dx: 0,
        dy: -300,
        width: 1200,
        height: 140,
        content: 'Список пунктов',
        style: {
          'font-family': SANS,
          'font-size': '56px',
          'font-weight': '700',
          color: WHITE,
          'text-align': 'center',
        },
        preset: 'fade-in',
        atSeconds: 0,
      },
      {
        item: 'text',
        dx: 0,
        dy: -80,
        width: 1000,
        height: 100,
        content: 'Первый пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
        preset: 'slide-in-left',
        atSeconds: 0.4,
      },
      {
        item: 'text',
        dx: 0,
        dy: 40,
        width: 1000,
        height: 100,
        content: 'Второй пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
        preset: 'slide-in-left',
        atSeconds: 0.8,
      },
      {
        item: 'text',
        dx: 0,
        dy: 160,
        width: 1000,
        height: 100,
        content: 'Третий пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
        preset: 'slide-in-left',
        atSeconds: 1.2,
      },
    ],
  },
  {
    id: 'question',
    label: 'Вопрос с вариантами',
    elements: [
      {
        item: 'text',
        dx: 0,
        dy: -260,
        width: 1400,
        height: 160,
        content: 'Вопрос?',
        style: {
          'font-family': SANS,
          'font-size': '56px',
          'font-weight': '700',
          color: WHITE,
          'text-align': 'center',
        },
        preset: 'fade-in',
        atSeconds: 0,
      },
      {
        item: 'text',
        dx: -380,
        dy: 140,
        width: 700,
        height: 160,
        content: 'Вариант 1',
        style: {
          'font-family': SANS,
          'font-size': '40px',
          color: WHITE,
          'text-align': 'center',
          background: PANEL,
          'border-radius': '20px',
          // Подпись по центру карточки и по вертикали тоже. `text-align`
          // отвечает только за горизонталь, и без этих трёх свойств текст
          // прижимается к верхнему краю — ровно то, на что владелец обратил
          // внимание в фикстуре развилки. Выразимо: `style` в схеме —
          // открытая запись, а рендер применяет её через setProperty.
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        },
        preset: 'fade-in',
        atSeconds: 0.4,
      },
      {
        item: 'text',
        dx: 380,
        dy: 140,
        width: 700,
        height: 160,
        content: 'Вариант 2',
        style: {
          'font-family': SANS,
          'font-size': '40px',
          color: WHITE,
          'text-align': 'center',
          background: PANEL,
          'border-radius': '20px',
          // Подпись по центру карточки и по вертикали тоже. `text-align`
          // отвечает только за горизонталь, и без этих трёх свойств текст
          // прижимается к верхнему краю — ровно то, на что владелец обратил
          // внимание в фикстуре развилки. Выразимо: `style` в схеме —
          // открытая запись, а рендер применяет её через setProperty.
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        },
        preset: 'fade-in',
        atSeconds: 0.6,
      },
    ],
    // Варианты — сами элементы сцены (индексы 1 и 2, см. ADR-011 и bindOption
    // в state/gates.ts): гейт указывает вопрос ровно там же, куда автор уже
    // положил текст, а не системную кнопку поверх.
    gate: { atSeconds: 1, prompt: 'Вопрос?', optionIndexes: [1, 2], correctIndex: 1 },
  },
];

/** Заготовка шаблона по id. Бросает, если такой заготовки нет — как `libraryItem`. */
export function sceneTemplate(id: string): SceneTemplate {
  const template = SCENE_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) {
    throw new Error(`Среди шаблонов сцены нет «${id}»`);
  }
  return template;
}

function animationPreset(id: string): AnimationPreset {
  const preset = ANIMATION_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`В библиотеке анимаций нет заготовки «${id}»`);
  }
  return preset;
}

/**
 * Применяет шаблон к сцене — добавляет элементы, их анимации и, если он есть,
 * гейт с вариантами, привязанными к только что созданным элементам.
 *
 * ДОБАВЛЯЕТ, не заменяет: у автора на сцене уже могло что-то лежать.
 * Существующие элементы, cues и gates остаются ТЕМИ ЖЕ объектами по ссылке
 * (на этом держится решение StageView, пересобирать сцену целиком или
 * обновить один элемент, см. state/project.ts) — если шаблон не добавляет
 * ни одной анимации или гейта, соответствующий массив возвращается тем же,
 * без пересборки.
 *
 * `zIndex` новых элементов выше всех существующих, id всех новых сущностей
 * свободны — два применения одного шаблона подряд не сталкиваются
 * идентификаторами (freeId читает уже накопленный список, а не исходную
 * сцену, на каждом шаге).
 */
export function applyTemplate(
  template: SceneTemplate,
  scene: Scene,
  stage: { width: number; height: number },
): Scene {
  const startZ = scene.elements.reduce((max, element) => Math.max(max, element.zIndex), -1) + 1;

  const elements = scene.elements.slice();
  const newElements: Element[] = [];
  const cues = scene.cues.slice();
  let addedCue = false;

  template.elements.forEach((te, index) => {
    const item = libraryItem(te.item);
    const width = te.width ?? item.width;
    const height = te.height ?? item.height;
    const element: Element = {
      id: freeId(item.id, elements),
      type: item.type,
      x: stage.width / 2 + te.dx - width / 2,
      y: stage.height / 2 + te.dy - height / 2,
      width,
      height,
      rotation: 0,
      zIndex: startZ + index,
      style: te.style ? { ...item.style, ...te.style } : { ...item.style },
      content: te.content ?? item.content,
    };
    elements.push(element);
    newElements.push(element);

    if (te.preset !== undefined) {
      const preset = animationPreset(te.preset);
      const cue: Cue = {
        id: freeId('cue', cues),
        targetId: element.id,
        at: { kind: 'seconds', t: te.atSeconds } satisfies TimeRef,
        animation: {
          property: preset.property,
          from: preset.from,
          to: preset.to,
          duration: preset.durationMs,
          ease: preset.ease,
        },
      };
      cues.push(cue);
      addedCue = true;
    }
  });

  let gates = scene.gates;
  if (template.gate) {
    const { atSeconds, prompt, optionIndexes, correctIndex } = template.gate;
    const options = optionIndexes.map((optionIndex) => {
      const element = newElements[optionIndex];
      if (!element) {
        throw new Error(`Шаблон «${template.id}»: гейт ссылается на элемент №${optionIndex}, которого нет`);
      }
      return { id: element.id, label: element.content };
    });
    const correctElement = newElements[correctIndex];
    if (!correctElement) {
      throw new Error(`Шаблон «${template.id}»: гейт ссылается на элемент №${correctIndex}, которого нет`);
    }
    const gate: Gate = {
      id: freeId('gate', scene.gates),
      at: { kind: 'seconds', t: atSeconds } satisfies TimeRef,
      config: { kind: 'choice', prompt, options, correctId: correctElement.id },
      // «Продолжить», а НЕ бесконечный retry, хотя схема разрешила бы и его:
      // гейт без рёбер под правило проходимости не попадает. Но шаблон
      // «вопрос с вариантами» затевался ровно ради готового взаимодействия,
      // и первое, что автор сделает дальше, — разведёт варианты по узлам.
      // С `retry` и `maxAttempts: null` `graph.connect` ему это ЗАПРЕТИТ
      // (schema.ts:356: все ветки, кроме верной, стали бы недостижимы), и он
      // получил бы отказ на действии, ради которого шаблон и нажал. Так же
      // устроена фикстура развилки — единственная, которая реально ветвится.
      //
      // В развилке «верно» и «неверно» и без того теряют смысл: оба ответа
      // ведут куда-то, просто в разные места.
      onWrong: 'continue',
      maxAttempts: null,
    };
    gates = [...scene.gates, gate];
  }

  return {
    elements,
    cues: addedCue ? cues : scene.cues,
    gates,
  };
}
