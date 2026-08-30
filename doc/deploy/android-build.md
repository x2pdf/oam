# OAM Android 打包步骤

一套 TypeScript 业务代码，Android 端走 **Expo + React Native** 原生编译链路。

```
App.tsx / src/**（业务 UI）
    ├─ expo start + Expo Go     →  开发调试（不装 Android Studio 也能用）
    ├─ npx expo run:android     →  模拟器 / 真机（需 Android Studio + SDK）
    └─ ./gradlew assembleRelease →  .apk / .aab 发布包
```

**文档状态：基于项目实际配置编写。** 已有 `android/` 原生工程目录（prebuild 已执行过），不需要再 `npx expo prebuild`。

**本仓库对照**

| 项 | 值 |
| --- | --- |
| 产品名 | `OAM` |
| 全称 | `Onchain Attachment Message` |
| Application ID | `com.oam.app` |
| versionName | `26.1.1` |
| versionCode | `2601001`（编码规则：major×1000000 + minor×1000 + patch） |
| 最低 SDK | 由 Expo SDK 54 决定（通常 API 24 / Android 7.0） |
| 目标 SDK | 由 Expo SDK 54 决定（通常 API 35） |
| JS 引擎 | Hermes |
| 新架构 | 已启用（`newArchEnabled: true`） |
| Gradle 工程 | `android/` |
| 中国大陆镜像 | 已配置（阿里云 Maven 镜像） |

---

## 1. 技术栈（当前锁定）

| 组件 | 版本 / 说明 |
| --- | --- |
| Expo SDK | `54.0.37` |
| React | `19.1.0` |
| React Native | `0.81.5` |
| Node.js | **必须 ≥ 20.19.4** |
| Java / JDK | **JDK 17**（Android Gradle Plugin 8.x 要求） |
| Android Studio | 最新稳定版（推荐 Ladybug 或更新） |
| Android SDK | API 35（Android 15），Build Tools 由 Gradle 自动管理 |
| Gradle | 由 `gradle-wrapper.properties` 锁定版本 |
| Hermes | 已启用（`gradle.properties` 中 `hermesEnabled=true`） |

---

## 2. 环境准备

### 2.1 安装 Android Studio

从 [Android Studio 官网](https://developer.android.com/studio) 下载并安装。

安装后打开一次，完成 SDK 初始化。在 **SDK Manager** 中确认安装了：

- **SDK Platforms**：Android 15 (API 35)
- **SDK Tools**：
  - Android SDK Build-Tools
  - Android SDK Platform-Tools
  - Android SDK Command-line Tools (latest)

### 2.2 配置环境变量

在 `~/.zshrc`（或 `~/.bashrc`）中添加：

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$PATH"
```

macOS 上 Android Studio 默认的 SDK 路径是 `~/Library/Android/sdk`。Windows 上是 `%LOCALAPPDATA%\Android\Sdk`。

确认：

```bash
echo $ANDROID_HOME
adb --version
```

### 2.3 安装 JDK 17

Android Gradle Plugin 8.x 要求 JDK 17：

```bash
java -version
# 期望：openjdk version "17.x.x" 或更高
```

如果没有或版本不对：

```bash
# macOS（Homebrew）
brew install openjdk@17

# 添加到 PATH
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
```

也可以在 Android Studio 的 **Settings → Build → Gradle → Gradle JDK** 里选择或下载 JDK 17。

### 2.4 安装 Node.js

```bash
nvm install 20.19.4
nvm use 20.19.4
node -v    # >= v20.19.4
```

### 2.5 一次性自检

```bash
node -v              # >= v20.19.4
java -version        # JDK 17+
echo $ANDROID_HOME   # 有路径
adb --version        # 有版本号
```

---

## 3. 安装依赖

```bash
cd oam                       # 仓库根目录
nvm use 20.19.4              # 若用了 nvm
npm install
```

Android 不需要像 iOS 那样单独 `pod install`，Gradle 会在首次编译时自动下载依赖。

---

## 4. 开发调试

### 4.1 模拟器

```bash
# 终端 1：启动 Metro 打包器
npm start

# 终端 2：编译并运行到模拟器
npx expo run:android
```

或一步完成：

```bash
npm run android
```

如果没有运行中的模拟器，Expo 会尝试启动一个。也可以先在 Android Studio 的 **Device Manager** 中创建并启动 AVD（Android Virtual Device）。

### 4.2 真机调试

1. 手机开启 **开发者选项**：设置 → 关于手机 → 连续点击「版本号」7 次
2. 开启 **USB 调试**：开发者选项 → USB 调试
3. USB 连接电脑，手机弹出授权对话框时点击「允许」

```bash
# 确认设备已连接
adb devices
# 应该看到你的设备，状态为 device

# 编译并安装
npx expo run:android
```

### 4.3 Expo Go（不装 Android Studio 也能调试）

1. 手机安装 [Expo Go](https://expo.dev/go)（Google Play 或扫码下载 APK）
2. 电脑和手机同一 Wi-Fi
3. `npm start`，用 Expo Go 扫终端二维码

---

## 5. 打 Release 包

Android 发布包有两种格式：

- **APK**（`.apk`）：可直接安装到设备，适合分发和测试
- **AAB**（`.aab`）：Android App Bundle，上传 Google Play 的必要格式

### 5.1 生成签名密钥（仅首次）

发布 APK 需要签名密钥。使用 JDK 自带的 `keytool`：

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore oam-release.keystore \
  -alias oam-release-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass 你的密码 \
  -keypass 你的密码 \
  -dname "CN=OAM, OU=Dev, O=OAM, L=Beijing, ST=Beijing, C=CN"
```

**重要：** 把 `oam-release.keystore` 放在安全的地方，并备份。丢失密钥意味着无法更新已发布的应用。

将 keystore 文件复制到 `android/app/` 目录下。

### 5.2 配置签名信息

在 `android/` 目录下创建 `keystore.properties`（**不要提交到 git**）：

```properties
storeFile=oam-release.keystore
storePassword=你的密码
keyAlias=oam-release-key
keyPassword=你的密码
```

然后在 `android/app/build.gradle` 的 `android` 块中添加签名配置（如果还没有的话）：

```groovy
def keystorePropertiesFile = rootProject.file('keystore.properties')
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    // ...
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug
            // ...
        }
    }
}
```

当前仓库的 release 构建仍使用 debug 签名（`signingConfig signingConfigs.debug`），适合内部测试。正式上架前需替换为 release 签名。

### 5.3 打 Release APK

```bash
cd android
./gradlew assembleRelease
```

产物路径：`android/app/build/outputs/apk/release/app-release.apk`

如果只想打 APK 不打 AAB：

```bash
./gradlew assembleRelease
```

### 5.4 打 Release AAB（Google Play 上传用）

```bash
cd android
./gradlew bundleRelease
```

产物路径：`android/app/build/outputs/bundle/release/app-release.aab`

### 5.5 使用 Expo CLI 简化打包

```bash
# 编译 release APK
npx expo run:android --variant release
```

### 5.6 EAS Build（云端编译）

不需要本地 Android SDK，在 Expo 服务器上编译：

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android
```

---

## 6. 中国大陆网络优化

本仓库已经配置了阿里云 Maven 镜像，在 `android/build.gradle` 和 `android/settings.gradle` 中：

```groovy
maven { url 'https://maven.aliyun.com/repository/public' }
maven { url 'https://maven.aliyun.com/repository/google' }
maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
```

阿里云镜像排在 `google()` 和 `mavenCentral()` 前面，优先使用国内源。

另外 `android/init.china.gradle` 提供了额外的全局镜像覆盖，可在需要时通过 Gradle init script 加载：

```bash
cd android
./gradlew assembleRelease --init-script init.china.gradle
```

如果 Gradle Wrapper 下载慢，可以手动修改 `android/gradle/wrapper/gradle-wrapper.properties` 中的 `distributionUrl`，把 `services.gradle.org` 替换为国内镜像。

---

## 7. 工程结构（Android 相关）

```text
oam/
  app.json                              Android 配置（package、版本等）
  android/
    build.gradle                        根 Gradle（阿里云镜像、插件依赖）
    settings.gradle                     插件管理（阿里云镜像、autolinking）
    gradle.properties                   项目属性（架构、Hermes、新架构等）
    gradlew / gradlew.bat              Gradle Wrapper
    init.china.gradle                   中国大陆 Gradle init 脚本（额外镜像）
    app/
      build.gradle                      App 模块配置（签名、版本号、依赖）
      debug.keystore                    调试签名（已提交）
      proguard-rules.pro                ProGuard 混淆规则
      src/
        main/
          AndroidManifest.xml           应用清单
          java/                         原生代码
          res/                          资源文件
      build/                            编译产物（不提交）
    gradle/
      wrapper/
        gradle-wrapper.properties       Gradle 版本锁定
```

**本仓库对照**

| 文件 | 关键配置 |
| --- | --- |
| `app.json` | `android.package: "com.oam.app"` |
| `android/app/build.gradle` | `applicationId "com.oam.app"`，`versionCode 2601000`，`versionName "26.1.1"` |
| `android/gradle.properties` | `hermesEnabled=true`，`newArchEnabled=true`，`reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64` |
| `android/build.gradle` | 阿里云 Maven 镜像优先 |

---

## 8. versionCode 编码规则

Android 的 `versionCode` 是正整数，应用商店用它判断版本升级（必须严格递增）。本仓库采用：

```
versionCode = major × 1,000,000 + minor × 1,000 + patch
```

| versionName | versionCode | 计算 |
| --- | --- | --- |
| 26.1.1 | 2601000 | 26×1000000 + 1×1000 + 0 |
| 26.1.1 | 2601001 | 26×1000000 + 1×1000 + 1 |
| 26.2.0 | 2602000 | 26×1000000 + 2×1000 + 0 |
| 27.0.0 | 2700000 | 27×1000000 + 0×1000 + 0 |

修改版本时同步更新：

| 文件 | 字段 | 示例 |
| --- | --- | --- |
| `app.json` | `expo.version` | `"26.1.1"` |
| `package.json` | `version` | `"26.1.1"` |
| `android/app/build.gradle` | `versionName` | `"26.1.1"` |
| `android/app/build.gradle` | `versionCode` | `2601000` |

---

## 9. 常见问题

### 9.1 Gradle 下载超时

症状：`Could not download gradle-xxx.zip` 或下载非常慢。

处理：修改 `android/gradle/wrapper/gradle-wrapper.properties` 中的 `distributionUrl`，使用国内镜像：

```properties
# 原始
distributionUrl=https\://services.gradle.org/distributions/gradle-8.x-all.zip
# 腾讯镜像
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-8.x-all.zip
```

### 9.2 JDK 版本不对

症状：`Unsupported class file major version 65`（JDK 21 编的，Gradle 不支持）或 `JAVA_HOME is not set`。

处理：确保 `JAVA_HOME` 指向 JDK 17：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || echo "/opt/homebrew/opt/openjdk@17")
java -version
```

### 9.3 `adb: device not found`

症状：真机已连接但 `adb devices` 不显示。

处理：

1. 确认 USB 调试已开启
2. 手机上点击「允许 USB 调试」授权对话框
3. 换一根数据线（有些线只能充电不能传数据）
4. macOS 上可能需要安装 Android File Transfer

### 9.4 `Unable to merge dex` / 64K 方法数限制

症状：编译报 `DexArchiveMergerException` 或 `methods: 65536`。

处理：本仓库已启用 Hermes，通常不会碰到此问题。如果出现，在 `android/app/build.gradle` 的 `defaultConfig` 中加：

```groovy
multiDexEnabled true
```

### 9.5 编译内存不足

症状：`Java heap space` 或 `GC overhead limit exceeded`。

处理：`android/gradle.properties` 已配置 `-Xmx2048m`。如果仍然不够，增大 JVM 内存：

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
```

### 9.6 `react-native-gradle-plugin` 找不到

症状：`Cannot find module '@react-native/gradle-plugin'`

处理：

```bash
# 重新安装依赖
rm -rf node_modules
npm install

# 清理 Android 缓存
cd android
./gradlew clean
cd ..

# 重新编译
npx expo run:android
```

### 9.7 架构选择

`gradle.properties` 默认编译所有四种架构（`armeabi-v7a, arm64-v8a, x86, x86_64`），这会增大 APK 体积但保证兼容性。

如果只想打真机包（不需要模拟器），可以只编译 arm64：

```bash
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

这样 APK 体积会小很多。

### 9.8 Release 包安装后闪退

原因：当前 release 构建使用 debug 签名，或 ProGuard 混淆导致问题。

处理：

1. 确认签名配置正确（第 5.2 节）
2. 临时关闭混淆测试：在 `android/app/build.gradle` 中设 `minifyEnabled false`
3. 查看崩溃日志：`adb logcat | grep -i oam`

### 9.9 `@noble/hashes` 的 exports 警告可以忽略

Metro 打包时的 `@noble/hashes` 警告是 ethers.js 依赖链引起的，不影响编译和运行。

---

## 10. 建议验收顺序

1. 确认 JDK 17、Android SDK、Node.js 版本符合要求（第 2 节）
2. `npm install`
3. `npm run android`（模拟器或真机），确认 App 启动且主流程可用
4. `cd android && ./gradlew assembleRelease`，确认生成 release APK
5. 安装 APK 到真机测试：`adb install app/build/outputs/apk/release/app-release.apk`

第 3 步过了说明 Android 编译链路没问题。第 4 步过了说明可以打发布包。

---

## 11. 快速参考命令

```bash
# 安装依赖
npm install

# 开发
npm start                                  # 启动 Metro
npm run android                            # 编译到模拟器/真机
npx expo run:android                       # 同上

# 清理
cd android && ./gradlew clean              # 清理 Gradle 缓存
rm -rf node_modules && npm install         # 重装 npm 依赖

# Release 包
cd android
./gradlew assembleRelease                  # 打 Release APK
./gradlew bundleRelease                    # 打 Release AAB

# 安装到设备
adb install app/build/outputs/apk/release/app-release.apk

# 查看日志
adb logcat | grep -i react

# EAS Build（云端）
npx eas-cli build --platform android
```
