#!/bin/sh
set -eu

# 升级前自动备份：在迁移前生成一致性备份，迁移失败时可回滚。
if [ "${BACKUP_ON_BOOT:-1}" = "1" ]; then
  node ./apps/server/dist/scripts/dbbackup.js create
fi

./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
exec node ./apps/server/dist/main.js
