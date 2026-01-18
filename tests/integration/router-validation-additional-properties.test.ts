import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'
import { randomUUID } from 'node:crypto'

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
  object: { ignored: 1 },
  objectWithProps: { string: 'my-string' },
  readonlyProp: 'my prop',
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
const routerFile = path.resolve(__dirname, 'generated-router-validation-additional-properties.ts')
const openapiFile = path.resolve(
  __dirname,
    'generated-openapi-router-validation-additional-properties.json'
)

before(async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
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
      validateResponse: false,
      runtimeImport: '../../src'
    },
    features: {
      enableThrowOnUnexpectedAdditionalData: true
    }
  })

  // Create Express app
  app = express()
  app.use(express.json())

  const { bindToRouter } = await import(routerFile)
  bindToRouter(app)

  app.use(createErrorHandler())
})

describe('Additional properties', () => {
  test('Should reject if a given property does not exist in the schema', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, [randomUUID()]: 'random' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.object': {
        message: 'Additional properties are not allowed. Found: ignored',
        value: {
          ignored: 1
        }
      }
    })
  })
})
