/**
 * 链上交易数据模型：基类承载必然字段，子类承载可选扩展字段。
 */

/** 交易必然存在的字段（值可为空字符串 / 0） */
export class BaseChainTransaction {
  hash: string;
  from: string;
  to: string;
  input: string;
  value: string;
  timestamp: number;

  constructor(data: {
    hash?: string;
    from?: string;
    to?: string;
    input?: string;
    value?: string;
    timestamp?: number;
  } = {}) {
    this.hash = data.hash ?? '';
    this.from = data.from ?? '';
    this.to = data.to ?? '';
    this.input = data.input ?? '';
    this.value = data.value ?? '';
    this.timestamp = data.timestamp ?? 0;
  }

  get hasInput(): boolean {
    return !!this.input && this.input !== '0x';
  }

  get fromLower(): string {
    return this.from.toLowerCase();
  }

  get toLower(): string {
    return this.to.toLowerCase();
  }
}

/** 部分数据源可能提供的扩展字段 */
export class ChainTransaction extends BaseChainTransaction {
  blockNumber?: string;
  gas?: string;
  gasPrice?: string;
  gasUsed?: string;
  nonce?: string;
  transactionIndex?: string;
  isError?: boolean;
  methodId?: string;
  contractAddress?: string;

  constructor(
    data: ConstructorParameters<typeof BaseChainTransaction>[0] & {
      blockNumber?: string;
      gas?: string;
      gasPrice?: string;
      gasUsed?: string;
      nonce?: string;
      transactionIndex?: string;
      isError?: boolean;
      methodId?: string;
      contractAddress?: string;
    } = {},
  ) {
    super(data);
    this.blockNumber = data.blockNumber;
    this.gas = data.gas;
    this.gasPrice = data.gasPrice;
    this.gasUsed = data.gasUsed;
    this.nonce = data.nonce;
    this.transactionIndex = data.transactionIndex;
    this.isError = data.isError;
    this.methodId = data.methodId;
    this.contractAddress = data.contractAddress;
  }
}

function str(value: unknown, fallback = ''): string {
  return value != null ? String(value) : fallback;
}

function optStr(value: unknown): string | undefined {
  return value != null ? String(value) : undefined;
}

/** Etherscan / Routescan txlist 响应 */
export function parseEtherscanTx(raw: Record<string, unknown>): ChainTransaction {
  return new ChainTransaction({
    hash: str(raw.hash),
    from: str(raw.from),
    to: str(raw.to),
    input: str(raw.input),
    value: str(raw.value, '0'),
    timestamp: parseInt(str(raw.timeStamp, '0'), 10) || 0,
    blockNumber: optStr(raw.blockNumber),
    gas: optStr(raw.gas),
    gasPrice: optStr(raw.gasPrice),
    gasUsed: optStr(raw.gasUsed),
    nonce: optStr(raw.nonce),
    transactionIndex: optStr(raw.transactionIndex),
    isError: raw.isError != null ? raw.isError === '1' || raw.isError === 1 : undefined,
    methodId: optStr(raw.methodId),
    contractAddress: optStr(raw.contractAddress),
  });
}

/** Blockscout v2 交易响应 */
export function parseBlockscoutTx(raw: Record<string, unknown>): ChainTransaction {
  const fromObj = raw.from as { hash?: string } | string | undefined;
  const toObj = raw.to as { hash?: string } | string | undefined;
  const from = typeof fromObj === 'object' && fromObj ? fromObj.hash ?? '' : str(fromObj);
  const to = typeof toObj === 'object' && toObj ? toObj.hash ?? '' : str(toObj);

  let timestamp = 0;
  if (raw.timestamp) {
    const tsStr = String(raw.timestamp).replace(' ', 'T');
    const d = new Date(tsStr);
    timestamp = Math.floor(d.getTime() / 1000) || 0;
  }

  return new ChainTransaction({
    hash: str(raw.hash),
    from,
    to,
    input: str(raw.raw_input ?? raw.input),
    value: str(raw.value, '0'),
    timestamp,
    blockNumber: optStr(raw.block_number ?? raw.blockNumber),
    gas: optStr(raw.gas),
    gasPrice: optStr(raw.gas_price ?? raw.gasPrice),
    gasUsed: optStr(raw.gas_used ?? raw.gasUsed),
    nonce: optStr(raw.nonce),
    transactionIndex: optStr(raw.transaction_index ?? raw.transactionIndex),
    methodId: optStr(raw.method_id ?? raw.methodId),
    contractAddress: optStr(raw.created_contract ?? raw.contractAddress),
  });
}

export function parseEtherscanTxList(rawList: unknown[]): ChainTransaction[] {
  return rawList.map((raw) => parseEtherscanTx(raw as Record<string, unknown>));
}

export function parseBlockscoutTxList(rawList: unknown[]): ChainTransaction[] {
  return rawList.map((raw) => parseBlockscoutTx(raw as Record<string, unknown>));
}
