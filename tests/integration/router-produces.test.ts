import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

let app: express.Application
let routerFile = path.resolve(__dirname, 'generated-router-produces.ts')
let openapiFile = path.resolve(__dirname, 'generated-openapi-router-produces.json')

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, '../fixtures/controllers/controller-produces.ts')
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

describe('Produces controller', () => {
  test('Should return JSON with correct content type', async () => {
    const res = await request(app)
      .get('/api/produces/json')
      .expect(200)
      .expect('Content-Type', 'application/json; charset=utf-8')

    assert.deepStrictEqual(res.body, { id: '1', name: 'John Doe' })
  })

  test('Should return text with correct content type', async () => {
    const res = await request(app)
      .get('/api/produces/text')
      .expect(200)
      .expect('Content-Type', 'text/plain; charset=utf-8')

    assert.strictEqual(res.text, 'Hello, World!')
  })

  test('Should return XML with correct content type', async () => {
    const res = await request(app)
      .get('/api/produces/xml')
      .expect(200)
      .expect('Content-Type', 'application/xml; charset=utf-8')

    assert.strictEqual(res.text, '<user><id>1</id><name>John Doe</name></user>')
  })

  test('Should return binary with correct content type', async () => {
    const res = await request(app)
      .get('/api/produces/binary')
      .expect(200)
      .expect('Content-Type', 'application/octet-stream')

    assert.ok(Buffer.isBuffer(res.body) || typeof res.body === 'string')
  })

  test('Should return CSV with correct content type', async () => {
    const res = await request(app)
      .post('/api/produces/csv')
      .send({ users: [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }] })
      .expect(200)
      .expect('Content-Type', 'text/csv; charset=utf-8')

    assert.strictEqual(res.text, 'id,name\n1,John\n2,Jane')
  })

  test('Should return default JSON content type', async () => {
    const res = await request(app)
      .get('/api/produces/default')
      .expect(200)
      .expect('Content-Type', 'application/json; charset=utf-8')

    assert.deepStrictEqual(res.body, { id: '2', name: 'Jane Doe' })
  })

  test('Should return text from text controller', async () => {
    const res = await request(app)
      .get('/api/text-controller/info')
      .expect(200)
      .expect('Content-Type', 'text/plain; charset=utf-8')

    assert.strictEqual(res.text, 'This is text controller info')
  })

  test('Should handle query params in text controller', async () => {
    const res = await request(app)
      .get('/api/text-controller/details?format=custom')
      .expect(200)
      .expect('Content-Type', 'text/plain; charset=utf-8')

    assert.strictEqual(res.text, 'Details in custom format')
  })

  test('Should override controller-level produces with method-level', async () => {
    const res = await request(app)
      .get('/api/text-controller/json-override')
      .expect(200)
      .expect('Content-Type', 'application/json; charset=utf-8')

    assert.deepStrictEqual(res.body, { id: '3', name: 'Override User' })
  })
})
