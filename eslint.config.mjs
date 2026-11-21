import fs from 'node:fs';
import path from 'node:path';
import globals from 'globals';

/**
 * Collect top-level function/const/let/var declarations across sibling script files
 * so ESLint `no-undef` catches any genuinely undefined identifier (like typos or
 * missing functions) without false positives for cross-file globals.
 */
function collectTopLevelDecls(dir, ext) {
  const fullDir = path.join(process.cwd(), dir);
  const decls = {};
  if (!fs.existsSync(fullDir)) return decls;
  for (const file of fs.readdirSync(fullDir)) {
    if (!file.endsWith(ext)) continue;
    const src = fs.readFileSync(path.join(fullDir, file), 'utf8');
    for (const line of src.split('\n')) {
      const mFn = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (mFn) {
        decls[mFn[1]] = 'readonly';
        continue;
      }
      const mVar = line.match(/^(const|let|var)\s+([A-Za-z_$][\w$]*)\b/);
      if (mVar) {
        decls[mVar[2]] = mVar[1] === 'const' ? 'readonly' : 'writable';
      }
    }
  }
  return decls;
}

const frontendSharedGlobals = collectTopLevelDecls('js', '.js');
const gasSharedGlobals = collectTopLevelDecls('gas', '.gs');

const gasBuiltins = {
  SpreadsheetApp: 'readonly',
  DocumentApp: 'readonly',
  DriveApp: 'readonly',
  UrlFetchApp: 'readonly',
  ContentService: 'readonly',
  HtmlService: 'readonly',
  Utilities: 'readonly',
  CacheService: 'readonly',
  PropertiesService: 'readonly',
  Logger: 'readonly',
  Session: 'readonly',
  ScriptApp: 'readonly',
  LockService: 'readonly',
  Browser: 'readonly',
  console: 'readonly',
};

const baseRules = {
  'no-undef': 'error',
  'no-redeclare': 'off',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-constant-condition': ['warn', { checkLoops: false }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-unused-vars': ['warn', {
    vars: 'local',
    args: 'after-used',
    argsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_|^e$|^err$',
  }],
  'eqeqeq': ['warn', 'smart'],
  'no-var': 'warn',
};

export default [
  {
    ignores: ['node_modules/**', 'gas/index.html'],
  },
  {
    files: ['js/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...frontendSharedGlobals,
      },
    },
    rules: baseRules,
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
      },
    },
    rules: baseRules,
  },
  {
    files: ['gas/*.gs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...gasBuiltins,
        ...gasSharedGlobals,
      },
    },
    rules: baseRules,
  },
  {
    files: ['tests/*.mjs', 'scripts/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...baseRules,
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_|^e$|^err$',
      }],
    },
  },
];
