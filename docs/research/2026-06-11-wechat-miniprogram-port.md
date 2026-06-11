# 微信小程序版调研与决策（2026-06-11）

> Provenance：多 agent 调研 workflow（5 个维度 finder + 合规声明逐条对抗验证，15 agents / ~1.27M tokens），合规关键声明 **10/10 对官方现行文档实时核验 confirmed**，另加一个"朋友局免备案路径"专项 agent。通用版 playbook（与本项目无关、可跨项目复用）沉淀在 `~/.claude/references/wechat-miniprogram-friends-only.md` —— 政策细节、成员上限、来源列表以那份为准，本文只记 dahua-dice 专属的决策与架构映射。

## 决策

**做体验版路线的微信小程序版，新开 sibling repo `~/projects/side-projects/dahua-dice-wxapp/`。** 动机：微信社交闭环（好友/群内邀请进房）。约束：非商用、只给朋友玩。

核心机制一句话：**备案/审核/版号/认证全部只在"提审上架"时触发** —— 永远停留在体验版即全免（官方原话："未备案的小程序仅允许使用开发版和体验版"）。体验版无过期，无 2024-2026 收紧迹象。

- 人数上限（真约束）：个人主体 15 体验成员 + 15 项目成员 + 管理员 ≈ **31 人/appid**；个人可注册 5 个 appid。
- 要申请的东西只有一项：个人主体普通小程序（免费、当天，大陆身份证 + 实名微信）。类目选工具，**不要注册小游戏账号**。
- 后端免费：未发布的小程序享免费云开发环境（活动至 2026-12-31），发布后才转收费 —— 与"永不发布"正好咬合。

## 为什么公开上架对本游戏（个人主体）≈ 不可行

调研结论（全部 confirmed，细节与来源见通用 playbook）：

1. 游戏内容不能挂非游戏类目（"类目逃避"明文违规，提审必打回）→ 必须走小游戏。
2. 小游戏双轨：IAP 需版号（个人拿不到）；免费/IAA 免版号但需小游戏备案（省级出版前置审批，个人实测 30-40+ 工作日）+ ICP 备案。
3. 个人主体被明文排除在**牌类**类目外（另含角色类/文化互动）—— 大话骰极可能被归牌类。
4. **牌类专项规则与本游戏功能直接冲突**：禁私密房间口令、自定义头像昵称、胜者排行榜、带比分分享图 —— 房间码/AvatarPicker/战绩分享全踩线。
5. 现存大话骰小游戏（哈局大话骰）是企业主体；有个人主体牌类游戏被审核打回的实例。
6. 备选路径全部形式上违规：H5 游戏是外链规范 §2.5 明文禁止内容（小范围实际被容忍）；海外主体小程序无游戏类目；"骰子工具"伪装只能覆盖 solo 模式。

→ 想公开 = 企业主体或发行合作，超出本项目意愿。体验版路线完全绕开以上全部。

## 架构映射（web 版 → 小程序版）

| 层 | web 版（本 repo） | 小程序版（dahua-dice-wxapp） |
|---|---|---|
| 前端框架 | Next.js 16 + React 19 | Taro 4.x（**钉死 React 18**，react-reconciler 0.29；React 19 支持截至 2026-02 仍是 open issue）+ weapp-tailwindcss v4 |
| 样式 | Tailwind v4 + oklch tokens | WXSS 不支持 oklch/color-mix/@layer → postcss-preset-env 降级；keyframes/transform/opacity/CSS 变量都支持 |
| 骰子动画 | Dice2D（DOM/CSS） | 大体可活，div→View/Text 重表达 |
| 实时同步 | SSE（小程序无 EventSource） | 云数据库 `db.watch`（官方推荐回合制同步；MGOBE 已关停）。**无延迟 SLA、偶发掉监听 → 必须移植现有 3s 轮询兜底（双通道）** |
| 后端 | Vercel + Upstash（合法域名需备案 HTTPS，`*.vercel.app`/Upstash 调不到） | 云函数 + 云数据库（`wx.cloud` 绕过域名白名单） |
| 原子性 | Redis Lua version-CAS | 云函数内单文档事务（~30s 上限）+ 条件更新 CAS（`where({version}).update` 查 `stats.updated`）。多文档事务弱 → 状态收敛进单 room 文档 |
| 游戏引擎 | `lib/game-engine/`（纯 TS + 79 单测） | **原样复制进云函数** —— 零重写，最先抢救的资产 |
| 会话 | cookie session | `wx.login` → `code2Session` openid，静默匿名 |
| 邀请 | 链接分享 | `onShareAppMessage` 带房间码 path + **动态消息**（卡片实时显示"X/Y 人已加入"，为房间邀请量身定做）+ `shareTicket`/`getGroupEnterInfo` 群识别。体验成员间转发卡片有效 |
| 昵称头像 | 输入框 | 头像昵称填写能力（`getUserProfile` 已废） |
| 摇骰子 | DeviceMotion + iOS 权限弹窗 | `wx.onDeviceMotionChange`，无权限弹窗（更省事） |
| 音频 | Howler.js（跑不起来） | `wx.createWebAudioContext`（基础库 2.19.0+）精灵切片，或砍掉（web 版本来默认关） |
| i18n | next-intl zh/en | 朋友局 zh-CN only 即可 |

## 开工 checklist（动手时按序）

1. mp.weixin.qq.com 注册个人主体小程序（工具类目）→ 开通云开发免费环境 → 加体验成员
2. 新 repo `dahua-dice-wxapp`（pair 约定，与本 repo 平级）；复制 `lib/game-engine/`（types/validate/round + 单测）
3. 技术栈定版：Taro 4 + React 18 + weapp-tailwindcss v4；用本 repo 已装的 cloudbase skill（`.claude/skills/cloudbase`，16 份参考文档）
4. 最小闭环：创建房间（云函数）→ 分享卡片带房间码 → 第二人进房 → db.watch 同步一轮叫骰 → 开
5. 红线自查：游戏内零真钱/兑换元素（体验版也零容忍）；mp 后台隔几个月登录防闲置冻结

## Open questions（建库时核验）

- **免费云开发环境的并发 watch 连接上限**：免费环境=基础套餐额度（20 万次调用/月、500 QPS）下 watch 很宽裕，但 2026 资源点计费的"个人版 ¥19.9/月"被查到仅 10 条并发实时连接（每客户端 watch=1 条）—— 免费活动环境适用哪套限额未有定论，影响"纯 watch vs watch+轮询混合"的设计权重（反正轮询兜底都要做）
- Taro 4 对 React 19 的支持进展（若解锁可少降级一档）
- 体验版 `getunlimitedqrcode`（`env_version:"trial"`）生成的永久码在实际分享流里的体验

## 相关文档

- 通用 playbook：`~/.claude/references/wechat-miniprogram-friends-only.md`（成员上限官方表、备案/认证/版号机制、社交 API 清单、H5 备选、来源列表）
- 跨项目记忆：`~/.claude/projects/-Users-xingfanxia-projects/memory/reference_wechat_miniprogram_friends_only.md`
- 本 repo CLAUDE.md「微信小程序版」小节
