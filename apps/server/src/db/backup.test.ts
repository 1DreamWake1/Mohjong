import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  backupFileName,
  backupMetaFileName,
  cleanupOldBackups,
  createBackup,
  listBackups,
  resolveDatabasePath,
  restoreBackup,
  verifyBackup
} from "./backup.js";

function openDatabase(path: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: `file:${path}` }
    }
  });
}

async function prepareDatabase(path: string, rows: number): Promise<void> {
  const db = openDatabase(path);
  await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, name TEXT)");
  for (let index = 0; index < rows; index += 1) {
    await db.$executeRawUnsafe("INSERT INTO t (name) VALUES (?)", `row-${index}`);
  }
  await db.$disconnect();
}

describe("database backup", () => {
  let tmpDir: string;
  let databasePath: string;
  let backupDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mahjong-backup-"));
    databasePath = join(tmpDir, "dev.db");
    backupDir = join(tmpDir, "backups");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a consistent online backup with metadata", async () => {
    await prepareDatabase(databasePath, 3);
    const executeSql = openDatabase(databasePath);

    const result = await createBackup({
      appVersion: "0.1.0",
      backupDir,
      databasePath,
      executeSql,
      keep: 5
    });
    await executeSql.$disconnect();

    expect(result.file).toMatch(/^mahjong-\d{8}T\d{9}-v0\.1\.0\.sqlite$/);
    expect(result.metadata.appVersion).toBe("0.1.0");
    expect(result.metadata.databasePath).toBe(databasePath);

    const backupPath = join(backupDir, result.file);
    const metaPath = join(backupDir, backupMetaFileName(result.file));
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as { createdAt: string };

    expect(meta.createdAt).toBe(result.metadata.createdAt);

    // 备份文件本身可以独立打开并包含原数据。
    const backupSql = openDatabase(backupPath);
    const rows = (await backupSql.$queryRawUnsafe("SELECT COUNT(*) AS count FROM t")) as {
      count: bigint;
    }[];
    expect(Number(rows[0]?.count)).toBe(3);
    await backupSql.$disconnect();
  });

  it("fails when the backup directory is blocked by a file", async () => {
    await prepareDatabase(databasePath, 1);
    const blockedDir = join(tmpDir, "blocked");
    await writeFile(blockedDir, "a regular file occupies this path");
    const executeSql = openDatabase(databasePath);

    await expect(
      createBackup({
        appVersion: "0.1.0",
        backupDir: join(blockedDir, "backups"),
        databasePath,
        executeSql,
        keep: 5
      })
    ).rejects.toThrow();
    await executeSql.$disconnect();
  });

  it("verifies backup integrity and reports migrations", async () => {
    await prepareDatabase(databasePath, 1);
    const executeSql = openDatabase(databasePath);
    const result = await createBackup({ appVersion: "1.2.3", backupDir, databasePath, executeSql });
    await executeSql.$disconnect();

    const backupSql = openDatabase(join(backupDir, result.file));
    const verified = await verifyBackup({ executeSql: backupSql });
    await backupSql.$disconnect();

    expect(verified.integrity).toBe("ok");
    expect(verified.ok).toBe(true);
    expect(verified.migrations).toEqual([]);
  });

  it("skips integrity check when no executor is provided", async () => {
    const verified = await verifyBackup({});
    expect(verified.integrity).toBe("skipped");
    expect(verified.ok).toBe(true);
  });

  it("lists backups newest first and cleans up beyond keep", async () => {
    await prepareDatabase(databasePath, 1);
    const executeSql = openDatabase(databasePath);

    const first = await createBackup({ appVersion: "0.1.0", backupDir, databasePath, executeSql });
    const second = await createBackup({ appVersion: "0.1.0", backupDir, databasePath, executeSql });
    const third = await createBackup({ appVersion: "0.1.0", backupDir, databasePath, executeSql });
    await executeSql.$disconnect();

    const records = await listBackups(backupDir);
    expect(records.map((record) => record.file)).toEqual([third.file, second.file, first.file]);

    const removed = await cleanupOldBackups(backupDir, 1);
    expect(removed).toEqual([second.file, first.file]);

    const remaining = await listBackups(backupDir);
    expect(remaining.map((record) => record.file)).toEqual([third.file]);
  });

  it("preserves the current database before restoring", async () => {
    await prepareDatabase(databasePath, 2);
    const executeSql = openDatabase(databasePath);
    const result = await createBackup({ appVersion: "0.1.0", backupDir, databasePath, executeSql });
    await executeSql.$disconnect();

    // 用另一份数据覆盖活动数据库，模拟升级后 schema/数据变化。
    await rm(databasePath, { force: true });
    await prepareDatabase(databasePath, 9);

    const backupSql = openDatabase(join(backupDir, result.file));
    const restored = await restoreBackup({
      backupDir,
      backupSql,
      databasePath,
      file: result.file
    });
    await backupSql.$disconnect();

    expect(restored.preservedDatabase).not.toBeNull();
    expect(restored.verify.integrity).toBe("ok");

    // 活动数据库恢复为备份内容。
    const restoredSql = openDatabase(databasePath);
    const rows = (await restoredSql.$queryRawUnsafe("SELECT COUNT(*) AS count FROM t")) as {
      count: bigint;
    }[];
    expect(Number(rows[0]?.count)).toBe(2);
    await restoredSql.$disconnect();

    // 保留文件仍包含覆盖前数据。
    const preservedPath = restored.preservedDatabase as string;
    const preservedSql = openDatabase(preservedPath);
    const preservedRows = (await preservedSql.$queryRawUnsafe(
      "SELECT COUNT(*) AS count FROM t"
    )) as { count: bigint }[];
    expect(Number(preservedRows[0]?.count)).toBe(9);
    await preservedSql.$disconnect();
  });

  it("rejects restoring a corrupt backup", async () => {
    await prepareDatabase(databasePath, 1);
    const corruptFile = "mahjong-20260805T000000-v0.1.0.sqlite";
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, corruptFile), "not a sqlite file");

    const backupSql = openDatabase(join(backupDir, corruptFile));
    await expect(
      restoreBackup({ backupDir, backupSql, databasePath, file: corruptFile })
    ).rejects.toThrow(/integrity/i);
    await backupSql.$disconnect();
  });

  it("resolves relative and absolute database urls", async () => {
    // 模拟 pnpm --filter server 场景：cwd 是包目录，相对路径相对 prisma/ 解析。
    const rootDir = join(tmpDir, "project");
    await mkdir(join(rootDir, "prisma"), { recursive: true });
    await writeFile(join(rootDir, "prisma", "schema.prisma"), "datasource db {}");

    const cwd = join(rootDir, "apps", "server");
    await mkdir(cwd, { recursive: true });
    expect(resolveDatabasePath("file:../data/dev.db", cwd)).toBe(join(rootDir, "data", "dev.db"));
    expect(resolveDatabasePath("file:/app/data/mahjong.db", cwd)).toBe("/app/data/mahjong.db");
  });

  it("builds predictable backup and metadata file names", () => {
    expect(backupFileName("20260805T103000123", "0.1.0")).toBe(
      "mahjong-20260805T103000123-v0.1.0.sqlite"
    );
    expect(backupFileName("20260805T103000123", "1.0.0-beta.1")).toBe(
      "mahjong-20260805T103000123-v1.0.0-beta.1.sqlite"
    );
    expect(backupMetaFileName("mahjong-20260805T103000123-v0.1.0.sqlite")).toBe(
      "mahjong-20260805T103000123-v0.1.0.sqlite.json"
    );
  });
});
