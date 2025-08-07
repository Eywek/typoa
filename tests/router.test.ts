import path from 'path'
import fs from 'fs'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../src'

let app: express.Application

before(async () => {
  // Generate router
  const tmpFile = path.resolve(__dirname, './fixture/router.ts')
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, './fixture/router-controller.ts'),
      path.resolve(__dirname, './fixture/folder/*.ts')
    ],
    openapi: {
      filePath: '/tmp/openapi.json',
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: tmpFile,
      securityMiddlewarePath: path.resolve(__dirname, './fixture/security-middleware.ts'),
      validateResponse: true
    }
  })

  const routerContent = (await fs.promises.readFile(tmpFile)).toString()
  await fs.promises.writeFile(tmpFile, routerContent.replace(/typoa/g, '../../src'))

  // Create Express app
  app = express()
  app.use(express.json())

  const { bindToRouter } = require(tmpFile)
  bindToRouter(app)

  // Error handler for proper test response formatting
  function errorHandler (err: any, req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (err.name === 'ValidateError') {
      if (err.fields && Object.keys(err.fields).length > 0) {
        res.status(err.status || 400).json({ fields: err.fields })
      } else {
        res.status(err.status || 400).json({ message: err.message })
      }
    } else {
      res.status(err.status || 500).json({ message: err.message })
    }
  }
  app.use(errorHandler)
})

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

test('Should throw error on GET /', async () => {
  const res = await request(app)
    .get('/my-controller/')
    .expect(500)

  assert.strictEqual(res.body.message, 'My get error')
})

test('Should accept valid request body', async () => {
  const res = await request(app)
    .post('/my-controller/?my-query-param&my-default-param=bar')
    .set('x-custom-header', 'my-header')
    .send(validBody)
    .expect(201)

  assert.strictEqual(res.headers['x-foo'], 'bar')

  delete (validBody as any).object.ignored
  delete (validBody as any).readonlyProp

  assert.deepStrictEqual(res.body, Object.assign({}, validBody, {
    stringWithFormat: validBody.stringWithFormat.toISOString(),
    url: '/my-controller/?my-query-param&my-default-param=bar',
    formatIsDate: true,
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

describe('Request validation', () => {
  test('Should reject missing required header', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .send(validBody)
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'x-custom-header': { message: 'Param is required' }
    })
  })

  test('Should reject invalid string type', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, string: 1 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.string': { message: 'This property must be a string', value: 1 }
    })
  })

  test('Should reject string pattern mismatch', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, stringWithPattern: '1' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.stringWithPattern': { message: 'This property must match the pattern: /[A-Z]+/', value: '1' }
    })
  })

  test('Should reject invalid date format', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, stringWithFormat: 'invalid-date' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.stringWithFormat': { message: 'This property must be a valid date', value: 'invalid-date' }
    })
  })

  test('Should reject invalid enum value', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, stringEnum: 'not in enum' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.stringEnum': { message: 'This property must be one of foo,bar', value: 'not in enum' }
    })
  })

  test('Should reject undefined nullable field', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, nullable: undefined })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.nullable': { message: 'This property is required' }
    })
  })

  test('Should reject invalid number type', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, number: 'not a number' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.number': { message: 'This property must be a number', value: 'not a number' }
    })
  })

  test('Should reject number below minimum', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, numberWithMinAndMax: 3 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.numberWithMinAndMax': { message: 'This property must be >= 4', value: 3 }
    })
  })

  test('Should reject number above maximum', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, numberWithMinAndMax: 11 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.numberWithMinAndMax': { message: 'This property must be <= 10', value: 11 }
    })
  })

  test('Should reject invalid number enum', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, numberEnum: 300 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.numberEnum': { message: 'This property must be one of 4,6', value: 300 }
    })
  })

  test('Should reject invalid boolean type', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, boolean: 10 })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.boolean': { message: 'This property must be a boolean', value: 10 }
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

  test('Should reject invalid tuple', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, tuple: [{}] })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.tuple.0': { message: 'Found no matching schema for provided value', value: {} }
    })
  })

  test('Should reject non-array for array field', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, array: {} })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.array': { message: 'This property must be an array', value: {} }
    })
  })

  test('Should reject invalid additional properties', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, record: { foo: 1 } })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.record.foo': { message: 'This property must be a string', value: 1 }
    })
  })

  test('Should reject non-object for object field', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, object: 'foo' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.object': { message: 'This property must be an object', value: 'foo' }
    })
  })

  test('Should reject array when object expected', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, object: [] })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.object': { message: 'This property must be an object', value: [] }
    })
  })

  test('Should reject invalid union type', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, union: { bar: 'bar' } })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.union': { message: 'Found no matching schema for provided value', value: { bar: 'bar' } }
    })
  })

  test('Should reject invalid intersection type', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, intersection: { foo: 'bar', bar: 'bar' } })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.intersection.1.bar': { message: 'This property must be one of foo', value: 'bar' }
    })
  })

  test('Should reject null for non-nullable field', async () => {
    const res = await request(app)
      .post('/my-controller/')
      .set('x-custom-header', 'my-header')
      .send({ ...validBody, intersection: null })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.intersection': { message: 'This property is not nullable' }
    })
  })

  for (const type of ['any', 'unknown']) {
    test(`Should accept various values for ${type} type`, async () => {
      const testValues = [3, [], {}, '3', { foo: 1 }]

      for (const value of testValues) {
        await request(app)
          .post('/my-controller/')
          .set('x-custom-header', 'my-header')
          .send({ ...validBody, [type]: value })
          .expect(201)
      }
    })
  }
})

describe('Routing and path handling', () => {
  test('Should parse path parameters correctly', async () => {
    const res = await request(app)
      .delete('/my-controller/20/1')
      .expect(200)

    assert.deepStrictEqual(res.body, {
      id: 20,
      bool: true,
      limit: 20
    })
  })

  test('Should accept string as string array for query params', async () => {
    await request(app)
      .delete('/my-controller/20/1?filter=a')
      .expect(200)
  })

  test('Should return 404 for invalid path regex', async () => {
    await request(app)
      .delete('/my-controller/20/true')
      .expect(404)
  })
})

describe('Content type and middleware', () => {
  test('Should reject unsupported content type', async () => {
    const res = await request(app)
      .patch('/my-controller/')
      .set('Content-Type', 'text/html')
      .send('hey')
      .expect(400)

    assert.deepStrictEqual(res.body.message, 'This content-type is not allowed')
  })

  test('Should use discriminator function correctly', async () => {
    const res = await request(app)
      .patch('/my-controller/?one')
      .send({ type: 'one' })
      .expect(200)

    assert.deepStrictEqual(res.body, { type: 'one' })
  })

  test('Should reject invalid discriminator', async () => {
    const res = await request(app)
      .patch('/my-controller/?one')
      .send({ type: 'two' })
      .expect(400)

    assert.deepStrictEqual(res.body.fields, {
      'body.type': { message: 'This property must be one of one', value: 'two' }
    })
  })

  test('Should handle security interceptor', async () => {
    const res = await request(app)
      .get('/my-controller/intercepted')
      .expect(200)

    assert.deepStrictEqual(res.body, { scopes: { company: ['read'] } })
  })

  test('Should handle controller-level security', async () => {
    const res = await request(app)
      .get('/my-2nd-controller')
      .expect(200)

    assert.deepStrictEqual(res.body, { scopes: { company: [] } })
  })

  test('Should return 204 for no-content endpoint', async () => {
    const res = await request(app)
      .get('/my-controller/no-content')
      .expect(204)

    assert.strictEqual(res.text, '')
  })

  test('Should not validate body for file uploads', async () => {
    const res = await request(app)
      .post('/my-controller/file')
      .set('content-type', 'multipart/form-data')
      .send('')
      .expect(200)

    assert.strictEqual(res.text, '"ok"')
  })

  test('Should remove extra properties from response', async () => {
    const res = await request(app)
      .get('/my-controller/getExtra')
      .expect(200)

    assert.deepStrictEqual(res.body, { foo: 1 })
  })
})
