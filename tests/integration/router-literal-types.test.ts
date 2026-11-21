import fs from 'fs'
import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { before, describe, test } from 'node:test'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

const openapiFile = path.resolve(
  __dirname,
  'generated-openapi-router-literal-types.json'
)
const routerFile = path.resolve(__dirname, 'generated-router-literal-types.ts')

describe('Template literal, bigint, boolean literal and Required<T>', () => {
  let app: express.Application
  let spec: any

  before(async () => {
    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [
        path.resolve(
          __dirname,
          '../fixtures/controllers/controller-literal-types.ts'
        )
      ],
      openapi: {
        filePath: openapiFile,
        service: {
          name: 'literal-types',
          version: '1.0.0'
        }
      },
      router: {
        filePath: routerFile,
        runtimeImport: '../../src'
      }
    })
    spec = JSON.parse(fs.readFileSync(openapiFile, 'utf-8'))

    app = express()
    app.use(express.json())
    const { bindToRouter } = await import(routerFile)
    bindToRouter(app)
    app.use(createErrorHandler())
  })

  test('Should generate valid schemas', () => {
    const { properties } = spec.components.schemas.LiteralTypes
    assert.deepEqual(properties.tpl, { type: 'string' })
    assert.deepEqual(properties.big, { type: 'integer', format: 'int64' })
    assert.deepEqual(properties.lit, {
      oneOf: [
        { type: 'boolean', enum: [true] },
        { type: 'string', enum: ['x'] }
      ]
    })
    const req = spec.components.schemas[properties.req.$ref.split('/').pop()]
    assert.deepEqual(req.required, ['a'])
  })

  test('Should accept a valid body', async () => {
    const body = { tpl: 'id-1', big: 1, lit: true, req: { a: 'a' } }
    const res = await request(app).post('/literal-types').send(body)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, body)
  })

  test('Should reject a number for a template literal', async () => {
    const res = await request(app)
      .post('/literal-types')
      .send({ tpl: 123, big: 1, lit: true, req: { a: 'a' } })
    assert.equal(res.status, 400)
  })

  test('Should reject a wrong boolean literal', async () => {
    const res = await request(app)
      .post('/literal-types')
      .send({ tpl: 'id-1', big: 1, lit: false, req: { a: 'a' } })
    assert.equal(res.status, 400)
  })

  test('Should reject a missing property of Required<T>', async () => {
    const res = await request(app)
      .post('/literal-types')
      .send({ tpl: 'id-1', big: 1, lit: true, req: {} })
    assert.equal(res.status, 400)
  })
})
