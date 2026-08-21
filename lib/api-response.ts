export type ApiErrorCode = "AUTH_REQUIRED" | "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "DATABASE_ERROR";

export function apiError(error: string, status: number, code: ApiErrorCode) {
  return Response.json({ error, code }, { status });
}

export function databaseError(error: unknown) {
  console.error("API database operation failed", error);
  return apiError("服务暂时无法保存数据，请稍后重试。已有学习记录不会被修改。", 503, "DATABASE_ERROR");
}
