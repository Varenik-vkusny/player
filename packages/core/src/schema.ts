/**
 * Схема проекта v2 — единственный источник истины.
 *
 * Типы TypeScript выводятся отсюда через z.infer и НИКОГДА не пишутся руками:
 * два описания одной сущности неизбежно разъедутся, причём тихо (см. ADR-004).
 *
 * Инвариант №7: любое изменение схемы = бамп версии + функция миграции +
 * фикстура + тест. Без исключений, даже для «мелкого поля».
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 2;

/** Идентификатор внутри проекта. Непустая строка без пробелов по краям. */
const Id = z.string().min(1).refine((v) => v === v.trim(), {
  message: 'Идентификатор не должен начинаться или заканчиваться пробелом',
});

const NonNegative = z.number().finite().nonnegative();

/**
 * Слово транскрипта.
 *
 * `source` — не украшение. Спайк S5 показал, что разные инструменты дают
 * систематически разные границы: edge-tts раньше реального звука на 43–95 мс,
 * Deepgram позже на 30–98 мс, MFA в пределах 25–90 мс. Без пометки об источнике
 * через месяц нельзя отличить гарантированный тайминг от угаданного,
 * а доверие к ним разное.
 */
export const WordSchema = z
  .object({
    text: z.string().min(1),
    start: NonNegative,
    end: NonNegative,
    source: z.enum(['alignment', 'tts', 'manual']),
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine((w) => w.end >= w.start, {
    message: 'Конец слова не может быть раньше начала',
  });

/**
 * Якорь слова: как узнать, что метка всё ещё указывает на то же слово,
 * после того как автор поправил текст или сменил голос (см. ADR-008).
 */
export const WordAnchorSchema = z.object({
  text: z.string().min(1),
  before: z.string(),
  after: z.string(),
});

/**
 * Ссылка на момент времени — размеченное объединение.
 *
 * Именно объединение, а не число с необязательным полем: так невозможно
 * состояние «указаны и секунды, и слово, и они противоречат друг другу»,
 * а компилятор заставляет обработать оба случая везде, где время используется.
 */
export const TimeRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('seconds'),
    t: NonNegative,
  }),
  z.object({
    kind: z.literal('word'),
    wordIndex: z.number().int().nonnegative(),
    /** Смещение от начала слова, секунды. Может быть отрицательным. */
    offset: z.number().finite(),
    anchor: WordAnchorSchema,
  }),
]);

export const ElementSchema = z.object({
  id: Id,
  type: z.enum(['text', 'image', 'shape', 'group']),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  rotation: z.number().finite().default(0),
  zIndex: z.number().int().default(0),
  style: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  content: z.string().default(''),
});

/**
 * Спецификация анимации.
 *
 * Инвариант №8: анимируем только transform, opacity и filter. Здесь это
 * выражено закрытым перечислением, а не соглашением: свойство вне списка
 * не пройдёт валидацию и упадёт на загрузке.
 */
export const ANIMATABLE = [
  'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'opacity', 'filter',
] as const;

export const AnimationSpecSchema = z.object({
  property: z.enum(ANIMATABLE),
  from: z.union([z.number(), z.string()]).optional(),
  to: z.union([z.number(), z.string()]),
  duration: z.number().finite().positive(),
  ease: z.string().default('inOutQuad'),
});

export const CueSchema = z.object({
  id: Id,
  at: TimeRefSchema,
  targetId: Id,
  animation: AnimationSpecSchema,
});

const ChoiceConfig = z.object({
  kind: z.literal('choice'),
  prompt: z.string(),
  options: z.array(z.object({ id: Id, label: z.string() })).min(2),
  correctId: Id,
});

const InputConfig = z.object({
  kind: z.literal('input'),
  prompt: z.string(),
  accept: z.array(z.string().min(1)).min(1),
  caseSensitive: z.boolean().default(false),
});

const ContinueConfig = z.object({
  kind: z.literal('continue'),
  label: z.string().default('Дальше'),
});

export const GateSchema = z
  .object({
    id: Id,
    at: TimeRefSchema,
    config: z.discriminatedUnion('kind', [ChoiceConfig, InputConfig, ContinueConfig]),
    onWrong: z.enum(['retry', 'reveal', 'continue']).default('retry'),
    maxAttempts: z.number().int().positive().nullable().default(null),
  })
  .refine(
    (gate) => {
      // Локальная переменная нужна не для красоты: внутри колбэка сужение
      // размеченного объединения по gate.config теряется.
      const config = gate.config;
      if (config.kind !== 'choice') return true;
      return config.options.some((option) => option.id === config.correctId);
    },
    { message: 'correctId должен указывать на один из вариантов' },
  );

export const SceneSchema = z.object({
  elements: z.array(ElementSchema),
  cues: z.array(CueSchema),
  gates: z.array(GateSchema),
});

export const AudioSchema = z.object({
  src: z.string().min(1),
  duration: z.number().finite().positive(),
  /** Всегда присутствует. Пустой массив делает невалидной любую ссылку на слово. */
  words: z.array(WordSchema),
});

/**
 * Условие перехода по ребру — размеченное объединение, а не строка-предикат.
 *
 * Объединение, чтобы редактор мог собрать ребро выпадающим списком, а схема
 * проверила, что gateId и optionId существуют. Строка-предикат сделала бы
 * ветвление кодом внутри данных.
 */
export const EdgeWhenSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), gateId: Id, optionId: Id }),
  z.object({ kind: z.literal('correct'), gateId: Id }),
  z.object({ kind: z.literal('wrong'), gateId: Id }),
  /** Узел доиграл до конца. Не более одного на узел. */
  z.object({ kind: z.literal('end') }),
]);

export const EdgeSchema = z.object({
  id: Id,
  to: Id,
  when: EdgeWhenSchema,
});

/**
 * Узел графа: своя озвучка, своя сцена, свои исходящие рёбра.
 *
 * Рёбра лежат здесь, а не общим списком в корне: ребро выбирается только пока
 * играет этот узел, и удаление узла обязано быть локальной операцией.
 *
 * Назван `SegmentNode`, а не `Node`, намеренно: `Node` — глобальный DOM-тип,
 * и в редакторе он живой (`target instanceof Node` в StageView). Импорт
 * одноимённого типа из ядра затенил бы его в том файле, где он нужен.
 */
export const SegmentNodeSchema = z.object({
  id: Id,
  title: z.string().default(''),
  audio: AudioSchema,
  scene: SceneSchema,
  edges: z.array(EdgeSchema).default([]),
});

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    meta: z.object({
      title: z.string(),
      stageWidth: z.number().int().positive().default(1920),
      stageHeight: z.number().int().positive().default(1080),
    }),
    /** Узел, с которого начинается объяснение. Явно, а не «первый в массиве». */
    entry: Id,
    nodes: z.array(SegmentNodeSchema).min(1),
  })
  .superRefine((project, ctx) => {
    project.nodes.forEach((node, n) => {
      const elementIds = new Set(node.scene.elements.map((e) => e.id));
      const wordCount = node.audio.words.length;

      const checkTimeRef = (ref: z.infer<typeof TimeRefSchema>, path: (string | number)[]) => {
        if (ref.kind === 'seconds') {
          if (ref.t > node.audio.duration) {
            ctx.addIssue({
              code: 'custom',
              path,
              message: `Время ${ref.t} с выходит за длительность дорожки ${node.audio.duration} с`,
            });
          }
          return;
        }
        // Ссылка на слово при пустом транскрипте невалидна — падаем на загрузке,
        // а не в рантайме, когда до этой метки доедет воспроизведение.
        if (ref.wordIndex >= wordCount) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: wordCount === 0
              ? 'Ссылка на слово при пустом транскрипте'
              : `Слово №${ref.wordIndex} отсутствует, всего слов ${wordCount}`,
          });
        }
      };

      node.scene.cues.forEach((cue, i) => {
        checkTimeRef(cue.at, ['nodes', n, 'scene', 'cues', i, 'at']);
        if (!elementIds.has(cue.targetId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', n, 'scene', 'cues', i, 'targetId'],
            message: `Анимация ссылается на несуществующий элемент «${cue.targetId}»`,
          });
        }
      });

      node.scene.gates.forEach((gate, i) => {
        checkTimeRef(gate.at, ['nodes', n, 'scene', 'gates', i, 'at']);
      });
    });
  });

export type Word = z.infer<typeof WordSchema>;
export type WordAnchor = z.infer<typeof WordAnchorSchema>;
export type TimeRef = z.infer<typeof TimeRefSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type AnimationSpec = z.infer<typeof AnimationSpecSchema>;
export type Cue = z.infer<typeof CueSchema>;
export type Gate = z.infer<typeof GateSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Audio = z.infer<typeof AudioSchema>;
export type EdgeWhen = z.infer<typeof EdgeWhenSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type SegmentNode = z.infer<typeof SegmentNodeSchema>;
export type Project = z.infer<typeof ProjectSchema>;
