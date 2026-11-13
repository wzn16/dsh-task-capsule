# 兼容性 / Compatibility

插件跟随宿主 API 走，每个 DSH 大版本都可能动到插槽、事件或 locale 服务。下表只记**实际跑过**的版本，没跑过的不写「应该可以」。

| DSH 版本 | 结果 | 怎么验的 |
| --- | --- | --- |
| 0.2.2-rc.2 | 可用 | `node scripts/check-host-symbols.mjs`：宿主里 7 个平台符号全命中；桌面 profile 实际加载，账本路由探活返回 `ok:true`；`smoke.mjs`、`unit.test.mjs` 15/15、`gen-locale --check` 全绿 |
| 0.2.x 早于 rc.2 | 未单独回归 | 未跑，不承诺 |
| 0.1.x | 未验证 | 旧 `locale` 服务缺失时按设计回落中文，但未实际回归 |
| 未来版本 | 跟随 | 破坏性变更见 [ROADMAP](../ROADMAP.md) 2.0 |

## 升级宿主后自查

升级宿主后按顺序跑：

```sh
node scripts/check-host-symbols.mjs          # 0) 先扫宿主：7 个服务/事件/插槽符号还在不在（缺失即退出 1）
node scripts/smoke.mjs                       # 模块装配 + 插槽符号是否还对得上
node --test scripts/unit.test.mjs            # 纯函数与降级路径
node scripts/gen-locale.mjs --check          # 词条是否与 client.js 同步
DSH_WEB_BASE=http://127.0.0.1:<port> bash scripts/security-regression.sh   # 路由信任门
```

第一条是升级当天最该跑的一条：宿主改掉任何一个服务名、事件名或插槽名，插件表现都是「还在，但胶囊静默消失」，日志不报错。它直接读本机 `app.asar`（macOS 默认路径，其它平台用 `--asar <路径>` 或 `--dir <源码目录>`），0.2 秒出结果。

五条全绿再报「可用」；有一条红就把版本写进本表并提 issue。

## 依赖面

- 运行时零依赖（`dependencies: {}`），不引入第三方包，宿主升级时不需要 `pnpm install`。
- 可选依赖 `locale` 服务：缺失时整块回落中文，不影响其它功能。
- 浏览器半部是手写 bundle、无构建链，宿主换前端框架时需要人工重写，不会静默失效。
