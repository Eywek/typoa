import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

let app: express.Application
const routerFile = path.resolve(__dirname, 'generated-router-xenum-varnames.ts')
const openapiFile = path.resolve(
  __dirname,
  'generated-openapi-router-xenum-varnames.json'
)

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, '../fixtures/validation/xenum-varnames-test.ts')
    ],
    openapi: {
      filePath: openapiFile,
      service: {
        name: 'my-service',
        version: '1.0.0'
      },
      xEnumVarnames: true
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

describe('Enum names validation', () => {
  test('Should handle named enums', async () => {
    const res = await request(app)
      .get(`/xenum-var-names-test/container?country=de_DE`)
      .expect(200)
    assert.ok(typeof res.body === 'object')
  })
})
