import fs from 'fs'
import path from 'path'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { generate } from '../../src'

test('Should generate openapi definition', async () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi-test-valid.json')
  const routerFile = path.resolve(__dirname, 'generated-router-openapi-test-valid.ts')

  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, '../fixtures/controllers/controller.*')],
    openapi: {
      filePath: openapiFile,
      service: {
        name: 'my-service',
        version: '1.0.0'
      },
      securitySchemes: {
        company: {
          type: 'apiKey',
          name: 'x-company-id',
          in: 'header'
        }
      },
      additionalExportedTypeNames: ['CustomExportedEnum', 'C'],
      outputErrorsToDescription: {
        enabled: true,
        tableColumns: [{
          name: 'Error code',
          value: { type: 'path', value: ['error_code'] }
        }, {
          name: 'Status code',
          value: { type: 'path', value: ['status_code'] }
        }, {
          name: 'Payload',
          value: { type: 'path', value: ['payload'] }
        }, {
          name: 'Description',
          value: { type: 'description' }
        }, {
          name: 'HTTP Code',
          value: { type: 'statusCode' }
        }],
        sortColumn: 'Error code',
        uniqueColumn: 'Error code'
      }
    },
    router: {
      filePath: routerFile
    }
  })

  const spec = (await import(openapiFile)).default
  assert.strictEqual(spec.openapi, '3.0.0')
  assert.strictEqual(spec.info.title, 'my-service')
  assert.strictEqual(spec.info.version, '1.0.0')

  // Verify some specific components in the schema
  assert.ok(spec.components.schemas.MyEnum)
  assert.ok(spec.components.schemas.Datasource)
  assert.ok(spec.paths['/my-route'].get)
})

test('Should generate a valid yaml definition', async () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi.yaml')
  const routerFile = path.resolve(__dirname, 'generated-router-openapi-yaml.ts')

  await generate({
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
  })
  const specContent = await fs.promises.readFile(openapiFile)
  assert.strictEqual(specContent.toString(), `openapi: 3.0.0
info:
    title: my-service
    version: 1.0.0
paths: {}
components:
    schemas: {}
`)
})

test('Should generate both json and yaml definitions using array of file paths', async () => {
  const jsonFile = path.resolve(__dirname, 'generated-openapi-array-test.json')
  const yamlFile = path.resolve(__dirname, 'generated-openapi-array-test.yaml')
  const routerFile = path.resolve(__dirname, 'generated-router-openapi-array-test.ts')

  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [],
    openapi: {
      filePath: [jsonFile, yamlFile],
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: routerFile
    }
  })

  // Check JSON file
  const spec = (await import(jsonFile)).default
  assert.strictEqual(spec.openapi, '3.0.0')
  assert.strictEqual(spec.info.title, 'my-service')
  assert.strictEqual(spec.info.version, '1.0.0')

  // Check YAML file
  const yamlContent = await fs.promises.readFile(yamlFile)
  assert.ok(yamlContent.toString().includes('openapi: 3.0.0'))
  assert.ok(yamlContent.toString().includes('title: my-service'))
  assert.ok(yamlContent.toString().includes('version: 1.0.0'))
})

test('Should fail with a missing parameter decorator', async () => {
  await assert.rejects(() => generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, '../fixtures/validation/invalid-controller.ts')],
    openapi: {
      filePath: path.resolve(__dirname, 'generated-openapi-invalid.yaml'),
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: path.resolve(__dirname, 'generated-router-invalid.ts')
    }
  }), { message: 'Parameter MyController.get.invalidParameter must have a decorator.' })
})

test('Should generate the right definition with response object', async () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi-test-object-response.json')
  const routerFile = path.resolve(__dirname, 'generated-router-openapi-test-object-response.ts')

  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, '../fixtures/response-object.ts')],
    openapi: {
      filePath: openapiFile,
      service: {
        name: 'my-service',
        version: '1.0.0'
      },
      additionalExportedTypeNames: []
    },
    router: {
      filePath: routerFile
    }
  })
  const spec = (await import(openapiFile)).default

  // Verify we have different response schemas for different endpoints
  assert.ok(spec.components.schemas.SuccessResponse_Array_Entity, 'Should have SuccessResponse_Array_Entity schema')
  assert.ok(spec.components.schemas.SuccessResponse_Entity, 'Should have SuccessResponse_Entity schema')
  assert.ok(spec.components.schemas.SuccessResponse_entity_Entity_count_number, 'Should have SuccessResponse_entity_Entity_count_number schema')

  // Verify the endpoints reference different schemas (not the same type for get and post)
  const listResponse = spec.paths['/my-3nd-controller'].get.responses['200'].content['application/json'].schema
  const createResponse = spec.paths['/my-3nd-controller'].post.responses['200'].content['application/json'].schema
  assert.notStrictEqual(listResponse.$ref, createResponse.$ref, 'GET and POST should have different response schemas')
})
