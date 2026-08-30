# Expo + Tauri：macOS（Apple Silicon / M1）环境安装与打包

一套 TypeScript 业务代码，同时跑：

- **iOS / Android**：Expo + React Native
- **浏览器**：Expo Web（底层是 `react-native-web`）
- **macOS 桌面**：把 Web 静态资源塞进 Tauri 2 窗口

桌面端**不是**再写一套 HTML，也不是把 React Native 编成 AppKit。链路和 Windows 相同：先让同一套 RN 组件在浏览器里跑，再用 Tauri 做原生窗口把 `dist/` 包进去。

```
App.tsx / src/**（业务 UI）
    ├─ Expo Go / 模拟器     →  iOS、Android
    ├─ expo start --web     →  浏览器（开发）
    └─ expo export --platform web → dist/
           └─ Tauri 加载 dist 或 http://localhost:19006 → macOS .app / .dmg
```

下面按「新 M1/M2/M3 Mac 拉代码就能打 Apple Silicon 包」来写。命令以 **zsh / bash** 为准（Terminal.app 或 iTerm 均可）。

---

## 快速打包（环境已就绪）

如果你的 Mac 已经装好 Node ≥ 20.19.4、Rust、Xcode CLT，并且 `npm install` 也跑过了：

```bash
# 一键打包（环境检查 + web 导出 + Rust 编译 + 打 .app/.dmg）
bash doc/deploy/build-macos.sh --skip-npm-install
```

约 3 分钟（首次 Rust 编译约 2.5 分钟，增量编译约 30 秒）。产物：

| 产物 | 路径 | 体积 |
| --- | --- | --- |
| 应用包 | `src-tauri/target/release/bundle/macos/OAM.app` | 11 MB |
| 磁盘镜像 | `src-tauri/target/release/bundle/dmg/OAM_26.1.1_aarch64.dmg` | 5.2 MB |

打开 `.app` 若被 Gatekeeper 拦截：

```bash
xattr -cr src-tauri/target/release/bundle/macos/OAM.app
open src-tauri/target/release/bundle/macos/OAM.app
```

> **已知坑：** 首次打包后 DMG 安装打开可能白屏——这是 `react-native-quick-crypto` 在 Web 环境（WKWebView）中调用原生 TurboModule 导致的。修复方法见 [12.2 白屏问题](#122-首次打包后白屏web-crypto-api-turbomoduleregistry)。当前代码已修复。

---

**文档状态：已验证。** 已在 macOS 14.8.7（Apple Silicon M1, MacBook Air 13）上实机跑通完整打包流程。

实机环境：

| 项 | 值 |
| --- | --- |
| macOS | 14.8.7（Sonoma） |
| 芯片 | Apple Silicon M1（arm64） |
| Node.js | v20.20.2（arm64） |
| Rust | rustc 1.95.0（host: aarch64-apple-darwin） |
| Xcode | 16.0（Apple clang 16.0.0） |
| 首次 Rust 编译耗时 | 约 2 分 28 秒 |
| `.app` 体积 | 11 MB |
| `.dmg` 体积 | 5.2 MB（修复白屏后从 5.3 MB 降至 5.2 MB） |

**本仓库对照**

| 项 | 值 |
| --- | --- |
| 产品名 | `OAM` |
| 全称 | `Onchain Attachment Message` |
| 窗口标题 | `OAM` |
| 标识符 | `com.oam.desktop` |
| 版本 | `26.1.1` |
| Web 开发端口 | `19006` |
| 预期 `.app` | `src-tauri/target/release/bundle/macos/OAM.app`（实产 11 MB） |
| 预期 `.dmg` | `src-tauri/target/release/bundle/dmg/OAM_26.1.1_aarch64.dmg`（实产 5.2 MB） |

Windows 安装包是 NSIS（`OAM_26.1.1_x64-setup.exe`）。macOS 对应的是 **`.app` 包 + `.dmg` 磁盘镜像**，不能在 Mac 上打 Windows 的 NSIS，也不能在 Windows 上打 `.dmg`。

---

## 1. 技术栈（当前锁定）

与 Windows 文档同一套前端 / Tauri 版本：

| 组件 | 版本 / 说明 |
| --- | --- |
| Expo SDK | `54.0.37` |
| React | `19.1.0` |
| React Native | `0.81.5` |
| react-native-web | `0.21.2` |
| react-dom | `19.1.0` |
| TypeScript | `5.9.2` |
| Tauri CLI | `2.11.4`（Tauri 2） |
| Node.js | **必须 ≥ 20.19.4**（20.18.3 会被 Expo / RN 判定过旧） |
| Rust | stable（实机验证 `1.95.0`；`Cargo.toml` 最低要求 `1.77.2`） |
| Rust 目标 | **`aarch64-apple-darwin`**（M 系列原生；不要用 Rosetta 的 x86_64 Node / Rust 混编） |
| WebView | 系统自带 **WKWebView**（不需要 WebView2） |

Web 导出模式在 `app.json` 里是 `web.output: "single"`（无 Expo Router 的单页应用），方便 Tauri 直接加载 `dist/`。

开发时桌面端连的是固定端口 **19006**（见 `package.json` 的 `web` 脚本和 `src-tauri/tauri.conf.json` 的 `devUrl`）。不要随手改成 8081：很多环境上 8081 已被占用，Expo 会交互式问你换端口，而 Tauri 在非交互模式下会直接失败。

---

## 2. 新电脑要装什么（先装环境，再拉代码）

桌面打包走 Tauri，依赖比「只跑 Expo」多一截。Apple Silicon Mac 上至少要：

1. **Xcode Command Line Tools**（clang、SDK、`git`；只打桌面包够用）
2. **Node.js 20.19.4+**（建议用 nvm，且必须是 **arm64**）
3. **Rust**（`rustc` + `cargo`，host 为 `aarch64-apple-darwin`）
4. **Git**（CLT 一般已带）

可选：

- **Homebrew**：装 nvm / cocoapods 等更省事；Apple Silicon 的 brew 在 `/opt/homebrew`
- **完整 Xcode**：只有要本地编 **iOS** 才需要；纯桌面不强制
- **Apple 开发者账号**：只有要公证（notarize）、分发给别人且过 Gatekeeper 才需要

Android 真机 / iOS 模拟器另外再装。没有它们也能先跑 Web 和 macOS 桌面。

下面每一步都带「怎么确认装好了」。在 Terminal 里执行即可。

### 2.1 确认是 Apple Silicon，不要在 Rosetta 终端里装一整套工具

```bash
uname -m
# 期望：arm64
```

若输出 `x86_64`，当前 Terminal 跑在 Rosetta 下。用「Rosetta 的 x86 Node + 原生 arm64 Rust」混着编，后面 `npm install` / `tauri build` 很容易链失败或打出 Intel 包。

处理：

1. 退出当前终端
2. 用原生 Terminal（不要勾「Open using Rosetta」）
3. 再查一次 `uname -m`

以后检查三件套架构是否一致：

```bash
uname -m                 # arm64
node -p "process.arch"   # arm64
rustc -vV | grep host    # host: aarch64-apple-darwin
```

三条都应该是 ARM，不要混。

### 2.2 Xcode Command Line Tools

Tauri 在 macOS 上用 clang 和 macOS SDK 链 Rust。官方说明：只做桌面可以只装 CLT；要做 iOS 再装完整 Xcode。

```bash
xcode-select --install
```

弹出系统对话框后点安装，等几分钟。确认：

```bash
xcode-select -p
# 常见：/Library/Developer/CommandLineTools
# 若已装完整 Xcode，也可能是 /Applications/Xcode.app/Contents/Developer

clang --version
git --version
```

没有版本号就还没装好，或需要**新开一个终端**。

若提示 `xcode-select: error: command line tools are already installed, use "Software Update"`，去「系统设置 → 通用 → 软件更新」看 CLT 是否还在下。

只打桌面包**不必**从 App Store 装完整 Xcode（体积很大）。若以后要 `npm run ios`，再装 Xcode，打开一次让它装完组件，并：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -runFirstLaunch
```

### 2.3 Homebrew（建议装，桌面打包不是硬依赖）

Apple Silicon 官方安装：<https://brew.sh>

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

装完按提示把 brew 加进 PATH（M 系列一般是）：

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
brew --version
```

确认 `which brew` 是 `/opt/homebrew/bin/brew`，**不是** Intel 时代的 `/usr/local/bin/brew`。

### 2.4 Node.js（不要用 Node 16 / 18 凑合）

Expo SDK 54 和 React Native 0.81 要求：

```text
node: ^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0
```

建议用 **nvm**（和 Windows 文档里的 nvm-windows 同一思路）：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

新开终端（或 `source ~/.zshrc`），然后：

```bash
nvm --version
nvm install 20.19.4
nvm use 20.19.4
nvm alias default 20.19.4
node -v
npm -v
node -p "process.arch"    # 必须是 arm64
```

`node -v` 必须看到 `v20.19.4` 或更高。若 `process.arch` 是 `x64`，说明 Node 是 Intel 版，卸掉重装：

```bash
nvm uninstall 20.19.4
arch -arm64 zsh -c 'nvm install 20.19.4'
node -p "process.arch"
```

没有 nvm 也可以从 <https://nodejs.org> 下 **macOS Apple Silicon (ARM64)** 的 20/22 LTS `.pkg`。不要下 x64 安装包。

### 2.5 Rust

Tauri 要用 `cargo` 编 Rust。检查：

```bash
rustc --version
cargo --version
```

没有就装 **rustup**（官方脚本，默认会按当前架构选 `aarch64-apple-darwin`）：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

默认选项即可（stable）。装完**新开终端**，或：

```bash
source "$HOME/.cargo/env"
```

确认：

```bash
rustc --version
cargo --version
rustc -vV | grep host
# 期望：host: aarch64-apple-darwin
```

二进制一般在 `~/.cargo/bin`。PATH 里没有的话，把下面这行放进 `~/.zshrc`：

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

原生 M1 上 **不必**再 `rustup target add aarch64-apple-darwin`（host 已经是它）。只有要打 **Intel + Apple Silicon 通用包**（universal）时才需要：

```bash
rustup target add x86_64-apple-darwin
# 然后才是：npx tauri build --target universal-apple-darwin --bundles app,dmg
```

初步流程只打 **M 系列原生包**，不要一上来就 universal（时间约翻倍，还要 Intel 目标）。

### 2.6 没有 WebView2 这一步

Windows 上 Tauri 用 Edge WebView2。macOS 上用系统 **WKWebView**，随 macOS 自带，终端用户也不用另装运行时。M1 最低系统是 macOS 11；Tauri 默认最低系统版本是 10.13，对本机无额外操作。

### 2.7 一次性自检

新开终端：

```bash
uname -m                 # arm64
git --version
node -v                  # >= v20.19.4
node -p "process.arch"   # arm64
npm -v
rustc --version
cargo --version
rustc -vV | grep host    # aarch64-apple-darwin
xcode-select -p
clang --version
```

这些都有合理输出，再往下拉代码。

---

## 3. 拉代码并安装依赖

```bash
git clone <本仓库地址>
cd oam                 # 或你的工程目录名
nvm use 20.19.4        # 若用了 nvm
npm install
```

第一次 `npm install` 会拉 Expo、React Native、`@tauri-apps/cli` 等，几分钟很正常。Apple Silicon 会优先下 `darwin-arm64` 的原生包。

然后做两个不启动窗口的检查：

```bash
npx tsc --noEmit
npm run build:web
```

- `tsc` 通过 = TypeScript 没问题（若只有 `baseUrl` 在 TS 6 上的 deprecation，可按提示加 `"ignoreDeprecations": "6.0"`，不挡打包）
- `build:web` 成功后会生成 **`dist/`**（里面有 `index.html`）。这就是给 Tauri **生产包**用的静态站点。`dist/` 已在 `.gitignore` 里，每台机器自己编。

`npm install` / `build:web` 与操作系统无关，Windows 上能过的这两步，Mac 上按理同样能过。

---

## 4. 日常怎么跑

| 命令 | 做什么 |
| --- | --- |
| `npm start` | Expo 开发服务（扫码 / 选平台） |
| `npm run android` | 尽量拉起 Android（需 Android Studio） |
| `npm run ios` | **仅 macOS + Xcode** 能编 iOS |
| `npm run web` | 浏览器，固定 **http://localhost:19006** |
| `npm run build:web` | 导出静态 `dist/` |
| `npm run desktop` | 先起 Expo Web，再开 Tauri 开发窗口 |
| `npm run build:desktop` | **不要直接用**（见下方说明） |
| `npx tauri build --bundles app,dmg` | 先 `build:web`，再编 Rust，再打 `.app` / `.dmg` |
| `bash doc/deploy/build-macos.sh` | **推荐**：环境检查 + 固定产物目录 + 覆盖 bundle 目标 |

### 4.1 不要直接 `npm run build:desktop`

当前 `src-tauri/tauri.conf.json` 里：

```json
"bundle": {
  "active": true,
  "targets": "nsis"
}
```

这是给 **Windows NSIS 安装包** 用的。`npm run build:desktop` 等于 `tauri build`，在 Mac 上会按配置去打 NSIS，**预期失败**。

正确做法是命令行覆盖 bundle 目标（不会改 git 里的配置，也不影响 Windows 打包）：

```bash
npx tauri build --bundles app,dmg
```

等价写法：

```bash
npm run build:desktop -- --bundles app,dmg
```

`--bundles` 的含义见 [Tauri CLI](https://v2.tauri.app/reference/cli/)：`app` 是 `.app` 包，`dmg` 是磁盘镜像。只想先看能不能编过、不打安装镜像时：

```bash
npx tauri build --bundles app
```

以后若希望 `npm run build:desktop` 在 Mac 上直接可用，可以另加 `src-tauri/tauri.macos.conf.json`（Tauri 2 会自动合并平台配置），例如：

```json
{
  "bundle": {
    "targets": ["app", "dmg"]
  }
}
```

**初步流程不要改 `tauri.conf.json` 的 `"targets": "nsis"`**，否则 Windows 那条打包链路会跟着变。

### 4.2 只看浏览器（建议先跑通这一步）

```bash
npm run web
```

浏览器打开 <http://localhost:19006>。应看到和手机端同一套界面（主页 Tab、订阅、我的等）。

### 4.3 桌面开发（Web + Tauri）

```bash
npm run desktop
```

背后两件事：

1. `beforeDevCommand` 执行 `npm run web`，Metro 听 `19006`
2. `cargo` 编译 `src-tauri`，弹出名为产品名的窗口，加载上面的开发地址

`tauri dev` **不走** `bundle.targets`，所以开发窗口在 Mac 上可以直接用，不必加 `--bundles`。

第一次编 Rust 会从 crates.io 拉依赖，**可能 3～10 分钟**。以后增量会快很多。

成功标志类似：

- 终端出现 `Finished dev profile`
- 出现 `Running application "main"`
- 弹出桌面窗口，行为和浏览器一致

关掉窗口后，前台的 Expo 进程一般会一起停。若 19006 仍被占用，见第 8 节。

### 4.4 打 macOS 应用包 / DMG

日常用仓库脚本：

```bash
# 在仓库根目录
bash doc/deploy/build-macos.sh
```

若脚本是从 Windows 拷过来的、带 CRLF，先清换行再赋权：

```bash
sed -i '' $'s/\r$//' doc/deploy/build-macos.sh
chmod +x doc/deploy/build-macos.sh
./doc/deploy/build-macos.sh
```

等价的手动命令：

```bash
export CARGO_TARGET_DIR="$PWD/src-tauri/target"
npx tauri build --bundles app,dmg
```

顺序是：`expo export --platform web` → `cargo build --release` → 打 `.app` → 再打 `.dmg`。

在 **原生 Apple Silicon、且未加 `--target`** 时，预期产物（已实机验证）：

| 产物 | 路径 | 实测体积 |
| --- | --- | --- |
| 可执行文件 | `src-tauri/target/release/app` | — |
| 应用包 | `src-tauri/target/release/bundle/macos/OAM.app` | **11 MB** |
| 磁盘镜像 | `src-tauri/target/release/bundle/dmg/OAM_26.1.1_aarch64.dmg` | **5.2 MB** |

若显式加了 `--target aarch64-apple-darwin`，cargo 会把产物放到带 triple 的目录：

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/OAM.app
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/OAM_26.1.1_aarch64.dmg
```

实机体积：`.app` 约 11 MB、`.dmg` 约 5.2 MB（Apple Silicon M1, macOS 14.8.7）。universal 会明显更大。

`src-tauri/target/` 体积很大，不要提交进 git。即使 DMG 某一步失败，**`.app` 往往已经编出来了**，可以直接 `open`。

本地未签名的 `.app`，第一次打开若被 Gatekeeper 拦住，见 8.5。

---

## 5. 从「只有 iOS/Android」迁到桌面，工程上要改什么

工程侧改动 **已经在本仓库做完**，与 Windows 共用同一份 `src/`、`dist/`、`src-tauri/`。详细步骤、Web 依赖、`app.json`、`tauri init`、`.web.tsx` 分流，见 [`windows-desktop.md` 第 5 节](./windows-desktop.md)。这里只记 **Mac 上多出来的差异**。

### 5.1 本机多装的运行时（只为桌面）

纯 Expo 手机开发有 Node 就够。要编 Tauri，Mac 上还要 **CLT + Rust**。这些装在开发机上，不进 git，也不进手机包。不需要 VS Build Tools，不需要 WebView2。

### 5.2 标识符

本仓库已是 `com.oam.desktop`。Tauri 不建议 identifier 以 `.app` 结尾（在 macOS 上会警告）。不要改成 `com.oam.app` 去和 `app.json` 里的 iOS `bundleIdentifier` 强行对齐——那是手机包的 id，桌面用 `com.oam.desktop` 是对的。

### 5.3 图标

桌面图标由 `npx tauri icon ./assets/icon.png` 生成，写入 `src-tauri/icons/`。macOS 打包依赖其中的 **`icon.icns`**（Windows 则用 `icon.ico`）。本仓库这份文件已经有了，Mac 上不必重做，除非你换了 `assets/icon.png`。

### 5.4 `Platform.OS` 仍是 `'web'`

Tauri 窗口里跑的是 **react-native-web**，在 Mac 上同样是 `Platform.OS === 'web'`，**不会**变成 `'macos'`。适配器、`.web.tsx` 分流与 Windows 完全相同。

### 5.5 开发 vs 生产

```text
开发：npm run desktop
  → Expo Metro 起在 :19006
  → Tauri 窗口打开该 URL（热更新跟 Web 一样）

生产：npx tauri build --bundles app,dmg
  → expo export --platform web  →  dist/index.html + JS
  → cargo 编出 app 二进制，把 dist 打进 OAM.app
  → 再打成 OAM_26.1.1_aarch64.dmg
```

手机侧全程不经过 `dist/` 和 `src-tauri/`。迁桌面是**加一条发行通道**，不是把 iOS/Android 工程改掉。

---

## 6. 工程结构（看代码时按这个找）

```text
oam/
  App.tsx                 根组件（三端共用）
  index.js                Expo 注册根组件
  app.json                Expo 配置（含 web.bundler / web.output）
  package.json            依赖和脚本（含 web / desktop / build:desktop）
  assets/                 图标、favicon
  dist/                   expo export 产出（本地生成，不提交）
  src/                    业务代码
    components/TabPager.* 首页分页：原生 pager-view / Web 分流
    adapter/              平台适配；Web 走 expo 能力，不是 AppKit
  src-tauri/              Tauri 工程
    tauri.conf.json       窗口、devUrl=19006、frontendDist=../dist、targets=nsis
    Cargo.toml            Rust 依赖
    src/main.rs、lib.rs   Tauri 入口（无自定义命令）
    icons/                含 icon.icns（macOS）/ icon.ico（Windows）
    windows/nsis-sidebar.bmp   仅 Windows NSIS 用，Mac 打包可忽略
    target/               Rust 编译产物（不提交）
  doc/deploy/
    windows-desktop.md    Windows 打包文档（已实机）
    macos-desktop.md      本文（已实机验证）
    build-windows.cmd/.ps1
    build-macos.sh        macOS 一键打包（已实机验证）
```

改界面只动 `src/`（以及样式）。不要在桌面端另写一套 HTML，否则三端就分叉了。

`.gitignore` 至少应包含：

```text
dist/
src-tauri/target/
```

---

## 7. iOS / Android（与桌面包独立）

与 Windows 不同：Mac **可以**本地编译 iOS。这和「Web + Tauri 桌面包」仍是两条流水线。

最快验证移动端（不必先装完整 Xcode）：

1. 手机装 [Expo Go](https://expo.dev/go)（商店里的版本要能对上当前 Expo SDK）
2. 电脑和手机同一局域网
3. `npm start`，用 Expo Go 扫终端二维码

以后若要出 ipa：

1. App Store 安装完整 **Xcode**，打开一次完成附加组件
2. `rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim`（仅当走 Tauri iOS 时；Expo 原生 iOS 不靠这个）
3. Homebrew 安装 CocoaPods：`brew install cocoapods`
4. `npm run ios` 或 `npx expo prebuild` / EAS Build

Android 仍需要 Android Studio / SDK。这些都不阻塞当前的 macOS 桌面 `.dmg`。

---

## 8. 常见问题

下列前几条在 Windows 上已经遇到过，Mac 上同样适用。其余是按官方文档和 M 系列常见情况**预先列出**的，实机若有出入以终端报错为准。

### 8.1 Node 版本不够

症状：`Node.js (v20.18.3) is outdated`，或 `EBADENGINE`，要求 `^20.19.4`。

处理：`nvm install 20.19.4 && nvm use 20.19.4`，确认 `node -v`。

### 8.2 端口被占用

症状：`Port 8081 is being used` / `beforeDevCommand terminated`。

本仓库 Web **已经钉在 19006**。若 19006 仍被占：

```bash
lsof -nP -iTCP:19006 -sTCP:LISTEN
```

结束对应 PID（`kill <pid>`），或同时改两处端口：`package.json` 的 `web` 脚本、`src-tauri/tauri.conf.json` 的 `devUrl`。

### 8.3 `tauri build` 去打 NSIS / 找不到 makensis

症状：日志里出现 `nsis`、`makensis`、Windows 路径，或直接 `failed to bundle project`。

原因：`tauri.conf.json` 的 `bundle.targets` 是 `"nsis"`。

处理：不要用裸的 `npm run build:desktop`。改用：

```bash
npx tauri build --bundles app,dmg
```

或跑 `bash doc/deploy/build-macos.sh`。

### 8.4 架构混用（Rosetta / x64 Node）

症状：`npm install` 拉到 `darwin-x64`；或 `tauri` 报 linker / `incompatible architecture`；或打出来的包在 M1 上提示要 Rosetta。

处理：第 2.1 节那三条检查全部回到 `arm64` / `aarch64-apple-darwin` 后再 `rm -rf node_modules && npm install`。

### 8.5 Gatekeeper 拦未签名应用

症状：双击 `.app` 或打开 DMG 里的应用，提示「无法打开，因为无法验证开发者」或「已损坏」。

原因：初步流程**不做** Apple 代码签名和公证。本机开发这样是正常的。

处理（仅本机调试）：

1. 右键 `.app` → 打开 → 仍要打开
2. 或：系统设置 → 隐私与安全性 → 仍要打开
3. 或：

```bash
xattr -cr src-tauri/target/release/bundle/macos/OAM.app
open src-tauri/target/release/bundle/macos/OAM.app
```

要分发给外人且让双击即开，需要 Apple Developer 账号、签名和公证，见 [Tauri：macOS 代码签名](https://v2.tauri.app/distribute/sign/macos/)。初步文档不覆盖这条流水线。

### 8.6 缺少 `icon.icns`

症状：打包时报缺图标 / invalid icon。

处理：

```bash
npx tauri icon ./assets/icon.png
```

本仓库 `src-tauri/icons/icon.icns` 已存在。若 git 没带上或你换了产品图，再跑一次。

### 8.7 CLT / clang 找不到

症状：`linker cc not found`、`xcrun: error: invalid active developer path`。

处理：

```bash
xcode-select --install
sudo xcode-select -s /Library/Developer/CommandLineTools
```

若已装完整 Xcode：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

### 8.8 Web 导出失败：native-only module

症状：`Importing native-only module ... on web from: react-native-pager-view`（或其它原生库）。

处理：见 Windows 文档第 5.7 / 12.1 节。本仓库已用 `TabPager.web.tsx` 拆开，Mac 上不应再踩这一下，除非有人又在 Web 入口 import 了原生包。

### 8.9 产物跑到了临时目录

若环境变量 `CARGO_TARGET_DIR` 被工具链设到临时缓存，`.app` / `.dmg` 会不在仓库里。打包前钉回工程目录：

```bash
export CARGO_TARGET_DIR="$PWD/src-tauri/target"
npx tauri build --bundles app,dmg
```

`build-macos.sh` 已做这一步。

### 8.10 `tsc` 在 TS 6 上报 `baseUrl` deprecated

与打 macOS 包无关，不要当成 Web/Tauri 失败。需要干净 tsc 时再加 `ignoreDeprecations`。

### 8.11 `@noble/hashes` 的 exports 警告可以忽略

ethers 依赖链引起，Web 包仍然能打完。不必为了这条去改 `node_modules`。

### 8.12 打开 .app / DMG 后白屏（Web Crypto API）

症状：双击 `.app` 或安装 DMG 后打开应用，窗口一片空白，无任何 UI。

原因：`index.js` 无条件加载 `react-native-quick-crypto`，该模块在 import 时立即调用 `TurboModuleRegistry.getEnforcing('QuickBase64')`。Tauri 的 WKWebView 是 Web 环境，没有 TurboModuleRegistry，直接崩溃。

处理：确保 `index.js` 用 `Platform.OS !== 'web'` 条件守卫，仅在原生平台加载：

```javascript
if (Platform.OS !== 'web') {
  const { subtle } = require('react-native-quick-crypto');
  // ...
}
```

**关键细节：** 必须用 `require()` 而非 `import`——Metro 对 `import` 做静态分析，即使有 `Platform` 检查仍会把原生代码打包进 Web bundle。Web 环境自带 `crypto.subtle`，不需要 polyfill。

验证方法：用 HTTP 服务器 serve `dist/` 目录，浏览器打开看控制台有无 `getEnforcing` 错误。

---

## 9. 这条链路是怎么接到现有 Expo 工程上的

新电脑**不需要**再 `create-expo-app` 或再 `tauri init`，克隆本仓库即可。桌面工程（`src-tauri/`、Web 依赖、脚本）已经在 Windows 那条线上加好了。

另一台只有 iOS/Android 的 Expo 工程若要复用，顺序仍以 [`windows-desktop.md` 第 9 节](./windows-desktop.md) 为准，Mac 上把「MSVC / WebView2」换成「CLT / Rust aarch64」，打包命令换成 `--bundles app,dmg`。

---

## 10. 建议验收顺序（新 M1 拉完代码后）

1. `uname -m` 为 `arm64`；`node -v` ≥ 20.19.4 且 `process.arch` 为 `arm64`；`rustc` / `cargo` 的 host 为 `aarch64-apple-darwin`；`xcode-select -p` 有路径
2. `npm install`
3. `npx tsc --noEmit`（或确认只剩已知的 TS 6 deprecation）
4. `npm run build:web`，确认出现 `dist/index.html`
5. `npm run web`，浏览器里主流程能点
6. `npm run desktop`，桌面窗口里同样能点
7. `bash doc/deploy/build-macos.sh`（推荐）或 `npx tauri build --bundles app,dmg`，拿到 `.app`（11 MB）/ `.dmg`（5.2 MB）
8. `open` 一下 `.app`（若被拦，按 8.5）
9. （可选）`npm start` + Expo Go 扫码
10. （可选）完整 Xcode 就绪后再 `npm run ios`

第 5 步过了，说明 Expo + react-native-web 没问题。第 6 步过了，说明 Tauri 壳子能加载同一套 UI。第 7 步才是「能拷给别人的 macOS 包」（未签名时对方可能要过 Gatekeeper）。

**实机验收参考（M1, macOS 14.8.7）：**
- 步骤 1～4 约 1 分钟
- 步骤 5 约 1 秒（增量）
- 步骤 6 首次 Rust 编译约 2.5 分钟
- 步骤 7 首次全量编译（含步骤 5 + 6 + 打包）约 3 分钟；修复白屏后增量编译仅约 30 秒

---

## 11. 一键打包脚本（仅 macOS，已实机验证）

路径：`doc/deploy/build-macos.sh`（已在 M1 实机验证）

脚本会：

1. 以脚本位置推算仓库根目录（`doc/deploy` 的上两级），不依赖当前工作目录
2. 确认当前是 Darwin；若 `uname -m` 不是 `arm64` 则警告（仍继续，便于以后在 Intel Mac 上试）
3. 检查 Node ≥ 20.19.4、Node `process.arch`、`rustc`、`cargo`、`xcode-select`
4. 没有 `node_modules` 时执行 `npm install`
5. 把 `CARGO_TARGET_DIR` **钉死**到 `src-tauri/target`
6. 执行 `npx tauri build --bundles app,dmg`（覆盖配置里的 `nsis`）
7. 在标准路径（以及 `aarch64-apple-darwin` 子目录）查找 `.app` / `.dmg` 并打印

```bash
# 仓库根目录
bash doc/deploy/build-macos.sh

# 已装过依赖、跳过 npm install
bash doc/deploy/build-macos.sh --skip-npm-install
```

脚本**不会**替你装 Node / Rust / Xcode CLT / Homebrew。缺环境时会停在检查步骤，并指出缺什么。

也**不会**做 Apple 签名、公证、staple。产出的是本机可跑的未签名包。

---

## 12. 实际踩坑记录（M1 实机验证）

以下为 2026-08-22 在 macOS 14.8.7 / M1 / Node v20.20.2 / Rust 1.95.0 上首次打包的**完整实际过程**。

### 12.1 第一次打包流程

按本文档顺序执行：

1. **环境确认**：`uname -m` → `arm64`，`node -v` → `v20.20.2`，`rustc` → `1.95.0`，`clang` → `16.0.0`
2. **Web 导出**：`npm run build:web` 一次通过，仅一条 `@noble/hashes` exports 警告（可忽略）
3. **Tauri 打包**：`npx tauri build --bundles app,dmg`，Rust 首次编译约 **2 分 28 秒**
4. **产物**：`OAM.app`（11 MB）、`OAM_26.1.1_aarch64.dmg`（5.3 MB）

到此打包本身是成功的。但安装 DMG 后打开应用遇到了白屏问题（见 12.2）。

### 12.2 首次打包后白屏（Web Crypto API + TurboModuleRegistry）

**现象：** DMG 安装后双击打开 OAM.app，窗口完全空白，无任何 UI 渲染。

**诊断过程：**

1. 用 HTTP 服务器 serve `dist/` 目录，浏览器打开 → 控制台报错：`Cannot read properties of undefined (reading 'getEnforcing')`
2. 追踪到 `index.js` 无条件 `import` 了 `react-native-quick-crypto`
3. 该模块加载时立即调用 `TurboModuleRegistry.getEnforcing('QuickBase64')`
4. Tauri 窗口底层是 WKWebView（Web 环境），`TurboModuleRegistry` 不存在 → 崩溃白屏

**修复：** 改 `index.js`，用 `Platform.OS !== 'web'` 条件守卫 + `require()` 动态加载：

```javascript
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  const { subtle } = require('react-native-quick-crypto');
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    globalThis.crypto = { subtle };
  }
}
```

**为什么必须 `require()` 不能用 `import`：** Metro bundler 对 `import` 做静态分析，即使外面有 `Platform.OS` 判断，仍会将原生模块代码打包进 Web bundle。`require()` 是运行时求值，配合条件判断才能真正在 Web 端跳过。

**修复后效果：**

| 项 | 修复前 | 修复后 |
| --- | --- | --- |
| Web bundle 大小 | 3.12 MB | 2.65 MB（减少 470 KB，排除 207 个原生模块） |
| DMG 体积 | 5.3 MB | 5.2 MB |
| 增量 Tauri 编译 | — | 约 26 秒 |
| 白屏 | 是 | 否 |

**验证：** 用 HTTP 服务器 serve 修复后的 `dist/`，浏览器正常渲染；重新打包 DMG 安装后同样正常。

### 12.3 直接 `npm run build:desktop` 会按 NSIS 走

**原因：** `bundle.targets` 锁定 `nsis`，这是 Windows 安装包格式。

**处理：** `--bundles app,dmg`，或用 `build-macos.sh`。不要为了 Mac 去改掉 Windows 的 `nsis`。

**实机确认：** 使用 `npx tauri build --bundles app,dmg` 顺利绕过，未触发 NSIS 相关错误。

### 12.4 首次 Rust 编译耗时

**实机结果：** 从 `cargo build --release` 开始到完成，约 **2 分 28 秒**（M1 MacBook Air 13, macOS 14.8.7）。修复白屏后的增量编译仅 **26 秒**。

### 12.5 最终产物体积

**实机结果（修复白屏后）：**

| 产物 | 体积 |
| --- | --- |
| `OAM.app` | 11 MB |
| `OAM_26.1.1_aarch64.dmg` | 5.2 MB |

与 Windows 那条线（exe 约 13 MB、NSIS 约 6.3 MB）基本同一量级。

### 12.6 未签名就被当成「已损坏」

macOS 较新版本对未公证应用更严。本机用 8.5 的 `xattr -cr` + 右键打开即可。不要一上来配证书，否则初步流程会卡在开发者账号。

### 12.7 脚本 CRLF

在 Windows 上创建的 `.sh` 可能是 CRLF，Mac 上会报 `$'\r': command not found`。按第 4.4 节 `sed` 去掉 `\r`。从 git 克隆时若 `core.autocrlf` 把脚本转成 CRLF，同样处理。

### 12.8 `CARGO_TARGET_DIR` 被改走

部分 Cursor / CI 环境会注入该变量。脚本已钉到 `src-tauri/target`。手动打包时自己 `export` 一次。

### 12.9 universal 包不是第一步

`universal-apple-darwin` 要同时编 `x86_64-apple-darwin` 和 `aarch64-apple-darwin` 再 `lipo`。M1 本机验证请先打 `aarch64` 单架构。Intel Mac 用户不够时再补 universal。

---

一句话对照：

| 产物 | Windows | macOS（M1） |
| --- | --- | --- |
| C 工具链 | VS 2022 Build Tools（MSVC） | Xcode Command Line Tools（clang） |
| WebView | WebView2 | 系统 WKWebView |
| Node | nvm-windows，x64 | nvm，**arm64** |
| Rust host | `x86_64-pc-windows-msvc` | `aarch64-apple-darwin` |
| 打包目标 | `nsis`（配置默认） | 必须 `--bundles app,dmg` 覆盖 |
| 产物 | `app.exe` + `*_x64-setup.exe` | `OAM.app`（11 MB）+ `*_aarch64.dmg`（5.2 MB） |
| 一键脚本 | `doc/deploy/build-windows.cmd`（已实机） | `doc/deploy/build-macos.sh`（已实机） |
| 分发门槛 | 有 WebView2 即可跑 | 未签名时对方可能被 Gatekeeper 拦 |
| 已知坑 | — | `react-native-quick-crypto` 需 `Platform.OS` 守卫，否则白屏 |
