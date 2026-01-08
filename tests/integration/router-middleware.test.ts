import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

let app: express.Application
const routerFile = path.resolve(__dirname, 'generated-router-middleware.ts')
const openapiFile = path.resolve(__dirname, 'generated-openapi-router-middleware.json')

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, '../fixtures/controllers/controller-middleware.ts'),
      path.resolve(__dirname, '../fixtures/controllers/controller.ts'),
      path.resolve(__dirname, '../fixtures/controllers/controller-response.ts'),
      path.resolve(__dirname, '../fixtures/folder/*.ts')
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

describe('Content type and middleware', () => {
  test('Should reject unsupported content type', async () => {
    await request(app)
      .patch('/123')
      .set('Content-Type', 'text/html')
      .send('hey')
      .expect(400)

    // The server returns 400 because this route expects application/json body
  })

  test('Should use discriminator function correctly', async () => {
    const res = await request(app)
      .patch('/123?one')
      .send({ type: 'one' })
      .expect(200)

    assert.deepStrictEqual(res.body, { type: 'one' })
  })

  test('Should reject invalid discriminator', async () => {
    const res = await request(app)
      .patch('/123?one')
      .send({ type: 'two' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.type': { message: 'This property must be one of one', value: 'two' }
    })
  })

  test('Should handle security interceptor', async () => {
    const res = await request(app)
      .get('/api/admin')
      .expect(200)

    assert.deepStrictEqual(res.body, { scopes: { admin: ['read'] } })
  })

  test('Should handle controller-level security', async () => {
    const res = await request(app)
      .get('/my-2nd-controller')
      .expect(200)

    assert.deepStrictEqual(res.body, { scopes: { company: [] } })
  })

  test('Should return 204 for no-content endpoint', async () => {
    const res = await request(app)
      .get('/undefined')
      .expect(204)

    assert.strictEqual(res.text, '')
  })

  test('Should not validate body for file uploads', async () => {
    const res = await request(app)
      .post('/file')
      .set('content-type', 'multipart/form-data')
      .send('')
      .expect(200)

    assert.deepStrictEqual(res.body, { scopes: { company: ['my-scope'] } })
  })

  test('Should remove extra properties from response', async () => {
    const res = await request(app)
      .get('/list')
      .expect(200)

    assert.deepStrictEqual(res.body, {})
  })
})
