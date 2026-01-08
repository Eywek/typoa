import path from 'path'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { generate } from '../../src'

const openapiFile = path.resolve(__dirname, 'generated-openapi-router-middleware-unit.json')
const routerFile = path.resolve(__dirname, 'generated-router-middleware-unit.ts')

const config = {
  tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
  openapi: {
    filePath: openapiFile,
    service: {
      name: 'my-service',
      version: '1.0.0'
    }
  },
  router: {
    filePath: routerFile
  }
}

test('Should generate router with method middleware', async () => {
  await assert.doesNotReject(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, '../fixtures/middleware/router-controller-middleware-method.ts')]
  })))
})

test('Should generate router with controller middleware', async () => {
  await assert.doesNotReject(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, '../fixtures/middleware/router-controller-middleware-controller.ts')]
  })))
})

test('Should generate router with both controller and method middleware', async () => {
  await assert.doesNotReject(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, '../fixtures/middleware/router-controller-middleware-both.ts')]
  })))
})

test('Should generate router with factory middleware', async () => {
  await assert.doesNotReject(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, '../fixtures/middleware/router-controller-middleware-factory.ts')]
  })))
})
