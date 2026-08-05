import { readEnv } from "../config/env.js";
import { closePrisma, prisma } from "../db/prisma.js";
import { hashPassword } from "../modules/auth/password.js";

const username = process.env.ADMIN_USERNAME?.trim() ?? "admin";
const password = process.env.ADMIN_PASSWORD?.trim() ?? "admin123";
const isProduction = process.env.NODE_ENV === "production";
const minLength = isProduction ? 12 : 6;
const weakPasswords = new Set(["admin123", "password", "123456", "admin", "password123"]);

if (password.length < minLength) {
  throw new Error(
    `ADMIN_PASSWORD must be at least ${minLength} characters long in ${isProduction ? "production" : "development"}`
  );
}

if (weakPasswords.has(password.toLowerCase())) {
  throw new Error("ADMIN_PASSWORD is too weak, choose a different password");
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
