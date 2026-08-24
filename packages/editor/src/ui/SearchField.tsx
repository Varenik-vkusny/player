/**
 * Поле поиска панели каталога: лупа слева, ввод справа.
 *
 * Живёт в библиотеке, а не в хроме, и это не формальность. Охрана
 * `uiChrome.test.ts` («вне ui/ нет сырых input, select и textarea») ловит
 * ровно такой случай: орган, поставленный мимо библиотеки, оформляется
 * отдельно и расходится с остальными молча. Наступил на неё в тот же день,
 * когда заводил поиск, — и охрана сработала правильно.
 *
 * Числа с натуры (замер живой Канвы 20.08.2026, панель «Шаблоны»):
 *
 *   коробка   328×56 при панели 361, то есть поле 16 от края
 *   скругление 16, рамка 1, фон белый
 *   кегль ввода 14/400, лупа слева от него
 *
 * Коробка — `label`, а не `div`: тогда щелчок по лупе и по пустому месту
 * внутри рамки ставит курсор в поле. С `div` пришлось бы ловить щелчок
 * руками и звать focus(), то есть писать своё поведение вместо родного.
 */
import type { JSX } from 'react';

import { Icon } from './Icon.js';

export interface SearchFieldProps {
  /**
   * Имя поля для тех, кто его не видит. Обязательно и без `?`.
   *
   * Подсказка внутри поля именем НЕ считается: она исчезает при первом же
   * введённом символе, и человек, который вернулся к полю через минуту,
   * остаётся без имени. Это тот же закон, по которому в `IconButton`
   * обязателен `label`.
   */
  label: string;
  /** Подсказка внутри поля. */
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
}

export function SearchField(
  { label, placeholder, value, onChange, testId }: SearchFieldProps,
): JSX.Element {
  return (
    <label className="ed-search">
      <span className="ed-visually-hidden">{label}</span>
      <Icon name="search" />
      <input
        type="search"
        className="ed-search-input"
        data-testid={testId}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
