# 在线麻将开发计划

## 1. 开发阶段概览

当前开发计划分为六个阶段（含初始化）：

0. 项目初始化：monorepo 脚手架、共享类型、工具链配置。（已完成）
1. 完成麻将核心玩法算法和电脑玩家算法验证。
2. 完成服务端基础搭建 + 账号管理模块 + 数据库准备。
3. 完成登录前端页面 + 管理员页面。
4. 完成麻将游戏前端显示画面。
5. 合并麻将游戏核心业务算法，形成完整闭环。

当前状态：

- 阶段 0 已于 2026-05-30 完成。
- 当前优先级处于阶段 1：核心玩法算法与电脑玩家算法验证。
- 阶段 1 已完成核心规则基础能力：牌定义、牌墙、发牌、摸打、弃牌响应窗口、吃碰杠、基础胡牌判定、basicBot 自摸/流局模拟。
- 阶段 0 已建立 pnpm workspace、TypeScript、ESLint、Prettier、Vitest、Prisma、React/Vite、Fastify 基础骨架。

## 2. 关键决策记录

以下技术决策在阶段 0 确定，各阶段遵循执行：

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 测试框架 | **Vitest** | 与 Vite 生态一致，原生 TypeScript 支持，执行速度快 |
| CSS 方案 | **CSS Modules** | 避免类名冲突，TypeScript 类型提示，适合组件化开发 |
| 日志库 | **pino** | Node.js 最快日志库，结构化 JSON 输出，适合调试和后续日志分析 |
| 密码哈希 | **bcrypt** | 成熟的密码哈希库，防止彩虹表攻击 |
| HTTP 客户端（测试） | **supertest** | Fastify 集成测试标准工具 |
| Monorepo | **pnpm workspaces** | 原生支持，无需额外依赖，适合当前规模 |

## 3. 阶段 0：项目初始化

### 3.1 阶段目标

搭建 monorepo 项目骨架，配置开发工具链，创建共享类型包，为后续所有阶段提供统一基础设施。

阶段状态：已完成。

### 3.2 功能点

- 初始化 pnpm workspace（`pnpm-workspace.yaml`）。
- 创建根目录 `package.json`，定义公共脚本。
- 配置 TypeScript（`tsconfig.base.json` + 各包继承）。
- 配置 ESLint + Prettier。
- 创建 `packages/shared`，定义初始类型骨架。
- 创建 `packages/mahjong-core` 空包，配置 Vitest。
- 创建 `apps/server` 空包，引入 Fastify + pino + Prisma。
- 创建 `apps/web` 空包，引入 React + Vite + CSS Modules + Zustand + Socket.IO Client。
- 配置 `prisma/schema.prisma` 初始模型（仅 User 表）。
- 配置 `.gitignore`、`.editorconfig`。
- 验证 `pnpm install`、`pnpm typecheck`、`pnpm lint` 可运行。

### 3.3 输出物

- 完整 monorepo 项目结构。
- 可运行的 `pnpm install`。
- 可运行的 `pnpm typecheck`。
- 可运行的 `pnpm lint`。
- `packages/shared` 骨架（authTypes.ts、userTypes.ts、socketEvents.ts、gameTypes.ts 占位）。
- `prisma/schema.prisma`（User 表定义）。

### 3.4 验收标准

- 所有包可通过 `pnpm typecheck` 类型检查。
- 所有包可通过 `pnpm lint` 代码规范检查。
- `prisma generate` 可生成 Prisma Client。
- shared 包可被 mahjong-core、server、web 引用。

### 3.5 完成记录

完成日期：2026-05-30

已完成输出：

- 根目录 pnpm workspace、`package.json`、`pnpm-workspace.yaml`。
- TypeScript 根配置和各包 `tsconfig.json`。
- ESLint、Prettier、EditorConfig、`.gitignore`。
- `packages/shared` 初始类型骨架：auth、user、socket、game 类型。
- `packages/mahjong-core` 初始包、`RuleConfig` 占位和 Vitest 测试。
- `apps/server` Fastify 最小服务、CORS 配置、`GET /health` 和测试。
- `apps/web` React + Vite 最小页面、CSS Modules 配置。
- `prisma/schema.prisma` 初始 User 表。
- `.env.example` 基础环境变量示例。
- `pnpm-lock.yaml` 锁定依赖版本。

已验证命令：

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm prisma:generate
pnpm -F mahjong-core test
```

开发服务冒烟验证：

- `pnpm dev` 可同时启动 web 和 server。
- `GET http://127.0.0.1:3000/health` 返回 `{"status":"ok"}`。
- `http://127.0.0.1:5173` 返回前端 Vite 页面。

---

## 4. 第一阶段：核心玩法算法与电脑玩家算法验证

### 4.1 阶段目标

完成麻将核心规则的算法验证，并验证电脑玩家可以按照规则参与对局。

本阶段不要求完成正式前端页面，也不要求接入服务器业务流程。重点是把麻将规则和电脑玩家算法做成可测试、可复用的核心模块。

### 4.2 功能点

- 定义麻将牌的数据结构（万/筒/条/风/箭，共 34 种 × 4 张 = 136 张）。
- 定义玩家、牌墙、手牌、弃牌区、公开组合等数据结构。
- 实现洗牌（Fisher-Yates）。
- 实现发牌（每人 13 张，庄家 14 张）。
- 实现摸牌。
- 实现打牌。
- 实现吃。
- 实现碰。
- 实现杠（明杠、暗杠、加杠）。
- 实现胡（基本胡牌判定：4 组面子 + 1 对雀头）。
- 实现过。
- 实现回合流转。
- 实现基础胜负判断。
- 实现基础结算。
- 实现 `RuleConfig` 配置接口，当前仅实现标准麻将配置。
- 实现电脑玩家合法动作选择。
- 实现电脑玩家出牌策略（优先打孤张、无组合价值的牌）。
- 实现 Vitest 单元测试覆盖所有公开 API。
- 实现 4 个 basicBot 自动模拟完整牌局测试。

### 4.3 规则要求

- 初期采用标准麻将规则，最小可用集：
  - **牌种**：万（1-9）、筒（1-9）、条（1-9）、风（东南西北）、箭（中发白），各 4 张。
  - **胡牌条件**：4 组面子（顺子或刻子）+ 1 对雀头，共 14 张。
  - **基本番型**（初期实现）：平和、立直（门前清）、断幺九、混一色、清一色、对对胡、七对子、混老头。
  - **计分**：初期采用简单计分（底分 + 番数 × 番分值），不实现复杂符数计算。
- 代码结构需要支持后续扩展地方规则。
- 后续需要支持四川麻将。
- 后续需要支持禁用"吃"等规则配置。

### 4.4 输出物

- 麻将核心算法模块（`packages/mahjong-core` 完整实现）。
- 电脑玩家算法模块（`packages/mahjong-core/src/bots/basicBot.ts`）。
- Vitest 单元测试覆盖。
- 4 bot 自动模拟牌局测试。
- 规则扩展设计文档（以 RuleConfig 接口 + 注释形式体现在代码中）。

### 4.5 验收标准

- 能通过 Vitest 测试脚本完成一局模拟对局。
- 电脑玩家能执行合法动作。
- 非法动作会被核心算法拒绝（reducer 返回错误）。
- 标准麻将基础流程可跑通（从发牌到胡牌/流局）。
- 规则模块没有和页面、数据库、服务器强绑定。
- `pnpm -F mahjong-core test` 全部通过。

### 4.7 当前完成记录

完成日期：2026-05-30

已完成输出：

- `packages/mahjong-core` 标准麻将 `RuleConfig`。
- 34 种麻将牌定义与 136 张牌墙生成。
- Fisher-Yates 洗牌与可复现种子随机数。
- 初始牌局发牌：庄家 14 张，其余玩家 13 张。
- 当前回合玩家合法动作查询。
- 当前回合摸打 reducer，非法出牌返回错误。
- 基础胡牌判定：标准 4 组面子 + 1 对雀头、七对子。
- 玩家视图过滤：仅暴露当前玩家手牌和其他玩家手牌数量。
- `basicBot` 合法动作选择与孤张优先弃牌策略。
- 4 bot 自动模拟对局，可运行 10 局并以胡牌或流局结束。
- 弃牌响应窗口：弃牌后按下家、对家、上家顺序响应。
- 吃：仅下家可吃顺子。
- 碰：任意响应玩家可碰同牌。
- 明杠：任意响应玩家可杠同牌，并补摸一张牌。
- 过：所有响应玩家都过后，下家摸牌继续。

已验证命令：

```bash
pnpm -F mahjong-core typecheck
pnpm -F mahjong-core test
pnpm typecheck
pnpm lint
pnpm test
```

仍需继续实现：

- 响应优先级完善：多人同时胡/碰/杠时的正式优先级和并发选择窗口。
- 暗杠、加杠及杠后补牌的完整细节。
- 基础番型识别：平和、立直、断幺九、混一色、清一色、对对胡、混老头。
- 简化计分函数。
- 更完整的 reducer 行为测试和 bot 长局统计。

### 4.6 测试策略

| 测试类型 | 工具 | 覆盖范围 |
|----------|------|----------|
| 单元测试 | Vitest | 每种牌型判定、每个动作合法性校验、RuleConfig 行为 |
| 模拟对局 | Vitest | 4 个 basicBot 自动对局 ≥ 10 局，统计胡牌率、流局率、无死锁 |

---

## 5. 第二阶段：服务端基础 + 账号管理模块

> 此阶段合并了原"第二阶段（空壳服务器）"和"第三阶段（账号管理）"。
> 原第二阶段只搭一个返回 OK 的最小 Web 服务，价值有限且与第三阶段同属服务端工作。合并后可一次性完成 Fastify 骨架、Prisma 接入、User 表和登录 API，减少重复搭建。

### 5.1 阶段目标

完成服务端应用搭建，包括 Fastify HTTP 服务、SQLite 数据库初始化、User 表实现、管理员和玩家账号管理 API，并确保可在 Ubuntu 虚拟机中部署验证。

### 5.2 功能点

- 初始化 Fastify 应用，配置 pino 日志。
- 配置 Prisma + SQLite，运行数据库迁移。
- 创建管理员账号（通过 seed 脚本或初始化命令）。
- 实现管理员登录 API。
- 实现管理员创建玩家账号 API。
- 实现管理员删除玩家账号 API。
- 实现玩家列表查询 API。
- 实现密码 bcrypt 哈希存储和验证。
- 实现基础 JWT 或 session 登录态管理。
- 配置 CORS。
- 在 Ubuntu 虚拟机中部署并验证浏览器可访问。
- 提供健康检查端点 `GET /health`。

### 5.3 数据表

`User` 表（Prisma schema）：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (auto) | 主键 |
| username | String (unique) | 用户名 |
| passwordHash | String | bcrypt 哈希 |
| role | String | "admin" 或 "player" |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### 5.4 输出物

- `apps/server` 完整服务端骨架。
- Prisma schema + 数据库迁移文件。
- 管理员 seed 脚本。
- 账号管理 REST API（admin 创建/删除/列表、auth 登录/登出/获取当前用户）。
- Ubuntu 虚拟机部署说明。
- 集成测试（Vitest + supertest）。

### 5.5 验收标准

- 服务端 `pnpm -F server dev` 可启动。
- `GET /health` 返回 200。
- 数据库可保存和查询玩家信息。
- 管理员 seed 脚本可创建初始管理员账号。
- 管理员可创建和删除玩家账号。
- 管理员和玩家可登录并获取不同身份的 token。
- 玩家不能自行注册账号（无注册 API）。
- 未登录请求受保护 API 返回 401。
- Ubuntu 虚拟机中服务可启动，宿主机浏览器可访问健康检查页面。

### 5.6 测试策略

| 测试类型 | 工具 | 覆盖范围 |
|----------|------|----------|
| 单元测试 | Vitest | password 哈希/验证、authService 逻辑 |
| 集成测试 | Vitest + supertest | 全部 HTTP API 端点、登录态、权限校验 |

---

## 6. 第三阶段：登录前端页面 + 管理员页面

### 6.1 阶段目标

完成登录页面和管理员玩家管理页面，确保玩家和管理员都可以登录系统并进入对应功能页面。

### 6.2 功能点

- 搭建 React + Vite 前端骨架（在阶段 0 已初始化）。
- 配置 Zustand 状态管理（authStore）。
- 配置 Socket.IO Client（连接预留，本阶段暂不深入使用）。
- 实现 API 客户端（httpClient，封装 fetch）。
- 实现登录页面（用户名输入、密码输入、登录按钮、失败提示）。
- 实现管理员页面（玩家列表、创建玩家表单、删除按钮）。
- 实现玩家入口页面（简单大厅/Lobby，显示"欢迎"和"进入游戏"占位）。
- 实现路由保护（未登录跳转登录页，管理员/玩家分别进入对应页面）。
- 使用 CSS Modules 编写样式。

### 6.3 输出物

- 登录页面（`LoginPage.tsx`）。
- 管理员页面（`AdminUsersPage.tsx`）。
- 玩家大厅页面（`LobbyPage.tsx`）。
- 前端路由配置。
- API 客户端模块。
- Zustand authStore。
- 登录态持久化（localStorage token）。

### 6.4 验收标准

- 管理员可以登录并跳转到管理员页面。
- 玩家可以登录并跳转到大厅页面。
- 错误账号或密码登录失败并显示提示。
- 管理员可以在页面中查看玩家列表、创建和删除玩家。
- 未登录用户无法访问受保护页面（自动跳转登录页）。
- 页面在 PC 和移动端浏览器可正常显示和操作。

### 6.5 测试策略

| 测试类型 | 工具 | 覆盖范围 |
|----------|------|----------|
| 集成测试 | Vitest + supertest | 前端需配合服务端，验证登录流程端到端 |

---

## 7. 第四阶段：麻将游戏前端显示画面

### 7.1 阶段目标

完成麻将游戏前端显示画面，重点是每个玩家看到的游戏画面。

> **关键前置条件**：本阶段开始前，需在 `packages/shared` 中定义 Socket.IO 事件 payload 类型和牌局视角状态的 TypeScript 类型。前端模拟数据必须遵循这套类型，避免第六阶段合并时因接口不一致而返工。

本阶段可以先使用模拟数据驱动页面，不要求马上接入完整业务算法。

### 7.2 功能点

- 设计 PC 端麻将桌布局。
- 设计移动端麻将桌布局（响应式适配）。
- 展示当前玩家手牌（含牌面图案/文字）。
- 展示其他玩家区域（手牌数量 + 公开信息）。
- 展示弃牌区（按玩家分区）。
- 展示当前回合指示（轮到谁出牌）。
- 展示吃、碰、杠等公开组合。
- 展示可操作按钮（吃/碰/杠/胡/过/出牌）。
- 展示对局提示信息（如"玩家 A 碰了 3 万"）。
- 支持不同玩家视角的数据展示（通过 shared 类型定义的 PlayerView 接口）。
- 实现 Tile 组件（单张牌，支持横放/竖放/背面）。
- 实现 HandTiles 组件（手牌排列，选中高亮）。
- 实现 MahjongTable 组件（整体牌桌布局）。
- 实现 DiscardArea 组件（弃牌区）。
- 实现 ActionBar 组件（操作按钮，根据当前可选动作动态显示）。
- 实现 Zustand gameStore（管理当前牌局视角状态）。
- 实现 socketStore（管理 Socket.IO 连接和事件监听，本阶段可先用 setTimeout 模拟）。

### 7.3 玩家视角要求

- 当前玩家能看到自己的手牌（完整牌面）。
- 当前玩家不能看到其他真实玩家的手牌（只显示背面或数量）。
- 当前玩家能看到所有公开弃牌。
- 当前玩家能看到所有公开组合（吃碰杠）。
- 当前玩家能看到当前轮到谁操作。
- 当前玩家能看到自己可执行的动作列表。

### 7.4 shared 类型依赖（本阶段开始前需定义）

```typescript
// packages/shared/src/gameTypes.ts（框架）
interface PlayerView {
  seatIndex: number;
  handTiles: TileInfo[];        // 自己的手牌（仅当前玩家有完整数据）
  otherPlayers: OtherPlayerView[];
  discardAreas: DiscardPile[];  // 各玩家弃牌区
  publicMelds: MeldInfo[];      // 公开的吃碰杠组合
  currentTurn: number;          // 当前操作玩家 seatIndex
  availableActions: Action[];   // 当前玩家可执行的动作
  phase: GamePhase;             // 当前阶段
}
```

### 7.5 输出物

- 麻将游戏页面（`GamePage.tsx`）。
- 全套麻将 UI 组件（MahjongTable、HandTiles、DiscardArea、ActionBar、Tile）。
- PC 端和移动端响应式布局。
- 模拟牌局数据（多种场景：初始手牌、听牌、可碰/可杠等）。
- 不同玩家视角展示 Demo（通过切换模拟数据中的 seatIndex 验证）。
- Zustand gameStore 完成。

### 7.6 验收标准

- 页面能清晰展示麻将桌整体布局。
- 当前玩家手牌可见（牌面清晰可辨）。
- 其他玩家手牌不可见（只显示数量或背面）。
- 公开信息展示正确（弃牌、吃碰杠组合）。
- 操作按钮根据当前状态正确显示/隐藏。
- PC 浏览器可用。
- 移动端浏览器可用（布局自适应，牌面可点击）。

---

## 8. 第五阶段：合并麻将游戏核心业务算法

> 即原第六阶段。

### 8.1 阶段目标

将第一阶段完成的麻将核心业务算法合并到整体系统中，使前端显示、账号系统和服务端业务形成闭环。

### 8.2 功能点

- 服务端接入 `packages/mahjong-core`。
- 实现 gameRoom：管理座位、人类玩家与电脑玩家混排、游戏生命周期。
- 实现 gameStateMapper：为每个玩家生成视角数据（`PlayerView`）。
- 实现 Socket.IO 事件处理器（game:join、game:start、game:action、game:sync）。
- 接入电脑玩家调度（botService）。
- 电脑玩家延迟 0.5-2s 随机延迟后自动提交动作。
- 实现断线重连：`game:sync` 事件恢复当前玩家视角。
- 实现超时处理：玩家超时未操作时自动打出随机合法牌（托管模式）。
- 写入 GameRecord 和 GameEvent 表（通过 Prisma）。
- 实现对局结束结算通知。
- 完成端到端联调。

### 8.3 输出物

- 服务端 game 模块完整实现（gameService、gameRoom、gameStateMapper）。
- Socket.IO 事件处理完整实现。
- 电脑玩家接入流程。
- GameRecord / GameEvent 数据表。
- 完整对局联调 Demo。

### 8.4 验收标准

- 玩家登录后可以进入麻将游戏，Socket.IO 连接成功。
- 游戏可以创建并开始（人类玩家 + 电脑玩家混排）。
- 玩家操作经过 mahjong-core reducer 校验。
- 非法操作被拒绝并返回 game:error 提示。
- 游戏状态实时反映到前端画面（通过 game:state 推送）。
- 不同玩家看到的牌局信息符合规则（视角隔离）。
- 电脑玩家可参与对局并执行合法动作。
- 能完整跑通一局游戏（从发牌到有人胡牌或流局）。
- 断线重连后玩家可恢复牌局视角。

---

## 9. 阶段依赖关系

推荐执行顺序：

```text
阶段 0 项目初始化
  │
  ├──→ 阶段 1 核心算法（可与阶段 2 并行）
  │
  └──→ 阶段 2 服务端 + 账号管理
         │
         ├──→ 阶段 3 登录前端 + 管理员页面
         │
         └──→ 阶段 4 麻将前端画面（可与阶段 3 并行）
                │
                └──→ 阶段 5 核心业务合并
```

并行机会：
- 阶段 0 完成后，阶段 1（核心算法）和阶段 2（服务端）可以**并行推进**。
- 阶段 2 完成后，阶段 3（登录页面）和阶段 4（麻将前端画面）可以**部分并行**，共享前端基础设施。
- 阶段 4 开始前，需要先在 shared 包中定义 PlayerView 等游戏类型，避免接口不一致。

---

## 10. 当前优先级

最高优先级：

- 阶段 0：项目初始化（monorepo 脚手架 + 工具链）。
- 阶段 1：核心算法 + 电脑玩家算法。
- `RuleConfig` 设计和标准麻将规则最小可用集。

第二优先级：

- 阶段 2：服务端基础 + 账号管理（含 Ubuntu 虚拟机验证）。
- 阶段 3：登录前端 + 管理员页面。

第三优先级：

- 阶段 4：麻将前端显示画面。
- 阶段 5：核心业务合并。
