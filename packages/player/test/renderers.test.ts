/**
 * Реестр DOM-рендереров элементов (ADR-023).
 *
 * Реестр заменил `switch (element.type)` внутри `applyElement`, и вместе
 * со `switch` исчез молчаливый фолбэк: тип без рендерера больше не рисуется
 * пустым узлом, а падает. Это и есть предмет проверки — не наличие функций
 * в карте, а то, что незарегистрированный тип не проходит тихо.
 */
import { describe, expect, it } from 'vitest';
import { registerElementRenderer, getElementRenderer, applyElement } from '@player/player';
import { ElementSchema, type Element, type ElementState } from '@player/core';

/** Заготовка состояния: тестам важен только вызов рендерера, не геометрия. */
function stateFor(): ElementState {
  return {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    zIndex: 0,
    opacity: 1,
    visible: true,
    style: {},
  };
}

/**
 * Узел-заглушка. Окружение юнит-тестов — `node` без DOM (`vitest.config.ts`),
 * поэтому настоящего `HTMLElement` здесь нет и быть не может.
 */
function nodeStub(): HTMLElement {
  return {
    className: '',
    dataset: {},
    style: { setProperty: () => {} },
    textContent: '',
  } as unknown as HTMLElement;
}

describe('ADR-023: реестр DOM-рендереров', () => {
  /**
   * Список берётся ИЗ СХЕМЫ, а не переписывается сюда руками.
   *
   * Иначе расширение `z.enum` новым типом прошло бы юниты зелёным, а упало бы
   * в браузере на первом же проекте с этим типом: с уходом `switch` отсутствие
   * рендерера стало ошибкой времени выполнения. Тест обязан ловить это здесь.
   */
  it.each(ElementSchema.shape.type.options)(
    'у типа «%s» из схемы есть зарегистрированный рендерер',
    (type) => {
      expect(getElementRenderer(type)).toBeDefined();
    },
  );

  it('применяет зарегистрированный рендерер к узлу', () => {
    let called = false;
    registerElementRenderer('test_custom', (node, element) => {
      called = true;
      node.textContent = `Custom: ${element.content}`;
    });

    const node = nodeStub();
    const element = { id: 'el-1', type: 'test_custom' as Element['type'], content: 'Привет' };

    applyElement(node, element, stateFor());

    expect(called).toBe(true);
    expect(node.textContent).toBe('Custom: Привет');
  });

  it('падает громко на незарегистрированном типе, а не рисует пустой узел', () => {
    const element = { id: 'el-unknown', type: 'unregistered_type' as Element['type'], content: '' };

    expect(() => applyElement(nodeStub(), element, stateFor())).toThrow(
      /Для типа элемента «unregistered_type» не зарегистрирован DOM-рендерер/,
    );
  });
});
