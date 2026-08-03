# ADR-023: Реестр плагинов компонентов (Plugin Registry), Шина команд (Command Bus) и Сервис аудиопотока (AudioPipelineService)

Дата: 2026-08-03
Статус: принято владельцем 03.08.2026.

Продолжает [ADR-003](ADR-003-render.md) (единый рендер сцены),
[ADR-010](ADR-010-editor-architecture.md) (архитектура редактора)
и [ADR-021](ADR-021-audio-source.md) (хранение и декодирование аудио).

## Контекст

При добавлении нового типа элемента сцены или интерактивного компонента разработчик/AI-агент вынужден редактировать до 8 разрозненных файлов в разных пакетах:
- Zod-схему в `packages/core/src/schema/element.ts`
- DOM-рендер в `packages/player/src/render.ts`
- Дефолтные данные в `packages/editor/src/state/library.ts`
- Компоненты управления UI в `packages/editor/src/panels/Inspector.tsx` и `InsertPanel.tsx`

При этом действия пользователя над проектом обрабатываются в монолитном `editorReducer` (`packages/editor/src/state/project.ts`), а операции замены аудио и ASR-расшифровки сопряжены с риском разрыва асинхронного состояния и отмены (`Undo/Redo`).

Для ускорения разработки, вайбкодинга и обеспечения надёжности работы AI-агентов необходима модульная архитектура с разделением ответственности и минимальным контекстом.

## Что отвергнуто

1. **Единый жирный плагин, объединяющий React, DOM и Zod в одном файле.**
   Отвергнуто по Инварианту №6 (`editor → player → core`). Пакет `@player/core` не имеет права знать про DOM и React, а `@player/player` не имеет права знать про React.
2. **Использование патчей (JSON Patches) вместо снимков для истории отмен.**
   Отвергнуто по [ADR-010](ADR-010-editor-architecture.md): патчи накапливают ошибки рассогласования при сложных каскадных операциях (разрез сегментов, замена звука).

## Решение

### 1. Трёхслойный реестр плагинов элементов (Plugin Registry)

Каждый новый тип элемента объявляется через 3 изолированных регистратора в соответствующих пакетах:

1. **`@player/core` (`packages/core/src/elements/registry.ts`)**:
   Регистрирует Zod-схему и дефолтное состояние элемента для генерации типов и валидации:
   ```ts
   registerCoreElement({
     type: 'text',
     schema: textElementSchema,
     defaultState: { text: 'Текст', fontSize: 24, ... }
   });
   ```

2. **`@player/player` (`packages/player/src/renderers/registry.ts`)**:
   Регистрирует чистую DOM-функцию отрисовки для Плеера и Редактора (Инвариант №5):
   ```ts
   registerElementRenderer('text', (node, element, state) => { ... });
   ```

3. **`@player/editor` (`packages/editor/src/elements/registry.ts`)**:
   Регистрирует заготовку для панели вставки и компонент инспектора на React:
   ```ts
   registerEditorElement({
     type: 'text',
     label: 'Текст',
     icon: TextIcon,
     Inspector: TextInspectorPanel
   });
   ```

### 2. Модульная шина команд (Command Bus)

Изменение проекта выносится из монолитного редьюсера `project.ts` в изолированные классы/функции команд в `packages/editor/src/commands/`:
- `AddElementCommand`
- `UpdateElementStateCommand`
- `SplitSegmentCommand`
- `ReplaceAudioCommand`

Все команды автоматически управляют открепом/закрепом транзакций (`gestureCoalescing`), кольцевым буфером истории (`History<Project>`) и восстановлением валидного вида (`editorHistory.ts`).

### 3. Сервисный слой асинхронности аудио (`AudioPipelineService`)

Операции асинхронной работы с аудио (декодирование `AudioContext`, сохранения байтов в IndexedDB, транскрибация Deepgram и перенос меток `retargetByAlignment`) капсулируются в сервисе `AudioPipelineService` (`packages/editor/src/audio/audioPipeline.ts`). Сервис обеспечивает:
- Безопасную копию `ArrayBuffer.slice(0)` перед `decodeAudioData`.
- Отмену текущих ASR-запросов при смене сегмента/файла.
- Атомарный коммит замененной дорожки и выравненных меток одним шагом истории.

## Чем проверяется

- Выполнение `pnpm check` (проверка типов `tsc`, 1192 юнит-теста, сборка плеера, e2e-тесты Playwright).
- Проверка сохранения Инварианта №6 (отсутствие обратных импортов `core -> player -> editor`).
