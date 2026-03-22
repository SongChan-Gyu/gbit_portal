import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiErrorOptions {
  status?: number;
  code?: ApiErrorCode;
  details?: Record<string, string[]>;
}

/**
 * 일관된 API 에러 응답 형식. { error, code?, details? }
 */
export function apiError(
  message: string,
  options: ApiErrorOptions = {}
): NextResponse {
  const { status = 400, code, details } = options;
  const body: { error: string; code?: string; details?: Record<string, string[]> } = {
    error: message,
  };
  if (code) body.code = code;
  if (details && Object.keys(details).length > 0) body.details = details;
  return NextResponse.json(body, { status });
}

/** 401 Unauthorized */
export function unauthorized(message = "로그인이 필요합니다.") {
  return apiError(message, { status: 401, code: "UNAUTHORIZED" });
}

/** 403 Forbidden */
export function forbidden(message = "권한이 없습니다.") {
  return apiError(message, { status: 403, code: "FORBIDDEN" });
}

/** 404 Not Found */
export function notFound(message = "찾을 수 없습니다.") {
  return apiError(message, { status: 404, code: "NOT_FOUND" });
}

/** 429 Rate Limited */
export function rateLimited(message = "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.") {
  return apiError(message, { status: 429, code: "RATE_LIMITED" });
}
