import express from 'express'

import { Route, Get, Post, Middleware } from '../src'

// Example middleware functions
export function loggerMiddleware(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction
): void {
  console.log(`${req.method} ${req.path}`)
  next()
}

// Simple in-memory rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>()

export function rateLimitMiddleware(
  maxRequests: number = 100,
  windowMs: number = 6e4
) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const ip = req.ip
    const now = Date.now()
    const record = requestCounts.get(ip!)
    if (!record || now > record.resetTime) {
      requestCounts.set(ip!, {
        count: 1,
        resetTime: now + windowMs
      })
      next()
      return
    }
    if (record.count >= maxRequests) {
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: Math.ceil((record.resetTime - now) / 1_000)
      })
      return
    }
    record.count++
    next()
  }
}

@Route('/users')
@Middleware(loggerMiddleware)
@Middleware(rateLimitMiddleware(100, 6e4)) // 100 requests per minute
export class UserController {
  @Get('/')
  public async list() {
    return { users: [] }
  }

  @Post('/')
  public async create() {
    return { created: true }
  }
}

@Route('/products')
@Middleware(loggerMiddleware)
export class ProductController {
  @Get('/')
  @Middleware(rateLimitMiddleware(100, 6e4)) // 100 requests per minute for listing
  public async list() {
    return { products: [] }
  }

  @Post('/')
  @Middleware(rateLimitMiddleware(10, 6e4)) // 10 requests per minute for creation
  public async create() {
    return { created: true }
  }
}
