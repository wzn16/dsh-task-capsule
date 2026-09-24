# dsh-task-capsule

DSH 任务两件套：把「正在跑什么任务、跑完没有」钉在 Web UI 上。

- **任务胶囊**：会话 header 常驻运行任务胶囊，圆点颜色分态（运行中 / 等待确认 / 已结束 / 出错），点击跳转对应会话，多任务时下拉列表
- **任务通知卡**：任务完成 / 出错 / 等待用户确认时弹出页内通知卡，显式按钮跳转对应会话；支持提示音（WebAudio 合成，无音频文件）与系统通知（可选）

从 dsh-dock 最常用的功能提取精简而成；token 统计交给 DSH 自带会话统计条，不重复做。

## 安装

```sh
# 1. 克隆仓库到本地任意位置
git clone https://github.com/wzn16/dsh-task-capsule.git
cd dsh-task-capsule

# 2. 安装运行时依赖（仅 @deepseek-ai/schemastery 一个）
pnpm install

# 3. profile 依赖加入本地链接（路径换成你自己的克隆位置）
cd ~/Library/Application\ Support/dsh-desktop/harness/profiles/web
pnpm add "link:/path/to/dsh-task-capsule"

# 4. 重启 DSH Desktop（刷新浏览器不够）
```

## 配置

打开「系统通知」开关时会弹出系统授权弹窗（拒绝也不影响页内通知卡）。通知行为在插件设置区调整：

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| 完成通知 | 开 | 任务正常结束弹卡 |
| 出错通知 | 开 | 任务异常结束弹卡 |
| 等待确认通知 | 开 | 工具等待用户批准/确认时弹卡（approval/asked） |
| 停留时长 | 8000ms | 通知卡停留毫秒数，0 = 常驻直到手动关闭 |
| 系统通知 | 关 | 系统级通知（DSH Desktop 客户端内为 macOS 通知中心 / Windows Toast；浏览器打开时为浏览器通知） |
| 前台时也推系统通知 | 关 | 默认仅页面在后台时推送；开启后任务结束 / 等待确认时不分前后台都推 |
| 提示音 | 开 | WebAudio 合成音（chime / ding 两种音色） |

## 系统通知说明

- 设置区会显示当前系统通知授权状态（已授权 / 未请求 / 已被拒绝）；授权被拒时按提示前往 系统设置 → 通知 → DSH Desktop（Windows：设置 → 系统 → 通知）手动允许，改完如未生效重启 DSH。
- 权限状态行与测试按钮常显，无需先打开「系统通知」开关：未授权时点「请求授权并测试」会弹出系统授权弹窗，允许后自动发送测试通知；已授权时点「发测试通知」直接验证链路。
- macOS 的 tag 去重（同类通知合并）由 Electron 提供仅在 Windows / Linux 生效，macOS 上每条通知独立展示。

## 结构

- `index.js` — Host 半部入口：settings 注册、会话追踪实例、路由装配
- `src/host-core.js` — 常量、settings schema、HTTP 小工具
- `src/task-track.js` — 会话级任务追踪：阶段推导、等待确认（approvals）、会话标题与结束归档
- `features/runstate/` — 任务胶囊数据源（只读快照路由）
- `features/notify/` — 通知配置持久化 + 快照路由（页内卡片/提示音/系统通知在浏览器半部）
- `client.js` — Web 半部：胶囊渲染、通知卡、提示音、设置区

## License

MIT
