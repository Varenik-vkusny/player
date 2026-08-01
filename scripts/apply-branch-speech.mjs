// Переводит фикстуры с синусоидальных тонов на настоящую речь.
//
// Пара к make-branch-speech.py: тот синтезирует mp3, этот прописывает их
// в фикстуры. Одноразовый скрипт — фикстуры коммитятся, а не пересобираются.
//
// Меняются РОВНО два поля: `src` и `duration`. Слова НЕ добавляются
// намеренно: `e2e/mark-panel.spec.ts` требует, чтобы у части exit-branch
// расшифровка была пустой — это охраняет решение [Р] «ветка без озвучки
// законна» (product.md §2в). Настоящая речь доказывает себя тем, что играет
// и расшифровывается вживую, а не вписанными руками словами.
//
// Правка ТЕКСТОВАЯ, а не круговая через JSON.parse/stringify: фикстуры
// отформатированы по-разному — часть записей развёрнута, часть лежит
// компактными однострочниками, — и круг переформатировал бы файлы целиком,
// утопив содержательную правку в пробелах.
//
// Длительности взяты у ЖИВОГО декодера Chromium, а не у синтезатора:
// edge-tts сообщает конец последнего слова, а в файле после него ещё
// 0.85–0.90 с тишины. Та же грабля, что с demo.mp3 в Сессии 13.
//
// Запуск: node scripts/apply-branch-speech.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'fixtures', 'projects');

/** Замерено в Chromium 01.08.2026, `AudioContext.decodeAudioData().duration`. */
const REPLACEMENTS = {
  ask: 2.904,
  'branch-yes': 2.736,
  'branch-no': 2.400,
};

/** Сколько дорожек ожидается в каждом файле — считано грепом до правки. */
const EXPECTED = {
  branching: 2,
  conditions: 4,
  'exit-branch': 3,
  'inline-explain': 1,
  morph: 1,
};

let total = 0;

for (const [name, expected] of Object.entries(EXPECTED)) {
  const path = join(FIXTURES, `${name}.json`);
  let text = readFileSync(path, 'utf8');
  let hits = 0;

  for (const [stem, duration] of Object.entries(REPLACEMENTS)) {
    // Между `src` и `duration` может стоять `offset`, а может не стоять ничего:
    // окно ограничено, чтобы regexp не перескочил в СЛЕДУЮЩИЙ объект audio.
    const pattern = new RegExp(
      `("src":\\s*")/audio/${stem}\\.wav(",[\\s\\S]{0,80}?"duration":\\s*)[0-9.]+`,
      'g',
    );
    text = text.replace(pattern, (_m, head, middle) => {
      hits += 1;
      return `${head}/audio/${stem}.mp3${middle}${duration}`;
    });
  }

  if (hits !== expected) {
    throw new Error(
      `${name}.json: заменено ${hits} дорожек, ожидалось ${expected}. ` +
        'Либо фикстура изменилась, либо regexp не достал до duration — ' +
        'молча оставлять расхождение нельзя.',
    );
  }

  // Тон не должен остаться ни в одном виде — иначе замена была частичной.
  const leftover = text.match(/\/audio\/(ask|branch-yes|branch-no)\.wav/g);
  if (leftover) {
    throw new Error(`${name}.json: остались ссылки на тон: ${leftover.join(', ')}`);
  }

  writeFileSync(path, text, 'utf8');
  total += hits;
  console.log(`${name}.json — дорожек ${hits}`);
}

console.log(`\nВсего заменено дорожек: ${total}`);
