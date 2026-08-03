#!/bin/sh
set -eu

./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
exec node ./apps/server/dist/main.js
