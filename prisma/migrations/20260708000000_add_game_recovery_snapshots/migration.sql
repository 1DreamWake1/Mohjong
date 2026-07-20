PRAGMA foreign_keys=OFF;

CREATE TABLE "new_GameRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roomId" TEXT NOT NULL,
    "playerUserId" INTEGER,
    "humanSeatIndex" INTEGER NOT NULL,
    "ruleName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "endReason" TEXT,
    "winnerSeatIndex" INTEGER,
    "winType" TEXT,
    "winningTile" TEXT,
    "fanTotal" INTEGER,
    "totalPoints" INTEGER,
    "resultSnapshot" TEXT,
    "recoverySnapshot" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameRecord_playerUserId_fkey" FOREIGN KEY ("playerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_GameRecord" (
    "id",
    "roomId",
    "playerUserId",
    "humanSeatIndex",
    "ruleName",
    "status",
    "startedAt",
    "endedAt",
    "endReason",
    "winnerSeatIndex",
    "winType",
    "winningTile",
    "fanTotal",
    "totalPoints",
    "resultSnapshot",
    "updatedAt"
)
SELECT
    "id",
    "roomId",
    "playerUserId",
    "humanSeatIndex",
    "ruleName",
    "status",
    "startedAt",
    "endedAt",
    "endReason",
    "winnerSeatIndex",
    "winType",
    "winningTile",
    "fanTotal",
    "totalPoints",
    "resultSnapshot",
    COALESCE("endedAt", "startedAt", CURRENT_TIMESTAMP)
FROM "GameRecord";

DROP TABLE "GameRecord";
ALTER TABLE "new_GameRecord" RENAME TO "GameRecord";
CREATE UNIQUE INDEX "GameRecord_roomId_key" ON "GameRecord"("roomId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
