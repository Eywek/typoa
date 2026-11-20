import path from 'path'
import express from 'express'
import expressPackage from 'express/package.json'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { before, describe, test } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

const expressMajor = Number(expressPackage.version.split('.')[0])
let app: express.Application

async function generateRouter(fixture: string, name: string) {
  const filePath = path.resolve(
    __dirname,
    `generated-router-dynamic-${name}.ts`
  )
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, `../fixtures/routing/${fixture}.ts`)],
    openapi: {
      filePath: path.resolve(
        __dirname,
        `generated-openapi-dynamic-${name}.json`
      ),
      service: { name: 'dynamic', version: '1.0.0' }
    },
    router: { filePath, runtimeImport: '../../src' }
  })
  return await import(filePath)
}

before(async () => {
  const { bindToRouter } = await generateRouter(
    'router-controller-dynamic',
    'params'
  )
  app = express()
  bindToRouter(app)
  app.use(createErrorHandler())
})

describe('Dynamic route parameters over HTTP', () => {
  test('Should return a single path parameter', async () => {
    const response = await request(app).get('/dynamic/customer-42').expect(200)
    assert.deepStrictEqual(response.body, {
      handler: 'dynamic',
      id: 'customer-42'
    })
  })

  test('Should return several parameters from one path', async () => {
    const response = await request(app)
      .get('/dynamic/a/first/b/second')
      .expect(200)
    assert.deepStrictEqual(response.body, { x: 'first', y: 'second' })
  })

  test('Should preserve default case-insensitive pattern matching', async () => {
    for (const id of ['ABC', 'abc']) {
      const response = await request(app)
        .get(`/dynamic/regex/${id}`)
        .expect(200)
      assert.deepStrictEqual(response.body, { id })
    }
    for (const id of ['ABC1', '12']) {
      await request(app).get(`/dynamic/regex/${id}`).expect(404)
    }
  })

  test('Should decode encoded spaces, slashes and unicode before calling the controller', async () => {
    for (const value of ['hello world', 'a/b', 'café 日本語']) {
      const response = await request(app)
        .get(`/dynamic/encoded/${encodeURIComponent(value)}`)
        .expect(200)
      assert.deepStrictEqual(response.body, { value })
    }
  })

  test('Should match a literal dot suffix and hyphenated literal prefix', async () => {
    const dotted = await request(app)
      .get('/dynamic/file/report.json')
      .expect(200)
    assert.deepStrictEqual(dotted.body, { id: 'report' })
    const hyphenated = await request(app)
      .get('/dynamic/item-report')
      .expect(200)
    assert.deepStrictEqual(hyphenated.body, { id: 'report' })
  })

  test('Should parse optional query parameters alongside a path parameter', async () => {
    const empty = await request(app).get('/dynamic/query/customer').expect(200)
    assert.deepStrictEqual(empty.body, { id: 'customer' })
    const populated = await request(app)
      .get('/dynamic/query/customer?search=hello%20world&page=2')
      .expect(200)
    assert.deepStrictEqual(populated.body, {
      id: 'customer',
      search: 'hello world',
      page: 2
    })
  })

  test('Should register a static route before the parameter route in the same controller', async () => {
    const response = await request(app).get('/dynamic/static').expect(200)
    assert.deepStrictEqual(response.body, { handler: 'static' })
    const dynamic = await request(app).get('/dynamic/other').expect(200)
    assert.deepStrictEqual(dynamic.body, { handler: 'dynamic', id: 'other' })
  })

  test('Should validate and coerce numeric path parameters', async () => {
    const valid = await request(app).get('/dynamic/number/42').expect(200)
    assert.deepStrictEqual(valid.body, { id: 42 })
    const invalid = await request(app)
      .get('/dynamic/number/not-a-number')
      .expect(400)
    assert.deepStrictEqual(invalid.body, {
      fields: {
        id: { message: 'This property must be a number', value: 'not-a-number' }
      }
    })
  })

  test('Should match digit patterns and reject non-digits', async () => {
    const response = await request(app).get('/dynamic/digits/123').expect(200)
    assert.deepStrictEqual(response.body, { id: '123' })
    await request(app).get('/dynamic/digits/12a').expect(404)
  })

  test('Should match encoded digits only after decoding in Express 5', async () => {
    // Express 4 matches the raw path; Express 5 fallback middleware sees decoded params.
    const response = await request(app)
      .get('/dynamic/digits/%31%32')
      .expect(expressMajor === 4 ? 404 : 200)
    if (expressMajor === 5) assert.deepStrictEqual(response.body, { id: '12' })
  })

  test('Should match alternation patterns case-insensitively', async () => {
    for (const ext of ['png', 'jpg', 'PNG']) {
      const response = await request(app)
        .get(`/dynamic/extension/${ext}`)
        .expect(200)
      assert.deepStrictEqual(response.body, { ext })
    }
    await request(app).get('/dynamic/extension/gif').expect(404)
  })

  test('Should reject encoded slashes and spaces that do not match the pattern', async () => {
    for (const value of ['A%2FB', 'A%20B']) {
      await request(app).get(`/dynamic/regex/${value}`).expect(404)
    }
  })

  test('Should require both patterned parameters to match', async () => {
    const response = await request(app)
      .get('/dynamic/patterns/ABC/123')
      .expect(200)
    assert.deepStrictEqual(response.body, { letters: 'ABC', digits: '123' })
    for (const value of ['ABC1/123', 'ABC/12a', 'ABC1/12a']) {
      await request(app).get(`/dynamic/patterns/${value}`).expect(404)
    }
  })

  test('Should fall through from a non-matching pattern to the next route', async () => {
    const matching = await request(app).get('/dynamic/fallback/123').expect(200)
    assert.deepStrictEqual(matching.body, { handler: 'patterned', id: '123' })
    const fallback = await request(app).get('/dynamic/fallback/12a').expect(200)
    assert.deepStrictEqual(fallback.body, { handler: 'fallback', id: '12a' })
  })
})
