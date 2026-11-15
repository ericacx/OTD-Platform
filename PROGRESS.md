# OTD-Platform 项目进度

> 进度唯一口径。每完成一项就把状态改为 ✅ 并在「最近更新」里记一笔；发现新问题记到「待办」。
> 更新时间：2026-11-15 17:15

## 总览

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 产品设计 | 需求 / 业务设计 / 界面设计 / 技术方案 + 可点击原型 | ✅ |
| P1 基础设施 | monorepo、shared 约定、contracts 契约、db schema + 种子、core 横切（access / audit / numbering / events / files / scheduler / ai） | ✅ |
| P2 后端模块 | 26 个业务模块（planning → sync）全部实现 + 接口测试 | ✅ 385 条通过 |
| P3 前端页面 | 全部模块页面 + 路由 + i18n + MSW | ✅ 135 条通过 |
| P4 集成增强 | 悬浮助手、全局搜索、SSE 流式、通知铃铛、AI 用量 | ✅ |
| P5 收尾 | 订单三界面补齐、flow 四缺口、全量验收、迁移重建、推送 | ✅（仅剩推送，等远端地址） |

## 模块完成度

后端模块（apps/api/src/modules）与前端页面（apps/web/src/pages）对照：

| 模块 | 后端 | 前端 | 备注 |
| --- | --- | --- | --- |
| auth / iam | ✅ | ✅ | 快照 + 回退 + 权限即时生效 |
| planning（企划） | ✅ | ✅ | 导入 → 识别 → 确认 → 生成打样单 |
| sample（打样） | ✅ | ✅ | |
| testing（测试） | ✅ | ✅ | |
| quote（报价） | ✅ | ✅ | #11506 单价已对齐订单 1.86 |
| document（单据中心） | ✅ | ✅ | |
| order（订单） | ✅ | ✅ | 编辑 / PO 改版 / 手工新建三个界面已接线（order-form-dialog.tsx） |
| mainline（主线监控） | ✅ | ✅ | |
| todo（待办） | ✅ | ✅ | |
| packaging（包装） | ✅ | ✅ | |
| purchase（采购） | ✅ | ✅ | |
| capacity（产能） | ✅ | ✅ | |
| inspection（验货） | ✅ | ✅ | |
| shipment（出货） | ✅ | ✅ | |
| receivable（应收） | ✅ | ✅ | |
| sampleship（寄样） | ✅ | ✅ | |
| flow（流程配置） | ✅ | 🔄 | 四个缺口见下 |
| masterdata（主数据） | ✅ | ✅ | |
| factoryaudit（验厂） | ✅ | ✅ | |
| patrol（巡检） | ✅ | ✅ | |
| metrics（看板） | ✅ | ✅ | |
| sync（同步） | ✅ | ✅ | 连续失败自动停用 + 通知已完成 |
| assistant（AI 助手） | ✅ | ✅ | SSE 流式已完成 |
| notification（通知） | ✅ | ✅ | 铃铛 + 未读角标（core 横切，前端在顶栏） |

## 待办（P5 收尾）

| # | 事项 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 订单编辑 / PO 改版 / 手工新建三个界面 | ✅ | order-form-dialog.tsx 三对话框 + 列表/详情页接线 + MSW mock + 4 条新测试；编辑仅发差异字段，确认后关键字段锁定走改版 |
| 2 | flow：模块删除界面 | ✅ | 模块配置页删除按钮 + 二次确认 + FLOW_CATALOG_IN_USE 错误展示（rule-pack 同款模式） |
| 3 | flow：规则包改动可回退 | ✅ | 快照早已写入（update/remove 时 audit.snapshot）；补 GET snapshots / POST rollback 接口 + 版本记录 sheet + 回退测试 |
| 4 | flow：发布时校验必选模块 | ✅ | FORCED_NODES（N01/N02/N05/N06/N08/N10）+ FLOW_REQUIRED_MODULE_MISSING 422；前端发布按钮旁提示缺失模块并禁用 |
| 5 | 全量测试 + 迁移重建 | ✅ | 重建 0000_init（92 表）；shared 14 / db 4 / API 387 / Web 141 / e2e 1 全过 |
| 6 | 真实 PostgreSQL 验证 + e2e 冒烟 | ✅ | docker PG18(55432)：AUTO_MIGRATE+AUTO_SEED 启动、登录 / 订单 / 待办 / 权限 403 全部正确；Playwright 冒烟过（todo mock 问候语已改为跟随会话用户） |
| 7 | 浏览器走通订单主线 | ✅ | 王芳登录 → 待办 → PO0010459 详情 → 编辑（存备注）→ 例外确认 → 待排产 → 生产中 → PO 改版 Rev.2（交期 12-16→12-23，改版记录落库）→ 十节点监控实时反映 |
| 8 | 技术方案错误码表按代码重写 | ✅ | §6.6 按契约实际 123 个错误码重建（旧表含未实现码） |
| 9 | 推送远端仓库 | ⏸ | 本地 git 未配置 remote——需要仓库地址后 `git remote add origin … && git push -u origin main` |

全部工作已按 后端 / 前端 / 文档 分三个提交落在 main（eb8f448、0260a43、c283114 + docs 对齐提交）。

## 已知次要缺口（可延后）

- 订单英文界面未在浏览器实测；待办分组后端按 UTC 日计算（平台口径，前端已本地化）。
- 助手页面无悬浮按钮（整页不显示，符合设计）；拖拽排序仅用上下移按钮验证过。
- 款号下拉接口权限：预置角色已覆盖，自定义角色可能 403（企划代理建议放开，未做）。

## 最近更新

- 2026-11-15 18:05：P5 收尾完成——迁移重建（92 表）并真实 PG18 全链路验证；e2e 冒烟过（顺手修 todo mock 问候语写死王芳的问题）；浏览器走通订单主线（含新做的编辑 / 改版）；技术方案错误码表按 123 个实际码重建；全部提交 main。唯一遗留：远端仓库未配置，拿到地址后推送。
- 2026-11-15 17:45：C1 三缺口完成——①模块删除 UI（二次确认 + 占用错误显示）；②规则包快照回退（snapshots/rollback 接口 + 版本记录 sheet + 管理员回退测试）；③发布校验必选节点 FORCED_NODES（422 FLOW_REQUIRED_MODULE_MISSING + 前端提示并禁用发布）。API 387 / Web 141 全过，typecheck / lint 0 错。
- 2026-11-15 17:30：B3 收尾完成——订单编辑 / PO 改版 / 手工新建三个界面全部接线（order-form-dialog.tsx、order-form.types.ts、order-lines-editor 复用、MSW 三个新 handler、中英文案、4 条新测试）。Web 138 条全过，typecheck / lint 0 错。
- 2026-11-15 17:15：接手续建。修复 web typecheck 8 错（order.json 补 6 个 i18n key、sync mock 补 disabledReason/consecutiveFailures）。基线：API 385 / Web 135 测试全过，API + Web typecheck 0 错。
- 2026-11-15 15:12：C4 SSE 流式、C2 巡检看板页面、C3 同步自动停用、C1 flowVersionId 种子绑定已交付；B3 三界面进行中。
