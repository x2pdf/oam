const assert = require('node:assert/strict');
const test = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');

function priceModule(fetchImpl, extraGlobals = {}) {
  return loadTypeScript('src/arweave/arPrice.ts', { globals: { fetch: fetchImpl, ...extraGlobals } });
}

function quote(price = 3.21, updated = Date.now() / 1000) {
  return { ok: true, json: async () => ({ arweave: { usd: price, last_updated_at: Math.floor(updated) } }) };
}

test('fetches AR/USD from CoinGecko with an update timestamp', async () => {
  let requested;
  const api = priceModule(async (url) => { requested = url; return quote(); });
  assert.equal(await api.fetchArUsdPrice(), 3.21);
  const url = new URL(requested);
  assert.equal(url.searchParams.get('ids'), 'arweave');
  assert.equal(url.searchParams.get('vs_currencies'), 'usd');
  assert.equal(url.searchParams.get('include_last_updated_at'), 'true');
});

test('shares concurrent lookups and caches a fresh quote for five minutes', async () => {
  let calls = 0;
  const api = priceModule(async () => { calls++; return quote(); });
  assert.deepEqual(await Promise.all([api.fetchArUsdPrice(), api.fetchArUsdPrice()]), [3.21, 3.21]);
  assert.equal(await api.fetchArUsdPrice(), 3.21);
  assert.equal(calls, 1);
});

test('rejects invalid or stale market quotes', async () => {
  for (const [price, updated] of [
    [0, Date.now() / 1000], [-1, Date.now() / 1000], [Infinity, Date.now() / 1000],
    [NaN, Date.now() / 1000], ['3.21', Date.now() / 1000],
    [3.21, Date.now() / 1000 - 601], [3.21, Date.now() / 1000 + 301],
  ]) {
    assert.equal(await priceModule(async () => quote(price, updated)).fetchArUsdPrice(), null);
  }
  assert.equal(await priceModule(async () => ({ ok: true, json: async () => ({ arweave: { usd: 3.21 } }) })).fetchArUsdPrice(), null);
});

test('drops expired cache when a refresh fails', async () => {
  let now = Date.now();
  let calls = 0;
  const api = priceModule(async () => {
    calls++;
    if (calls > 1) throw new Error('offline');
    return quote(3.21, now / 1000);
  }, { Date: { now: () => now } });
  assert.equal(await api.fetchArUsdPrice(), 3.21);
  now += 5 * 60 * 1000 + 1;
  assert.equal(await api.fetchArUsdPrice(), null);
});

test('expires cache based on the provider timestamp as well as fetch time', async () => {
  let now = Date.now();
  let calls = 0;
  const api = priceModule(async () => {
    calls++;
    return calls === 1 ? quote(3.21, now / 1000 - 590) : { ok: false };
  }, { Date: { now: () => now } });
  assert.equal(await api.fetchArUsdPrice(), 3.21);
  now += 11000;
  assert.equal(await api.fetchArUsdPrice(), null);
  assert.equal(calls, 2);
});

test('returns null on HTTP, network, or malformed JSON failure and can retry', async () => {
  for (const failure of [
    async () => ({ ok: false }),
    async () => { throw new Error('offline'); },
    async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } }),
  ]) {
    let calls = 0;
    const api = priceModule(async () => ++calls === 1 ? failure() : quote());
    assert.equal(await api.fetchArUsdPrice(), null);
    assert.equal(await api.fetchArUsdPrice(), 3.21);
  }
});

test('times out even if a request ignores abort, including a stalled response body', async () => {
  for (const fetchImpl of [
    () => new Promise(() => {}),
    async () => ({ ok: true, json: () => new Promise(() => {}) }),
  ]) {
    let timer;
    let signal;
    const api = priceModule((url, options) => { signal = options.signal; return fetchImpl(); }, {
      setTimeout: (callback, ms) => { assert.equal(ms, 8000); timer = callback; return 1; },
      clearTimeout: () => {},
    });
    const result = api.fetchArUsdPrice();
    await Promise.resolve();
    timer();
    assert.equal(await result, null);
    assert.equal(signal.aborted, true);
  }
});

test('formats small fees without rounding positive amounts to zero dollars', () => {
  const { arToUsdDisplay } = priceModule(async () => quote());
  assert.equal(arToUsdDisplay('0.015202326415', 3.21), '$0.0488');
  assert.equal(arToUsdDisplay('0.000000000001', 3.21), '< $0.0001');
  assert.equal(arToUsdDisplay('1000', 3.21), '$3,210.00');
  assert.equal(arToUsdDisplay('0', 3.21), '$0.00');
});

test('hides USD for missing, malformed, negative, or non-finite amounts and prices', () => {
  const { arToUsdDisplay } = priceModule(async () => quote());
  for (const amount of [null, '', '—', '1 AR', '1junk', '-1', 'Infinity']) {
    assert.equal(arToUsdDisplay(amount, 3.21), null);
  }
  for (const price of [null, 0, -1, Infinity, NaN]) {
    assert.equal(arToUsdDisplay('1', price), null);
  }
  assert.equal(arToUsdDisplay('1' + '0'.repeat(308), 100), null);
});
