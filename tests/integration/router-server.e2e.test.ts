import path from 'path'
import http from 'node:http'
import { strict as assert } from 'node:assert'
import { after, before, describe, test } from 'node:test'
import express from 'express'
import expressPackage from 'express/package.json'

import { generate } from '../../src'
import { createErrorHandler } from './shared'

const expressMajor = Number(expressPackage.version.split('.')[0])
type Response = { status: number; body: unknown }
type Case = { path: string; expected: Response; express5?: Response }
const ok = (body: unknown): Response => ({ status: 200, body })
const missing: Response = { status: 404, body: { error: 'not found' } }
const malformed: Response = {
  status: 400,
  body: { message: "Failed to decode param '%E0%A4%A'" }
}
const uuid = '01234567-89ab-cdef-0123-456789abcdef'

// Express 4 matches raw paths; Express 5 decodes parameters before checking patterns.
const cases: Case[] = [
  { path: '/no-required/ABC', expected: ok({ id: 'ABC' }) },
  { path: '/no-required/abc', expected: ok({ id: 'abc' }) },
  { path: '/no-required/%41', expected: missing, express5: ok({ id: 'A' }) },
  { path: '/no-required/%61', expected: missing, express5: ok({ id: 'a' }) },
  { path: '/no-required/A%2FB', expected: missing },
  { path: '/no-required/A%20B', expected: missing },
  { path: '/no-required/ABC1', expected: missing },
  { path: '/no-required/', expected: missing },
  { path: '/no-required/ABC/', expected: ok({ id: 'ABC' }) },
  { path: '/dynamic/digits/123', expected: ok({ id: '123' }) },
  {
    path: '/dynamic/digits/%31%32',
    expected: missing,
    express5: ok({ id: '12' })
  },
  { path: '/dynamic/digits/12a', expected: missing },
  { path: '/dynamic/digits/1%2E2', expected: missing },
  { path: '/dynamic/extension/png', expected: ok({ ext: 'png' }) },
  { path: '/dynamic/extension/PNG', expected: ok({ ext: 'PNG' }) },
  { path: '/dynamic/extension/gif', expected: missing },
  {
    path: '/dynamic/extension/%70ng',
    expected: missing,
    express5: ok({ ext: 'png' })
  },
  { path: '/slug/a-valid-slug-123', expected: ok({ id: 'a-valid-slug-123' }) },
  { path: '/slug/INVALID-SLUG', expected: ok({ id: 'INVALID-SLUG' }) },
  { path: '/slug/not_valid', expected: missing },
  { path: `/uuid/${uuid}`, expected: ok({ id: uuid }) },
  {
    path: `/uuid/${uuid.toUpperCase()}`,
    expected: ok({ id: uuid.toUpperCase() })
  },
  { path: '/uuid/not-a-uuid', expected: missing },
  { path: '/ascii/%C3%A9', expected: missing },
  { path: '/dynamic/encoded/%C3%A9', expected: ok({ value: 'é' }) },
  { path: '/no-required/%E0%A4%A', expected: missing, express5: malformed },
  { path: '/dynamic/encoded/%E0%A4%A', expected: malformed },
  {
    path: '/dynamic/patterns/ABC/123',
    expected: ok({ letters: 'ABC', digits: '123' })
  },
  { path: '/dynamic/patterns/ABC1/123', expected: missing },
  { path: '/dynamic/patterns/ABC/12a', expected: missing },
  {
    path: '/dynamic/fallback/123',
    expected: ok({ handler: 'patterned', id: '123' })
  },
  {
    path: '/dynamic/fallback/12a',
    expected: ok({ handler: 'fallback', id: '12a' })
  }
]

async function generateRouter(controllers: string[], name: string) {
  const filePath = path.resolve(__dirname, `generated-router-server-${name}.ts`)
  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: controllers.map(controller =>
      path.resolve(__dirname, `../fixtures/routing/${controller}.ts`)
    ),
    openapi: {
      filePath: path.resolve(
        __dirname,
        `generated-openapi-server-${name}.json`
      ),
      service: { name: 'server', version: '1.0.0' }
    },
    router: { filePath, runtimeImport: '../../src' }
  })
  return await import(filePath)
}

async function listen(app: express.Application): Promise<http.Server> {
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
    server.once('error', reject)
  })
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  )
}

async function request(
  server: http.Server,
  rawPath: string
): Promise<Response> {
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: rawPath,
        method: 'GET'
      },
      res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
        })
        res.on('error', reject)
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(body) })
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

let server: http.Server | undefined
before(async () => {
  const { bindToRouter } = await generateRouter(
    ['router-controller-server', 'router-controller-dynamic'],
    'patterns'
  )
  const app = express()
  bindToRouter(app)
  app.use(createErrorHandler())
  app.use((_req, res) => {
    res.status(404).json(missing.body)
  })
  server = await listen(app)
})

after(async () => {
  if (server !== undefined) await close(server)
})

describe('Raw paths against a listening Express server', () => {
  for (const row of cases) {
    test(row.path, async () => {
      assert.ok(server !== undefined)
      assert.deepStrictEqual(
        await request(server, row.path),
        expressMajor === 5 ? (row.express5 ?? row.expected) : row.expected
      )
    })
  }

  test('Wildcard routes work on Express 4 or fail before listen on Express 5', async t => {
    const { bindToRouter } = await generateRouter(
      ['router-controller-wildcard'],
      'wildcard'
    )
    const app = express()
    // Express 5 rejects embedded regexes and '*' is not a valid fallback JS regex.
    if (expressMajor === 5) {
      assert.throws(
        () => bindToRouter(app),
        /Invalid path pattern '\*' for parameter 'path' in route '\/files\/:path\(\*\)': .*Nothing to repeat/
      )
      return
    }
    bindToRouter(app)
    const wildcardServer = await listen(app)
    t.after(async () => {
      await close(wildcardServer)
    })
    for (const row of [
      { path: '/files/a/b/c', body: { path: 'a/b/c' } },
      { path: '/files/*', body: { path: '*' } },
      { path: '/files/a%2Fb', body: { path: 'a/b' } }
    ]) {
      assert.deepStrictEqual(
        await request(wildcardServer, row.path),
        ok(row.body)
      )
    }
  })
})
