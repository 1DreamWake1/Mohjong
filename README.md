# 在线麻将

一个基于 TypeScript 的在线麻将项目，当前目标是在本地和 Ubuntu 虚拟机环境中完成标准麻将玩法验证、账号管理、玩家入口、麻将桌前端展示和完整对局闭环。

## 当前状态

阶段 0-17、18A 容器化与统一入口、18B 健康检查与进程生命周期、18C SQLite 备份与恢复回滚、18D 生产配置与安全基线已完成。当前开发阶段 18E：自动化验收与运行手册。

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
就绪检查：http://localhost:3000/ready
```

默认本地管理员账号：

```text
用户名：admin
密码：admin123
```

部署或共享环境中应通过 `.env` 修改管理员密码和 `AUTH_TOKEN_SECRET`。

## Docker Compose 启动

准备部署配置并将 `AUTH_TOKEN_SECRET` 修改为足够长的随机值：

```bash
cp .env.example .env
docker compose up -d --build
```

默认统一入口为 `http://localhost:8080/`，Web、HTTP API 和 Socket.IO 均使用该地址。SQLite 数据保存在 `mahjong-data` 命名卷中，备份保存在 `mahjong-backups` 命名卷中，Server 启动时会先执行待应用的 Prisma 迁移（迁移前自动创建一致性备份）。Compose 使用真实 HTTP 探针判断服务状态，Server 完成牌局恢复且数据库可访问后才会就绪；收到 `SIGTERM` 或 `SIGINT` 时会停止新任务、等待持久化队列并释放数据库连接。

完整的配置、管理员初始化、升级、数据卷和故障排查说明见 [Docker Compose 部署手册](./Documents/deployment.md)。

查看状态和日志：

```bash
docker compose ps
docker compose logs -f
```

## 常用命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm -F mahjong-core test
pnpm -F server test
pnpm -F web build
pnpm -F server db:backup create   # 手动创建 SQLite 一致性备份
```

## 文档入口

详细文档从 [Documents/README.md](./Documents/README.md) 开始阅读。

重点文档：

- [需求文档](./Documents/requirements.md)
- [架构设计](./Documents/architecture-design.md)
- [开发计划](./Documents/development-plan.md)
- [环境准备](./Documents/environment-setup.md)
- [部署手册](./Documents/deployment.md)
