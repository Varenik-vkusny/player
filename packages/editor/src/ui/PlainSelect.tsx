/**
 * Список без видимой подписи — орган, который сам показывает своё значение.
 *
 * Заведён в Сессии 55 под масштаб дорожки, но случай общий и в редакторе
 * уже второй: так же устроен список масштаба холста (`stage/ZoomBar.tsx`),
 * который до сих пор держался в списке исключений охраны сырых органов
 * ровно потому, что подходящего поля в библиотеке не было.
 *
 * Чем отличается от `ChoiceField`: тот ОБЯЗАТЕЛЬНО рисует подпись через
 * `Field`, и в строке высотой 24 px она дала бы второй ряд — то есть орган
 * вырастил бы полосу, а вместе с ней зону, а вместе с зоной отнял бы
 * высоту у холста. Здесь подписи нет на экране, но `aria-label` обязателен
 * типом: орган без имени не существует ни для чтения с экрана, ни для
 * поиска по имени в тесте, и заметить это глазами нельзя — он выглядит
 * обычно. Перепись Сессии 51 нашла девять таких.
 */
import type { ReactElement } from 'react';

export interface PlainSelectOption {
  readonly value: string;
  readonly label: string;
  /** Сейчас недоступен: остаётся в списке, но не выбирается. */
  readonly disabled?: boolean;
}

export interface PlainSelectProps {
  /** Имя органа. Обязательно: видимой подписи у него нет. */
  readonly ariaLabel: string;
  readonly value: string;
  readonly options: readonly PlainSelectOption[];
  readonly onPick: (value: string) => void;
  readonly className?: string;
  readonly testId?: string;
  readonly title?: string;
}

export function PlainSelect({
  ariaLabel,
  value,
  options,
  onPick,
  className,
  testId,
  title,
}: PlainSelectProps): ReactElement {
  return (
    <select
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      title={title}
      value={value}
      onChange={(event) => onPick(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled === true}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
