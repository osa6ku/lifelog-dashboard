import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendContext } from './helpers/load-scripts.mjs';

test('parseGasResponse handles non-JSON responses gracefully without crashing', async () => {
  const { ctx } = loadFrontendContext();
  await assert.rejects(
    () => ctx.parseGasResponse({
      ok: true,
      status: 200,
      async text() { return '<html>Error 502</html>'; },
    }),
    /JSON解析に失敗/
  );

  await assert.rejects(
    () => ctx.parseGasResponse({
      ok: false,
      status: 500,
      async text() { return 'Internal Server Error'; },
    }),
    /HTTP 500/
  );

  const okRes = await ctx.parseGasResponse({
    ok: true,
    status: 200,
    async text() { return JSON.stringify({ ok: true, id: 123 }); },
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.id, 123);
});

test('apiPost aborts and surfaces timeout error when fetch hangs', async () => {
  const hangingFetch = (_url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  const { ctx } = loadFrontendContext({ fetch: hangingFetch });
  await assert.rejects(
    () => ctx.apiPost('addDiary', { title: 't', body: 'b' }, 30),
    /タイムアウト/
  );
});

test('pending diary draft persists in localStorage and clears cleanly', () => {
  const { ctx } = loadFrontendContext();
  assert.equal(ctx.loadPendingDiaryDraft(), null);

  ctx.savePendingDiaryDraft({
    action: 'addDiary',
    clientRequestId: 'req-1',
    payload: { date: '2026-11-21', title: 'テスト', body: '本文保持テスト' },
  });
  const loaded = ctx.loadPendingDiaryDraft();
  assert.equal(loaded.action, 'addDiary');
  assert.equal(loaded.payload.body, '本文保持テスト');

  ctx.clearPendingDiaryDraft();
  assert.equal(ctx.loadPendingDiaryDraft(), null);
});

test('resolveGasApiUrl allows valid GAS staging override and rejects untrusted origins', () => {
  const stagingUrl = 'https://script.google.com/macros/s/STAGING_TEST_DEPLOYMENT_ID/exec';
  const { ctx: stagingCtx } = loadFrontendContext({
    location: { search: `?gasUrl=${encodeURIComponent(stagingUrl)}`, pathname: '/' },
  });
  assert.equal(stagingCtx.resolveGasApiUrl(), stagingUrl);

  const { ctx: evilCtx } = loadFrontendContext({
    location: { search: '?gasUrl=https://evil.example.com/exec', pathname: '/' },
  });
  assert.ok(evilCtx.resolveGasApiUrl().startsWith('https://script.google.com/macros/s/'));
  assert.notEqual(evilCtx.resolveGasApiUrl(), 'https://evil.example.com/exec');
});
