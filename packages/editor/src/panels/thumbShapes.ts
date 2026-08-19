/**
 * Вывод схемы плитки каталога ИЗ ДАННЫХ заготовки — общий для обоих
 * каталогов, шаблонов и элементов.
 *
 * Отдельный модуль, а не две копии в панелях: схема выводится по одним
 * правилам, и разъехаться эти правила не должны. Здесь же их есть чем
 * проверить — модуль чистый, без React и без DOM.
 *
 * Ни одного имени заготовки в этом файле нет и быть не может: всё берётся
 * из полей `style`, `width`, `height`. Пополнение каталога обязано
 * оставаться дописанной записью в данных (library.test.ts, templates.test.ts),
 * а рисунок, разобранный по именам, сделал бы каждую новую запись правкой
 * кода — то есть отменил бы это правило молча.
 */
import type { ThumbShape } from '../ui/index.js';

type Style = Readonly<Record<string, string | number>>;

/**
 * Скругление фигуры в единицах её же поля.
 *
 * `'50%'` — это круг, а не скругление: он даёт эллипс во всю фигуру.
 * Отдельный случай, потому что пиксельное поле его не выражает вовсе —
 * ровно та ошибка, которая однажды уронила панель на эталонной фикстуре,
 * где круг задан через `50%`.
 */
export function radiusOf(style: Style): number | 'round' | undefined {
  const raw = style['border-radius'];
  if (raw === undefined) return undefined;
  if (raw === '50%') return 'round';
  const px = Number.parseFloat(String(raw));
  return Number.isFinite(px) ? px : undefined;
}

/**
 * Заливка: сплошная или один контур.
 *
 * Прозрачный фон означает, что заготовка — рамка или скобка, то есть
 * её узнают по контуру. Залив её сплошным, схема соврала бы о том
 * единственном, чем эта заготовка отличается от соседней.
 */
export function fillOf(style: Style): 'solid' | 'outline' {
  return style['background'] === 'transparent' ? 'outline' : 'solid';
}

/**
 * Насколько фигура заметна в схеме.
 *
 * Заготовка с заливкой на шаблоне — это подложка под текстом, и в схеме
 * она обязана уйти назад: залитая наравне с текстом, она перекрыла бы его
 * и схема «две колонки» стала бы двумя пятнами. Заготовка без заливки —
 * это текст, то есть несущее.
 */
export function toneOf(style: Style): 'strong' | 'soft' {
  return style['background'] === undefined ? 'strong' : 'soft';
}

/** Фигура заготовки, вписанная по центру своего квадратного поля. */
export function objectShape(
  item: { readonly width: number; readonly height: number; readonly style: Style },
  field: number,
): ThumbShape {
  const inner = field * 0.78;
  const scale = inner / Math.max(item.width, item.height);
  const width = item.width * scale;
  const height = item.height * scale;
  const radius = radiusOf(item.style);
  return {
    x: (field - width) / 2,
    y: (field - height) / 2,
    width,
    height,
    fill: fillOf(item.style),
    tone: 'strong',
    // Скругление задано в единицах СЦЕНЫ, а поле плитки мельче: без того же
    // масштаба скруглённый угол занял бы всю фигуру.
    radius: typeof radius === 'number' ? radius * scale : radius,
  };
}
