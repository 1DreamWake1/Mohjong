import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

import { loadEnv } from "../config/env.js";
import {
  createBackup,
  DEFAULT_BACKUP_KEEP,
  listBackups,
  resolveDatabasePath,
  restoreBackup,
  verifyBackup
} from "../db/backup.js";

const usage = `用法:
  dbbackup create               创建一致性备份（默认在线 VACUUM INTO）
  dbbackup list                 列出备份
  dbbackup verify <file>        校验备份文件完整性和 migration
  dbbackup restore <file>       恢复备份（恢复前保留当前数据库）

环境变量:
  DATABASE_URL   数据库连接（默认 file:../data/dev.db）
  BACKUP_DIR     备份目录（默认数据库同目录下的 backups）
  BACKUP_KEEP    保留备份数量（默认 5）`;

async function readAppVersion(): Promise<string> {
  try {
    const content = await readFile(join(process.cwd(), "package.json"), "utf8");
    const pkg = JSON.parse(content) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readBackupConfig(): {
  backupDir: string;
  databasePath: string;
  keep: number;
} {
  loadEnv();
  const databasePath = resolveDatabasePath(
    process.env.DATABASE_URL ?? "file:../data/dev.db",
    process.cwd()
  );
  const backupDir = process.env.BACKUP_DIR ?? join(dirname(databasePath), "backups");
  const keep = Number(process.env.BACKUP_KEEP ?? DEFAULT_BACKUP_KEEP);

  return {
    backupDir,
    databasePath,
    keep: Number.isFinite(keep) && keep > 0 ? keep : DEFAULT_BACKUP_KEEP
  };
}

function openDatabase(databasePath: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: `file:${databasePath}` }
    }
  });
}

async function runCreate(): Promise<void> {
  const { backupDir, databasePath, keep } = readBackupConfig();
  if (!existsSync(databasePath)) {
    console.log(`跳过备份：数据库不存在 ${databasePath}`);
    return;
  }

  const appVersion = await readAppVersion();
  const executeSql = openDatabase(databasePath);
  try {
    const result = await createBackup({
      appVersion,
      backupDir,
      databasePath,
      executeSql,
      keep
    });
    console.log(`备份完成: ${join(backupDir, result.file)}`);
    console.log(`应用版本: ${result.metadata.appVersion}`);
    console.log(`migrations: ${result.metadata.migrations.length} 个`);
    if (result.removed.length > 0) {
      console.log(`清理旧备份: ${result.removed.join(", ")}`);
    }
  } finally {
    await executeSql.$disconnect();
  }
}

async function runList(): Promise<void> {
  const { backupDir } = readBackupConfig();
  const records = await listBackups(backupDir);

  if (records.length === 0) {
    console.log(`暂无备份（目录 ${backupDir}）`);
    return;
  }

  console.log(`备份目录: ${backupDir}`);
  for (const record of records) {
    const version = record.metadata?.appVersion ?? "unknown";
    const migrationCount = record.metadata?.migrations.length ?? 0;
    console.log(`- ${record.file}  (v${version}, ${migrationCount} migrations)`);
  }
}

async function runVerify(file: string): Promise<void> {
  if (!file) {
    throw new Error("verify 需要备份文件名参数");
  }

  const { backupDir } = readBackupConfig();
  const backupPath = join(backupDir, file);
  if (!existsSync(backupPath)) {
    throw new Error(`备份文件不存在: ${backupPath}`);
  }

  const executeSql = openDatabase(backupPath);
  try {
    const result = await verifyBackup({ executeSql });
    console.log(`校验: ${backupPath}`);
    console.log(`完整性: ${result.integrity}`);
    console.log(`migrations: ${result.migrations.length} 个`);
    if (!result.ok) {
      throw new Error("备份校验失败");
    }
  } finally {
    await executeSql.$disconnect();
  }
}

async function runRestore(file: string): Promise<void> {
  if (!file) {
    throw new Error("restore 需要备份文件名参数");
  }

  const { backupDir, databasePath } = readBackupConfig();
  const backupPath = join(backupDir, file);
  if (!existsSync(backupPath)) {
    throw new Error(`备份文件不存在: ${backupPath}`);
  }

  const backupSql = openDatabase(backupPath);
  try {
    const result = await restoreBackup({
      backupDir,
      backupSql,
      databasePath,
      file
    });
    console.log(`恢复完成: ${result.restoredFile} -> ${result.databasePath}`);
    console.log(`完整性: ${result.verify.integrity}`);
    if (result.preservedDatabase) {
      console.log(`恢复前数据库已保留为: ${result.preservedDatabase}`);
    }
  } finally {
    await backupSql.$disconnect();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];

  try {
    switch (command) {
      case "create":
        await runCreate();
        break;
      case "list":
        await runList();
        break;
      case "verify":
        await runVerify(process.argv[3] ?? "");
        break;
      case "restore":
        await runRestore(process.argv[3] ?? "");
        break;
      default:
        console.log(usage);
        process.exitCode = command ? 2 : 0;
    }
  } catch (error) {
    console.error(`dbbackup 失败: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

await main();
