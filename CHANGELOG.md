# Changelog

版本以 `package.json` 为准；破坏性变更留到 2.0（见 [ROADMAP](ROADMAP.md)）。

## 1.2.1

修一个只在中文界面下暴露的显示问题。

- 设置页左侧导航曾显示英文 `Task capsule`，应为「任务胶囊」。原因：插槽注册项的 `label` 由**注册方**本地化，注册那一刻取值后不再更新，而插件常比 `locale` 服务先挂载，注册时只能按英文兜底；语言服务到位后胶囊与设置正文都变中文，唯独这个 label 停在英文。
- 现在语言变化时按新语言重新注册三处插槽（胶囊 / 浮层 / 设置页），label 跟随 DSH 语言。

## 1.2.0

面向「装得上、看得见、升级不踩空」，功能行为与 1.1.0 一致。

### 插件面板展示

- `locale/zh.json`、`locale/en.json` 新增 `meta.title` / `meta.description` / `meta.detail`：插件列表不再回落到 `package.json` 的长描述。
- 新增根目录 `icon.svg`，并导出 `./icon`；`package.json` 的 `exports` 补上 `./locale/*.json`。
- 新增 `docs/DETAIL.md` 作为插件详情页正文（比 README 短），`files` 一并收录。

### 安装

- README 安装段改为「clone → 插件 → 添加插件」的面板路径，并明确：`pnpm add` 不会写 `dsh.profile.bundles`，面板安装才会自动登记。
- CLI 装法收进折叠块当兜底。

### 升级宿主时的不踩空

- 新增 `scripts/check-host-symbols.mjs`：直接读本机 `app.asar`，核对 7 个平台符号（1 个服务 / 3 个事件 / 3 个插槽）是否还在宿主里。宿主改了其中任何一个，插件表现都是「还在但胶囊静默消失」，日志不报错；这条命令 0.2 秒给出结论，缺失即 exit 1。
- 新增 `docs/COMPATIBILITY.md`：只记实测过的宿主版本、升级后自查的五条命令、依赖面。
- 自查清单从四条变五条，`check-host-symbols` 排第一。

### 仓库

- 新增 `ROADMAP.md`（1.2 / 1.3 / 2.0 与「不做」清单）、`docs/COMPATIBILITY.md`、`CHANGELOG.md`。
- 新增 `.github/ISSUE_TEMPLATE/bug.yml` 与 `PULL_REQUEST_TEMPLATE.md`。
- README 首屏补一段英文与一条 Roadmap / Compatibility 导航。
- `.gitignore` 忽略生成的 `docs/code-map/`。

## 1.1.0

- 界面支持 `zh` / `en`，跟随 DSH 客户端语言；`locale` 服务缺失或词条缺失时回落中文（社区 PR #3 @Domingos-Daniel）。

## 1.0.1

- 见 <https://github.com/wzn16/dsh-task-capsule/releases>

## 1.0.0

- 首个稳定版：任务胶囊、任务通知卡、账本面板与只读查询路由。
