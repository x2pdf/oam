# OAM iOS 打包步骤

一套 TypeScript 业务代码，iOS 端走 **Expo + React Native** 原生编译链路（不是 Tauri / Web）。

```
App.tsx / src/**（业务 UI）
    ├─ expo start + Expo Go     →  开发调试（不装 Xcode 也能用）
    ├─ npx expo run:ios         →  模拟器 / 真机（需 Xcode）
    └─ xcodebuild archive       →  .ipa 归档（上架 TestFlight / App Store）
```

**文档状态：基于项目实际配置编写。** 已有 `ios/` 原生工程目录（prebuild 已执行过），不需要再 `npx expo prebuild`。

**本仓库对照**

| 项 | 值 |
| --- | --- |
| 产品名 | `OAM` |
| 全称 | `Onchain Attachment Message` |
| Bundle Identifier | `com.oam.app` |
| 版本 | `26.1.1` |
| 最低 iOS 部署版本 | `16.0` |
| JS 引擎 | Hermes |
| 新架构 | 已启用（`newArchEnabled: true`） |
| Xcode 工程 | `ios/OAM.xcodeproj` |
| Workspace | `ios/OAM.xcworkspace`（**必须用这个打开**） |

---

## 1. 技术栈（当前锁定）

| 组件 | 版本 / 说明 |
| --- | --- |
| Expo SDK | `54.0.37` |
| React | `19.1.0` |
| React Native | `0.81.5` |
| Node.js | **必须 ≥ 20.19.4** |
| Xcode | **16.0+**（建议最新稳定版） |
| CocoaPods | Homebrew 安装即可 |
| iOS 最低部署版本 | **16.0**（`react-native-nitro-modules` 的 CxxStdlib 要求） |
| JS 引擎 | Hermes（`Podfile.properties.json` 中 `expo.jsEngine: hermes`） |

---

## 2. 环境准备（仅 macOS，iOS 只能在 Mac 上编译）

### 2.1 安装 Xcode

从 App Store 安装完整 Xcode。安装后**打开一次**，让它完成附加组件安装并同意许可协议。

```bash
# 确认 Xcode 已安装
xcodebuild -version
# 期望：Xcode 16.x 或更高
```

如果 `xcode-select` 还指向 Command Line Tools，切换到完整 Xcode：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

### 2.2 安装 Xcode Command Line Tools

如果只装过 CLT 没装完整 Xcode，iOS 编译**必须装完整 Xcode**。CLT 不够。

```bash
xcode-select --install
xcode-select -p
# 期望：/Applications/Xcode.app/Contents/Developer
```

### 2.3 安装 Homebrew（如未安装）

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2.4 安装 CocoaPods

```bash
brew install cocoapods
pod --version
```

### 2.5 安装 Node.js

Expo SDK 54 要求 Node ≥ 20.19.4：

```bash
# 推荐用 nvm
nvm install 20.19.4
nvm use 20.19.4
node -v    # >= v20.19.4
node -p "process.arch"   # arm64（Apple Silicon）
```

### 2.6 安装 Ruby（如果需要更新 CocoaPods）

macOS 自带的 Ruby 版本可能太旧，CocoaPods 要求 Ruby ≥ 2.7：

```bash
ruby --version
# 如果太旧，用 brew：
brew install ruby
```

### 2.7 一次性自检

```bash
xcodebuild -version          # Xcode 16+
xcode-select -p              # /Applications/Xcode.app/...
node -v                      # >= v20.19.4
pod --version                # >= 1.14
ruby --version               # >= 2.7
```

---

## 3. 安装依赖

```bash
cd oam                       # 仓库根目录
nvm use 20.19.4              # 若用了 nvm
npm install
```

### 3.1 安装 iOS Pods

```bash
cd ios
pod install
cd ..
```

第一次 `pod install` 会拉取所有原生依赖（Hermes、React Native、Expo modules 等），可能需要 **5～10 分钟**。

如果 `pod install` 失败，常见原因和处理：

| 错误 | 处理 |
| --- | --- |
| `CocoaPods could not find compatible versions` | `pod repo update` 后重试 |
| `IPHONEOS_DEPLOYMENT_TARGET` 编译报错 | 见第 8.1 节 |
| 网络超时（中国大陆） | 配置 CocoaPods 镜像，见第 8.6 节 |

---

## 4. 开发调试

### 4.1 模拟器（最快验证）

```bash
# 终端 1：启动 Metro 打包器
npm start

# 终端 2：编译并运行到模拟器
npx expo run:ios
```

或一步完成（会自动启动 Metro）：

```bash
npm run ios
```

模拟器启动后，Metro 会自动连接。代码修改会热更新。

### 4.2 真机调试

```bash
# 终端 1：启动 Metro
npm start

# 终端 2：编译并安装到真机（USB 连接）
npx expo run:ios --device
```

**真机首次运行必须信任开发者证书：**

1. iPhone 进入 **设置 → 通用 → VPN 与设备管理**
2. 找到你的 Apple ID 对应的开发者描述文件
3. 点击 **信任**

**Metro 连接：** 真机和 Mac 必须在同一 Wi-Fi 网络下。如果 App 白屏报 `No script URL provided`：

1. 确认 Mac 上 `npm start` 正在运行
2. 摇一摇手机呼出开发者菜单
3. 选 **Change Bundler URL**，输入 Mac 的局域网 IP（如 `http://192.168.0.3:8081`）

建议优先用 `npx expo run:ios --device` 命令行安装，比 Xcode 直接 Run 更可靠。

### 4.3 Expo Go（不装 Xcode 也能调试）

如果只是想快速看效果，不需要完整 Xcode：

1. iPhone 安装 [Expo Go](https://expo.dev/go)
2. 电脑和手机同一 Wi-Fi
3. `npm start`，用 Expo Go 扫终端二维码

Expo Go 有限制：不支持自定义原生模块。本项目的 `expo-secure-store`、`expo-image-picker` 等在 Expo Go 中可用，但如果加了自定义原生代码，就必须 prebuild 后用 Xcode 编译。

---

## 5. 打 Release 包（.ipa）

iOS 发布包需要通过 Xcode 的 Archive 流程生成 `.ipa` 文件。有两种方式：

### 5.1 方式一：Xcode 图形界面（推荐）

1. 用 Xcode 打开 `ios/OAM.xcworkspace`（**不是** `.xcodeproj`）

2. 左上角选择目标设备为 **Any iOS Device (arm64)**

3. 菜单 **Product → Clean Build Folder**（⇧⌘K）

4. 菜单 **Product → Archive**

5. Archive 完成后自动打开 Organizer 窗口

6. 选择刚才的 Archive，点击 **Distribute App**

7. 选择分发方式：
   - **TestFlight Internal Only**：上传到 TestFlight，内部测试
   - **Ad Hoc**：生成 .ipa，可安装到已注册的设备
   - **App Store Connect**：上传到 App Store

8. 按向导完成签名和导出

### 5.2 方式二：命令行

```bash
# 1. 清理
cd ios
xcodebuild clean -workspace OAM.xcworkspace -scheme OAM -configuration Release

# 2. Archive
xcodebuild archive \
  -workspace OAM.xcworkspace \
  -scheme OAM \
  -configuration Release \
  -archivePath build/OAM.xcarchive

# 3. 导出 .ipa
xcodebuild -exportArchive \
  -archivePath build/OAM.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/ipa
```

其中 `ExportOptions.plist` 需要自己创建，示例（Ad Hoc 分发）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>ad-hoc</string>
    <key>teamID</key>
    <string>你的TeamID</string>
    <key>compileBitcode</key>
    <false/>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>thinning</key>
    <string>&lt;none&gt;</string>
</dict>
</plist>
```

把 `method` 改成 `app-store` 可用于 App Store 上传，改成 `development` 可用于开发分发。

### 5.3 方式三：EAS Build（Expo 云端编译）

不需要本地 Xcode，在 Expo 服务器上编译：

```bash
# 安装 EAS CLI
npm install -g eas-cli

# 登录
eas login

# 配置构建
eas build:configure

# 构建 iOS
eas build --platform ios
```

EAS Build 会生成 `.ipa` 并上传到 Expo 服务器，可在网页上下载。免费账户有每月构建次数限制。

---

## 6. 签名与证书

### 6.1 开发签名（免费 Apple ID）

Xcode 可以用个人 Apple ID 免费签名，但有以下限制：
- 应用 7 天后过期
- 最多注册 3 台设备
- 不能分发给其他人

在 Xcode 中：**Settings → Accounts → 添加 Apple ID**，然后在项目的 **Signing & Capabilities** 里选择你的 Team。

### 6.2 分发签名（Apple Developer Program）

上架 App Store 或使用 TestFlight 需要 Apple Developer Program 会员（$99/年）。

需要的证书和配置：
1. **Distribution Certificate**（发布证书）
2. **Provisioning Profile**（描述文件，绑定 App ID + 证书 + 设备）
3. **App ID**（`com.oam.app`，已在 `app.json` 中配置）

管理入口：[Apple Developer](https://developer.apple.com/account/) → Certificates, Identifiers & Profiles

### 6.3 自动签名 vs 手动签名

- **自动签名（Automatically manage signing）**：Xcode 自动创建和下载证书/描述文件，适合开发阶段
- **手动签名**：自己管理证书和描述文件，适合 CI/CD 和正式发布

---

## 7. 工程结构（iOS 相关）

```text
oam/
  app.json                          iOS 配置（bundleIdentifier、版本等）
  ios/
    OAM.xcworkspace                 ← 用 Xcode 打开这个
    OAM.xcodeproj                   Xcode 工程文件
    OAM/
      Info.plist                    应用元信息（权限描述、版本号等）
      OAM.entitlements              权限声明
      OAM-Bridging-Header.h         Swift/ObjC 桥接
      PrivacyInfo.xcprivacy         隐私清单
    Podfile                         CocoaPods 依赖声明
    Podfile.properties.json         Pod 属性（JS 引擎、新架构等）
    Podfile.lock                    锁定 Pod 版本
    .xcode.env                      Xcode 环境变量
    .xcode.env.local                本地环境变量（不提交）
    Pods/                           CocoaPods 安装的依赖（不提交）
    build/                          编译产物（不提交）
```

**本仓库对照**

| 文件 | 关键配置 |
| --- | --- |
| `app.json` | `ios.bundleIdentifier: "com.oam.app"` |
| `ios/OAM/Info.plist` | 版本号 `26.1.1`，最低系统 `12.0`（实际部署目标由 Podfile 控制为 `16.0`） |
| `ios/Podfile` | `platform :ios, '16.0'`，`post_install` 强制所有 Pod 使用 iOS 16.0 |
| `ios/Podfile.properties.json` | `expo.jsEngine: hermes`，`newArchEnabled: true` |

---

## 8. 常见问题

### 8.1 `IPHONEOS_DEPLOYMENT_TARGET` 编译报错

症状：`compiling for iOS 15.1, but module 'CxxStdlib' has a minimum deployment target of iOS 16.0`

原因：`react-native-nitro-modules` 的 podspec 声明最低 iOS 15.1，但其依赖 CxxStdlib 要求 iOS 16.0+。Podfile 虽然声明了 `platform :ios, '16.0'`，但 `react_native_post_install` 钩子可能不会覆盖所有 Pod 的部署目标。

处理：本仓库 `Podfile` 的 `post_install` 已加上了强制覆盖。如果你重新 prebuild 了，需要确认这段代码还在：

```ruby
post_install do |installer|
  # ...
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
    end
  end
end
```

然后重新：

```bash
cd ios
pod install
```

### 8.2 No script URL provided（白屏）

症状：App 启动后白屏，日志报 `No script URL provided` 或 `unsanitizedScriptURLString = (null)`。

原因：Metro 打包器未运行，或设备无法连接到 Metro。

处理：

```bash
# 终端 1：先启动 Metro
npm start

# 终端 2：再运行 iOS
npx expo run:ios --device
```

如果真机仍白屏，摇一摇手机 → Change Bundler URL → 输入 Mac 的局域网 IP。

清缓存重试：

```bash
npx expo start -c          # 清除 Metro 缓存
cd ios && pod install      # 重新安装 Pod
cd .. && npx expo run:ios  # 重新编译
```

### 8.3 代码签名信任问题

症状：`Unable to launch com.oam.app because it has an invalid code signature`

处理：iPhone **设置 → 通用 → VPN 与设备管理** → 信任开发者描述文件。

### 8.4 `pod install` 失败：版本冲突

症状：`CocoaPods could not find compatible versions for pod "xxx"`

处理：

```bash
cd ios
pod repo update
pod install
```

如果仍然失败，删除 Podfile.lock 重来：

```bash
rm Podfile.lock
rm -rf Pods
pod install
```

### 8.5 Xcode 打开 .xcodeproj 而不是 .xcworkspace

症状：编译报找不到模块、链接错误。

处理：始终打开 **`ios/OAM.xcworkspace`**，不要用 `.xcodeproj`。Workspace 包含了 CocoaPods 的依赖配置。

### 8.6 中国大陆网络问题

`pod install` 下载 Pod 时可能超时。可以配置 CocoaPods 使用镜像：

```bash
# 临时使用清华镜像
export COCOAPODS_CDN_URL=https://mirrors.tuna.tsinghua.edu.cn/git/CocoaPods/Specs.git

# 或者修改 Podfile，在顶部加：
# source 'https://mirrors.tuna.tsinghua.edu.cn/git/CocoaPods/Specs.git'
```

### 8.7 Swift 版本不兼容

症状：`ExpoModulesJSI xcframework` 构建失败，或 Swift 6 相关编译错误。

原因：Xcode 版本太新，和当前 Expo SDK 不兼容。

处理：

1. 检查 Xcode 版本是否和 Expo SDK 54 兼容（建议 Xcode 16.0～16.2）
2. 如果 Xcode 太新，可以在 Xcode → Settings → Build Settings 中把 **Swift Language Version** 降为 5

### 8.8 Archive 时 Hermes 报错

确认 `Podfile.properties.json` 中 `expo.jsEngine` 为 `hermes`：

```json
{
  "expo.jsEngine": "hermes"
}
```

如果之前用过 JSC，切换后需要：

```bash
cd ios
rm -rf Pods Podfile.lock
pod install
```

---

## 9. 版本号管理

修改版本时需要同步更新以下位置：

| 文件 | 字段 | 示例 |
| --- | --- | --- |
| `app.json` | `expo.version` | `"26.1.1"` |
| `package.json` | `version` | `"26.1.1"` |
| `ios/OAM/Info.plist` | `CFBundleShortVersionString` | `26.1.1` |
| `ios/OAM/Info.plist` | `CFBundleVersion` | `1`（构建号，每次提审递增） |

`CFBundleVersion` 是构建号（正整数），每次提交 App Store 时需要递增。`CFBundleShortVersionString` 是用户可见的版本号。

---

## 10. 建议验收顺序

1. 确认 Xcode、CocoaPods、Node.js 版本符合要求（第 2 节）
2. `npm install`
3. `cd ios && pod install`
4. `npm run ios`（模拟器），确认 App 启动且主流程可用
5. （可选）`npx expo run:ios --device`（真机），确认真机签名和 Metro 连接正常
6. Xcode 打开 `ios/OAM.xcworkspace` → Product → Archive，确认能生成 .ipa

第 4 步过了说明 iOS 编译链路没问题。第 6 步过了说明可以打发布包。

---

## 11. 快速参考命令

```bash
# 安装依赖
npm install
cd ios && pod install && cd ..

# 开发
npm start                              # 启动 Metro
npm run ios                            # 编译到模拟器
npx expo run:ios --device              # 编译到真机

# 清缓存
npx expo start -c                      # 清 Metro 缓存
cd ios && rm -rf Pods Podfile.lock && pod install   # 重装 Pod

# Release 包
cd ios
xcodebuild archive -workspace OAM.xcworkspace -scheme OAM -configuration Release -archivePath build/OAM.xcarchive
xcodebuild -exportArchive -archivePath build/OAM.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/ipa

# EAS Build（云端）
npx eas-cli build --platform ios
```
