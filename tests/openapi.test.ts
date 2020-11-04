import test from 'ava'
import fs from 'fs'
import path from 'path'
import { generate } from '../src'

test('Should generate the right definition', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/con*.ts')],
    openapi: {
      filePath: '/tmp/openapi-test-valid.json',
      format: 'json',
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
      additionalExportedTypeNames: ['CustomExportedEnum']
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  })
  const [specContent, expectedContent] = await Promise.all([
    fs.promises.readFile('/tmp/openapi-test-valid.json'),
    fs.promises.readFile(path.resolve(__dirname, './fixture/openapi.json'))
  ])
  t.deepEqual(JSON.parse(specContent.toString()), JSON.parse(expectedContent.toString()))
})

test('Should generate a valid yaml definition', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [],
    openapi: {
      filePath: '/tmp/openapi.yaml',
      format: 'yaml',
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

test('Should fail with a missing parameter decorator', async (t) => {
  await t.throwsAsync(() => generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/invalid-controller.ts')],
    openapi: {
      filePath: '/tmp/openapi.yaml',
      format: 'yaml',
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
