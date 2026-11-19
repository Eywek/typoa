import path from 'path'
import Ajv from 'ajv'
import { strict as assert } from 'node:assert'
import { before, describe, test } from 'node:test'

import { generate } from '../../src'

describe('Interface inheritance', () => {
  let spec: any
  let validate: (schemaName: string, value: unknown) => boolean

  before(async () => {
    const openapiFile = path.resolve(
      __dirname,
      'generated-openapi-interface-inheritance-test.json'
    )
    const routerFile = path.resolve(
      __dirname,
      'generated-router-interface-inheritance.ts'
    )

    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [
        path.resolve(
          __dirname,
          '../fixtures/validation/interface-inheritance-test.ts'
        )
      ],
      openapi: {
        filePath: openapiFile,
        service: {
          name: 'test-service',
          version: '1.0.0'
        }
      },
      router: {
        filePath: routerFile
      }
    })

    spec = (await import(openapiFile)).default
    const ajv = new Ajv({ strict: false })
    ajv.addSchema({ components: spec.components }, 'spec')
    validate = (schemaName, value) =>
      ajv.validate({ $ref: `spec#/components/schemas/${schemaName}` }, value)
  })

  test('Should flatten inherited properties into a single object schema', () => {
    assert.deepStrictEqual(spec.components.schemas.Bar, {
      type: 'object',
      properties: {
        bar: { type: 'number' },
        foo: { type: 'number' }
      },
      required: ['bar', 'foo'],
      additionalProperties: false
    })

    const bazSchema = spec.components.schemas.Baz
    assert.strictEqual(bazSchema.allOf, undefined)
    assert.deepStrictEqual(Object.keys(bazSchema.properties).sort(), [
      'bar',
      'baz',
      'foo'
    ])
    assert.deepStrictEqual(bazSchema.required.sort(), ['bar', 'baz', 'foo'])

    const multipleSchema = spec.components.schemas.MultipleInheritance
    assert.strictEqual(multipleSchema.allOf, undefined)
    assert.deepStrictEqual(Object.keys(multipleSchema.properties).sort(), [
      'active',
      'description',
      'id',
      'metadata',
      'name'
    ])
    assert.strictEqual(multipleSchema.additionalProperties, false)
  })

  test('Should validate an object extending a mapped type with a JSON Schema validator', () => {
    assert.strictEqual(spec.components.schemas.B.allOf, undefined)
    assert.strictEqual(validate('B', { a: 'x', b: 1 }), true)
    assert.strictEqual(validate('B', { a: 'x', b: 1, c: true }), false)
    assert.strictEqual(validate('B', { b: 1 }), false)
  })

  test('Should validate an interface overriding an omitted property', () => {
    const article = { id: '1', revisions: [{ id: 'r1' }] }
    assert.strictEqual(validate('SerializedArticle', article), true)
    assert.strictEqual(
      validate('SerializedArticle', { ...article, revisions: ['r1'] }),
      false
    )
    assert.strictEqual(
      validate('SerializedArticle', { ...article, x: 1 }),
      false
    )
  })

  test('Should validate every level of a deep inheritance', () => {
    assert.strictEqual(validate('Baz', { foo: 1, bar: 2, baz: 'x' }), true)
    assert.strictEqual(validate('Bar', { foo: 1, bar: 2 }), true)
    assert.strictEqual(validate('Bar', { foo: 1, bar: 2, baz: 'x' }), false)
  })

  test('Should flatten object intersections', () => {
    const schema =
      spec.paths['/inheritance-test/intersected'].get.responses['200'].content[
        'application/json'
      ].schema
    assert.deepStrictEqual(schema, {
      type: 'object',
      properties: {
        a: { type: 'string' },
        c: { type: 'boolean' }
      },
      required: ['a', 'c'],
      additionalProperties: false
    })
  })

  test('Should keep additional properties allowed by an extended interface', () => {
    assert.strictEqual(
      spec.components.schemas.ExtendsOpen.additionalProperties,
      true
    )
    assert.strictEqual(
      validate('ExtendsOpen', { open: 'x', closed: 'y', other: 1 }),
      true
    )
  })
})
