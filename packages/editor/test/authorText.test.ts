/**
 * Текст, который читает АВТОР, не содержит ключей из кода (Сессия 47).
 *
 * Замерено 18.08.2026: видимая строка причины под лентой слайдов пишет
 * «На этой секунде уже стоит слайд «node-1-slide-1» (1.450 с)».
 * `node-1-slide-1` — ключ схемы. Автор такого не заводил и не может
 * сопоставить его ни с чем на экране.
 *
 * Это родня закрытому в Сессии 46 `var(--scene-surface…` в подписи
 * элемента: там в текст для человека попал язык CSS, здесь — ключ схемы.
 *
 * ЧТО ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ И ПОЧЕМУ. Идентификаторы в сообщениях
 * `throw new Error(...)` — не предмет: сообщение о нарушенном инварианте
 * адресовано тому, кто чинит код, и обязано называть предмет точно
 * (CLAUDE.md: «Ошибка должна падать громко и в том месте, где возникла»).
 * Обход всех строк проекта дал 60 мест с идентификаторами, и почти все —
 * именно такие. Предмет этого файла — строки, которые ВОЗВРАЩАЮТСЯ
 * интерфейсу как причина, подпись или имя.
 *
 * Имена ЭЛЕМЕНТОВ тоже не предмет: `elementName` (track/slide-summary.ts)
 * показывает содержимое текста, а при его отсутствии — id, и эти id автор
 * задаёт сам (`title`, `lead`, `accent`). Это запасной вид имени,
 * а не утечка ключа.
 */
import { describe, expect, it } from 'vitest';

import type { Element, ElementState, Segment, Slide, TimeRef } from '@player/core';

import { MARK_HIT_SECONDS, pasteProblem } from '../src/state/slides.js';

const seconds = (t: number): TimeRef => ({ kind: 'seconds', t });

function el(id: string): Element {
  return { id, type: 'shape', content: '', locked: false };
}

function state(): ElementState {
  return {
    x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0,
    opacity: 1, visible: true, flipX: false, flipY: false, style: {},
  };
}

/**
 * Идентификаторы слайдов взяты НАРОЧНО такими же уродливыми, как в живой
 * фикстуре demo (`node-1-slide-1`), а не короткими `slide-1`: короткий ключ
 * можно спутать с человеческим словом, и тест на подстроку прошёл бы там,
 * где утечка есть.
 */
function segmentWithUglyIds(): Segment {
  const slides: Slide[] = [
    { id: 'node-1-slide-1', at: seconds(0), transition: 'morph', transitionSeconds: 0.6, states: { 'shape-1': state() } },
    { id: 'node-1-slide-2', at: seconds(5), transition: 'morph', transitionSeconds: 0.6, states: { 'shape-1': state() } },
  ];
  return {
    authorSpans: [],
    id: 'node-1',
    title: 'Глава',
    description: '',
    audio: { src: 'audio/test.mp3', offset: 0, duration: 10, words: [] },
    elements: [el('shape-1')],
    slides,
    gates: [],
    exit: { rules: [], default: null },
  };
}

describe('причина, показанная автору, называет слайд временем, а не ключом', () => {
  /**
   * НЕСУЩИЙ ТЕСТ. Что должно сломаться, чтобы он покраснел: в текст
   * причины снова подставят `hit.id`. На коде до починки строка содержит
   * `node-1-slide-2` и тест красный.
   *
   * Проверка на подстроку, а не на точное равенство: формулировка причины
   * — дело интерфейса и может меняться, а вот ключа в ней быть не должно
   * НИКОГДА. Точное равенство закрепило бы сегодняшнюю фразу как требование.
   */
  it('в причине нет идентификатора слайда', () => {
    const segment = segmentWithUglyIds();
    const reason = pasteProblem(segment, seconds(5 + MARK_HIT_SECONDS / 2));

    // Положительный контроль: причина вообще НАШЛАСЬ. Без него `undefined`
    // прошёл бы проверку на отсутствие подстроки и тест был бы зелен,
    // когда причина перестала выдаваться вовсе.
    expect(reason, 'причина не выдана — проверять нечего').toBeDefined();
    expect(reason).toMatch(/уже стоит слайд/);

    for (const slide of segment.slides) {
      expect(
        reason,
        `причина «${reason}» называет слайд ключом «${slide.id}» — автор такого не заводил`,
      ).not.toContain(slide.id);
    }
  });

  /**
   * Раз ключа в причине нет, автор обязан узнать слайд по чему-то другому.
   * Единственное, что у слайда есть, — его время. Тест держит именно это:
   * без него «убрать ключ» можно было бы выполнить, стерев упоминание вовсе.
   */
  it('причина называет слайд его временем', () => {
    const segment = segmentWithUglyIds();
    const reason = pasteProblem(segment, seconds(5 + MARK_HIT_SECONDS / 2));
    expect(reason, 'причина не выдана').toBeDefined();
    // Слайд, в который попали, стоит на 5-й секунде. Ищем «5» с дробной
    // частью, а не голую цифру: голая пятёрка нашлась бы и в «1.450 с»,
    // то есть тест был бы зелен, назови причина совсем другое число.
    // Число знаков после точки НЕ закрепляем — это предмет Задачи 4.
    expect(reason, `причина «${reason}» не называет времени слайда`).toMatch(/5[.,]\d/);
  });
});
