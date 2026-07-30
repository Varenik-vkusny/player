/**
 * Настройка гейта — чистая логика, без React и DOM.
 *
 * Держит правила панели выделенной метки (см.
 * docs/superpowers/specs/2026-07-28-editor-authoring-design.md, раздел
 * «Срез 3: настройка гейта»), которые обязаны пережить переписку интерфейса:
 * смена вида без потери совместимых полей, минимумы схемы для choice/input,
 * переназначение correctId при удалении варианта, привязка варианта
 * к элементу сцены (ADR-011). Компонент панели только вызывает эти функции
 * и кладёт результат в редьюсер через `updateGate` — сам файл про React
 * и про то, как гейт попадает в проект, не знает.
 */
import type { Gate, Slide, TimeRef, Word } from '@player/core';
import { resolveTimeRef } from '@player/core';
import { morphSecondsFor } from '@player/player';

import { freeId } from './elements.js';

type GateConfig = Gate['config'];
type ChoiceConfig = Extract<GateConfig, { kind: 'choice' }>;
type InputConfig = Extract<GateConfig, { kind: 'input' }>;

/** Заготовка принимаемого ответа — автор тут же впишет настоящий. */
const DEFAULT_ACCEPT = 'ответ';

/**
 * Создаёt новый гейт вида «дальше» — то, с чего начинается любая метка,
 * которую автор только что поставил на дорожку.
 *
 * `recordAs` схема требует всегда (`GateSchema.recordAs: Id`), и это не
 * педантизм: имя переменной обязано быть известно сразу, потому что правило
 * выхода сегмента (`state/exits.ts`, `connect`) ссылается на него по имени.
 * Значением берётся id самого гейта — свободный идентификатор уже посчитан
 * вызывающим (панелью меток) через `freeId('gate', ...)`, и заводить для
 * переменной отдельное имя автору в момент создания нечем: он ещё не решил,
 * как её называть. Переименовать переменную (сменить `recordAs`) эта функция
 * не даёт — это отдельная операция уровня `updateGate`, не создания.
 */
/**
 * Попал ли гейт ВНУТРЬ перехода между слайдами.
 *
 * Продукт такой гейт не роняет: product.md §3 [Р] говорит, что переход
 * будет доведён до конечного состояния мгновенно, и зритель увидит
 * законную картинку. Но для АВТОРА это почти всегда промах расстановки:
 * он ставил вопрос к тому, что сейчас едет по экрану, а зритель увидит
 * уже приехавшее. Поэтому редактор предупреждает, а не запрещает.
 *
 * Ровно на секунде начала перехода — это НЕ «внутри»: там переход ещё
 * не начинался, и доводить нечего. Ровно на секунде конца — тоже нет.
 *
 * Расписание берётся из `morphSecondsFor` плеера, а не считается заново:
 * два описания одного правила разошлись бы тихо, и первым разошлось бы
 * урезание перехода по расстоянию до следующего слайда.
 */
export function gateInsideTransition(
  gate: Gate,
  slides: readonly Slide[],
  words: readonly Word[],
): boolean {
  const at = resolveTimeRef(gate.at, words);
  const seconds = slides.map((slide) => resolveTimeRef(slide.at, words));

  return slides.some((slide, index) => {
    const duration = morphSecondsFor(slide.transition, index, seconds);
    if (duration <= 0) return false;
    const start = seconds[index]!;
    return at > start && at < start + duration;
  });
}

export function createGate(id: string, at: TimeRef): Gate {
  return {
    id,
    at,
    config: { kind: 'continue', label: 'Дальше' },
    onWrong: 'retry',
    maxAttempts: null,
    recordAs: id,
  };
}

/**
 * Текущий вопрос гейта, если он у него есть.
 *
 * `undefined` у `continue` — не пробел в реализации, а точный ответ:
 * в этом виде гейта вопроса нет и никогда не было (кнопка «Дальше» ничего
 * не спрашивает). Это специально не пустая строка: пустая строка — законный
 * вопрос, который автор мог осознанно оставить пустым у choice/input,
 * а `undefined` значит «спрашивать нечего в принципе».
 *
 * `Gate` не хранит ничего сверх схемы — ни здесь, ни где-либо ещё в этом
 * модуле. Более ранняя версия прятала «вопрос» в служебном поле прямо
 * на объекте гейта, рассчитывая, что `GateSchema` (без `.strict()`) молча
 * отбросит его при загрузке. Это было решение вокруг отсутствия решения:
 * `serializeProject` (`state/save.ts`) сериализует ИСХОДНЫЙ объект,
 * а через схему прогоняет только его копию для проверки — значит служебное
 * поле уходило в файл автора целиком, и валидация не могла это заметить.
 * Память о введённом тексте — состояние редактора (кто настраивает панель
 * гейта), а не данные проекта: вызывающий сам достаёт текст этой функцией
 * до переключения на `continue` и передаёт обратно третьим параметром
 * `setGateKind`, когда возвращается на choice/input.
 */
export function promptOf(gate: Gate): string | undefined {
  const config = gate.config;
  if (config.kind === 'choice' || config.kind === 'input') return config.prompt;
  return undefined;
}

/**
 * Два варианта-заготовки для свежего `choice`. Не пустой список и не один
 * элемент: схема требует минимум два варианта (`ChoiceConfig.options.min(2)`),
 * значит гейт, который автор ещё не успел довести до ума, обязан быть
 * валиден в момент создания, а не после первого добавления варианта.
 */
function makeDefaultOptions(): readonly [{ id: string; label: string }, { id: string; label: string }] {
  const first = { id: freeId('option', []), label: 'Вариант 1' };
  const second = { id: freeId('option', [first]), label: 'Вариант 2' };
  return [first, second];
}

function requireChoice(gate: Gate, action: string): ChoiceConfig {
  const config = gate.config;
  if (config.kind !== 'choice') {
    throw new Error(`${action} можно только у гейта вида «выбор»`);
  }
  return config;
}

function requireInput(gate: Gate, action: string): InputConfig {
  const config = gate.config;
  if (config.kind !== 'input') {
    throw new Error(`${action} можно только у гейта вида «ввод»`);
  }
  return config;
}

/**
 * Меняет вид гейта.
 *
 * Что переносится и почему:
 * - `prompt` — общий по смыслу «вопрос» для choice и input. Если у текущего
 *   гейта он уже есть (`promptOf(gate)` — то есть гейт сейчас choice или
 *   input), используется он: переключение choice ↔ input не должно
 *   заставлять автора печатать вопрос заново. Если своего вопроса нет
 *   (гейт сейчас `continue`), в дело идёт `rememberedPrompt` — его обязан
 *   принести вызывающий, обычно доставший его через `promptOf` ДО того,
 *   как переключил гейт на `continue`. Это осознанно внешний параметр,
 *   а не скрытое состояние на самом `Gate` (см. `promptOf` — там разбор,
 *   почему прежняя версия со скрытым полем была багом, а не решением):
 *   память о введённом тексте — забота панели гейта, которая и так живёт
 *   ровно столько, сколько гейт открыт.
 * - `id`, `at`, `onWrong`, `maxAttempts` — не о виде гейта, а о метке и её
 *   поведении при ошибке; сохраняются через spread автоматически.
 *
 * Что НЕ переносится никогда, даже между choice и input напрямую:
 * варианты, correctId, accept, caseSensitive. Это разные по смыслу поля
 * (принимаемая строка — не подпись варианта), и молчаливый перенос значения
 * из одного в другое дал бы не «удобство», а гейт, в котором автор не
 * понимает, откуда взялось странное значение. Каждый вход в choice или
 * input строит минимальный валидный набор с нуля (см. makeDefaultOptions,
 * DEFAULT_ACCEPT) — схема требует минимум два варианта и минимум один
 * принимаемый ответ, и она не должна иметь шанса не пройти ни на одно
 * мгновение.
 *
 * Смена на тот же вид — no-op, гейт возвращается тем же объектом по ссылке.
 */
export function setGateKind(
  gate: Gate,
  kind: 'continue' | 'choice' | 'input',
  rememberedPrompt?: string,
): Gate {
  if (gate.config.kind === kind) return gate;

  if (kind === 'continue') {
    return { ...gate, config: { kind: 'continue', label: 'Дальше' } };
  }

  const prompt = promptOf(gate) ?? rememberedPrompt ?? '';

  if (kind === 'choice') {
    const [first, second] = makeDefaultOptions();
    return {
      ...gate,
      config: { kind: 'choice', prompt, options: [first, second], correctId: first.id },
    };
  }

  return {
    ...gate,
    config: { kind: 'input', prompt, accept: [DEFAULT_ACCEPT], caseSensitive: false },
  };
}

/**
 * Правит вопрос гейта choice/input. У continue вопроса нет физически —
 * это ошибка вызова (панель обязана скрыть поле для этого вида), а не повод
 * тихо проигнорировать правку.
 */
export function setPrompt(gate: Gate, prompt: string): Gate {
  const config = gate.config;
  if (config.kind === 'continue') {
    throw new Error('У гейта «Дальше» нет вопроса: смените вид на «выбор» или «ввод»');
  }
  if (config.prompt === prompt) return gate;
  return { ...gate, config: { ...config, prompt } };
}

/** Добавляет вариант ответа с автоматическим id вида `option-N`. */
export function addOption(gate: Gate): Gate {
  const config = requireChoice(gate, 'Добавить вариант ответа');
  const id = freeId('option', config.options);
  const label = `Вариант ${config.options.length + 1}`;
  return { ...gate, config: { ...config, options: [...config.options, { id, label }] } };
}

/**
 * Удаляет вариант ответа.
 *
 * Если удаляемый вариант был `correctId`, переназначает его на первый из
 * оставшихся — иначе `GateSchema.refine` («correctId должен указывать
 * на один из вариантов») завалит проект при следующей загрузке, и автор
 * узнает об этом не в момент удаления, а на сохранении.
 *
 * Меньше двух вариантов после удаления схема не допускает
 * (`ChoiceConfig.options.min(2)`) — бросаем ошибку до того, как гейт станет
 * невалидным, а не после.
 */
export function removeOption(gate: Gate, optionId: string): Gate {
  const config = requireChoice(gate, 'Удалить вариант ответа');
  const index = config.options.findIndex((option) => option.id === optionId);
  if (index < 0) {
    throw new Error(`Нельзя удалить вариант «${optionId}»: его нет в этом гейте`);
  }
  if (config.options.length - 1 < 2) {
    throw new Error('У гейта «выбор» должно остаться не меньше двух вариантов ответа');
  }

  const options = config.options.slice(0, index).concat(config.options.slice(index + 1));
  const correctId = config.correctId === optionId ? options[0]!.id : config.correctId;
  return { ...gate, config: { ...config, options, correctId } };
}

/** Переименовывает подпись варианта, не трогая его id. */
export function setOptionLabel(gate: Gate, optionId: string, label: string): Gate {
  const config = requireChoice(gate, 'Подписать вариант ответа');
  const index = config.options.findIndex((option) => option.id === optionId);
  if (index < 0) {
    throw new Error(`Нельзя переименовать вариант «${optionId}»: его нет в этом гейте`);
  }
  if (config.options[index]!.label === label) return gate;

  const options = config.options.slice();
  options[index] = { ...options[index]!, label };
  return { ...gate, config: { ...config, options } };
}

/** Отмечает вариант как правильный ответ. */
export function setCorrect(gate: Gate, optionId: string): Gate {
  const config = requireChoice(gate, 'Отметить правильный вариант');
  if (!config.options.some((option) => option.id === optionId)) {
    throw new Error(`Нельзя отметить «${optionId}» как правильный: такого варианта нет в этом гейте`);
  }
  if (config.correctId === optionId) return gate;
  return { ...gate, config: { ...config, correctId: optionId } };
}

/**
 * Делает остановку развилкой или возвращает её в вопросы.
 *
 * Развилка — та же остановка с выбором, у которой НЕТ верного ответа
 * (схема v4, `correctId: null`). Отдельного поля «тип остановки» нет
 * намеренно: два поля рассогласовались бы, а значение — не с чем.
 *
 * Возврат в вопросы назначает верным ПЕРВЫЙ вариант, а не запоминает
 * прежний: помнить его пришлось бы через все правки списка вариантов,
 * включая удаление того самого варианта. Автор всё равно выбирает верный
 * ответ радиокнопкой рядом, и лишний невидимый черновик тут дороже
 * одного щелчка.
 */
export function setFork(gate: Gate, isFork: boolean): Gate {
  const config = requireChoice(gate, 'Переключить тип остановки');
  if (isFork) {
    if (config.correctId === null) return gate;
    return { ...gate, config: { ...config, correctId: null } };
  }
  if (config.correctId !== null) return gate;
  const first = config.options[0];
  if (!first) {
    throw new Error('У остановки нет ни одного варианта: верным назначать нечего');
  }
  return { ...gate, config: { ...config, correctId: first.id } };
}

/** Та же проверка, что `Id` в схеме (`packages/core/src/schema.ts`), но она там не экспортирована. */
function assertValidElementId(elementId: string): void {
  if (elementId.length === 0) {
    throw new Error('Идентификатор элемента не может быть пустым');
  }
  if (elementId !== elementId.trim()) {
    throw new Error('Идентификатор элемента не должен начинаться или заканчиваться пробелом');
  }
}

/**
 * Привязывает вариант ответа к элементу сцены (ADR-011).
 *
 * Переименовывает `option.id` в `elementId`. Именно совпадение id варианта
 * с id элемента делает вариантом ответа сам элемент, нарисованный автором,
 * а не системную кнопку — привязка не структурная ссылка, а совпадение
 * значений, поэтому она не проходит через схему отдельным полем.
 *
 * `correctId` чинится тем же способом, что и в `removeOption`: если он
 * указывал на старый id варианта, переезжает на новый, иначе связь
 * «правильный вариант» бы молча оборвалась.
 */
export function bindOption(gate: Gate, optionId: string, elementId: string): Gate {
  const config = requireChoice(gate, 'Привязать вариант к элементу сцены');
  assertValidElementId(elementId);

  const index = config.options.findIndex((option) => option.id === optionId);
  if (index < 0) {
    throw new Error(`Нельзя привязать вариант «${optionId}»: его нет в этом гейте`);
  }
  if (optionId === elementId) return gate;
  if (config.options.some((option, i) => i !== index && option.id === elementId)) {
    throw new Error(`Элемент «${elementId}» уже занят другим вариантом этого гейта`);
  }

  const options = config.options.slice();
  options[index] = { ...options[index]!, id: elementId };
  const correctId = config.correctId === optionId ? elementId : config.correctId;
  return { ...gate, config: { ...config, options, correctId } };
}

/**
 * Принимаемые ответы гейта «ввод». Обрезает пробелы по краям и убирает
 * дубликаты — это нормализация авторского ввода, а не продуктовое решение.
 *
 * Пустой список или список, где после обрезки не осталось ни одной
 * непустой строки, невалиден по схеме (`accept: array(string.min(1)).min(1)`)
 * — бросаем, а не отбрасываем лишнее молча и не продолжаем с тем, что
 * осталось: автор должен узнать о пустом ответе сразу, а не когда проект
 * откажется загружаться.
 */
export function setAccept(gate: Gate, accept: readonly string[]): Gate {
  const config = requireInput(gate, 'Задать принимаемые ответы');

  const trimmed = accept.map((value) => value.trim());
  if (trimmed.some((value) => value.length === 0)) {
    throw new Error('Принимаемый ответ не может быть пустой строкой');
  }
  const unique = Array.from(new Set(trimmed));
  if (unique.length === 0) {
    throw new Error('У гейта «ввод» должен быть хотя бы один принимаемый ответ');
  }

  const sameAsBefore =
    unique.length === config.accept.length && unique.every((value, i) => value === config.accept[i]);
  if (sameAsBefore) return gate;
  return { ...gate, config: { ...config, accept: unique } };
}

/** Чувствительность к регистру при сравнении введённого ответа. */
export function setCaseSensitive(gate: Gate, value: boolean): Gate {
  const config = requireInput(gate, 'Задать чувствительность к регистру');
  if (config.caseSensitive === value) return gate;
  return { ...gate, config: { ...config, caseSensitive: value } };
}

/**
 * Поведение при неверном ответе — общее поле Gate, не зависит от вида config.
 *
 * Набор значений — из схемы v3 (`GateSchema.onWrong`): `inline-hint` и
 * `inline-explain` заменили единственный `reveal` версии 2, разведя «короткую
 * подсказку» и «разбор слоем поверх сцены» в два разных исхода — раньше
 * оба смысла делил один `reveal`.
 */
export function setOnWrong(
  gate: Gate,
  onWrong: 'inline-hint' | 'inline-explain' | 'retry' | 'continue',
): Gate {
  if (gate.onWrong === onWrong) return gate;
  return { ...gate, onWrong };
}

/**
 * Максимум попыток. `null` — без ограничения, как в схеме
 * (`maxAttempts: number.int().positive().nullable()`). Ноль и отрицательное
 * не округляем до единицы — это не «мало», а бессмысленное значение
 * (нельзя ответить меньше одного раза), поэтому ошибка, а не молчаливая
 * поправка.
 */
export function setMaxAttempts(gate: Gate, value: number | null): Gate {
  if (value !== null && (!Number.isInteger(value) || value <= 0)) {
    throw new Error('Максимум попыток — целое положительное число или «без ограничения»');
  }
  if (gate.maxAttempts === value) return gate;
  return { ...gate, maxAttempts: value };
}
