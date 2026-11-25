import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadFrontendContext } from './helpers/load-scripts.mjs';

test('3-57 IME guard blocks Enter during isComposing, keyCode 229, and immediately after compositionend (Safari), and allows plain Enter afterwards', () => {
  const { ctx } = loadFrontendContext();
  const inputEl = ctx.document.getElementById('w-cast-input');

  // 1. isComposing: true -> blocked
  assert.equal(ctx.isPlainEnterKey({ key: 'Enter', isComposing: true, keyCode: 13 }, inputEl, 1000), false);

  // 2. keyCode: 229 -> blocked
  assert.equal(ctx.isPlainEnterKey({ key: 'Enter', isComposing: false, keyCode: 229 }, inputEl, 1000), false);

  // 3. compositionstart -> compositionend -> immediate Enter (Safari behavior) -> blocked
  ctx.recordImeCompositionStart(inputEl);
  assert.equal(ctx.isPlainEnterKey({ key: 'Enter', isComposing: false, keyCode: 13 }, inputEl, 1000), false);

  ctx.recordImeCompositionEnd(inputEl, 2000);
  // 20ms after compositionend (Safari fires keydown Enter immediately after compositionend) -> blocked
  assert.equal(ctx.isPlainEnterKey({ key: 'Enter', isComposing: false, keyCode: 13 }, inputEl, 2020), false);

  // 4. Plain Enter after composition has settled (e.g. 250ms later) -> allowed, chip added cleanly
  assert.equal(ctx.isPlainEnterKey({ key: 'Enter', isComposing: false, keyCode: 13 }, inputEl, 2250), true);
  inputEl.value = '吉田羊';
  ctx.addWatchPersonFromInput('cast');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.getWatchPersonChipList('cast'))), ['吉田羊']);
});

test('3-57 all inline Enter keydown handlers in index.html and js/*.js use isPlainEnterKey IME guard', () => {
  const repo = process.cwd();
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const diaryJs = fs.readFileSync(path.join(repo, 'js/diary.js'), 'utf8');
  assert.equal(/onkeydown="[^"]*event\.key\s*===\s*'Enter'/.test(html), false, 'index.html must not have unguarded Enter keydown');
  assert.equal(/onkeydown="[^"]*event\.key\s*===\s*'Enter'/.test(diaryJs), false, 'js/diary.js must not have unguarded Enter keydown');
  assert.ok((html.match(/isPlainEnterKey\(/g) || []).length >= 6);
  assert.ok((diaryJs.match(/isPlainEnterKey\(/g) || []).length >= 1);
});
