import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadProject } from '../src/load.js';

describe('scratch', () => {
  it('печатает слайды demo.json после миграции', () => {
    const raw = JSON.parse(
      readFileSync(new URL('../../../fixtures/projects/demo.json', import.meta.url), 'utf8'),
    );
    const p = loadProject(raw) as any;
    const out: string[] = [];
    const console = { log: (...a: unknown[]) => out.push(a.map(String).join(' ')) };
    console.log('версия после миграции:', p.schemaVersion);
    console.log('сегментов:', p.segments?.length);
    for (const seg of p.segments ?? []) {
      const slides = seg.slides ?? [];
      console.log(`\nсегмент ${seg.id}: слайдов ${slides.length}`);
      let same = 0;
      for (let i = 1; i < slides.length; i++) {
        const a = JSON.stringify(slides[i - 1].states);
        const b = JSON.stringify(slides[i].states);
        const mark = a === b ? '  <<< ИДЕНТИЧНЫ' : '';
        console.log(
          `  ${String(i - 1).padStart(2)}->${String(i).padStart(2)}  at=${JSON.stringify(slides[i].at)}${mark}`,
        );
        if (a === b) same++;
      }
      console.log(`итого идентичных переходов: ${same} из ${Math.max(0, slides.length - 1)}`);
      console.log('первый слайд at:', JSON.stringify(slides[0]?.at));
      console.log('ключи слайда:', Object.keys(slides[0] ?? {}));
    }
    writeFileSync('scratch-slides.txt', out.join('\n'), 'utf8');
  });
});
