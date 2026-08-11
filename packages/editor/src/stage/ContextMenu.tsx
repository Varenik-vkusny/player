/**
 * Меню правой кнопки над сценой.
 *
 * Первое всплывающее меню в редакторе: готового ни одного не было, поэтому
 * состав и поведение сняты С НАТУРЫ у Canva 11.08.2026, а не восстановлены
 * по памяти (журнал С31 §8). Оттуда взято три решения:
 *
 *   · сочетание клавиш показано СПРАВА от подписи — меню заодно учит
 *     клавиатуре, а документации у автора нет;
 *   · невозможный сейчас пункт ГАСНЕТ, но остаётся на месте. У Canva
 *     объект в самом низу стопки показывает «Переместить назад» серым.
 *     Спрятать значило бы отобрать у автора действие молча: кривую
 *     вёрстку видно сразу, а пропавший пункт автор считает задуманным
 *     (грабли С30 §20б);
 *   · разделители группируют, а не украшают.
 *
 * Сознательное ОТСТУПЛЕНИЕ от натуры: у Canva слои спрятаны в подменю,
 * здесь список плоский. У них в меню за десяток пунктов и без вложенности
 * оно нечитаемо, у нас шесть. Подменю стоит наведения с задержкой,
 * вложенного обхода с клавиатуры и своего позиционирования — цена
 * интерфейса при нулевой пользе на шести пунктах.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { placeMenu } from './menuPlacement.js';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  /** Показывается справа серым. `undefined` — у пункта сочетания нет. */
  readonly shortcut?: string;
  /** Сейчас невозможен: показывается погашенным и не выбирается. */
  readonly disabled?: boolean;
  /** Разделитель ПЕРЕД этим пунктом. */
  readonly separatorBefore?: boolean;
  readonly onSelect: () => void;
}

export interface ContextMenuProps {
  /** Где нажали, в координатах ОКНА (`clientX`/`clientY`). */
  readonly at: { readonly x: number; readonly y: number };
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
}

export function ContextMenu({ at, items, onClose }: ContextMenuProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(at);

  /**
   * Разворот у края окна. Считается ПОСЛЕ отрисовки, потому что до неё
   * размер меню неизвестен: он зависит от числа пунктов и длины подписей,
   * а не задан числом.
   *
   * `useLayoutEffect`, а не `useEffect`: правка позиции обязана попасть
   * в тот же кадр, иначе автор увидит, как меню прыгает с края на место.
   */
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();

    // Компонент только подаёт измерения: сам расчёт живёт в `menuPlacement.ts`
    // и проверяется там без DOM. Внутри компонента он был бы непроверяемым —
    // через интерфейс край окна почти недостижим (см. комментарий модуля).
    setPosition(
      placeMenu(
        at,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [at]);

  /** Кнопки пунктов, которые можно выбрать: погашенные обходом пропускаются. */
  const enabledButtons = useCallback((): HTMLButtonElement[] => {
    const node = rootRef.current;
    if (!node) return [];
    return Array.from(
      node.querySelectorAll<HTMLButtonElement>('button[data-menuitem]:not([aria-disabled="true"])'),
    );
  }, []);

  // Фокус на первый доступный пункт: меню, открытое с клавиатуры, обязано
  // быть проходимо с клавиатуры, а не только мышью.
  useEffect(() => {
    enabledButtons()[0]?.focus();
  }, [enabledButtons]);

  /**
   * Закрытие по щелчку мимо и по прокрутке.
   *
   * Прокрутка закрывает, а не переносит меню: меню привязано к точке ОКНА,
   * и оставшись висеть, оно указывало бы уже на другой объект — то есть
   * врало бы о том, над чем сработает.
   *
   * `capture`, чтобы успеть до обработчиков сцены: иначе щелчок мимо сначала
   * снял бы выделение, а меню закрылось бы уже после и на пустом месте.
   */
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const node = rootRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      onClose();
    };
    const onScroll = (): void => onClose();
    const onWindowBlur = (): void => onClose();

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [onClose]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const buttons = enabledButtons();
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      case 'ArrowDown':
        event.preventDefault();
        // По кругу: дойдя до низа, обход возвращается наверх — иначе
        // клавиатурный автор упирается в конец списка без подсказки.
        buttons[(current + 1) % buttons.length]!.focus();
        return;
      case 'ArrowUp':
        event.preventDefault();
        buttons[(current - 1 + buttons.length) % buttons.length]!.focus();
        return;
      case 'Home':
        event.preventDefault();
        buttons[0]!.focus();
        return;
      case 'End':
        event.preventDefault();
        buttons[buttons.length - 1]!.focus();
        return;
      case 'Tab':
        // Уход по Tab закрывает меню: оставленное открытым, оно перекрывало
        // бы сцену, а фокус был бы уже не в нём.
        onClose();
        return;
      default:
        return;
    }
  };

  return (
    <div
      ref={rootRef}
      className="ed-ctxmenu"
      role="menu"
      data-testid="context-menu"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onKeyDown={handleKeyDown}
      /* Своё меню поверх нашего же — бессмыслица: правая кнопка внутри
         меню не должна открывать меню браузера. */
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <div key={item.id} className="ed-ctxmenu-slot">
          {item.separatorBefore ? <div className="ed-ctxmenu-sep" role="separator" /> : null}
          <button
            type="button"
            data-menuitem=""
            data-testid={`ctxmenu-${item.id}`}
            className="ed-ctxmenu-item"
            role="menuitem"
            /* `aria-disabled`, а не атрибут `disabled`: погашенная кнопка
               обязана оставаться видимой и читаемой вспомогательными
               технологиями — она сообщает автору, что действие существует,
               просто сейчас неприменимо. */
            aria-disabled={item.disabled === true}
            tabIndex={item.disabled === true ? -1 : 0}
            onClick={() => {
              if (item.disabled === true) return;
              item.onSelect();
              onClose();
            }}
          >
            <span className="ed-ctxmenu-label">{item.label}</span>
            {item.shortcut === undefined ? null : (
              <span className="ed-ctxmenu-key">{item.shortcut}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
