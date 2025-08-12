import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, before } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

// Test data used across multiple tests
const validBody = {
  string: 'my-string',
  stringWithPattern: 'FOO',
  stringWithFormat: new Date(),
  stringEnum: 'foo',
  nullable: null,
  number: 1,
  numberWithMinAndMax: 5,
  numberEnum: 4,
  boolean: false,
  tuple: ['foo', 1],
  array: ['bar'],
  object: { ignored: 1 },
  record: { foo: '1' },
  mappedType: { foo: 1 },
  objectWithProps: { string: 'my-string' },
  union: { foo: 'bar' },
  intersection: { foo: 'bar', bar: 'foo' },
  readonlyProp: 'my prop',
  class: {},
  unionAdditionalProps: { foo: '1', bar: '2' }
}

let app: express.Application
let routerFile = path.resolve(__dirname, 'generated-core.ts')
let openapiFile = path.resolve(__dirname, 'generated-openapi-core.json')

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, '../fixtures/controllers/controller-core.ts'),
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
      validateResponse: false,
      runtimeImport: '../../src'
    }
  })

  // Create Express app
  app = express()
  app.use(express.json())

  const { bindToRouter } = await import(routerFile);
  bindToRouter(app)
  
  app.use(createErrorHandler())
})

test('Should throw error on GET /', async () => {
  const res = await request(app)
    .get('/my-route')
    .expect(500)

  assert.strictEqual(res.body.message, 'My get error')
})

test('Should accept valid request body', async () => {
  const res = await request(app)
    .post('/my-route?my-query-param&my-default-param=bar')
    .set('x-custom-header', 'my-header')
    .send(validBody)
    .expect(201)

  assert.strictEqual(res.headers['x-foo'], 'bar')

  assert.deepStrictEqual(res.body, Object.assign({}, validBody, {
    stringWithFormat: validBody.stringWithFormat.toISOString(),
    url: '/my-route?my-query-param&my-default-param=bar',
    formatIsDate: false, // Date is serialized to string over HTTP, so instanceof Date is false
    queryParam: '',
    class: { foo: 'bar' },
    defaultParam: 'bar',
    bool: false
  }))
})

test('Should parse bool param without value as true', async () => {
  const res = await request(app)
    .post('/my-controller/?my-bool')
    .set('x-custom-header', 'my-header')
    .send(validBody)
    .expect(201)

  assert.strictEqual(res.body.bool, true)
})
