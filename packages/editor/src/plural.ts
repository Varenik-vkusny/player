/**
 * Согласование числительного с существительным по-русски.
 *
 * Чистая функция, без React и DOM. Живёт отдельно, потому что нужна в двух
 * несвязанных местах — в шапке редактора и в сообщении о каскадном удалении, —
 * а две копии одного правила разъедутся тихо: поправят одну, вторая останется
 * писать «1 элементов».
 *
 * Правило не сводится к «один против многих»: у русского три формы, и у них
 * есть исключение на 11–14, где вопреки последней цифре нужна форма множества
 * («11 элементов», а не «11 элемент»). Именно на этом исключении такие функции
 * обычно и ломаются.
 */

export interface PluralForms {
  /** 1, 21, 101 — «элемент». */
  readonly one: string;
  /** 2–4, 22–24 — «элемента». */
  readonly few: string;
  /** 0, 5–20, 25–30 — «элементов». */
  readonly many: string;
}

/** Форма слова для этого числа. Само число не подставляется. */
export function pluralForm(count: number, forms: PluralForms): string {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`Согласование возможно только с целым неотрицательным числом, получено ${count}`);
  }

  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms.many;

  const mod10 = count % 10;
  if (mod10 === 1) return forms.one;
  if (mod10 >= 2 && mod10 <= 4) return forms.few;
  return forms.many;
}

/** «3 анимации» — число вместе с согласованной формой. */
export function plural(count: number, forms: PluralForms): string {
  return `${count} ${pluralForm(count, forms)}`;
}

export const ELEMENTS: PluralForms = { one: 'элемент', few: 'элемента', many: 'элементов' };
export const ANIMATIONS: PluralForms = { one: 'анимация', few: 'анимации', many: 'анимаций' };
export const GATES: PluralForms = { one: 'гейт', few: 'гейта', many: 'гейтов' };
export const SLIDES: PluralForms = { one: 'слайде', few: 'слайдах', many: 'слайдах' };
