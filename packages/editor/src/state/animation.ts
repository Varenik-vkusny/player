/**
 * Правка `AnimationSpec` — чистая логика, без React и DOM.
 *
 * Как и `state/elements.ts`, модуль не решает, как применить готовый спек
 * к проекту (это забота редьюсера, `updateCue` из среза 4 плана сессии) —
 * только каким должен стать `AnimationSpec`, когда автор меняет что-то
 * в панели метки анимации.
 *
 * Главное правило и его причина (план сессии, раздел «Срез 4»): у каждого
 * свойства из ANIMATABLE свой тип значения и свой смысл нуля — `opacity`
 * это число 0..1, `filter` строка вида `blur(Npx)`, `x`/`y` пиксели смещения
 * от текущей позиции, `rotate` градусы. Перенос значения одного свойства на
 * другое при простой смене enum либо не пройдёт схему (типы `from`/`to` —
 * `number | string`, так что `opacity: "blur(8px)"` пройдёт валидацию как
 * строка и сломается только в браузере), либо пройдёт и тихо не будет ничего
 * анимировать. Второе хуже первого: автор увидит «анимация не работает»
 * и не поймёт почему. Поэтому `setProperty` всегда выставляет `from`/`to`
 * заново через `defaultsFor`, а не оставляет прежние значения.
 */
import { ANIMATABLE, type AnimationSpec } from '@player/core';

/** Восемь строк из закрытого перечня схемы (инвариант №8) в виде юниона. */
export type Animatable = (typeof ANIMATABLE)[number];

/**
 * Плавности, которые распознаёт установленная версия anime.js.
 *
 * Версия зафиксирована в package.json как `^4.5.0`, фактически в
 * `node_modules/animejs/package.json` — 4.5.0. Список ниже — не вся палитра
 * `eases` библиотеки (`node_modules/animejs/dist/modules/easings/eases/parser.js`,
 * объект `eases`), а её осмысленное подмножество для выпадающего списка
 * в редакторе:
 *
 * - для каждой формы кривой (Quad, Cubic, Quart, Quint, Sine, Circ, Expo,
 *   Bounce, Back, Elastic) оставлены три направления — `in`, `out`, `inOut`.
 *   Это ровно то, что уже встречается в фикстурах (`outQuad`, `inOutQuad`,
 *   `two-gates.json`, `demo.json`, `minimal.json`) и что стоит схемным
 *   дефолтом (`AnimationSpecSchema.ease` = `'inOutQuad'`, packages/core/src/schema.ts);
 * - голые `in` / `out` / `inOut` / `outIn` и все `outIn*`-варианты не включены:
 *   они существуют в библиотеке (parser.js, `easeTypes`), но по одному имени
 *   не очевидно, что получится — `in`/`out`/`inOut` без указания формы это
 *   степенная функция со скрытым параметром по умолчанию (`easeInPower`,
 *   показатель 1.68), а `outIn` разворачивает направление кривой на середине;
 * - `linear` оставлен как явное «без плавности», `none` (точный синоним
 *   в той же библиотеке) — нет, двух имён одного эффекта автору не нужно.
 *
 * Список не проверяется «по памяти»: `animation.test.ts` сверяет каждую
 * строку с `eases`, фактическим экспортом установленного пакета `animejs`
 * (`import { eases } from 'animejs'`), а не с этим комментарием — несовпадение
 * имён между версиями библиотеки ровно тот класс ошибок, который эта сверка
 * обязана ловить.
 */
export const EASINGS: readonly string[] = [
  'linear',
  'inQuad', 'outQuad', 'inOutQuad',
  'inCubic', 'outCubic', 'inOutCubic',
  'inQuart', 'outQuart', 'inOutQuart',
  'inQuint', 'outQuint', 'inOutQuint',
  'inSine', 'outSine', 'inOutSine',
  'inCirc', 'outCirc', 'inOutCirc',
  'inExpo', 'outExpo', 'inOutExpo',
  'inBack', 'outBack', 'inOutBack',
  'inBounce', 'outBounce', 'inOutBounce',
  'inElastic', 'outElastic', 'inOutElastic',
];

/**
 * Разумные `from`/`to` для свойства — то, что автор увидит сразу после
 * выбора свойства в панели, без ручной доводки числами. Каждый выбор ниже
 * даёт заметное, но не аляповатое появление; обоснование — по свойствам.
 */
export function defaultsFor(property: Animatable): { from: number | string; to: number | string } {
  switch (property) {
    case 'x':
      // Въезд слева на 40px — величина того же порядка, что и y (см. ниже),
      // чтобы горизонтальные и вертикальные появления смотрелись однородно.
      return { from: -40, to: 0 };
    case 'y':
      // Въезд снизу на 40px. Величина не случайна: это тот же пример, что
      // разобран в ADR-009 (кью «y 40 → 0» у элемента question) — там же
      // показано, почему нулевой кадр на старте обязателен, иначе элемент
      // будет виден все 40px пути, а не только на самой анимации.
      return { from: 40, to: 0 };
    case 'scale':
    case 'scaleX':
    case 'scaleY':
      // Разворачивание из нуля до полного размера — один и тот же приём для
      // всех трёх осей масштаба, уже используется в demo.json (accent,
      // scaleX 0 → 1, подчёркивание «вырастает»). Одинаковая пара облегчает
      // предсказуемость: любое scale-свойство по умолчанию «вырастает из
      // ничего», а не слегка меняет размер.
      return { from: 0, to: 1 };
    case 'rotate':
      // Небольшой доворот на месте (12°) — появление заметно на глаз, но не
      // выглядит как вращение колеса; направление (из отрицательного в 0)
      // читается как «элемент чуть довернулся и замер».
      return { from: -12, to: 0 };
    case 'opacity':
      // Обычное появление через прозрачность — самый частый кью во всех
      // фикстурах проекта (demo.json, two-gates.json, minimal.json).
      return { from: 0, to: 1 };
    case 'filter':
      // Расфокусировка снимается к моменту появления: blur(8px) → blur(0px).
      // Инвариант №8, оговорка про filter: blur() не равноправен transform
      // и opacity — измерено, что он удваивает длину худшего кадра (40.1 мс
      // против 22.2 мс, docs/status.md). Запас есть на 15 элементах (58.8 fps
      // при пороге 55), но исчезает первым при росте числа блюров на сцене.
      // Значение по умолчанию поэтому умеренное (8px, не 20 и не больше) —
      // это не освобождает автора от бюджета кадра, если блюров на сцене
      // много одновременно.
      return { from: 'blur(8px)', to: 'blur(0px)' };
  }
}

/**
 * Смена анимируемого свойства. Сбрасывает `from`/`to` на дефолты нового
 * свойства (см. `defaultsFor` и комментарий к модулю) — старые значения
 * остаются осмысленными только для прежнего свойства.
 *
 * Без изменений (то же свойство) — тот же объект по ссылке: ссылочная
 * целостность нужна редьюсеру и `StageView`, которые решают, перерисовывать
 * что-то или нет, сравнением ссылок, а не глубоким сравнением значений.
 */
export function setProperty(spec: AnimationSpec, property: Animatable): AnimationSpec {
  if (spec.property === property) return spec;
  return { ...spec, property, ...defaultsFor(property) };
}

/**
 * Правка `from`. `undefined` — законное значение, а не отсутствие правки:
 * по ADR-009 кью без явного `from` означает «anime.js берёт то значение
 * свойства, какое уже стоит на узле», и `buildTimeline` в этом случае не
 * кладёт для кью нулевой кадр вовсе (packages/player/src/timeline.ts,
 * `if (from === undefined) continue;` в цикле построения `initial`). Автор,
 * снимающий `from`, делает осознанный выбор «начни с того, что уже есть»,
 * а не оставляет поле пустым по ошибке — модуль обязан пропустить `undefined`
 * дальше, а не подставить вместо него число или прежнее значение.
 */
export function setFrom(spec: AnimationSpec, from: number | string | undefined): AnimationSpec {
  if (Object.is(spec.from, from)) return spec;
  return { ...spec, from };
}

/** Правка `to`. Схема требует значение всегда (не optional, в отличие от `from`). */
export function setTo(spec: AnimationSpec, to: number | string): AnimationSpec {
  if (Object.is(spec.to, to)) return spec;
  return { ...spec, to };
}

/**
 * Правка длительности, миллисекунды. Схема требует `duration.finite().positive()`
 * (packages/core/src/schema.ts) — та же граница здесь, но с понятным
 * сообщением в момент правки в редакторе, а не абстрактным issue.path из zod
 * при попытке сохранить проект.
 */
export function setDuration(spec: AnimationSpec, ms: number): AnimationSpec {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(
      `Длительность анимации должна быть конечным положительным числом миллисекунд, получено: ${ms}`,
    );
  }
  if (spec.duration === ms) return spec;
  return { ...spec, duration: ms };
}

/**
 * Правка плавности. Схема принимает под `ease` любую строку (`z.string()`),
 * но не любая строка работает: нераспознанное имя `parseEaseString` внутри
 * anime.js не бросает исключение — молча возвращает `none` (identity,
 * то есть анимация просто перестаёт иметь плавность), без единого сигнала
 * об ошибке автору. Это тот же класс дефекта, ради которого существует
 * правило про `from`/`to` при смене свойства — только здесь молчаливая
 * порча грозит из-за опечатки в строке, а не из-за смены enum. Поэтому
 * граница ставится здесь, а не только там, где схема уже проверяет тип.
 */
export function setEase(spec: AnimationSpec, ease: string): AnimationSpec {
  if (!EASINGS.includes(ease)) {
    throw new Error(
      `Неизвестная плавность «${ease}»: anime.js её не понимает. Доступные значения: ${EASINGS.join(', ')}`,
    );
  }
  if (spec.ease === ease) return spec;
  return { ...spec, ease };
}
