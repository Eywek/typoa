import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

let app: express.Application
const routerFile = path.resolve(__dirname, 'generated-router-responses.ts')
const openapiFile = path.resolve(__dirname, 'generated-openapi-router-responses.json')

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, '../fixtures/controllers/controller-response.ts')
    ],
    openapi: {
      filePath: openapiFile,
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: routerFile,
      securityMiddlewarePath: path.resolve(__dirname, '../fixtures/security-middleware.ts'),
      validateResponse: true,
      runtimeImport: '../../src'
    }
  })

  // Create Express app
  app = express()
  app.use(express.json())

  const { bindToRouter } = await import(routerFile)
  bindToRouter(app)

  app.use(createErrorHandler())
})

describe('Response controller', () => {
  test('Should list users successfully', async () => {
    const res = await request(app)
      .get('/api/users')
      .expect(200)

    assert.deepStrictEqual(res.body, [{ id: '1', name: 'User 1' }])
  })

  test('Should get user by id', async () => {
    const res = await request(app)
      .get('/api/users/1')
      .expect(200)

    assert.deepStrictEqual(res.body, { id: '1', name: 'User 1' })
  })

  test('Should create user', async () => {
    const res = await request(app)
      .post('/api/users')
      .expect(200)

    assert.deepStrictEqual(res.body, { id: '1', name: 'User 1' })
  })

  test('Should update user', async () => {
    const res = await request(app)
      .put('/api/users/1')
      .expect(200)

    assert.deepStrictEqual(res.body, { id: '1', name: 'User 1' })
  })

  test('Should list products', async () => {
    const res = await request(app)
      .get('/api/products')
      .expect(200)

    assert.deepStrictEqual(res.body, { products: ['Product 1'] })
  })

  test('Should create product', async () => {
    const res = await request(app)
      .post('/api/products')
      .expect(200)

    assert.deepStrictEqual(res.body, { created: true })
  })

  test('Should get admin info', async () => {
    const res = await request(app)
      .get('/api/admin')
      .expect(200)

    assert.deepStrictEqual(res.body, { scopes: { admin: ['read'] } })
  })

  test('Should create admin resource', async () => {
    const res = await request(app)
      .post('/api/admin')
      .expect(200)

    assert.deepStrictEqual(res.body, { scopes: { admin: ['read'] } })
  })
})
