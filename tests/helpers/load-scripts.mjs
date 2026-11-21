import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO = process.cwd();

export function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(String(k)) ? store.get(String(k)) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(String(k)); },
    clear() { store.clear(); },
  };
}

export function loadFrontendContext(overrides = {}) {
  const localStorage = overrides.localStorage || createMemoryStorage();
  const sessionStorage = overrides.sessionStorage || createMemoryStorage();
  const elements = overrides.elements || new Map();

  const makeEl = (id) => ({
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    style: {},
    dataset: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._set.has(c)) this._set.delete(c); else this._set.add(c);
        } else if (force) {
          this._set.add(c);
        } else {
          this._set.delete(c);
        }
      },
      contains(c) { return this._set.has(c); },
    },
    scrollIntoView() {},
    focus() {},
  });

  const document = overrides.document || {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeEl(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    visibilityState: 'visible',
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    AbortController,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    Promise,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    localStorage,
    sessionStorage,
    document,
    navigator: overrides.navigator || {},
    fetch: overrides.fetch || (async () => { throw new Error('fetch not mocked'); }),
    alert: overrides.alert || (() => {}),
    confirm: overrides.confirm || (() => true),
    location: overrides.location || { search: '', pathname: '/', replace() {}, reload() {} },
    ...overrides.extraGlobals,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  const files = overrides.files || [
    'js/config.js',
    'js/api.js',
    'js/location.js',
    'js/search.js',
    'js/watch.js',
    'js/diary.js',
    'js/meals.js',
    'js/app.js',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  return { ctx, elements, localStorage, sessionStorage };
}

export function loadGasContext(overrides = {}) {
  const scriptProps = new Map(Object.entries(overrides.scriptProperties || {}));
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return scriptProps.has(k) ? scriptProps.get(k) : null; },
          setProperty(k, v) { scriptProps.set(k, String(v)); },
        };
      },
    },
    Logger: { log() {} },
    ...overrides.extraGlobals,
  };
  const ctx = vm.createContext(sandbox);
  const files = overrides.files || [
    'gas/Config.gs',
    'gas/Wiki.gs',
    'gas/Code.gs',
    'gas/Watch.gs',
    'gas/Diary.gs',
    'gas/Meals.gs',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  return { ctx, scriptProps };
}
