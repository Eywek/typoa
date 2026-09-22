import path from 'path'
import fs from 'fs'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { generate } from '../../src'

function generateFixture(controller: string) {
  const openapiFile = path.resolve(
    __dirname,
    `generated-openapi-${controller}.json`
  )
  return generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, `../fixtures/controllers/${controller}.ts`)
    ],
    openapi: {
      filePath: openapiFile,
      service: { name: controller, version: '1.0.0' }
    },
    router: {
      filePath: path.resolve(__dirname, `generated-router-${controller}.ts`)
    }
  }).then(() => JSON.parse(fs.readFileSync(openapiFile, 'utf8')))
}

test('a misspelled constraint tag fails the generation with a suggestion', async () => {
  await assert.rejects(generateFixture('controller-jsdoc-typo'), {
    message:
      /Unknown JSDoc tag @minLenght on TypoDto\.name, did you mean @minLength\?/
  })
})

test('a constraint tag in the wrong case is a typo too', async () => {
  await assert.rejects(generateFixture('controller-jsdoc-case'), {
    message: /@maxlength on CaseDto\.code, did you mean @maxLength\?/
  })
})

test('unrelated JSDoc tags stay allowed and known ones still apply', async () => {
  const spec = await generateFixture('controller-jsdoc-ok')
  assert.deepEqual(spec.components.schemas.OkDto.properties.name, {
    type: 'string',
    minLength: 1
  })
})
