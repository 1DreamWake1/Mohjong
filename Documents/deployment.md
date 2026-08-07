# Docker Compose 部署手册

本文适用于当前单 Server、SQLite 和 Docker Compose 架构，也包含正式 HTTPS 和公网安全基线。

## 1. 部署边界

- `web` 容器运行 Nginx，对外提供统一入口。
- `server` 容器运行 Fastify、Socket.IO 和 Prisma。
- SQLite 位于 Docker 命名卷 `mahjong-data`，备份位于 `mahjong-backups`，均不随容器删除。
- Server 不发布宿主机端口，只能由 Web 容器访问。
- 默认 SQLite 模式不支持多个 Server 副本；使用 PostgreSQL + Redis 扩展配置后支持多实例广播和动作锁。
- `NODE_ENV=production` 时 Server 强制校验 `AUTH_TOKEN_SECRET`（≥32 字符）和 `DATABASE_URL`，不合规直接拒绝启动。

### 会话 Cookie 与公网安全

- 登录会话使用 `HttpOnly`、`SameSite=Lax` Cookie，前端请求携带 `credentials: include`，令牌不会写入 `localStorage`。
- 生产环境默认启用 `Secure` Cookie；本地纯 HTTP 调试时可设置 `AUTH_COOKIE_SECURE=0`。
- 反向代理部署保持 `TRUST_PROXY=1`，并将 `CORS_ORIGIN` 限制为实际前端来源。
- 公网防火墙只开放 80/443，`AUTH_TOKEN_SECRET` 必须使用随机高强度值。

### PostgreSQL、Redis 与多实例扩展

默认 Compose 仍使用 SQLite，适合单 Server 实例。仓库同时提供 `prisma/schema.postgresql.prisma`、PostgreSQL/Redis Compose 服务和 Socket.IO Redis 适配器。

```bash
POSTGRES_PASSWORD='change-this-password' \
DATABASE_URL='postgresql://mahjong:change-this-password@postgres:5432/mahjong' \
REDIS_URL='redis://redis:6379' \
docker compose --profile scale up -d --build
```

PostgreSQL 扩展部署使用 `prisma db push` 同步当前 schema，不使用 SQLite migration 目录。构建 Server 镜像时指定 PostgreSQL Prisma schema：

```bash
docker build --build-arg PRISMA_SCHEMA=prisma/schema.postgresql.prisma \
  -f apps/server/Dockerfile -t mahjong-server:postgres .
```

多实例必须共用 PostgreSQL 和 Redis，并设置相同的 `REDIS_URL`。Redis 负责 Socket.IO 跨实例广播和房间动作锁；房间恢复仍以数据库 recovery snapshot 为准。SQLite 备份脚本只适用于 SQLite，PostgreSQL 应使用 `pg_dump` 或云数据库备份。

## 2. 准备配置

在仓库根目录执行：

```bash
cp .env.example .env
openssl rand -hex 32
```

将生成值写入 `.env` 的 `AUTH_TOKEN_SECRET`，并检查：

```dotenv
AUTH_TOKEN_SECRET="替换为随机密钥"
WEB_PORT="8080"
SHUTDOWN_TIMEOUT_MS="10000"
BACKUP_KEEP="5"
BACKUP_ON_BOOT="1"
AUTH_COOKIE_NAME="mahjong_session"
AUTH_COOKIE_SECURE="1"
TRUST_PROXY="1"
```

说明：

- Compose 会覆盖容器内的 `DATABASE_URL`、`HOST` 和 `PORT`。
- `WEB_PORT` 是宿主机入口端口，可改为未占用端口。
- `SHUTDOWN_TIMEOUT_MS` 应小于 Compose 的 15 秒 Server 停机宽限期。
- `BACKUP_KEEP` 为备份保留数量，`BACKUP_ON_BOOT` 控制在启动迁移前是否自动备份（默认开启）。
- `.env` 包含密钥，不得提交 Git。

## 2.1 正式 HTTPS

将证书链和私钥放入未提交的目录：

```text
deploy/tls/fullchain.pem
deploy/tls/privkey.pem
```

容器内部监听 8080/8443，由宿主机映射到标准 80/443；HTTP 会自动跳转 HTTPS。

```bash
docker compose -f compose.yaml -f compose.https.yaml config --quiet
docker compose -f compose.yaml -f compose.https.yaml up -d --build --wait
curl --fail https://your-domain.example/health
```

证书应由 ACME 客户端定期续期，续期后重启 `web` 容器加载新证书。私钥不得提交 Git。

## 3. 构建并启动

```bash
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
```

Server entrypoint 会在应用启动前执行 `prisma migrate deploy`。迁移失败时 Server 不会进入 healthy，Web 也不会启动服务。

默认访问：

```text
应用：http://localhost:8080/
存活：http://localhost:8080/health
就绪：http://localhost:8080/ready
```

验证：

```bash
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/ready
```

预期响应：

```json
{"status":"ok"}
{"status":"ready"}
```

`/health` 表示进程存活；`/ready` 还要求房间恢复完成且数据库可访问。部署流量应以 readiness 为准。

## 4. 管理员初始化

当前 Compose 不自动执行管理员 seed。首次部署可在 Server 容器中显式执行：

```bash
docker compose exec \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD='替换为高强度密码' \
  server node ./apps/server/dist/scripts/seedAdmin.js
```

执行前请确认构建产物中的 seed 脚本路径。阶段 18D 将进一步收紧初始密码和生产配置校验。

## 5. 日常操作

查看状态和健康信息：

```bash
docker compose ps
docker inspect --format '{{json .State.Health}}' mohjong-server-1
```

查看日志：

```bash
docker compose logs --tail 200
docker compose logs -f server
docker compose logs -f web
```

重启：

```bash
docker compose restart
docker compose up -d --wait
```

停止并保留数据：

```bash
docker compose down
```

Server 收到 `SIGTERM` 后停止计时器和 Socket.IO，等待持久化队列并断开 Prisma。不要使用 `docker kill --signal=SIGKILL` 作为常规停机方式。

## 6. 数据卷

查看数据卷：

```bash
docker volume ls
docker volume inspect mohjong_mahjong-data
docker volume inspect mohjong_mahjong-backups
```

`docker compose down` 会保留命名卷。以下命令会永久删除数据库和备份，禁止在正常升级或停机时使用：

```bash
docker compose down --volumes
```

## 7. SQLite 备份

Server 容器内置 `dbbackup` 命令，使用 SQLite `VACUUM INTO` 生成一致性备份，不直接复制活动数据库文件。备份文件与元数据（时间、应用版本、migration 列表）保存在 `mahjong-backups` 卷。

### 手动创建备份

```bash
docker compose exec server node ./apps/server/dist/scripts/dbbackup.js create
```

输出示例：

```text
备份完成: /app/backups/mahjong-20260805T103000123-v0.1.0.sqlite
应用版本: 0.1.0
migrations: 5 个
```

备份命名规则为 `mahjong-<UTC时间戳>-v<应用版本>.sqlite`，同目录生成同名 `.json` 元数据文件。默认保留最近 5 份，更旧的自动清理，可通过 `BACKUP_KEEP` 调整。

### 列出备份

```bash
docker compose exec server node ./apps/server/dist/scripts/dbbackup.js list
```

### 校验备份

```bash
docker compose exec server node ./apps/server/dist/scripts/dbbackup.js verify mahjong-20260805T103000123-v0.1.0.sqlite
```

校验会执行 `PRAGMA integrity_check` 并读取 migration 列表，完整性异常时返回非零退出码。

## 8. 恢复与升级回滚

### 恢复前准备

恢复会覆盖活动数据库，请先停止 Server 避免写入冲突，并确认备份文件存在：

```bash
docker compose stop server
docker compose exec server node ./apps/server/dist/scripts/dbbackup.js list
```

### 执行恢复

```bash
docker compose exec server node ./apps/server/dist/scripts/dbbackup.js restore mahjong-20260805T103000123-v0.1.0.sqlite
```

恢复流程：

1. 恢复前对备份执行完整性检查，异常时中止。
2. 将当前数据库改名为 `mahjong.db.pre-restore-<时间戳>` 保留现场。
3. 将备份复制为活动数据库。

恢复后启动 Server：

```bash
docker compose start server
docker compose up -d --wait
curl --fail http://127.0.0.1:8080/ready
```

确认就绪后，检查关键数据可查询；确认无误后可删除保留的 `mahjong.db.pre-restore-*` 文件。

### 升级流程

Server 启动时（docker-entrypoint.sh）默认在迁移前自动创建一致性备份，可通过 `BACKUP_ON_BOOT=0` 关闭。推荐升级步骤：

```bash
git pull --ff-only
docker compose build
docker compose up -d --wait
docker compose ps
curl --fail http://127.0.0.1:8080/ready
```

升级前自动备份位于 `mahjong-backups` 卷，即使迁移失败也能用旧镜像回滚。

### 失败回滚

1. 停止 Server：

```bash
docker compose stop server
```

2. 列出升级前备份并恢复（恢复流程见上文）：

```bash
docker compose exec server node ./apps/server/dist/scripts/dbbackup.js list
docker compose exec server node ./apps/server/dist/scripts/dbbackup.js restore <备份文件名>
```

3. 回到旧版本镜像并启动：

```bash
git checkout <上一个提交或标签>
docker compose build
docker compose up -d --wait
curl --fail http://127.0.0.1:8080/ready
```

4. 确认恢复后的账号、历史、事件和恢复快照可查询。

### 数据卷演练

使用全新数据卷完成一次演练：

```bash
docker compose down
docker volume rm mohjong_mahjong-data mohjong_mahjong-backups
docker compose up -d --build --wait
```

首次启动没有数据库时自动备份会跳过。创建账号和若干对局后，执行手动备份、校验和恢复，确认关键数据完整。

## 9. 故障排查

### `AUTH_TOKEN_SECRET` 缺失

现象：`docker compose` 配置插值失败。处理：创建 `.env` 并设置非空随机密钥。

### Server 长时间 unhealthy

```bash
docker compose ps
docker compose logs --tail 200 server
docker inspect --format '{{json .State.Health}}' mohjong-server-1
```

重点检查 migration 失败、SQLite 卷权限、数据库损坏和 `/ready` 数据库检查错误。

### Web 返回 502 或 unhealthy

先确认 Server healthy。Web 的 API 和探针通过内部 DNS 转发到 `server:3000`，Server 停止期间 Web 会暂时 unhealthy，并在 Server 恢复后自动恢复。

### 端口被占用

修改 `.env`：

```dotenv
WEB_PORT="18080"
```

然后重新执行 `docker compose up -d`，访问 `http://localhost:18080/`。

### 查看最终 Compose 配置

```bash
docker compose config
```

输出可能包含环境变量值，不要将完整结果粘贴到公开日志。

## 9. 安全基线

### 生产配置校验

`NODE_ENV=production` 时 Server 启动前强制校验：

- `AUTH_TOKEN_SECRET` 至少 32 字符，缺失或过短直接拒绝启动。
- `DATABASE_URL` 必须存在且为 `file:` 开头。

Compose 中 `AUTH_TOKEN_SECRET` 未设置时 `docker compose config` 直接报错，防止无密钥部署。

### 请求与频率限制

- 请求体上限默认 64KB（`BODY_LIMIT_BYTES`）。
- 登录接口按客户端 IP 限流：默认 10 次/分钟（`LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS`），超限返回 429。
- Socket 连接按用户限流：默认 20 次/分钟（`SOCKET_CONNECTION_RATE_LIMIT_*`）。
- Socket 游戏动作按用户限流：默认 30 次/10 秒（`SOCKET_ACTION_RATE_LIMIT_*`），超限返回错误事件。

### CORS

同源部署（nginx 统一入口）默认关闭 CORS。需要跨域时配置 `CORS_ORIGIN` 为逗号分隔的来源白名单，例如：

```dotenv
CORS_ORIGIN="https://mahjong.example.com"
```

### 安全响应头

nginx 已配置：

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Content-Security-Policy`: 同源脚本与样式、WebSocket 连接、`object-src 'none'`

### 管理员密码与 Token 存储

- 开发环境管理员密码至少 6 位，生产环境至少 12 位，并拒绝 `admin123`、`password` 等弱密码。
- 认证 Token 目前存储于浏览器（localStorage），存在 XSS 泄露风险；公网部署前建议迁移到 HttpOnly Cookie 并配置 HTTPS。

## 10. CI 自动化

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，在 push 到 `main` 和 pull request 时运行三个 job：

| Job   | 内容                                                                                        |
| ----- | ------------------------------------------------------------------------------------------- |
| check | 安装、Prisma 生成、格式检查、类型检查、Lint、全量测试和生产构建                             |
| smoke | 构建 Docker 镜像，启动 Compose 后执行迁移、`/health`、`/ready`、登录和 Socket.IO 冒烟脚本   |
| e2e   | 安装 Playwright Chromium，运行登录、多人建房/加入/准备/开局、历史查询和结算明细的浏览器测试 |

冒烟脚本位于 `apps/server/src/scripts/smoke.ts`（`pnpm -F server smoke`），覆盖存活/就绪探针、管理员登录、`/auth/me` 和带 Token 的 Socket.IO 连接。e2e 测试位于 `e2e/` 目录，使用独立 `data/e2e.db`，不污染开发数据库。

CI 失败时可在 Actions 页面查看日志；e2e 失败会附加 `test-results/` 报告，smoke 失败会输出 Server/Web 容器日志。

## 11. Render Free 演示版

Render 免费版使用单个 Docker Web Service。仓库根目录的 `render.yaml` 已声明服务配置，`Dockerfile.render` 会同时构建 React 前端和 Fastify 服务端，因此浏览器、HTTP API 与 Socket.IO 使用同一个 `onrender.com` 地址。

### 从 GitHub 创建服务

1. 将仓库推送到 GitHub，并确认 `render.yaml`、`Dockerfile.render` 已提交。
2. 在 Render 控制台选择 **New > Blueprint**，连接 GitHub 仓库并选择默认分支。
3. 确认 Blueprint 创建 `online-mahjong-demo` Web Service，点击部署并等待 `/ready` 变为 healthy。
4. Render 会分配类似 `https://online-mahjong-demo.onrender.com` 的地址；实际地址以控制台显示为准。

也可以手动创建 **Web Service**，运行时选择 Docker，Dockerfile 填 `./Dockerfile.render`，健康检查路径填 `/ready`，计划选择 `Free`。

### 演示账号

服务启动时会自动执行 migration，并由 `DEMO_SEED=1` 创建或更新以下账号：

| 用户名  | 密码                   |
| ------- | ---------------------- |
| player1 | `mahjong-demo-player1` |
| player2 | `mahjong-demo-player2` |
| player3 | `mahjong-demo-player3` |
| player4 | `mahjong-demo-player4` |

这些密码写在演示 Blueprint 中，只能用于公开演示，不要在真实环境复用。若改为手动创建服务，请在 Environment 中设置四个 `DEMO_PLAYER*_PASSWORD`，每个至少 12 个字符，并保留 `DEMO_SEED=1`。

### 免费版限制

- SQLite 文件写入 `/tmp/mahjong-demo.db`，没有持久磁盘；重启、重新部署、迁移主机或休眠唤醒后，账号以外的运行数据可能丢失。
- Render Free 服务会在一段时间无请求后休眠，首次访问需要等待冷启动。
- 不要在此服务中保存真实用户、正式管理员账号或重要对局记录；需要持久化时应迁移到 Render PostgreSQL/磁盘或其他托管数据库，并关闭演示 seed。
- `AUTH_TOKEN_SECRET` 由 Blueprint 自动生成；不要把它复制到公开仓库。

部署后可用以下命令验证：

```bash
curl --fail https://<你的服务名>.onrender.com/health
curl --fail https://<你的服务名>.onrender.com/ready
```

## 12. 公网部署注意事项

当前 Compose 适合内网和测试环境。公网使用前至少需要：

- 在外层反向代理配置域名和 HTTPS。
- 仅开放 80/443，不直接暴露 Server。
- 配置防火墙、登录限流、安全响应头和可信来源。
- 定期执行 SQLite 一致性备份并演练恢复流程，配置监控告警。
- 使用高强度管理员密码并妥善管理 `.env`。

这些工作对应后续公网项，在完成前不应将当前配置视为完整生产安全基线。
