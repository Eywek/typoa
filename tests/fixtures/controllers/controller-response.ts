import { Route, Get, Post, Put, Response, Controller, Security } from '../../../src'

// Define some common error types
type ErrorNotFound = { code: 'NOT_FOUND', message: string }
type ErrorBadRequest = { code: 'BAD_REQUEST', message: string }
type ErrorForbidden = { code: 'FORBIDDEN', message: string }
type ErrorUnauthorized = { code: 'UNAUTHORIZED', message: string }
type ErrorQuotaExceeded = { code: 'QUOTA_EXCEEDED', message: string }

type User = {
  id: string
  name: string
}

// Controller with responses at controller level
@Route('/api/users')
@Response<ErrorBadRequest>(400, 'Bad request - applied to all methods')
@Response<ErrorNotFound>(404, 'Resource not found - applied to all methods')
@Response<ErrorForbidden>(403, 'Forbidden - applied to all methods')
export class UserController extends Controller {
  @Get()
  public async listUsers(): Promise<User[]> {
    return [{ id: '1', name: 'User 1' }]
  }

  @Get('/{id}')
  public async getUser(): Promise<User> {
    return { id: '1', name: 'User 1' }
  }

  // This method overrides the 404 response from controller
  @Post()
  @Response<ErrorNotFound>(404, 'User not found - specific to this method')
  public async createUser(): Promise<User> {
    return { id: '1', name: 'User 1' }
  }

  @Put('/{id}')
  // This adds a specific error response not defined on controller
  @Response<{ error: { code: 'CONFLICT', message: string } }>(409, 'User already exists')
  public async updateUser(): Promise<User> {
    return { id: '1', name: 'User 1' }
  }
}

// Controller without controller level responses
@Route('/api/products')
export class ProductController extends Controller {
  @Get()
  // This method has its own response
  @Response<ErrorNotFound>(404, 'Product not found')
  public async listProducts(): Promise<{ products: string[] }> {
    return { products: ['Product 1'] }
  }

  @Post()
  // This method doesn't specify responses
  public async createProduct(): Promise<{ created: boolean }> {
    return { created: true }
  }
}

// Controller with mixed security and response
@Route('/api/admin')
@Security({ admin: ['read'] })
@Response<ErrorUnauthorized>(401, 'Unauthorized')
@Response<ErrorForbidden>(403, 'Forbidden')
export class AdminController extends Controller {
  @Get()
  public async getAdminInfo(): Promise<{ info: string }> {
    return { info: 'Admin info' }
  }

  @Post()
  @Security({ admin: ['write'] })
  @Response<ErrorQuotaExceeded>(429, 'Too many requests')
  public async createAdminResource(): Promise<{ created: boolean }> {
    return { created: true }
  }
}
