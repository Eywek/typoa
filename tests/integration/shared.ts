import type express from 'express'

/**
 * Standard error handler for integration tests that formats validation errors
 * and other errors in a consistent way for test assertions.
 */
export function createErrorHandler(): express.ErrorRequestHandler {
  return function errorHandler(
    err: any,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: express.NextFunction
  ): void {
    if (err.name === 'ValidateError') {
      if (err.fields && Object.keys(err.fields).length > 0) {
        res.status(err.status || 400).json({ fields: err.fields })
      } else {
        res.status(err.status || 400).json({ message: err.message })
      }
    } else {
      res.status(err.status || 500).json({ message: err.message })
    }
  }
}
