# 回滚手册

> 适用 v0.3.2 起的所有版本。原则：**插件可以退回，账本数据不要删**。

## 一、按版本回滚

```sh
cd ~/工作/code/dsh-task-capsule
git fetch --tags
git checkout v0.8.1      # 换成目标版本 tag
# profile 用的是 link: 安装，无需重新 add；重启 DSH Desktop 生效
```

回滚后确认三件事：

1. 会话 header 出现胶囊（说明 Host 半部加载成功）
2. 设置页「任务胶囊」分区可打开
3. 终端/应用日志没有 `[dsh-task-capsule]` 开头的 error

## 二、账本数据

- 账本目录 `~/.dsh/dsh-task-capsule/` 的格式在 v0.4.0 之后是 `schemaVersion: 1`，**1.x 内不会变化**，回滚不需要处理。
- 从更新版本回滚到旧版本时，旧版本若读到 `schemaVersion > 1` 会进入**只读降级**：保留数据、不写坏、只提示。此时升级回新版本即可恢复写入。
- 想让账本回到空白：删掉整个 `~/.dsh/dsh-task-capsule/` 目录，重启。**这一步不可恢复**，先备份。

## 三、配置

- 通知配置在 `~/.dsh/dsh-task-capsule.notify.json`；删掉即回默认值。
- v0.5 之前配置读 `settings` 命名空间，v0.5 起只认自有 JSON；回滚到 v0.4 及更早时，旧版本仍能读 settings 旧值。

## 四、出问题时的取证顺序

```sh
# 1. 模块能否装配（最常见的事故：共享模块误删导出 → 插件整个消失）
node scripts/smoke.mjs

# 2. 纯函数与降级路径是否正常
node --test scripts/unit.test.mjs

# 3. 路由信任门是否还在守
DSH_WEB_BASE=http://127.0.0.1:<端口> bash scripts/security-regression.sh
```

三条全绿说明插件自身没问题，再查宿主版本（`~/Library/Logs/DSH Desktop/harness.log`）或 `docs/FIELDS.md` 里的兼容表。

## 五、紧急停用

在 profile 的 `package.json` 里把 `dsh.profile.bundles` 中的 `dsh-task-capsule` 移出，重启 DSH。插件不加载即完全静默，账本文件保留在原地。
