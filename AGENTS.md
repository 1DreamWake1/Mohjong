# Project Instructions

This file provides context for AI assistants working on this project.

## Project Type: Monorepo — TypeScript Full-Stack

在线麻将（Mohjong）：小规模在线麻将系统。管理员创建玩家账号，玩家通过浏览器登录后进行对局，不足 4 人时电脑玩家自动补位。初期聚焦核心规则验证和本地部署测试。

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js ≥ 20
- **Package manager**: pnpm
- **Monorepo tool**: pnpm workspaces

### Build/Test Commands

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run mahjong-core tests only
pnpm -F mahjong-core test

# Start dev servers (frontend + backend)
pnpm dev

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

### Version Control
This project uses Git. See .gitignore for excluded files.

## Agent Guidance

- **CodeWhale reads this file as:** AGENTS.md (also compatible with WHALE.md)
- **Read-only surface:** `Documents/` (设计文档，不参与构建，修改需谨慎评审)
- **Never edit:** `pnpm-lock.yaml` (由 pnpm 管理), `node_modules/`, `dist/`, `*.db`, `*.db-journal`
- **Always test with:** `pnpm -F mahjong-core test` — 核心算法是所有上层功能的基础，任何修改都应通过此命令验证

## Architecture

### High-Level

```
浏览器 (React)
  │  HTTP (登录/账号) + Socket.IO (游戏实时)
  │
Node.js 服务端 (Fastify)
  │  调用
  │
麻将核心算法 (mahjong-core)    ← 纯逻辑，不依赖任何框架或数据库
  │
SQLite (Prisma ORM)
```

关键架构约束：
- **服务端裁决一切**：前端只展示和提交操作，不做规则判断
- **核心算法独立**：`packages/mahjong-core` 零框架依赖，输入状态+动作 → 输出新状态+事件
- **视角隔离在服务端**：每个玩家只收到自己视角的牌局数据，前端不接触完整牌局
- **规则可配置**：通过 `RuleConfig` 支持标准麻将、四川麻将、禁吃等变体

### Entry Points

| 入口 | 路径 | 说明 |
|------|------|------|
| 服务端 | `apps/server/src/main.ts` | Fastify + Socket.IO 启动 |
| 前端 | `apps/web/src/main.tsx` | React 应用入口 |
| 核心算法 | `packages/mahjong-core/src/index.ts` | 对外导出：牌、规则、状态机、电脑玩家 |
| 数据库 | `prisma/schema.prisma` | Prisma schema，定义 User / GameRecord / GameEvent |
| 共享类型 | `packages/shared/src/index.ts` | 前后端共享的 TypeScript 类型和 Socket.IO 事件定义 |

### Key Modules

```
Mohjong/
  apps/
    web/                    # 前端 React 应用
      src/
        pages/              # LoginPage, AdminUsersPage, LobbyPage, GamePage
        components/
          mahjong/          # MahjongTable, HandTiles, DiscardArea, ActionBar, Tile
          layout/           # PageShell
        stores/             # authStore, gameStore, socketStore (Zustand)
        api/                # httpClient, socketClient
    server/                 # 服务端 Fastify + Socket.IO
      src/
        http/               # authRoutes, adminRoutes (REST)
        socket/             # socketServer, gameSocketHandlers
        modules/
          auth/             # authService, password (bcrypt)
          users/            # userService, userRepository
          game/             # gameService, gameRoom, gameStateMapper (视角过滤)
          bots/             # botService (电脑玩家调度)
        db/                 # prisma client 单例
  packages/
    mahjong-core/           # 麻将规则引擎 + 电脑玩家算法
      src/
        tiles/              # tile.ts (牌定义), wall.ts (牌墙)
        rules/              # standardRule.ts, ruleConfig.ts, ruleEngine.ts
        game/               # gameState.ts, actions.ts, reducer.ts, visibility.ts, scoring.ts
        bots/               # basicBot.ts
    shared/                 # 前后端共享类型
      src/
        authTypes.ts        # 登录/注册 DTO
        userTypes.ts        # User, Role
        socketEvents.ts     # Socket.IO 事件名和 payload 类型
        gameTypes.ts        # 牌局视角状态类型
  prisma/
    schema.prisma           # User, GameRecord, GameEvent
  Documents/                # 设计文档（详见 README.md 索引）
```

### Data Flow

```
玩家点击"出牌"
  → 前端 emit("game:action", { type: "discard", tile })
  → 服务端 socket handler 接收
  → gameService.processAction()
    → mahjong-core.reducer(currentState, action, ruleConfig)
      → 校验合法性 → 返回新 GameState + GameEvent[]
  → gameStateMapper.buildPlayerViews(gameState)  // 为每个玩家生成视角
  → 向每个连接的玩家 emit("game:state", playerView)
  → 轮到电脑玩家时，botService 调用 basicBot，延迟 0.5-2s 后自动提交动作
```

核心原则：**所有数据变更经过 mahjong-core → 服务端视角过滤 → 前端只渲染自己收到的状态**。

### Real-time Protocol (Socket.IO)

| 客户端 → 服务端 | 服务端 → 客户端 |
|----------------|----------------|
| `game:join` | `game:state` (当前玩家视角) |
| `game:start` | `game:event` (摸牌/打牌/吃碰杠胡通知) |
| `game:action` (discard/chi/peng/gang/hu/pass) | `game:error` (非法操作提示) |
| `game:sync` (重连后请求完整视角) | `game:ended` (对局结束 + 结算) |

### Database (SQLite via Prisma)

初期只需 `User` 表：

```
User
  id          Int @id
  username    String @unique
  passwordHash String
  role        String   // "admin" | "player"
  createdAt   DateTime
  updatedAt   DateTime
```

`GameRecord` 和 `GameEvent` 表在第六阶段合并核心业务时加入，用于对局记录和回放。

## Cache Stability

- **Frequently-rebuilt files:** `dist/`, `node_modules/`, `pnpm-lock.yaml`, `*.db` — 这些是生成/安装产物，标记为 cache-churn
- **Stable scaffolding:** `AGENTS.md`, `Documents/*.md`, `prisma/schema.prisma`, `tsconfig*.json`, `package.json` — 保持 byte-stable
- **Append, don't reorder:** 新增依赖和模块追加到文件尾部；不要重排 import 顺序或重写已有段落

## Test Strategy

| 层级 | 工具 | 范围 |
|------|------|------|
| 单元测试 | Vitest | `mahjong-core` 全部公开 API |
| 集成测试 | Vitest + supertest | 服务端 HTTP API |
| 模拟对局 | Vitest + mahjong-core | 4 个 basicBot 自动跑完整局，验证流程不卡死 |
| E2E | Playwright (后续) | 浏览器端登录和对局流程 |

## Guidelines

- **mahjong-core 先行**：任何游戏规则变更先在核心包中实现并通过单元测试，再接入服务端
- **类型驱动开发**：前后端交互的类型定义放在 `packages/shared`，两边共同维护
- **视角安全**：永远不要在服务端向客户端发送完整牌局状态；每个玩家的视角必须在 `gameStateMapper` 中生成
- **电脑玩家走相同路径**：basicBot 提交的动作必须走和人类玩家相同的 `reducer` 校验，不允许特殊通道
- **日志先行**：服务端使用 `pino` 输出结构化日志，牌局关键事件同时写入 `GameEvent` 表
- **阶段验证**：每完成一个开发阶段，在 Ubuntu 虚拟机上验证服务可启动、浏览器可访问
