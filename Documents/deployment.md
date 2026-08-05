# Docker Compose 部署手册

本文适用于当前单 Server、SQLite 和 Docker Compose 架构。公网域名、HTTPS 和生产安全强化仍需按阶段 18D-18E 补齐。

## 1. 部署边界

- `web` 容器运行 Nginx，对外提供统一入口。
- `server` 容器运行 Fastify、Socket.IO 和 Prisma。
- SQLite 位于 Docker 命名卷 `mahjong-data`，备份位于 `mahjong-backups`，均不随容器删除。
- Server 不发布宿主机端口，只能由 Web 容器访问。
- 当前不能启动多个 Server 副本。

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
```

说明：

- Compose 会覆盖容器内的 `DATABASE_URL`、`HOST` 和 `PORT`。
- `WEB_PORT` 是宿主机入口端口，可改为未占用端口。
- `SHUTDOWN_TIMEOUT_MS` 应小于 Compose 的 15 秒 Server 停机宽限期。
- `BACKUP_KEEP` 为备份保留数量，`BACKUP_ON_BOOT` 控制在启动迁移前是否自动备份（默认开启）。
- `.env` 包含密钥，不得提交 Git。

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

## 10. 公网部署注意事项

当前 Compose 适合内网和测试环境。公网使用前至少需要：

- 在外层反向代理配置域名和 HTTPS。
- 仅开放 80/443，不直接暴露 Server。
- 配置防火墙、登录限流、安全响应头和可信来源。
- 定期执行 SQLite 一致性备份并演练恢复流程，配置监控告警。
- 使用高强度管理员密码并妥善管理 `.env`。

这些工作对应阶段 18D-18E，在完成前不应将当前配置视为完整生产安全基线。
