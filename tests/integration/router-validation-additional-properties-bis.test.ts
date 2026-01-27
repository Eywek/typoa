import path from 'path'
import express from 'express'
import request from 'supertest'
import { test, describe, before, after } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'
import { randomUUID } from 'node:crypto'
import { setRuntimeOptions } from '../../src/index'

// Complete validBody with all required fields for testing
const validBody = {
  anyOnly: 'any-value',
  array: ['bar'],
  boolean: false,
  class: {},
  intersection: { foo: 'bar', bar: 'foo' },
  mappedType: { foo: 1 },
  nullable: null,
  number: 1,
  numberEnum: 4,
  numberWithMinAndMax: 5,
  objectWithProps: { string: 'my-string' },
  record: { foo: '1' },
  string: 'my-string',
  stringEnum: 'foo',
  stringWithFormat: new Date(),
  stringWithPattern: 'FOO',
  tuple: ['foo', 1],
  union: { foo: 'bar' },
  unionAdditionalProps: { foo: '1', bar: '2' }
}

let app: express.Application
const routerFile = path.resolve(
  __dirname,
  'generated-router-validation-additional-properties-bis.ts'
)
const openapiFile = path.resolve(
  __dirname,
  'generated-openapi-router-validation-additional-properties-bis.json'
)

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, '../fixtures/controllers/controller-bis.ts')
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
      validateResponse: false,
      runtimeImport: '../../src'
    }
  })

  setRuntimeOptions({
    features: { enableThrowOnUnexpectedAdditionalData: true }
  })

  // Create Express app
  app = express()
  app.use(express.json())

  const { bindToRouter } = await import(routerFile)
  bindToRouter(app)

  app.use(createErrorHandler())
})

after(async () => {
  // Reset runtime options to defaults to prevent affecting other tests
  setRuntimeOptions({
    features: {
      enableThrowOnUnexpectedAdditionalData: false
    }
  })
})

describe('when typoa reject additional properties and validBody accepts it explicitly with jsdoc', () => {
  test('should accept the request', async () => {
    const id = randomUUID()
    await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, [id]: 'random' })
      .expect(201)
  })
})
