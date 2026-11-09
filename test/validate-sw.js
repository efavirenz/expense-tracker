// Scratch validation for service-worker.js behaviour. Not part of the app.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8');
let total = 0, passed = 0;
function assert(condition, name) {
  total++;
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else console.error(`  ✗ FAIL: ${name}`);
}

function load(overrides = {}) {
  const listeners = {};
  const state = { skipWaiting: 0, claim: 0, deleted: [], added: [], puts: [] };
  const context = {
    console: { warn() {}, error() {}, log() {} },
    URL,
    Promise,
    Response,
    setTimeout,
    clearTimeout,
    self: {
      location: { origin: 'https://app.example' },
      addEventListener(type, fn) { listeners[type] = fn; },
      skipWaiting() { state.skipWaiting++; },
      clients: { claim() { state.claim++; } }
    },
    caches: overrides.caches || {
      async open() { return { add: async () => {}, match: async () => undefined, put: async () => {} }; },
      async keys() { return []; },
      async delete() {}
    },
    fetch: overrides.fetch || (async () => new Response('network', { status: 200 }))
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { listeners, state, context };
}

function trigger(listeners, type, event) {
  const waits = [];
  const responds = [];
  const wrapped = {
    ...event,
    waitUntil(p) { waits.push(p); },
    respondWith(p) { responds.push(p); }
  };
  listeners[type](wrapped);
  return { wait: Promise.all(waits), respond: responds[0] };
}

(async () => {
  console.log('--- Service Worker Validation ---');

  // Install is tolerant of a single missing asset and does not force takeover.
  {
    const added = [];
    const { listeners, state } = load({
      caches: {
        async open() {
          return {
            async add(url) {
              if (url === './js/app.js') throw new Error('missing asset');
              added.push(url);
            },
            async match() { return undefined; },
            async put() {}
          };
        },
        async keys() { return []; },
        async delete() {}
      }
    });
    const run = trigger(listeners, 'install', {});
    let rejected = false;
    await run.wait.catch(() => { rejected = true; });
    assert(!rejected, 'Install resolves even when one shell asset fails to cache');
    assert(added.length === 8, 'Install pre-caches each remaining asset individually');
    assert(state.skipWaiting === 0, 'Install does not call skipWaiting');
  }

  // Activation removes only this app's old caches and does not claim clients.
  {
    const deleted = [];
    const { listeners, state } = load({
      caches: {
        async open() { return { async add() {}, async match() { return undefined; }, async put() {} }; },
        async keys() { return ['expense-tracker-v25', 'expense-tracker-v26', 'unrelated-cache']; },
        async delete(key) { deleted.push(key); }
      }
    });
    const run = trigger(listeners, 'activate', {});
    await run.wait;
    assert(deleted.length === 1 && deleted[0] === 'expense-tracker-v25', 'Activate deletes only older expense-tracker caches');
    assert(state.claim === 0, 'Activate does not call clients.claim');
  }

  // Cache open failure falls back to the network response.
  {
    const { listeners } = load({
      caches: {
        async open() { throw new Error('cache unavailable'); },
        async keys() { return []; },
        async delete() {}
      },
      fetch: async () => new Response('network-body', { status: 200 })
    });
    const run = trigger(listeners, 'fetch', { request: { method: 'GET', url: 'https://app.example/index.html' } });
    await run.wait;
    const response = await run.respond;
    assert(response && (await response.text()) === 'network-body', 'Cache-open failure falls back to the network response');
  }

  // A cached response is served immediately.
  {
    const { listeners } = load({
      caches: {
        async open() {
          return {
            async add() {},
            async match() { return new Response('cached-body', { status: 200 }); },
            async put() {}
          };
        },
        async keys() { return []; },
        async delete() {}
      },
      fetch: async () => new Response('network-body', { status: 200 })
    });
    const run = trigger(listeners, 'fetch', { request: { method: 'GET', url: 'https://app.example/css/style.css' } });
    await run.wait;
    const response = await run.respond;
    assert(response && (await response.text()) === 'cached-body', 'Cached responses are served first');
  }

  // Unknown network and no cache yields the documented offline fallback.
  {
    const { listeners } = load({
      caches: {
        async open() { return { async add() {}, async match() { return undefined; }, async put() {} }; },
        async keys() { return []; },
        async delete() {}
      },
      fetch: async () => { throw new Error('offline'); }
    });
    const run = trigger(listeners, 'fetch', { request: { method: 'GET', url: 'https://app.example/missing.html' } });
    await run.wait;
    const response = await run.respond;
    assert(response && response.status === 503, 'Offline navigation receives the 503 fallback');
  }

  // Non-GET and cross-origin requests are ignored.
  {
    const { listeners } = load();
    let responded = false;
    listeners.fetch({ request: { method: 'POST', url: 'https://app.example/x' }, waitUntil() {}, respondWith() { responded = true; } });
    listeners.fetch({ request: { method: 'GET', url: 'https://other.example/x' }, waitUntil() {}, respondWith() { responded = true; } });
    assert(!responded, 'Non-GET and cross-origin requests bypass the worker');
  }

  console.log(`\nService Worker Validation: ${passed}/${total} passed.`);
  if (passed !== total) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
