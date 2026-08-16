# OAMP (Onchain Attachment Message Protocol) 使用说明

OAMP 是一个基于以太坊交易 calldata 的去中心化消息协议。它支持公开广播、个人加密笔记以及端到端加密消息。

## 核心功能

1.  **公开广播 (A → BLACK_HOLE)**: 消息存储在发送到零地址的交易中，任何人可见。
2.  **加密个人笔记 (A → A)**: 消息使用从发送者钱包派生的对称密钥加密，仅发送者可解密。
3.  **端到端加密消息 (A → B)**: 使用 ECDH 共享密钥进行加密，只有指定的接收者 B 可以解密。

## 快速开始

### 初始化客户端

```typescript
import { OAMPClient } from './src/oamp';

// 使用私钥和 RPC 节点初始化
const client = new OAMPClient(YOUR_PRIVATE_KEY, RPC_URL);
```

### 发送消息

```typescript
// 1. 发送公开广播 (A -> BLACK_HOLE)
const txHash1 = await client.sendBroadcast("Hello World!");

// 2. 发送加密个人笔记 (A -> A)
const txHash2 = await client.sendPersonalNote("My secret note");

// 3. 发送端到端加密消息 (A -> B)
// 需要知道 B 的地址和公钥 (公钥通常可以通过 B 之前的交易签名还原)
const txHash3 = await client.sendP2PMessage(recipientAddress, recipientPubKey, "Hi Bob!");
```

### 接收与解密

```typescript
// 4. 解析并解密收到的消息
// 从以太坊交易中获取 input data, from 和 to 地址
const msg = client.parseTransaction(txData, from, to);

if (msg) {
  // 对于 P2P 消息，需要发送者的公钥来派生共享密钥
  // 对于个人笔记，不需要 senderPubKey
  const decrypted = await client.decryptMessage(msg, senderPubKey);
  
  if (decrypted) {
    console.log("消息类型:", decrypted.type);
    console.log("解密内容:", decrypted.text);
  }
}
```

## 协议封包格式 (Envelope)

所有 OAMP 消息都遵循以下二进制格式：
`MAGIC (4 bytes) | VERSION (1 byte) | TYPE (1 byte) | CRYPTO (1 byte) | NONCE (12 bytes) | PAYLOAD (n bytes)`

- **MAGIC**: `0x4f414d50` ("OAMP")
- **VERSION**: 当前版本为 `1`
- **TYPE**: `0` (广播), `1` (个人), `2` (P2P)
- **CRYPTO**: `0` (无), `1` (AES-256-GCM)

## 安全注意事项

- **密钥派生**: 个人笔记的密钥是通过对固定字符串进行签名并哈希派生的，而不是直接使用私钥。这保证了即使应用层密钥泄露，也不会直接导致以太坊私钥暴露。
- **Web Crypto**: 加密层依赖 `crypto.subtle`。在 React Native 环境中，请确保已安装必要的 polyfills。
- **非匿名性**: 协议提供内容加密，但交易本身（发送者、接收者、时间）在链上是公开透明的。
