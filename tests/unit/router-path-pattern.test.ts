import path from 'path'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { generate } from '../../src'

test('Should fail generate with invalid path parameter pattern', async () => {
  await assert.rejects(
    () =>
      generate({
        tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
        controllers: [
          path.resolve(
            __dirname,
            '../fixtures/routing/router-controller-invalid-path-pattern.ts'
          )
        ],
        openapi: {
          filePath: path.resolve(
            __dirname,
            'generated-openapi-path-pattern.json'
          ),
          service: {
            name: 'my-service',
            version: '1.0.0'
          }
        },
        router: {
          filePath: path.resolve(__dirname, 'generated-router-path-pattern.ts')
        }
      }),
    {
      message:
        "Invalid path pattern '*' for parameter 'path' in route 'GET /files/{path(*)}': Invalid regular expression: /^(?:*)$/: Nothing to repeat"
    }
  )
})
