export type ServerEnv = {
  host: string;
  port: number;
};

export function readEnv(): ServerEnv {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3000)
  };
}
