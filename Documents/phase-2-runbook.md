# 第二阶段运行手册

本文记录第二阶段账号管理闭环的本地开发和 Ubuntu 虚拟机验证步骤。

## 1. 环境变量

项目根目录提供 `.env.example`。本地开发可复制为 `.env`：

```bash
cp .env.example .env
```

关键变量：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Prisma SQLite 地址，默认使用 `file:../data/dev.db` |
| `HOST` | 服务端监听地址，虚拟机访问使用 `0.0.0.0` |
| `PORT` | 服务端端口，默认 `3000` |
| `AUTH_TOKEN_SECRET` | 登录 token 签名密钥，本地可使用示例值，部署时必须替换 |
| `ADMIN_USERNAME` | 初始化管理员用户名 |
| `ADMIN_PASSWORD` | 初始化管理员密码，至少 6 位 |

说明：

- SQLite 文件保存在根目录 `data/dev.db`，该目录不提交到 Git。
- 服务端启动和管理员初始化脚本会从当前目录向上查找 `.env`，因此推荐把 `.env` 放在项目根目录。没有 `.env` 时会使用开发默认值；Prisma CLI 初始化数据库时建议使用根目录脚本。

## 2. 初始化数据库

安装依赖后执行：

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
```

`pnpm prisma:migrate` 会创建 `data/` 目录，并把当前迁移应用到 `data/dev.db`。

## 3. 初始化管理员

执行：

```bash
pnpm -F server seed:admin
```

默认本地管理员为：

```text
用户名：admin
密码：admin123
```

如果 `.env` 中配置了 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，脚本会使用配置值，并在重复执行时更新该管理员密码。

## 4. 启动开发服务

执行：

```bash
pnpm dev
```

默认地址：

| 服务 | 地址 |
|------|------|
| 前端 | `http://localhost:5173/` |
| 后端 | `http://localhost:3000/` |
| 健康检查 | `http://localhost:3000/health` |

Ubuntu 虚拟机中可通过 Vite 输出的 Network 地址访问，例如：

```text
http://192.168.x.x:5173/
```

前端会自动请求同一台虚拟机的 `3000` 端口后端。

如果需要显式指定前端请求地址，可在启动前设置：

```bash
VITE_API_BASE_URL="http://192.168.x.x:3000" pnpm -F web dev
```

## 5. 浏览器验证

1. 打开前端页面。
2. 使用管理员账号登录。
3. 在玩家账号管理页面创建玩家账号。
4. 刷新页面，确认登录态恢复且玩家列表仍存在。
5. 删除玩家账号，确认列表更新。
6. 使用玩家账号登录，确认进入玩家入口占位页，不能访问管理员管理接口。

## 6. 命令验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

接口冒烟验证：

```bash
curl --noproxy '*' http://127.0.0.1:3000/health
```

如当前 shell 配置了代理，访问本机服务时建议加 `--noproxy '*'`。
