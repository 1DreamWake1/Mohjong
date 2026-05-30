import { ApiError } from "./client.js";

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return "请输入有效的用户名和密码";
    }
    if (error.status === 401) {
      return "账号或密码不正确";
    }
    if (error.status === 403) {
      return "当前账号没有权限执行此操作";
    }
    if (error.status === 404) {
      return "要操作的账号不存在或已被删除";
    }
    if (error.status === 409) {
      return "用户名已存在，请换一个用户名";
    }

    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return "操作失败，请稍后重试";
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
