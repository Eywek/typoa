import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

// Complete validBody with all required fields for testing
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
  anyOnly: 'any-value',
  unionAdditionalProps: { foo: '1', bar: '2' }
}

let app: express.Application
const routerFile = path.resolve(__dirname, 'generated-router-validation.ts')
const openapiFile = path.resolve(
  __dirname,
  'generated-openapi-router-validation.json'
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
    }
  })

  // Create Express app
  app = express()
  app.use(express.json())

  const { bindToRouter } = await import(routerFile)
  bindToRouter(app)

  app.use(createErrorHandler())
})

describe('Basic type validation', () => {
  test('Should reject invalid string type', async () => {
    const res = await request(app)
      .post('/my-route')
      .send({ string: 1 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'x-custom-header': { message: 'Param is required' }
    })
  })

  test('Should reject invalid number type', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, number: 'not a number' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.number': {
        message: 'This property must be a number',
        value: 'not a number'
      }
    })
  })

  test('Should reject invalid boolean type', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, boolean: 10 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.boolean': {
        message: 'This property must be a boolean',
        value: 10
      }
    })
  })

  for (const val of [true, false, 'true', 'false', 1, 0, '1', '0']) {
    test(`Should accept boolean value: ${JSON.stringify(val)}`, async () => {
      await request(app)
        .post('/my-controller/')
        .set('x-custom-header', 'my-header')
        .send({ ...validBody, boolean: val })
        .expect(201)
    })
  }

  test('Should reject non-array for array field', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, array: {} })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.array': {
        message: 'This property must be an array',
        value: {}
      }
    })
  })

  test('Should reject invalid tuple', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, tuple: [{}] })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.tuple.0': {
        message: 'Found no matching schema for provided value',
        value: {}
      }
    })
  })

  test('Should reject null for non-nullable field', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, intersection: null })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.intersection': {
        message: 'This property is not nullable'
      }
    })
  })

  test('Should accept null for nullable field', async () => {
    await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, nullable: null })
      .expect(201)
  })
})

describe('Format and constraint validation', () => {
  test('Should reject string pattern mismatch', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, stringWithPattern: '1' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.stringWithPattern': {
        message: 'This property must match the pattern: /[A-Z]+/',
        value: '1'
      }
    })
  })

  test('Should reject invalid date format', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({
        ...validBody,
        stringWithFormat: 'invalid-date'
      })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.stringWithFormat': {
        message: 'This property must be a valid date',
        value: 'invalid-date'
      }
    })
  })

  test('Should reject invalid enum value', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, stringEnum: 'not in enum' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.stringEnum': {
        message: 'This property must be one of foo,bar',
        value: 'not in enum'
      }
    })
  })

  test('Should reject invalid number enum', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, numberEnum: 300 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.numberEnum': {
        message: 'This property must be one of 4,6',
        value: 300
      }
    })
  })

  test('Should reject number below minimum', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, numberWithMinAndMax: 3 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.numberWithMinAndMax': {
        message: 'This property must be >= 4',
        value: 3
      }
    })
  })

  test('Should reject number above maximum', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, numberWithMinAndMax: 11 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.numberWithMinAndMax': {
        message: 'This property must be <= 10',
        value: 11
      }
    })
  })

  test('Should accept valid pattern', async () => {
    await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, stringWithPattern: 'ABC' })
      .expect(201)
  })

  test('Should accept valid enum values', async () => {
    await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({
        ...validBody,
        stringEnum: 'bar',
        numberEnum: 6
      })
      .expect(201)
  })

  test('Should accept valid number range', async () => {
    await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, numberWithMinAndMax: 7 })
      .expect(201)
  })
})
