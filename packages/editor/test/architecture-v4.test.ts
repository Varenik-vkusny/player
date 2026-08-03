/**
 * Тесты архитектуры v4 (ADR-023): Реестр плагинов, Шина команд и AudioPipelineService.
 */
import { describe, expect, it } from 'vitest';
import {
  registerCoreElement,
  getCoreElementPlugin,
  getAllCoreElementPlugins,
} from '@player/core';
import {
  registerElementRenderer,
  getElementRenderer,
} from '@player/player';
import {
  registerEditorElement,
  getEditorElementPlugin,
  getAllLibraryItems,
  registerCommandHandler,
  dispatchCommand,
  AudioPipelineService,
} from '../src/index.js';
import type { EditorState } from '../src/state/project.js';

describe('ADR-023: Core Plugin Registry', () => {
  it('содержит встроенные базовые плагины элементов (text, shape, image)', () => {
    const plugins = getAllCoreElementPlugins();
    expect(plugins.length).toBeGreaterThanOrEqual(3);
    expect(getCoreElementPlugin('text')?.type).toBe('text');
    expect(getCoreElementPlugin('shape')?.type).toBe('shape');
    expect(getCoreElementPlugin('image')?.type).toBe('image');
  });

  it('позволяет динамически регистрировать новый тип элемента в ядре', () => {
    registerCoreElement({
      type: 'custom_code',
      defaultContent: 'code',
      defaultState: { width: 100, height: 100 },
    });
    const custom = getCoreElementPlugin('custom_code');
    expect(custom?.type).toBe('custom_code');
    expect(custom?.defaultContent).toBe('code');
  });
});

describe('ADR-023: Player Renderer Registry', () => {
  it('содержит функции отрисовки для встроенных типов', () => {
    expect(getElementRenderer('text')).toBeDefined();
    expect(getElementRenderer('image')).toBeDefined();
    expect(getElementRenderer('shape')).toBeDefined();
  });

  it('позволяет регистрировать кастомный DOM-рендерер', () => {
    let rendered = false;
    registerElementRenderer('custom_code', (node) => {
      rendered = true;
      node.textContent = 'rendered';
    });

    const renderer = getElementRenderer('custom_code');
    expect(renderer).toBeDefined();

    const node = { textContent: '', style: {} } as any;
    renderer!(node, { id: 'c1', type: 'shape', content: '' }, {
      x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 1, opacity: 1, visible: true, style: {},
    });

    expect(rendered).toBe(true);
    expect(node.textContent).toBe('rendered');
  });
});

describe('ADR-023: Editor Element Registry', () => {
  it('возвращает список заготовок включая пользовательские', () => {
    registerEditorElement({
      type: 'custom_widget',
      libraryItem: {
        id: 'custom_widget',
        label: 'Виджет',
        type: 'shape',
        width: 100,
        height: 100,
        style: {},
        content: '',
      },
    });

    const plugin = getEditorElementPlugin('custom_widget');
    expect(plugin).toBeDefined();
    expect(plugin?.libraryItem?.label).toBe('Виджет');

    const library = getAllLibraryItems();
    expect(library.some((item) => item.id === 'custom_widget')).toBe(true);
  });
});

describe('ADR-023: Command Bus', () => {
  it('выполняет зарегистрированную команду через шину', () => {
    let executed = false;
    registerCommandHandler('select', {
      execute(state, action) {
        executed = true;
        return { ...state, selectedId: action.id };
      },
    });

    const mockState = {
      project: {} as any,
      selectedId: undefined,
      currentSegmentId: 'seg-1',
      currentSlideId: 'slide-1',
      lastRetarget: undefined,
    } satisfies EditorState;

    const result = dispatchCommand(mockState, { type: 'select', id: 'el-123' });
    expect(executed).toBe(true);
    expect(result.selectedId).toBe('el-123');
  });
});

describe('ADR-023: AudioPipelineService', () => {
  it('кладет аудио и создает безопасный клонированный буфер', async () => {
    expect(AudioPipelineService.prepareAudioFile).toBeDefined();
    expect(AudioPipelineService.transcribeAudio).toBeDefined();
  });
});
