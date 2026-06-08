# 在线麻将开发计划

## 1. 开发阶段概览

当前开发计划分为六个阶段（含初始化）：

0. 项目初始化：monorepo 脚手架、共享类型、工具链配置。（已完成）
1. 完成麻将核心玩法算法和电脑玩家算法验证。
2. 完成服务端基础搭建 + 账号管理模块 + 登录前端 + 管理员用户管理页面。（已完成）
3. 完成玩家入口页面 + 前端路由和体验完善。（已完成）
4. 完成麻将游戏前端显示画面。
5. 合并麻将游戏核心业务算法，形成完整闭环。

当前状态：

- 阶段 0 已于 2026-05-30 完成。
- 阶段 1 已于 2026-05-30 完成。
- 阶段 2 已于 2026-05-30 完成。
- 阶段 3 已于 2026-06-01 完成。
- 阶段 4 已于 2026-06-01 完成。
- 当前优先级进入阶段 5：核心算法 + 服务端实时对局闭环。
- 阶段 1 已完成核心规则基础能力：牌定义、牌墙、发牌、摸打、弃牌响应窗口、响应优先级、吃碰杠、基础胡牌判定、基础番型识别、简化计分、basicBot 自摸/流局模拟。
- 阶段 2 已完成账号管理闭环：SQLite 账户存储、bcrypt 密码哈希、管理员初始化、登录态、管理员用户管理 API、登录页面、管理员页面、玩家登录占位入口和 Ubuntu 虚拟机浏览器验证。
- 阶段 3 已完成玩家大厅、前端路由保护、Zustand 登录态管理、Socket.IO Client 占位、退出登录清理和 PC/移动端体验优化。
- 阶段 4 已完成模拟牌桌、玩家大厅快速开始入口、玩家视角切换、牌面 CSS 增强、管理员牌面预览和 PC/移动端布局适配。
- 阶段 0 已建立 pnpm workspace、TypeScript、ESLint、Prettier、Vitest、Prisma、React/Vite、Fastify 基础骨架。

## 2. 关键决策记录

以下技术决策在阶段 0 确定，各阶段遵循执行：

| 决策项              | 选择                | 理由                                                         |
| ------------------- | ------------------- | ------------------------------------------------------------ |
| 测试框架            | **Vitest**          | 与 Vite 生态一致，原生 TypeScript 支持，执行速度快           |
| CSS 方案            | **CSS Modules**     | 避免类名冲突，TypeScript 类型提示，适合组件化开发            |
| 日志库              | **pino**            | Node.js 最快日志库，结构化 JSON 输出，适合调试和后续日志分析 |
| 密码哈希            | **bcrypt**          | 成熟的密码哈希库，防止彩虹表攻击                             |
| HTTP 客户端（测试） | **supertest**       | Fastify 集成测试标准工具                                     |
| Monorepo            | **pnpm workspaces** | 原生支持，无需额外依赖，适合当前规模                         |

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

### 4.7 完成记录

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
- 暗杠：自己回合可杠手中 4 张同牌，并补摸一张牌。
- 加杠：已有碰牌组合时可补第 4 张升级为杠，并补摸一张牌。
- 过：所有响应玩家都过后，下家摸牌继续。
- 响应优先级：胡 > 碰/杠 > 吃，响应者过后重新计算下一最高优先级响应者。
- 基础番型识别：平和、立直、断幺九、混一色、清一色、对对胡、七对子、混老头。
- 简化计分函数：底分 + 番数 × 番分值。
- 胡牌结算接入游戏结束状态，`state.score` 包含番型、番数和总分。
- 长局 bot 统计测试：50 局自动对局验证无死锁，并统计胡牌/流局结束原因。

已验证命令：

```bash
pnpm -F mahjong-core typecheck
pnpm -F mahjong-core test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

阶段 1 已达到当前验收标准。后续与服务端/前端联调时，可继续补充更细的地方规则、抢杠胡、多人胡细节和更复杂的番型。

### 4.6 测试策略

| 测试类型 | 工具   | 覆盖范围                                                   |
| -------- | ------ | ---------------------------------------------------------- |
| 单元测试 | Vitest | 每种牌型判定、每个动作合法性校验、RuleConfig 行为          |
| 模拟对局 | Vitest | 4 个 basicBot 自动对局 ≥ 10 局，统计胡牌率、流局率、无死锁 |

---

## 5. 第二阶段：服务端基础 + 账号管理模块 + 登录和用户管理前端

> 此阶段合并了原"第二阶段（空壳服务器）"和"第三阶段（账号管理）"。
> 原第二阶段只搭一个返回 OK 的最小 Web 服务，价值有限且与第三阶段同属服务端工作。合并后可一次性完成 Fastify 骨架、Prisma 接入、User 表和登录 API，减少重复搭建。
> 为了让阶段验收能在浏览器中直接看到效果，登录页面和管理员用户管理页面也纳入第二阶段；原第三阶段缩小为玩家入口页面、路由保护细节和前端体验完善。

### 5.1 阶段目标

完成服务端应用搭建和最小可用账号管理闭环，包括 Fastify HTTP 服务、SQLite 数据库初始化、User 表实现、管理员和玩家账号管理 API、管理员登录页面、管理员用户管理页面，并确保可在 Ubuntu 虚拟机中通过浏览器完成登录和玩家账号管理操作。

### 5.2 功能点

- 初始化 Fastify 应用，配置 pino 日志。
- 配置 Prisma + SQLite，运行数据库迁移。
- 将账户信息持久化存储到 SQLite `User` 表，密码仅保存 bcrypt 哈希，不保存明文密码。
- 创建管理员账号（通过 seed 脚本或初始化命令）。
- 实现管理员登录 API。
- 实现玩家登录 API。
- 实现获取当前登录用户 API。
- 实现管理员创建玩家账号 API。
- 实现管理员删除玩家账号 API。
- 实现管理员重置玩家密码 API。
- 实现玩家列表查询 API。
- 实现密码 bcrypt 哈希存储和验证。
- 实现基础 JWT 登录态管理。
- 配置 CORS。
- 实现前端 API 客户端（封装 fetch、token 注入和错误处理）。
- 实现登录页面（用户名输入、密码输入、登录按钮、失败提示）。
- 实现管理员用户管理页面（玩家列表、搜索玩家、创建玩家账号、重置玩家密码、删除玩家账号）。
- 实现前端登录态存储（localStorage token）和最小路由切换。
- 在 Ubuntu 虚拟机中部署并验证浏览器可访问。
- 提供健康检查端点 `GET /health`。

### 5.3 数据表

`User` 表（Prisma schema）：

| 字段         | 类型            | 说明                |
| ------------ | --------------- | ------------------- |
| id           | Int (auto)      | 主键                |
| username     | String (unique) | 用户名              |
| passwordHash | String          | bcrypt 哈希         |
| role         | String          | "admin" 或 "player" |
| createdAt    | DateTime        | 创建时间            |
| updatedAt    | DateTime        | 更新时间            |

账户存储要求：

- 所有管理员和玩家账号均写入 SQLite 数据库。
- 密码入库前必须通过 bcrypt 哈希处理。
- 登录校验只比较 bcrypt 哈希结果。
- 代码和文档中不得记录真实生产密码；本地初始化管理员密码通过环境变量或初始化命令传入。
- SQLite 数据库文件、journal/WAL 文件不得提交到 Git。

### 5.4 输出物

- `apps/server` 完整服务端骨架。
- Prisma schema + 数据库迁移文件。
- 管理员 seed 脚本。
- 账号管理 REST API（admin 创建/删除/重置密码/列表、auth 登录/登出/获取当前用户）。
- 登录前端页面。
- 管理员用户管理前端页面（创建、搜索、重置密码、删除）。
- 前端 API 客户端和登录态持久化。
- Ubuntu 虚拟机部署说明。
- 集成测试（Vitest + supertest）。

### 5.5 验收标准

- 服务端 `pnpm -F server dev` 可启动。
- `GET /health` 返回 200。
- 数据库可保存和查询玩家信息。
- SQLite 数据库中可持久化管理员和玩家账号，重启服务后账号仍可登录。
- 数据库中不保存明文密码，只保存 bcrypt 哈希。
- 管理员 seed 脚本可创建初始管理员账号。
- 管理员可创建、搜索、删除玩家账号，并可重置玩家密码。
- 管理员和玩家可登录并获取不同身份的 token。
- 玩家不能自行注册账号（无注册 API）。
- 未登录请求受保护 API 返回 401。
- 管理员可在浏览器登录并进入用户管理页面。
- 管理员可在浏览器中查看玩家列表、搜索玩家、创建玩家账号、重置玩家密码、删除玩家账号。
- 非管理员不能访问管理员用户管理 API。
- Ubuntu 虚拟机中服务可启动，宿主机浏览器可访问健康检查页面。

### 5.6 测试策略

| 测试类型       | 工具               | 覆盖范围                                         |
| -------------- | ------------------ | ------------------------------------------------ |
| 单元测试       | Vitest             | password 哈希/验证、authService 逻辑             |
| 集成测试       | Vitest + supertest | 全部 HTTP API 端点、登录态、权限校验             |
| 浏览器冒烟测试 | 手动验证           | 管理员登录、玩家创建、玩家删除、刷新后登录态恢复 |

### 5.7 完成记录

完成日期：2026-05-30

已完成输出：

- Prisma `User` 表迁移文件和 SQLite 本地数据库初始化流程。
- `pnpm prisma:migrate` 根目录脚本，可创建 `data/dev.db` 并应用迁移。
- 管理员初始化脚本：`pnpm -F server seed:admin`。
- bcrypt 密码哈希与校验，数据库仅保存 `passwordHash`。
- HS256 JWT 形态的 Bearer token 登录态。
- Auth API：`POST /auth/login`、`GET /auth/me`、`POST /auth/logout`。
- Admin API：`GET /admin/players`、`POST /admin/players`、`PATCH /admin/players/:id/password`、`DELETE /admin/players/:id`。
- 权限控制：未登录返回 401，非管理员访问管理接口返回 403。
- 登录前端页面，支持管理员和玩家账号登录。
- 管理员玩家账号管理页面：列表、搜索、创建、重置密码、删除、刷新、请求中按钮状态、中文错误提示。
- 玩家登录后的入口占位页，显示玩家账号信息。
- 前端 API 客户端，支持虚拟机 Network 地址自动请求同主机 `3000` 端口后端。
- 第二阶段运行手册：`Documents/phase-2-runbook.md`。

已验证命令：

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm -F server seed:admin
pnpm -F server test
pnpm -F web typecheck
pnpm -F web build
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

浏览器验证：

- Ubuntu 虚拟机中 `pnpm dev` 可同时启动 web 和 server。
- 宿主机浏览器可通过 Vite Network 地址访问登录页。
- 管理员可登录、创建玩家、搜索玩家、重置玩家密码、删除玩家。
- 玩家可用管理员创建或重置后的密码登录，并进入玩家入口占位页。
- 账户数据写入 SQLite，刷新页面和重启服务后仍可查询和登录。

阶段 2 已达到当前验收标准。后续阶段 3 继续完善玩家入口页面、前端路由结构和体验分层。

---

## 6. 第三阶段：玩家入口页面 + 前端体验完善

### 6.1 阶段目标

在第二阶段已完成登录和管理员用户管理闭环的基础上，补齐玩家登录后的入口页面、前端路由保护细节和基础体验优化，为后续麻将桌页面开发做准备。

### 6.2 功能点

- 搭建 React + Vite 前端骨架（在阶段 0 已初始化）。
- 完善 Zustand 状态管理（authStore）。
- 配置 Socket.IO Client（连接预留，本阶段暂不深入使用）。
- 实现玩家入口页面（简单大厅/Lobby，显示"欢迎"和"进入游戏"占位）。
- 完善路由保护（未登录跳转登录页，管理员/玩家分别进入对应页面）。
- 完善登录态恢复和退出登录流程。
- 优化登录页和管理员页面在 PC、移动端浏览器中的显示。
- 使用 CSS Modules 编写样式。

### 6.3 输出物

- 玩家大厅页面（`LobbyPage.tsx`）。
- 前端路由配置。
- Zustand authStore。
- Socket.IO Client 初始化占位。
- 登录、管理员页面的体验优化。

### 6.4 验收标准

- 玩家可以登录并跳转到大厅页面。
- 未登录用户无法访问受保护页面（自动跳转登录页）。
- 退出登录后 token 被清理，受保护页面不可继续访问。
- 页面在 PC 和移动端浏览器可正常显示和操作。

### 6.5 测试策略

| 测试类型 | 工具               | 覆盖范围                             |
| -------- | ------------------ | ------------------------------------ |
| 集成测试 | Vitest + supertest | 前端需配合服务端，验证登录流程端到端 |

### 6.6 完成记录

完成日期：2026-06-01

已完成输出：

- 玩家大厅页面，展示玩家身份、账号创建时间、Socket 连接准备状态和进入游戏占位入口。
- 前端页面拆分：登录页、管理员用户管理页、玩家大厅页。
- 前端路由配置和角色保护：未登录回登录页，管理员进入账号管理页，玩家进入大厅页，越权路径自动回到角色默认页。
- `authStore` 管理登录、退出、token 恢复、登录过期清理和本地 token 持久化。
- `socketStore` 管理 Socket.IO Client 初始化占位、token 切换和退出清理。
- 内部路由变更事件，保证程序替换路径后页面路径状态同步。
- 统一日期格式工具，管理员列表和玩家大厅使用一致时间显示。
- 登录页、管理员页、玩家大厅的 PC 和移动端响应式样式。
- 前端单元测试覆盖路由分流、authStore、socketStore 和日期格式化。

已验证命令：

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web test
pnpm -F web build
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

阶段 3 已达到当前验收标准。后续阶段 4 继续开发麻将游戏前端显示画面，并在开始前补齐 `packages/shared` 中的牌局视角类型。

---

## 7. 第四阶段：麻将游戏前端显示画面

### 7.1 阶段目标

完成麻将游戏前端显示画面，重点是每个玩家看到的游戏画面。

阶段状态：已完成。

> **关键前置条件**：本阶段开始前，需确认 `packages/shared` 中的 Socket.IO 事件 payload 类型和牌局视角状态 TypeScript 类型满足页面展示需要。前端模拟数据必须遵循这套类型，避免第五阶段合并时因接口不一致而返工。

本阶段使用模拟数据驱动页面，不接真实服务端对局，不调用 `mahjong-core` reducer，不实现创建房间或加入房间业务。阶段目标是完成符合 `PlayerView` 合同的游戏 UI，为第五阶段接入真实 gameRoom 和 Socket.IO 状态推送做准备。

### 7.2 功能点

- 复核并补齐 `packages/shared/src/gameTypes.ts`，确保 `PlayerView` 能表达页面展示需要。
- 复核 `packages/shared/src/socketEvents.ts`，只保留阶段五联调所需的事件形状，不在阶段四实现真实 socket 业务。
- 新增玩家游戏页面路由 `/game/demo`。
- 玩家大厅的"快速开始"入口进入模拟牌桌页面。
- "创建房间"和"加入房间"保留占位禁用状态。
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
- 复用阶段三已完成的 socketStore，仅保留 Socket.IO Client 准备状态，不接真实事件监听。
- 提供模拟牌局数据：初始牌局、可操作场景、对局结束场景。
- 支持切换玩家视角，验证当前玩家手牌可见、其他玩家手牌不可见。
- 牌面先使用中文文字牌和 CSS 样式增强实现，不引入图片资源；通过花色颜色、符号、圆点/条纹等视觉元素提升辨识度。
- 后续可评估升级为本地 SVG 牌面或统一贴图资源，但需避免版权风险、风格不统一和资源体积过大。

### 7.3 玩家视角要求

- 当前玩家能看到自己的手牌（完整牌面）。
- 当前玩家不能看到其他真实玩家的手牌（只显示背面或数量）。
- 当前玩家能看到所有公开弃牌。
- 当前玩家能看到所有公开组合（吃碰杠）。
- 当前玩家能看到当前轮到谁操作。
- 当前玩家能看到自己可执行的动作列表。

### 7.4 shared 类型依赖（本阶段开始前需定义）

当前 `packages/shared/src/gameTypes.ts` 已有 `TileInfo`、`MeldInfo`、`DiscardPile`、`Action`、`OtherPlayerView` 和 `PlayerView` 基础类型。阶段四开始时需要先复核这些类型是否足够支撑 UI；如需增加展示字段，应优先保持字段面向"玩家视角"，不要把服务端内部状态暴露给前端。

```typescript
// packages/shared/src/gameTypes.ts（框架）
interface PlayerView {
  seatIndex: number;
  handTiles: TileInfo[]; // 自己的手牌（仅当前玩家有完整数据）
  otherPlayers: OtherPlayerView[];
  discardAreas: DiscardPile[]; // 各玩家弃牌区
  publicMelds: MeldInfo[]; // 公开的吃碰杠组合
  currentTurn: number; // 当前操作玩家 seatIndex
  availableActions: Action[]; // 当前玩家可执行的动作
  phase: GamePhase; // 当前阶段
}
```

类型补充原则：

- `PlayerView` 是游戏 UI 的唯一视角数据源。
- 页面不直接依赖 `mahjong-core` 的 `MahjongGameState`。
- 模拟数据、组件 props 和后续 Socket.IO `game:state` payload 使用同一套 shared 类型。
- 如果增加房间状态、座位风、事件消息等字段，字段必须能被第五阶段服务端 mapper 稳定生成。

### 7.5 输出物

- 麻将游戏页面（`GamePage.tsx`）。
- 全套麻将 UI 组件（MahjongTable、HandTiles、DiscardArea、ActionBar、Tile）。
- PC 端和移动端响应式布局。
- CSS 增强版牌面样式（万/筒/条/风/箭有明显视觉区分）。
- 模拟牌局数据（多种场景：初始手牌、可碰/可杠/可胡、对局结束）。
- 不同玩家视角展示 Demo（通过切换模拟数据中的 seatIndex 验证）。
- Zustand gameStore 完成。
- 玩家大厅到模拟牌桌的入口。
- 前端测试覆盖 gameStore、路由分流、核心 UI 组件和模拟数据。

### 7.6 验收标准

- 页面能清晰展示麻将桌整体布局。
- 当前玩家手牌可见（牌面清晰可辨）。
- 不同花色的牌面可通过颜色、符号或 CSS 图案快速区分。
- 其他玩家手牌不可见（只显示数量或背面）。
- 公开信息展示正确（弃牌、吃碰杠组合）。
- 操作按钮根据当前状态正确显示/隐藏。
- 玩家可以从大厅进入模拟牌桌。
- 切换视角后，手牌可见性和动作按钮随当前视角变化。
- PC 浏览器可用。
- 移动端浏览器可用（布局自适应，牌面可点击）。
- 阶段四不要求真实创建房间、加入房间、Socket.IO 对局同步或服务端 reducer 校验。

### 7.7 建议实施顺序

1. 复核 shared 游戏视角类型和 Socket 事件类型，必要时补最小展示字段。
2. 新增模拟牌局数据，覆盖初始、可操作、结束三类场景。
3. 实现 gameStore，支持加载场景、切换视角、选中手牌。
4. 增加 `/game/demo` 页面分流，并从玩家大厅"快速开始"进入。
5. 实现 Tile、HandTiles、DiscardArea、ActionBar、MahjongTable 等组件。
6. 优化 Tile 牌面视觉，先用 CSS 文字增强区分万、筒、条、风、箭。
7. 完成 PC 和移动端 CSS Modules 响应式布局。
8. 补齐单元测试和浏览器验收。

### 7.8 牌面视觉方案

阶段四优先采用 CSS 文字增强方案，不引入外部图片素材：

- 万牌：保留数字 + "万"，使用偏红的花色标识。
- 筒牌：使用圆点或圆形阵列的 CSS 图案表达点数。
- 条牌：使用竖条或竹条样式的 CSS 图案表达点数。
- 风牌：东南西北使用大字牌面和独立底色。
- 箭牌：中、发、白使用红、绿、浅色等强区分样式。

后续阶段如需要更真实的牌面，可新增本地 SVG 资源或自制贴图集。贴图方案必须使用可授权或自制素材，并保持桌面端、移动端和高 DPI 屏幕下的清晰度。

### 7.9 测试策略

| 测试类型       | 工具       | 覆盖范围                                            |
| -------------- | ---------- | --------------------------------------------------- |
| 单元测试       | Vitest     | gameStore 场景切换、视角切换、选中牌、日期/工具函数 |
| 组件测试       | Vitest     | Tile、ActionBar 等纯展示组件的条件渲染              |
| 类型检查       | TypeScript | shared 类型、模拟数据、组件 props 一致性            |
| 浏览器冒烟测试 | 手动验证   | PC/移动端牌桌展示、视角切换、从大厅进入牌桌         |

阶段四完成前需通过：

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web test
pnpm -F web build
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### 7.10 完成记录

完成日期：2026-06-01

已完成输出：

- `packages/shared` 补齐游戏视角、动作、公开组合、弃牌区、事件消息和 Socket.IO 游戏事件类型。
- 新增 `/game/demo` 模拟牌桌路由，玩家大厅"快速开始"可进入模拟牌桌。
- "创建房间"和"加入房间"保留禁用占位，真实房间业务进入阶段 5。
- `GamePage`、`MahjongTable`、`HandTiles`、`DiscardArea`、`ActionBar`、`Tile` 和 `TileGallery` 完成。
- `gameStore` 支持模拟场景切换、玩家视角切换和手牌选中状态。
- 模拟数据覆盖初始、可操作和结束三类场景，并遵循 `PlayerView` 类型。
- 当前玩家手牌明牌显示，其他玩家仅显示背面牌数量和公开信息。
- 弃牌、吃碰杠公开组合、当前回合、可操作按钮、事件消息和结算状态完成展示。
- 牌面采用 CSS 增强方案，万/筒/条/风/箭通过颜色、符号和图案区分。
- 管理员页面增加 34 种基础牌面样式预览，便于验收牌面视觉。
- 完成 PC 和移动端响应式布局。
- 前端测试覆盖路由分流、gameStore、Tile、TileGallery、ActionBar 和牌面目录。

已验证命令：

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web test
pnpm -F web build
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

浏览器验收：

- 管理员页面可显示牌面样式预览。
- 玩家大厅"快速开始"可进入模拟牌桌。
- 模拟牌桌可切换初始、可操作、结束场景。
- 模拟牌桌可切换 1-4 号玩家视角，当前玩家手牌可见，其他玩家手牌不可见。
- PC 和移动端宽度下牌桌布局、手牌、弃牌区、操作按钮和控制面板可正常显示。

阶段 4 已达到当前验收标准。后续阶段 5 将接入 `mahjong-core`、服务端 gameRoom、Socket.IO 对局事件、玩家视角 mapper 和断线重连，形成真实对局闭环。

---

## 8. 第五阶段：合并麻将游戏核心业务算法

> 即原第六阶段。

### 8.1 阶段目标

将第一阶段完成的麻将核心业务算法合并到整体系统中，使前端显示、账号系统和服务端业务形成闭环。

阶段状态：收尾中。

当前已完成：快速对局创建、前端首次进入牌桌触发 `game:start`、`mahjong-core` reducer 校验、简化规则牌墙、玩家视角 mapper、Socket.IO `game:join` / `game:start` / `game:action` / `game:sync`、实时事件通知、机器人连续操作、断线后同步、结束后再开一局、结算信息、摸打牌高亮和真人 30 秒超时托管。

剩余收尾：手动浏览器验收、阶段五文档完成记录、可选的 GameRecord / GameEvent 持久化方案评估。

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
         └──→ 阶段 3 玩家入口页面 + 前端体验完善
                │
                └──→ 阶段 4 麻将前端画面
                       │
                       └──→ 阶段 5 核心业务合并
```

并行机会：

- 阶段 0 完成后，阶段 1（核心算法）和阶段 2（服务端）可以**并行推进**。
- 阶段 2 完成后，阶段 3 需要先整理登录态、页面分流、玩家大厅和前端体验，为阶段 4 的麻将桌页面提供稳定入口。
- 阶段 3 完成后，阶段 4 可以专注麻将桌 UI、模拟牌局视图和游戏状态展示。
- 阶段 4 完成后，阶段 5 需要复用已定义的 PlayerView 等游戏类型，将真实服务端状态映射到前端视角。

---

## 10. 当前优先级

最高优先级：

- 阶段 5：核心算法 + 服务端实时对局闭环。
- 服务端接入 mahjong-core、gameRoom、Socket.IO 对局事件和断线重连。
- 实现 gameStateMapper，将真实牌局状态转换为 `PlayerView` 推送给前端。

第二优先级：

- 地方规则、部署增强和长期运行能力。

第三优先级：

- UI 贴图升级、更多牌桌体验细节和历史对局回放。

后续开发计划确认：

1. 阶段 4 已在阶段 3 的前端基础上完成模拟麻将桌页面，不直接接入完整服务端对局。
2. 阶段 5 把第一阶段的核心算法、第四阶段的游戏画面和服务端实时通信合并成完整对局闭环。
3. 地方规则、容器化部署和生产化运维能力在完整闭环稳定后继续扩展。
