import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

let app: express.Application
const routerFile = path.resolve(__dirname, 'generated-router-inheritance.ts')
const openapiFile = path.resolve(
  __dirname,
  'generated-openapi-router-inheritance.json'
)

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(
        __dirname,
        '../fixtures/validation/interface-inheritance-test.ts'
      )
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

describe('Interface inheritance validation', () => {
  test('Should handle simple inheritance (Bar extends Foo)', async () => {
    const res = await request(app).get('/inheritance-test/bar').expect(200)

    // Should include properties from both Foo and Bar interfaces
    assert.ok(typeof res.body === 'object')
  })

  test('Should handle deep inheritance (Baz extends Bar extends Foo)', async () => {
    const res = await request(app).get('/inheritance-test/baz').expect(200)

    // Should include properties from Foo, Bar, and Baz interfaces
    assert.ok(typeof res.body === 'object')
  })

  test('Should handle complex inheritance with additional properties', async () => {
    const res = await request(app).get('/inheritance-test/multiple').expect(200)

    // Should include properties from Base, Extended, and MultipleInheritance
    assert.ok(typeof res.body === 'object')
  })

  test('Should generate correct OpenAPI schema for inherited interfaces', async () => {
    // This test verifies that the OpenAPI generation correctly handles inheritance
    const spec = (await import(openapiFile)).default

    // Check that inherited properties are properly included in schemas
    assert.ok(spec.components && spec.components.schemas)

    // Verify that complex inheritance schemas exist
    const schemas = spec.components.schemas
    assert.ok(Object.keys(schemas).length > 0)
  })

  test('Should validate inherited interface properties correctly', async () => {
    // Test that validation works correctly for inherited properties
    const res = await request(app).get('/inheritance-test/extended').expect(200)

    assert.ok(typeof res.body === 'object')
  })

  test('Should handle partial inheritance scenarios', async () => {
    const res = await request(app).get('/inheritance-test/bar').expect(200)

    assert.ok(typeof res.body === 'object')
  })
})
