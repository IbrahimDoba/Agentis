export class WorkerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message)
    this.name = "WorkerError"
  }
}

export class NotFoundError extends WorkerError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404)
  }
}

export class UnauthorizedError extends WorkerError {
  constructor() {
    super("Unauthorized", "UNAUTHORIZED", 401)
  }
}

export class RateLimitError extends WorkerError {
  constructor(reason: string) {
    super(`Rate limit exceeded: ${reason}`, "RATE_LIMITED", 429)
  }
}

export class SessionError extends WorkerError {
  constructor(message: string) {
    super(message, "SESSION_ERROR", 503)
  }
}
