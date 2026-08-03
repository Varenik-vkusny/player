/**
 * Тесты Player Renderer Registry (ADR-023).
 */
import { describe, expect, it } from 'vitest';
import {
  registerElementRenderer,
  getElementRenderer,
  applyElement,
} from '@player/player';
import type { Element, ElementState } from '@player/core';

describe('ADR-023: Player Renderer Registry', () => {
  it('содержит функции отрисовки для всех стандартных типов (text, image, shape)', () => {
    expect(getElementRenderer('text')).toBeDefined();
    expect(getElementRenderer('image')).toBeDefined();
    expect(getElementRenderer('shape')).toBeDefined();
  });

  it('применяет зарегистрированный DOM-рендерер к узлу', () => {
    let called = false;
    registerElementRenderer('test_custom', (node, element) => {
      called = true;
      node.textContent = `Custom: ${element.content}`;
    });

    const mockNode = {
      className: '',
      dataset: {},
      style: {
        setProperty: () => {},
      },
      textContent: '',
    } as unknown as HTMLElement;

    const element: Element = { id: 'el-1', type: 'test_custom' as any, content: 'Привет' };
    const state: ElementState = {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 0,
      zIndex: 1,
      opacity: 1,
      visible: true,
      style: {},
    };

    applyElement(mockNode, element, state);

    expect(called).toBe(true);
    expect(mockNode.textContent).toBe('Custom: Привет');
  });

  it('громко падаёт при попытке отрисовать незарегистрированный тип элемента', () => {
    const mockNode = {
      className: '',
      dataset: {},
      style: { setProperty: () => {} },
    } as unknown as HTMLElement;

    const element: Element = { id: 'el-unknown', type: 'unregistered_type' as any, content: '' };
    const state: ElementState = {
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

    expect(() => applyElement(mockNode, element, state)).toThrow(
      /Для типа элемента «unregistered_type» не зарегистрирован DOM-рендерер/,
    );
  });
});
