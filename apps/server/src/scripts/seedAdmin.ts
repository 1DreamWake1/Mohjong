import { readEnv } from "../config/env.js";
import { closePrisma, prisma } from "../db/prisma.js";
import { hashPassword } from "../modules/auth/password.js";

const username = process.env.ADMIN_USERNAME?.trim() ?? "admin";
const password = process.env.ADMIN_PASSWORD ?? "admin123";

if (password.length < 6) {
  throw new Error("ADMIN_PASSWORD must be at least 6 characters long");
}

readEnv();

const passwordHash = await hashPassword(password);
const user = await prisma.user.upsert({
  create: {
    username,
    passwordHash,
    role: "admin"
  },
  update: {
    passwordHash,
    role: "admin"
  },
  where: {
    username
  }
});

console.log(`Admin user is ready: ${user.username}`);
await closePrisma();
