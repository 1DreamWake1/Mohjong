# 环境准备

本项目支持两种运行方式：Node.js 本地开发和 Docker Compose 部署。生产式运行优先使用 Docker，主机无需安装 Node.js、pnpm 或 SQLite CLI。

## 1. 本地开发环境

推荐 Ubuntu 24.04/26.04、Node.js 22 LTS 和仓库 `packageManager` 指定的 pnpm 版本。

```bash
sudo apt update
sudo apt install -y ca-certificates curl git build-essential python3 openssl sqlite3

corepack enable
corepack prepare pnpm@10.18.3 --activate
```

验证版本：

```bash
node --version
pnpm --version
git --version
sqlite3 --version
```

安装与初始化：

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm -F server seed:admin
```

启动开发服务：

```bash
pnpm dev
```

| 服务     | 默认地址                       |
| -------- | ------------------------------ |
| Web      | `http://localhost:5173`        |
| API      | `http://localhost:3000`        |
| 存活检查 | `http://localhost:3000/health` |
| 就绪检查 | `http://localhost:3000/ready`  |

从虚拟机宿主机访问时，确认 Vite 和 Server 监听 `0.0.0.0`，并按需开放 `5173/tcp` 和 `3000/tcp`。

## 2. Docker 部署环境

主机只需：

- 64 位 Linux。
- Git。
- Docker Engine 及 Compose v2 插件。
- 能拉取基础镜像的网络。
- 足够保存镜像和 SQLite 数据卷的磁盘空间。

验证：

```bash
docker --version
docker compose version
docker info
docker run --rm hello-world
```

普通用户运行 Docker 时，需要加入 `docker` 组并重新登录：

```bash
sudo usermod -aG docker "$USER"
```

`docker` 组等同于主机高权限，只应授予可信用户。完整启动步骤见 [deployment.md](./deployment.md)。

## 3. 开发验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

数据库、journal、日志、备份、`.env`、`node_modules` 和 `dist` 不应提交 Git，也不应手工编辑 Prisma 生成文件。
