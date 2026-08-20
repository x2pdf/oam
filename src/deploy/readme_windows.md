# Windows 桌面打包初稿（React Native Web + Tauri）

本文是按 **当前 `oam` 仓库现状** 写的操作草案，不是已经跑通后的实录。

当前工程是 Expo SDK 52 + React Native 0.76 的移动端应用，**还没有** `src-tauri/`、`react-native-web`、`react-dom`、`@tauri-apps/cli`，也没有 Web 导出脚本。因此下面先补齐工程，再导出静态站点，最后用 Tauri 2 打 Windows 安装包。

对照样例（本机曾经打通过）：`D:\code\demo\tsallplatform`。

工作目录一律是仓库根目录：

```powershell
cd D:\code\demo\oam
```

---

## 0. 本机环境（打包前先核对）

Windows 上至少需要：

| 组件 | 用途 | 本机检查命令 |
|------|------|----------------|
| Node.js 18+ / npm | Expo Web 导出、Tauri CLI | `node -v`、`npm -v` |
| Rust stable（MSVC toolchain） | 编译 Tauri | `rustc --version`、`cargo --version` |
| Visual Studio 2022 Build Tools + C++ | 链接 Windows 程序 | 确认存在 `cl.exe` |
| Windows SDK | 系统库 | 例如 `10.0.26100.0` |
| WebView2 Runtime | Tauri 窗口内核 | 注册表或 Edge 组件 |

本仓库 **不需要** 全局安装 `cargo tauri`。Tauri CLI 装在项目的 `devDependencies` 里，通过 `npx tauri` / npm scripts 调用。

公司电脑若开了透明加密：`src-tauri` 必须是未加密明文，否则 `cargo` 可能读到乱码/损坏文件而编译失败。生成 `src-tauri` 后若编译报文件损坏，先把该目录排除加密或另存为明文再继续。

---

## 1. 当前代码必须先改的缺口

不改这些，`expo export --platform web` 或 `tauri build` 过不去，或导出后桌面端不可用。

### 1.1 安装 Web / Tauri 依赖

当前 `package.json` 没有 `react-dom`、`react-native-web`。Expo 52 导出 Web 需要它们，版本需与现有 `react@18.3.1`、`react-native@0.76.9` 对齐：

```powershell
npm install react-dom@18.3.1 react-native-web@~0.19.13
npm install -D @tauri-apps/cli@^2
```

### 1.2 补 npm scripts

在根目录 `package.json` 的 `scripts` 中增加（保留现有 `start` / `android` / `ios`）：

```json
"web": "expo start --web --port 19006",
"build:web": "expo export --platform web",
"desktop": "tauri dev",
"build:desktop": "tauri build"
```

说明：

- 开发态用固定端口 `19006`，与后面 Tauri `devUrl` 一致。
- `build:web` 默认输出到根目录 `dist/`（已在 `.gitignore`）。
- `desktop` / `build:desktop` 依赖第 2 步生成的 `src-tauri`。

### 1.3 把 Expo Web 配成单页静态站点

当前 `app.json` 只有 `web.favicon`。Tauri 读取本地 `dist/`，需要 Metro 打出 SPA，不要 server 模式。把 `expo.web` 改成：

```json
"web": {
  "favicon": "./assets/favicon.png",
  "bundler": "metro",
  "output": "single"
}
```

根目录目前 **没有** `assets/`，但 `app.json` 仍引用 `./assets/icon.png`、`./assets/splash-icon.png`、`./assets/favicon.png`。导出前必须补上这三张图，或改掉这些路径。可从 `tsallplatform/assets` 拷一份占位图。

### 1.4 去掉 Web 不支持的原生模块硬依赖

按当前源码，至少这几处会挡住 Web 导出或运行：

1. **`src/screens/HomeScreen.tsx`**  
   直接 `import PagerView from 'react-native-pager-view'`。该库只有 iOS/Android，没有 web 实现。  
   初稿做法：`Platform.OS === 'web'` 时改用普通 `View` 切换四个列表，不要用 `PagerView`。

2. **`src/wallet/walletManager.ts`、`src/wallet/session.ts`**  
   使用 `expo-secure-store`。该包的 Web stub 为空，`isAvailableAsync()` 在 Web 上为 `false`，私钥/keystore 存取会失败。  
   初稿做法：Web（含 Tauri WebView）先落到 `@react-native-async-storage/async-storage` 或 `localStorage`。这不是硬件安全存储，只为打通打包。

3. **`src/adapter/index.ts`**  
   没有 `web` 分支，`Platform.OS === 'web'` 会落到 Android 适配器。  
   初稿做法：增加 `web` 分支；图片可用 RN `Image`；选图继续走 `expo-image-picker` 的 Web 实现（浏览器文件选择）。不要在 Web 路径上走到 `GifWebView`（依赖 `react-native-webview`）。

改完后再考虑 `tauri build`。不要指望「只加 Tauri、不改业务代码」能一次过。

---

## 2. 初始化 Tauri 工程

在仓库根目录执行（非交互，避免向导卡住）：

```powershell
npx tauri init --ci `
  --app-name OAM `
  --window-title "OAM" `
  --frontend-dist ../dist `
  --dev-url http://localhost:19006 `
  --before-dev-command "npm run web" `
  --before-build-command "npm run build:web"
```

完成后应出现 `src-tauri/`。核对 `src-tauri/tauri.conf.json` 至少包含：

```json
{
  "productName": "OAM",
  "version": "0.1.0",
  "identifier": "com.oam.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:19006",
    "beforeDevCommand": "npm run web",
    "beforeBuildCommand": "npm run build:web"
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"]
  }
}
```

`identifier` 与现有 `src-tauri/tauri.conf.json` 里的 `com.oam.desktop` 保持一致即可。`targets: ["nsis"]` 表示只打 Windows 安装包。

默认会生成 `src-tauri/icons/`。图标文件也必须是未加密明文。

---

## 3. 先验证 Web，再套桌面壳

### 3.1 开发态（可选）

```powershell
npm run web
```

浏览器打开终端里给出的地址（应为 `http://localhost:19006`），确认首页能出来、四个 Tab 能切换、钱包相关页面不会因 SecureStore 直接崩。

再开桌面开发窗：

```powershell
npm run desktop
```

这会先跑 `npm run web`，再启 Tauri 窗口加载该 URL。用于看布局，不产出安装包。

### 3.2 只导出静态站点（正式打包的前置）

```powershell
npm run build:web
```

成功标志：根目录出现 `dist/index.html` 和 `dist/_expo/static/js/web/*.js`。

Expo Metro 导出的 `index.html` 里脚本路径一般是 `/_expo/...`。Tauri 2 用自定义协议托管 `frontendDist`，这种根路径在 `tsallplatform` 上是可用的。若桌面窗口白屏，再查 `dist/index.html` 是否变成了依赖 HTTP 服务器的路径。

不要手改 `dist/`。每次打包都由 `beforeBuildCommand` 重新导出。

---

## 4. 正式打 Windows 包

确认第 1、2 步已落地，然后：

```powershell
npm run build:desktop
```

实际顺序：

1. 执行 `npm run build:web` → 生成 `dist/`
2. `cargo` 编译 `src-tauri`
3. NSIS 打包安装程序

首次编译会拉 Rust crate，时间较长。公司代理/镜像若影响 crates.io，需事先配好 `C:\Users\<用户>\.cargo\config.toml`。

### 产物位置

| 文件 | 路径 |
|------|------|
| 可直接运行的 exe | `src-tauri\target\release\OAM.exe` |
| NSIS 安装包 | `src-tauri\target\release\bundle\nsis\OAM_0.1.0_x64-setup.exe` |

版本号来自 `src-tauri/tauri.conf.json` 的 `version`。安装包文件名会随版本变化。

`target/` 很大，不要提交进 git。

---

## 5. 建议的检查顺序（排错用）

按这个顺序缩小问题，不要一上来只看 Tauri 报错：

1. `node -v` / `rustc --version` / `cl.exe` 是否存在  
2. `npm ls react-dom react-native-web @tauri-apps/cli` 是否装上  
3. `assets/` 三张图是否真实存在  
4. `HomeScreen` 在 Web 上是否还引用 `react-native-pager-view`  
5. `npm run build:web` 能否单独成功  
6. `dist\index.html` 是否生成  
7. `src-tauri` 是否明文（加密盘重点查这里）  
8. `npm run build:desktop`

---

## 6. 初稿尚未覆盖的行为差异

打通打包之后，桌面端和手机端仍会不同，本文不当作已完成项：

- SecureStore 的 Web 回退 **没有** 系统密钥链 / TEE
- `react-native-webview` 套 GIF 的 Windows 方案在 Tauri 里可能套娃 WebView，Web 路径应避免
- 选图、文件 URI、`file://` 缓存目录在 WebView 里和原生 Android 不同
- 窗口尺寸、安全区、`orientation: portrait` 都是按手机写的，桌面需要另调 UI

这些不影响「先打出安装包」的步骤，但会影响桌面可用性。
