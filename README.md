# OAM (Onchain Attachment Message)
**以太坊链上附件消息数据互操作程序**

OAM 是一款专注于以太坊 Calldata 消息交互的开源工具。它实现了 **OAMP (Onchain Attachment Message Protocol)**，支持公开广播、个人加密笔记以及端到端加密通信，并提供富文本还原显示功能。

---

## 免责声明

> [!CAUTION]
> **风险提示**：本项目涉及加密货币及其相关技术（如私钥管理、链上交易等）。加密货币市场具有极高的风险，可能导致资金完全损失。
>
> 1. **非投资建议**：本项目仅供学习、研究及开发演示用途，不构成任何形式性投资建议、财务建议或法律建议。
> 2. **安全性风险**：用户需自行承担私钥管理及钱包交互的安全责任。开发者不对因使用本项目（包括但不限于软件漏洞、操作失误、黑客攻击等）导致的任何资产损失负责。
> 3. **法律合规**：用户应确保在遵守当地法律法规的前提下使用本项目。
> 4. **信息永存与公开**：区块链技术具有不可篡改性。一旦信息通过本项目发送至区块链，该信息将**永久保存**在链上，且对**全球公开可见**。开发者无法修改、隐藏或删除已上链的任何数据，亦无法阻止任何第三方访问这些数据。请在发送前确保不包含任何不宜公开的敏感信息。
> 5. **加密功能免责**：本项目提供的信息加密功能仅为技术展示。开发者不对用户利用该功能存储或传播的任何内容负责。加密并不等同于绝对安全，开发者不承担因用户误操作、私钥泄漏、算法局限性或未来技术进步导致的加密信息被破解所产生的任何责任。
>
> **继续使用本项目即代表您已充分理解并同意承担相关风险。**

---

## 核心功能

### 1. OAMP 协议支持
基于以太坊交易 `input data` 的去中心化消息协议：
- **公开广播 (Broadcast)**：发送至零地址，全球可见。
- **加密个人笔记 (Personal Note)**：A → A 加密存储，仅发送者可解密。
- **端到端加密消息 (P2P Encrypted)**：基于 ECDH 共享密钥，仅指定接收者可解密。
- **明文点对点消息 (P2P Public)**：发送至指定地址，但内容不加密。

### 2. 富文本还原显示
识别 OAMP 格式数据并还原渲染：
- **代码块**：支持 `<pre>` 标签。
- **图片嵌入**：支持 `<img>` 标签还原。
- **图片选择**：支持从系统相册选取图片，并自动进行格式检查与 Base64 编码。
- **安全沙箱**：解析过程自动过滤恶意脚本，仅渲染白名单内的标签。

### 3. 数据互操作
- **多数据源集成**：动态支持 Etherscan 和 Blockscout API。
- **实时同步**：自动拉取订阅地址的链上消息流。
- **i18n 多语言**：支持中英文切换，适配全球用户。

### 4. 安全钱包管理
- **私钥存储**：使用 `expo-secure-store` 进行硬件级加密存储。
- **消息解密**：从钱包派生专用会话密钥，确保主私钥不直接参与消息加解密流程。

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| **框架** | React Native (Expo SDK 52) | 0.76.x |
| **语言** | TypeScript | 5.6.x |
| **区块链交互** | Ethers.js | 6.17.x |
| **UI 组件库** | React Native Paper (M3) | 5.15.x |
| **本地加密** | Expo SecureStore | 14.0.x |
| **随机数生成** | react-native-get-random-values | 1.11.x |
| **多语言** | i18next / react-i18next | 26.x / 17.x |
| **网络请求** | Axios | 1.19.x |
| **媒体处理** | Expo ImagePicker | 16.0.x |

---

## 项目结构

```
src/
├── oamp/                # OAMP 协议核心实现 (封包、解密、协议定义)
├── wallet/              # 钱包管理逻辑 (私钥生成、SecureStore 交互)
├── datasource/          # 数据源层 (Etherscan, Blockscout 适配器)
├── adapter/             # 平台适配层 (如图片选择器等原生能力适配)
├── components/          # UI 通用组件 (含 RichContentRenderer)
├── i18n/                # 国际化配置与翻译文件
├── context/             # 全局业务状态管理
├── navigation/          # 路由导航配置
├── screens/             # 页面视图 (主页、订阅、个人、表单)
├── types/               # 全局 TypeScript 类型定义
└── utils/               # 工具函数 (格式转换、Hex 处理)
```

---

## 快速开始

### 1. 安装项目

```bash
git clone <project-url>
cd onchaindata
npm install
```

> [!IMPORTANT]
> **随机数环境补丁**：
> 在 React Native 环境下，`ethers.js` 需要安全的随机数生成器。项目已集成 `react-native-get-random-values`。若你在新环境下运行报错 `platform does not support secure random numbers`，请确保已在入口文件 `index.js` 最顶部引入该库，并执行了原生模块安装。

### 2. 配置环境变量

在根目录创建 `.env` (或根据实际配置方式) 设置各区块浏览器的 API Key，以启用真实数据拉取。

### 3. 运行

```bash
# 启动开发服务器
npm start

# 运行到 iOS
npm run ios

# 运行到 Android
npm run android
```

---

## 协议细节 (OAMP)

所有消息遵循以下 Envelope 格式：
`MAGIC (4 bytes: "OAMP") | VERSION (1 byte) | TYPE (1 byte) | CRYPTO (1 byte) | NONCE (12 bytes) | PAYLOAD (n bytes)`

- **TYPE**: `0` 广播, `1` 个人, `2` P2P
- **CRYPTO**: `0` 无, `1` AES-256-GCM

详细文档请参考 [src/oamp/README.md](file:///Users/megan/code/onchaindata/src/oamp/README.md)。

---

## 许可证

本项目仅供学习和演示用途。
