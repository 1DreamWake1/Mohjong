# Docker Compose 部署手册

本文适用于当前单 Server、SQLite 和 Docker Compose 架构。公网域名、HTTPS、备份恢复和生产安全强化仍需按阶段 18C-18E 补齐。

## 1. 部署边界

- `web` 容器运行 Nginx，对外提供统一入口。
- `server` 容器运行 Fastify、Socket.IO 和 Prisma。
- SQLite 位于 Docker 命名卷 `mahjong-data`，不随容器删除。
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
```

说明：

- Compose 会覆盖容器内的 `DATABASE_URL`、`HOST` 和 `PORT`。
- `WEB_PORT` 是宿主机入口端口，可改为未占用端口。
- `SHUTDOWN_TIMEOUT_MS` 应小于 Compose 的 15 秒 Server 停机宽限期。
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
```

`docker compose down` 会保留命名卷。以下命令会永久删除数据库，禁止在正常升级或停机时使用：

```bash
docker compose down --volumes
```

阶段 18C 完成前，不要直接复制运行中的 SQLite 文件作为正式备份。需要维护数据库时先停止服务，并保留原数据卷或数据库副本。

## 7. 更新部署

当前建议流程：

```bash
git pull --ff-only
docker compose build
docker compose up -d --wait
docker compose ps
curl --fail http://127.0.0.1:8080/ready
```

镜像启动时会应用尚未执行的 migration。涉及 schema 变更的更新应在阶段 18C 备份与回滚流程完成后用于重要数据环境。

## 8. 故障排查

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

## 9. 公网部署注意事项

当前 Compose 适合内网和测试环境。公网使用前至少需要：

- 在外层反向代理配置域名和 HTTPS。
- 仅开放 80/443，不直接暴露 Server。
- 配置防火墙、登录限流、安全响应头和可信来源。
- 建立 SQLite 一致性备份、恢复演练和监控告警。
- 使用高强度管理员密码并妥善管理 `.env`。

这些工作对应阶段 18C-18E，在完成前不应将当前配置视为完整生产安全基线。
