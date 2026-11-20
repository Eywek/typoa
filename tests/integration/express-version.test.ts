import path from 'path'
import { createRequire } from 'node:module'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import express from 'express'
import expressPackage from 'express/package.json'

test('Should load the expected Express version in tests and generated routers', t => {
  const fromRouter = createRequire(
    path.resolve(__dirname, 'generated-router-routing.ts')
  )
  const routerExpress = fromRouter('express') as typeof express
  const routerPackage = fromRouter('express/package.json') as {
    version: string
  }
  const types = fromRouter('@types/express/package.json') as { version: string }
  t.diagnostic(
    `express ${expressPackage.version} types ${types.version} (tests and generated router)`
  )

  assert.equal(routerExpress, express)
  assert.equal(routerPackage.version, expressPackage.version)
  if (process.env.EXPRESS_VERSION !== undefined) {
    assert.equal(expressPackage.version, process.env.EXPRESS_VERSION)
    assert.equal(routerPackage.version, process.env.EXPRESS_VERSION)
  }

  const registerPattern = () =>
    routerExpress
      .Router()
      .get('/x/:id([A-Z]+)', (_req, res) => res.sendStatus(200))
  const major = Number(expressPackage.version.split('.')[0])
  assert.ok(major === 4 || major === 5)
  // Express 5 rejects embedded regexes; Express 4 accepts them at registration.
  if (major === 5) {
    assert.throws(registerPattern)
  } else {
    assert.doesNotThrow(registerPattern)
  }
})
