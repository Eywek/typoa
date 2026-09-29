import path from 'path'
import fs from 'fs'
import { strict as assert } from 'node:assert'
import { test, TestContext } from 'node:test'

import { generate, OpenAPIConfiguration, setRuntimeOptions } from '../../src'

function generateFixture(
  controller: string,
  openapiOptions: Partial<OpenAPIConfiguration['openapi']> = {}
) {
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
      service: { name: controller, version: '1.0.0' },
      ...openapiOptions
    },
    router: {
      filePath: path.resolve(__dirname, `generated-router-${controller}.ts`)
    }
  }).then(() => JSON.parse(fs.readFileSync(openapiFile, 'utf8')))
}

function captureWarnings(t: TestContext): string[] {
  const warnings: string[] = []
  const noop = () => {}
  setRuntimeOptions({
    customLogger: {
      trace: noop,
      debug: noop,
      info: noop,
      warn: message => warnings.push(message),
      error: noop
    },
    features: {}
  })
  t.after(() => setRuntimeOptions({ features: {} }))
  return warnings
}

test('a misspelled constraint tag is reported as a warning by default', async t => {
  const warnings = captureWarnings(t)
  const spec = await generateFixture('controller-jsdoc-typo')
  assert.equal(warnings.length, 1)
  assert.match(
    warnings[0],
    /Unknown JSDoc tag @minLenght on TypoDto\.name, did you mean @minLength\?/
  )
  assert.deepEqual(spec.components.schemas.TypoDto.properties.name, {
    type: 'string'
  })
})

test('a misspelled constraint tag fails the generation with strictJsDocTags', async () => {
  await assert.rejects(
    generateFixture('controller-jsdoc-typo', { strictJsDocTags: true }),
    {
      message:
        /Unknown JSDoc tag @minLenght on TypoDto\.name, did you mean @minLength\?/
    }
  )
})

test('a constraint tag in the wrong case is a typo too', async () => {
  await assert.rejects(
    generateFixture('controller-jsdoc-case', { strictJsDocTags: true }),
    {
      message: /@maxlength on CaseDto\.code, did you mean @maxLength\?/
    }
  )
})

test('unrelated JSDoc tags stay allowed and known ones still apply', async t => {
  const warnings = captureWarnings(t)
  const spec = await generateFixture('controller-jsdoc-ok')
  assert.deepEqual(warnings, [])
  assert.deepEqual(spec.components.schemas.OkDto.properties.name, {
    type: 'string',
    minLength: 1
  })
})
