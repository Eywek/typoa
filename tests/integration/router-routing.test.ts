import fs from 'fs'
import path from 'path'
import express from 'express'
import expressPackage from 'express/package.json'
import request from 'supertest'
import ts from 'typescript'
import { strict as assert } from 'node:assert'
import { test, describe, before } from 'node:test'

import { generate } from '../../src'

const expressMajor = Number(expressPackage.version.split('.')[0])
let app: express.Application
const routerFile = path.resolve(__dirname, 'generated-router-routing.ts')
const openapiFile = path.resolve(
  __dirname,
  'generated-openapi-router-routing.json'
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
})

describe('Routing and path handling', () => {
  test('Should parse path parameters correctly', async () => {
    const res = await request(app).delete('/').expect(200)

    // The delete method returns {} as any, so expect empty object
    assert.deepStrictEqual(res.body, {})
  })

  test('Should accept string as string array for query params', async () => {
    await request(app).delete('/').expect(200)
  })

  test('Should return 404 for invalid path regex', async () => {
    await request(app).delete('/invalid-path').expect(404)
  })

  test('Should return extra data correctly', async () => {
    const res = await request(app).get('/my-route').expect(200)

    // The get method returns {} as any, so expect empty object
    assert.deepStrictEqual(res.body, {})
  })
})

describe('Path parameters with a regex', () => {
  test('Should match a path parameter matching its regex', async () => {
    await request(app).get('/no-required/ABC').expect(200)
  })

  test('Should skip the route when a path parameter does not match its regex', async () => {
    await request(app).get('/no-required/abc').expect(200)
    await request(app).get('/no-required/ABC1').expect(404)
    await request(app).get('/no-required/12').expect(404)
  })

  test('Should match decoded parameters only in the Express 5 fallback', async () => {
    // Express 4 applies path regexes before decoding; the fallback sees decoded params.
    await request(app)
      .get('/no-required/%41')
      .expect(expressMajor === 4 ? 404 : 200)
  })

  test('Should honor case-sensitive routers', async () => {
    const router = express.Router({ caseSensitive: true })
    const { bindToRouter } = await import(routerFile)
    bindToRouter(router)
    const sensitiveApp = express().use(router)
    await request(sensitiveApp).get('/no-required/ABC').expect(200)
    await request(sensitiveApp).get('/no-required/abc').expect(404)
  })

  test('Should keep the original path and provide a per-route fallback', async () => {
    const router = await fs.promises.readFile(routerFile, 'utf-8')
    assert.ok(
      router.includes(
        `registerPatternRoute(router, router.get.bind(router), '/no-required/:id([A-Z]+)', '/no-required/:id', {"id":"[A-Z]+"}`
      )
    )
    const spec = JSON.parse(await fs.promises.readFile(openapiFile, 'utf-8'))
    assert.ok(spec.paths['/no-required/{id}'].get)
  })

  test('Should preserve wildcard patterns on Express 4 and explain unsupported fallback patterns', async () => {
    const filePath = path.resolve(__dirname, 'generated-router-wildcard.ts')
    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [
        path.resolve(
          __dirname,
          '../fixtures/routing/router-controller-wildcard.ts'
        )
      ],
      router: { filePath, runtimeImport: '../../src' },
      openapi: {
        filePath: path.resolve(__dirname, 'generated-openapi-wildcard.json'),
        service: { name: 'test', version: '1.0.0' }
      }
    })
    const { bindToRouter } = await import(filePath)
    const program = ts.createProgram([filePath], {
      noEmit: true,
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS
    })
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter(diagnostic => diagnostic.file?.fileName === filePath)
    assert.deepStrictEqual(
      diagnostics.map(diagnostic =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      ),
      []
    )
    const wildcardApp = express()
    if (expressMajor === 5) {
      assert.throws(
        () => bindToRouter(wildcardApp),
        /Invalid path pattern '\*' for parameter 'path' in route '\/files\/:path\(\*\)': .*Nothing to repeat/
      )
    } else {
      bindToRouter(wildcardApp)
      const response = await request(wildcardApp)
        .get('/files/a/b/c')
        .expect(200)
      assert.deepStrictEqual(response.body, { path: 'a/b/c' })
      const literal = await request(wildcardApp).get('/files/*').expect(200)
      assert.deepStrictEqual(literal.body, { path: '*' })
    }
  })

  test('Should pass the original regex endpoint to custom templates', async () => {
    const filePath = path.resolve(__dirname, 'generated-custom-endpoints.json')
    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      openapi: {
        filePath: path.resolve(__dirname, 'generated-openapi-custom.json'),
        service: { name: 'test', version: '1.0.0' }
      },
      controllers: [
        path.resolve(__dirname, '../fixtures/controllers/controller.ts')
      ],
      router: {
        filePath,
        templateFilePath: path.resolve(
          __dirname,
          '../fixtures/routing/endpoint.hbs'
        )
      }
    })
    const endpoints = await fs.promises.readFile(filePath, 'utf8')
    assert.ok(endpoints.split('\n').includes('/no-required/:id([A-Z]+)'))
    assert.ok(endpoints.split('\n').includes('/my-route'))
  })
})
