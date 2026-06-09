# 在线麻将

一个基于 TypeScript 的在线麻将项目，当前目标是在本地和 Ubuntu 虚拟机环境中完成标准麻将玩法验证、账号管理、玩家入口、麻将桌前端展示和完整对局闭环。

## 当前状态

已完成项目初始化、麻将核心规则验证、账号管理闭环、登录和管理员页面、玩家大厅、前端路由保护、登录态恢复、麻将游戏前端牌桌，以及基于 Socket.IO 的快速对局闭环。

当前开发重点：阶段 5 已完成，下一步进入地方规则、长期运行能力和体验细节增强。

## 技术栈

```text
前端：React + TypeScript + Vite + CSS Modules + Zustand
服务端：Node.js + TypeScript + Fastify + pino
实时通信：Socket.IO
数据库：SQLite
ORM：Prisma
核心算法：独立 TypeScript 包 packages/mahjong-core
测试：Vitest
包管理：pnpm workspace
```

## 目录结构

```text
apps/
  web/              # React 前端
  server/           # Fastify 服务端
packages/
  mahjong-core/     # 麻将规则、牌局状态和电脑玩家算法
  shared/           # 前后端共享类型
prisma/             # Prisma schema 和迁移
Documents/          # 需求、架构、计划和运行文档
data/               # 本地 SQLite 数据库目录，不提交 Git
```

## 本地启动

安装依赖：

```bash
pnpm install
```

初始化数据库和管理员账号：

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm -F server seed:admin
```

启动开发服务：

```bash
pnpm dev
```

默认访问地址：

```text
前端：http://localhost:5173/
后端：http://localhost:3000/
健康检查：http://localhost:3000/health
```

默认本地管理员账号：

```text
用户名：admin
密码：admin123
```

部署或共享环境中应通过 `.env` 修改管理员密码和 `AUTH_TOKEN_SECRET`。

## 常用命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm -F mahjong-core test
pnpm -F server test
pnpm -F web build
```

## 文档入口

详细文档从 [Documents/README.md](./Documents/README.md) 开始阅读。

重点文档：

- [需求文档](./Documents/requirements.md)
- [架构设计](./Documents/architecture-design.md)
- [技术架构](./Documents/technical-architecture.md)
- [开发计划](./Documents/development-plan.md)
- [环境依赖](./Documents/environment-setup.md)
- [第二阶段运行手册](./Documents/phase-2-runbook.md)
