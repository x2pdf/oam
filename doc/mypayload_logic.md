# mypayload 编解码逻辑与 OAMP 协议文档

本文档详细介绍了 `mypayload` 的数据结构、编解码逻辑以及它如何集成在 OAMP (On-chain Messaging Protocol) 协议中。

## 1. mypayload 概述

`mypayload` 是 OAM 项目中用于封装富文本内容的应用层 Profile。它使用简化的 HTML 片段来描述包含文本、图片（Base64）和附件链接的内容项。

### 1.1 内容项类型 (ContentItem)

在代码 (`src/mypayload/index.ts`) 中，`ContentItem` 定义了三种基本类型：

-   **text**: 纯文本内容。
-   **image**: 内嵌图片，使用 Data URI 格式存储 Base64 数据。支持 PNG、JPEG、GIF。
-   **link**: 外部链接或 Arweave 附件。包含 MIME 类型、标签、以及可选的 Arweave ID (`arId`) 和下载标志。

## 2. 编码逻辑 (payloadEncode)

编码过程将 `ContentItem` 数组转换为一个 UTF-8 编码的字节流，外层包裹 `<html>` 标签。

### 2.1 结构规范

| 类型 | HTML 标签 | 属性 | 说明 |
| :--- | :--- | :--- | :--- |
| **文本** | `<pre>` | 无 | 内部文本会进行 HTML 转义 |
| **图片** | `<img>` | `src`, `alt` | `src` 包含 Data URI，`alt` 存储文件名 |
| **链接** | `<a>` | `href`, `type`, `data-ar-id`, `download` | 附件类型看 `type`（MIME）；Arweave 另写 `data-ar-id` |

### 2.2 安全处理
所有内容（文本、属性值）在编码前都会经过 `escapeHtml` 函数处理，转义 `&`, `<`, `>`, `"` 字符，防止标签截断和属性注入。

## 3. 解码逻辑 (payloadDecode)

解码器负责将字节流或 HTML 字符串还原为 `ContentItem` 数组。

-   **容错处理**: 如果输入不以 `<html>` 开头，解码器会将其视为纯文本并包装为单个 `text` 项。
-   **标签提取**: 使用正则表达式 (`/<pre>(.*?)<\/pre>|<img\s+([^>]*?)>|<a\s+([^>]*?)>(.*?)<\/a>/gs`) 提取已知标签。
-   **反转义**: 对提取出的内容和属性执行 `unescapeHtml`，还原原始字符。

## 4. OAMP v1 协议集成

`mypayload` 通常作为 OAMP 消息的 `PAYLOAD` 部分上链。

### 4.1 OAMP v1 信封结构 (20 字节头部)

| 偏移 | 长度 | 名称 | 说明 |
| :--- | :--- | :--- | :--- |
| 0 | 4 | **MAGIC** | 固定为 `0x4f414d50` ("OAMP") |
| 4 | 1 | **VERSION** | 当前版本为 `1` |
| 5 | 1 | **TYPE** | `0`: BROADCAST, `1`: PERSONAL, `2`: P2P |
| 6 | 1 | **CRYPTO** | `0`: NONE (明文), `1`: AES_256_GCM |
| 7 | 1 | **RESERVED** | 固定为 `0x00` |
| 8 | 12 | **NONCE** | 随机值，用于唯一性或加密 IV |

### 4.2 组合过程

1.  **准备 Payload**: 使用 `payloadEncode` 生成 `mypayload` HTML 字节。
2.  **生成 Nonce**: 生成 12 字节的随机数。
3.  **构建信封**: 拼接 8 字节 Header + 12 字节 Nonce + Payload。
4.  **上链**: 最终数据以 `0x` 开头的十六进制字符串形式存入交易的 `calldata`。

## 5. 使用示例 (TypeScript)

```typescript
import { payloadEncode, createPngItem, createLinkItem } from './src/mypayload';

const items = [
  { type: 'text', content: 'Hello World!' },
  createPngItem('iVBORw0KGgo...', 'logo.png'),
  createLinkItem({
    href: 'https://arweave.net/xyz',
    mime: 'application/pdf',
    label: 'Document.pdf',
    arId: 'xyz'
  })
];

const encodedBytes = payloadEncode(items);
// 结果: <html><pre>Hello World!</pre><img src="..." alt="logo.png"><a href="..." ...>Document.pdf</a></html>
```

---
*相关参考: [OAMP 编解码工具](file:///Users/megan/code/oam/doc/oamp-codec.html)*
