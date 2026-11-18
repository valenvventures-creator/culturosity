import type { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, fields?: Record<string, string>) => new AppError(400, "bad_request", msg, fields);
export const unauthorized = (msg = "Please sign in to continue.") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have permission to do that.") => new AppError(403, "forbidden", msg);
export const notFound = (msg = "Not found.") => new AppError(404, "not_found", msg);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
export const tooMany = (msg = "Too many attempts. Please wait and try again.") => new AppError(429, "rate_limited", msg);

export function fromZod(err: ZodError, message = "Please fix the highlighted fields."): AppError {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return new AppError(422, "validation_failed", message, fields);
}
