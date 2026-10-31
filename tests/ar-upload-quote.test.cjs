const assert = require('node:assert/strict');
const test = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');
const Arweave = require('arweave/node');

function transactionModule({ balance = '1000000000000', fee = '15202326415' } = {}) {
  const calls = [];
  const units = Arweave.init({});
  const client = {
    ar: units.ar,
    wallets: { getBalance: async (address) => { calls.push(['balance', address]); return balance; } },
    transactions: { getPrice: async (size) => { calls.push(['fee', size]); return fee; } },
  };
  const api = loadTypeScript('src/arweave/upload/transaction.ts', { imports: {
    '../../config/arweaveGatewayConfig': { PRIMARY_ARWEAVE_GATEWAY: 'https://example.test/', ARWEAVE_READ_TIMEOUT_MS: 15000 },
    '../gateway': { getArweaveClient: () => client, withArweaveGateways: (op) => op('https://example.test/') },
  } });
  return { api, calls };
}

test('uses one Winston quote for display, balance checks, and signing protection', async () => {
  const { api, calls } = transactionModule();
  assert.equal(typeof api.getUploadQuote, 'function');
  const quote = await api.getUploadQuote('public-address', 1048576);
  assert.equal(quote.balanceAr, '1.000000000000');
  assert.equal(quote.feeAr, '0.015202326415');
  assert.equal(quote.feeWinston, '15202326415');
  assert.equal(quote.insufficientBalance, false);
  assert.deepEqual(calls, [['balance', 'public-address'], ['fee', 1048576]]);
  assert.equal(api.maxAcceptableUploadReward(quote.feeWinston), '22803489622');
});

test('keeps exact Winston precision when checking insufficient balance', async () => {
  const { api } = transactionModule({ balance: '9007199254740992', fee: '9007199254740993' });
  const quote = await api.getUploadQuote('public-address', 123);
  assert.equal(quote.insufficientBalance, true);
  assert.equal(quote.feeWinston, '9007199254740993');
});
