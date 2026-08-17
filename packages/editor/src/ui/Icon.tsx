import type { JSX } from 'react';

import { ICON_PATHS, type IconName } from './icons.js';

/**
 * Единственный значок редактора.
 *
 * Размер приходит от кегля строки, в которой значок стоит (1em), а цвет —
 * от currentColor: значок обязан следовать за текстом, рядом с которым
 * живёт, иначе роли цвета придётся дублировать на каждый случай, а шкалу
 * кеглей — обходить.
 *
 * aria-hidden по умолчанию: значок сопровождает подпись, а не заменяет её.
 * Значку без подписи вызывающий обязан передать label — иначе кнопка
 * останется без имени для тех, кто её не видит.
 *
 * dangerouslySetInnerHTML, а не разбор контура в узлы. Данные извне сюда
 * попасть НЕ МОГУТ, и это держится типом, а не обещанием: name объявлен
 * как IconName = keyof typeof ICON_PATHS, то есть закрытым перечнем, и
 * индексация им отдаёт ровно один из литералов icons.ts. Строки, пришедшей
 * от автора, зрителя или файла проекта, в этом выражении не бывает.
 *
 * Разбирать контур в узлы значило бы писать второй парсер SVG ради того же
 * результата и потерять дословность: сейчас контур совпадает с Lucide
 * знак в знак, и расхождение с первоисточником видно глазами (ADR-034).
 */
export function Icon({ name, label }: { name: IconName; label?: string }): JSX.Element {
  return (
    <svg
      className="ed-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label === undefined}
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
