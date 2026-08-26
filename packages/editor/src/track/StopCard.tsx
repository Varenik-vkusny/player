/**
 * Карточка остановки — прямо над её меткой на дорожке.
 *
 * ЗАЧЕМ ОНА ЕСТЬ. Замер 21.08.2026: автор выбирал остановку, панель с полем
 * «Вопрос», вариантами ответа и кнопкой «Завести ветку под этот ответ»
 * действительно открывалась — на y = 984 при высоте окна 900. До поля
 * «Вопрос» надо было прокрутить 475 px на окне 1440x900 и 655 на 1280x720,
 * а прокручиваемая колонка показывала пятую часть себя (scrollHeight 2728
 * при clientHeight 537) и к выбранной панели не прокручивалась.
 *
 * То есть механика работала, а найти её было нельзя. Владелец сказал прямо:
 * «я не мог нормально понять, как правильно ставить разделение, чтобы
 * поставить вопрос и разделить на ветки».
 *
 * ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО НЕТ. Здесь ровно то, ради чего автор трогает
 * остановку: вопрос, ответы и куда каждый уводит. Всё редкое — имя
 * переменной, поведение при неверном ответе, число попыток, привязка
 * к слову — остаётся в панели метки и сюда не переезжает. Карточка обязана
 * помещаться над дорожкой, а панель на тридцать полей помещаться не может.
 *
 * ВТОРОЙ РЕАЛИЗАЦИИ ЗДЕСЬ НЕТ. Все правки идут через те же функции
 * `state/gates.ts`, которыми пользуется панель, а «куда ведёт» читается тем
 * же `optionDestination`. Разойтись двум местам не на чем.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import type { Gate } from '@player/core';

import type { OptionDestination } from '../state/conditionText.js';
import { addOption } from '../state/gates.js';
import { secondsText } from '../timeText.js';
import { Button, PlainSelect, StringField } from '../ui/index.js';

/** «Никуда»: рассказ на этом ответе идёт запасным выходом главы. */
const NOWHERE = '';

/** Ширина карточки. Постоянная: положение считается от неё. */
const WIDTH = 320;
/** Поле от края окна, за которое карточку не выпускают. */
const MARGIN = 8;

/**
 * Где на экране стоит метка остановки — точка привязки карточки.
 *
 * Живёт РЯДОМ С КАРТОЧКОЙ, а не в `Editor.tsx`: это её собственная забота,
 * и вынесенная наверх она превратилась бы в ещё одно состояние вида,
 * которое надо не забыть обновить. `undefined` — метки на экране нет
 * (другая глава, свёрнутая дорожка), и карточку показывать не над чем.
 *
 * Пересчёт по трём поводам, и каждый нужен: смена выбранной метки; изменение
 * размера окна; ЛЮБАЯ прокрутка в фазе перехвата — при масштабе дорожки
 * больше единицы полотно ездит под контейнером, и метка уезжает вместе с ним,
 * а карточка, оставшаяся на месте, указывала бы на чужую секунду.
 */
export function useMarkAnchor(markId: string | undefined): { x: number; y: number } | undefined {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | undefined>(undefined);

  const measure = useCallback((): void => {
    if (markId === undefined) {
      setAnchor(undefined);
      return;
    }
    const node = document.querySelector<HTMLElement>(`[data-mark-kind="gate"][data-mark-id="${markId}"]`);
    if (!node) {
      setAnchor(undefined);
      return;
    }
    const rect = node.getBoundingClientRect();
    setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
  }, [markId]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  return anchor;
}

export interface StopCardChapter {
  readonly id: string;
  readonly title: string;
}

export interface StopCardProps {
  readonly gate: Gate;
  /** Секунда метки — только для заголовка карточки. */
  readonly seconds: number;
  /** Все главы объяснения: цели, куда может уводить ответ. */
  readonly chapters: readonly StopCardChapter[];
  /** Глава, в которой стоит остановка: она же — цель «пройти заново». */
  readonly currentChapterId: string;
  readonly destinationOf: (optionId: string) => OptionDestination;
  /**
   * Точка привязки в координатах ОКНА: центр метки по x, её верх по y.
   *
   * `undefined` — метки на экране нет (дорожка свёрнута, полотно укатилось
   * при масштабе). Карточка при этом ОСТАЁТСЯ: она единственное место, где
   * правятся вопрос и ответы, и исчезни она — поля стали бы недостижимы
   * вовсе, а выбранная остановка продолжала бы значиться выбранной.
   * Без привязки карточка встаёт по центру нижней части окна.
   */
  readonly anchor: { readonly x: number; readonly y: number } | undefined;
  readonly onUpdateGate: (gate: Gate) => void;
  /**
   * Превращает остановку в вопрос И КЛАДЁТ ЕГО НА СЦЕНУ одним шагом.
   *
   * Не `setGateKind`: смена вида даёт вопрос, которого зритель не увидит —
   * его рисует служебная плашка оснастки поверх сцены, а текст вопроса
   * на сцену не попадает вовсе. Замер 21.08.2026: во всех эталонных наборах
   * ноль вариантов было привязано к фигурам, то есть задуманный основной
   * путь (ADR-011) на живых данных не встречался ни разу.
   */
  readonly onAskOnStage: () => void;
  /**
   * Правка текста вопроса и подписей ответов.
   *
   * Отдельно от `onUpdateGate`, потому что текст живёт В ДВУХ МЕСТАХ сразу:
   * в данных остановки и на сцене, если вопрос туда вынесен. Правка обязана
   * доходить до обоих одной отправкой — иначе автор пишет одно, а зритель
   * читает другое, и оба значения по отдельности верны.
   */
  readonly onPromptChange: (text: string) => void;
  readonly onOptionLabelChange: (optionId: string, text: string) => void;
  readonly onOptionTarget: (optionId: string, goto: string | null) => void;
  readonly onBranchFromOption: (optionId: string) => void;
  /** Убрать вариант ответа вместе с его веткой (`removeGateOption`). */
  readonly onRemoveOption: (optionId: string) => void;
      readonly onCommitHistory: () => void;
  readonly onClose: () => void;
}


export function StopCard({
  gate,
  seconds,
  chapters,
  currentChapterId,
  destinationOf,
  anchor,
  onUpdateGate,
  onAskOnStage,
  onPromptChange,
  onOptionLabelChange,
  onOptionTarget,
  onBranchFromOption,
  onRemoveOption,
  onCommitHistory,
  onClose,
}: StopCardProps): ReactElement {
  /*
   * ЗАКРЫВАЕТСЯ ЩЕЛЧКОМ МИМО И ПО ESCAPE.
   *
   * Сперва щелчок мимо был намеренно оставлен без действия: я рассудил, что
   * автор ходит между карточкой и холстом, и карточка, исчезающая от каждого
   * взгляда на сцену, заставит выбирать метку заново.
   *
   * Владелец, открыв редактор, сказал прямо: «окно не закрывается». Довод
   * оказался придуманным за него — карточка лежит поверх холста и мешает
   * смотреть на то, ради чего её открыли. Всплывающее окно закрывается
   * щелчком мимо, потому что так закрываются все всплывающие окна.
   *
   * Щелчок ПО МЕТКЕ исключён: он выбирает другую остановку, и закрывать
   * карточку, чтобы тут же открыть её снова, значило бы мигать ею на каждом
   * переходе между метками.
   */
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const node = rootRef.current;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (node?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-mark-kind]')) return;
      /*
       * Панель метки справа — не «мимо»: она про ту же остановку, и автор
       * ходит между ней и карточкой. Закрывать карточку от щелчка в неё
       * значило бы отнимать её ровно тогда, когда автор работает
       * с тем же предметом.
       */
      if (target instanceof Element && target.closest('[data-testid="mark-panel"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    // Фаза перехвата — чтобы успеть до обработчиков сцены и дорожки, ровно
    // как это делает меню правой кнопки.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose]);

  const config = gate.config;

  /*
   * Остановка БЕЗ вопроса — законное состояние, а не пустая карточка.
   * Только что поставленная остановка именно такая (`createGate` даёт вид
   * `continue`), и до Сессии 55 превратить её в вопрос можно было, лишь
   * найдя поле «Вид» в невидимой части правой колонки. Это и был второй шаг
   * рецепта, который автор не мог выполнить.
   */
  if (config.kind === 'continue') {
    return (
      <Card rootRef={rootRef} anchor={anchor} seconds={seconds} onClose={onClose}>
        <p className="ed-stopcard-plain">Сейчас это просто остановка: зритель нажимает «Дальше».</p>
        <Button data-testid="stopcard-make-question" onClick={onAskOnStage}>
          Задать вопрос с ответами
        </Button>
        {/* Сказано вслух, потому что это ГЛАВНОЕ следствие нажатия: на сцене
            появятся настоящие элементы, которые автор двигает и оформляет,
            а не служебная плашка поверх его картинки. */}
        <p className="ed-stopcard-plain">
          Вопрос и ответы появятся на сцене — их можно двигать и оформлять.
        </p>
      </Card>
    );
  }

  return (
    <Card rootRef={rootRef} anchor={anchor} seconds={seconds} onClose={onClose}>
      <StringField
        label="Вопрос"
        value={config.prompt}
        testId="stopcard-prompt"
        onCommit={(prompt) => {
          onPromptChange(prompt);
          onCommitHistory();
        }}
      />

      {/*
        ЗДЕСЬ БЫЛИ ТРИ ОРГАНА, И ВСЕ ТРИ УБРАНЫ 25.08.2026: список «Что это
        за остановка» (вопрос / развилка), пояснение «Развилка делит рассказ»
        и кнопка «Разделить повествование здесь».

        Решение владельца: раз у метки есть варианты ответа — рассказ здесь
        делится, и объявлять это отдельно не надо. Разрез и ветки теперь
        делает то же нажатие, которым задают вопрос (редьюсер, case
        'askOnStage'), одним шагом истории.

        Его слова: «я не понял пайплайн… куда денется остальная часть видео,
        я не понял абсолютно нихуя». Четыре нажатия в трёх органах ради
        одного намерения — это и был пайплайн.

        Имена `data-testid` `stop-kind`, `fork-hint`, `gate-split`
        и `split-blocked` исчезли вместе с органами; тесты, которые их
        искали, переписаны на то, что проверяет новое поведение.
      */}

      {config.kind === 'input' ? (
        <p className="ed-stopcard-plain">
          Зритель вводит ответ словом. Что засчитывать — в свойствах остановки.
        </p>
      ) : (
        <>
          {config.options.map((option, index) => {
            const destination = destinationOf(option.id);
            /*
             * Сложное условие одним именем главы не выражается: правил про
             * этот ответ несколько или они связаны через И. Показать здесь
             * список значило бы предложить автору стереть выбором то, чего
             * он отсюда не видит, — поэтому вместо списка стоит честная
             * строка, а правка живёт в «Правилах выхода».
             */
            const editable = destination.via !== 'conditions';
            return (
              <div
                className="ed-stopcard-option"
                key={option.id}
                data-testid={`stopcard-option-${index}`}
              >
                <StringField
                  label={`Ответ ${index + 1}`}
                  value={option.label}
                  testId={`stopcard-option-label-${index}`}
                  onCommit={(label) => {
                    onOptionLabelChange(option.id, label);
                    onCommitHistory();
                  }}
                />
                {editable ? (
                  <span className="ed-stopcard-goto">
                    <span className="ed-stopcard-goto-label" aria-hidden="true">и тогда</span>
                    <PlainSelect
                      ariaLabel={`Куда ведёт ответ ${index + 1}`}
                      testId={`stopcard-option-goto-${index}`}
                      className="ed-stopcard-goto-select"
                      value={destination.via === 'rule' ? destination.targetId : NOWHERE}
                      onPick={(picked) => onOptionTarget(option.id, picked === NOWHERE ? null : picked)}
                      options={[
                        /* «Своего правила нет» — а НЕ «дальше, как у всех».
                           Разница не словесная: «как у всех» подразумевает,
                           что общий выход есть, а его может не быть вовсе,
                           и тогда рассказ на этом ответе кончается. Куда
                           именно ведёт этот случай, говорит строка ниже —
                           словами, взятыми у одной и той же функции
                           `optionDestination`, чтобы список и объяснение
                           не разошлись. */
                        { value: NOWHERE, label: '— своего правила нет —' },
                        /* Возврат в СВОЮ главу — законный сценарий «повтори
                           и попробуй снова», а не ошибка автора. Механика
                           повтора уже написана и решена владельцем
                           02.08.2026: остановки внутри повторяемого куска
                           молчат, а отправившая на повтор спрашивает снова
                           (`player/src/repeat.ts`). */
                        { value: currentChapterId, label: 'пройти эту главу заново' },
                        ...chapters
                          .filter((chapter) => chapter.id !== currentChapterId)
                          .map((chapter) => ({
                            value: chapter.id,
                            label: `перейти в «${chapter.title}»`,
                          })),
                      ]}
                    />
                  </span>
                ) : (
                  <p className="ed-stopcard-plain" data-testid={`stopcard-option-complex-${index}`}>
                    {destination.text}
                  </p>
                )}

                {/*
                  ИСХОД НАЗЫВАЕТСЯ ВСЛУХ всегда, когда своего правила нет.
                  У списка в этом случае выбран пункт «своего правила нет»,
                  и без строки автор не узнал бы, чем это для зрителя
                  обернётся: пойдёт общим выходом главы или рассказ вообще
                  кончится. Это разные вещи, и вторая — тупик, который автор
                  обязан увидеть, а не вычислить.

                  При своём правиле строки нет: главу уже называет сам список,
                  и второе имя рядом было бы повтором.
                */}
                {destination.via === 'rule' ? null : (
                  <p className="ed-stopcard-plain" data-testid={`stopcard-option-goto-note-${index}`}>
                    {destination.text}
                  </p>
                )}

                {/*
                  «Завести ветку» — у каждого ответа, У КОТОРОГО НЕТ СВОЕГО
                  ПРАВИЛА. Вторая ветка на тот же ответ была бы правилом,
                  до которого рассказ никогда не дойдёт (правила читаются
                  по порядку), — поэтому у ответа с правилом кнопки нет.

                  ПОЧЕМУ НЕ ТОЛЬКО У ТУПИКА. Куплено 25.08.2026, владелец:
                  «я сейчас завожу под одним вариантом ответа ветку, а под
                  вторым уже не могу, это так по дефолту типа или что?».

                  Замер: после ветки под первым ответом выход главы получает
                  и правило, и ЗАПАСНОЙ выход в ту же ветку —
                    Моя первая глава: option-1 → Вариант 1 / иначе → Вариант 1
                  Запасной ставится нарочно: без него остальным ответам идти
                  некуда и проект перестаёт сохраняться (найдено владельцем
                  же 22.08.2026). Но после него второй ответ переставал быть
                  тупиком, кнопка исчезала, и завести ветку под ним было
                  НЕЧЕМ — при том что своего правила у него по-прежнему нет.

                  «Пойдёт туда же, как и все остальные» — это не выбор автора
                  для ЭТОГО ответа, а то, что осталось от чужого выбора.
                */}
                {destination.via !== 'rule' ? (
                  <Button
                    data-testid={`stopcard-option-branch-${index}`}
                    onClick={() => onBranchFromOption(option.id)}
                  >
                    Завести ветку под этот ответ
                  </Button>
                ) : null}

                {/*
                  УБРАТЬ ОТВЕТ — ЗДЕСЬ ЖЕ, а не только в панели свойств.
                  Заведено 25.08.2026 по слову владельца: «надо обеспечить,
                  чтобы ветки удалялись, если я удаляю вариант ответа,
                  соответственно чтобы можно было это делать».

                  Уходит вариант, его правило и его ветка — одним шагом
                  истории (редьюсер, `removeGateOption`). Ветка сносится,
                  только если в неё больше некому вести.

                  Двух вариантов меньше у выбора не бывает: с одним ответом
                  выбора нет, и кнопка гаснет, называя причину.
                */}
                <Button
                  data-testid={`stopcard-option-remove-${index}`}
                  disabled={config.options.length <= 2}
                  title={config.options.length <= 2
                    ? 'У метки с выбором должно остаться не меньше двух вариантов'
                    : 'Убрать этот ответ вместе с его веткой'}
                  onClick={() => onRemoveOption(option.id)}
                >
                  Убрать ответ
                </Button>
              </div>
            );
          })}

          <Button
            data-testid="stopcard-add-option"
            onClick={() => {
              onUpdateGate(addOption(gate));
              onCommitHistory();
            }}
          >
            Добавить ответ
          </Button>
        </>
      )}
    </Card>
  );
}

/** Корпус карточки: рамка, заголовок, крестик и привязка к метке. */
function Card({
  rootRef,
  anchor,
  seconds,
  onClose,
  children,
}: {
  readonly rootRef: React.RefObject<HTMLDivElement | null>;
  readonly anchor: { readonly x: number; readonly y: number } | undefined;
  readonly seconds: number;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactElement {
  /*
   * Положение считается от постоянной ширины: карточка обязана встать над
   * меткой И не вылезти за окно. Мерить себя после отрисовки, как это делает
   * меню, здесь незачем — у меню ширина зависит от длины подписей, а тут
   * она задана числом.
   *
   * По вертикали карточка растёт ВВЕРХ от метки (`bottom`, а не `top`):
   * снизу от метки только полоса расшифровки и край окна, и карточка,
   * растущая вниз, вылезала бы за него тем сильнее, чем больше у вопроса
   * ответов.
   */
  // Без привязки — по центру окна и на трети его высоты снизу: место
  // заведомо свободное от дорожки и от правой колонки.
  const point = anchor ?? { x: window.innerWidth / 2, y: Math.round(window.innerHeight * 0.7) };
  const left = Math.max(MARGIN, Math.min(point.x - WIDTH / 2, window.innerWidth - WIDTH - MARGIN));

  return (
    <div
      ref={rootRef}
      className="ed-stopcard"
      data-testid="stop-card"
      role="dialog"
      aria-label={`Остановка на ${secondsText(seconds)}`}
      style={{
        left: `${left}px`,
        bottom: `${Math.max(MARGIN, window.innerHeight - point.y + MARGIN)}px`,
        width: `${WIDTH}px`,
      }}
    >
      <div className="ed-stopcard-head">
        <span className="ed-stopcard-title">Остановка на {secondsText(seconds)}</span>
        <button
          type="button"
          className="ed-stopcard-close"
          data-testid="stop-card-close"
          aria-label="Закрыть карточку остановки"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}
