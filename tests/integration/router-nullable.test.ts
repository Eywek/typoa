import fs from 'fs'
import path from 'path'
import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'

import { generate } from '../../src'

describe('Nullable parameter handling', () => {
  test('Should generate correct nullable/required flags for Query parameters', async () => {
    const openapiFile = path.resolve(
      __dirname,
      'generated-openapi-router-nullable.json'
    )
    const routerFile = path.resolve(__dirname, 'generated-router-nullable.ts')

    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [
        path.resolve(
          __dirname,
          '../fixtures/controllers/controller-nullable.ts'
        )
      ],
      openapi: {
        filePath: openapiFile,
        service: {
          name: 'nullable-test',
          version: '1.0.0'
        }
      },
      router: {
        filePath: routerFile
      }
    })

    const spec = JSON.parse(fs.readFileSync(openapiFile, 'utf-8'))

    // Query null (T | null) - should be required: true, nullable: true
    const queryNull = spec.paths['/nullable/query-null'].get.parameters[0]
    assert.equal(queryNull.required, true, 'Query T | null should be required')
    assert.equal(
      queryNull.schema.nullable,
      true,
      'Query T | null should have nullable schema'
    )

    // Query optional (T?) - should be required: false, no nullable
    const queryOptional =
      spec.paths['/nullable/query-optional'].get.parameters[0]
    assert.equal(
      queryOptional.required,
      false,
      'Query T? should not be required'
    )
    assert.equal(
      queryOptional.schema.nullable,
      undefined,
      'Query T? should not have nullable schema'
    )

    // Query undefined (T | undefined) - should be required: false, no nullable
    const queryUndefined =
      spec.paths['/nullable/query-undefined'].get.parameters[0]
    assert.equal(
      queryUndefined.required,
      false,
      'Query T | undefined should not be required'
    )
    assert.equal(
      queryUndefined.schema.nullable,
      undefined,
      'Query T | undefined should not have nullable schema'
    )

    // Query null undefined (T | null | undefined) - should be required: false, nullable: true
    const queryNullUndefined =
      spec.paths['/nullable/query-null-undefined'].get.parameters[0]
    assert.equal(
      queryNullUndefined.required,
      false,
      'Query T | null | undefined should not be required'
    )
    assert.equal(
      queryNullUndefined.schema.nullable,
      true,
      'Query T | null | undefined should have nullable schema'
    )

    // Header null (T | null) - should be required: true, nullable: true
    const headerNull = spec.paths['/nullable/header-null'].get.parameters[0]
    assert.equal(
      headerNull.required,
      true,
      'Header T | null should be required'
    )
    assert.equal(
      headerNull.schema.nullable,
      true,
      'Header T | null should have nullable schema'
    )

    // Header optional (T?) - should be required: false, no nullable
    const headerOptional =
      spec.paths['/nullable/header-optional'].get.parameters[0]
    assert.equal(
      headerOptional.required,
      false,
      'Header T? should not be required'
    )
    assert.equal(
      headerOptional.schema.nullable,
      undefined,
      'Header T? should not have nullable schema'
    )

    // Body null (T | null) - should be required: true, nullable: true (null is a valid value but body must be sent)
    const bodyNull = spec.paths['/nullable/body-null'].post.requestBody
    assert.equal(
      bodyNull.required,
      true,
      'Body T | null should be required (null is valid but body must be sent)'
    )
    assert.equal(
      bodyNull.content['application/json'].schema.nullable,
      true,
      'Body T | null should have nullable schema'
    )

    // Body optional (T?) - should be required: false, no nullable
    const bodyOptional = spec.paths['/nullable/body-optional'].put.requestBody
    assert.equal(bodyOptional.required, false, 'Body T? should not be required')
    assert.equal(
      bodyOptional.content['application/json'].schema.nullable,
      undefined,
      'Body T? should not have nullable schema'
    )

    // Body undefined (T | undefined) - should be required: false, no nullable
    const bodyUndefined = spec.paths['/nullable/body-undefined'].put.requestBody
    assert.equal(
      bodyUndefined.required,
      false,
      'Body T | undefined should not be required'
    )
    assert.equal(
      bodyUndefined.content['application/json'].schema.nullable,
      undefined,
      'Body T | undefined should not have nullable schema'
    )

    // Cleanup
    fs.unlinkSync(openapiFile)
    fs.unlinkSync(routerFile)
  })
})
