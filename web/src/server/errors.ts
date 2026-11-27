export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError(400, "bad_request", m, d);
export const unauthorized = () => new AppError(401, "unauthorized", "Sign in required");
export const forbidden = (m = "You do not have permission for this action") => new AppError(403, "forbidden", m);
export const notFound = (m = "Not found") => new AppError(404, "not_found", m);
export const conflict = (m: string, d?: unknown) => new AppError(409, "conflict", m, d);
export const upstream = (m: string, d?: unknown) => new AppError(502, "upstream_error", m, d);
