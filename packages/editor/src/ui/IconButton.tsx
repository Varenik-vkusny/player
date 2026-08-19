import type { JSX, ReactNode } from 'react';

/**
 * Единственная кнопка-значок редактора.
 *
 * Отдельный компонент от `Button`: та несёт текст (и роль вида — `обычная`
 * или `главная`), эта — только значок (`AlignIcon` или `Icon`) и своё
 * оформление `.ed-icon-btn` (28×28, скругление, погашенное и нажатое
 * состояние — все объявлены в styles.ts).
 *
 * type="button" по умолчанию: кнопка внутри формы иначе отправляет её.
 *
 * label ОБЯЗАТЕЛЕН и без `?`. Значок без подписи — кнопка без имени для
 * тех, кто её не видит: правило, выразимое типом, выражают типом.
 * Идёт и в aria-label, и в title (пока кнопка не погашена — см. reason).
 */
interface IconButtonProps {
  label: string;
  /**
   * Почему кнопка погашена. Показывается в title ВМЕСТО label и только
   * когда кнопка действительно disabled — тот же приём, что у Button
   * (см. ui/Button.tsx).
   */
  reason?: string;
  /**
   * Что показывать в title, когда кнопка ЖИВАЯ, если это не просто label —
   * например, подсказка сочетания клавиш («Копировать форматирование
   * (Ctrl+Alt+C)»), которую aria-label нести не обязан: имя органа не
   * имеет права меняться от того, доступен он или нет, а вот title —
   * место как раз для необязательной подсказки. Не передан — title живой
   * кнопки берётся из label, как раньше.
   */
  hint?: string;
  disabled?: boolean;
  /** «Копировать форматирование» — кнопка обязана выглядеть нажатой,
   *  иначе автор забывает, что курсор ждёт второго щелчка. */
  pressed?: boolean;
  testId?: string;
  /** Дописывается к ed-icon-btn, а не заменяет его. */
  className?: string;
  onClick?: () => void;
  /** Содержимое значка — AlignIcon или Icon. */
  children: ReactNode;
}

export function IconButton({
  label,
  reason,
  hint,
  disabled,
  pressed,
  testId,
  className,
  onClick,
  children,
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={['ed-icon-btn', className].filter(Boolean).join(' ')}
      data-testid={testId}
      aria-label={label}
      aria-pressed={pressed}
      title={disabled === true ? (reason ?? label) : (hint ?? label)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
