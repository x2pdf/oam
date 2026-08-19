import { InputDataItem } from '../types';
import { ChainTransaction } from './ChainTransaction';
import { FetchMode, OutgoingTx } from './types';

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
    return tx.toLower === cleanAddress;
  });
}

export function mapToInputDataItem(
  tx: ChainTransaction,
  mode: FetchMode,
  cleanAddress: string,
  formatTimestamp: (ts: number) => string,
  shortenAddress: (addr: string) => string,
): InputDataItem {
  const lastActive = tx.timestamp ? formatTimestamp(tx.timestamp) : 'Unknown';

  let displayAddr = 'Unknown';
  let displayName = 'Message';

  if (mode === 'self') {
    displayAddr = cleanAddress;
    displayName = 'Self Message';
  } else if (mode === 'square' || mode === 'inbox') {
    displayAddr = tx.from || 'Unknown';
    displayName = `From: ${shortenAddress(displayAddr)}`;
  } else {
    displayAddr = tx.to || 'Unknown';
    displayName = `To: ${shortenAddress(displayAddr)}`;
  }

  return {
    id: tx.hash,
    name: displayName,
    address: displayAddr,
    from: tx.from,
    to: tx.to,
    description: '',
    balance: `${(parseInt(tx.value || '0', 10) / 1e18).toFixed(4)} ETH`,
    txCount: 1,
    lastActive,
    rawInput: tx.input,
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
