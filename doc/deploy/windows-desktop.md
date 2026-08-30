# Expo + Tauri：Windows 安装包打包

一套 TypeScript 业务代码，同时跑：

- **iOS / Android**：Expo + React Native
- **浏览器**：Expo Web（底层是 `react-native-web`）
- **Windows 桌面**：把 Web 静态资源塞进 Tauri 2 窗口

桌面端**不是**再写一套 HTML，也不是把 React Native 编成 Win32。链路是：先让同一套 RN 组件在浏览器里跑，再用 Tauri 做原生窗口把 `dist/` 包进去。

```
App.tsx / src/**（业务 UI）
    ├─ Expo Go / 模拟器     →  iOS、Android
    ├─ expo start --web     →  浏览器（开发）
    └─ expo export --platform web → dist/
           └─ Tauri 加载 dist 或 http://localhost:19006 → Windows exe / 安装包
```

下面按「新电脑拉代码就能打 Windows 包」来写。命令以 PowerShell 为准。

**本仓库对照**

| 项 | 值 |
| --- | --- |
| 产品名 | `OAM` |
| 全称 | `Onchain Attachment Message` |
| 窗口标题 | `OAM` |
| 标识符 | `com.oam.desktop` |
| 版本 | `26.1.2` |
| Web 开发端口 | `19006` |
| 安装包 | `src-tauri/target/release/bundle/nsis/OAM_26.1.2_x64-setup.exe` |

---

## 1. 技术栈（当前锁定）

| 组件 | 版本 / 说明 |
| --- | --- |
| Expo SDK | `57.0.14` |
| React | `19.2.3` |
| React Native | `0.86.2` |
| react-native-web | `0.21.2` |
| react-dom | `19.2.3` |
| TypeScript | `6.0.3` |
| Tauri CLI | `2.11.4`（Tauri 2） |
| Node.js | **必须 ≥ 20.19.4**（20.18.3 会被 Expo / RN 判定过旧） |
| Rust | stable（本机验证过 `1.97.1`） |

Web 导出模式在 `app.json` 里是 `web.output: "single"`（无 Expo Router 的单页应用），方便 Tauri 直接加载 `dist/`。

开发时桌面端连的是固定端口 **19006**（见 `package.json` 的 `web` 脚本和 `src-tauri/tauri.conf.json` 的 `devUrl`）。不要随手改成 8081：很多环境上 8081 已被占用，Expo 会交互式问你换端口，而 Tauri 在非交互模式下会直接失败。

---

## 2. 新电脑要装什么（先装环境，再拉代码）

桌面打包走 Tauri，依赖比「只跑 Expo」多一截。Windows 上至少要：

1. **Git**
2. **Node.js 20.19.4+**（建议用 nvm-windows 管理）
3. **Rust**（`rustc` + `cargo`，MSVC 工具链）
4. **Visual Studio 2022 Build Tools**（工作负载：使用 C++ 的桌面开发）
5. **WebView2 Runtime**（Win11 一般自带）

Android / iOS 真机另外再装。没有它们也能先跑 Web 和 Windows 桌面。

下面每一步都带「怎么确认装好了」。PowerShell 里执行即可。

### 2.1 Git

```powershell
git --version
```

没有的话：<https://git-scm.com/download/win> 安装，装完**新开一个终端**。

### 2.2 Node.js（不要用 Node 16 / 18 凑合）

Expo SDK 57 和 React Native 0.86 要求：

```text
node: ^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0
```

如果已经有 **nvm-windows**：

```powershell
nvm version
nvm list
nvm install 20.19.4
nvm use 20.19.4
node -v
npm -v
```

`node -v` 必须看到 `v20.19.4` 或更高。若同时装着 `C:\Program Files\nodejs` 里的旧 Node，`where.exe node` 可能列出两条。以 `nvm use` 之后 **nvm 那条**为准，必要时把 nvm 的 `nodejs` 目录放到 PATH 更前面。

没有 nvm 也可以从 <https://nodejs.org> 装 20/22 LTS，但多版本共存时 nvm 更省事。

### 2.3 Rust

Tauri 要用 `cargo` 编 Rust。检查：

```powershell
rustc --version
cargo --version
```

没有就装 **rustup**（winget 不稳定时直接下官方安装器更省事）。

1. 打开 <https://rustup.rs>
2. 下载 `rustup-init.exe`
3. 默认选 **x86_64-pc-windows-msvc**
4. 非交互可以：

```powershell
# 把 rustup-init.exe 放到当前目录后
.\rustup-init.exe -y --default-toolchain stable --default-host x86_64-pc-windows-msvc
```

装完**新开终端**，确认 `rustc`、`cargo` 能跑。二进制一般在：

```text
%USERPROFILE%\.cargo\bin
```

PATH 里没有的话手动加上。

### 2.4 Visual Studio 2022 Build Tools（Windows 必装）

Rust 的 `windows-msvc` 目标需要 MSVC 的 `cl.exe` 和 Windows SDK。只装 rustup、不装 C++ 工具链，后面 `tauri dev` / `tauri build` 会链不过去。

1. 下载 Build Tools：<https://aka.ms/vs/17/release/vs_BuildTools.exe>
2. 安装时勾选 **「使用 C++ 的桌面开发」**（Desktop development with C++），带上 Windows 10/11 SDK。
3. 静默示例（体积大，大约 10 分钟级）：

```powershell
.\vs_BuildTools.exe --quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended
```

装好后 `cl.exe` 典型路径类似：

```text
C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\<版本>\bin\Hostx64\x64\cl.exe
```

可用 vswhere 确认（安装器会带上）：

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
```

日常不必把 `cl` 加进 PATH。`cargo` 能通过 vswhere 找到即可。若某次链接报找不到 `link.exe`，用 **「x64 Native Tools Command Prompt for VS 2022」** 再跑 `npm run desktop`。

### 2.5 WebView2

Tauri 在 Windows 上用 Edge WebView2 画界面。Win11 通常已有。检查：

```powershell
Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" | Select-Object pv
```

没有版本号就装 Evergreen Runtime：<https://developer.microsoft.com/microsoft-edge/webview2/>

### 2.6 一次性自检

新开 PowerShell：

```powershell
git --version
node -v          # >= v20.19.4
npm -v
rustc --version
cargo --version
```

四样都有版本号，再往下拉代码。

---

## 3. 拉代码并安装依赖

```powershell
git clone <本仓库地址>
cd oam                 # 或你的工程目录名
nvm use 20.19.4        # 若用了 nvm
npm install
```

第一次 `npm install` 会拉 Expo、React Native、`@tauri-apps/cli` 等，几分钟很正常。

然后做两个不启动窗口的检查：

```powershell
npx tsc --noEmit
npm run build:web
```

- `tsc` 通过 = TypeScript 没问题（若只有 `baseUrl` 在 TS 6 上的 deprecation，可按提示加 `"ignoreDeprecations": "6.0"`，不挡打包）
- `build:web` 成功后会生成 **`dist/`**（里面有 `index.html`）。这就是给 Tauri **生产包**用的静态站点。`dist/` 已在 `.gitignore` 里，每台机器自己编。

---

## 4. 日常怎么跑

| 命令 | 做什么 |
| --- | --- |
| `npm start` | Expo 开发服务（扫码 / 选平台） |
| `npm run android` | 尽量拉起 Android |
| `npm run ios` | 仅 macOS 能编 iOS；Windows 上请用 Expo Go |
| `npm run web` | 浏览器，固定 **http://localhost:19006** |
| `npm run build:web` | 导出静态 `dist/` |
| `npm run desktop` | 先起 Expo Web，再开 Tauri 开发窗口 |
| `npm run build:desktop` | 先 `build:web`，再编 Rust，再打 Windows 安装包 |
| `doc\deploy\windows-build.cmd` | **推荐**：环境检查 + 固定产物目录 + NSIS/加密回退的一键打包 |

### 4.1 只看浏览器（建议先跑通这一步）

```powershell
npm run web
```

浏览器打开 <http://localhost:19006>。应看到和手机端同一套界面（主页 Tab、订阅、我的等）。

### 4.2 桌面开发（Web + Tauri）

```powershell
npm run desktop
```

背后两件事：

1. `beforeDevCommand` 执行 `npm run web`，Metro 听 `19006`
2. `cargo` 编译 `src-tauri`，弹出名为产品名的窗口，加载上面的开发地址

第一次编 Rust 会从 crates.io 拉依赖，**可能 3～10 分钟**。以后增量会快很多。

成功标志类似：

- 终端出现 `Finished dev profile`
- 出现 `Running application "main"`
- 弹出桌面窗口，行为和浏览器一致

关掉窗口后，前台的 Expo 进程一般会一起停。若 19006 仍被占用，见第 8 节。

### 4.3 打 Windows 安装包 / 可执行文件

日常直接跑仓库里的脚本（会处理本次踩过的坑，见第 11、12 节）：

```powershell
# 在仓库根目录，或双击 doc\deploy\windows-build.cmd
.\doc\deploy\windows-build.cmd
```

等价的手动命令是：

```powershell
npm run build:desktop
```

顺序是：`expo export --platform web` → `cargo build --release` → NSIS 打包。

正常产物（`tauri.conf.json` 里 `bundle.targets` 为 `nsis`）：

| 产物 | 路径 |
| --- | --- |
| 可执行文件 | `src-tauri/target/release/app.exe` |
| 安装包 | `src-tauri/target/release/bundle/nsis/<产品名>_<版本>_x64-setup.exe` |

本仓库本次产物：

| 产物 | 路径 | 大约体积 |
| --- | --- | --- |
| 可执行文件 | `src-tauri/target/release/app.exe` | ~13 MB |
| 安装包 | `src-tauri/target/release/bundle/nsis/OAM_26.1.2_x64-setup.exe` | ~6.3 MB |

`src-tauri/target/` 体积很大，不要提交进 git。即使安装包某一步失败，**release 的 exe 往往已经编出来了**，可以直接双击跑（需本机有 WebView2）。

---

## 5. 从「只有 iOS/Android」迁到桌面，工程上要改什么

业务页面原则上继续只用 `react-native` 的 `View` / `Text` / `Pressable` 等。这些组件在 iOS、Android、Web 上由各自实现渲染。

需要避开的（加功能时要注意）：

- 仅原生存在的模块（相机、蓝牙等部分 API 在 Web 上不可用）
- 直接操作 DOM、`window`（手机上没有）
- 为桌面单独复制一份页面
- **在 Web 入口直接 `import` 没有 Web 实现的原生库**（见 5.6）

桌面端在 Tauri 窗口里跑的是 **react-native-web**，所以 `Platform.OS === 'web'`，**不会**变成 `'windows'`。

### 5.1 本机多装的运行时（只为桌面）

纯 Expo 手机开发有 Node 就够。要编 Tauri，Windows 上还要 Rust、VS 2022 Build Tools、WebView2。这些装在开发机上，不进 git，也不进手机包。

### 5.2 补上 Web 依赖

模板若默认不带 Web：

```powershell
npx expo install react-dom react-native-web
```

`react-dom` 和 `react-native-web` 会按当前 Expo SDK 对齐版本。没有它们，`expo start --web` / `expo export --platform web` 起不来。

本仓库已锁定：

```json
"react-dom": "19.2.3",
"react-native-web": "0.21.2"
```

### 5.3 告诉 Expo：Web 用 Metro，导出成单页静态站

在 `app.json` 的 `expo.web` 里：

```json
"web": {
  "favicon": "./assets/favicon.png",
  "bundler": "metro",
  "output": "single"
}
```

- `bundler: "metro"`：和手机同一套打包器
- `output: "single"`：没有 Expo Router 时导出 SPA。Tauri 生产模式读的是目录里的 `index.html`

### 5.4 安装 Tauri CLI，并在现有目录里 init

```powershell
npm install -D @tauri-apps/cli@2.11.4
npx tauri init --ci --app-name OAM --window-title "OAM" --frontend-dist ../dist --dev-url http://localhost:19006 --before-dev-command "npm run web" --before-build-command "npm run build:web"
```

换到别的工程时，把 `--app-name` / `--window-title` 改成自己的产品名。这会生成整个 **`src-tauri/`**。

关键配置对应关系：

| 配置 | 含义 |
| --- | --- |
| `devUrl`: `http://localhost:19006` | 开发时窗口去加载 Expo Web 开发服 |
| `beforeDevCommand`: `npm run web` | `tauri dev` 会先把 Web 开发服拉起来 |
| `frontendDist`: `../dist` | 生产包去加载 `expo export` 产出的静态文件 |
| `beforeBuildCommand`: `npm run build:web` | `tauri build` 会先导出 Web，再编 exe |
| `identifier` | 建议用 `com.<产品>.desktop`，避免 `.app` 后缀在 macOS 上的警告 |
| `bundle.targets` | Windows 只要安装包时设为 `nsis` |

本仓库 `src-tauri/tauri.conf.json` 里还指定了 NSIS 欢迎页侧栏图（避免走系统 AppData 里可能被加密的默认 `win.bmp`）：

```json
"bundle": {
  "targets": "nsis",
  "windows": {
    "nsis": {
      "sidebarImage": "windows/nsis-sidebar.bmp"
    }
  }
}
```

### 5.5 用现有 Expo 图标生成桌面图标

```powershell
npx tauri icon ./assets/icon.png
```

写入 `src-tauri/icons/`。不这一步，打包时会缺 ico/png。

### 5.6 在 `package.json` 里加脚本（手机脚本保留）

```json
"start": "expo start",
"android": "expo run:android",
"ios": "expo run:ios",
"web": "expo start --web --port 19006",
"build:web": "expo export --platform web",
"desktop": "tauri dev",
"build:desktop": "tauri build"
```

- 手机命令原样保留
- `web` **必须钉死端口**，和 `tauri.conf.json` 的 `devUrl` 一致
- `desktop` / `build:desktop` 只是 Tauri CLI 的别名，真正的前后顺序由 `tauri.conf.json` 的 `before*` 控制

### 5.7 Web 不能直接引用的原生模块（本仓库已处理）

`expo export --platform web` 会静态跟踪 `import`。下面这种会直接失败：

```text
Importing native-only module "react-native/Libraries/Utilities/codegenNativeCommands" on web
from: node_modules/react-native-pager-view/...
```

处理办法：用 Metro 的平台后缀拆文件，**不要在 Web 入口 import 原生-only 包**。

本仓库首页滑动 Tab 的拆分：

| 文件 | 用途 |
| --- | --- |
| `src/components/TabPager.types.ts` | 共用类型 |
| `src/components/TabPager.tsx` | 原生：内部用 `react-native-pager-view` |
| `src/components/TabPager.web.tsx` | Web / 桌面：用 `View` 切换，不引用 pager-view |

`HomeScreen.tsx` 只 `import TabPager from '../components/TabPager'`。Metro 在 Web 上会解析到 `.web.tsx`。

同类问题（`react-native-webview`、部分相机模块）也用 `.web.tsx` / `.native.tsx` 拆，而不是 `Platform.OS === 'web'` 包一层——因为静态 import 在条件分支里仍会被打进 Web 包。

另外：`Platform.OS` 在 Tauri 里是 `'web'`。图片选择等适配器要显式处理 `web` 分支（本仓库 `src/adapter/index.ts` 已把 `web` 指到 Android / Expo 那套，因为 `expo-image-picker` 在 Web 上可用）。

### 5.8 开发 vs 生产，桌面各走哪条路

```text
开发：npm run desktop
  → Expo Metro 起在 :19006
  → Tauri 窗口打开该 URL（热更新跟 Web 一样）

生产：npm run build:desktop
  → expo export --platform web  →  dist/index.html + JS
  → cargo 编出 app.exe，把 dist 打进包里
  → NSIS 再打成 setup.exe
```

手机侧全程不经过 `dist/` 和 `src-tauri/`。所以迁桌面是**加一条发行通道**，不是把 iOS/Android 工程改掉。

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
    adapter/              平台适配；Web 走 expo 能力，不是 Win32
  src-tauri/              Tauri 工程
    tauri.conf.json       窗口、devUrl=19006、frontendDist=../dist、nsis
    Cargo.toml            Rust 依赖
    src/main.rs、lib.rs   Tauri 入口（无自定义命令）
    icons/                桌面图标
    windows/nsis-sidebar.bmp   NSIS 欢迎页侧栏图
    target/               Rust 编译产物（不提交）
```

改界面只动 `src/`（以及样式）。不要在桌面端另写一套 HTML，否则三端就分叉了。

`.gitignore` 至少应包含：

```text
dist/
src-tauri/target/
```

---

## 7. iOS / Android（与桌面包独立）

Windows **不能**本地编译 iOS。Android 原生包需要 Android Studio / SDK，本流程没有强制安装。

最快验证移动端：

1. 手机装 [Expo Go](https://expo.dev/go)（商店里的版本要能对上当前 Expo SDK）
2. 电脑和手机同一局域网
3. `npm start`，用 Expo Go 扫终端二维码

以后若要出 apk / ipa，走 Expo 的 `npx expo prebuild` 或 EAS Build，那是另一条流水线，与当前「Web + Tauri」独立。

---

## 8. 常见问题

### 8.1 Node 版本不够

症状：`Node.js (v20.18.3) is outdated`，或 `EBADENGINE`，要求 `^20.19.4`。

处理：`nvm install 20.19.4 && nvm use 20.19.4`，确认 `node -v`。

### 8.2 端口被占用

症状：`Port 8081 is being used` / `beforeDevCommand terminated`。

本仓库 Web **已经钉在 19006**。若 19006 仍被占：

```powershell
netstat -ano | findstr ":19006"
```

结束对应 PID，或同时改两处端口：`package.json` 的 `web` 脚本、`src-tauri/tauri.conf.json` 的 `devUrl`。

### 8.3 `tauri build` 下载 NSIS 超时

症状：`Downloading https://github.com/tauri-apps/binary-releases/... nsis-3.11.zip` 然后 `timeout: global`。

处理：能访问 GitHub 时重试；或手动把工具链放到 `%LOCALAPPDATA%\tauri\NSIS\`（需含 `makensis.exe`、`Bin\makensis.exe`、插件目录）。官方说明见 [Tauri binary-releases](https://github.com/tauri-apps/binary-releases)。

### 8.4 NSIS 报 `win.bmp` / `no files found`

症状：`Finished release` 且 `app.exe` 已生成，但 `makensis` 失败：

```text
File: "...\tauri\NSIS\Contrib\Graphics\Wizard\win.bmp" -> no files found
Error in macro MUI_PAGE_WELCOME
```

常见原因：公司电脑透明加密把 `%LOCALAPPDATA%\tauri\NSIS` 下的 `.bmp` 变成 `*.bmp.IPGSD`，`makensis` 按原名找不到。

处理（任选）：

1. 解密 `%LOCALAPPDATA%\tauri\NSIS` 后再打一次。
2. 在工程里放一份自己的侧栏 BMP，并在 `tauri.conf.json` 设置 `bundle.windows.nsis.sidebarImage`（本仓库已用 `src-tauri/windows/nsis-sidebar.bmp`）。
3. 若 exe 已经编出来、只差安装包：改生成的 `installer.nsi` 里 `SIDEBARIMAGE` 指向工程内 BMP，再手动跑 `%LOCALAPPDATA%\tauri\NSIS\makensis.exe`。

NSIS 欢迎图建议用 **24 位 BMP**（164×314）。32 位 BMP 可能出现 `Unsupported format` 警告，安装包仍可能打出。

### 8.5 `tauri.conf.json` 不是合法 UTF-8

症状：`unable to read Tauri config file ... because stream did not contain valid UTF-8`。

常见原因：公司透明加密。编辑器 / PowerShell 仍能「看」到明文，但 `cargo` 读到的是密文。

处理：解密 `src-tauri/tauri.conf.json` 后立刻打包，中间不要再用会触发回加密的方式改这个文件。也可用无 BOM 的 UTF-8 重写后再解密一次：

```powershell
$p = "src-tauri\tauri.conf.json"
$utf8 = New-Object System.Text.UTF8Encoding $false
# 确认 [System.IO.File]::ReadAllBytes($p) 开头是 7B 0A（即 `{` + 换行）
```

### 8.6 winget 装 Rust / VS 失败

症状：`InternetOpenUrl() failed`、卡在 `Starting package install`。

处理：浏览器下载 `rustup-init.exe`、`vs_BuildTools.exe`，本地静默/图形界面安装。不必依赖 winget。

### 8.7 Web 导出失败：native-only module

症状：`Importing native-only module ... on web from: react-native-pager-view`（或其它原生库）。

处理：见第 5.7 节，用 `.web.tsx` 拆开，不要让 Web 包碰到该 import。

### 8.8 产物跑到了临时目录

若环境变量 `CARGO_TARGET_DIR` 被工具链设到 `%TEMP%\cursor-sandbox-cache\...`，exe / 安装包会不在仓库里。可临时改回工程目录：

```powershell
$env:CARGO_TARGET_DIR = "$pwd\src-tauri\target"
npm run build:desktop
```

或把产物复制到 `src-tauri/target/release/` 再分发。

---

## 9. 这条链路是怎么接到现有 Expo 工程上的

新电脑**不需要**再 `create-expo-app`，克隆本仓库即可。下面是给「另一个只有 iOS/Android 的 Expo 工程」复用时的顺序。

1. 检查本机：Node、Rust、MSVC、WebView2。缺什么装什么（第 2 节）。
2. `npx expo install react-dom react-native-web`
3. `app.json` 补 `web.bundler` / `web.output`
4. `npm install -D @tauri-apps/cli@2.11.4`，再 `npx tauri init --ci ...`（第 5.4 节）
5. `npx tauri icon ./assets/icon.png`
6. `package.json` 加上 `web` / `build:web` / `desktop` / `build:desktop`
7. 处理 Web 不支持的原生 import（第 5.7 节）
8. `npm run build:web` → `npm run desktop` → `npm run build:desktop`

---

## 10. 建议验收顺序（新电脑拉完代码后）

1. `node -v` ≥ 20.19.4，`rustc`、`cargo` 可用
2. `npm install`
3. `npx tsc --noEmit`（或确认只剩已知的 TS 6 deprecation）
4. `npm run build:web`，确认出现 `dist/index.html`
5. `npm run web`，浏览器里主流程能点
6. `npm run desktop`，桌面窗口里同样能点
7. `.\doc\deploy\windows-build.cmd`（推荐）或 `npm run build:desktop`，拿到 exe / NSIS 安装包
8. （可选）`npm start` + Expo Go 扫码

第 5 步过了，说明 Expo + react-native-web 没问题。第 6 步过了，说明 Tauri 壳子能加载同一套 UI。第 7 步才是「能发给别人的 Windows 包」。

---

## 11. 一键打包脚本（仅 Windows）

路径：

- `doc/deploy/windows-build.cmd` — 双击或在 cmd / PowerShell 里运行
- `doc/deploy/windows-build.ps1` — 实际逻辑

脚本会：

1. 以脚本位置推算仓库根目录（`doc/deploy` 的上两级），不依赖当前工作目录
2. 检查 Node ≥ 20.19.4、`rustc`、`cargo`
3. 没有 `node_modules` 时执行 `npm install`
4. 把 `CARGO_TARGET_DIR` **钉死**到 `src-tauri\target`（避免产物落到临时目录）
5. 确保 NSIS 侧栏图是 **24 位 BMP**（164×314），缺则用 `assets/icon.png` 生成
6. 执行 `npm run build:desktop`
7. 若 NSIS 因默认 `win.bmp` 失败，但 `app.exe` 已编出：自动改 `installer.nsi` 的 `SIDEBARIMAGE` 再跑 `makensis`
8. 把 exe / 安装包归集到标准路径，并打印出来

```powershell
# 仓库根目录
.\doc\deploy\windows-build.cmd

# 已装过依赖、跳过 npm install
powershell -NoProfile -ExecutionPolicy Bypass -File .\doc\deploy\windows-build.ps1 -SkipNpmInstall
```

脚本**不会**替你装 Node / Rust / VS Build Tools / WebView2。缺环境时会停在检查步骤，并指出缺什么。

---

## 12. 本次打包实踩的坑

下面是本仓库第一次打 Windows 包时真实遇到的问题，按发生顺序记。通用环境下多数不会全中；公司电脑、Cursor 代理终端、带原生模块的 Expo 应用更容易中。

### 12.1 Web 导出被 `react-native-pager-view` 卡死

**现象：** `npm run build:web` 报：

```text
Importing native-only module "react-native/Libraries/Utilities/codegenNativeCommands" on web
from: node_modules\react-native-pager-view\lib\module\PagerViewNativeComponent.ts
```

**原因：** Metro 做 Web 包时会静态跟踪 `import`。`HomeScreen.tsx` 顶层 `import PagerView from 'react-native-pager-view'`，即使运行时不会在 Web 上用，导出也会失败。pager-view 8.x 没有可用的 Web 实现。

**处理：** 拆成 `TabPager.tsx`（原生）+ `TabPager.web.tsx`（只用 `View` 切换）。**不要**写成：

```ts
if (Platform.OS !== 'web') {
  const PagerView = require('react-native-pager-view');
}
```

也不要在同一个会被 Web 解析到的文件里 import 原生包。Metro 的平台后缀才是可靠分流。

### 12.2 Tauri 里 `Platform.OS` 是 `'web'`，不是 `'windows'`

**现象：** 工程里已有 `src/adapter/windows/`，但桌面窗口走的仍是 fallback。

**原因：** 桌面 UI 是 WebView2 里的 react-native-web，不是 RN Windows。`Platform.OS === 'windows'` 不会成立。

**处理：** 适配器增加 `web` 分支。本仓库图片选择走 Expo 的 Android/Web 实现（`expo-image-picker` 在浏览器可用），不要误用依赖 `expo-file-system` + `react-native-webview` 的 Windows 实现。

### 12.3 `tauri.conf.json` 对编辑器是明文，对 `cargo` 是乱码

**现象：** `Read` / PowerShell 能正常打开 JSON，开头也是 `{`，但：

```text
unable to read Tauri config file at ...\tauri.conf.json because stream did not contain valid UTF-8
```

**原因：** 公司透明加密。走过滤器的进程看到解密后的 UTF-8；`cargo` 的 build script 读到密文。解密后用编辑器 / Cursor 再保存一次，文件会被**重新加密**，刚才还能编过的工程马上又失败。

**处理：**

1. 解密 `src-tauri/tauri.conf.json` 后马上打包，不要再改这个文件。
2. 需要改配置时，用无 BOM 的 UTF-8 写完再解密一次。
3. 一键脚本若扫到这条错误，会提示先解密再重跑，而不会假装已经打好包。

PowerShell 里「看起来是 UTF-8」不能当作 `cargo` 也能读。判断要以 `tauri build` 是否过为准。

### 12.4 NSIS 失败：`win.bmp` 找不到，但 exe 已经有了

**现象：** `Finished release profile`，日志里已有 `Built application at: ...\app.exe`，随后：

```text
File: "...\AppData\Local\tauri\NSIS\Contrib\Graphics\Wizard\win.bmp" -> no files found
Error in macro MUI_PAGE_WELCOME
failed to bundle project
```

磁盘上对应文件实际是 `win.bmp.IPGSD`（加密后缀）。`dir /s /b` 只看到 `.IPGSD`；`Test-Path win.bmp` 有时仍返回 True（过滤器骗过了 PowerShell，骗不过 `makensis`）。

**处理：**

1. `tauri.conf.json` 里配置 `bundle.windows.nsis.sidebarImage`，指向仓库内自己的 BMP（本仓库：`src-tauri/windows/nsis-sidebar.bmp`）。
2. 一键脚本在 `tauri build` 的 NSIS 步骤失败后，会找已生成的 `installer.nsi`，把 `SIDEBARIMAGE` 改成仓库内 BMP，再单独跑 `makensis`。
3. 记住：**安装包失败 ≠ exe 失败**。`app.exe` 往往已经能双击用。

### 12.5 侧栏 BMP 用 GDI+ 默认保存会变成 32 位

**现象：** 安装包能打出，但 `makensis` 警告：

```text
Unsupported format D:\...\nsis-sidebar.bmp (macro:MUI_WELCOMEPAGE_GUIINIT)
```

**原因：** `System.Drawing.Bitmap.Save(..., ImageFormat.Bmp)` 默认是 32 位。NSIS Modern UI 欢迎页要 **24 位 BMP**，推荐尺寸 164×314。

**处理：** 创建位图时指定 `PixelFormat.Format24bppRgb`。脚本会检测已有 BMP 的色深，不是 24 位就重生成。

### 12.6 产物跑到 `%TEMP%\cursor-sandbox-cache\...`

**现象：** 日志写 `Built application at: C:\Users\...\AppData\Local\Temp\cursor-sandbox-cache\...\app.exe`，仓库的 `src-tauri/target` 是空的。

**原因：** 部分 Cursor / 代理终端会注入 `CARGO_TARGET_DIR`，cargo 就不写到 crate 默认的 `src-tauri/target`。

**处理：** 打包前在同一进程里覆盖：

```powershell
$env:CARGO_TARGET_DIR = "$repoRoot\src-tauri\target"
```

脚本已做这一步，并在结束后检查标准路径；若 exe 只在临时目录，会复制回来。

### 12.7 `tsc` 在 TS 6 上报 `baseUrl` deprecated

**现象：** `npx tsc --noEmit` 退出码 2：

```text
tsconfig.json: Option 'baseUrl' is deprecated ... Specify "ignoreDeprecations": "6.0"
```

**处理：** 这与打 Windows 包无关，不要当成 Web/Tauri 失败。需要干净 tsc 时再加 `ignoreDeprecations`。

### 12.8 `@noble/hashes` 的 exports 警告可以忽略

**现象：** `expo export` 时：

```text
Attempted to import ... @noble/hashes\crypto.js which is not listed in the "exports"
```

ethers 依赖链引起，Web 包仍然能打完。不必为了这条去改 `node_modules`。

### 12.9 本机 PowerShell 5.1 的小差异

**现象：** `New-Item -LiteralPath ...` 报 `NamedParameterNotFound`。

**原因：** 部分环境的 `New-Item` 只有 `-Path`。中文路径仍建议对 `Get-ChildItem` / `Get-Content` 用 `-LiteralPath`。

**处理：** 脚本里创建目录用 `New-Item -Path`，读文件用 .NET `ReadAllBytes` / `ReadAllText`，避免踩这个差异。

---

一句话对照：

| 坑 | 会在哪一步爆 | 脚本是否兜底 |
| --- | --- | --- |
| pager-view 无 Web | `build:web` | 否（要改代码，本仓库已改） |
| `Platform.OS === 'web'` | 运行时功能缺失 | 否（要改适配器，本仓库已改） |
| 配置文件被加密 | `cargo` / `tauri build` | 提示解密后重跑 |
| NSIS `win.bmp` 被加密 | 安装包，exe 往往已有 | 是，改 `SIDEBARIMAGE` 再 `makensis` |
| 32 位 BMP | 安装包警告 | 是，重生成 24 位图 |
| `CARGO_TARGET_DIR` 被改走 | 找不到产物 | 是，钉到 `src-tauri\target` 并回拷 |
