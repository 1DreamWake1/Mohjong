# Ubuntu 26.04 开发与部署环境依赖

本文列出在线麻将项目在 Ubuntu 26.04 环境中开发、测试和本地部署需要准备的系统包、运行时、工具和可选组件。

## 1. 技术栈依赖

项目当前技术栈：

```text
前端：React + TypeScript + Vite
服务端：Node.js + TypeScript + Fastify
实时通信：Socket.IO
数据库：SQLite
ORM：Prisma
包管理：pnpm workspace
测试：Vitest
密码哈希：bcrypt
日志：pino
```

## 2. 必需系统依赖

Ubuntu 环境需要准备以下系统包：

| 依赖              | 用途                                                    |
| ----------------- | ------------------------------------------------------- |
| `ca-certificates` | HTTPS 证书信任链，供包管理器和 Node 工具访问 HTTPS 资源 |
| `curl`            | 调试 HTTP API、健康检查和下载工具                       |
| `git`             | 版本管理                                                |
| `build-essential` | 提供 gcc、g++、make 等编译工具                          |
| `python3`         | 支持部分 Node 原生依赖编译                              |
| `openssl`         | Prisma、Node TLS 和部分依赖需要                         |
| `sqlite3`         | 查看、调试和维护本地 SQLite 数据库                      |

安装命令：

```bash
sudo apt update
sudo apt install -y \
  ca-certificates \
  curl \
  git \
  build-essential \
  python3 \
  openssl \
  sqlite3
```

## 3. Node.js 与 pnpm

项目需要 Node.js、Corepack 和 pnpm。

推荐要求：

| 工具     | 建议版本                           | 说明                               |
| -------- | ---------------------------------- | ---------------------------------- |
| Node.js  | 22 LTS 或更新的稳定 LTS            | 运行 Vite、Fastify、Prisma、Vitest |
| Corepack | 随 Node.js 安装                    | 管理 pnpm 版本                     |
| pnpm     | 以根目录 `packageManager` 字段为准 | 管理 monorepo workspace 依赖       |

启用 pnpm：

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

项目根目录已有 `packageManager` 字段时，应优先使用该字段指定的 pnpm 版本。

## 4. 项目依赖安装

在项目根目录安装 Node 依赖：

```bash
pnpm install
```

常用开发命令：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm -F mahjong-core test
pnpm -F server test
pnpm dev
```

如果 pnpm 提示依赖构建脚本需要审批，按提示执行：

```bash
pnpm approve-builds
```

只批准项目实际使用且可信的依赖构建脚本，例如 Prisma、bcrypt、esbuild 等。

## 5. 数据库依赖

初期数据库使用 SQLite + Prisma。

相关路径：

```text
prisma/schema.prisma
prisma/migrations/
data/dev.db
```

需要的工具：

| 工具          | 用途                             |
| ------------- | -------------------------------- |
| Prisma CLI    | 生成 Prisma Client、执行迁移     |
| SQLite        | 本地开发数据库                   |
| `sqlite3` CLI | 查看数据、排查迁移和调试账号数据 |

常用命令：

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm -F server seed:admin
```

SQLite 数据库文件、journal 文件、Prisma 生成文件不应手工编辑。

## 6. 本地开发端口

默认端口：

| 服务        | 地址                           |
| ----------- | ------------------------------ |
| Web 前端    | `http://localhost:5173`        |
| Server 后端 | `http://localhost:3000`        |
| 健康检查    | `http://localhost:3000/health` |

在虚拟机中开发并从宿主机浏览器访问时，需要：

- 后端监听 `0.0.0.0`。
- Vite dev server 允许局域网访问。
- 虚拟机网络模式允许宿主机访问虚拟机 IP。
- 如启用防火墙，放行 `3000/tcp` 和 `5173/tcp`。

防火墙命令示例：

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 5173/tcp
sudo ufw status
```

## 7. 可选部署依赖

以下组件不是本地开发必需项，按部署方式选择：

| 依赖                    | 何时需要                                                     |
| ----------------------- | ------------------------------------------------------------ |
| Docker / Docker Compose | 容器化部署、统一运行环境、后续引入 PostgreSQL 或反向代理组合 |
| Nginx                   | 公网反向代理、静态资源代理、域名接入                         |
| Caddy                   | 简化 HTTPS 证书和反向代理配置                                |
| PostgreSQL              | SQLite 无法满足长期运行、并发写入、统计查询或备份恢复需求时  |
| PM2                     | 简化 Node.js 进程守护和日志管理                              |
| systemd 服务配置        | 生产或长期运行环境中托管 server 进程                         |

## 8. 环境验证命令

安装依赖后可用以下命令确认工具可用：

```bash
node --version
npm --version
corepack --version
pnpm --version
git --version
sqlite3 --version
gcc --version
g++ --version
make --version
python3 --version
openssl version
```

项目级验证：

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
