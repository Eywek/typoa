import path from 'path'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { generate } from '../../src'

test('Should generate containers with named enums', async () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi-router-xenum-varnames.json')
  const routerFile = path.resolve(__dirname, 'generated-router-interface-inheritance.ts')

  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, '../fixtures/validation/xenum-varnames-test.ts')],
    openapi: {
      filePath: openapiFile,
      service: {
        name: 'test-service',
        version: '1.0.0'
      },
      xEnumVarnames: true
    },
    router: {
      filePath: routerFile
    }
  })

  const spec = (await import(openapiFile)).default

  const containerSchema = spec.components.schemas.Container
  assert.ok(containerSchema)

  const countrySchema = spec.components.schemas.Country
  assert.ok(countrySchema)
  assert.ok(countrySchema.enum)
  assert.strictEqual(countrySchema.enum.length, 3)
  assert.strictEqual(countrySchema['x-enum-varnames']?.length, 3)
  assert.deepStrictEqual(countrySchema['x-enum-varnames'],
    [
      'GERMANY',
      'FRANCE',
      'ITALY'
    ])
})
