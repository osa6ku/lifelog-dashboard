import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGasContext, loadFrontendContext } from './helpers/load-scripts.mjs';

function makeMockWikiFetcher(routes) {
  return {
    fetch(url) {
      const handler = routes.find(r => r.match(url));
      const payload = handler ? handler.response(url) : { query: {} };
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(payload),
      };
    },
  };
}

test('3-58 A: cleanWorkTitle_ strips prefixes, brackets, episode notes, volume labels, English parens, and symbol noise', () => {
  const { ctx } = loadGasContext();

  assert.equal(ctx.cleanWorkTitle_('鎌倉殿の13人 41-last'), '鎌倉殿の13人');
  assert.equal(ctx.cleanWorkTitle_('白夜行 上巻'), '白夜行');
  assert.equal(ctx.cleanWorkTitle_('きっと、うまくいく(3 idiots)'), 'きっと、うまくいく');
  assert.equal(ctx.cleanWorkTitle_('mission impossible _ ghost protocol'), 'mission impossible ghost protocol');
  assert.equal(ctx.cleanWorkTitle_('[映画] 『パラレルワールド・ラブストーリー』'), 'パラレルワールド・ラブストーリー');
  assert.equal(ctx.cleanWorkTitle_('ドラマ：ドラゴン桜（第2シリーズ）'), 'ドラゴン桜');
  assert.equal(ctx.isEnglishTitle_('Cars 2'), true);
  assert.equal(ctx.isEnglishTitle_('mission impossible _ ghost protocol'), true);
  assert.equal(ctx.isEnglishTitle_('ドラゴン桜'), false);
});

test('3-58 A: isTitleRelevant_ rejects unrelated articles and allows official redirects', () => {
  const { ctx } = loadGasContext();

  // Unrelated works must be rejected
  assert.equal(ctx.isTitleRelevant_({ title: '変身 (東野圭吾)' }, 'パラレルワールド・ラブストーリー'), false);
  assert.equal(ctx.isTitleRelevant_({ title: 'ロング・トール・サリー' }, 'トールガール'), false);
  assert.equal(ctx.isTitleRelevant_({ title: '第73回NHK紅白歌合戦' }, ctx.cleanWorkTitle_('鎌倉殿の13人 41-last')), false);
  assert.equal(ctx.isTitleRelevant_({ title: '大藪春彦賞' }, 'アンチェルの蝶'), false);
  assert.equal(ctx.isTitleRelevant_({ title: '100カロール・クラブ' }, 'きっと、うまくいく'), false);

  // Exact or disambiguation suffix matches are accepted
  assert.equal(ctx.isTitleRelevant_({ title: '変身 (東野圭吾)' }, '変身'), true);
  assert.equal(ctx.isTitleRelevant_({ title: '鎌倉殿の13人' }, ctx.cleanWorkTitle_('鎌倉殿の13人 41-last')), true);

  // Official redirect source matches are allowed
  assert.equal(ctx.isTitleRelevant_({ title: 'ゲームの名は誘拐', redirected: true, redirectFrom: 'g@me' }, 'g@me'), true);
  assert.equal(ctx.isTitleRelevant_({ title: '身分帳', redirected: true, redirectFrom: 'すばらしき世界' }, 'すばらしき世界'), true);
});

test('3-58 B: extractReleaseYear_ handles series/season year, excludes novel year for drama/film, and enforces watchYear ceiling', () => {
  const { ctx } = loadGasContext();

  // Case 1: ドラゴン桜 (2021 season watched in 2021 vs 2005 series start)
  const rDragon = ctx.extractReleaseYear_(
    {
      extract: '『ドラゴン桜』は、三田紀房による日本の漫画作品。2005年にTBSでテレビドラマ化され、2021年4月25日から6月27日まで第2シリーズが放送された。',
      wikitext: '',
    },
    'ドラマ',
    { watchDate: '2021-06-27' }
  );
  assert.equal(String(rDragon.year), '2021');
  assert.equal(rDragon.yearWarning, '');

  // Case 2: アンという名の少女 (2017 drama vs 1908 novel)
  const rAnne = ctx.extractReleaseYear_(
    {
      extract: '『アンという名の少女』は、1908年に出版されたルーシー・モード・モンゴメリの小説『赤毛のアン』を原作とするカナダのテレビドラマシリーズ。2017年にCBCで放送開始され、Netflixで配信された。',
      wikitext: '',
    },
    'ドラマ',
    { watchDate: '2020-05-01' }
  );
  assert.equal(String(rAnne.year), '2017');
  assert.equal(rAnne.yearWarning, '');

  // Case 3: THE CROODS (watched 2013; 2013 film vs 2020 sequel)
  const rCroods = ctx.extractReleaseYear_(
    {
      extract: 'The Croods is a 2013 American animated adventure comedy film produced by DreamWorks Animation. A sequel, The Croods: A New Age, was released in 2020.',
      wikitext: '',
    },
    '映画',
    { watchDate: '2013-08-10' }
  );
  assert.equal(String(rCroods.year), '2013');
  assert.equal(rCroods.yearWarning, '');

  // Case 4: Only future year (> watchYear) -> rejected with warning
  const rFuture = ctx.extractReleaseYear_(
    {
      extract: '『クルードさんちのあたらしい冒険』は、2020年公開のアメリカ合衆国のアニメ映画。',
      wikitext: '',
    },
    '映画',
    { watchDate: '2013-08-10' }
  );
  assert.equal(rFuture.year, '');
  assert.ok(rFuture.yearWarning.includes('2020'));
  assert.ok(rFuture.yearWarning.includes('2013'));
});

test('3-58 B: searchWikipediaCandidates_ prioritizes relatedUrl, uses staff/memo hints, and resolves English titles via en.wiki -> ja langlink', () => {
  const routes = [
    // Direct relatedUrl lookup
    {
      match: (u) => u.includes('ja.wikipedia.org') && u.includes('titles=' + encodeURIComponent('パラレルワールド・ラブストーリー')),
      response: () => ({
        query: {
          pages: {
            '101': {
              pageid: 101,
              title: 'パラレルワールド・ラブストーリー',
              extract: '『パラレルワールド・ラブストーリー』は、東野圭吾による日本の長編小説。1995年に刊行され、2019年に映画化された。',
              categories: [{ title: 'Category:東野圭吾の小説' }, { title: 'Category:2019年の映画' }],
            },
          },
        },
      }),
    },
    // Staff + memo hint scoring for 変身
    {
      match: (u) => u.includes('ja.wikipedia.org') && u.includes('titles=' + encodeURIComponent('変身 (東野圭吾)')),
      response: () => ({
        query: {
          pages: {
            '201': {
              pageid: 201,
              title: '変身 (東野圭吾)',
              extract: '『変身』は、東野圭吾による日本の小説。1991年刊行。脳移植を受けた成瀬純一を描くサスペンス。',
              categories: [{ title: 'Category:東野圭吾の小説' }],
            },
          },
        },
      }),
    },
    {
      match: (u) => u.includes('ja.wikipedia.org') && u.includes('titles=' + encodeURIComponent('変身')),
      response: () => ({
        query: {
          pages: {
            '202': {
              pageid: 202,
              title: '変身',
              extract: '変身とは、姿を変えることを指す一般用語。特撮ヒーロー番組などで用いられる。',
              categories: [{ title: 'Category:フィクションの要素' }],
            },
          },
        },
      }),
    },
    // English title -> en.wikipedia.org with ja langlink -> ja.wikipedia.org
    {
      match: (u) => u.includes('en.wikipedia.org') && u.includes('titles=' + encodeURIComponent('Cars 2')),
      response: () => ({
        query: {
          pages: {
            '301': {
              pageid: 301,
              title: 'Cars 2',
              extract: 'Cars 2 is a 2011 American animated spy comedy film produced by Pixar Animation Studios.',
              categories: [{ title: 'Category:2011 films' }],
              langlinks: [{ lang: 'ja', '*': 'カーズ2' }],
            },
          },
        },
      }),
    },
    {
      match: (u) => u.includes('ja.wikipedia.org') && u.includes('titles=' + encodeURIComponent('カーズ2')),
      response: () => ({
        query: {
          pages: {
            '302': {
              pageid: 302,
              title: 'カーズ2',
              extract: '『カーズ2』（Cars 2）は、2011年公開のアメリカのアニメーション映画。ピクサー制作。監督はジョン・ラセター。',
              categories: [{ title: 'Category:2011年のアメリカ合衆国のアニメ映画' }],
            },
          },
        },
      }),
    },
  ];

  const { ctx } = loadGasContext({
    extraGlobals: { UrlFetchApp: makeMockWikiFetcher(routes) },
  });

  // 1. relatedUrl Wikipedia URL takes top priority
  const resUrl = ctx.searchWikipediaCandidates_('謎のメモタイトル', '映画', {
    relatedUrl: 'https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%A9%E3%83%AC%E3%83%AB%E3%83%AF%E3%83%BC%E3%83%AB%E3%83%89%E3%83%BB%E3%83%A9%E3%83%96%E3%82%B9%E3%83%88%E3%83%BC%E3%83%AA%E3%83%BC',
    watchDate: '2020-01-01',
  });
  assert.ok(resUrl.length >= 1);
  assert.equal(resUrl[0].title, 'パラレルワールド・ラブストーリー');
  assert.ok(resUrl[0].matchedHints.includes('関連URL一致'));
  assert.equal(String(resUrl[0].year), '2019');

  // 2. Staff + memo hints rank 東野圭吾 novel above general term
  const resHints = ctx.searchWikipediaCandidates_('変身', '本', {
    staff: '東野圭吾',
    memo: '脳移植された成瀬純一の心理描写がすごい',
  });
  assert.ok(resHints.length >= 1);
  assert.equal(resHints[0].title, '変身 (東野圭吾)');
  assert.ok(resHints[0].matchedHints.some(h => h.includes('東野圭吾')));
  assert.ok(resHints[0].matchedHints.some(h => h.includes('メモ')));

  // 3. English title resolves via en.wiki -> ja langlink (カーズ2)
  const resEn = ctx.searchWikipediaCandidates_('Cars 2', '映画', { watchDate: '2012-03-01' });
  assert.ok(resEn.length >= 1);
  assert.equal(resEn[0].title, 'カーズ2');
  assert.equal(resEn[0].lang, 'ja');
  assert.equal(String(resEn[0].year), '2011');
});

test('3-58 C: applyWatchWikiCandidate supports fill_empty / overwrite_summary_year, merges URL, and strictly protects Absolute Rule 2 fields', () => {
  const headers = ['ID', '自動', 'タイトル', '区分', '鑑賞日', 'ステータス', '評価', 'PF', '公開年', '出演者', 'スタッフ', '概要', '感想・メモ', '関連URL', 'NotionURL'];
  const grid = [
    headers.slice(),
    [10, false, 'パラレルワールド・ラブストーリー', '映画', '2020-04-01', '完了', '4', 'Amazon Prime', '1999', '玉森裕太', '森義隆', '古い誤った概要', '大切な感想メモ本文', 'https://example.com/official', 'https://notion.so/page10'],
  ];
  const mockSheet = {
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValue: () => grid[row - 1][col - 1],
        getValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) out.push(grid[row - 1 + r].slice(col - 1, col - 1 + numCols));
          return out;
        },
        setValue(val) { grid[row - 1][col - 1] = val; },
        setValues(vals) {
          for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) grid[row - 1 + r][col - 1 + c] = vals[r][c];
          }
        },
      };
    },
  };
  const { ctx } = loadGasContext({
    extraGlobals: {
      SpreadsheetApp: {
        openById: () => ({ getSheetByName: (name) => (name === '鑑賞記録DB' ? mockSheet : null) }),
      },
    },
  });

  const cand = {
    title: 'パラレルワールド・ラブストーリー',
    url: 'https://ja.wikipedia.org/wiki/%E3%83%91%E3%83%A9%E3%83%AC%E3%83%AB%E3%83%AF%E3%83%BC%E3%83%AB%E3%83%89%E3%83%BB%E3%83%A9%E3%83%96%E3%82%B9%E3%83%88%E3%83%BC%E3%83%AA%E3%83%BC',
    year: '2019',
    summary: '正しい映画の概要テキスト。',
    cast: ['吉岡里帆', '玉森裕太'],
    staff: ['東野圭吾'],
    platforms: ['映画館'],
  };

  // Mode 1: fill_empty preserves existing summary/year, merges cast/staff/relatedUrl, protects Rule 2
  const rFill = ctx.applyWatchWikiCandidate({ row: 2, id: 10, mode: 'fill_empty', candidate: cand });
  assert.equal(rFill.ok, true);
  assert.equal(String(grid[1][8]), '1999');
  assert.equal(grid[1][11], '古い誤った概要');
  assert.equal(grid[1][9], '玉森裕太, 吉岡里帆');
  assert.equal(grid[1][10], '森義隆, 東野圭吾');
  assert.equal(grid[1][12], '大切な感想メモ本文');
  assert.equal(grid[1][13], 'https://example.com/official\n' + cand.url);
  assert.equal(grid[1][14], 'https://notion.so/page10');
  assert.equal(grid[1][5], '完了');
  assert.equal(grid[1][4], '2020-04-01');
  assert.equal(grid[1][6], '4');

  // Mode 2: overwrite_summary_year updates summary & year, deduplicates relatedUrl, still protects Rule 2
  const rOver = ctx.applyWatchWikiCandidate({ row: 2, id: 10, mode: 'overwrite_summary_year', candidate: cand });
  assert.equal(rOver.ok, true);
  assert.equal(String(grid[1][8]), '2019');
  assert.equal(grid[1][11], '正しい映画の概要テキスト。');
  assert.equal(grid[1][12], '大切な感想メモ本文');
  assert.equal(grid[1][13], 'https://example.com/official\n' + cand.url);
  assert.equal(grid[1][14], 'https://notion.so/page10');
  assert.equal(grid[1][5], '完了');
  assert.equal(grid[1][4], '2020-04-01');
  assert.equal(grid[1][6], '4');
});

test('3-58 C: Frontend preview modal renders candidates & warnings, cancel makes 0 writes, confirm applies and updates UI', async () => {
  const apiCalls = [];
  const { ctx } = loadFrontendContext();
  ctx.apiPost = async (action, payload) => {
    apiCalls.push({ action, payload });
    if (action === 'searchWikiCandidates') {
      return {
        ok: true,
        queryTitle: 'THE CROODS',
        candidates: [
          {
            title: 'クルードさんちのはじめての冒険',
            url: 'https://ja.wikipedia.org/wiki/%E3%82%AF%E3%83%AB%E3%83%BC%E3%83%89%E3%81%95%E3%82%93%E3%81%A1%E3%81%AE%E3%81%AF%E3%81%98%E3%82%81%E3%81%A6%E3%81%AE%E5%86%92%E9%99%BA',
            year: '2013',
            yearWarning: '',
            snippet: '2013年公開のドリームワークス制作アニメ映画。',
            matchedHints: ['英語原題→日本語版'],
            lang: 'ja',
          },
          {
            title: 'クルードさんちのあたらしい冒険',
            url: 'https://ja.wikipedia.org/wiki/The_Croods_2',
            year: '',
            yearWarning: '抽出年(2020)が鑑賞年(2013)を超えているため不採用',
            snippet: '2020年公開の続編。',
            matchedHints: ['英語原題'],
            lang: 'ja',
          },
        ],
      };
    }
    if (action === 'applyWikiCandidate') {
      return {
        ok: true,
        entry: {
          row: 8, id: '80', title: 'THE CROODS', category: '映画', watchDate: '2013-08-10',
          status: '完了', rating: '5', platform: '映画館', releaseYear: '2013',
          cast: '', staff: '', summary: '2013年公開のドリームワークス制作アニメ映画。',
          memo: '家族で観た思い出', relatedUrl: 'https://ja.wikipedia.org/wiki/%E3%82%AF%E3%83%AB%E3%83%BC%E3%83%89%E3%81%95%E3%82%93%E3%81%A1%E3%81%AE%E3%81%AF%E3%81%98%E3%82%81%E3%81%A6%E3%81%AE%E5%86%92%E9%99%BA',
          notionUrl: '',
        },
      };
    }
    return { ok: true };
  };

  vm.runInContext(`
    statusFilter = 'ALL';
    watchData = [{
      row: 8, id: '80', title: 'THE CROODS', category: '映画', watchDate: '2013-08-10',
      status: '完了', rating: '5', platform: '映画館', releaseYear: '2020',
      cast: '', staff: '', summary: '誤補完', memo: '家族で観た思い出',
      relatedUrl: '', notionUrl: ''
    }];
  `, ctx);

  // Open preview -> only read-only searchWikiCandidates is called
  await ctx.openWikiPreviewModal(8, '80');
  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].action, 'searchWikiCandidates');
  assert.equal(ctx.document.getElementById('modal-wiki-candidates').classList.contains('open'), true);
  const bodyHtml = ctx.document.getElementById('wiki-candidates-body').innerHTML;
  assert.ok(bodyHtml.includes('クルードさんちのはじめての冒険'));
  assert.ok(bodyHtml.includes('抽出年(2020)が鑑賞年(2013)を超えているため不採用'));

  // Cancel -> closes modal without any write API call
  ctx.closeWikiPreviewModal();
  assert.equal(ctx.document.getElementById('modal-wiki-candidates').classList.contains('open'), false);
  assert.equal(apiCalls.length, 1);

  // Re-open, switch to overwrite mode, confirm candidate 0
  await ctx.openWikiPreviewModal(8, '80');
  ctx.setWikiApplyMode('overwrite_summary_year');
  await ctx.confirmApplyWikiCandidate(0);
  const applyCall = apiCalls.find(c => c.action === 'applyWikiCandidate');
  assert.ok(applyCall);
  assert.equal(applyCall.payload.mode, 'overwrite_summary_year');
  assert.equal(applyCall.payload.candidate.title, 'クルードさんちのはじめての冒険');
  assert.equal(ctx.document.getElementById('modal-wiki-candidates').classList.contains('open'), false);

  const updated = vm.runInContext('watchData[0]', ctx);
  assert.equal(updated.releaseYear, '2013');
  assert.equal(updated.memo, '家族で観た思い出');
  assert.ok(updated.relatedUrl.includes('wikipedia.org'));
});

test('3-59: Person dictionary hygiene guard excludes general/non-person terms, prioritizes staff & longest match, caps at 2', () => {
  const { ctx } = loadGasContext();

  assert.equal(ctx.isValidPersonDictToken_('東野圭吾'), true);
  assert.equal(ctx.isValidPersonDictToken_('宮部みゆき'), true);
  assert.equal(ctx.isValidPersonDictToken_('ファン'), false);
  assert.equal(ctx.isValidPersonDictToken_('SNS'), false);
  assert.equal(ctx.isValidPersonDictToken_('ボイスレコーダー'), false);
  assert.equal(ctx.isValidPersonDictToken_('AI'), false);
  assert.equal(ctx.isValidPersonDictToken_('NHK'), false);

  const dict = {
    staff: ['東野', '東野圭吾', 'ファン', 'SNS', 'ボイスレコーダー', '三谷幸喜', '宮部みゆき'],
    cast: ['玉森裕太', '神木隆之介', 'ファン'],
  };
  const extracted = ctx.extractHintPeopleFromMemo_(
    'ファンが多くてSNSでも話題。ボイスレコーダーが鍵。東野圭吾と宮部みゆきと三谷幸喜と玉森裕太が好き。',
    dict,
    2
  );
  assert.equal(extracted.length, 2);
  // Longest-match-first: 宮部みゆき (5 chars) -> 東野圭吾 (4 chars), 東野 (2 chars) excluded
  assert.equal(extracted[0], '宮部みゆき');
  assert.equal(extracted[1], '東野圭吾');

  // When no staff matches, falls back to cast
  const castFallback = ctx.extractHintPeopleFromMemo_('玉森裕太の演技が良かった。SNSで感想を見た。', dict, 2);
  assert.deepEqual(Array.from(castFallback), ['玉森裕太']);
});

test('3-59: ID 126 変身 (staff empty, memo mentions 東野圭吾) hits 変身 (東野圭吾) [1991] via memo person extraction and early-exits', () => {
  const fetchedUrls = [];
  const routes = [
    {
      match: (u) => u.includes('titles=' + encodeURIComponent('変身 (東野圭吾)')),
      response: () => ({
        query: {
          pages: {
            '501': {
              pageid: 501,
              title: '変身 (東野圭吾)',
              extract: '『変身』（へんしん）は、東野圭吾の小説。1991年に講談社から単行本が刊行された。1993年に講談社ノベルス版が刊行。',
              categories: [{ title: 'Category:東野圭吾の小説' }],
            },
          },
        },
      }),
    },
    {
      match: (u) => u.includes('titles=' + encodeURIComponent('変身')),
      response: () => ({
        query: {
          pages: {
            '502': {
              pageid: 502,
              title: '変身',
              extract: '変身とは、姿を変えることを指す一般用語。特撮ヒーロー番組などで用いられる。',
              categories: [{ title: 'Category:フィクションの要素' }],
            },
          },
        },
      }),
    },
  ];

  const { ctx } = loadGasContext({
    extraGlobals: {
      UrlFetchApp: {
        fetch(url) {
          fetchedUrls.push(url);
          return makeMockWikiFetcher(routes).fetch(url);
        },
      },
    },
  });

  const cands = ctx.searchWikipediaCandidates_('変身', '本', {
    staff: '',
    cast: '',
    memo: '東野圭吾93年の作品を文庫本で。',
    personDict: { staff: ['東野圭吾', 'ファン', 'SNS'], cast: [] },
  });

  assert.equal(cands.length, 1);
  assert.equal(cands[0].title, '変身 (東野圭吾)');
  assert.equal(String(cands[0].year), '1991');
  assert.ok(cands[0].matchedHints.some(h => h.includes('東野圭吾')));
  // Early exit: should NOT trigger supplementary list=search or prop=links disambiguation expansion
  assert.equal(fetchedUrls.some(u => u.includes('list=search')), false);
  assert.equal(fetchedUrls.some(u => u.includes('prop=links')), false);
});

test('3-59: Disambiguation page link expansion collects タイトル (〇〇) candidates and respects API call cap', () => {
  const fetchedUrls = [];
  const routes = [
    {
      match: (u) => u.includes('prop=links') && u.includes('titles=' + encodeURIComponent('手紙')),
      response: () => ({
        query: {
          pages: {
            '600': {
              pageid: 600,
              title: '手紙',
              links: [
                { title: '手紙 (東野圭吾)' },
                { title: '手紙 (2006年の映画)' },
                { title: '手紙 (曖昧さ回避)' },
                { title: '無関係な記事' },
              ],
            },
          },
        },
      }),
    },
    {
      match: (u) => u.includes('titles=' + encodeURIComponent('手紙') + '&') && !u.includes('prop=links'),
      response: () => ({
        query: {
          pages: {
            '600': {
              pageid: 600,
              title: '手紙',
              extract: '手紙は曖昧さ回避ページです。',
              pageprops: { disambiguation: '' },
              categories: [{ title: 'Category:曖昧さ回避' }],
            },
          },
        },
      }),
    },
    {
      match: (u) => u.includes('titles=' + encodeURIComponent('手紙 (東野圭吾)')),
      response: () => ({
        query: {
          pages: {
            '601': {
              pageid: 601,
              title: '手紙 (東野圭吾)',
              extract: '『手紙』は、東野圭吾の小説。2003年に刊行された。',
              categories: [{ title: 'Category:東野圭吾の小説' }],
            },
          },
        },
      }),
    },
  ];

  const { ctx } = loadGasContext({
    extraGlobals: {
      UrlFetchApp: {
        fetch(url) {
          fetchedUrls.push(url);
          return makeMockWikiFetcher(routes).fetch(url);
        },
      },
    },
  });

  const cands = ctx.searchWikipediaCandidates_('手紙', '本', {
    memo: '兄が服役する兄弟の物語。',
    maxExtraApiCalls: 3,
  });

  assert.ok(cands.some(c => c.title === '手紙 (東野圭吾)'));
  assert.equal(String(cands[0].year), '2003');
  const extraSearchCalls = fetchedUrls.filter(u => u.includes('list=search') || u.includes('prop=links')).length;
  assert.ok(extraSearchCalls <= 3, `Expected <= 3 extra calls, got ${extraSearchCalls}`);
});

test('3-59: Frontend preview modal supports extraHint re-search from 0-result state without closing modal', async () => {
  const apiCalls = [];
  const { ctx } = loadFrontendContext();
  ctx.apiPost = async (action, payload) => {
    apiCalls.push({ action, payload });
    if (action === 'searchWikiCandidates') {
      if (!payload.extraHint) {
        return { ok: true, queryTitle: '変身', extraHint: '', candidates: [] };
      }
      return {
        ok: true,
        queryTitle: '変身',
        extraHint: payload.extraHint,
        candidates: [
          {
            title: '変身 (東野圭吾)',
            url: 'https://ja.wikipedia.org/wiki/%E5%A4%89%E8%BA%AB_(%E6%9D%B1%E9%87%8E%E5%9C%AD%E5%90%BE)',
            year: '1991',
            yearWarning: '',
            snippet: '東野圭吾の小説。1991年刊行。',
            matchedHints: ['タイトル完全一致', 'ヒント一致: 東野圭吾'],
            lang: 'ja',
          },
        ],
      };
    }
    return { ok: true };
  };

  vm.runInContext(`
    statusFilter = 'ALL';
    watchData = [{
      row: 12, id: '126', title: '変身', category: '本', watchDate: '2020-01-01',
      status: '完了', rating: '4', platform: '', releaseYear: '',
      cast: '', staff: '', summary: '誤文', memo: '文庫本で読んだ。',
      relatedUrl: '', notionUrl: ''
    }];
  `, ctx);

  // Initial open returns 0 candidates -> modal stays open with empty guidance
  await ctx.openWikiPreviewModal(12, '126');
  assert.equal(ctx.document.getElementById('modal-wiki-candidates').classList.contains('open'), true);
  assert.ok(ctx.document.getElementById('wiki-candidates-body').innerHTML.includes('再検索'));

  // Enter extraHint and re-search without closing modal
  ctx.document.getElementById('wiki-extra-hint-input').value = '東野圭吾';
  await ctx.reSearchWikiCandidatesWithHint();
  assert.equal(apiCalls.length, 2);
  assert.equal(apiCalls[1].payload.extraHint, '東野圭吾');
  assert.equal(ctx.document.getElementById('modal-wiki-candidates').classList.contains('open'), true);
  assert.ok(ctx.document.getElementById('wiki-candidates-body').innerHTML.includes('変身 (東野圭吾)'));
});

