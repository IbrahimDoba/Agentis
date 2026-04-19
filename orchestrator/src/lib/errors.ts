export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND")
    this.name = "NotFoundError"
  }
}

export class NotImplementedError extends AppError {
  constructor(message = "Not implemented") {
    super(message, 501, "NOT_IMPLEMENTED")
    this.name = "NotImplementedError"
  }
}
