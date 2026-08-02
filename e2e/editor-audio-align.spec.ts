/**
 * Замена озвучки и расшифровка — одно действие (task-7).
 *
 * До этой задачи автор заменял озвучку и расшифровывал её ДВУМЯ отдельными
 * действиями, и между ними старая расшифровка уже уничтожена — поэтому все
 * метки, привязанные к слову, молча переезжали в секунды. Кнопка «Заменить
 * озвучку и расшифровать» склеивает оба шага в один: расшифровка нового
 * файла приходит в ТОМ ЖЕ dispatch, что и замена, и перенос меток строится
 * сопоставлением старого транскрипта с новым (`retargetByAlignment`),
 * а не потерей привязки.
 *
 * Тест нажимает по ВИДИМЫМ кнопкам (загрузка файла — единственное
 * исключение: нативный диалог выбора файла автоматизировать нечем, и
 * `setInputFiles` — стандартный способ Playwright дать браузеру реальный
 * `change` на `<input type="file">`, а не вызов обработчика в обход DOM).
 * Расшифровка нового файла мокается ТЕМИ ЖЕ словами, что уже стоят
 * в фикстуре: `alignWords` увидит их как «same», и метка, стоявшая на слове
 * ДО замены, обязана остаться на слове ПОСЛЕ.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface TimeRef {
  readonly kind: string;
}

interface Segment {
  readonly id: string;
  readonly audio: {
    readonly words: readonly Word[];
    readonly fileId?: string;
    readonly src?: string;
  };
  readonly slides: readonly { readonly at: TimeRef }[];
  readonly gates: readonly { readonly at: TimeRef }[];
}

interface Project {
  readonly entry: string;
  readonly segments: readonly Segment[];
}

async function openEditor(page: Page, fixture: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  return errors;
}

async function currentProject(page: Page): Promise<Project> {
  return page.evaluate(() => (window as unknown as { __project: Project }).__project);
}

function currentSegment(project: Project): Segment {
  const segment = project.segments.find((candidate) => candidate.id === project.entry);
  if (!segment) throw new Error(`Стартового куска «${project.entry}» нет в проекте`);
  return segment;
}

/** Настоящие байты демо-дорожки — decodeAudioData требует настоящий звук. */
const DEMO_MP3 = readFileSync(new URL('../apps/playground/public/audio/demo.mp3', import.meta.url));

/**
 * Мокает `/api/transcribe` теми же словами, что уже стоят в проекте:
 * `alignWords` увидит их как «same», и перенос меток гарантирован,
 * а не зависит от того, что вернул бы настоящий Deepgram на новый файл.
 */
async function mockTranscribeWithSameWords(page: Page, words: readonly Word[]): Promise<void> {
  await page.route('**/api/transcribe*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        words: words.map((w) => ({ text: w.text, start: w.start, end: w.end, confidence: 0.99 })),
        transcript: words.map((w) => w.text).join(' '),
        durationSeconds: words.at(-1)?.end ?? 1,
      }),
    });
  });
}

test.describe('замена озвучки и расшифровка — одно действие', () => {
  test('заменить озвучку и расшифровать: метка остаётся на слове, отчёт виден', async ({ page }) => {
    const errors = await openEditor(page, 'demo');

    const before = currentSegment(await currentProject(page));
    const wordMarksBefore = [...before.slides, ...before.gates].filter((mark) => mark.at.kind === 'word').length;
    expect(wordMarksBefore, 'фикстура demo обязана нести хотя бы одну метку на слове до замены').toBeGreaterThan(0);

    await mockTranscribeWithSameWords(page, before.audio.words);

    await page.getByTestId('audio-file-input').setInputFiles({
      name: 'своя-дорожка.mp3',
      mimeType: 'audio/mpeg',
      buffer: DEMO_MP3,
    });

    await expect(page.getByTestId('audio-replace-confirm')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('audio-replace-transcribe').click();

    // Отчёт — то, что реально видит автор, а не факт вызова dispatch.
    const report = page.getByTestId('audio-retarget-report');
    await expect(report).toBeVisible({ timeout: 15_000 });
    await expect(report).toContainText('Перенесено');

    const after = currentSegment(await currentProject(page));
    expect(after.audio.words.length, 'новая расшифровка обязана лечь в audio.words').toBe(before.audio.words.length);

    const wordMarksAfter = [...after.slides, ...after.gates].filter((mark) => mark.at.kind === 'word');
    expect(wordMarksAfter.length, 'хотя бы одна метка обязана остаться на слове после замены').toBeGreaterThan(0);

    expect(errors, 'страница не должна была упасть в консоль или бросить ошибку').toEqual([]);
  });

  /**
   * НЕСУЩИЙ тест на проводку, а не на редьюсер: юнит `project.test.ts`
   * («замена — ОДИН шаг истории») зелёный для ЛЮБОГО одиночного `dispatch`
   * — он проверяет `historyReducer`, а не то, сколько раз кнопка реально
   * зовёт `dispatch`. Риск живёт именно в цепочке «кнопка → AudioSourcePanel
   * → Editor.tsx»: если бы кто-то однажды разбил один клик на ДВА dispatch
   * (например, сперва `replaceSegmentAudio` без `words`, потом отдельно
   * `setSegmentWords`), юнит-тест этого не заметит вовсе — historyReducer
   * увеличит `past.length` на 1 при каждом вызове, независимо от того,
   * сколько вызовов было.
   *
   * Единственный способ поймать разбитую проводку — пройти её целиком:
   * нажать видимую кнопку, затем нажать ОДНУ видимую кнопку «Отменить»
   * и проверить, что вернулись ОБА следствия замены (дорожка и расшифровка)
   * разом. Если бы шагов истории было два, один клик «Отменить» откатил бы
   * только последний — либо дорожка осталась бы новой при пустых словах,
   * либо слова остались бы новыми при старой дорожке. Это состояние,
   * которого не бывает, и тест обязан его ловить.
   */
  test('Ctrl+Z один раз возвращает и дорожку, и расшифровку разом', async ({ page }) => {
    const errors = await openEditor(page, 'demo');

    const before = currentSegment(await currentProject(page));
    const beforeAudioKey = before.audio.fileId ?? before.audio.src;
    const beforeWordsLength = before.audio.words.length;

    await mockTranscribeWithSameWords(page, before.audio.words);

    await page.getByTestId('audio-file-input').setInputFiles({
      name: 'своя-дорожка-2.mp3',
      mimeType: 'audio/mpeg',
      buffer: DEMO_MP3,
    });

    await expect(page.getByTestId('audio-replace-confirm')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('audio-replace-transcribe').click();
    await expect(page.getByTestId('audio-retarget-report')).toBeVisible({ timeout: 15_000 });

    const replaced = currentSegment(await currentProject(page));
    const replacedAudioKey = replaced.audio.fileId ?? replaced.audio.src;
    // Замена действительно произошла — иначе проверка «вернулось после
    // Ctrl+Z» была бы верна тривиально, сравнивать было бы не с чем.
    expect(replacedAudioKey, 'дорожка обязана была смениться после замены').not.toBe(beforeAudioKey);
    expect(replaced.audio.words.length, 'расшифровка обязана была лечь в дорожку').toBeGreaterThan(0);

    // Одна ВИДИМАЯ кнопка «Отменить» в шапке редактора — не программный
    // dispatch({ type: 'undo' }) в обход интерфейса.
    await page.getByRole('button', { name: 'Отменить' }).click();

    const afterUndo = currentSegment(await currentProject(page));
    const afterUndoAudioKey = afterUndo.audio.fileId ?? afterUndo.audio.src;
    expect(afterUndoAudioKey, 'один клик «Отменить» обязан вернуть дорожку').toBe(beforeAudioKey);
    expect(afterUndo.audio.words.length, 'один клик «Отменить» обязан вернуть расшифровку').toBe(beforeWordsLength);

    // Больше отменять нечего: если бы замена была двумя шагами, здесь
    // кнопка «Отменить» осталась бы активной (второй шаг ещё ждал бы отмены).
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeDisabled();

    expect(errors, 'страница не должна была упасть в консоль или бросить ошибку').toEqual([]);
  });
});
