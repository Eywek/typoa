import test from 'ava'
import fs from 'fs'
import path from 'path'
import { generate } from '../src'

test('Should generate openapi definition', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/controller.*')],
    openapi: {
      filePath: '/tmp/openapi-test-valid.json',
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
      filePath: '/tmp/router.ts'
    }
  })

  // Just verify we can read the generated file and it's valid JSON
  const specContent = await fs.promises.readFile('/tmp/openapi-test-valid.json')
  const spec = JSON.parse(specContent.toString())
  t.is(spec.openapi, '3.0.0')
  t.is(spec.info.title, 'my-service')
  t.is(spec.info.version, '1.0.0')

  // Verify some specific components in the schema
  t.truthy(spec.components.schemas.MyEnum)
  t.truthy(spec.components.schemas.Datasource)
  t.truthy(spec.paths['/my-route'].get)
})

test('Should generate a valid yaml definition', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [],
    openapi: {
      filePath: '/tmp/openapi.yaml',
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  })
  const specContent = await fs.promises.readFile('/tmp/openapi.yaml')
  t.is(specContent.toString(), `openapi: 3.0.0
info:
    title: my-service
    version: 1.0.0
paths: {}
components:
    schemas: {}
`)
})

test('Should generate both json and yaml definitions using array of file paths', async (t) => {
  const jsonPath = '/tmp/openapi-array-test.json'
  const yamlPath = '/tmp/openapi-array-test.yaml'

  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [],
    openapi: {
      filePath: [jsonPath, yamlPath],
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  })

  // Check JSON file
  const jsonContent = await fs.promises.readFile(jsonPath)
  const jsonData = JSON.parse(jsonContent.toString())
  t.is(jsonData.openapi, '3.0.0')
  t.is(jsonData.info.title, 'my-service')
  t.is(jsonData.info.version, '1.0.0')

  // Check YAML file
  const yamlContent = await fs.promises.readFile(yamlPath)
  t.truthy(yamlContent.toString().includes('openapi: 3.0.0'))
  t.truthy(yamlContent.toString().includes('title: my-service'))
  t.truthy(yamlContent.toString().includes('version: 1.0.0'))
})

test('Should fail with a missing parameter decorator', async (t) => {
  await t.throwsAsync(() => generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/invalid-controller.ts')],
    openapi: {
      filePath: '/tmp/openapi.yaml',
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  }), { message: 'Parameter MyController.get.invalidParameter must have a decorator.' })
})

test('Should generate the right definition with response object', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/response-object.ts')],
    openapi: {
      filePath: '/tmp/openapi-test-object-response.json',
      service: {
        name: 'my-service',
        version: '1.0.0'
      },
      additionalExportedTypeNames: [],
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  })
  const specContent = (await fs.promises.readFile('/tmp/openapi-test-object-response.json')).toString()
  // we should not have the same type for the get and post endpoint
  t.snapshot(specContent)
})
