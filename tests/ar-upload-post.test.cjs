const assert = require('node:assert/strict');
const test = require('node:test');
const Arweave = require('arweave');
const loadTypeScript = require('./helpers/load-typescript.cjs');

function loadUploadModule(gateway) {
  return loadTypeScript('src/arweave/upload/transaction.ts', {
    imports: {
      '../../config/arweaveGatewayConfig': {
        PRIMARY_ARWEAVE_GATEWAY: 'https://primary.test/',
        ARWEAVE_READ_TIMEOUT_MS: 15000,
        ARWEAVE_POST_TIMEOUT_MS: 40,
      },
      '../gateway': gateway,
    },
  });
}

test('a stored chunk reported as 208 lets the uploader finish', async () => {
  const arweave = Arweave.init({ host: '127.0.0.1', port: 9, protocol: 'http' });
  const jwk = await arweave.wallets.generate();
  const data = new Uint8Array(300 * 1024);
  const tx = await arweave.createTransaction({ data, last_tx: '', reward: '1' }, jwk);
  await arweave.transactions.sign(tx, jwk);

  let chunks = 0;
  arweave.api.post = async (endpoint) => {
    const path = String(endpoint).replace(/^\//, '').split('?')[0];
    if (path === 'chunk') {
      chunks += 1;
      return { status: 208, statusText: 'Already Reported', data: {} };
    }
    return { status: 200, statusText: 'OK', data: {} };
  };

  const { treatAcceptedChunksAsUploaded } = loadUploadModule({
    getArweaveClient: () => ({ transactions: {} }),
    withArweaveGateways: () => { throw new Error('unused'); },
    orderedArweaveGateways: () => [],
    markArweaveGatewayOk: () => {},
  });
  treatAcceptedChunksAsUploaded(arweave);

  const response = await Promise.race([
    arweave.transactions.post(tx),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('uploader stalled after the node accepted the chunk')), 2000);
    }),
  ]);
  assert.equal(response.status, 200);
  assert.ok(chunks >= 1);
});

test('a timed-out gateway that later accepts still resolves, and failover stays bounded', async () => {
  const tx = { id: 'tx-1', reward: '100', addTag() {} };
  let acceptSlow;
  const slowAccepted = new Promise((resolve) => { acceptSlow = resolve; });
  const calls = [];
  const marked = [];

  const slow = {
    api: { post: async () => ({ status: 200, data: {} }) },
    transactions: {
      post: async () => {
        calls.push('slow');
        await slowAccepted;
        return { status: 200, data: {} };
      },
    },
  };
  const next = {
    api: { post: async () => ({ status: 200, data: {} }) },
    transactions: {
      post: async () => {
        calls.push('next');
        acceptSlow();
        return new Promise(() => {});
      },
    },
  };
  const primary = {
    api: { post: async () => ({ status: 200, data: {} }) },
    createTransaction: async () => tx,
    transactions: { sign: async () => {} },
  };

  const { postUploadTransaction } = loadUploadModule({
    getArweaveClient: (gateway) => (
      gateway === 'https://slow.test/' ? slow : gateway === 'https://next.test/' ? next : primary
    ),
    withArweaveGateways: (op) => op('https://primary.test/'),
    orderedArweaveGateways: () => ['https://slow.test/', 'https://next.test/'],
    markArweaveGatewayOk: (gateway) => marked.push(gateway),
  });

  const id = await Promise.race([
    postUploadTransaction({}, new Uint8Array([1]), [], '1000'),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('dialog still waiting after the node accepted the upload')), 1000);
    }),
  ]);
  assert.equal(id, 'tx-1');
  assert.deepEqual(calls, ['slow', 'next']);
  assert.deepEqual(marked, ['https://slow.test/']);
});
