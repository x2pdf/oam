# OAM
Onchain Attachment Message


一款以太坊链上附件消息数据互操作的程序。

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

## 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [功能概览](#功能概览)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [开发与调试](#开发与调试)
- [TypeScript 检查](#typescript-检查)
- [打包与发布](#打包与发布)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | React Native (Expo SDK 52) | 0.76.9 |
| 语言 | TypeScript | 5.6.x |
| UI 组件库 | React Native Paper (Material Design 3) | 5.15.x |
| 导航 | React Navigation (Bottom Tabs + Native Stack) | 7.x |
| 图标 | @expo/vector-icons (Ionicons / MaterialCommunityIcons) | 14.x |
| 本地持久化 | @react-native-async-storage/async-storage | 2.1.x |
| 构建工具 | Expo / Metro Bundler | — |

---

## 项目结构

```
OnchainData/
├── App.tsx                          # 根组件 — Provider 嵌套入口
├── index.js                         # Expo 注册入口
├── app.json                         # Expo 应用配置
├── babel.config.js                  # Babel 配置 (含 Paper 生产优化)
├── metro.config.js                  # Metro Bundler 配置
├── tsconfig.json                    # TypeScript 配置
├── package.json                     # 依赖与脚本
├── .gitignore
│
├── assets/                          # 静态资源 (图标、启动屏等)
│
└── src/
    ├── types/index.ts               # 全局类型定义
    ├── constants/index.ts           # 常量 (字段最大长度、存储 Key)
    ├── theme/index.ts               # Material Design 3 主题 (亮色/暗色)
    ├── data/mockData.ts             # 15 条模拟 inputData 测试数据
    │
    ├── context/
    │   └── AppContext.tsx            # 全局状态管理 (useReducer + AsyncStorage 持久化)
    │
    ├── navigation/
    │   └── AppNavigator.tsx         # 底部 Tab 导航 + Stack 导航
    │
    └── screens/
        ├── HomeScreen.tsx           # 主页 — 卡片列表 (广场/主页/已发送/消息)
        ├── SubscriptionsScreen.tsx  # 订阅列表 — 列表管理 (增/改)
        ├── ProfileScreen.tsx        # 我的 — 单条信息展示 (增/改/删)
        └── SubscriptionFormScreen.tsx  # 表单页 — 添加/编辑/删除 (共用)
```

### 架构层次

```
SafeAreaProvider          ← 安全区域适配
  └─ PaperProvider        ← Material Design 3 主题
      └─ AppProvider      ← 全局业务状态 (Context + Reducer)
          └─ AppNavigator ← 路由导航
```

---

## 功能概览

应用底部包含三个分页（Tab），垂直方向适配各种手机屏幕比例。

### 1. 主页

- 以卡片形式展示 `inputData` 列表数据
- 每张卡片显示：名称、地址（截断）、描述、余额、交易数、最后活跃时间
- 当前使用 15 条模拟数据填充
- 卡片宽度自适应屏幕

### 2. 订阅列表

- 列表展示所有已添加的订阅（仅显示描述部分）
- 右下角 **FAB (+)** 按钮 → 打开添加表单
- 点击列表条目 → 打开编辑表单
- 表单字段：**地址**（最长 512 字符）、**描述**（最长 156 字符）
- 操作按钮：**保存** / **取消**

### 3. 我的

- 最多显示 **一条** 个人信息（地址 + 描述）
- 无数据时：页面顶部右侧显示 **+** 按钮，点击可添加
- 有数据时：以卡片展示信息 + **修改** 按钮
- 编辑模式下可选择：**保存** / **取消** / **删除**
- 删除后回到空数据状态

### 数据持久化

所有数据通过 `AsyncStorage` 本地持久化，应用重启后自动恢复。

---

## 环境要求

| 工具 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | ≥ 18.16 | 推荐 18.18+ |
| npm | ≥ 9.x | 随 Node.js 安装 |
| Expo Go App | 最新版 | 手机端预览用（[iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)） |

如需在模拟器上运行，还需要：

- **iOS**：macOS + Xcode（最新稳定版）
- **Android**：Android Studio + Android SDK

---

## 快速开始

### 1. 安装依赖

```bash
cd OnchainData

# 国内用户推荐使用淘宝镜像源加速
npm install --registry=https://registry.npmmirror.com

# 或使用默认源
npm install
```

### 2. 启动开发服务器

```bash
npm start
```

启动后终端会显示一个二维码和可用地址（如 `exp://192.168.x.x:8081`）。

### 3. 在设备上预览

- **真机**：打开 Expo Go App → 扫描终端中的二维码
- **iOS 模拟器**：终端中按 `i`
- **Android 模拟器**：终端中按 `a`
- **Web 浏览器**：终端中按 `w`（部分原生功能不可用）

### 4. 验证功能

启动后应用自动显示主页，可通过以下步骤验证各功能：

| 步骤 | 预期结果 |
|------|----------|
| 查看主页 | 显示 15 张 inputData 卡片，可上下滚动 |
| 切换到「订阅列表」 | 显示空状态提示 + 右下角 + 按钮 |
| 点击 + → 填写地址和描述 → 保存 | 列表中出现新条目 |
| 点击列表条目 | 进入编辑页面，表单已填充原数据 |
| 编辑后点击保存 | 列表数据更新 |
| 切换到「我的」 | 显示空状态 + 右上角 + 按钮 |
| 点击 + → 填写 → 保存 | 显示信息卡片 + 修改按钮 |
| 点击修改 → 点击删除 → 确认 | 回到空状态 |
| 重启应用 | 之前保存的数据仍然存在（AsyncStorage 持久化） |

---

## 开发与调试

### 常用脚本

```bash
# 启动 Expo 开发服务器
npm start

# 直接在 iOS 模拟器启动
npm run ios

# 直接在 Android 模拟器启动
npm run android

# TypeScript 类型检查（不生成文件）
npx tsc --noEmit
```

### 调试工具

- **React DevTools**：开发服务器启动后自动连接
- **React Native Debugger**：`open 'rndebugger://set-debugger-loc?host=localhost&port=8081'`
- **Expo DevTools**：浏览器中打开终端显示的 URL

### 热更新

Expo 开发服务器支持 **Fast Refresh**，修改代码后设备自动刷新。

---

## TypeScript 检查

项目使用严格模式 TypeScript（`strict: true`），提交代码前建议运行：

```bash
npx tsc --noEmit
```

确保零错误通过。

---

## 打包与发布

### 方案一：EAS Build（推荐）

EAS Build 是 Expo 官方云端构建服务，无需本地配置原生环境。

```bash
# 1. 安装 EAS CLI
npm install -g eas-cli

# 2. 登录 Expo 账号
eas login

# 3. 配置构建
eas build:configure

# 4. 构建 iOS
eas build --platform ios

# 5. 构建 Android
eas build --platform android

# 6. 同时构建双平台
eas build --platform all
```

构建完成后，EAS 会提供下载链接（`.ipa` / `.apk` / `.aab`）。

### 方案二：本地构建（需要原生环境）

```bash
# 安装 expo 预构建工具
npx expo prebuild

# iOS（需要 Xcode）
npx expo run:ios --configuration Release

# Android（需要 Android Studio）
npx expo run:android --variant release
```

### 方案三：导出离线包

```bash
# 导出 Expo 项目（供裸机 React Native 使用）
npx expo export
```

### 提交应用商店

- **iOS**：通过 Transporter 上传 `.ipa` 到 App Store Connect
- **Android**：上传 `.aab` 到 Google Play Console

---

## 常见问题

### Q: `npm install` 很慢或超时？

使用国内淘宝镜像源：

```bash
npm install --registry=https://registry.npmmirror.com
```

### Q: Metro Bundler 报 Node 版本警告？

部分 Metro 包要求 Node.js ≥ 18.18。如果 Node.js 版本为 18.16.x，会出现 `EBADENGINE` 警告但不影响运行。建议升级到 Node.js 18.18+ 或使用 nvm 管理版本：

```bash
nvm install 18.20
nvm use 18.20
```

### Q: 如何添加自定义图标和启动屏？

替换 `assets/` 目录下的图片文件：

| 文件 | 用途 | 建议尺寸 |
|------|------|----------|
| `icon.png` | 应用图标 | 1024×1024 |
| `splash-icon.png` | 启动屏图标 | 200×200 |
| `adaptive-icon.png` | Android 自适应图标 | 1024×1024 |
| `favicon.png` | Web 图标 | 48×48 |

修改后在 `app.json` 中确认路径正确。

### Q: 如何切换暗色主题？

在 `App.tsx` 中将 `lightTheme` 替换为 `darkTheme`：

```tsx
import { darkTheme } from './src/theme';

<PaperProvider theme={darkTheme}>
```

### Q: 如何清除缓存重新运行？

```bash
npx expo start --clear
```

---

## 许可证

本项目仅供学习和演示用途。
