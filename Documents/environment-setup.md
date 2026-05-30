# Ubuntu 26.04 开发与部署环境依赖

本文记录当前 Ubuntu 26.04 虚拟机环境检查结果，并列出本项目后续开发、测试和本地部署需要安装或确认的依赖。

检查日期：2026-05-30

## 1. 当前环境检查结果

| 项目 | 当前状态 | 说明 |
|------|----------|------|
| 操作系统 | Ubuntu 26.04 LTS `resolute` | 符合本地 Linux 虚拟机测试目标 |
| 内核 | Linux 7.0.0-22-generic x86_64 | 正常 |
| Node.js | `v22.22.1` | 已安装，可用于当前 TypeScript/Fastify/Vite 技术栈 |
| npm | `9.2.0` | 已安装 |
| Corepack | `0.24.0` | 已安装，可用于启用 pnpm |
| pnpm | 未安装 | 需要启用或安装 |
| Git | `2.53.0` | 已安装 |
| curl | `8.18.0` | 已安装 |
| build-essential | `12.12ubuntu2` | 已安装 |
| gcc/g++ | `15.2.0` | 已安装 |
| make | `4.4.1` | 已安装 |
| Python | `3.14.4` | 已安装，可支持 Node 原生依赖编译 |
| OpenSSL | `3.5.5` | 已安装，Prisma 等工具可能依赖 |
| SQLite CLI | 未安装 | 建议安装，便于查看和调试 SQLite 数据库 |
| Docker | 未安装 | 初期不需要，后续容器化部署时再安装 |
| Nginx | 未安装 | 初期不需要，公网或反向代理部署时再安装 |
| Caddy | 未安装 | 初期不需要，可作为后续 HTTPS/反向代理选项 |

## 2. 必需依赖

当前项目计划使用：

```text
前端：React + TypeScript + Vite
服务端：Node.js + TypeScript + Fastify
实时通信：Socket.IO
数据库：SQLite
ORM：Prisma
包管理：pnpm workspace
测试：Vitest
```

因此当前环境至少需要：

- Node.js 22：已安装。
- pnpm：缺失，需要安装或通过 Corepack 启用。
- Git：已安装。
- curl：已安装。
- build-essential、gcc、g++、make、python3：已安装，用于编译 Node 原生依赖。
- OpenSSL：已安装，Prisma 和部分 Node 依赖可能需要。
- SQLite 命令行工具：缺失，建议安装。

## 3. 建议安装命令

先更新 apt 索引：

```bash
sudo apt update
```

安装系统级基础依赖：

```bash
sudo apt install -y \
  ca-certificates \
  curl \
  git \
  build-essential \
  python3 \
  openssl \
  sqlite3
```

启用 pnpm：

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

说明：

- 当前 Node.js 已包含 Corepack，优先通过 Corepack 管理 pnpm。
- 阶段 0 创建 `package.json` 时，建议增加 `packageManager` 字段固定 pnpm 版本，避免不同机器使用不同 pnpm 版本。

## 4. 项目依赖安装方式

阶段 0 脚手架完成后，在项目根目录执行：

```bash
pnpm install
```

后续预期命令：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm -F mahjong-core test
pnpm dev
```

这些脚本应在阶段 0 的根目录 `package.json` 中创建。

## 5. 数据库依赖

初期使用 SQLite + Prisma。

推荐目录：

```text
data/dev.db
prisma/schema.prisma
```

需要注意：

- `sqlite3` 命令行工具不是 Prisma 运行 SQLite 的唯一前提，但安装后便于本地查看、备份和排查数据库。
- SQLite 数据库文件、journal 文件和迁移生成产物不应手工编辑。
- 后续如果迁移 PostgreSQL，再单独安装 PostgreSQL 或使用 Docker Compose。

## 6. 本地开发端口

按当前架构设计，默认端口为：

| 服务 | 地址 |
|------|------|
| Web 前端 | `http://localhost:5173` |
| Server 后端 | `http://localhost:3000` |
| 健康检查 | `http://localhost:3000/health` |

如果从宿主机浏览器访问 Ubuntu 虚拟机，需要确认：

- Fastify 监听地址使用 `0.0.0.0`，不能只监听 `127.0.0.1`。
- 虚拟机网络模式允许宿主机访问虚拟机 IP。
- 如启用防火墙，需要放行 `3000` 和开发阶段可能使用的 `5173`。

防火墙放行命令示例：

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 5173/tcp
sudo ufw status
```

## 7. 可选依赖

以下依赖初期不要求安装：

| 依赖 | 何时需要 |
|------|----------|
| Docker / Docker Compose | 后续需要容器化部署、PostgreSQL、Nginx/Caddy 组合部署时 |
| Nginx | 后续需要公网反向代理、静态资源代理或域名接入时 |
| Caddy | 后续需要简化 HTTPS 和反向代理配置时 |
| PostgreSQL | SQLite 不再满足长期运行、并发写入、统计查询或备份恢复要求时 |
| PM2 或 systemd 服务配置 | 后续需要后台常驻运行 Node.js 服务时 |

## 8. 验证命令

安装或启用依赖后，可执行以下命令确认环境：

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

阶段 0 完成后，再执行：

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

## 9. 当前缺口总结

当前虚拟机已经具备大部分开发基础，主要缺口是：

1. 启用或安装 pnpm。
2. 安装 SQLite 命令行工具 `sqlite3`。
3. 后续服务端启动时确认监听 `0.0.0.0`，以便宿主机访问 Ubuntu 虚拟机。
4. 如开启防火墙，需要放行 `3000/tcp` 和开发阶段的 `5173/tcp`。

