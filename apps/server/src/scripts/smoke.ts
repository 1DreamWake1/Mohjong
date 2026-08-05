import { io } from "socket.io-client";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8080";
const username = process.env.SMOKE_USERNAME ?? "admin";
const password = process.env.SMOKE_PASSWORD ?? "";

const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ok  ${name}`);
  } else {
    const message = detail === undefined ? "" : ` (${JSON.stringify(detail)})`;
    failures.push(`${name}${message}`);
    console.error(`FAIL  ${name}${message}`);
  }
}

async function httpJson(
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text when the response is not JSON.
  }
  return { status: response.status, body };
}

async function run(): Promise<void> {
  console.log(`Smoke test base url: ${baseUrl}`);

  console.log("health probe");
  const health = await httpJson("/health");
  check("health returns 200", health.status === 200, health.body);
  check(
    "health body status ok",
    (health.body as { status?: string })?.status === "ok",
    health.body
  );

  console.log("readiness probe");
  const ready = await httpJson("/ready");
  check("ready returns 200", ready.status === 200, ready.body);
  check(
    "ready body status ready",
    (ready.body as { status?: string })?.status === "ready",
    ready.body
  );

  console.log("admin login");
  const login = await httpJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  check("login returns 200", login.status === 200, login.body);
  const token = (login.body as { token?: string })?.token;
  check("login returns a token", typeof token === "string" && token.length > 0, login.body);

  console.log("authenticated identity");
  const me = await httpJson("/auth/me", {
    headers: { authorization: `Bearer ${token ?? ""}` }
  });
  check("me returns 200", me.status === 200, me.body);
  check(
    "me identifies admin",
    (me.body as { user?: { role?: string } })?.user?.role === "admin",
    me.body
  );

  console.log("socket.io connection");
  await new Promise<void>((resolve) => {
    const socket = io(baseUrl, {
      auth: { token },
      reconnection: false,
      timeout: 5_000,
      transports: ["websocket", "polling"]
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      check("socket connects within timeout", false, "timeout");
      resolve();
    }, 8_000);
    socket.on("connect", () => {
      clearTimeout(timer);
      check("socket connects with token", true);
      socket.disconnect();
      resolve();
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      check("socket connects with token", false, error.message);
      resolve();
    });
    socket.connect();
  });

  if (failures.length > 0) {
    console.error(`\nSmoke test failed: ${failures.length} check(s)`);
    process.exitCode = 1;
    return;
  }

  console.log("\nSmoke test passed");
}

await run();
