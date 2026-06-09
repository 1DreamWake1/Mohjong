CREATE TABLE "GameRecord" (
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
    CONSTRAINT "GameRecord_playerUserId_fkey" FOREIGN KEY ("playerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "GameEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recordId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "GameRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GameRecord_roomId_key" ON "GameRecord"("roomId");
