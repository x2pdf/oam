# OAMP (Onchain Attachment Message Protocol) 使用说明

OAMP 是一个基于以太坊交易 calldata 的去中心化消息协议。它支持公开广播、个人加密笔记以及端到端加密消息。

## 核心功能

1.  **公开广播 (A → BLACK_HOLE)**: 消息存储在发送到零地址的交易中，任何人可见。
2.  **加密个人笔记 (A → A)**: 消息使用从发送者钱包派生的对称密钥加密，仅发送者可解密。
3.  **端到端加密消息 (A → B)**: 使用 ECDH 共享密钥进行加密，只有指定的接收者 B 可以解密。
4.  **明文点对点消息 (A → B)**: 消息发送到特定地址，但不进行加密，任何能看到交易的人都能读取内容。

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
// 注意：如果 B 从未发送过交易，其公钥在链上不可见，需通过其他方式获取。
const txHash3 = await client.sendP2PMessage(recipientAddress, recipientPubKey, "Hi Bob!");

// 4. 发送明文消息 (A -> B)
// 包含发给自己 (A -> A)，但是不加密消息
const txHash4 = await client.sendUnencryptedMessage(recipientAddress, "Hello Bob, this is public!");
```

### 接收与解密

```typescript
// 5. 解析并解密收到的消息
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

## 常见问题

### 找不到接收者的公钥？

如果接收者地址从未在链上发送过交易（即 Nonce 为 0），那么他的公钥在链上是不可见的（因为以太坊地址是公钥哈希的后 20 字节）。这是去中心化通信中的一个典型“引导问题”。

**解决方案：**
1.  **主动暴露**：要求接收者先发送一条 OAMP 广播消息或任何普通交易。发送后，其公钥就可以从该交易的 `v, r, s` 签名中恢复。
2.  **线下交换**：通过扫描二维码或其它安全渠道直接获取接收者的公钥。
3.  **公钥目录**：未来可以集成一个链上智能合约作为公钥目录（Registry）。

## 协议封包格式 (Envelope)

所有 OAMP 消息都遵循以下二进制格式：
`MAGIC (4 bytes) | VERSION (1 byte) | TYPE (1 byte) | CRYPTO (1 byte) | NONCE (12 bytes) | PAYLOAD (n bytes)`

- **MAGIC**: `0x4f414d50` ("OAMP")
- **VERSION**: 当前版本为 `1`
- **TYPE**: `0` (广播), `1` (个人), `2` (P2P)
- **CRYPTO**: `0` (无), `1` (AES-256-GCM)

### (TYPE, CRYPTO) 合法组合矩阵

并非所有 TYPE 与 CRYPTO 的排列都是合法的。解析阶段会校验组合是否语义合理，非法组合将被直接拒绝（返回 `null`）。

| TYPE \ CRYPTO | NONE (0) | AES_256_GCM (1) |
|---|---|---|
| **BROADCAST (0)** | ✅ 公开广播 | ❌ 无意义（无人持有解密密钥） |
| **PERSONAL (1)** | ❌ 无意义（个人笔记必须加密） | ✅ 加密个人笔记 |
| **P2P (2)** | ✅ 明文点对点消息 | ✅ E2E 加密消息 |

四种合法组合对应的功能模式：

| 组合 | 路由 | 模式 | 说明 |
|---|---|---|---|
| `TYPE=0, CRYPTO=0` | A → BLACK_HOLE | 公开广播 | 任何人可见，无需密钥 |
| `TYPE=1, CRYPTO=1` | A → A | 加密个人笔记 | 密钥由发送者钱包派生 |
| `TYPE=2, CRYPTO=1` | A → B | E2E 加密消息 | 使用 ECDH 共享密钥 |
| `TYPE=2, CRYPTO=0` | A → B | 明文点对点消息 | 不加密，链上可见 |

## 安全注意事项

- **密钥派生**: 个人笔记的密钥是通过对固定字符串进行签名并哈希派生的，而不是直接使用私钥。这保证了即使应用层密钥泄露，也不会直接导致以太坊私钥暴露。
- **Web Crypto**: 加密层依赖 `crypto.subtle`。在 React Native 环境中，请确保已安装必要的 polyfills。
- **非匿名性**: 协议提供内容加密，但交易本身（发送者、接收者、时间）在链上是公开透明的。
