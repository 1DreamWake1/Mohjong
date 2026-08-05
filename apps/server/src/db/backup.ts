import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type SqlExecutor = {
  $executeRawUnsafe?: (sql: string) => Promise<unknown>;
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
};

export type BackupMetadata = {
  appVersion: string;
  createdAt: string;
  databasePath: string;
  migrations: string[];
};

export type BackupRecord = {
  createdAt: string;
  file: string;
  metadata: BackupMetadata | null;
  metaFile: string;
};

export type CreateBackupOptions = {
  appVersion: string;
  backupDir: string;
  databasePath: string;
  /** 连接到活动数据库的执行器；省略时执行离线复制备份。 */
  executeSql?: SqlExecutor;
  keep?: number;
};

export type RestoreBackupOptions = {
  backupDir: string;
  databasePath: string;
  file: string;
  /** 连接到备份文件的执行器，用于恢复前完整性检查；省略时跳过检查。 */
  backupSql?: SqlExecutor;
};

export type VerifyBackupOptions = {
  /** 连接到待校验 SQLite 文件的执行器；省略时跳过完整性检查。 */
  executeSql?: SqlExecutor;
};

export type VerifyResult = {
  integrity: "ok" | "failed" | "skipped";
  migrations: string[];
  ok: boolean;
};

export type RestoreResult = {
  databasePath: string;
  preservedDatabase: string | null;
  restoredFile: string;
  verify: VerifyResult;
};

export const DEFAULT_BACKUP_KEEP = 5;

function timestampLabel(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    String(date.getUTCMilliseconds()).padStart(3, "0")
  ].join("");
}

function safeVersion(version: string): string {
  return version.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

export function backupFileName(createdAt: string, appVersion: string): string {
  return `mahjong-${createdAt}-v${safeVersion(appVersion)}.sqlite`;
}

export function backupMetaFileName(file: string): string {
  return `${file}.json`;
}

export function resolveDatabasePath(databaseUrl: string, cwd = process.cwd()): string {
  const raw = databaseUrl.replace(/^file:/, "");
  if (isAbsolute(raw)) {
    return raw;
  }

  // Prisma 将 SQLite 相对路径相对 schema.prisma 所在目录解析，
  // 而 pnpm --filter 运行脚本时 cwd 是包目录，因此需要向上查找 prisma/ 目录。
  const schemaDir = findSchemaDir(cwd) ?? cwd;
  return resolve(schemaDir, raw);
}

function findSchemaDir(startDir: string): string | null {
  let currentDir = startDir;

  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(currentDir, "prisma", "schema.prisma"))) {
      return join(currentDir, "prisma");
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return null;
}

export async function readPrismaMigrations(executeSql: SqlExecutor): Promise<string[]> {
  try {
    const rows = (await executeSql.$queryRawUnsafe(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY started_at"
    )) as { migration_name: string }[];
    return rows.map((row) => row.migration_name);
  } catch {
    return [];
  }
}

async function integrityCheck(executeSql: SqlExecutor): Promise<"ok" | "failed"> {
  try {
    const rows = (await executeSql.$queryRawUnsafe("PRAGMA integrity_check")) as {
      integrity_check: string;
    }[];
    return rows[0]?.integrity_check === "ok" ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

function parseBackupFile(file: string): { createdAt: string; appVersion: string } | null {
  const match = /^mahjong-(\d{8}T\d{9})-v(.+)\.sqlite$/.exec(file);
  if (!match) {
    return null;
  }

  return { appVersion: match[2] ?? "unknown", createdAt: match[1] ?? "" };
}

async function readMetadata(backupDir: string, file: string): Promise<BackupMetadata | null> {
  try {
    const content = await readFile(join(backupDir, backupMetaFileName(file)), "utf8");
    return JSON.parse(content) as BackupMetadata;
  } catch {
    return null;
  }
}

export async function listBackups(backupDir: string): Promise<BackupRecord[]> {
  await mkdir(backupDir, { recursive: true });
  const entries = await readdir(backupDir, { withFileTypes: true });
  const records: BackupRecord[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sqlite")) {
      continue;
    }

    const parsed = parseBackupFile(entry.name);
    if (!parsed) {
      continue;
    }

    records.push({
      createdAt: parsed.createdAt,
      file: entry.name,
      metadata: await readMetadata(backupDir, entry.name),
      metaFile: backupMetaFileName(entry.name)
    });
  }

  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function cleanupOldBackups(backupDir: string, keep: number): Promise<string[]> {
  const records = await listBackups(backupDir);
  const removed: string[] = [];

  for (const record of records.slice(keep)) {
    await rm(join(backupDir, record.file), { force: true });
    await rm(join(backupDir, record.metaFile), { force: true });
    removed.push(record.file);
  }

  return removed;
}

export async function createBackup(options: CreateBackupOptions): Promise<{
  file: string;
  metadata: BackupMetadata;
  removed: string[];
}> {
  const { appVersion, backupDir, databasePath, executeSql, keep = DEFAULT_BACKUP_KEEP } = options;
  await mkdir(backupDir, { recursive: true });

  const createdAt = timestampLabel();
  const file = backupFileName(createdAt, appVersion);
  const targetPath = join(backupDir, file);

  if (executeSql) {
    // 在线一致性备份：VACUUM INTO 生成快照，不直接复制活动数据库。
    await executeSql.$executeRawUnsafe?.(`VACUUM INTO '${targetPath.replaceAll("'", "''")}'`);
  } else {
    // 离线备份：要求服务已停止。
    await copyFile(databasePath, targetPath);
  }

  const migrations = executeSql ? await readPrismaMigrations(executeSql) : [];
  const metadata: BackupMetadata = {
    appVersion,
    createdAt,
    databasePath,
    migrations
  };
  await writeFile(
    join(backupDir, backupMetaFileName(file)),
    `${JSON.stringify(metadata, null, 2)}\n`
  );

  const removed = await cleanupOldBackups(backupDir, keep);

  return { file, metadata, removed };
}

export async function verifyBackup(options: VerifyBackupOptions): Promise<VerifyResult> {
  const { executeSql } = options;

  if (!executeSql) {
    return { integrity: "skipped", migrations: [], ok: true };
  }

  const integrity = await integrityCheck(executeSql);
  const migrations = await readPrismaMigrations(executeSql);

  return { integrity, migrations, ok: integrity === "ok" };
}

export async function restoreBackup(options: RestoreBackupOptions): Promise<RestoreResult> {
  const { backupDir, backupSql, databasePath, file } = options;
  const backupPath = join(backupDir, file);

  // 恢复前完整性检查：备份文件本身必须健康。
  const verify = await (backupSql ? verifyBackup({ executeSql: backupSql }) : verifyBackup({}));
  if (!verify.ok) {
    throw new Error(`Backup integrity check failed: ${verify.integrity}`);
  }

  // 保留当前数据库，防止恢复失败后丢失现场。
  let preservedDatabase: string | null = null;
  try {
    const preservedName = `${databasePath}.pre-restore-${timestampLabel()}`;
    await rename(databasePath, preservedName);
    preservedDatabase = preservedName;
  } catch {
    // 活动数据库不存在时直接覆盖。
  }

  await copyFile(backupPath, databasePath);

  return { databasePath, preservedDatabase, restoredFile: backupPath, verify };
}
