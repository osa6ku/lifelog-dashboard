import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

test('version is synchronized across index.html, js/config.js, version.json, and sw.js', () => {
  const versionJson = JSON.parse(fs.readFileSync(path.join(REPO, 'version.json'), 'utf8'));
  const expected = versionJson.version;
  assert.match(expected, /^v\d+\.\d+\.\d+$/);
  assert.equal(versionJson.history[0].version, expected);

  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  assert.ok(html.includes(`<title>ライフログ・ダッシュボード ${expected}</title>`), 'index.html title mismatch');
  assert.ok(html.includes(`📋 ${expected}</button>`), 'index.html version badge mismatch');

  const configJs = fs.readFileSync(path.join(REPO, 'js/config.js'), 'utf8');
  assert.ok(configJs.includes(`const APP_VERSION = '${expected}';`), 'js/config.js APP_VERSION mismatch');
  assert.ok(configJs.includes(`{ version: '${expected}',`), 'js/config.js DEFAULT_RELEASE_NOTES mismatch');

  const swJs = fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8');
  assert.ok(swJs.includes(`const CACHE_NAME = 'lifelog-dashboard-${expected}';`), 'sw.js CACHE_NAME mismatch');
});

test('sw.js SHELL_ASSETS includes css/style.css and every js/*.js file', () => {
  const swJs = fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8');
  assert.ok(swJs.includes("'./css/style.css'"), 'sw.js missing ./css/style.css');
  const jsFiles = fs.readdirSync(path.join(REPO, 'js')).filter(f => f.endsWith('.js'));
  for (const f of jsFiles) {
    assert.ok(swJs.includes(`'./js/${f}'`), `sw.js missing ./js/${f}`);
  }
});

test('all inline HTML event handlers reference defined JS functions', () => {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const definedFns = new Set();
  for (const f of fs.readdirSync(path.join(REPO, 'js')).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(REPO, 'js', f), 'utf8');
    for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      definedFns.add(m[1]);
    }
  }
  const handlerRe = /\bon(?:click|change|input|focus|blur|keydown|submit)="([^"]+)"/g;
  const builtins = new Set(['if', 'event', 'this', 'return']);
  for (const m of html.matchAll(handlerRe)) {
    const expr = m[1];
    for (const call of expr.matchAll(/(?<!\.)\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const fnName = call[1];
      if (builtins.has(fnName)) continue;
      assert.ok(definedFns.has(fnName), `index.html references undefined handler function: ${fnName}`);
    }
  }
});
