# 发送附带 ETH 转账

在发送 OAMP 消息时，允许同时附带非零 ETH 金额。解决用户想清空钱包余额却只能依赖外部钱包的痛点。

日期：2026-08-22

## 功能范围

- **可附带：** 仅支持 ETH（原生代币），不支持 ERC-20。
- **默认金额：** 0 ETH（行为与当前完全一致，向后兼容）。
- **安全门槛：** 金额输入框默认锁定，用户必须先通过支付密码验证才能解锁编辑。
- **最大值：** 余额减去预估 Gas 费后的可用金额，提供「MAX」快捷按钮。

当前 `OAMPClient` 构建的交易 `value` 始终为 0（未设置）。本功能为交易添加可选的 `value` 字段。

## 使用场景

用户准备弃用当前 OAM 钱包，但账户中仍有 ETH 余额。由于 OAM 目前只能发送 `value=0` 的 calldata 交易，用户必须借助 MetaMask 等外部钱包才能转出余额。本功能允许用户在 OAM 发送页直接将 ETH 转账到目标地址（可以是自己的外部钱包地址），附带消息的同时一并清空余额。

## 使用流程

```
发送页
    │
    ▼
金额输入框（锁定，显示 0 ETH）
    │
    ▼
用户点击「解锁金额」──► 弹出密码输入弹窗
    │                           │
    │                     密码错误 → Snackbar 提示
    │                     密码正确 ↓
    │
    ▼
金额输入框解锁，可编辑
    │
    ├── 手动输入金额
    ├── 点击「MAX」→ 自动填入 (余额 − 预估Gas)
    └── 不修改 → 保持 0 ETH（纯消息）
    │
    ▼
点击发送 → 确认弹窗显示转账金额 → 密码确认 → 广播交易
```

发送成功后，确认弹窗中的交易哈希同时包含了 calldata 和 ETH 转账。

## 数据模型

```ts
/** 扩展 BuiltTxRequest，增加可选 value */
interface BuiltTxRequest {
  to: string;
  data: string;
  mode: SendMode;
  value?: bigint;       // 单位 wei；未设置或 0n 表示纯消息
}
```

发送页新增本地状态：

```ts
const [ethAmount, setEthAmount] = useState('');       // 用户输入，单位 ETH（字符串）
const [amountUnlocked, setAmountUnlocked] = useState(false);
```

无需新增类型文件，无需新增路由。

## 状态与持久化

金额相关状态全部为 `SendDataScreen` 页面级 `useState`，不进入 `AppContext`。页面退出后自动清空。

草稿功能（若已实现）应将 `ethAmount` 和 `amountUnlocked` 一并保存/恢复。

## 涉及文件

| 文件 | 改动 |
| --- | --- |
| `src/oamp/client.ts` | `BuiltTxRequest` 增加可选 `value`；`sendBuilt` 传递 `value`；各 `build*Tx` 方法接受可选 `value` 参数 |
| `src/oamp/client.ts` | `estimateSendFeeFromAddress` 将 `value` 纳入余额充足性校验（余额 ≥ Gas + value） |
| `src/screens/SendDataScreen.tsx` | 新增金额输入区（锁定/解锁 + MAX）；发送成功后清除金额状态；确认弹窗展示转账金额 |
| `src/i18n/locales/zh.json` | 新增金额相关文案 |
| `src/i18n/locales/en.json` | 新增金额相关文案 |

不需要新建文件，不涉及导航变更，不引入新依赖。

## 界面说明

### 金额输入区

位置：收件地址区域之后、加密选项之前。

- 标题：`send.ethAmount`（附带 ETH 金额）
- 输入框：`TextInput`，`keyboardType="decimal-pad"`，默认显示 `0`，锁定态 `editable={false}` 且灰色背景
- 锁定图标：输入框右侧显示 `lock-outline` 图标按钮
- 点击锁定图标 → 弹出密码验证弹窗（复用现有 `passwordVisible` 逻辑的变体）
- 密码正确 → `amountUnlocked = true`，图标切换为 `lock-open-outline`，输入框变为可编辑
- MAX 按钮：输入框右侧或下方，`outlined` 紧凑样式，点击后自动填入 `(balance − estimatedGas)` 的 ETH 值

### 确认弹窗

在现有交易确认弹窗中新增一行：

| 行 | 标签 | 值 |
| --- | --- | --- |
| 转账金额 | `send.confirmAmount` | `0.05 ETH`（或 `—` 表示 0） |

当金额 > 0 时，该行以醒目颜色（如 `primary`）显示，提醒用户此交易包含 ETH 转账。

余额校验更新：`insufficientBalance` 判断改为 `balanceWei < parseEther(feeEth) + parseEther(ethAmount)`。

### 金额输入校验

| 条件 | 提示 |
| --- | --- |
| 非数字或为空 | 输入框 error 态，禁用发送 |
| 金额 > 可用余额 | `send.amountExceedsBalance`，红色提示 |
| 金额 ≤ 0（且非空） | `send.amountMustBePositive` |

## 文案键

| 键 | 中文 | English |
| --- | --- | --- |
| `send.ethAmount` | 附带 ETH 金额 | ETH Amount (optional) |
| `send.amountPlaceholder` | 0.00 | 0.00 |
| `send.amountLocked` | 点击解锁以编辑金额 | Tap to unlock amount editing |
| `send.amountUnlockTitle` | 验证密码以解锁金额 | Verify Password to Edit Amount |
| `send.amountMax` | MAX | MAX |
| `send.amountExceedsBalance` | 金额超出可用余额 | Amount exceeds available balance |
| `send.amountMustBePositive` | 金额必须大于 0 | Amount must be greater than 0 |
| `send.confirmAmount` | 转账金额 | Transfer Amount |
| `send.amountZeroHint` | 不附带 ETH（纯消息） | No ETH attached (message only) |

## OAMPClient 改动要点

### sendBuilt 传递 value

```ts
private async sendBuilt(built: BuiltTxRequest, nonce?: number): Promise<string> {
  const populated = await withRpcFallback(async (provider) => {
    const connected = this.wallet.connect(provider);
    return connected.populateTransaction({
      to: built.to,
      data: built.data,
      ...(built.value && built.value > 0n ? { value: built.value } : {}),
      ...(nonce !== undefined ? { nonce } : {}),
    });
  });
  const signed = await this.wallet.signTransaction(populated);
  return broadcastRawTx(signed);
}
```

### 余额校验

```ts
// estimateSendFeeFromAddress 返回值新增 valueEth
export interface FeeEstimate {
  feeEth: string;
  valueEth: string;
  built: BuiltTxRequest;
}
```

`SendDataScreen` 中判断：

```ts
const totalRequired = parseEther(feeEth) + parseEther(ethAmount || '0');
setInsufficientBalance(balanceWei < totalRequired);
```

## 注意事项

- 金额输入框必须默认锁定，防止用户误操作附带 ETH 转账。密码验证是必要的安全门槛。
- `value` 仅在 ETH 原生转账中有效，不涉及 ERC-20 `approve` / `transfer` 调用，保持实现简单。
- Gas 估算需要将 `value` 纳入 `estimateGas` 的 `TransactionRequest`，因为 value > 0 的交易所需 Gas 可能与纯 calldata 交易不同（EIP-2930 等因素）。
- MAX 金额计算需使用最新余额和最新 Gas 估算，点击时应触发一次费用刷新。
- 广播模式（黑洞地址）也可附带金额，但黑洞地址的 ETH 将无法取回；UI 上应给出明确警告。
- 发送成功后必须重置金额状态，避免用户下次发送时意外附带金额。
- 草稿保存/恢复时应包含 `ethAmount` 字段。
