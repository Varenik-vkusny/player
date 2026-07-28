/**
 * Таблица «клавиша + контекст → намерение автора», а не обработчик.
 *
 * Вид редактора будет переписан целиком в отдельной сессии (ADR-010).
 * Обработчик `onKeyDown` в компоненте исчезнет вместе с этой переписью —
 * таблица переживёт: она ничего не диспатчит, не трогает DOM и не знает
 * про React, только отвечает на вопрос «что хотел автор» по событию
 * клавиатуры и контексту. Компонент лишь вызывает `keyToIntent` и передаёт
 * результат в редьюсер.
 *
 * Главный закон модуля — контекст решает всё, и это не про удобство,
 * а про то, чтобы редактор не отбирал у браузера чужой ввод. `undefined`
 * означает буквально «эта клавиша не наша, пусть браузер делает своё» —
 * то есть событие остаётся необработанным и продолжает жить своей жизнью
 * (набор текста, системное сочетание, обход по Tab).
 */

/** Пять полей `KeyboardEvent`, которых достаточно для решения. `Pick`,
 * а не весь `KeyboardEvent`, — намеренно: модуль не создаёт и не читает
 * ничего из DOM, значит проверяется в node без jsdom, а вызывающему
 * достаточно передать пять примитивов из реального события. */
type KeyboardLikeEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>;

export type KeyIntent =
  | { readonly kind: 'delete' }
  | { readonly kind: 'nudge'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'deselect' }
  | { readonly kind: 'commitText' };

export interface KeyContext {
  readonly hasSelection: boolean;
  /** Каретка внутри текста на холсте — почти все клавиши принадлежат вводу. */
  readonly editingText: boolean;
  /** Фокус в поле ввода панели свойств или в другом текстовом поле. */
  readonly inTextField: boolean;
}

/** Шаг сдвига стрелками: 1 px обычно, 10 px с зажатым Shift. */
const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;

export function keyToIntent(event: KeyboardLikeEvent, context: KeyContext): KeyIntent | undefined {
  // Alt-комбинации — системные сочетания ОС и раскладки (спецсимволы,
  // переключение языка, меню). Проверка стоит раньше всех остальных
  // и без исключений: намерения редактора с Alt не связаны никогда.
  if (event.altKey) return undefined;

  // Каретка в текстовом поле панели свойств (например, автор печатает
  // название элемента). Здесь всё, кроме самого факта набора, — чужое.
  //
  // Delete/Backspace и стрелки не возвращают intent: это стирание буквы
  // и движение каретки внутри поля, а не действие над элементом сцены.
  //
  // Ctrl+Z/Cmd+Z намеренно тоже `undefined`, а не 'undo' — решение, а не
  // недосмотр. У браузера уже есть свой стек отмены для текстового поля
  // (отмена посимвольного набора); перехват здесь заменил бы привычное
  // автору поведение на наше — «откатить весь проект на снимок назад»,
  // что для человека, поправляющего одну букву, было бы сюрпризом.
  // Тот же аргумент — для Ctrl+Shift+Z/Ctrl+Y (повтор).
  //
  // Escape тоже `undefined`: у обычного `<input>` есть нативное поведение —
  // Escape откатывает несохранённое значение поля к тому, что было на
  // момент фокуса. `deselect` сюда не подходит: это про выделение на
  // сцене, а не про содержимое поля, и отобрал бы у автора этот откат.
  if (context.inTextField) return undefined;

  // Каретка в тексте прямо на холсте (contenteditable). Правило то же
  // самое, что для текстового поля панели, — набор, Backspace, стрелки
  // и отмена браузера работают внутри contenteditable без нашего участия.
  // Единственное отличие: Escape не про поле ввода, а про режим правки
  // элемента сцены, поэтому он коммитит текст, а не откатывает набранное.
  if (context.editingText) {
    if (event.key === 'Escape') return { kind: 'commitText' };
    return undefined;
  }

  // Дальше — обычный режим: фокус не в тексте, клавиши имеют смысл сцены.

  // Escape снимает выделение независимо от того, есть ли оно. В отличие
  // от delete/nudge ниже, здесь нет операции, которую можно совершить
  // «впустую» и получить неожиданный результат: если выделения и так нет,
  // `deselect` — безопасный no-op на стороне редьюсера, а не ошибка.
  if (event.key === 'Escape') return { kind: 'deselect' };

  const key = event.key.toLowerCase();
  const withCtrlOrCmd = event.ctrlKey || event.metaKey;

  // Отмена и повтор не зависят от выделения вовсе — это история проекта,
  // а не операция над текущим объектом.
  if (withCtrlOrCmd && key === 'z' && !event.shiftKey) return { kind: 'undo' };
  if (withCtrlOrCmd && key === 'z' && event.shiftKey) return { kind: 'redo' };
  // Ctrl+Y — асимметрично: только Ctrl, не Cmd. На macOS это сочетание
  // ничего не значит (стандарт там — Cmd+Shift+Z, уже покрыт строкой
  // выше), а Cmd+Y — это, например, «История» в Chrome. Раздавать его
  // под повтор — значит отбирать чужое сочетание там, где своего аналога
  // не существует.
  if (event.ctrlKey && !event.shiftKey && key === 'y') return { kind: 'redo' };

  if (event.key === 'Delete' || event.key === 'Backspace') {
    // Без выделения удалять нечего — намерение бессмысленно и должно
    // остаться незамеченным, а не превращаться в действие над «ничем».
    return context.hasSelection ? { kind: 'delete' } : undefined;
  }

  if (
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown'
  ) {
    // Как и delete — без выделения сдвигать нечего.
    if (!context.hasSelection) return undefined;
    const step = event.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
    switch (event.key) {
      case 'ArrowLeft':
        return { kind: 'nudge', dx: -step, dy: 0 };
      case 'ArrowRight':
        return { kind: 'nudge', dx: step, dy: 0 };
      case 'ArrowUp':
        // Ось Y растёт вниз (см. `stage/geometry.ts`, функция `rotate`,
        // и ADR-007) — «вверх» на экране это УМЕНЬШЕНИЕ y, а не увеличение.
        return { kind: 'nudge', dx: 0, dy: -step };
      case 'ArrowDown':
        return { kind: 'nudge', dx: 0, dy: step };
    }
  }

  // Всё остальное — не наше: буквы, функциональные клавиши, Tab. Раскладка
  // обязана быть закрытым списком: молчаливый intent для неизвестной
  // клавиши украл бы у браузера Tab и сломал бы обход сцены с клавиатуры,
  // на котором держится доступность (см. «Список элементов» в спеке среза 6).
  return undefined;
}
