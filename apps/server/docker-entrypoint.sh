#!/bin/sh
set -eu

# 升级前自动备份：在迁移前生成一致性备份，迁移失败时可回滚。
case "${DATABASE_URL:-}" in
  postgres*|postgresql*) IS_POSTGRES=1 ;;
  *) IS_POSTGRES=0 ;;
esac

if [ "${BACKUP_ON_BOOT:-1}" = "1" ]; then
  node ./apps/server/dist/scripts/dbbackup.js create
fi

PRISMA_SCHEMA_PATH="./${PRISMA_SCHEMA:-prisma/schema.prisma}"
./node_modules/.bin/prisma migrate deploy --schema "$PRISMA_SCHEMA_PATH"
if [ "${DEMO_SEED:-0}" = "1" ]; then
  node ./apps/server/dist/scripts/seedDemoPlayers.js
fi
exec node ./apps/server/dist/main.js
