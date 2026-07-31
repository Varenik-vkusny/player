/**
 * Схема проекта v5 — единственный источник истины.
 *
 * Типы TypeScript выводятся отсюда через z.infer и НИКОГДА не пишутся руками:
 * два описания одной сущности неизбежно разъедутся, причём тихо (см. ADR-004).
 *
 * Инвариант №7: любое изменение схемы = бамп версии + функция миграции +
 * фикстура + тест. Без исключений, даже для «мелкого поля».
 *
 * Три уровня, сверху вниз (ADR-015):
 *
 *   Объяснение    — костяк из сегментов, у некоторых есть ответвления
 *   Сегмент  — линейная последовательность слайдов с одной непрерывной озвучкой
 *   Слайд   — снимок состояния сцены в момент времени, не отдельная страница
 *
 * Два правила продукта выражены здесь ФОРМОЙ, а не проверкой, и потому
 * нарушить их нельзя:
 *
 *   «Гейт никуда не перекидывает» — у `Gate` нет поля для рёбер вообще.
 *   «Развилка только в конце сегмента» — `Exit` есть поле сегмента, и положить
 *   его в середину некуда.
 *
 * Правило, которое невыразимо, дешевле правила, которое надо проверять.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 5;

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

/**
 * Элемент сегмента: КТО это и из чего сделан. Ни геометрии, ни вида.
 *
 * Элементы принадлежат сегменту, а не слайду, и живут через все его слайды
 * под устойчивым `id`. Устойчивость id — условие морфинга: именно по
 * совпадению id соседние слайды понимают, что это один и тот же элемент,
 * который едет, а не разные, один из которых ушёл, а другой пришёл.
 *
 * **Здесь намеренно нет `style`.** Всё визуально изменяемое живёт
 * в `ElementState`. Два непересекающихся списка свойств пришлось бы
 * защищать вечно и решать вкусовщиной вопрос «`color` — это идентичность
 * элемента или его состояние»; пустое множество не пересекается ни с чем
 * по построению. Цена названа честно в planning.md §11.1: смена шрифта
 * задним числом затрагивает все слайды сегмента.
 */
export const ElementSchema = z.object({
  id: Id,
  type: z.enum(['text', 'image', 'shape']),
  content: z.string().default(''),
});

/**
 * Состояние элемента на конкретном слайде: ГДЕ он и КАК выглядит.
 *
 * `width` и `height` неотрицательные, а не положительные: нулевой размер —
 * законное вырожденное состояние, из которого элемент вырастает. Именно
 * в него переводится `scale: 0` старых анимаций при миграции.
 *
 * Разница между «элемента нет в `states`» и `visible: false` — это два
 * РАЗНЫХ перехода, и путать их нельзя (ADR-015):
 *
 *   нет в `states` предыдущего слайда → элемент приходит; предыдущей
 *   позиции не существует, морфинга нет;
 *
 *   `visible: false → true` → элемент проявляется на своём месте; позиция
 *   известна и сохранена, поэтому он может одновременно ехать.
 */
export const ElementStateSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  rotation: z.number().finite().default(0),
  zIndex: z.number().int().default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  style: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

/**
 * Инвариант №8: анимируем только transform, opacity и filter.
 *
 * Кью из версии 2 больше нет, но перечень остался законом — теперь для
 * движка морфинга: это закрытый список того, что ему позволено трогать.
 *
 * Изменение `width`/`height` между слайдами инвариант НЕ нарушает: FLIP
 * анимирует его через `scaleX`/`scaleY`, то есть через `transform`. Модель
 * хранит геометрию, композитор двигает трансформацию.
 */
export const ANIMATABLE = [
  'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'opacity', 'filter',
] as const;

/**
 * Слайд — снимок сцены в момент времени, а не отдельная страница.
 *
 * Хранит не список элементов, а список их состояний, поэтому переход
 * между соседними слайдами вычисляется сам: элемент есть в обоих — едет,
 * только в предыдущем — уходит, только в следующем — приходит.
 *
 * `transition: 'cut'` — намеренный разрыв, который автор выбирает сам.
 */
export const SlideSchema = z.object({
  id: Id,
  at: TimeRefSchema,
  transition: z.enum(['morph', 'cut']).default('morph'),
  states: z.record(Id, ElementStateSchema),
});

/**
 * Условие — размеченное объединение, а не строка-предикат.
 *
 * Смотрит на переменную, записанную гейтом. Переменная может быть записана
 * в ЛЮБОМ сегменте объяснения, не обязательно в этом: ответы живут на всё
 * объяснение, и развилка вправе опереться на то, что зритель отвечал раньше.
 *
 * Объявлено ЗДЕСЬ, а не рядом с выходом сегмента, потому что условие нужно
 * в двух местах сразу: правилу выхода и варианту ответа. Порядок объявления
 * в модуле — не стилистика: `const` не поднимается, и вариант ответа ниже
 * не увидел бы схему, объявленную после него.
 *
 * `compare` несёт оператор ПОЛЕМ, а не отдельным видом на каждый знак:
 * четыре значения в одном селекте стоят столько же, сколько одно,
 * а недостающий знак стоил бы отдельного бампа схемы. → ADR-019
 */
export const ConditionSchema = z.discriminatedUnion('kind', [
  /** Ответ равен конкретному значению: для выбора — id варианта. */
  z.object({ kind: z.literal('equals'), variable: Id, value: z.string() }),
  /** Ответ НЕ равен значению. Обещано `product.md` §2 как «≠». */
  z.object({ kind: z.literal('notEquals'), variable: Id, value: z.string() }),
  z.object({ kind: z.literal('correct'), variable: Id }),
  z.object({ kind: z.literal('wrong'), variable: Id }),
  /**
   * Сравнение с числом. Значение переменной — строка (id варианта), поэтому
   * приведение к числу может не удаться; это не ошибка, а «условие не подошло».
   */
  z.object({
    kind: z.literal('compare'),
    variable: Id,
    op: z.enum(['gt', 'gte', 'lt', 'lte']),
    value: z.number().finite(),
  }),
]);

/**
 * Список условий, соединяемых через И.
 *
 * Непустой намеренно: правило без условий — это `default`, а он уже есть
 * отдельным полем. Два способа сказать одно и то же неизбежно разъезжаются.
 *
 * ИЛИ здесь нет и не будет: оно получается бесплатно СЛЕДУЮЩИМ правилом,
 * потому что правила проверяются по порядку и выигрывает первое подошедшее.
 * Скобок тоже нет — с ними это перестаёт быть языком автора.
 */
export const ConditionsSchema = z.array(ConditionSchema).min(1);

/**
 * Выбор из вариантов — и то место, где различаются две остановки продукта.
 *
 * `correctId: null` значит «верного ответа нет»: это РАЗВИЛКА, где ветки
 * равноправны, а не вопрос, на который можно ответить неверно. До версии 4
 * поле было обязательным, поэтому развилка была вынуждена назначать
 * «правильную» ветку — ложь, которая доезжала до данных и была видна
 * в `fixtures/projects/exit-branch.json`.
 *
 * Различие выражено ЗНАЧЕНИЕМ, а не отдельным флагом вида остановки:
 * флаг можно рассогласовать с `correctId`, а `null` рассогласовать не с чем.
 */
const ChoiceConfig = z.object({
  kind: z.literal('choice'),
  prompt: z.string(),
  /**
   * `when` — необязательное условие показа. Вариант виден зрителю, только
   * если условие подошло; без `when` вариант виден всегда.
   *
   * Проверки «хотя бы один безусловный» и «верный ответ безусловен» стоят
   * не здесь, а в `.refine` на `GateSchema`: `.refine` превращает объект
   * в `ZodEffects`, а `discriminatedUnion` принимает только `ZodObject`.
   */
  options: z.array(z.object({ id: Id, label: z.string(), when: ConditionsSchema.optional() })).min(2),
  correctId: Id.nullable(),
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

/**
 * Гейт — остановка ВНУТРИ сегмента. Плеер встаёт, зритель отвечает, плеер
 * едет дальше по той же дорожке.
 *
 * **Гейт никуда не перекидывает.** Рёбер у него нет и быть не может: поля
 * для них здесь просто не существует. Всё, что гейт делает с ответом, —
 * записывает его в переменную `recordAs`. Решение о следующем сегменте
 * принимает `Exit` на выходе.
 *
 * `onWrong` описывает, что зритель увидит при неверном ответе, прежде чем
 * поехать дальше:
 *
 *   `inline-explain` — разбор слоем поверх сцены, не покидая сегмент;
 *   `inline-hint`    — короткая подсказка тем же способом;
 *   `retry`          — дать ответить заново;
 *   `continue`       — не показывать ничего.
 *
 * `continue` добавлен сверх трёх видов из задания: без него каждый неверный
 * ответ обязан был бы что-то показать, а «промолчать и ехать дальше» —
 * законный и частый выбор автора. Это же значение носили гейты версии 2,
 * и без него миграция теряла бы данные там, где терять их незачем.
 */
export const GateSchema = z
  .object({
    id: Id,
    at: TimeRefSchema,
    config: z.discriminatedUnion('kind', [ChoiceConfig, InputConfig, ContinueConfig]),
    onWrong: z.enum(['inline-hint', 'inline-explain', 'retry', 'continue']).default('retry'),
    maxAttempts: z.number().int().positive().nullable().default(null),
    /** Имя переменной зрителя, в которую записывается ответ. */
    recordAs: Id,
  })
  .refine(
    (gate) => {
      // Локальная переменная нужна не для красоты: внутри колбэка сужение
      // размеченного объединения по gate.config теряется.
      const config = gate.config;
      if (config.kind !== 'choice') return true;
      // Развилка: верного ответа нет, и указывать ему на вариант незачем.
      if (config.correctId === null) return true;
      return config.options.some((option) => option.id === config.correctId);
    },
    { message: 'correctId должен указывать на один из вариантов' },
  )
  .refine(
    (gate) => {
      const config = gate.config;
      if (config.kind !== 'choice') return true;
      return config.options.some((option) => option.when === undefined);
    },
    {
      message:
        'Хотя бы один вариант ответа обязан быть безусловным: '
        + 'иначе при неудачном наборе переменных скроются все, '
        + 'и зритель упрётся в вопрос без ответов',
    },
  )
  .refine(
    (gate) => {
      const config = gate.config;
      if (config.kind !== 'choice') return true;
      if (config.correctId === null) return true;
      const correct = config.options.find((option) => option.id === config.correctId);
      // Отсутствие варианта ловит проверка выше — здесь молчим, чтобы автор
      // получил одну внятную причину, а не две сразу об одном и том же.
      return correct === undefined || correct.when === undefined;
    },
    {
      message:
        'Верный вариант ответа не может быть условным: '
        + 'спрятав его условием, автор делает вопрос непроходимым молча',
    },
  );

/**
 * Правило выхода: набор условий через И и куда вести, если все подошли.
 *
 * До версии 5 условие было ровно одно, и «ответил A и ответил B» выразить
 * было нечем — приходилось бы заводить служебную часть без содержимого
 * только ради логики. → ADR-019
 */
export const ExitRuleSchema = z.object({
  id: Id,
  when: ConditionsSchema,
  goto: Id,
});

/**
 * Выход сегмента — единственное место, где принимается решение о следующем
 * сегменте. Правила проверяются по порядку, первое подошедшее выигрывает.
 *
 * `default: null` — концовка объяснения. Это основной случай, а не краевой:
 * именно такой выход получает сегмент после миграции с версии 2.
 */
export const ExitSchema = z.object({
  rules: z.array(ExitRuleSchema).default([]),
  default: Id.nullable().default(null),
});

/**
 * Сегмент — единица линейности: одна непрерывная аудиодорожка, известная
 * длительность, внутри только гейты и никаких развилок.
 */
export const SegmentSchema = z.object({
  id: Id,
  title: z.string().default(''),
  audio: z.object({
    src: z.string().min(1),
    /**
     * С какой секунды ФАЙЛА начинается дорожка этой части. Появилось в версии 4.
     *
     * Продуктовое решение [Р] «аудио физически не режется» до сих пор нигде
     * не было выражено: часть и файл были склеены один к одному, и разрезать
     * повествование на развилке было попросту нечем. Окно разлепляет их —
     * несколько частей ссылаются на один файл разными участками.
     *
     * **Смещение НЕ меняет систему координат части.** Слова транскрипта,
     * `TimeRef`, слайды и гейты по-прежнему считаются от нуля этой части,
     * а `duration` — длина окна, а не остаток файла. Иначе пришлось бы
     * переписать всё, что считает время, и потерять правило «первый слайд
     * стоит на нуле». Смещение знает только тот, кто заводит воспроизведение.
     */
    offset: NonNegative.default(0),
    duration: z.number().finite().positive(),
    /** Всегда присутствует. Пустой массив делает невалидной любую ссылку на слово. */
    words: z.array(WordSchema),
  }),
  elements: z.array(ElementSchema),
  /** Не меньше одного: без слайда сегменту нечего показывать. */
  slides: z.array(SlideSchema).min(1),
  gates: z.array(GateSchema).default([]),
  exit: ExitSchema,
});

/** Объяснение — костяк из сегментов. В интерфейсе это оглавление, а не доска нодов. */
export const __LESSON_REMOVED__ = z.object({
  entry: Id,
  segments: z.array(SegmentSchema).min(1),
});

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    meta: z.object({
      title: z.string(),
      stageWidth: z.number().int().positive().default(1920),
      stageHeight: z.number().int().positive().default(1080),
    }),
    /** Сегмент, с которого начинается объяснение. Явно, а не «первый в массиве». */
    entry: Id,
    segments: z.array(SegmentSchema).min(1),
  })
  .superRefine((project, ctx) => {
    const { segments, entry } = project;
    const segmentIds = new Set(segments.map((segment) => segment.id));

    if (segmentIds.size !== segments.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['segments'],
        message: 'Идентификатор сегмента повторяется',
      });
    }

    if (!segmentIds.has(entry)) {
      ctx.addIssue({
        code: 'custom',
        path: ['entry'],
        message: `Стартовый сегмент «${entry}» не существует`,
      });
    }

    // Переменные зрителя живут на всё объяснение, поэтому собираются заранее:
    // выход сегмента вправе опереться на ответ, данный в предыдущем сегменте.
    const variables = new Map<
      string,
      { kind: string; segmentId: string; optionIds: readonly string[]; isFork: boolean }
    >();
    for (const segment of segments) {
      for (const gate of segment.gates) {
        const known = variables.get(gate.recordAs);
        if (known) {
          ctx.addIssue({
            code: 'custom',
            path: ['segments'],
            message: `Переменная «${gate.recordAs}» записывается дважды: `
              + `в сегменте «${known.segmentId}» и в «${segment.id}». `
              + 'Второй ответ затёр бы первый, и правило выхода стало бы неоднозначным.',
          });
          continue;
        }
        const config = gate.config;
        variables.set(gate.recordAs, {
          kind: config.kind,
          segmentId: segment.id,
          optionIds: config.kind === 'choice' ? config.options.map((o) => o.id) : [],
          isFork: config.kind === 'choice' && config.correctId === null,
        });
      }
    }

    segments.forEach((segment, s) => {
      const at = (...rest: (string | number)[]) => ['segments', s, ...rest];
      const elementIds = new Set(segment.elements.map((e) => e.id));
      const wordCount = segment.audio.words.length;

      if (elementIds.size !== segment.elements.length) {
        ctx.addIssue({
          code: 'custom',
          path: at('elements'),
          message: `Сегмент «${segment.id}»: идентификатор элемента повторяется`,
        });
      }

      /** Секунды ссылки, если их можно узнать не глядя на транскрипт. */
      const checkTimeRef = (
        ref: z.infer<typeof TimeRefSchema>,
        path: (string | number)[],
      ): number | undefined => {
        if (ref.kind === 'seconds') {
          if (ref.t > segment.audio.duration) {
            ctx.addIssue({
              code: 'custom',
              path,
              message: `Время ${ref.t} с выходит за длительность дорожки ${segment.audio.duration} с`,
            });
          }
          return ref.t;
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
          return undefined;
        }
        const word = segment.audio.words[ref.wordIndex]!;
        return word.start + ref.offset;
      };

      // --- слайды ---

      // Пустой список слайдов уже отмечен `.min(1)`, но superRefine всё равно
      // выполняется: Zod не прекращает проверку после провала вложенной.
      // Без этого возврата валидатор упал бы собственным TypeError — то есть
      // вместо списка проблем автор получил бы падение.
      const first = segment.slides[0];
      if (!first) return;

      if (first.at.kind !== 'seconds' || first.at.t !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: at('slides', 0, 'at'),
          message: `Сегмент «${segment.id}»: первый слайд обязан стоять на нуле `
            + '({ kind: "seconds", t: 0 }). Привязка нулевого кадра к слову сделала бы '
            + 'начальный вид сегмента зависимым от транскрипта.',
        });
      }

      const slideIds = new Set<string>();
      let previous = -Infinity;
      segment.slides.forEach((slide, i) => {
        if (slideIds.has(slide.id)) {
          ctx.addIssue({
            code: 'custom',
            path: at('slides', i, 'id'),
            message: `Сегмент «${segment.id}»: идентификатор слайда «${slide.id}» повторяется`,
          });
        }
        slideIds.add(slide.id);

        const seconds = checkTimeRef(slide.at, at('slides', i, 'at'));

        if (seconds !== undefined) {
          if (seconds < previous) {
            ctx.addIssue({
              code: 'custom',
              path: at('slides', i, 'at'),
              message: `Сегмент «${segment.id}»: слайды идут не по порядку — `
                + `${seconds.toFixed(3)} с после ${previous.toFixed(3)} с`,
            });
          } else if (seconds === previous) {
            ctx.addIssue({
              code: 'custom',
              path: at('slides', i, 'at'),
              message: `Сегмент «${segment.id}»: два слайда на одной секунде `
                + `(${seconds.toFixed(3)}) — какой из них показывать, неизвестно`,
            });
          }
          previous = seconds;
        }

        for (const elementId of Object.keys(slide.states)) {
          if (!elementIds.has(elementId)) {
            ctx.addIssue({
              code: 'custom',
              path: at('slides', i, 'states', elementId),
              message: `Слайд «${slide.id}» задаёт состояние элемента «${elementId}», `
                + 'которого нет в сегменте',
            });
          }
        }
      });

      // --- гейты ---

      segment.gates.forEach((gate, i) => {
        checkTimeRef(gate.at, at('gates', i, 'at'));
      });

      // --- выход ---

      const ruleIds = new Set<string>();
      segment.exit.rules.forEach((rule, i) => {
        const path = at('exit', 'rules', i);

        if (ruleIds.has(rule.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'id'],
            message: `Сегмент «${segment.id}»: идентификатор правила «${rule.id}» повторяется`,
          });
        }
        ruleIds.add(rule.id);

        if (!segmentIds.has(rule.goto)) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'goto'],
            message: `Правило выхода ведёт в несуществующий сегмент «${rule.goto}»`,
          });
        }

        // Условий у правила теперь список, соединённый через И, и КАЖДОЕ
        // из них обязано быть осмысленным по отдельности: одно бессмысленное
        // условие в цепочке делает недостижимой всю цепочку.
        rule.when.forEach((condition, conditionIndex) => {
          const wherePath = [...path, 'when', conditionIndex];
          const source = variables.get(condition.variable);
          if (!source) {
            ctx.addIssue({
              code: 'custom',
              path: [...wherePath, 'variable'],
              message: `Правило выхода смотрит на переменную «${condition.variable}», `
                + 'которую не записывает ни один гейт объяснения',
            });
            return;
          }

          // У развилки нет верного ответа, поэтому вердикт о нём невозможен.
          // Без этой проверки правило `correct` на переменной развилки прошло бы
          // загрузку и никогда не сработало: сравнивать ответ было бы не с чем,
          // то есть ветка оказалась бы недостижимой навсегда при валидном
          // проекте — ровно тот род дефекта, который уже ловится ниже для
          // исчезнувшего варианта.
          if ((condition.kind === 'correct' || condition.kind === 'wrong') && source.isFork) {
            ctx.addIssue({
              code: 'custom',
              path: wherePath,
              message: `Переменная «${condition.variable}» записана развилкой: верного ответа `
                + 'у неё нет, и вердикт «верно»/«неверно» о ней невозможен. '
                + 'Сравнивайте с конкретным вариантом.',
            });
          }

          if (
            (condition.kind === 'equals' || condition.kind === 'notEquals')
            && source.kind === 'continue'
          ) {
            ctx.addIssue({
              code: 'custom',
              path: wherePath,
              message: `Переменная «${condition.variable}» пишется гейтом вида continue: `
                + 'у него один исход, и сравнивать её значение не с чем',
            });
          }

          // Значение сравнения обязано быть настоящим вариантом гейта.
          //
          // Без этой проверки автор убирает вариант из вопроса, правило выхода
          // остаётся указывать на исчезнувший `optionId`, и ветка становится
          // недостижимой НАВСЕГДА — при полностью валидном проекте. Это ровно
          // тот дефект, который приёмка Сессии 5 нашла у рёбер версии 2
          // («правка гейта осиротляла ребро»), и версия 2 его ловила. Потерять
          // проверку при смене формы значило бы сделать схему слабее
          // предшественницы, ничего об этом не сказав.
          //
          // У `notEquals` тот же изъян зеркален: сравнение с несуществующим
          // вариантом верно ВСЕГДА, то есть условие ничего не отбирает и лишь
          // притворяется, что отбирает. Дефект тише первого и потому опаснее.
          if (
            (condition.kind === 'equals' || condition.kind === 'notEquals')
            && source.kind === 'choice'
            && !source.optionIds.includes(condition.value)
          ) {
            ctx.addIssue({
              code: 'custom',
              path: [...wherePath, 'value'],
              message: `Правило выхода сравнивает «${condition.variable}» со значением `
                + `«${condition.value}», которого нет среди вариантов гейта. `
                + (condition.kind === 'equals'
                  ? 'Эта ветка недостижима навсегда.'
                  : 'Такое условие выполняется всегда и ничего не отбирает.'),
            });
          }
        });
      });

      if (segment.exit.default !== null && !segmentIds.has(segment.exit.default)) {
        ctx.addIssue({
          code: 'custom',
          path: at('exit', 'default'),
          message: `Выход по умолчанию ведёт в несуществующий сегмент «${segment.exit.default}»`,
        });
      }

      // Выход обязан быть ТОТАЛЬНЫМ: при любом состоянии ответов зрителю есть
      // куда идти. Иначе получаем дыру, доезжающую до зрителя, — ответ
      // не подошёл ни под одно правило, а дальше некуда.
      //
      // Это прямой наследник правила полного покрытия из ADR-013, и способов
      // быть тотальным ровно два. Первый — запасной выход. Второй — правила
      // сами исчерпывают исходы одной переменной: либо покрыты все варианты
      // гейта с выбором, либо взяты оба исхода «верно» и «неверно». Требовать
      // `default` там, где покрытие уже полное, значило бы заставлять автора
      // называть заведомо недостижимый сегмент.
      if (segment.exit.rules.length > 0 && segment.exit.default === null) {
        // Покрытие доказуемо только у правил с ОДНИМ условием.
        //
        // Цепочка через И сужает, а не покрывает: чтобы доказать, что несколько
        // пересечений вместе исчерпывают все исходы, нужен решатель. Решатель
        // внутри схемы проекта — не та цена, которую стоит платить за право
        // не писать запасной выход. Поэтому появление второго условия хотя бы
        // у одного правила делает `default` обязательным, и это ужесточение
        // относительно версии 4 названо намеренно.
        const single = segment.exit.rules.every((rule) => rule.when.length === 1);
        const only = single ? segment.exit.rules.map((rule) => rule.when[0]!) : [];
        const byVariable = new Set(only.map((condition) => condition.variable));
        const kinds = new Set(only.map((condition) => condition.kind));
        let total = false;

        if (single && byVariable.size === 1) {
          const variable = [...byVariable][0]!;
          const source = variables.get(variable);
          if (kinds.has('correct') && kinds.has('wrong')) {
            total = true;
          } else if (source && kinds.size === 1 && kinds.has('equals')) {
            const covered = new Set(
              only.map((condition) => (condition.kind === 'equals' ? condition.value : '')),
            );
            total = source.optionIds.length > 0
              && source.optionIds.every((id) => covered.has(id));
          }
        }

        if (!total) {
          ctx.addIssue({
            code: 'custom',
            path: at('exit', 'default'),
            message: `Сегмент «${segment.id}»: правила выхода не покрывают все исходы, `
              + 'а запасного выхода нет. Ответ, не подошедший ни под одно правило, '
              + 'привёл бы зрителя в тупик. Задайте default, либо покройте правилами '
              + 'все варианты одного гейта, либо возьмите оба исхода «верно» и «неверно».',
          });
        }
      }
    });
  });

export type Word = z.infer<typeof WordSchema>;
export type WordAnchor = z.infer<typeof WordAnchorSchema>;
export type TimeRef = z.infer<typeof TimeRefSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type ElementState = z.infer<typeof ElementStateSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Gate = z.infer<typeof GateSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type ExitRule = z.infer<typeof ExitRuleSchema>;
export type Exit = z.infer<typeof ExitSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Project = z.infer<typeof ProjectSchema>;
