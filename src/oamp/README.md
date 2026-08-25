# OAMP (Onchain Attachment Message Protocol) 使用说明

OAMP 是一个基于以太坊交易 calldata 的去中心化消息协议。它支持公开广播、个人加密笔记以及端到端加密消息。

本文后半部分是 **v1 规范**（以本目录实现为准）。信封、密码套件与路由不变量以规范为准；PAYLOAD 字节的解释属于应用层 profile，不是信封的一部分。

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
// 从以太坊交易中获取 input data、from、to、chainId、account nonce
const msg = client.parseTransaction(txData, from, to, chainId, txNonce);

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

加密消息的 AAD 绑定 `chainId` 与交易 account nonce；二者缺失时解密失败。

## 常见问题

### 找不到接收者的公钥？

如果接收者地址从未在链上发送过交易（即 Nonce 为 0），那么他的公钥在链上是不可见的（因为以太坊地址是公钥哈希的后 20 字节）。这是去中心化通信中的一个典型“引导问题”。

**解决方案：**
1.  **主动暴露**：要求接收者先发送一条 OAMP 广播消息或任何普通交易。发送后，其公钥就可以从该交易的 `v, r, s` 签名中恢复。
2.  **线下交换**：通过扫描二维码或其它安全渠道直接获取接收者的公钥。
3.  **公钥目录**：未来可以集成一个链上智能合约作为公钥目录（Registry）。

---

## 协议规范 (v1)

解析器遇到无法识别或不合法的字段时 **必须丢弃** 整条消息（视为非 OAMP），不得猜测或降级解析。

### 信封 (Envelope)

所有 v1 消息均为如下大端布局。固定前缀 20 字节，其后为 PAYLOAD。

| Offset | Length | Field    | 说明 |
|--------|--------|----------|------|
| 0      | 4      | MAGIC    | ASCII `"OAMP"` = `0x4f414d50` |
| 4      | 1      | VERSION  | 本规范为 `1`。**未知 VERSION 必须丢弃**，不得继续解读后续字段 |
| 5      | 1      | TYPE     | `0` 广播, `1` 个人, `2` P2P |
| 6      | 1      | CRYPTO   | `0` 无加密, `1` AES-256-GCM |
| 7      | 1      | RESERVED | v1 **必须为 `0x00`**。发送必须写 0；接收遇到非 0 **必须拒绝**。征用该字节必须升 VERSION |
| 8      | 12     | NONCE    | AES-GCM IV；`CRYPTO=NONE` 时仍占 12 字节（不参与解密） |
| 20     | n      | PAYLOAD  | **不透明字节**。`CRYPTO=1` 时为密文（见下）；`CRYPTO=0` 时为明文应用数据 |

线格式：`MAGIC | VERSION | TYPE | CRYPTO | RESERVED | NONCE | PAYLOAD`。

### (TYPE, CRYPTO) 合法组合

非法组合必须拒绝。

| TYPE \ CRYPTO | NONE (0) | AES_256_GCM (1) |
|---|---|---|
| **BROADCAST (0)** | ✅ 公开广播 | ❌ 无解密密钥持有者 |
| **PERSONAL (1)** | ❌ 个人笔记必须加密 | ✅ 加密个人笔记 |
| **P2P (2)** | ✅ 明文点对点 | ✅ E2E 加密 |

### TYPE 与交易路由不变量

TYPE 是对路由的声明；权威路由是交易的 `from` / `to`。解析时必须校验，不一致则拒绝。

| 组合 | 路由 | 不变量 | 说明 |
|---|---|---|---|
| `TYPE=0, CRYPTO=0` | A → `0x000…0` | `to == 零地址` | 公开广播 |
| `TYPE=1, CRYPTO=1` | A → A | `from == to` | 加密个人笔记 |
| `TYPE=2, CRYPTO=1` | A → B | `to != 零地址` | E2E 加密 |
| `TYPE=2, CRYPTO=0` | A → B（含 A → A） | `to != 零地址` | 明文点对点；发给自己但不加密也走本条 |

零地址指 `0x0000000000000000000000000000000000000000`。地址比较按 EIP-55 规范化后的 20 字节相等性（大小写不敏感）。

### PAYLOAD（不透明）

OAMP **不规定** PAYLOAD 的内部编码。信封只保证：

- `CRYPTO=0`：PAYLOAD 是应用层明文字节；
- `CRYPTO=1`：PAYLOAD 是 AES-GCM 输出（见密码套件）。

本仓库客户端使用独立的应用层 profile（`src/mypayload`：HTML 片段封装文本与图片）。更换内容编码只升级该 profile 或 OAMP `VERSION`，不改信封字段，也不把 HTML 绑进 OAMP。

其他实现可以选用任意 PAYLOAD 编码；互操作需另行约定应用层 profile。

### 密码套件

仅当 `CRYPTO=1` 时适用。

**AES-256-GCM**

- 密钥：256 bit
- IV / nonce：12 字节，取自信封 `NONCE` 字段
- Tag：128 bit
- 密文线格式：`ciphertext || tag`（tag 在末尾 16 字节）。PAYLOAD 长度必须 ≥ 16

**AAD（64 字节，v1 唯一合法形态）**

加密必须绑定交易上下文，防止把密文搬到另一笔交易或另一条链上重放。v1 **只承认 64 字节 AAD**。仅含 8 字节信封头、不含链上下文的 AAD 属于测试数据，**不是合法 v1**，实现不得再尝试用其解密。

| Offset | Length | Name      | 编码 |
|--------|--------|-----------|------|
| 0      | 4      | MAGIC     | 与信封相同 |
| 4      | 1      | VERSION   | `1` |
| 5      | 1      | TYPE      | 与信封相同 |
| 6      | 1      | CRYPTO    | 与信封相同 |
| 7      | 1      | RESERVED  | `0x00` |
| 8      | 8      | chainId   | uint64 大端 |
| 16     | 8      | txNonce   | uint64 大端，为交易 **account nonce**，不是 GCM IV |
| 24     | 20     | sender    | `tx.from` 的 20 原始字节 |
| 44     | 20     | recipient | `tx.to` 的 20 原始字节 |

缺少 `chainId` 或 account nonce 时，不得解密。

**个人笔记密钥**

```
domain = UTF-8("OAMP Personal Note Key Derivation")   // 33 字节
sig    = EIP-191 personal_sign(domain)
       = keccak256("\x19Ethereum Signed Message:\n33" || domain) 的 ECDSA 签名
       = r (32) || s (32) || v (1)，v ∈ {27, 28}
key    = keccak256(sig)    // 32 字节；哈希的是 65 字节原始签名，不是 hex 文本
```

不得直接拿以太坊私钥当 AES 密钥。

**P2P 密钥**

```
shared_point = secp256k1 ECDH(own_priv, peer_pub)
             编码为 SEC1 未压缩点：65 字节 = 0x04 || X_be(32) || Y_be(32)
key          = keccak256(shared_point)    // 32 字节
```

`peer_pub` 作为 ECDH 输入可以是压缩或未压缩点；**参与 keccak256 的共享点编码必须是上述 65 字节未压缩形式**，不得只取 X、不得使用 33 字节压缩点。实现不得把“某库 `computeSharedSecret` 的返回值”当成规范；若库输出不是 `0x04 || X || Y`，必须先转换成该编码再哈希。

对方公钥通常从该地址历史交易（或本笔交易）的 `v, r, s` 恢复。从未发过交易的地址无法在链上还原公钥。

---

## 安全注意事项

- **密钥派生**: 个人笔记密钥来自对固定 domain 字符串的 EIP-191 签名再哈希，而不是直接使用私钥。应用层密钥泄露不会直接暴露以太坊私钥。
- **重放**: 64 字节 AAD 把密文绑到 `(chainId, txNonce, sender, recipient)`。
- **Web Crypto**: 加密层依赖 `crypto.subtle`。在 React Native 环境中，请确保已安装必要的 polyfills。
- **非匿名性**: 协议提供内容加密，但交易本身（发送者、接收者、时间）在链上是公开透明的。
