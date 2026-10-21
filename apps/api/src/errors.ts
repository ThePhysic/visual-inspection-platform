export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

export function storageFailure(cause: unknown) {
  return new ApiError(503, 'STORAGE_FAILURE', 'Image storage is unavailable.', { cause });
}

export function databaseFailure(cause?: unknown) {
  return new ApiError(503, 'DATABASE_FAILURE', 'Asset persistence is unavailable.', { cause });
}
