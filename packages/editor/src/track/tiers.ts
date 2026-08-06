/**
 * Сколько полос показывает дорожка при своей нынешней высоте.
 *
 * Дорожку можно тянуть за верхнюю кромку и складывать целиком (решение
 * владельца 06.08.2026). Значит одна и та же дорожка обязана выглядеть
 * по-разному при 400 px и при 140 — и правило «как именно» живёт здесь,
 * чистой функцией, а не в разметке.
 *
 * ВЫСОТА — ЕДИНСТВЕННОЕ ЧИСЛО. Ступень не хранится рядом с ней, а
 * вычисляется из неё. Хранить оба значило бы завести вторую правду об одном
 * и том же: они расходятся молча и ровно тогда, когда на них перестают
 * смотреть. Тем же приёмом сегмент достаётся только через `segmentOf`.
 *
 * Числа полос сняты с натуры прототипа (design/montage.css, полосы .mt-lane--*)
 * и подтверждены замером в браузере. Все ЦЕЛЫЕ, и это требование, а не
 * совпадение: дробная высота протекает вверх по flex-колонке до
 * .ed-stage-host и роняет e2e про целые размеры сцены (грабля Сессии 18).
 */

/** Полосы, из которых собирается дорожка. */
export type LaneName = 'ruler' | 'sound' | 'slides' | 'stops' | 'words' | 'marks';

/**
 * Ступени сжатия, сверху вниз.
 *
 * `minimal` — это РОВНО сегодняшнее поведение продукта: слайды и остановки
 * одной полосой, как их всегда рисовал MarksLane. Ступень заведена такой
 * намеренно: слитый путь остаётся живым и проверяемым, а не превращается
 * в мёртвый код, который однажды тихо перестанет работать.
 */
export type TrackTier = 'full' | 'compact' | 'dense' | 'minimal';

/** Панель транспорта: играть, часы, ступени масштаба, остановка. */
export const TRANSPORT_H = 40;

/** Высота корешка свёрнутой дорожки: кнопка, имя звука, часы. */
export const COLLAPSED_H = 28;

/** Разделитель между полосами — по одному пикселю, кроме как после последней. */
const SEPARATOR_H = 1;

/**
 * Собственные высоты полос. У звука их две: полная и ужатая. Ужимается
 * первой именно волна — она единственная, чья польза плавно падает
 * с высотой, тогда как метка при 20 px просто перестаёт быть мишенью.
 */
const LANE_H: Readonly<Record<LaneName, number>> = {
  ruler: 24,
  sound: 56,
  slides: 34,
  stops: 34,
  words: 28,
  // Слитая полоса выше разделённой не по прихоти: в ней два ряда меток
  // лежат друг под другом внутри ОДНОГО тела (ed-mark-slide и ed-mark-gate
  // разведены по top), и 34 их не вмещают — сама метка 14 px высотой.
  marks: 40,
};

/** Ужатая волна. Ниже уже не волна, а полоска шума. */
export const SOUND_COMPACT_H = 32;

/** Какие полосы показывает ступень и в каком порядке. */
const TIER_LANES: Readonly<Record<TrackTier, readonly LaneName[]>> = {
  full: ['ruler', 'sound', 'slides', 'stops', 'words'],
  compact: ['ruler', 'sound', 'slides', 'stops', 'words'],
  dense: ['ruler', 'sound', 'slides', 'stops'],
  minimal: ['ruler', 'sound', 'marks'],
};

/** Ступени с ужатой волной. */
const COMPACT_SOUND: ReadonlySet<TrackTier> = new Set<TrackTier>(['compact', 'dense', 'minimal']);

/** Порядок ступеней от просторной к тесной — он же порядок проверки порогов. */
const TIERS_WIDEST_FIRST: readonly TrackTier[] = ['full', 'compact', 'dense', 'minimal'];

export function lanesOf(tier: TrackTier): readonly LaneName[] {
  return TIER_LANES[tier];
}

/** Высота полосы на этой ступени. Волна ужимается, остальные постоянны. */
export function laneHeight(lane: LaneName, tier: TrackTier): number {
  if (lane === 'sound' && COMPACT_SOUND.has(tier)) return SOUND_COMPACT_H;
  return LANE_H[lane];
}

/**
 * Высота ТЕЛА меток: слайды и остановки — две головы, но одно тело.
 *
 * Так уже устроен продукт: `.ed-mark-slide` и `.ed-mark-gate` разведены
 * по `top` внутри одного полотна, а не по двум узлам. Разделять полотно
 * ради двух подписей значило бы переписать жесты перетаскивания метки
 * и ручки стыка — то есть ради вида тронуть то, что к виду не относится.
 *
 * Поэтому «две полосы» здесь — это две ГОЛОВЫ и две высоты, а тело
 * по-прежнему одно и ровно такой суммарной высоты.
 */
export function marksBodyHeight(tier: TrackTier): number {
  if (lanesOf(tier).includes('marks')) return laneHeight('marks', tier);
  return laneHeight('slides', tier) + SEPARATOR_H + laneHeight('stops', tier);
}

/**
 * Наименьшая высота, при которой ступень помещается целиком.
 *
 * Считается сложением, а не записана числом: перечни полос выше — источник
 * истины, и подписанная константа разошлась бы с ними при первой же правке.
 */
export function minHeightOf(tier: TrackTier): number {
  const lanes = lanesOf(tier);
  const lanesTotal = lanes.reduce((sum, lane) => sum + laneHeight(lane, tier), 0);
  return TRANSPORT_H + lanesTotal + SEPARATOR_H * (lanes.length - 1);
}

/** Ниже этого дорожка не тянется — дальше только складывание. */
export const TRACK_MIN_H = minHeightOf('minimal');

/**
 * Выше этого тянуть не даём. Не вкусовщина: дорожка и сцена делят одну
 * колонку, и дорожка, доросшая до окна, оставила бы автора без сцены.
 */
export const TRACK_MAX_H = 480;

/** Высота, с которой дорожка открывается впервые. */
export const TRACK_DEFAULT_H = minHeightOf('full');

/** Ступень, помещающаяся в такую высоту. */
export function trackTier(height: number): TrackTier {
  const fits = TIERS_WIDEST_FIRST.find((tier) => height >= minHeightOf(tier));
  // Ниже самой тесной ступени высота не опускается — её держит clampTrackHeight,
  // а сюда значение приходит уже зажатым. Запасной ответ нужен типу, не логике.
  return fits ?? 'minimal';
}

export function clampTrackHeight(height: number): number {
  return Math.max(TRACK_MIN_H, Math.min(TRACK_MAX_H, Math.round(height)));
}

/**
 * Насколько ниже минимума надо утянуть кромку, чтобы дорожка сложилась.
 *
 * Складывание тягой — приём терминала VS Code, и запас здесь несущий:
 * без него дорожка складывалась бы от дрожания руки на самом минимуме.
 */
export const COLLAPSE_PULL = 24;

/**
 * Куда привести жест тяги: сложить или оставить открытой с такой высотой.
 *
 * Возвращает и то и другое одним значением намеренно — вызывающему нельзя
 * дать возможность применить высоту, забыв про складывание.
 */
export function resolveDrag(rawHeight: number): { collapsed: boolean; height: number } {
  if (rawHeight < TRACK_MIN_H - COLLAPSE_PULL) {
    // Высота запоминается минимальной, а не той, до которой дотянули:
    // разворачивая, автор ждёт увидеть дорожку, а не её же в сложенном виде.
    return { collapsed: true, height: TRACK_MIN_H };
  }
  return { collapsed: false, height: clampTrackHeight(rawHeight) };
}

/**
 * Что ступень НЕ показывает, словами автора.
 *
 * Правило `screens.md` §6 «погашенное управление обязано назвать причину»,
 * применённое к спрятанному: полоса, исчезнувшая от сжатия, обязана сказать
 * о себе, иначе автор считает, что её нет в проекте. Пустая строка — не
 * ответ: `undefined` значит «скрывать нечего», и это разные случаи.
 */
export function hiddenNote(tier: TrackTier): string | undefined {
  switch (tier) {
    case 'full':
    case 'compact':
      return undefined;
    case 'dense':
      return 'Расшифровка скрыта — потяните дорожку выше';
    case 'minimal':
      return 'Слайды и остановки слиты, расшифровка скрыта — потяните дорожку выше';
  }
}
