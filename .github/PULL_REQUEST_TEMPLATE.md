## 改了什么

<!-- 一句话说明；关联 issue 用 #编号 -->

## 为什么

<!-- 解决的是谁的问题：自己的、某条 issue、还是某条已知限制 -->

## 影响面

- [ ] 动了账本写入格式（`ledger.jsonl`）→ 需要同步 `docs/FIELDS.md` 与兼容承诺
- [ ] 动了只读路由 → 需要跑 `scripts/security-regression.sh`
- [ ] 动了 `locale/*.json` → 需要跑 `node scripts/gen-locale.mjs` 并提交生成的 `client.js`
- [ ] 动了界面 → 需要更新 `docs/screenshots/` 对应截图
- [ ] 都没有（纯内部重构）

## 提交前自查

```sh
node scripts/smoke.mjs
node --test scripts/unit.test.mjs
node scripts/gen-locale.mjs --check
```

- [ ] 三条全绿
- [ ] 没有新增运行时依赖（`dependencies` 保持为空）
- [ ] 破坏性变更没进 1.x（留给 2.0，见 ROADMAP）
- [ ] README / ROADMAP / FIELDS 里受影响的说法已同步

## 怎么验的

<!-- 手点过什么、哪个 DSH 版本、哪个 profile -->
