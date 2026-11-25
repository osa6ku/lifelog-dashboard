import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadFrontendContext } from './helpers/load-scripts.mjs';

test('3-52 openDiaryModal auto-fills local HH:MM, openEditDiaryModal preserves saved time, and submitDiary honors explicit empty time', async () => {
  const posted = [];
  const mockFetch = async (_url, init) => {
    if (!init || !init.body) {
      return {
        ok: true,
        async text() {
          return JSON.stringify({ ok: true, entries: [] });
        },
      };
    }
    const body = JSON.parse(init.body);
    posted.push(body);
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          ok: true,
          entry: {
            row: 10,
            id: 2577,
            date: body.payload.date,
            weekday: '水',
            time: body.payload.time,
            title: body.payload.title,
            body: body.payload.body,
            location: '',
            locations: [],
            imageCount: 0,
            imageUrls: [],
            imageIds: [],
          },
        });
      },
    };
  };

  const { ctx, elements } = loadFrontendContext({
    fetch: mockFetch,
    extraGlobals: {
      IntersectionObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    },
  });
  // Seed mealData & diaryData to avoid background GET calls
  vm.runInContext(`
    mealData = [{ row: 1, id: 1, date: '2026-11-20', mealType: '昼食', dishName: 'カレー' }];
    diaryData = [{
      row: 2, id: 100, date: '2026-11-20', weekday: '金', time: '7:36',
      title: '既存日記', body: '既存本文', location: '', locations: [],
      imageCount: 0, imageUrls: [], imageIds: []
    }];
  `, ctx);
  ctx.document.getElementById('diary-list').querySelectorAll = () => [];

  // 1. New diary modal auto-fills HH:MM
  ctx.openDiaryModal();
  const initialTime = elements.get('d-time').value;
  assert.match(initialTime, /^\d{2}:\d{2}$/);

  // 2. Submitting without clearing time sends the auto-filled time
  elements.get('d-body').value = '新規本文';
  elements.get('d-photos').files = [];
  await ctx.submitDiary();
  await new Promise(r => setTimeout(r, 15));
  assert.equal(posted[0].action, 'addDiary');
  assert.equal(posted[0].payload.time, initialTime);

  // 3. Clearing time explicitly sends "" (not undefined)
  ctx.openDiaryModal();
  elements.get('d-time').value = '';
  elements.get('d-body').value = '時刻クリア本文';
  elements.get('d-photos').files = [];
  await ctx.submitDiary();
  await new Promise(r => setTimeout(r, 15));
  assert.equal(posted[1].action, 'addDiary');
  assert.equal(posted[1].payload.time, '');

  // 4. Editing existing diary preserves saved time (normalized to HH:MM)
  ctx.openEditDiaryModal(2, 100);
  assert.equal(elements.get('d-time').value, '07:36');
});

test('3-53 year navigation restricts stepping to existing years, disables out-of-range buttons, and renders year counts', () => {
  const { ctx, elements } = loadFrontendContext();
  const yearCounts = [
    { year: 2026, count: 325 },
    { year: 2025, count: 358 },
    { year: 2012, count: 3 },
  ];

  // Stepping from recent ('')
  assert.equal(ctx.stepAvailableYear('', 1, yearCounts), null); // no future 2027
  assert.equal(ctx.stepAvailableYear('', -1, yearCounts), '2025');

  // Stepping across non-contiguous years (2025 -> 2012, never 2024)
  assert.equal(ctx.stepAvailableYear('2025', -1, yearCounts), '2012');
  assert.equal(ctx.stepAvailableYear('2012', -1, yearCounts), null);
  assert.equal(ctx.stepAvailableYear('2012', 1, yearCounts), '2025');
  assert.equal(ctx.stepAvailableYear('2026', 1, yearCounts), null);

  // Picker options & disabled states
  ctx.renderYearPicker('diary', yearCounts, '');
  const selHtml = elements.get('diary-year-select').innerHTML;
  assert.ok(selHtml.includes('2026年 (325)'));
  assert.ok(selHtml.includes('2025年 (358)'));
  assert.ok(selHtml.includes('2012年 (3)'));
  assert.equal(elements.get('diary-year-prev').disabled, false);
  assert.equal(elements.get('diary-year-next').disabled, true);

  ctx.updateYearNavButtons('diary', '2012', yearCounts);
  assert.equal(elements.get('diary-year-prev').disabled, true);
  assert.equal(elements.get('diary-year-next').disabled, false);
});
