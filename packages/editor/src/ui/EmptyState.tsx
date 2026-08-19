import type { JSX } from 'react';

/**
 * Пустая панель, которая говорит, что делать.
 *
 * Образца с натуры у неё НЕТ, и это записано честно: у живого пользователя
 * Канвы все разделы каталога непусты, поймать пустое состояние не удалось
 * (docs/research/2026-08-19-anatomy-canva-capcut.md). «Не замерено» и
 * «у них такого нет» — разные утверждения, и выдавать одно за другое нельзя.
 *
 * `hint` необязателен, `title` обязателен: панель, которая молчит о том,
 * почему она пуста, хуже отсутствующей — автор считает её поломкой.
 */
export interface EmptyStateProps {
  title: string;
  hint?: string;
}

export function EmptyState({ title, hint }: EmptyStateProps): JSX.Element {
  return (
    <p className="ed-empty">
      <span>{title}</span>
      {hint === undefined ? null : <span>{hint}</span>}
    </p>
  );
}
