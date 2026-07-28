# Шрифты скриншотных тестов

Проверено: 2026-07-28

## Зачем

ADR-006: «Шрифты в скриншотных тестах не берутся из системы. Подключается один
самохостящийся шрифт, иначе набор шрифтов Windows против набора CI делает тесты
недетерминированными по причине, не связанной с кодом.»

Эталонные фикстуры просят `Georgia, serif` и `system-ui, sans-serif`. На Ubuntu
`Georgia` не существует вовсе, `system-ui` резолвится в другое семейство, чем на
Windows. Разница попадает в снимок и выглядит как регрессия рендера, хотя код
не менялся. Файлы здесь закрывают обе просьбы шрифтом из репозитория.

Фикстуры при этом не трогаются: подмена делается стилем тестовой страницы,
`fixtures/projects/*.json` остаются эталоном.

## Что лежит

Source Sans 3 и Source Serif 4 — открытое суперсемейство Adobe. Source Serif
задуман как парный к Source Sans («an open-source typeface to complement the
Source Sans family» — README проекта), поэтому засечный и рубленый берутся из
одного замысла, а не собираются из двух случайных. Начертания только
`400`/`700` `normal`: во всём репозитории фикстуры просят только их, курсива нет
нигде.

| Файл | Байт | Версия | SHA-256 |
|---|---:|---|---|
| `SourceSans3-Regular.ttf.woff2` | 109 632 | 3.052 | `53492fb3a0def77354f166a55d09b63a10855e91c206c7620a81cf56e97f8ec3` |
| `SourceSans3-Bold.ttf.woff2` | 108 640 | 3.052 | `8d35c6d40e750a4ee23bbbba2bd604ad098d172907369b43281507e16b8e2e7a` |
| `SourceSerif4-Regular.ttf.woff2` | 76 260 | 4.005 | `6b053e98f0838afe81f3e784727be4583a7c13bb42f198dc5202ecffee0aaee0` |
| `SourceSerif4-Bold.ttf.woff2` | 81 540 | 4.005 | `6d4fd4c0f08798a478fe34aafea9bf5cfa1cbc6ae4b834193febaee74254d10c` |

Всего 376 072 байта (367 KiB).

Имена файлов оставлены как у первоисточника, включая двойное расширение
`.ttf.woff2`: так видно, что это webfont-сборка из TTF-ветки, и файл ищется
по имени в апстриме без догадок.

## Откуда скачано

Ссылки закреплены на теги релизов, а не на ветку: `release` движется,
тег — нет.

```
https://raw.githubusercontent.com/adobe-fonts/source-sans/3.052R/WOFF2/TTF/SourceSans3-Regular.ttf.woff2
https://raw.githubusercontent.com/adobe-fonts/source-sans/3.052R/WOFF2/TTF/SourceSans3-Bold.ttf.woff2
https://raw.githubusercontent.com/adobe-fonts/source-serif/4.005R/WOFF2/TTF/SourceSerif4-Regular.ttf.woff2
https://raw.githubusercontent.com/adobe-fonts/source-serif/4.005R/WOFF2/TTF/SourceSerif4-Bold.ttf.woff2
```

WOFF2 собирает и публикует сам Adobe — конвертировать ничего не пришлось.
Формат `WOFF2/TTF` выбран не наугад: собственный CSS проекта
(`source-serif-text.css` в ветке `release`) первым в `src` ставит именно его.

Состояние проектов на 2026-07-28: `adobe-fonts/source-sans` и
`adobe-fonts/source-serif` не архивированы, последние коммиты 2025-10-28
и 2025-11-17. Актуальные релизы — 3.052R (2023-04-04) и 4.005R (2023-01-20);
более новых нет, для шрифта это нормально.

## Лицензия

**SIL Open Font License 1.1** для обоих семейств. Текст скачан из репозиториев
проектов, а не из агрегатора:

```
https://raw.githubusercontent.com/adobe-fonts/source-sans/3.052R/LICENSE.md   → LICENSE-SourceSans3.md
https://raw.githubusercontent.com/adobe-fonts/source-serif/4.005R/LICENSE.md  → LICENSE-SourceSerif4.md
```

Шапки файлов: «Copyright 2010-2022 Adobe … with Reserved Font Name 'Source'»
и «Copyright 2014 - 2023 Adobe … with Reserved Font Name 'Source'», далее
«This Font Software is licensed under the SIL Open Font License, Version 1.1».

OFL 1.1 разрешает использование, встраивание и распространение вместе с
исходниками. Ограничения, которые нас касаются: файлы нельзя продавать
отдельно, а при изменении шрифта его нельзя оставлять под именем
Reserved Font Name «Source». Мы файлы не меняем — значит, достаточно держать
рядом текст лицензии, что и сделано. Ограничения GSAP, из-за которых он
запрещён инвариантом №5, здесь отсутствуют: OFL не говорит ничего про то,
какое ПО можно писать.

## Как подключать

Фрагмент ниже вставляется в тестовую страницу. `render.ts` кладёт стили
фикстуры **инлайном** (`style.setProperty` без приоритета), поэтому подмена
идёт через `!important` — иначе инлайн победит. Пути — от корня, по которому
раздаётся эта папка; при другой раскладке правится только `url()`.

```css
/* Шрифты скриншотных тестов. См. e2e/fonts/README.md и ADR-006. */

@font-face {
  font-family: "Source Serif 4";
  src: url("/fonts/SourceSerif4-Regular.ttf.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "Source Serif 4";
  src: url("/fonts/SourceSerif4-Bold.ttf.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "Source Sans 3";
  src: url("/fonts/SourceSans3-Regular.ttf.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "Source Sans 3";
  src: url("/fonts/SourceSans3-Bold.ttf.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: block;
}

/* Обвязка страницы (кнопки гейта, отладочная панель) — тоже не из системы. */
html,
body,
button,
input,
select,
textarea {
  font-family: "Source Sans 3", sans-serif;
}

/* Всё, что нарисовал рендер, по умолчанию рубленый: system-ui, sans-serif
   и любое неизвестное семейство приходят сюда и становятся определёнными. */
.scene-el {
  font-family: "Source Sans 3", sans-serif !important;
}

/* Элемент просил засечный (Georgia, serif) — отдаём засечный. Условие
   написано от generic-семейства, а не от слова Georgia: правило переживёт
   фикстуру, где вместо Georgia будет другое засечное имя. */
.scene-el[style*="serif"]:not([style*="sans-serif"]) {
  font-family: "Source Serif 4", serif !important;
}
```

`font-display: block` выбран намеренно: `swap` означает кадр, отрисованный
запасным шрифтом, а такой кадр может попасть в снимок. Перед снимком всё равно
нужно дождаться `document.fonts.ready` — CSS сам по себе гарантии не даёт.

## Что проверено

- Все четыре файла начинаются с `wOF2`, длина ненулевая.
- Покрытие читалось **из самих woff2** (brotli + таблица `cmap`), а не из
  desktop-TTF: webfont-сборка отличается от TTF набором таблиц (14 против 19),
  поэтому вывод по TTF не был бы выводом по тому, что лежит в репозитории.
  Результат: `usWeightClass` 400/400/700/700; кириллица U+0400..04FF — 156
  символов в Source Sans, 150 в Source Serif; русский алфавит с Ё и ё покрыт
  полностью; ни одного непокрытого символа из текстов всех пяти фикстур.
- Фрагмент выше прогнан в Chromium на разметке, повторяющей `applyElement`:
  оба woff2 отдаются с кодом 200, `document.fonts.check` истинен для обоих,
  вычисленные семейства — `"Source Serif 4", serif` и `"Source Sans 3",
  sans-serif`. Один и тот же заголовок 68px/700 занимает 710.33 px подменённым
  шрифтом против 780.75 px системной Georgia — подмена меняет отрисовку,
  а не только строку в `getComputedStyle`.

## Чего здесь нет

Курсива, промежуточных весов и оптических размеров Source Serif (`Caption`,
`Display`, `Subhead`, `SmText`). Понадобится начертание — оно берётся из того же
релиза по той же схеме имён, и эта таблица дополняется.
