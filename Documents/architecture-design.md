# 在线麻将架构设计文档

## 1. 架构目标

本系统初期目标是支持小规模在线麻将测试，最多 4 个在线人类玩家，并支持电脑玩家补位。架构设计需要保证当前实现简单可落地，同时为后续扩展地方麻将规则、Linux 部署、数据库升级和公网访问保留空间。

核心目标：

- 本地开发简单。
- Ubuntu 虚拟机可部署测试。
- 规则算法可独立验证。
- 前端和服务端职责清晰。
- 玩家视角数据不泄漏。
- 后续可扩展四川麻将、禁用“吃”等地方规则。

## 2. 总体架构

初期采用单体应用架构：

```text
浏览器客户端
  |
  | HTTP API + Socket.IO
  |
Node.js 服务端
  |
  | 调用
  |
麻将核心算法包 mahjong-core
  |
  | 读写
  |
SQLite 数据库
```

本阶段不采用微服务、消息队列、Redis、Kubernetes 或复杂网关。

## 3. 模块划分

```text
Mohjong/
  apps/
    web/                 # 前端浏览器应用
    server/              # 服务端应用
  packages/
    mahjong-core/        # 麻将规则与电脑玩家算法
    shared/              # 前后端共享类型
  prisma/
    schema.prisma        # 数据库模型
  Documents/
```

## 4. 前端架构

前端负责：

- 登录页面展示。
- 管理员账号管理页面展示。
- 麻将桌面展示。
- 当前玩家手牌展示。
- 操作按钮展示。
- 向服务端提交玩家操作。
- 接收服务端推送的牌局状态。

前端不负责：

- 最终判断动作是否合法。
- 判断是否胡牌。
- 计算最终结算。
- 保存完整牌局真实状态。
- 获取其他真实玩家手牌。

前端主要页面：

- 登录页。
- 管理员玩家账号管理页。
- 玩家游戏入口页。
- 麻将游戏页。

前端麻将页面主要组件：

- 牌桌组件。
- 当前玩家手牌组件。
- 其他玩家区域组件。
- 弃牌区组件。
- 操作按钮组件。
- 对局提示组件。

## 5. 服务端架构

服务端负责：

- 用户登录认证。
- 管理员账号管理。
- 玩家账号数据库读写。
- 当前游戏实例管理。
- 接收玩家操作。
- 调用麻将核心算法校验操作。
- 调度电脑玩家动作。
- 生成每个玩家对应的视角状态。
- 通过 Socket.IO 推送状态。

服务端主要模块：

```text
auth       # 登录、鉴权、密码哈希
users      # 玩家账号管理
game       # 游戏实例、座位、状态同步
bots       # 电脑玩家调度
socket     # 实时通信事件
db         # 数据库访问
```

## 6. 麻将核心算法架构

麻将核心算法独立为 `packages/mahjong-core`。

该模块负责：

- 牌定义。
- 洗牌。
- 发牌。
- 摸牌。
- 打牌。
- 吃、碰、杠、胡、过。
- 回合推进。
- 胜负判断。
- 基础结算。
- 电脑玩家基础策略。

该模块不依赖：

- React。
- Fastify。
- Socket.IO。
- Prisma。
- SQLite。

推荐设计方式：

```text
输入：当前牌局状态 + 玩家动作 + 规则配置
输出：新牌局状态 + 产生的游戏事件
```

这样可以在第一阶段通过单元测试和命令行模拟独立验证算法。

## 7. 规则扩展架构

为支持后续地方规则，规则不应写死。

建议定义规则配置：

```text
RuleConfig
  name
  allowChi
  allowPeng
  allowGang
  useWinds
  useDragons
  scoringMode
```

标准麻将：

- 允许吃。
- 允许碰。
- 允许杠。
- 使用风牌。
- 使用箭牌。
- 使用标准计分。

禁用“吃”：

- 在标准规则基础上设置 `allowChi = false`。

四川麻将：

- 后续增加独立规则配置。
- 后续增加独立胡牌限制和计分模块。

## 8. 数据架构

初期使用 SQLite。

第一阶段账号相关至少需要：

```text
User
  id
  username
  passwordHash
  role
  createdAt
  updatedAt
```

后续接入完整游戏后可增加：

```text
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

当前牌局运行状态初期可以保存在服务端内存中。需要调试和回放时，再通过 `GameEvent` 记录关键事件。

## 9. 实时通信架构

HTTP API 用于：

- 登录。
- 登出。
- 获取当前用户。
- 管理员创建玩家。
- 管理员删除玩家。
- 获取玩家列表。

Socket.IO 用于：

- 进入游戏。
- 开始游戏。
- 提交玩家动作。
- 同步牌局状态。
- 推送错误提示。
- 推送游戏结束。

事件初稿：

```text
客户端发送：
  game:join
  game:start
  game:action
  game:sync

服务端发送：
  game:state
  game:event
  game:error
  game:ended
```

## 10. 玩家视角隔离

服务端必须按玩家生成视角状态。

玩家 A 可以看到：

- A 的完整手牌。
- 其他玩家手牌数量。
- 所有公开弃牌。
- 所有公开吃、碰、杠组合。
- 当前轮到谁操作。
- A 当前可执行动作。

玩家 A 不能看到：

- 其他真实玩家的完整手牌。
- 其他玩家未公开的决策信息。

前端不能接收完整牌局状态后自行过滤。过滤必须在服务端完成。

## 11. 本地开发架构

```text
开发电脑
  |
  | pnpm dev
  |
  |-- web     http://localhost:5173
  |-- server  http://localhost:3000
  |-- db      ./data/dev.db
```

前端开发服务器可以代理 API 和 Socket.IO 请求到后端。

## 12. Ubuntu 虚拟机测试架构

第二阶段只验证基础服务器：

```text
宿主机浏览器
  |
  | http://Ubuntu虚拟机IP:3000
  |
Ubuntu 虚拟机 Node.js 服务
```

后续业务合并后：

```text
宿主机或手机浏览器
  |
  | http://Ubuntu虚拟机IP:3000
  |
Ubuntu 虚拟机
  |
  | Node.js + Fastify + Socket.IO
  |
SQLite 数据库文件
```

## 13. 后续扩展架构

当本地测试稳定后，可以逐步扩展：

- SQLite 迁移到 PostgreSQL。
- Node.js 直接运行迁移到 Docker Compose。
- 增加 Nginx 或 Caddy。
- 增加 HTTPS。
- 增加域名。
- 增加对局记录和回放。
- 增加更多地方规则。
- 增加简单监控和日志。

## 14. 架构约束

关键约束：

- 规则算法必须独立。
- 服务端必须裁决所有游戏动作。
- 前端不能保存或推导完整真实牌局。
- 玩家账号只能由管理员创建。
- 初期不做高并发架构。
- 初期不做公网正式部署架构。

