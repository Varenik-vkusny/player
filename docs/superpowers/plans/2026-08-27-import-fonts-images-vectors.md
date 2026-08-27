# Импорт презентации: шрифты, картинки и контуры

> **Исполнителю:** задачи идут по порядку, каждая заканчивается зелёным
> прогоном и коммитом. Шаги помечены `- [ ]`. Задание писал контроллер,
> который проверил КАЖДОЕ утверждение «возьми то, что уже есть» грепом —
> ссылки `файл:строка` в тексте настоящие на 27.08.2026.

**Цель.** Импортированная из Canva страница выглядит как в Canva: свои
шрифты, свои картинки, стрелки и кривые фигуры — и остаётся обычным нашим
проектом, который автор правит и на который вешает дорожку, остановки
и вопросы.

**Замысел.** Библиотека разбора уже отдаёт всё нужное; ничего нового
устанавливать не надо. Байты (картинки и шрифты) едут в браузерное
хранилище рядом с озвучкой, а проект хранит ключ. Контуры едут в схеме
строкой SVG. Показывает всё плеер, потому что рисование одно на плеер
и редактор (инвариант №5).

**Стек.** TypeScript, Zod (схема), IndexedDB (байты), Vitest (юниты),
Playwright (e2e). Библиотека `pptx-viewer-core@2.3.8` — только в редакторе,
только динамическим `import()`.

**Замысел согласован владельцем 27.08.2026** (байты — в браузере, как
у озвучки; объём — полный, включая стрелки и кривые фигуры).

---

## Общие ограничения

Действуют в КАЖДОЙ задаче, повторять в шагах не буду.

- **Схема версионируется** (инвариант №7): бамп + миграция + фикстура +
  тест. Проверяется `packages/core/test/invariants.test.ts:241`.
- **Направление зависимостей** (инвариант №6): `editor → player → core`.
  `core` не знает про DOM и IndexedDB. Хранилище байтов живёт в ПЛЕЕРЕ
  (`packages/player/src/assets.ts`), редактор импортирует его оттуда.
- **Один рендер** (инвариант №5): редактор зовёт `renderScene` из плеера.
  Значит картинки и шрифты обязаны появиться и в редакторе тем же кодом.
- **Плеер без внешних импортов** (инвариант №9): `pptx-viewer-core`
  в плеер попасть не может. Проверяется `e2e/bundle.spec.ts`.
- **Анимируем только `transform`, `opacity`, `filter`** (инвариант №8).
  SVG-контур этого не нарушает: анимируется контейнер, а не разметка.
- **`pnpm check` — только один за раз.** Два одновременных дают ложное
  красное: оба поднимают дев-сервер на 5179 и пишут в один файл бандла.
- **Не докладывай зелень по коду возврата конвейера.** `cmd | tail`
  возвращает код `tail`. Смотри числа.
- **Эталонные фикстуры в `fixtures/projects/` не править** ради зелени.

### Числа на входе (прогон 27.08.2026)

| Что | Значение |
|---|---|
| `SCHEMA_VERSION` | **16** (`packages/core/src/schema.ts:28`) |
| последняя миграция | `migrateV15toV16`, ключ 15 в `MIGRATIONS` |
| фикстур проектов | 26 |
| снимков на фикстуру | **5** (доли 0, 0.25, 0.5, 0.75, 1) |
| юнитов в `packages/core/test` | 226 |
| юнитов импорта | 22, все зелёные |
| e2e импорта | 4, все зелёные |

---

## Что уже доказано прогоном — не перепроверять, опираться

Замеры сделаны контроллером 27.08.2026 на настоящем файле из Canva
(`fixtures/import/canva-page-text.pptx`, `canva-page-notes.pptx`).

**Шрифты вшиты в файл.** `deck.embeddedFonts` — массив с полями
`{ name, dataUrl, bold, italic, format, rawFontData, partPath }`.
На нашей фикстуре два: `Barlow Condensed` (96 736 байт) и
`Barlow Condensed Bold` (103 912 байт), `format: 'truetype'`,
`dataUrl` вида `data:font/ttf;base64,AAEAAAARAQ…`.

**Браузер их принимает.** Через `new FontFace(...).load()` оба
загрузились и нарисовали текст УЖЕ запасного:

| | ширина строки на 100px |
|---|---|
| запасной (шрифта нет) | 1259.19 |
| `Barlow Condensed` | **1062.5** |
| `Barlow Condensed Bold` | **1104.59** |

Контроль прибора: Georgia 1231.64, Courier 1320.22 — прибор различает
шрифты. **`document.fonts.check()` для этого НЕ ГОДИТСЯ**: он вернул
`true` для заведомо выдуманного имени. Мерить только шириной отрисовки.

**Картинки достаются байтами.** У элемента `type: 'picture'` есть поле
`imagePath` (например `ppt/media/image1.png`), а у обработчика —
метод `getMediaArrayBuffer(path)`, который вернул `ArrayBuffer(5610)` —
ровно размер файла в zip. Метод `getImageData(path)` возвращает
`blob:`-адрес и для хранения НЕ годится.

**Одна картинка повторяется много раз.** На фикстуре 10 элементов
ссылаются на один `image1.png`. На настоящей презентации владельца —
113 элементов. Значит хранить по содержимому, а не по элементу.

**Контуры отдаются строкой SVG.** У фигур `shapeType: 'custom'` есть
`pathData` вида `M 0 0 L 21844000 0 L 21844000 12700 L 0 12700 Z`
и `pathWidth`/`pathHeight` в EMU — это готовая система координат
для `viewBox`.

**У пресетных линий контура НЕТ.** `shapeType: 'line'` приходит без
`pathData`: только габарит (например 671×348), `strokeColor: '#000000'`,
`strokeWidth: 4`. Контур придётся строить самому из габарита и признаков
отражения. Это ДРУГОЙ путь, чем у `custom`, и он отдельным шагом.

---

## Ловушки, названные заранее

Каждая куплена прогоном или разбором чужого кода. Исполнителю их
не переоткрывать.

**1. ОТМЕНЕНА, перемерено 27.08.2026.** Здесь стояло, что браузер
дожирняет уже жирный шрифт и лечится это `font-weight: 100 900`.
**Неверно.** Чистый опыт на трёх отдельных загрузках страницы: вес,
объявленный у лица (`normal` / `bold` / `100 900`), не влияет НИ НА ЧТО,
и `font-synthesis: none` тоже. Расширение текста на 1.7 % при запросе
`bold` давала ЗАПАСНАЯ гарнитура на буквах, которых в шрифте нет.
Ничего чинить не надо; объявляй `@font-face` просто.

**1а. Вшитый шрифт Canva НЕ СОДЕРЖИТ КИРИЛЛИЦЫ.** Два независимых
прибора: ширина отрисовки (`АГЕНТСТВО` вшитым 592 = запасным 592,
совпало; `Agency` 264.11 против 333.55, различие есть) и разбор таблицы
символов из самих байтов (525 знаков, латиница A–Z — 26, диапазон
0x0410–0x044F — **0**). У `Barlow Condensed` кириллицы нет и в полной
версии: в описании репозитория Google Fonts объявлены наборы `latin`,
`latin-ext`, `menu`, `vietnamese`.

**Следствие для проверок: применение шрифта измеряется только ЛАТИНСКИМ
текстом.** Проверка на русском слове вечнозелёная — вшитый и запасной
дадут одно число при ЛЮБОЙ реализации.

**1б. Сама Canva тоже рисует кириллицу ЗАПАСНЫМ шрифтом.** Измерено
27.08.2026 прямо в редакторе Canva, её собственным шрифтом
(`YAFdJljEuFc_0`, зашифрованное имя): `АГЕНТСТВО` шрифтом 607.23 =
запасным 607.23; `ЖЫЪЭ` 346.39 = 346.39; `Agency 12345` 492.61 против
запасного 667.09. То есть тяжёлый гротеск на слайде Canva — это её
подстановка, а не Barlow.

**Отсюда починка облика русского слайда — ОДНА СТРОКА.** Мы отличаемся
от Canva не отсутствием шрифта, а тем, что падаем в ДРУГОЙ запасной:
у нас в стиле голое имя без запасного, и браузер берёт засечковый Times.
Импорт обязан писать `font-family: "Barlow Condensed", sans-serif` —
с запасным. Тогда русский текст ляжет туда же, куда его кладёт Canva.

**1в. У линий есть НАКОНЕЧНИКИ, и без них стрелка не стрелка.**
В сыром XML у всех трёх линий `<a:tailEnd type="triangle" len="med"
w="lg"/>` и `<a:headEnd type="none"/>`. Библиотека это отдаёт
в `shapeStyle`: `connectorEndArrow: 'triangle'`,
`connectorStartArrow: 'none'`, плюс `connectorEndArrowWidth: 'lg'`
и `connectorEndArrowLength: 'med'`. На слайде владельца это три
стрелки от заголовка к трём словам — рисовать их голыми отрезками
значит потерять смысл схемы.

**2. Отрисовка синхронная, хранилище асинхронное.**
`renderScene` (`packages/player/src/render.ts:390`) синхронный.
Байты доставать до сборки сцены, в `Player.load()`
(`packages/player/src/player.ts:411`), перед `#mountSegment()`.
Иначе слайд моргнёт пустыми местами.

**3. Новая фикстура заводит ПЯТЬ снимков автоматически.**
`e2e/fixtures.spec.ts:71` читает каталог сам, `momentsOf` даёт 5 долей.
Первый прогон после появления фикстуры ОБЯЗАН быть красным: Playwright
пишет `actual` в папку эталонов и роняет тест, а перезапуск не глядя
делает их эталонами МОЛЧА, то есть выключает проверку.
**Снимки смотреть глазами до принятия.**

**4. Фикстура НЕ должна ссылаться на байты в хранилище.** В чистом
прогоне хранилище пусто, картинка отрисуется пустой — и пустота станет
эталоном. Фикстура схемы проверяет ТОЛЬКО контуры (они самодостаточны).
Картинки и шрифты проверяются через настоящий импорт, где байты есть.

**5. Краска контура едет свойствами, а не внутри контура.** Соблазн
зашить цвет в объект контура надо назвать и отвергнуть: тогда автор
не сможет перекрасить фигуру полосой свойств, а это прямо противоречит
цели «редачить как в Канве».

**6. Обновление версии базы IndexedDB не должно потерять озвучку.**
`openDb` в `assets.ts:62` создаёт хранилище через проверку
`objectStoreNames.contains`. Добавление новых хранилищ обязано быть
ДОБАВЛЕНИЕМ, а не пересозданием.

---

## Строение файлов

**Меняются:**

| Файл | Ответственность после правки |
|---|---|
| `packages/core/src/schema.ts` | поля `assetId`, `path` у элемента; `fonts` у проекта |
| `packages/core/src/migrations.ts` | `migrateV16toV17` |
| `packages/player/src/assets.ts` | хранилища `images` и `fonts` рядом с `audio` |
| `packages/player/src/render.ts` | проброс адресов байтов в рендереры; `applyFonts` |
| `packages/player/src/renderers/registry.ts` | картинка по ключу; фигура контуром |
| `packages/player/src/player.ts` | подготовка байтов в `load()` |
| `packages/editor/src/import/pptx.ts` | контуры, ключи картинок, список шрифтов |
| `packages/editor/src/import/openPptx.ts` | добыча байтов и укладка в хранилище |

**Создаются:**

| Файл | Ответственность |
|---|---|
| `fixtures/projects/vectors.json` | фикстура v17 с контурами |
| `e2e/import-assets.spec.ts` | импорт с картинками и шрифтами в живом браузере |

Тесты хранилища и рендереров дописываются в СУЩЕСТВУЮЩИЕ
`packages/player/test/assets.test.ts` и
`packages/player/test/renderers.test.ts` — оба файла проверены, они есть.

---

## Задача 1. Схема v17: ключ байтов, контур, список шрифтов

**Файлы:**
- Меняется: `packages/core/src/schema.ts:28` (версия), `:360-389`
  (элемент), `:1062+` (проект)
- Меняется: `packages/core/src/migrations.ts` (новая функция + реестр)
- Создаётся: `fixtures/projects/vectors.json`
- Меняется: `packages/core/test/migrations.test.ts` (блок про v16→v17)
- Меняется: `packages/core/test/schema.test.ts` (проверки новых полей)

**Интерфейсы, на которые опираются следующие задачи:**

```ts
// packages/core/src/schema.ts — ДОБАВИТЬ в ElementSchema
assetId: z.string().min(1).optional(),
path: z.object({
  d: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
}).optional(),

// ДОБАВИТЬ в ProjectSchema
fonts: z.array(z.object({
  family: z.string().min(1),
  assetId: z.string().min(1),
})).default([]),
```

Плюс `.superRefine()` на элементе, выражающий правило ТИПОМ, а не
комментарием: `assetId` допустим только у `type === 'image'`,
`path` — только у `type === 'shape'`. Нарушение обязано падать громко
с внятным текстом.

- [ ] **Шаг 1. Написать падающие тесты на новые поля**

В `packages/core/test/schema.test.ts`:

```ts
describe('схема v17: ключ байтов и контур', () => {
  it('картинка принимает assetId', () => {
    const p = loadProject(проектС({ id: 'e1', type: 'image', assetId: 'a1' }));
    expect(p.segments[0]!.elements[0]!.assetId).toBe('a1');
  });

  it('assetId у ТЕКСТА не проходит: ключ байтов бессмыслен без картинки', () => {
    expect(() => loadProject(проектС({ id: 'e1', type: 'text', assetId: 'a1' })))
      .toThrow();
  });

  it('фигура принимает контур', () => {
    const p = loadProject(проектС({
      id: 'e1', type: 'shape',
      path: { d: 'M 0 0 L 10 10', width: 10, height: 10 },
    }));
    expect(p.segments[0]!.elements[0]!.path!.d).toBe('M 0 0 L 10 10');
  });

  it('контур с нулевой шириной не проходит: делить на неё нечем', () => {
    expect(() => loadProject(проектС({
      id: 'e1', type: 'shape',
      path: { d: 'M 0 0', width: 0, height: 10 },
    }))).toThrow();
  });

  it('список шрифтов проекта пуст по умолчанию, а не отсутствует', () => {
    expect(loadProject(обычныйПроект()).fonts).toEqual([]);
  });
});
```

Вспомогательные `проектС` / `обычныйПроект` — посмотри, как строятся
проекты в уже существующих тестах этого файла, и используй ТОТ ЖЕ приём.
Не заводи третий способ собирать проект.

- [ ] **Шаг 2. Прогнать, увидеть красное**

```
pnpm exec vitest run packages/core/test/schema.test.ts
```
Ожидается: падение, потому что полей ещё нет.

- [ ] **Шаг 3. Поднять версию и добавить поля**

`SCHEMA_VERSION = 17`. Поля и `superRefine` — как в блоке
«Интерфейсы» выше.

- [ ] **Шаг 4. Написать миграцию**

В `migrations.ts` рядом с `migrateV15toV16`:

```ts
/**
 * v16 → v17: у элемента появились ключ байтов и контур, у проекта —
 * список вшитых шрифтов. Все три поля НЕОБЯЗАТЕЛЬНЫ, поэтому старому
 * проекту дописывать нечего: у него их просто нет, и это законно.
 * Список шрифтов проставит схема умолчанием — второе описание
 * умолчания разъехалось бы с первым молча.
 */
const migrateV16toV17: Migration = (input) => ({
  ...(input as Record<string, unknown>),
  schemaVersion: 17,
});
```

Зарегистрировать в `MIGRATIONS` под ключом **16**.

- [ ] **Шаг 5. Прогнать юниты ядра**

```
pnpm exec vitest run packages/core
```
Ожидается: зелено. Инвариант №7 (`invariants.test.ts:241`) обязан
пройти — он требует миграцию для каждой версии ниже текущей.

- [ ] **Шаг 6. Доказать сломом, что миграция вправду в цепочке**

Убери строку `16: migrateV16toV17` из `MIGRATIONS`, прогони
`pnpm exec vitest run packages/core/test/invariants.test.ts`.
Ожидается КРАСНОЕ на «для каждой версии ниже текущей есть миграция».
Верни строку, прогони снова — зелёное. **Приведи оба вывода в отчёте.**

- [ ] **Шаг 7. Завести фикстуру с контурами**

`fixtures/projects/vectors.json`, `schemaVersion: 17`. Требования:

- немой сегмент (без `src` и без `fileId`) — так проще и законно с v13;
- `audio.duration` — целое число секунд, иначе имена снимков поедут
  на округлении;
- **никаких `assetId`**: в чистом прогоне байтов нет, картинка вышла бы
  пустой и пустота стала бы эталоном (ловушка №4);
- две фигуры с `path`: одна залитая (`fill`), одна линия (`stroke`
  и `stroke-width`), чтобы снимок различал оба пути отрисовки;
- краска — в `style` состояния, не внутри `path` (ловушка №5).

- [ ] **Шаг 8. Прогнать миграционный тест на всех фикстурах**

```
pnpm exec vitest run packages/core/test/migrations.test.ts
```
Ожидается: зелено, 27 фикстур (было 26) доезжают до версии 17.

- [ ] **Шаг 9. Коммит**

```bash
git add packages/core/src/schema.ts packages/core/src/migrations.ts \
        packages/core/test/schema.test.ts packages/core/test/migrations.test.ts \
        fixtures/projects/vectors.json
git commit -m "Схема v17: ключ байтов у картинки, контур у фигуры, шрифты проекта"
```

Коммить ЯВНЫМ списком путей, не `git add -A`.

---

## Задача 2. Хранилище байтов рядом с озвучкой

**Файлы:**
- Меняется: `packages/player/src/assets.ts:22-24` (имена), `:62-65`
  (создание хранилищ)
- Тест: `packages/player/test/assets.test.ts` — **файл уже существует**,
  дописывай в него, не создавай второй

**Интерфейсы (на них опираются задачи 3 и 4):**

```ts
/** Что лежит под одним ключом в хранилище картинок или шрифтов. */
export interface StoredBlob {
  readonly name: string;
  readonly type: string;
  readonly bytes: ArrayBuffer;
  readonly addedAt: number;
}

export type BlobStore = 'images' | 'fonts';

/** Ключ по СОДЕРЖИМОМУ: одна картинка на 113 элементов ляжет один раз. */
export function blobIdFor(bytes: ArrayBuffer): Promise<string>;
export function putBlob(store: BlobStore, blob: Omit<StoredBlob, 'addedAt'>): Promise<string>;
export function getBlob(store: BlobStore, id: string): Promise<StoredBlob | null>;
```

`blobIdFor` считает тот же хеш, что уже считает `audioIdFor`
(`assets.ts:89`). **Прочитай его и переиспользуй общую внутреннюю
функцию, а не пиши второй хеш** — два разных хеша разъехались бы молча.

- [ ] **Шаг 1. Написать падающие юниты — ТОЛЬКО на ключ**

**Проверено контроллером 27.08.2026: `vitest.config.ts:6` задаёт
`environment: 'node'`, IndexedDB в юнитах НЕТ.** Существующий
`assets.test.ts` поэтому проверяет только `audioIdFor` и ни разу
не трогает `putAudio`/`getAudio`. Не пытайся это обойти и **не ставь
заглушку хранилища**: подделка проверяла бы саму себя. Настоящая
запись и чтение проверяются в браузере, задача 5, шаг 2а.

Дописать в `packages/player/test/assets.test.ts`:

```ts
describe('blobIdFor', () => {
  it('одинаковые байты дают ОДИН ключ: картинка не ляжет дважды', async () => {
    const a = new TextEncoder().encode('одна картинка').buffer as ArrayBuffer;
    const b = new TextEncoder().encode('одна картинка').buffer as ArrayBuffer;
    expect(await blobIdFor(a)).toBe(await blobIdFor(b));
  });

  it('разное содержимое даёт разные ключи', async () => {
    const a = new TextEncoder().encode('первая').buffer as ArrayBuffer;
    const b = new TextEncoder().encode('вторая').buffer as ArrayBuffer;
    expect(await blobIdFor(a)).not.toBe(await blobIdFor(b));
  });

  it('ключ картинки и ключ озвучки на ОДНИХ байтах не совпадают', async () => {
    // Иначе одно содержимое, положенное как звук и как картинка, дало бы
    // один ключ на два разных хранилища — и путаницу, которую не видно.
    const bytes = new TextEncoder().encode('одно и то же').buffer as ArrayBuffer;
    expect(await blobIdFor(bytes)).not.toBe(await audioIdFor(bytes));
  });
});
```

Посмотри, какой префикс ставит `audioIdFor` (`assets.ts:89`), и дай
`blobIdFor` СВОЙ префикс тем же приёмом. Хеш считать общей внутренней
функцией — два разных хеша разъехались бы молча.

- [ ] **Шаг 2. Прогнать, увидеть красное**

- [ ] **Шаг 3. Поднять версию базы и добавить хранилища**

`DB_VERSION` 1 → 2. В `onupgradeneeded` — ДОБАВИТЬ создание `images`
и `fonts` через ту же проверку `contains`, что уже стоит у `audio`.
Существующее хранилище `audio` не трогать: у автора там лежит озвучка,
и потерять её нельзя.

- [ ] **Шаг 4. Прогнать, увидеть зелёное**

- [ ] **Шаг 5. Проверить в БРАУЗЕРЕ, что база пережила обновление**

В юнитах это непроверяемо (шаг 1). Заведи временный
`e2e/zz-assets-probe.spec.ts`, который в живой странице:

1. кладёт звук через `putAudio` и запоминает ключ;
2. кладёт байты в `images` и в `fonts` через `putBlob`;
3. читает всё обратно и сверяет байты;
4. проверяет, что ключ картинки НЕ читается из `fonts` (хранилища
   не путаются);
5. проверяет, что `getBlob('images', 'нет-такого')` даёт `null`,
   а не отказ.

Пункт 1 — не формальность: это положительный контроль на то, что
поднятие версии базы не снесло озвучку автора.

Прогнать, привести числа в отчёте, **временный файл удалить** и сказать
в отчёте, что удалил. Постоянная проверка живёт в задаче 5.

- [ ] **Шаг 6. Коммит**

```bash
git add packages/player/src/assets.ts packages/player/test/assets.test.ts
git commit -m "Хранилище байтов: картинки и шрифты рядом с озвучкой"
```

---

## Задача 3. Импорт достаёт шрифты, картинки и контуры

**Файлы:**
- Меняется: `packages/editor/src/import/pptx.ts` (чистый переходник)
- Меняется: `packages/editor/src/import/openPptx.ts` (мост к библиотеке)
- Меняется: `packages/editor/test/importPptx.test.ts`

**Разделение обязанностей не нарушать.** `pptx.ts` библиотеку
не импортирует и в IndexedDB не ходит — он чистый и проверяется без них
(ADR-031). Значит байты достаёт `openPptx.ts` и передаёт уже готовые
ключи ДОВОДОМ.

**Интерфейсы:**

```ts
// pptx.ts — ДОБАВИТЬ во вход
export interface PptxElement {
  // …существующее…
  readonly imagePath?: string;       // путь картинки внутри презентации
  readonly pathData?: string;        // контур, если фигура произвольная
  readonly pathWidth?: number;
  readonly pathHeight?: number;
}

// pptx.ts — ДОБАВИТЬ в ImportOptions
export interface ImportOptions {
  // …существующее…
  /** Путь картинки внутри презентации → ключ её байтов в хранилище. */
  readonly assetIdByPath?: ReadonlyMap<string, string>;
  /** Шрифты, уже уложенные в хранилище. */
  readonly fonts?: readonly { readonly family: string; readonly assetId: string }[];
}

// pptx.ts — ДОБАВИТЬ в отчёт
export interface ImportReport {
  // …существующее; picturesWithoutBytes ОСТАВИТЬ: он теперь считает
  // картинки, для которых байты достать НЕ удалось…
  readonly picturesWithBytes: number;
  readonly fonts: number;
  readonly vectors: number;   // фигур, приехавших контуром
}
```

- [ ] **Шаг 1. Написать падающие юниты переходника**

```ts
it('картинка получает ключ байтов по своему пути', () => {
  const { project } = projectFromPptx(
    deckOf([{ type: 'picture', x: 0, y: 0, width: 10, height: 10,
              imagePath: 'ppt/media/image1.png' }]),
    { assetIdByPath: new Map([['ppt/media/image1.png', 'ключ-1']]) },
  );
  const el = project.segments[0]!.elements.find((e) => e.type === 'image')!;
  expect(el.assetId).toBe('ключ-1');
});

it('десять элементов на один файл дают ОДИН ключ на всех', () => {
  const один = { type: 'picture', x: 0, y: 0, width: 10, height: 10,
                 imagePath: 'ppt/media/image1.png' } as const;
  const { project } = projectFromPptx(deckOf([один, один, один]),
    { assetIdByPath: new Map([['ppt/media/image1.png', 'ключ-1']]) });
  const ключи = project.segments[0]!.elements
    .filter((e) => e.type === 'image').map((e) => e.assetId);
  expect(ключи).toEqual(['ключ-1', 'ключ-1', 'ключ-1']);
});

it('картинка БЕЗ байтов приезжает без ключа и попадает в отчёт', () => {
  const { project, report } = projectFromPptx(
    deckOf([{ type: 'picture', x: 0, y: 0, width: 10, height: 10,
              imagePath: 'ppt/media/нет.png' }]), {});
  expect(project.segments[0]!.elements[0]!.assetId).toBeUndefined();
  expect(report.picturesWithoutBytes).toBe(1);
});

it('произвольная фигура приезжает контуром в своей системе координат', () => {
  const { project } = projectFromPptx(deckOf([{
    type: 'shape', shapeType: 'custom', x: 0, y: 0, width: 100, height: 2,
    pathData: 'M 0 0 L 21844000 0 L 21844000 12700 L 0 12700 Z',
    pathWidth: 21844000, pathHeight: 12700,
    shapeStyle: { fillColor: '#B7B7BA' },
  }]));
  const el = project.segments[0]!.elements[0]!;
  expect(el.path).toEqual({
    d: 'M 0 0 L 21844000 0 L 21844000 12700 L 0 12700 Z',
    width: 21844000, height: 12700,
  });
});

it('краска фигуры едет СВОЙСТВАМИ, чтобы автор мог её сменить', () => {
  const { project } = projectFromPptx(deckOf([{
    type: 'shape', shapeType: 'custom', x: 0, y: 0, width: 10, height: 10,
    pathData: 'M 0 0 L 10 10', pathWidth: 10, pathHeight: 10,
    shapeStyle: { fillColor: '#B7B7BA' },
  }]));
  const style = project.segments[0]!.slides[0]!.states['p1-e0']!.style;
  expect(style['fill']).toBe('#B7B7BA');
});

it('пресетная линия становится контуром из угла в угол', () => {
  const { project } = projectFromPptx(deckOf([{
    type: 'shape', shapeType: 'line', x: 0, y: 0, width: 671, height: 348,
    shapeStyle: { strokeColor: '#000000', strokeWidth: 4 },
  }]));
  const el = project.segments[0]!.elements[0]!;
  expect(el.path).toEqual({ d: 'M 0 0 L 671 348', width: 671, height: 348 });
  const style = project.segments[0]!.slides[0]!.states['p1-e0']!.style;
  expect(style['stroke']).toBe('#000000');
  // БЕЗ единиц: в SVG это пользовательские единицы контура, и фикстура
  // `vectors.json` уже написана так же. Две формы записи одного и того же
  // разъехались бы молча.
  expect(style['stroke-width']).toBe('4');
  // Рамки быть не должно: раньше линия приезжала прямоугольником с border,
  // и это ровно тот дефект, который здесь чинится.
  expect(style['border']).toBeUndefined();
});

it('отражённая линия идёт из ДРУГОГО угла', () => {
  const { project } = projectFromPptx(deckOf([{
    type: 'shape', shapeType: 'line', x: 0, y: 0, width: 100, height: 50,
    flipHorizontal: true,
    shapeStyle: { strokeColor: '#000000', strokeWidth: 2 },
  }]));
  expect(project.segments[0]!.elements[0]!.path!.d).toBe('M 100 0 L 0 50');
});

it('линия НЕ отбрасывается правилом «ничего не рисует»', () => {
  // У линии нет заливки. Правило drawsSomething смотрит и на обводку,
  // но проверить надо: молча пропавшая стрелка — худший исход.
  const { report } = projectFromPptx(deckOf([{
    type: 'shape', shapeType: 'line', x: 0, y: 0, width: 10, height: 10,
    shapeStyle: { strokeColor: '#000000', strokeWidth: 1 },
  }]));
  expect(report.droppedInvisible).toBe(0);
  expect(report.vectors).toBe(1);
});

it('шрифты проекта приезжают списком', () => {
  const { project } = projectFromPptx(deckOf([text()]), {
    fonts: [{ family: 'Barlow Condensed', assetId: 'ш-1' }],
  });
  expect(project.fonts).toEqual([{ family: 'Barlow Condensed', assetId: 'ш-1' }]);
});
```

Правило направления линии, чтобы не гадать:

| flipH | flipV | контур |
|---|---|---|
| нет | нет | `M 0 0 L w h` |
| да | нет | `M w 0 L 0 h` |
| нет | да | `M 0 h L w 0` |
| да | да | `M w h L 0 0` |

- [ ] **Шаг 2. Прогнать, увидеть красное**

```
pnpm exec vitest run packages/editor/test/importPptx.test.ts
```

- [ ] **Шаг 3. Научить переходник новым полям**

В `pptx.ts`: в `walk` — проставлять `assetId` картинке по
`assetIdByPath`, строить `path` для `custom` и для `line`, класть
`fill`/`stroke`/`stroke-width` в стиль вместо `background`/`border`
для тех элементов, у которых появился контур. У фигур БЕЗ контура
оставить прежнее поведение — не ломай то, что уже зелено.

В `projectFromPptx` — прокинуть `options.fonts` в `draft.fonts`.

Правило «ничего не рисует» (`drawsSomething`) не трогай, но проверь
на тестах, что линия его проходит.

- [ ] **Шаг 4. Прогнать, увидеть зелёное**

- [ ] **Шаг 5. Научить мост доставать байты**

В `openPptx.ts` после `handler.load(bytes)`:

1. Собрать пути картинок: обойти дерево элементов всех страниц,
   набрать уникальные `imagePath`.
2. По каждому пути: `handler.getMediaArrayBuffer(path)` →
   `putBlob('images', { name: путь, type: типПоРасширению(путь), bytes })`
   → положить в `Map<путь, ключ>`.
   **Отказ по одному пути не должен ронять весь импорт**: путь просто
   не попадает в карту, картинка приезжает без ключа и считается
   в `picturesWithoutBytes`. Но и глушить молча нельзя — сосчитай.
3. По каждому `deck.embeddedFonts[i]`:
   `putBlob('fonts', { name: f.name, type: 'font/ttf', bytes: f.rawFontData })`
   → собрать `{ family: f.name, assetId }`.
   Байты брать из `rawFontData` (это `Uint8Array`), НЕ из `dataUrl`:
   разбирать base64 обратно — лишняя работа и лишний способ ошибиться.
4. Передать карту и шрифты доводом в `projectFromPptx`.

Тип картинки по расширению: `.png → image/png`, `.jpg`/`.jpeg →
image/jpeg`, `.svg → image/svg+xml`, `.gif → image/gif`,
иначе `application/octet-stream`.

- [ ] **Шаг 6. Дописать тест на настоящей библиотеке**

В блок «настоящая библиотека на настоящем файле» — проверку, что
`deck.embeddedFonts` вправду несёт два шрифта с ожидаемыми именами
и размерами (96 736 и 103 912 байт), и что у `canva-page-notes.pptx`
элементы несут `imagePath === 'ppt/media/image1.png'`.
Это единственное место, где ловится переименование поля в библиотеке.

- [ ] **Шаг 7. Прогнать юниты редактора, увидеть зелёное**

- [ ] **Шаг 8. Коммит**

```bash
git add packages/editor/src/import/pptx.ts packages/editor/src/import/openPptx.ts \
        packages/editor/test/importPptx.test.ts
git commit -m "Импорт достаёт вшитые шрифты, байты картинок и контуры фигур"
```

---

## Задача 4. Показ: шрифты, картинки и контуры на сцене

**Файлы:**
- Меняется: `packages/player/src/render.ts:390` (`renderScene`), `:219`
  (`ensureSheet` — рядом встанет `applyFonts`), `:225-299` (`applyElement`)
- Меняется: `packages/player/src/renderers/registry.ts:32` (картинка),
  `:38` (фигура)
- Меняется: `packages/player/src/player.ts:411` (`load`)

**Интерфейсы:**

```ts
// render.ts
/** Ключ байтов → адрес, по которому их можно показать. */
export type AssetUrls = ReadonlyMap<string, string>;

export function renderScene(
  host: HTMLElement,
  elements: readonly Element[],
  states: SlideStates,
  stage?: StageSize,
  assets?: AssetUrls,          // ← ДОБАВЛЕНО последним, чтобы не ломать зовущих
): Map<string, HTMLElement>;

/** Объявляет браузеру вшитые шрифты проекта. */
export function applyFonts(
  fonts: readonly { family: string; assetId: string }[],
  assets: AssetUrls,
): void;

// renderers/registry.ts — третий довод у рендерера
export type ElementDOMRenderer =
  (node: HTMLElement, element: Element, assets?: AssetUrls) => void;

// assets.ts (задача 2 уже дала putBlob/getBlob)
/** Готовит адреса всех байтов проекта. Зовётся ДО сборки сцены. */
export function resolveProjectAssets(project: Project): Promise<AssetUrls>;
```

- [ ] **Шаг 1. Написать падающие юниты рендера**

```ts
it('картинка с ключом получает адрес из карты', () => {
  const host = document.createElement('div');
  renderScene(host, [{ id: 'e1', type: 'image', content: '', assetId: 'к1' }],
    { e1: состояние() }, undefined, new Map([['к1', 'blob:тест']]));
  expect(host.querySelector('[data-id="e1"]')!.style.backgroundImage)
    .toContain('blob:тест');
});

it('картинка с ключом, которого нет в карте, НЕ рисует чужой адрес', () => {
  const host = document.createElement('div');
  renderScene(host, [{ id: 'e1', type: 'image', content: '', assetId: 'к1' }],
    { e1: состояние() }, undefined, new Map());
  expect(host.querySelector('[data-id="e1"]')!.style.backgroundImage).toBe('');
});

it('фигура с контуром рисует SVG, а не пустой прямоугольник', () => {
  const host = document.createElement('div');
  renderScene(host, [{ id: 'e1', type: 'shape', content: '',
    path: { d: 'M 0 0 L 10 5', width: 10, height: 5 } }], { e1: состояние() });
  const svg = host.querySelector('[data-id="e1"] svg')!;
  expect(svg.getAttribute('viewBox')).toBe('0 0 10 5');
  // preserveAspectRatio='none' обязателен: контур обязан растянуться
  // по габариту элемента, иначе фигура не совпадёт с исходником.
  expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
  expect(svg.querySelector('path')!.getAttribute('d')).toBe('M 0 0 L 10 5');
});

it('фигура БЕЗ контура остаётся как была', () => {
  const host = document.createElement('div');
  renderScene(host, [{ id: 'e1', type: 'shape', content: '' }], { e1: состояние() });
  expect(host.querySelector('[data-id="e1"] svg')).toBeNull();
});
```

Селектор `[data-id="e1"]` **проверен**: `render.ts:233` ставит
`node.dataset['id'] = element.id`. Тесты писать в существующий
`packages/player/test/renderers.test.ts`, не заводить новый файл.

- [ ] **Шаг 2. Прогнать, увидеть красное**

- [ ] **Шаг 3. Реализовать**

Картинка: `assets.get(element.assetId)` → `backgroundImage`. Если ключа
в карте нет — НЕ рисовать ничего и не подставлять `content`.
Если `assetId` нет вовсе, а `content` есть — прежнее поведение (адрес
или `data:`), чтобы старые проекты и фикстуры не сломались.

Фигура: если у элемента есть `path` — построить внутри узла
`<svg viewBox="0 0 {width} {height}" preserveAspectRatio="none">`
с одним `<path d="{d}">`, растянутый на 100% × 100%. Краску взять
из стиля состояния: `fill`, `stroke`, `stroke-width` перенести
на `<path>`. Если `fill` не задан — `fill="none"` (иначе браузер
зальёт чёрным по умолчанию, и линия превратится в кляксу).

`applyFonts`: на каждый шрифт — правило `@font-face` с
`font-family: "{family}"`, `src: url({адрес})`,
**`font-weight: 100 900`** (ловушка №1). Складывать в тот же лист
стилей, что делает `ensureSheet`, или в соседний с таким же приёмом
пометки — но НЕ заводить второй способ добавлять стили в документ.

- [ ] **Шаг 4. Прогнать, увидеть зелёное**

- [ ] **Шаг 5. Подготовка байтов до сборки сцены**

В `Player.load()` (`player.ts:411`), ПОСЛЕ `await clockFor(...)`
и ДО `this.#mountSegment()`:

```ts
this.#assets = await resolveProjectAssets(this.#project);
applyFonts(this.#project.fonts, this.#assets);
```

`resolveProjectAssets` обходит элементы всех сегментов, собирает
`assetId`, читает байты через `getBlob` и делает `URL.createObjectURL`.
Шрифты — из `project.fonts`. Карту прокинуть в `renderScene`.

Адреса надо освобождать: посмотри, как это уже сделано у озвучки
(`releaseAudioUrl`, `assets.ts:184`), и повтори приём при разрушении
плеера. Утечка на каждом переходе между сегментами — настоящая, а не
теоретическая.

- [ ] **Шаг 6. То же самое в редакторе**

Инвариант №5: автор обязан видеть картинки и шрифты в редакторе.
Найди, где редактор зовёт `renderScene`, и прокинь туда карту тем же
способом. **Это не «заодно», это часть задачи**: без этого автор
импортирует презентацию и увидит пустые места — ровно то, что чиним.

- [ ] **Шаг 7. Померить, что шрифт вправду применился**

Ловушка №1 отменена (см. общие ограничения) — синтетической жирности
здесь нет, чинить нечего. Но применение шрифта проверить надо, и только
ЛАТИНСКИМ текстом: кириллицы во вшитом шрифте нет, и на русском слове
проверка будет вечнозелёной.

Временный e2e: объяви вшитый шрифт через `applyFonts`, померь ширину
строки `Agency 12345` этим шрифтом и заведомо отсутствующим. Числа
обязаны РАЗОЙТИСЬ. Контроль: та же пара на слове `АГЕНТСТВО` обязана
СОВПАСТЬ — иначе прибор меряет не то, что ты думаешь.

Замерено контроллером: латиница 264.11 против 333.55, кириллица
592 против 592. Временный тест убрать, числа привести в отчёте.

- [ ] **Шаг 8. Прогнать юниты плеера и редактора**

- [ ] **Шаг 9. Коммит**

```bash
git add packages/player/src/render.ts packages/player/src/renderers/registry.ts \
        packages/player/src/player.ts packages/player/src/assets.ts
git commit -m "Показ: вшитые шрифты, картинки из хранилища, фигуры контуром"
```

---

## Задача 5. Приёмка в живом браузере

**Файлы:**
- Создаётся: `e2e/import-assets.spec.ts`
- Меняется: `packages/editor/src/Editor.tsx:2039` (строка отчёта автору)

- [ ] **Шаг 1. Дописать отчёт автору**

Строка после импорта обязана назвать новое:
картинок с содержимым, шрифтов, фигур контуром — и по-прежнему то,
что НЕ доехало. Молчать о срезанном нельзя.

- [ ] **Шаг 2а. Постоянная проверка хранилища в браузере**

Юниты до IndexedDB не достают (задача 2, шаг 1), поэтому единственная
постоянная проверка хранилища живёт здесь.

```ts
test('хранилище: байты кладутся и читаются, хранилища не путаются', async ({ page }) => {
  await openEditor(page);
  const итог = await page.evaluate(async () => {
    const m = await import('/src/assets.ts').catch(() => null);
    return m; // ← ЗАМЕНИ на настоящий способ дотянуться до assets из страницы
  });
  expect(итог).toBeTruthy();
});
```

**Способ дотянуться до хранилища из страницы возьми настоящий, а не этот
набросок.** Посмотри, как это уже сделано в `e2e/`: где-то там страница
уже обращается к внутренностям (например через `window.__project`).
Если такого входа нет — заведи его так же, как заведён существующий,
и скажи об этом в отчёте. Проверить надо ровно четыре вещи:
озвучка переживает обновление версии базы; байты читаются обратно
байт в байт; ключ картинки не читается из хранилища шрифтов;
отсутствующий ключ даёт `null`, а не отказ.

- [ ] **Шаг 2. Написать e2e**

```ts
test('картинки приезжают с содержимым, а не пустыми местами', async ({ page }) => {
  await openEditor(page);
  await importDeck(page, 'fixtures/import/canva-page-notes.pptx');

  const проект = await projectOf(page);
  const картинки = проект.segments[0]!.elements.filter((e) => e.type === 'image');
  expect(картинки.length).toBeGreaterThan(0);
  // Ключ есть у КАЖДОЙ и он ОДИН на всех: файл в презентации один.
  expect(new Set(картинки.map((e) => e.assetId)).size).toBe(1);
  expect(картинки[0]!.assetId).toBeTruthy();
});

test('картинка ВИДНА на сцене, а не только в данных', async ({ page }) => {
  // Проверка по видимому: тест на поле assetId остался бы зелёным
  // и в случае, когда рендер не получил ни одного адреса.
  await openEditor(page);
  await importDeck(page, 'fixtures/import/canva-page-notes.pptx');
  const фон = await page.evaluate(() => {
    const узлы = [...document.querySelectorAll('.player-stage *')] as HTMLElement[];
    return узлы.map((n) => n.style.backgroundImage).filter((v) => v.startsWith('blob:') || v.includes('url('));
  });
  expect(фон.length).toBeGreaterThan(0);
});

test('текст рисуется ВШИТЫМ шрифтом, а не запасным', async ({ page }) => {
  await openEditor(page);
  await importDeck(page, 'fixtures/import/canva-page-text.pptx');

  const ширины = await page.evaluate(() => {
    const мерить = (family: string, текст = 'Agency 12345') => {
      const s = document.createElement('span');
      s.textContent = текст;
      s.style.cssText = `position:absolute;left:-9999px;font-size:100px;`
        + `white-space:pre;font-family:${family}`;
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return Math.round(w * 100) / 100;
    };
    return {
      запасной: мерить('"XYZ-net-takogo", sans-serif'),
      вшитый: мерить('"Barlow Condensed", sans-serif'),
      // КОНТРОЛЬ на кириллице: вшитый шрифт её НЕ содержит (ловушка 1а),
      // поэтому эти два числа ОБЯЗАНЫ совпасть. Без контроля тест
      // не отличал бы «шрифт применился» от «шрифт тут не при чём».
      кирЗапасной: мерить('"XYZ-net-takogo", sans-serif', 'АГЕНТСТВО'),
      кирВшитый: мерить('"Barlow Condensed", sans-serif', 'АГЕНТСТВО'),
    };
  });
  // Замерено 27.08.2026: запасной 1259.19, вшитый 1062.5.
  // document.fonts.check() здесь НЕ годится — он врёт true на выдуманное имя.
  expect(ширины.вшитый).not.toBe(ширины.запасной);
  expect(ширины.вшитый).toBeLessThan(ширины.запасной);
  expect(ширины.кирВшитый).toBe(ширины.кирЗапасной);
});

test('линии приезжают контуром, а не рамкой', async ({ page }) => {
  await openEditor(page);
  await importDeck(page, 'fixtures/import/canva-page-text.pptx');
  const проект = await projectOf(page);
  const сКонтуром = проект.segments[0]!.elements.filter((e) => e.path);
  expect(сКонтуром.length).toBeGreaterThan(0);
  const состояния = проект.segments[0]!.slides[0]!.states;
  for (const el of сКонтуром) {
    expect(состояния[el.id]!.style['border']).toBeUndefined();
  }
});
```

`openEditor`, `importDeck`, `projectOf` — **взять из
`e2e/import-pptx.spec.ts`**, они там уже написаны и работают. Не пиши
их заново.

- [ ] **Шаг 3. Прогнать e2e импорта**

```
pnpm exec playwright test e2e/import-pptx.spec.ts e2e/import-assets.spec.ts --reporter=list
```
Ожидается зелёное. Прежние 4 теста ОБЯЗАНЫ остаться зелёными.

- [ ] **Шаг 4. Принять снимки новой фикстуры ГЛАЗАМИ**

Первый прогон `e2e/fixtures.spec.ts` после появления `vectors.json`
обязан быть КРАСНЫМ — эталонов ещё нет. Playwright запишет `actual`
в `e2e/__screenshots__/`. **Открой все пять и посмотри**: контуры
на месте, залитая фигура залита, линия — линия, а не клякса
и не прямоугольник. Только после этого принимай.

Если на снимке чёрная клякса вместо линии — не подгоняй порог,
это `fill` по умолчанию (см. задачу 4, шаг 3).

- [ ] **Шаг 5. Посмотреть импорт своими глазами**

Открой редактор, импортируй `canva-page-text.pptx`, сделай снимок
и **посмотри на него сам**. Числа могут сойтись при непохожем экране —
это в проекте случалось трижды. Сравни с тем, как страница выглядит
в Canva.

- [ ] **Шаг 6. Полный прогон**

```
pnpm check
```
Один за раз. Перед запуском убедись, что порт 5179 свободен.
**Смотри числа, а не код возврата.**

- [ ] **Шаг 7. Коммит**

```bash
git add e2e/import-assets.spec.ts e2e/__screenshots__ packages/editor/src/Editor.tsx
git commit -m "Приёмка: картинки, шрифты и контуры доезжают в живом браузере"
```

---

## Что этот план НЕ делает — названо вслух

- **Байты не переносятся вместе с файлом работы.** Решение владельца
  27.08.2026: как у озвучки. Перенёс проект на другой компьютер —
  импортируй презентацию заново.
- **Панель свойств не получает поля `fill`/`stroke`.** Они лягут
  в стиль элемента и будут работать, но отдельных органов управления
  для них в полосе свойств не появится. Отдельная задача.
- **Шрифт, которого в файле НЕТ, не подставляется похожим.** Если
  презентация выгружена без вшитых шрифтов, текст нарисуется запасным,
  и отчёт импорта обязан это назвать числом.
- **Замер производительности на 27 элементах не повторяется.** Долг
  из ADR-031 остаётся долгом.
