# 在线麻将架构设计

## 1. 架构结论

系统采用 TypeScript monorepo 和单体部署：React Web 通过 HTTP 与 Socket.IO 连接 Fastify Server，Server 调用独立麻将核心包并使用 Prisma 写入 SQLite。生产式运行由 Docker Compose 编排，Nginx 提供统一入口。

```text
Browser
  |
  | HTTP / Socket.IO
  v
Nginx (web:8080)
  |-- static assets
  `-- API + /socket.io -> Fastify server:3000
                           |-- room and lifecycle services
                           |-- mahjong-core
                           `-- Prisma -> SQLite volume
```

当前只支持一个 Server 实例。房间、连接、Bot 和计时器均包含进程内状态，不能通过复制 Server 容器水平扩容。

## 2. 技术栈

| 层       | 技术                              |
| -------- | --------------------------------- |
| Web      | React、Vite、Zustand、CSS Modules |
| Server   | Node.js、Fastify、Socket.IO、pino |
| 核心规则 | 独立 TypeScript 包 `mahjong-core` |
| 共享契约 | TypeScript 包 `shared`            |
| 数据     | SQLite、Prisma                    |
| 测试     | Vitest                            |
| 部署     | Docker Compose、Nginx             |

## 3. 仓库结构

```text
apps/web/                 React 页面、状态、HTTP 和 Socket 客户端
apps/server/              HTTP、Socket、账号、房间、恢复和持久化
packages/mahjong-core/    牌、规则、reducer、胡牌、计分和 Bot
packages/shared/          前后端共享 DTO 与事件类型
prisma/                   schema 和迁移
Documents/                当前有效文档
```

依赖方向必须保持：

```text
web -> shared
server -> shared + mahjong-core
mahjong-core -> 不依赖 Web、Server、Prisma 或 Socket.IO
```

## 4. 服务端边界

### HTTP

- 账号登录和当前用户。
- 玩家房间大厅与历史记录。
- 管理员账号、对局和运行诊断。
- `/health` 只判断进程存活。
- `/ready` 判断恢复初始化完成且数据库可访问。

### Socket.IO

- 鉴权、加入房间和连接状态维护。
- 玩家动作提交与服务端合法性校验。
- 按玩家生成脱敏视角并广播。
- 断线宽限、Bot 接管和倒计时调度。

### 房间与恢复

- 内存房间是实时对局的工作状态。
- 每次关键事件串行写入对局事件和恢复快照。
- 启动时恢复未结束房间，完成后才进入 ready。
- 定时清理过期等待房间和已结束房间，不按时间清理进行中牌局。

## 5. 核心规则边界

`mahjong-core` 负责牌墙、发牌、摸打、合法动作、弃牌响应、胡牌、番型、计分和 Bot 决策。它通过显式类型接收状态与规则配置，不访问数据库、网络或系统时钟。

规则配置分为稳定预设和版本号。历史记录及恢复快照保存规则标识与版本，旧数据通过兼容逻辑补齐默认配置。

## 6. 玩家视角与安全

服务端内部状态不能直接发送给客户端。视角映射遵循以下规则：

- 当前玩家获得自己的完整手牌和合法动作。
- 其他玩家只暴露手牌数量、公开副露、弃牌和连接状态。
- Bot 决策不得借用其他玩家隐藏手牌。
- 历史事件保存面向参与玩家的脱敏快照。
- HTTP、Socket.IO 和历史查询分别执行身份与资源权限校验。

## 7. 数据模型

主要持久化实体：

- `User`：账号、角色和密码哈希。
- `GameRecord`：房间轮次、参与者、规则、状态和结算。
- `GameEvent`：有序事件、事件文本和脱敏快照。
- `ActiveGameSnapshot`：进行中房间的完整恢复状态。

SQLite 文件必须位于持久化目录。迁移通过 Prisma migration 管理，禁止手工修改数据库或生成文件。

## 8. 生命周期

启动顺序：

1. Docker entrypoint 执行 `prisma migrate deploy`。
2. Server 创建服务并恢复进行中房间。
3. 数据库检查成功后 `/ready` 返回 200。
4. Compose 判定 Server healthy 后启动 Web。

停机顺序：

1. 收到 `SIGTERM` 或 `SIGINT` 后进入 stopping。
2. 停止新 Bot 动作、托管任务和房间清理任务。
3. 关闭 Socket.IO 和 HTTP。
4. 等待已排队持久化写入完成。
5. 断开 Prisma；超过最大等待时间则记录错误并非零退出。

## 9. 扩展约束

- 新规则通过规则配置和独立规则模块扩展，不在 UI 或 Socket handler 中写规则分支。
- 新共享字段先定义在 `packages/shared`，服务端映射后再由前端使用。
- SQLite 适合当前单实例；持续高写入、多实例或更强在线备份要求出现时迁移 PostgreSQL。
- 多实例需要外置房间状态、Redis Adapter、分布式锁和跨节点计时调度，不属于当前架构。
