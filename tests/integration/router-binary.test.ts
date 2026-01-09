import express from 'express'
import { strict as assert } from 'node:assert'
import { before, describe, test } from 'node:test'
import path from 'path'
import request from 'supertest'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

let app: express.Application
const routerFile = path.resolve(__dirname, 'generated-router-binary.ts')
const openapiFile = path.resolve(
  __dirname,
  'generated-openapi-router-binary.json'
)

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(
        __dirname,
        '../fixtures/controllers/controller-binary-format.ts'
      ),
      path.resolve(__dirname, '../fixtures/controllers/controller.ts')
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
      securityMiddlewarePath: path.resolve(
        __dirname,
        '../fixtures/security-middleware.ts'
      ),
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

describe('Binary format and file handling', () => {
  test('Should return octet-stream binary data', async () => {
    const res = await request(app)
      .get('/api/binary/octet-stream')
      .expect(200)
      .expect('Content-Type', 'application/octet-stream')

    assert.ok(Buffer.isBuffer(res.body) || typeof res.body === 'string')
  })

  test('Should return PNG binary data', async () => {
    const res = await request(app)
      .get('/api/binary/png')
      .expect(200)
      .expect('Content-Type', 'image/png')

    assert.ok(Buffer.isBuffer(res.body) || typeof res.body === 'string')
  })

  test('Should return PDF binary data', async () => {
    const res = await request(app)
      .get('/api/binary/pdf')
      .expect(200)
      .expect('Content-Type', 'application/pdf')

    assert.ok(Buffer.isBuffer(res.body) || typeof res.body === 'string')
  })

  test('Should return JSON for comparison', async () => {
    const res = await request(app)
      .get('/api/binary/json')
      .expect(200)
      .expect('Content-Type', 'application/json; charset=utf-8')

    assert.deepStrictEqual(res.body, {
      id: '1',
      name: 'John Doe'
    })
  })

  test('Should accept PNG upload', async () => {
    const pngBuffer = Buffer.from('fake png data')

    await request(app)
      .post('/api/binary/upload-png')
      .set('Content-Type', 'image/png')
      .send(pngBuffer)
      .expect(200)
  })

  test('Should accept PDF upload', async () => {
    const pdfBuffer = Buffer.from('fake pdf data')

    await request(app)
      .post('/api/binary/upload-pdf')
      .set('Content-Type', 'application/pdf')
      .send(pdfBuffer)
      .expect(200)
  })

  test('Should accept multipart/form-data file upload', async () => {
    const res = await request(app)
      .post('/file')
      .field('file', 'fake file content')
      .expect(200)

    // Security middleware returns scope object
    assert.deepStrictEqual(res.body, {
      scopes: { company: ['my-scope'] }
    })
  })

  test('Should not validate body for file uploads', async () => {
    const res = await request(app)
      .post('/file')
      .set('content-type', 'multipart/form-data')
      .send('')
      .expect(200)

    // Security middleware returns scope object
    assert.deepStrictEqual(res.body, {
      scopes: { company: ['my-scope'] }
    })
  })

  test('Should handle empty file upload gracefully', async () => {
    await request(app).post('/file').field('file', '').expect(200)
  })

  test('Should handle large text file upload', async () => {
    const largeContent = 'x'.repeat(10000)

    await request(app).post('/file').field('file', largeContent).expect(200)
  })
})
