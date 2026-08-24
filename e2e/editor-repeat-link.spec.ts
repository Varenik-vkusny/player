/**
 * Подсказка автору «повтор» на ребре назад (задача 11, Сессии 15, круг правок 1).
 *
 * `leadsBack` (packages/editor/src/state/exits.ts) верно отвечает на вопрос
 * «ведёт ли цель назад» — это закрыто юнитом в exits.test.ts. Но между чистой
 * функцией и глазами автора стоят `useMemo`, два `<select>` и склейка строки
 * в SegmentPanel.tsx, и именно в таком промежутке в этой же сессии уже прятался
 * дефект: состояние было верным, а зритель надписи не видел («видимость не
 * равна наличию», CLAUDE.md). Этот тест проверяет РЕНДЕР — текст варианта
 * в разметке `<option>`, а не результат `leadsBack` и не React-состояние.
 *
 * fixtures/projects/repeat.json уже несёт ребро назад по построению: часть
 * `s-b` правилом `r-repeat` (исход «неверно») возвращает в `s-a`, а правилом
 * `r-end` (исход «верно») ведёт вперёд, в `s-end`. Но оба исхода `s-b`
 * покрыты правилами с рождения фикстуры — панель «Непокрыто» пуста,
 * `<select>` цели не отрисован. Чтобы добраться до него без правки фикстуры,
 * тест снимает ребро `r-repeat` прямо в редакторе (кнопка «снять», уже
 * стоит в панели): это открывает дыру покрытия «ответБ: неверно», и панель
 * рисует `<select>` цели для этой дыры — тот самый, что помечает варианты
 * словом «повтор».
 */
import { expect, test, type Page } from '@playwright/test';
import { openChapters } from './panels.js';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

test.describe('подсказка «повтор» в выборе цели правила выхода', () => {
  test('цель, ведущая назад, помечена словом «повтор» в разметке; ведущая вперёд — нет', async ({ page }) => {
    await openEditor(page, 'repeat');
    await openChapters(page);

    // Часть B — та, у которой есть ребро назад (в A) и ребро вперёд (в конец).
    await page.getByTestId('segment-s-b').click();

    // Оба исхода s-b покрыты правилами с рождения фикстуры — дыры нет,
    // <select> цели ещё не отрисован. Снимаем ребро назад, чтобы открыть дыру.
    await page.getByTestId('exit-disconnect-r-repeat').click();

    const select = page.getByTestId('exit-target-ответБ-wrong');
    await expect(select).toBeAttached();

    // Читаем именно из отрисованной разметки — textContent варианта, а не
    // состояние React и не прямой вызов leadsBack.
    const backOptionText = await select.locator('option[value="s-a"]').textContent();
    const forwardOptionText = await select.locator('option[value="s-end"]').textContent();

    // s-a ведёт назад: из s-a обход выхода идёт default → s-b → (после снятия
    // r-repeat) r-end → s-end, то есть из s-a можно дойти обратно до текущей
    // части s-b — leadsBack(p, 's-b', 's-a') истинно.
    expect(backOptionText, 'цель s-a ведёт назад к текущей части s-b — должна быть помечена').toContain('(повтор)');
    // s-end — тупик выхода (правил и default у него нет), обратно до s-b
    // из него дойти нельзя — не повтор.
    expect(forwardOptionText, 'цель s-end вперёд не возвращает к s-b — помечать нельзя').not.toContain('(повтор)');
  });
});
