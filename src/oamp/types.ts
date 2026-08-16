export enum MessageType {
  BROADCAST = 0,
  PERSONAL = 1,
  P2P = 2,
}

export enum CryptoScheme {
  NONE = 0,
  AES_256_GCM = 1,
  ECIES = 2,
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
  type: MessageType;
  sender: string;
  recipient: string;
  timestamp?: number;
}
