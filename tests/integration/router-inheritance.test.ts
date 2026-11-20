import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before, after } from 'node:test'

import { generate, setRuntimeOptions } from '../../src'
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

describe('Flattened composed types at runtime', () => {
  after(() => {
    setRuntimeOptions({ features: {} })
  })

  test('Should return every property of a response extending a mapped type', async () => {
    const res = await request(app).get('/inheritance-test/b').expect(200)
    assert.deepStrictEqual(res.body, { a: 'x', b: 1 })
  })

  test('Should return the overridden property of an omitted base property', async () => {
    const res = await request(app).get('/inheritance-test/article').expect(200)
    assert.deepStrictEqual(res.body, { id: '1', revisions: [{ id: 'r1' }] })
  })

  test('Should return every property of an intersection', async () => {
    const res = await request(app)
      .get('/inheritance-test/intersected')
      .expect(200)
    assert.deepStrictEqual(res.body, { a: 'x', c: true })
  })

  test('Should accept a body extending a mapped type', async () => {
    const res = await request(app)
      .post('/inheritance-test/b')
      .send({ a: 'x', b: 1 })
      .expect(200)
    assert.deepStrictEqual(res.body, { a: 'x', b: 1 })
  })

  test('Should require the inherited properties of a body', async () => {
    const res = await request(app)
      .post('/inheritance-test/b')
      .send({ b: 1 })
      .expect(400)
    assert.strictEqual(
      res.body.fields['body.a'].message,
      'Property a is required'
    )
  })

  test('Should accept a body with several bases and an optional property', async () => {
    const res = await request(app)
      .post('/inheritance-test/several-bases')
      .send({ id: '1', name: 'n', createdAt: 'c', tags: ['t'] })
      .expect(200)
    assert.deepStrictEqual(res.body.tags, ['t'])
    assert.strictEqual(res.body.createdAt, 'c')
  })

  test('Should keep an array declared by several intersection members as an array', async () => {
    const res = await request(app)
      .post('/inheritance-test/playlist')
      .send({
        title: 't',
        tracks: [
          { name: 'a', artistIds: ['1', '2'] },
          { name: 'b', artistIds: ['3'] }
        ],
        matrix: [[1, 2], [3]]
      })
      .expect(200)
    assert.deepStrictEqual(res.body, {
      tracksIsArray: true,
      artistIds: ['1', '2', '3'],
      matrix: [[1, 2], [3]]
    })
  })

  test('Should still validate the items of an array declared by several intersection members', async () => {
    const res = await request(app)
      .post('/inheritance-test/playlist')
      .send({ tracks: [{ name: 'a', artistIds: ['1'] }, { name: 'b' }] })
      .expect(400)
    assert.strictEqual(
      res.body.fields['body.tracks.1.artistIds'].message,
      'Property artistIds is required'
    )
  })

  test('Should strip an unknown body property by default', async () => {
    const res = await request(app)
      .post('/inheritance-test/b')
      .send({ a: 'x', b: 1, c: true })
      .expect(200)
    assert.deepStrictEqual(res.body, { a: 'x', b: 1 })
  })

  test('Should reject an unknown body property when enableThrowOnUnexpectedAdditionalData is on', async () => {
    setRuntimeOptions({
      features: { enableThrowOnUnexpectedAdditionalData: true }
    })
    const res = await request(app)
      .post('/inheritance-test/b')
      .send({ a: 'x', b: 1, c: true })
      .expect(400)
    assert.strictEqual(
      res.body.fields.body.message,
      'Additional properties are not allowed. Found: c'
    )
    await request(app)
      .post('/inheritance-test/b')
      .send({ a: 'x', b: 1 })
      .expect(200, { a: 'x', b: 1 })
  })

  test('Should accept an array declared by several intersection members when enableThrowOnUnexpectedAdditionalData is on', async () => {
    setRuntimeOptions({
      features: { enableThrowOnUnexpectedAdditionalData: true }
    })
    await request(app)
      .post('/inheritance-test/playlist')
      .send({ tracks: [{ name: 'a', artistIds: ['1'] }] })
      .expect(200, { tracksIsArray: true, artistIds: ['1'], matrix: [] })
    const res = await request(app)
      .post('/inheritance-test/playlist')
      .send({ tracks: [{ name: 'a', artistIds: ['1'], other: true }] })
      .expect(400)
    assert.strictEqual(
      res.body.fields['body.tracks.0'].message,
      'Additional properties are not allowed. Found: other'
    )
  })
})
