export enum MessageType {
  BROADCAST = 0,
  PERSONAL = 1,
  P2P = 2,
}

export enum CryptoScheme {
  NONE = 0,
  AES_256_GCM = 1,
}

export interface OAMPMessage {
  type: MessageType;
  crypto: CryptoScheme;
  nonce: Uint8Array;
  payload: Uint8Array;
  sender: string;
  recipient: string;
  timestamp?: number;
  transactionHash?: string;
}

export interface DecryptedMessage {
  text: string;
  items?: any[]; // 这里为了避免循环引用或过早导入，暂时用 any，或者直接导入 ContentItem
  type: MessageType;
  sender: string;
  recipient: string;
  timestamp?: number;
}
