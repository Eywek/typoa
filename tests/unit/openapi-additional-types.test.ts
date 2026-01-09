import path from 'path'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { generate, OpenAPIConfiguration } from '../../src'

const openapiFile = path.resolve(
  __dirname,
  'generated-openapi-additional-types.json'
)
const routerFile = path.resolve(
  __dirname,
  'generated-router-openapi-additional-types.ts'
)

const config: OpenAPIConfiguration = {
  tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
  controllers: [],
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

test('Should successfully generate with valid additionalExportedTypeNames', async () => {
  await assert.doesNotReject(() =>
    generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [
        path.resolve(__dirname, '../fixtures/types/additional-types.ts')
      ],
      openapi: {
        filePath: openapiFile,
        service: {
          name: 'my-service',
          version: '1.0.0'
        },
        additionalExportedTypeNames: ['UniqueAdditionalType']
      },
      router: {
        filePath: routerFile
      }
    })
  )

  // Verify the generated schema includes the additional type
  const spec = (await import(openapiFile)).default
  assert.ok(spec.components.schemas.UniqueAdditionalType)
  assert.strictEqual(
    spec.components.schemas.UniqueAdditionalType.type,
    'number'
  )
  assert.deepStrictEqual(
    spec.components.schemas.UniqueAdditionalType.enum,
    [42]
  )
})

test('Should fail generate with not found additionalExportedTypeNames', async () => {
  await assert.rejects(
    () =>
      generate(
        Object.assign({}, config, {
          openapi: Object.assign({}, config.openapi, {
            additionalExportedTypeNames: ['notfound']
          })
        })
      ),
    {
      message: "Unable to find the additional exported type named 'notfound'"
    }
  )
})

test('Should fail generate with not exported additionalExportedTypeNames', async () => {
  await assert.rejects(
    () =>
      generate(
        Object.assign({}, config, {
          openapi: Object.assign({}, config.openapi, {
            additionalExportedTypeNames: ['NotExported']
          })
        })
      ),
    {
      message: "Unable to find the additional exported type named 'NotExported'"
    }
  )
})

test('Should fail generate with twice declared additionalExportedTypeNames', async () => {
  await assert.rejects(
    () =>
      generate(
        Object.assign({}, config, {
          openapi: Object.assign({}, config.openapi, {
            additionalExportedTypeNames: ['FooAdditional']
          })
        })
      ),
    {
      message: `We found multiple references for the additional exported type named 'FooAdditional' in ${['additional-types-twice.ts', 'additional-types.ts'].map(file => path.resolve(__dirname, '../fixtures/types/', file)).join(', ')}`
    }
  )
})
