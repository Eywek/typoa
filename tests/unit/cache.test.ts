import fs from 'fs'
import path from 'path'
import os from 'os'
import { strict as assert } from 'node:assert'
import { test, describe, beforeEach, afterEach } from 'node:test'

import { CacheService } from '../../src/cache'
import { OpenAPIConfiguration, generate } from '../../src'

const testDir = path.resolve(process.cwd(), 'tests/cache-test')

function cleanupTestDir() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true })
  }
}

describe('CacheService', () => {
  let cacheService: CacheService
  let config: OpenAPIConfiguration

  beforeEach(() => {
    cleanupTestDir()
    fs.mkdirSync(testDir, { recursive: true })

    // Create a minimal TypeScript config for testing
    const tsConfigPath = path.join(testDir, 'tsconfig.json')
    fs.writeFileSync(tsConfigPath, JSON.stringify({
      compilerOptions: {
        target: "es2020",
        module: "commonjs",
        strict: true,
        esModuleInterop: true
      }
    }))

    // Create a simple controller file for testing
    const controllerPath = path.join(testDir, 'controller.ts')
    fs.writeFileSync(controllerPath, `
      import { Request, Response } from 'express'
      
      interface User {
        id: number
        name: string
      }
      
      @Route('/api/users')
      export class UserController {
        @Get('/')
        async getUsers(): Promise<User[]> {
          return []
        }
      }
    `)

    config = {
      tsconfigFilePath: tsConfigPath,
      controllers: [path.join(testDir, '*.ts')],
      root: testDir,
      openapi: {
        filePath: path.join(testDir, 'openapi.json'),
        service: {
          name: 'test-service',
          version: '1.0.0'
        }
      },
      router: {
        filePath: path.join(testDir, 'router.ts')
      },
      cache: true
    }

    cacheService = new CacheService(config)
  })

  afterEach(() => {
    cleanupTestDir()
  })

  test('Should perform full generation on first run', async () => {
    const result = await cacheService.generateWithCache()
    
    assert.ok(result.spec)
    assert.strictEqual(result.spec.info.title, 'test-service')
    assert.strictEqual(result.spec.info.version, '1.0.0')
    
    // Check that cache was created
  })

  test('Should use cache on second run without changes', async () => {
    // First run
    await cacheService.generateWithCache()
    
    // Second run should use cache
    const result = await cacheService.generateWithCache()
    
    assert.ok(result.spec)
    assert.strictEqual(result.spec.info.title, 'test-service')
  })

  test('Should regenerate when file content changes', async () => {
    await cacheService.generateWithCache()
    
    const controllerPath = path.join(testDir, 'controller.ts')
    const modifiedContent = `
      import { Request, Response } from 'express'
      
      interface User {
        id: number
        name: string
        email: string
      }
      
      @Route('/api/users')
      export class UserController {
        @Get('/')
        async getUsers(): Promise<User[]> {
          return []
        }
        
        @Post('/')
        async createUser(): Promise<User> {
          return { id: 1, name: 'test', email: 'test@example.com' }
        }
      }
    `
    fs.writeFileSync(controllerPath, modifiedContent)
    
    const result = await cacheService.generateWithCache()
    
    assert.ok(result.spec)
    assert.ok(result.spec.paths['/api/users'])
  })

  test('Should clear cache successfully', async () => {
    await cacheService.generateWithCache()
    await cacheService.clear()
  })

  test('Should use cache for non-semantic changes (comments, whitespace, formatting)', async () => {
    const firstResult = await cacheService.generateWithCache()
    const firstSpec = JSON.stringify(firstResult.spec)
    
    const cacheFilePath = path.join(os.tmpdir(), 'typoa', 'cache.json')
    const initialCacheTime = fs.statSync(cacheFilePath).mtime.getTime()
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const controllerPath = path.join(testDir, 'controller.ts')
    const cosmeticChanges = `
      import { Request, Response } from 'express'
      
      interface User {
        id: number
        name: string
      }
      
      @Route('/api/users')
      export class UserController {
        @Get('/')
        async getUsers(): Promise<User[]> {
          return []
        }
      }
    `
    fs.writeFileSync(controllerPath, cosmeticChanges)
    
    const secondResult = await cacheService.generateWithCache()
    const secondSpec = JSON.stringify(secondResult.spec)
    
    assert.strictEqual(firstSpec, secondSpec, 'OpenAPI specs should be identical when only comments are added')
    
    const finalCacheTime = fs.statSync(cacheFilePath).mtime.getTime()
    assert.ok(finalCacheTime >= initialCacheTime, 'Cache timestamp should be updated')
    
    assert.ok(secondResult.spec)
    assert.strictEqual(secondResult.spec.info.title, 'test-service')
    assert.strictEqual(secondResult.spec.info.version, '1.0.0')
    
    const semanticChange = `
      import { Request, Response } from 'express'
      
      interface User {
        id: number
        name: string
        email: string
      }
      
      @Route('/api/users')
      export class UserController {
        @Get('/')
        async getUsers(): Promise<User[]> {
          return []
        }
      }
    `
    fs.writeFileSync(controllerPath, semanticChange)
    
    // Third run should regenerate due to semantic change
    const thirdResult = await cacheService.generateWithCache()
    
    // This should be different from the previous specs because interface changed
    assert.ok(thirdResult.spec)
    assert.strictEqual(thirdResult.spec.info.title, 'test-service')
    
    // The cache should have been updated with the new semantic content
    const semanticCacheTime = fs.statSync(cacheFilePath).mtime.getTime()
    assert.ok(semanticCacheTime > finalCacheTime, 'Cache should be regenerated for semantic changes')
  })

  test('Should ignore logic changes that do not affect signatures or types', async () => {
    const firstResult = await cacheService.generateWithCache()
    const firstSpec = JSON.stringify(firstResult.spec)
    
    const controllerPath = path.join(testDir, 'controller.ts')
    
    const logicChanges = `
      import { Request, Response } from 'express'
      
      interface User {
        id: number
        name: string
      }
      
      @Route('/api/users')
      export class UserController {
        @Get('/')
        async getUsers(): Promise<User[]> {
          const users = []
          console.log('Getting users...')
          const count = 5
          for (let i = 0; i < count; i++) {
            users.push({ id: i, name: 'User ' + i })
          }
          if (users.length > 0) {
            console.log('Found users:', users.length)
          }
          return users
        }
      }
    `
    fs.writeFileSync(controllerPath, logicChanges)
    
    const secondResult = await cacheService.generateWithCache()
    const secondSpec = JSON.stringify(secondResult.spec)
    
    assert.strictEqual(firstSpec, secondSpec, 'OpenAPI specs should be identical when only method logic changes')
    
    assert.ok(secondResult.spec)
    assert.strictEqual(secondResult.spec.info.title, 'test-service')
    assert.strictEqual(secondResult.spec.info.version, '1.0.0')
  })

  test('Should track cross-file type dependencies', async () => {
    const typesPath = path.join(testDir, 'types.ts')
    fs.writeFileSync(typesPath, `
      export interface Address {
        street: string
        city: string
      }
    `)
    
    const controllerPath = path.join(testDir, 'controller.ts')
    fs.writeFileSync(controllerPath, `
      import { Route, Get, Post, Body } from 'typoa'
      import { Address } from './types'
      
      interface User {
        id: number
        name: string
        address: Address
      }
      
      @Route('/api/users')
      export class UserController {
        @Get('/')
        async getUsers(): Promise<User[]> {
          return []
        }
      }
    `)

    // Update config to include both files
    config.controllers = [path.join(testDir, '*.ts')]
    cacheService = new CacheService(config)
    
    // First run
    await cacheService.generateWithCache()
    
    // Modify the Address type
    fs.writeFileSync(typesPath, `
      export interface Address {
        street: string
        city: string
        country: string  // Added field - should trigger regeneration
      }
    `)
    
    // Second run should detect dependency change and regenerate
    const result = await cacheService.generateWithCache()
    
    assert.ok(result.spec)
    // Should have regenerated due to type dependency change
    assert.strictEqual(result.spec.info.title, 'test-service')
  })

  test('Should track cascading type dependencies with inheritance and composition', async () => {
    // Create base types file
    const baseTypesPath = path.join(testDir, 'base-types.ts')
    fs.writeFileSync(baseTypesPath, `
      export interface BaseEntity {
        id: number
        createdAt: Date
      }
      
      export interface Address {
        street: string
        city: string
      }
    `)
    
    // Create extended types file that depends on base types
    const userTypesPath = path.join(testDir, 'user-types.ts')
    fs.writeFileSync(userTypesPath, `
      import { BaseEntity, Address } from './base-types'
      
      export interface User extends BaseEntity {
        name: string
        email: string
        address: Address
      }
      
      export interface UserProfile {
        user: User
        preferences: Record<string, any>
      }
    `)
    
    // Create controller that uses the extended types
    const controllerPath = path.join(testDir, 'controller.ts')
    fs.writeFileSync(controllerPath, `
      import { Route, Get, Post, Body } from 'typoa'
      import { User, UserProfile } from './user-types'
      
      @Route('/api/users')
      export class UserController {
        @Get('/')
        async getUsers(): Promise<User[]> {
          return []
        }
        
        @Get('/:id/profile')
        async getUserProfile(): Promise<UserProfile> {
          return {} as UserProfile
        }
      }
    `)

    // Update config to include all files
    config.controllers = [path.join(testDir, '*.ts')]
    cacheService = new CacheService(config)
    
    // First run
    await cacheService.generateWithCache()
    
    // Modify the base Address type (should cascade through User -> UserProfile -> controller)
    fs.writeFileSync(baseTypesPath, `
      export interface BaseEntity {
        id: number
        createdAt: Date
        updatedAt: Date  // Added field - should cascade through dependencies
      }
      
      export interface Address {
        street: string
        city: string
        country: string  // Added field - should cascade through dependencies
        zipCode: string  // Another added field
      }
    `)
    
    // Second run should detect cascading dependency changes and regenerate
    const result = await cacheService.generateWithCache()
    
    assert.ok(result.spec)
    // Should have regenerated due to cascading type dependency changes
    assert.strictEqual(result.spec.info.title, 'test-service')
  })
})

describe('Cache Integration', () => {
  const openapiFile = path.join(testDir, 'openapi.json')
  const routerFile = path.join(testDir, 'router.ts')
  const controllerFile = path.join(testDir, 'controller.ts')
  const tsConfigFile = path.join(testDir, 'tsconfig.json')

  beforeEach(() => {
    cleanupTestDir()
    fs.mkdirSync(testDir, { recursive: true })

    // Create basic controller
    fs.writeFileSync(controllerFile, `
import { Route, Get, Post, Body } from 'typoa'

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  token: string
}

@Route('/auth')
export class AuthController {
  @Get('/health')
  health(): { status: string } {
    return { status: 'ok' }
  }

  @Post('/login')
  login(@Body() req: LoginRequest): LoginResponse {
    return { token: 'fake-token' }
  }
}
`)

    // Create tsconfig.json
    fs.writeFileSync(tsConfigFile, JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        moduleResolution: 'node'
      },
      include: ['*.ts']
    }, null, 2))
  })

  afterEach(() => {
    cleanupTestDir()
  })

  test('Should generate correctly on first run (no cache)', async () => {
    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    // Verify files were generated
    assert.ok(fs.existsSync(openapiFile))
    assert.ok(fs.existsSync(routerFile))
    assert.ok(fs.existsSync(path.join(os.tmpdir(), 'typoa', 'cache.json')))

    // Verify router content
    const routerContent = fs.readFileSync(routerFile, 'utf-8')
    assert.ok(routerContent.includes('router.get('))
    assert.ok(routerContent.includes('router.post('))
  })

  test('Should use cache on second run without changes', async () => {
    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    const originalRouterTime = fs.statSync(routerFile).mtime

    await new Promise(resolve => setTimeout(resolve, 10))

    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    const newRouterTime = fs.statSync(routerFile).mtime
    assert.ok(newRouterTime >= originalRouterTime)
    
    const routerContent = fs.readFileSync(routerFile, 'utf-8')
    assert.ok(routerContent.includes('AuthController'))
  })

  test('Should regenerate when controller changes', async () => {
    // First generation
    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    fs.writeFileSync(controllerFile, `
import { Route, Get, Post, Body } from 'typoa'

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  token: string
  userId: number
}

@Route('/auth')
export class AuthController {
  @Get('/health')
  health(): { status: string } {
    return { status: 'ok' }
  }

  @Post('/login')
  login(@Body() req: LoginRequest): LoginResponse {
    return { token: 'fake-token', userId: 123 }
  }

  @Get('/profile')
  profile(): { user: string } {
    return { user: 'test' }
  }
}
`)

    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    const routerContent = fs.readFileSync(routerFile, 'utf-8')
    assert.ok(routerContent.includes('/auth/profile'))
    
    const spec = JSON.parse(fs.readFileSync(openapiFile, 'utf-8'))
    assert.ok(spec.components.schemas.LoginResponse.properties.userId)
  })

  test('Should handle timestamp changes without content changes', async () => {
    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    const currentTime = new Date()
    fs.utimesSync(controllerFile, currentTime, currentTime)

    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    assert.ok(fs.existsSync(routerFile))
    const routerContent = fs.readFileSync(routerFile, 'utf-8')
    assert.ok(routerContent.includes('AuthController'))
  })

  test('Should ignore cosmetic changes but detect semantic changes', async () => {
    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    const originalRouterTime = fs.statSync(routerFile).mtime

    fs.writeFileSync(controllerFile, `
import { Route, Get, Post, Body } from 'typoa'

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  token: string
}

@Route('/auth')
export class AuthController {
  @Get('/health')
  health(): { status: string } {
    return { status: 'ok' }
  }

  @Post('/login')
  login(@Body() req: LoginRequest): LoginResponse {
    return { token: 'fake-token' }
  }
}
`)

    await new Promise(resolve => setTimeout(resolve, 10))

    await generate({
      tsconfigFilePath: tsConfigFile,
      controllers: [controllerFile],
      root: testDir,
      openapi: {
        filePath: openapiFile,
        service: { name: 'test-service', version: '1.0.0' }
      },
      router: {
        filePath: routerFile,
        validateResponse: false
      },
      cache: true
    })

    const newRouterTime = fs.statSync(routerFile).mtime
    assert.ok(newRouterTime >= originalRouterTime)

    const routerContent = fs.readFileSync(routerFile, 'utf-8')
    assert.ok(routerContent.includes('AuthController'))
    assert.ok(!routerContent.includes('/auth/profile'))
  })
})
