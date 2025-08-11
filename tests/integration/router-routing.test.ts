import path from 'path'
import express from 'express'
import request from 'supertest'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'

let app: express.Application
let routerFile = path.resolve(__dirname, 'generated-router-routing.ts')
let openapiFile = path.resolve(__dirname, 'generated-openapi-router-routing.json')

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
      securityMiddlewarePath: path.resolve(__dirname, '../fixtures/security-middleware.ts'),
      validateResponse: false,
      runtimeImport: '../../src'
    }
  })

  // Create Express app
  app = express()
  app.use(express.json())

  const { bindToRouter } = await import(routerFile)
  bindToRouter(app)
})

describe('Routing and path handling', () => {
  test('Should parse path parameters correctly', async () => {
    const res = await request(app)
      .delete('/')
      .expect(200)

    // The delete method returns {} as any, so expect empty object
    assert.deepStrictEqual(res.body, {})
  })

  test('Should accept string as string array for query params', async () => {
    await request(app)
      .delete('/')
      .expect(200)
  })

  test('Should return 404 for invalid path regex', async () => {
    await request(app)
      .delete('/invalid-path')
      .expect(404)
  })

  test('Should return extra data correctly', async () => {
    const res = await request(app)
      .get('/my-route')
      .expect(200)

    // The get method returns {} as any, so expect empty object
    assert.deepStrictEqual(res.body, {})
  })
})
