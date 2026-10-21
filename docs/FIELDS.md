# 账本字段字典（schemaVersion 1）

> 本文件是 v1.0.0 冻结基线。改动规则：**只允许追加字段**；删除或改语义必须升 `schemaVersion`，
> 并同步 `src/ledger.js` 的 `SCHEMA_VERSION` 与本文档。

## 存储位置

```
${DSH_HOME:-~/.dsh}/dsh-task-capsule/
  ledger.jsonl        已收尾记录，一行一条，追加写
  ledger.1.jsonl      轮转到上一代（>2MB 时发生，只留一代）
  ledger.jsonl.bak-tokens   一次性清洗 token 字段前的备份
  open.json           运行中任务快照（5 秒节流），崩溃后据此补 interrupted
  meta.json           已读位与计数
  notify.json         通知配置
```

## 记录字段

| 字段 | 类型 | 含义 | 约束 |
| --- | --- | --- | --- |
| `schemaVersion` | int | 记录格式版本 | 当前固定 `1` |
| `seq` | int | 写入序号，单调递增 | 排序、去重用 |
| `recordId` | string | 主键 `${sessionId}:${endTime}` | 全流程唯一 |
| `sessionId` | string | 会话 id | 跳转会话用 |
| `title` | string | 会话标题（原生标题，取不到回退首条用户输入） | ≤60 字符 |
| `startTime` | epoch ms | 开始时刻 | — |
| `endTime` | epoch ms | 结束时刻 | 崩溃恢复时取最后活动时间，不伪造 |
| `duration` | int | 毫秒 | 结束 − 开始，钳 0 |
| `endReason` | enum | `completed` / `error` / `aborted` / `blocked` / `max-tokens` / `interrupted` / `disposed` / `unknown` | **只有 `completed` 算成功** |
| `errorMessage` | string | 出错信息 | ≤200 字符 |
| `steps` | int | 步数 | — |
| `turns` | int | 回合数 | — |
| `toolCalls` | int | 工具调用次数 | — |
| `models` | string[] | 用到的模型 | 去重，≤5 |
| `provider` | string | 供应商 | ≤40 字符 |
| `approvals` | object[] | 已决审批：`{id, toolName, askedAt, decidedAt, waitMs}` | ≤20 条 |
| `approvalCount` | int | 审批次数 | — |
| `approvalWaitMs` | int | 审批等待总毫秒 | 只计已决 |
| `recovered` | bool | 崩溃恢复补出来的记录 | 仅恢复时出现 |
| `createdAt` | epoch ms | 落盘时刻 | — |

**不存的字段**：`token`/`费用`、助手回复正文、`firstPrompt` 原文（只在标题里保留 ≤60 字）。

## 汇总字段（`summary`）

`count`、`durationMs`、`steps`、`toolCalls`、`approvalWaitMs`、`failures`（仅真报错）、`interrupted`（含重启恢复与主动关闭）、`recovered`、`slowest`。

## 兼容与降级

| 读到的情况 | 行为 |
| --- | --- |
| `schemaVersion` = 1 | 正常读写 |
| 缺 `schemaVersion` | 按 1 处理 |
| `schemaVersion` > 1 | **只读降级**：记录保留、不重写、不追加落盘（新记录只留内存），`stats.readOnly=true` |
| 单行坏 JSON | 跳过并计入 `parseErrors`，不影响其余行 |
| 整个文件不可读 | 不静默清空，按空账本起步 |

## 只读查询接口

```
POST /dsh-task-capsule/ledger/query   {since, until, limit, offset} → {total, records, summary}
POST /dsh-task-capsule/ledger/export  {since, until}               → {count, records}
```

只接受本机回环 + 同源请求；只读，无副作用。第三方插件可依赖这两个接口与上面的字段字典。
