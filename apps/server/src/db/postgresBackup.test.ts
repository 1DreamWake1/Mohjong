import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createPostgresBackup,
  restorePostgresBackup,
  verifyPostgresBackup
} from "./postgresBackup.js";

const databaseUrl = "postgresql://mahjong:secret@localhost:5432/mahjong";

describe("postgres backup commands", () => {
  it("creates a custom-format dump and rotates old dumps", async () => {
    const backupDir = await mkdtemp(join(tmpdir(), "mahjong-pg-backup-"));
    const commands: Array<{ command: string; args: string[] }> = [];
    const result = await createPostgresBackup({
      appVersion: "0.1.0",
      backupDir,
      databaseUrl,
      keep: 1,
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeFile(args[args.indexOf("--file") + 1]!, "custom dump");
      }
    });

    expect(result.file).toMatch(/\.dump$/);
    expect(commands[0]).toMatchObject({
      command: "pg_dump",
      args: expect.arrayContaining(["--format=custom", "--no-owner", databaseUrl])
    });
  });

  it("verifies and restores through pg_restore without exposing credentials in output", async () => {
    const backupDir = await mkdtemp(join(tmpdir(), "mahjong-pg-restore-"));
    const backupPath = join(backupDir, "snapshot.dump");
    await writeFile(backupPath, "custom dump");
    const commands: Array<{ command: string; args: string[] }> = [];
    const runner = async (command: string, args: string[]) => {
      commands.push({ command, args });
    };

    await verifyPostgresBackup(backupPath, runner);
    await restorePostgresBackup({ backupPath, databaseUrl, runCommand: runner });

    expect(commands).toEqual([
      { command: "pg_restore", args: ["--list", backupPath] },
      {
        command: "pg_restore",
        args: [
          "--clean",
          "--if-exists",
          "--exit-on-error",
          "--no-owner",
          "--single-transaction",
          "--dbname",
          databaseUrl,
          backupPath
        ]
      }
    ]);
  });
});
