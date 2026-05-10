import { HttpException } from "@nestjs/common";

export function apiSuccess<T>(data: T) {
  return { data };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): never {
  throw new HttpException(
    {
      error: {
        code,
        message,
        details,
      },
    },
    status,
  );
}
