import { InputDataItem } from '../types';
import { ChainTransaction } from './ChainTransaction';
import { FetchMode, OutgoingTx } from './types';
import { ETHEREUM_CHAIN_ID } from '../config/rpcConfig';

function parseTxNonce(nonce?: string): number | undefined {
  if (nonce == null || nonce === '') return undefined;
  const n = nonce.startsWith('0x') || nonce.startsWith('0X')
    ? parseInt(nonce, 16)
    : parseInt(nonce, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function filterTransactionsByMode(
  txs: ChainTransaction[],
  cleanAddress: string,
  mode: FetchMode,
): ChainTransaction[] {
  return txs.filter((tx) => {
    if (!tx.hasInput) return false;

    if (mode === 'self') {
      return tx.fromLower === cleanAddress && tx.toLower === cleanAddress;
    }
    if (mode === 'square') {
      return tx.toLower === cleanAddress;
    }
    if (mode === 'sent') {
      return tx.fromLower === cleanAddress;
    }
    if (mode === 'all') {
      return tx.fromLower === cleanAddress || tx.toLower === cleanAddress;
    }
    return tx.toLower === cleanAddress;
  });
}

export function mapToInputDataItem(
  tx: ChainTransaction,
  _mode: FetchMode,
  _cleanAddress: string,
  formatTimestamp: (ts: number) => string,
  shortenAddress: (addr: string) => string,
): InputDataItem {
  const lastActive = tx.timestamp ? formatTimestamp(tx.timestamp) : 'Unknown';
  // Cards always surface the sender; short labels (self / subscription) are applied in UI.
  const displayAddr = tx.from || 'Unknown';

  return {
    id: tx.hash,
    name: shortenAddress(displayAddr),
    address: displayAddr,
    from: tx.from,
    to: tx.to,
    description: '',
    balance: `${(parseInt(tx.value || '0', 10) / 1e18).toFixed(4)} ETH`,
    txCount: 1,
    lastActive,
    timestamp: tx.timestamp || 0,
    rawInput: tx.input,
    txNonce: parseTxNonce(tx.nonce),
    chainId: ETHEREUM_CHAIN_ID,
  };
}

export function mapTransactionsToMessages(
  txs: ChainTransaction[],
  cleanAddress: string,
  mode: FetchMode,
  formatTimestamp: (ts: number) => string,
  shortenAddress: (addr: string) => string,
): InputDataItem[] {
  return filterTransactionsByMode(txs, cleanAddress, mode).map((tx) =>
    mapToInputDataItem(tx, mode, cleanAddress, formatTimestamp, shortenAddress),
  );
}

export function mapToOutgoingTx(tx: ChainTransaction, cleanAddress: string): OutgoingTx | null {
  if (!tx.hash) return null;
  if (tx.fromLower && tx.fromLower !== cleanAddress) return null;
  return { hash: tx.hash };
}

export function mapTransactionsToOutgoing(
  txs: ChainTransaction[],
  cleanAddress: string,
): OutgoingTx[] {
  const items: OutgoingTx[] = [];
  for (const tx of txs) {
    const mapped = mapToOutgoingTx(tx, cleanAddress);
    if (mapped) items.push(mapped);
  }
  return items;
}
