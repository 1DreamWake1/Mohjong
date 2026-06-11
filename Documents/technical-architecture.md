# 在线麻将技术路线与架构设计

## 1. 技术路线结论

结合当前需求，推荐采用以下技术路线：

```text
前端：React + TypeScript + Vite
服务端：Node.js + TypeScript + Fastify
实时通信：Socket.IO
数据库：SQLite
ORM：Prisma
核心算法：独立 TypeScript 包
本地部署：Node.js 进程直接运行
Linux 测试部署：Ubuntu 虚拟机 + Docker Compose + SQLite
后续部署：Docker Compose 为主，按需接入 PostgreSQL + Nginx/Caddy
```

这条路线的核心原则是：

- 初期不要过度设计。
- 前后端统一使用 TypeScript，降低沟通和类型维护成本。
- 麻将核心算法独立出来，避免和页面、服务器、数据库耦合。
- 数据库先用 SQLite，满足本地测试和小规模玩家使用。
- 后续部署以 Docker Compose 为主要方式，降低环境差异和迁移成本。
- 架构上预留未来迁移 PostgreSQL、地方规则、多房间和公网部署的空间。

## 2. 当前需求对技术选型的影响

当前产品约束：

- 初期最多 4 个在线人类玩家。
- 初期本地部署测试。
- 先在本地 Ubuntu 虚拟机上验证服务器访问。
- 用户由管理员创建，不开放注册。
- 不需要广告、充值、高并发。
- 需要电脑玩家补位。
- 需要支持 PC 和移动端浏览器。
- 后续可能扩展四川麻将、禁用“吃”等地方规则。

因此，初期不需要：

- Kubernetes。
- 微服务。
- Redis 集群。
- 消息队列。
- 分布式房间服务。
- 复杂网关。
- 云数据库。

更重要的是把规则算法、服务端状态同步、前端牌桌显示和账号体系做清楚。

## 3. 前端技术选型

### 3.1 推荐方案

推荐：

- React
- TypeScript
- Vite
- Zustand（状态管理）
- **CSS Modules**（样式方案，最终选定）
- Socket.IO Client
- **Vitest**（单元测试）

### 3.2 选择理由

React 适合做复杂交互页面，麻将牌桌需要频繁根据状态刷新手牌、弃牌区、操作按钮和提示信息。React 的组件模型适合拆分玩家区域、手牌区、操作区、桌面区。

TypeScript 可以让前后端共享牌局状态类型、玩家动作类型和 WebSocket 事件类型，减少字段不一致导致的问题。

Vite 启动快，适合本地开发和快速调试。

Zustand 比 Redux 更轻，适合当前规模。状态主要包括：

- 当前登录用户。
- 当前房间。
- 当前牌局视角。
- WebSocket 连接状态。
- 可操作动作。

CSS Modules 相比普通 CSS 或 Tailwind：
- 类名自动局部作用域，避免组件间样式冲突。
- TypeScript 类型提示（`*.module.css` 生成 `.d.ts`）。
- 适合麻将牌桌这种复杂、组件化程度高的场景。
- 无需额外工具链，Vite 原生支持。

Vitest 相比 Jest：
- 与 Vite 共享插件和配置，无需额外设置。
- 原生 ESM 和 TypeScript 支持，无需 `ts-jest`。
- HMR 模式适合开发阶段快速迭代测试。

### 3.3 前端模块设计

```text
apps/web/
  src/
    app/
      router.tsx
      App.tsx
    pages/
      LoginPage.tsx
      AdminUsersPage.tsx
      LobbyPage.tsx
      GamePage.tsx
    components/
      mahjong/
        MahjongTable.tsx
        PlayerArea.tsx
        HandTiles.tsx
        DiscardArea.tsx
        ActionBar.tsx
        Tile.tsx
      layout/
        PageShell.tsx
    stores/
      authStore.ts
      gameStore.ts
      socketStore.ts
    api/
      httpClient.ts
      socketClient.ts
    styles/
      global.css
```

### 3.4 前端页面

初期页面：

- 登录页。
- 管理员玩家账号管理页。
- 玩家游戏入口页。
- 麻将游戏页。

后续页面：

- 房间页。
- 对局记录页。
- 规则配置页。

## 4. 服务端技术选型

### 4.1 推荐方案

推荐：

- Node.js
- TypeScript
- Fastify
- Socket.IO
- Prisma
- SQLite
- **pino**（结构化日志）
- **Vitest + supertest**（测试）

### 4.2 选择理由

Node.js + TypeScript 与前端技术栈一致，适合当前项目规模。麻将业务属于回合制游戏，不是 CPU 密集型高并发场景，Node.js 足够满足初期需求。

Fastify 相比 Express 更现代，性能好，插件机制清晰，适合做 HTTP API。

Socket.IO 比原生 WebSocket 多了一些实用能力：

- 自动重连。
- 心跳。
- 房间广播。
- 事件命名。
- 客户端兼容处理。

这些能力对本项目的房间同步和断线重连很有价值。

Prisma 适合快速定义数据库模型和生成类型。初期使用 SQLite，后续迁移 PostgreSQL 时改动较小。

pino 相比 console.log 或 winston：
- Node.js 生态中最快的日志库，对游戏实时性影响最小。
- 原生 JSON 结构化输出，便于解析和后续日志分析。
- Fastify 内置 pino 集成，零配置即可使用。
- 牌局关键事件可通过 pino 输出，同时写入 `GameEvent` 表用于回放。

Vitest + supertest 用于服务端测试：
- Vitest 与前端测试框架一致，降低维护成本。
- supertest 是 Fastify 集成测试的标准工具，可直接测试 HTTP API 端点。

### 4.3 服务端模块设计

```text
apps/server/
  src/
    main.ts
    config/
      env.ts
    http/
      routes.ts
      authRoutes.ts
      adminRoutes.ts
    socket/
      socketServer.ts
      gameSocketHandlers.ts
    modules/
      auth/
        authService.ts
        password.ts
        session.ts
      users/
        userService.ts
        userRepository.ts
      game/
        gameService.ts
        gameRoom.ts
        gameStateMapper.ts
      bots/
        botService.ts
    db/
      prisma.ts
```

### 4.4 服务端职责边界

服务端负责：

- 用户认证。
- 管理员账号管理。
- 读取和写入数据库。
- 维护当前房间和牌局实例。
- 接收玩家操作。
- 调用麻将核心算法校验动作。
- 生成不同玩家的视角状态。
- 推送实时状态给前端。
- 调度电脑玩家动作。

服务端不负责：

- 在前端直接判断胡牌结果。
- 信任客户端提交的牌局状态。
- 把规则逻辑写在 WebSocket handler 里。

## 5. 数据库技术选型

### 5.1 初期推荐：SQLite

初期推荐 SQLite。

理由：

- 本地部署简单。
- 不需要额外安装数据库服务。
- 适合 Ubuntu 虚拟机测试。
- 适合最多 4 个在线玩家的规模。
- 数据文件便于备份和迁移。
- Prisma 支持良好。

### 5.2 后续数据库：继续 SQLite，必要时迁移 PostgreSQL

后续 Docker 部署初期仍可以继续使用 SQLite，并通过宿主机挂载卷保存数据库文件。当项目进入公网部署、多人长期使用或统计查询明显增加后，再迁移 PostgreSQL。

迁移触发条件：

- 需要长期稳定运行。
- 需要多人频繁访问。
- 需要更可靠的并发写入。
- 需要复杂查询和统计。
- 需要更规范的备份恢复。

### 5.3 初期数据模型

```text
User
  id
  username
  passwordHash
  role
  createdAt
  updatedAt

GameRecord
  id
  startedAt
  endedAt
  status
  resultJson

GameEvent
  id
  gameId
  sequence
  eventType
  payloadJson
  createdAt
```

第一版可以先只实现 `User` 表。`GameRecord` 和 `GameEvent` 可在第六阶段合并核心业务时加入。

## 6. 麻将核心算法架构

### 6.1 独立包设计

麻将核心算法应放在独立包中：

```text
packages/mahjong-core/
  src/
    tiles/
      tile.ts
      wall.ts
    rules/
      standardRule.ts
      ruleConfig.ts
      ruleEngine.ts
    game/
      gameState.ts
      actions.ts
      reducer.ts
      visibility.ts
      scoring.ts
    bots/
      basicBot.ts
    tests/
```

### 6.2 核心原则

- 不依赖 React。
- 不依赖 Fastify。
- 不依赖 Socket.IO。
- 不依赖数据库。
- 输入当前状态和玩家动作，输出新的状态和事件。
- 所有规则判断集中在核心模块。
- 服务端只是调用核心模块，不重新实现规则。

### 6.3 规则扩展设计

为后续支持四川麻将、禁用“吃”等规则，建议设计 `RuleConfig`：

```ts
type RuleConfig = {
  name: string;
  allowChi: boolean;
  allowPeng: boolean;
  allowGang: boolean;
  allowSevenPairs: boolean;
  useWinds: boolean;
  useDragons: boolean;
  scoringMode: "standard" | "sichuan";
};
```

标准麻将使用：

```ts
const standardRuleConfig = {
  name: "standard",
  allowChi: true,
  allowPeng: true,
  allowGang: true,
  allowSevenPairs: true,
  useWinds: true,
  useDragons: true,
  scoringMode: "standard",
};
```

禁用“吃”可以通过配置实现：

```ts
const noChiRuleConfig = {
  ...standardRuleConfig,
  allowChi: false,
};
```

四川麻将后续可以增加独立规则配置和计分模块。

## 7. 实时通信架构

### 7.1 通信方式

HTTP API 用于：

- 登录。
- 登出。
- 获取当前用户。
- 管理员创建玩家。
- 管理员删除玩家。
- 获取玩家列表。

Socket.IO 用于：

- 进入游戏。
- 同步牌局状态。
- 提交玩家动作。
- 推送电脑玩家动作结果。
- 推送错误提示。
- 断线重连。

### 7.2 事件设计初稿

客户端发送：

```text
game:join
game:start
game:action
game:sync
```

服务端发送：

```text
game:state
game:event
game:error
game:ended
```

### 7.3 断线重连策略

麻将属于回合制游戏，断线重连是关键体验。设计以下策略：

**服务端侧：**
- 为每个 Socket.IO 连接维护 `socketId → { userId, seatIndex, gameId }` 映射。
- 玩家掉线后，服务端保留其座位和牌局状态，不立即移除。
- 若掉线玩家当前轮到操作，等待超时（默认 30 秒），超时后自动托管（电脑玩家接管，打出随机合法牌）。
- 托管期间电脑玩家的动作正常计入对局流程。

**客户端侧：**
- Socket.IO Client 默认启用自动重连（`reconnection: true`）。
- 重连成功后发送 `game:sync` 事件，携带 `gameId` 和 `userId`。
- 服务端收到 `game:sync` 后，通过 `gameStateMapper` 为该玩家重新生成当前视角的 `PlayerView` 并下发。
- 如果掉线期间有其他玩家操作，重连后收到的 `game:state` 包含最新牌局状态。

**事件补充：**

| 事件 | 方向 | 说明 |
|------|------|------|
| `game:reconnect` | 客户端 → 服务端 | 重连请求（携带 gameId、userId、重连 token） |
| `game:auto_play` | 服务端 → 客户端 | 通知某玩家已进入托管模式 |
| `game:timeout` | 服务端 → 客户端 | 当前玩家操作超时提示 |

### 7.4 玩家视角状态

服务端必须为每个玩家生成不同的视角状态。

示例：

```text
Player A 收到：
  - A 的完整手牌
  - B/C/D 的手牌数量
  - 所有公开弃牌
  - 所有公开组合

Player B 收到：
  - B 的完整手牌
  - A/C/D 的手牌数量
  - 所有公开弃牌
  - 所有公开组合
```

前端不能根据全量牌局状态自行过滤，因为这会泄漏其他玩家手牌。

## 8. 整体项目结构

推荐使用 monorepo：

```text
Mohjong/
  apps/
    web/
    server/
  packages/
    mahjong-core/
    shared/
  prisma/
    schema.prisma
  Documents/
    requirements.md
    development-plan.md
    technical-architecture.md
  package.json
  pnpm-workspace.yaml
```

### 8.1 shared 包职责

```text
packages/shared/
  src/
    authTypes.ts
    userTypes.ts
    socketEvents.ts
    apiTypes.ts
```

`shared` 包只放前后端都需要的类型，不放业务规则。

## 9. 本地开发架构

```text
开发电脑
  |
  | pnpm dev
  |
  |-- apps/web     http://localhost:5173
  |-- apps/server  http://localhost:3000
  |-- SQLite       ./data/dev.db
```

开发时前端通过代理访问服务端：

```text
/api     -> http://localhost:3000
/socket  -> http://localhost:3000
```

## 10. Ubuntu 虚拟机测试架构

第二阶段只需要：

```text
宿主机浏览器
  |
  | http://Ubuntu虚拟机IP:3000
  |
Ubuntu 虚拟机
  |
  | Node.js Web Server
```

后续业务合并后：

```text
宿主机/手机浏览器
  |
  | http://Ubuntu虚拟机IP:3000
  |
Ubuntu 虚拟机
  |
  | Node.js + Fastify + Socket.IO
  |
SQLite 数据文件
```

本地开发阶段不强制使用 Docker。后续测试部署和长期运行优先使用 Docker Compose，把 web、server、数据库文件卷和可选反向代理放到同一套部署描述中。等需要模拟正式部署或绑定域名时，再在 Compose 中引入 Nginx 或 Caddy。

## 11. 推荐开发顺序

技术实现建议按以下顺序推进：

1. 初始化 monorepo。
2. 创建 `packages/mahjong-core`。
3. 完成标准麻将核心算法和电脑玩家算法。
4. 创建最小服务端，验证 Ubuntu 虚拟机可访问。
5. 接入 SQLite 和 Prisma。
6. 完成管理员和玩家账号接口。
7. 创建 React 前端和登录页面。
8. 完成管理员账号管理页面。
9. 完成麻将牌桌前端静态展示。
10. 服务端接入麻将核心算法。
11. 接入 Socket.IO 状态同步。
12. 完成电脑玩家接入。
13. 完成本地端到端测试。

## 12. 备选方案对比

### 12.1 服务端：Node.js vs Go

Node.js 优点：

- 前后端都用 TypeScript。
- 开发速度快。
- 适合当前小规模需求。
- 与 React 类型共享方便。

Go 优点：

- 单文件部署简单。
- 并发性能强。
- 服务端长期维护稳定。

当前推荐 Node.js，因为本项目初期核心复杂度在业务规则和前端交互，不在服务端并发性能。

### 12.2 数据库：SQLite vs PostgreSQL

SQLite 优点：

- 零服务部署。
- 本地测试最简单。
- 满足当前 4 人在线规模。

PostgreSQL 优点：

- 更适合正式公网部署。
- 并发和数据可靠性更强。
- 生态成熟。

当前推荐 SQLite。后续部署优先切到 Docker Compose 托管应用和 SQLite 数据卷；当公网或长期运行对并发、统计和备份提出更高要求时，再迁移 PostgreSQL。

### 12.3 前端：React vs Vue

React 优点：

- 组件化灵活。
- TypeScript 生态成熟。
- 适合复杂交互界面。

Vue 优点：

- 上手快。
- 模板语法直观。
- 中小项目开发效率高。

两者都可行。当前推荐 React，原因是复杂牌桌状态、共享类型和组件拆分更适合用 React + TypeScript 管理。

## 13. 主要架构风险

### 13.1 规则逻辑耦合风险

风险：

- 如果把规则判断写在前端或 WebSocket handler 中，后续扩展地方规则会很困难。

应对：

- 所有规则集中在 `mahjong-core`。
- 服务端只调用规则模块。
- 前端只展示服务端下发的合法状态。

### 13.2 玩家视角泄漏风险

风险：

- 如果服务端把完整牌局状态发给所有玩家，其他玩家手牌可能被前端看到。

应对：

- 在服务端生成玩家视角状态。
- 每个连接只收到属于自己的视角。

### 13.3 后续规则扩展风险

风险：

- 标准规则写死后，后续支持四川麻将或禁用“吃”需要大量重构。

应对：

- 第一阶段就引入 `RuleConfig`。
- 把动作合法性、胡牌判断、计分拆分为可替换模块。

### 13.4 本地与 Linux 环境差异风险

风险：

- Windows 或开发机可运行，但 Ubuntu 虚拟机运行失败。

应对：

- 第二阶段尽早验证 Ubuntu 虚拟机基础服务。
- 后续每个阶段都保持 Linux 可启动。

## 14. 最终推荐

最终推荐采用：

```text
React + TypeScript + Vite
Node.js + TypeScript + Fastify + Socket.IO
SQLite + Prisma
独立 mahjong-core 核心算法包
monorepo 项目结构
Ubuntu 虚拟机本地测试
```

该方案对当前规模足够简单，同时不会堵死后续扩展地方规则、正式 Linux 部署、数据库升级和公网访问的路线。
