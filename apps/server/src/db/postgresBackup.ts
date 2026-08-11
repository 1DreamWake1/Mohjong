import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

const execFile = promisify(execFileCallback);

export type PostgresBackupMetadata = {
  appVersion: string;
  createdAt: string;
  database: "postgresql";
  format: "custom";
};

export type PostgresBackupRecord = {
  createdAt: string;
  file: string;
  metadata: PostgresBackupMetadata | null;
  metaFile: string;
};

type CommandRunner = (command: string, args: string[]) => Promise<void>;

export type PostgresBackupOptions = {
  appVersion: string;
  backupDir: string;
  databaseUrl: string;
  keep?: number;
  runCommand?: CommandRunner;
};

const DEFAULT_KEEP = 5;

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

function backupFileName(createdAt: string, appVersion: string): string {
  return `mahjong-${createdAt}-v${safeVersion(appVersion)}.dump`;
}

function metadataFileName(file: string): string {
  return `${file}.json`;
}

function parseBackupFile(file: string): string | null {
  const match = /^mahjong-(\d{8}T\d{9})-v.+\.dump$/.exec(file);
  return match?.[1] ?? null;
}

function assertPostgresUrl(databaseUrl: string): void {
  if (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
    throw new Error("PostgreSQL backup requires a PostgreSQL DATABASE_URL");
  }
}

async function defaultRunCommand(command: string, args: string[]): Promise<void> {
  await execFile(command, args, { windowsHide: true });
}

async function readMetadata(
  backupDir: string,
  file: string
): Promise<PostgresBackupMetadata | null> {
  try {
    return JSON.parse(
      await readFile(join(backupDir, metadataFileName(file)), "utf8")
    ) as PostgresBackupMetadata | null;
  } catch {
    return null;
  }
}

export async function listPostgresBackups(backupDir: string): Promise<PostgresBackupRecord[]> {
  await mkdir(backupDir, { recursive: true });
  const entries = await readdir(backupDir, { withFileTypes: true });
  const records: PostgresBackupRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const createdAt = parseBackupFile(entry.name);
    if (!createdAt) continue;
    records.push({
      createdAt,
      file: entry.name,
      metadata: await readMetadata(backupDir, entry.name),
      metaFile: metadataFileName(entry.name)
    });
  }
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function cleanupOldBackups(backupDir: string, keep: number): Promise<string[]> {
  const records = await listPostgresBackups(backupDir);
  const removed: string[] = [];
  for (const record of records.slice(keep)) {
    await rm(join(backupDir, record.file), { force: true });
    await rm(join(backupDir, record.metaFile), { force: true });
    removed.push(record.file);
  }
  return removed;
}

export async function createPostgresBackup(options: PostgresBackupOptions): Promise<{
  file: string;
  metadata: PostgresBackupMetadata;
  removed: string[];
}> {
  assertPostgresUrl(options.databaseUrl);
  await mkdir(options.backupDir, { recursive: true });
  const createdAt = timestampLabel();
  const file = backupFileName(createdAt, options.appVersion);
  const targetPath = join(options.backupDir, file);
  const runCommand = options.runCommand ?? defaultRunCommand;
  await runCommand("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--file",
    targetPath,
    options.databaseUrl
  ]);

  const metadata: PostgresBackupMetadata = {
    appVersion: options.appVersion,
    createdAt,
    database: "postgresql",
    format: "custom"
  };
  await writeFile(
    join(options.backupDir, metadataFileName(file)),
    `${JSON.stringify(metadata, null, 2)}\n`
  );
  const removed = await cleanupOldBackups(
    options.backupDir,
    options.keep && options.keep > 0 ? options.keep : DEFAULT_KEEP
  );
  return { file, metadata, removed };
}

export async function verifyPostgresBackup(
  backupPath: string,
  runCommand: CommandRunner = defaultRunCommand
): Promise<void> {
  if (!existsSync(backupPath)) throw new Error(`备份文件不存在: ${backupPath}`);
  await runCommand("pg_restore", ["--list", backupPath]);
}

export async function restorePostgresBackup(options: {
  backupPath: string;
  databaseUrl: string;
  runCommand?: CommandRunner;
}): Promise<void> {
  assertPostgresUrl(options.databaseUrl);
  if (!existsSync(options.backupPath)) {
    throw new Error(`备份文件不存在: ${options.backupPath}`);
  }
  const runCommand = options.runCommand ?? defaultRunCommand;
  await runCommand("pg_restore", [
    "--clean",
    "--if-exists",
    "--exit-on-error",
    "--no-owner",
    "--single-transaction",
    "--dbname",
    options.databaseUrl,
    options.backupPath
  ]);
}
