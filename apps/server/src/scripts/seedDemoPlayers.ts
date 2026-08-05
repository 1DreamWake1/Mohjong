import { readEnv } from "../config/env.js";
import { closePrisma, prisma } from "../db/prisma.js";
import { hashPassword } from "../modules/auth/password.js";

const demoPlayers = ["player1", "player2", "player3", "player4"] as const;

function readPassword(username: string): string {
  const password = process.env[`DEMO_${username.toUpperCase()}_PASSWORD`]?.trim();
  if (!password || password.length < 12) {
    throw new Error(`${username} demo password must be at least 12 characters long`);
  }

  return password;
}

readEnv();

for (const username of demoPlayers) {
  const passwordHash = await hashPassword(readPassword(username));
  await prisma.user.upsert({
    create: { passwordHash, role: "player", username },
    update: { passwordHash, role: "player" },
    where: { username }
  });
}

console.log(`Demo players are ready: ${demoPlayers.join(", ")}`);
await closePrisma();
