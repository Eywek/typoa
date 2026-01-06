import { generate } from '../../src'
import * as path from 'path'
import * as fs from 'fs'
import { strict as assert } from 'node:assert'
import { describe, it, afterEach } from 'node:test'

describe('Nullable query parameters', () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi-nullable-query-params.json')
  const routerFile = path.resolve(__dirname, 'generated-router-nullable-query-params.ts')

  afterEach(async () => {
    if (fs.existsSync(openapiFile)) await fs.promises.unlink(openapiFile)
    if (fs.existsSync(routerFile)) await fs.promises.unlink(routerFile)
  })

  it('should handle nullable query parameters correctly', async () => {
    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [path.resolve(__dirname, '../fixtures/controllers/nullable-query-params.controller.ts')],
      openapi: {
        filePath: openapiFile,
        service: {
          name: 'repro-service',
          version: '1.0.0'
        }
      },
      router: {
        filePath: routerFile
      }
    })

    const spec = JSON.parse(await fs.promises.readFile(openapiFile, 'utf-8'))

    const nullablePath = spec.paths['/nullable-query-params/nullable']?.get
    const nullableParam = nullablePath?.parameters?.[0]
    assert.strictEqual(nullableParam.required, true)
    assert.strictEqual(nullableParam.schema.nullable, true)

    const optionalPath = spec.paths['/nullable-query-params/optional']?.get
    const optionalParam = optionalPath?.parameters?.[0]
    assert.strictEqual(optionalParam.required, false)
    
    const undefinedPath = spec.paths['/nullable-query-params/undefined']?.get
    const undefinedParam = undefinedPath?.parameters?.[0]
    assert.strictEqual(undefinedParam.required, false)

    const nullableAndUndefinedPath = spec.paths['/nullable-query-params/nullable-and-undefined']?.get
    const nullableAndUndefinedParam = nullableAndUndefinedPath?.parameters?.[0]
    assert.strictEqual(nullableAndUndefinedParam.required, false)
    assert.strictEqual(nullableAndUndefinedParam.schema.nullable, true)
  })
})
