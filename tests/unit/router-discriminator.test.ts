import path from 'path'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { generate } from '../../src'

const config = {
  tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
  openapi: {
    filePath: path.resolve(
      __dirname,
      'generated-openapi-router-discriminator.json'
    ),
    service: {
      name: 'my-service',
      version: '1.0.0'
    }
  },
  router: {
    filePath: path.resolve(__dirname, 'generated-router-discriminator.ts')
  }
}

test('Should successfully generate with valid discriminator function', async () => {
  await assert.doesNotReject(() =>
    generate(
      Object.assign({}, config, {
        controllers: [
          path.resolve(
            __dirname,
            '../fixtures/controllers/controller-middleware.ts'
          )
        ]
      })
    )
  )

  const spec = (await import(config.openapi.filePath)).default

  // Verify the generated spec includes discriminator handling
  assert.ok(spec.paths['/123'])
  assert.ok(spec.paths['/123'].patch)
  assert.ok(spec.paths['/123'].patch.requestBody)
})

test('Should fail generate with not found discriminator function', async () => {
  await assert.rejects(
    () =>
      generate(
        Object.assign({}, config, {
          controllers: [
            path.resolve(
              __dirname,
              '../fixtures/routing/router-controller-discriminator-not-found.ts'
            )
          ]
        })
      ),
    {
      message:
        'The 2nd argument of @Body() decorator must be the name of a function defined in source files'
    }
  )
})

test('Should fail generate with discriminator function declared twice', async () => {
  await assert.rejects(
    () =>
      generate(
        Object.assign({}, config, {
          controllers: [
            path.resolve(
              __dirname,
              '../fixtures/routing/router-controller-discriminator-twice.ts'
            )
          ]
        })
      ),
    {
      message:
        'The 2nd argument of @Body() decorator must be the name of a function defined only once'
    }
  )
})

test('Should fail generate with discriminator function not exported', async () => {
  await assert.rejects(
    () =>
      generate(
        Object.assign({}, config, {
          controllers: [
            path.resolve(
              __dirname,
              '../fixtures/routing/router-controller-discriminator-not-exported.ts'
            )
          ]
        })
      ),
    {
      message:
        'The 2nd argument of @Body() decorator must be the name of an exported function'
    }
  )
})

test('Should fail generate with discriminator function invalid', async () => {
  await assert.rejects(
    () =>
      generate(
        Object.assign({}, config, {
          controllers: [
            path.resolve(
              __dirname,
              '../fixtures/routing/router-controller-discriminator-arrow-fn.ts'
            )
          ]
        })
      ),
    {
      message:
        'The 2nd argument of @Body() decorator must be the name of a function'
    }
  )
})
