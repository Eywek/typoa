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

  test('Should keep a base used on its own strict', () => {
    assert.strictEqual(spec.components.schemas.Base.additionalProperties, false)
    assert.strictEqual(validate('Base', { id: '1', name: 'x' }), true)
    assert.strictEqual(
      validate('Base', { id: '1', name: 'x', description: 'd', active: true }),
      false
    )
    assert.strictEqual(
      validate('Extended', {
        id: '1',
        name: 'x',
        description: 'd',
        active: true
      }),
      true
    )
  })

  test('Should merge the properties of several bases', () => {
    const schema = spec.components.schemas.SeveralBases
    assert.deepStrictEqual(Object.keys(schema.properties).sort(), [
      'createdAt',
      'id',
      'name',
      'tags',
      'updatedAt'
    ])
    assert.deepStrictEqual(schema.required.sort(), [
      'createdAt',
      'id',
      'name',
      'updatedAt'
    ])
    // Modifiers of inherited properties are kept
    assert.strictEqual(schema.properties.updatedAt.readOnly, true)
    const value = { id: '1', name: 'x', createdAt: 'c', updatedAt: 'u' }
    assert.strictEqual(validate('SeveralBases', value), true)
    assert.strictEqual(
      validate('SeveralBases', { ...value, tags: ['t'] }),
      true
    )
    assert.strictEqual(
      validate('SeveralBases', { id: '1', name: 'x', updatedAt: 'u' }),
      false
    )
  })

  test('Should only inherit the picked properties of a Pick base', () => {
    assert.deepStrictEqual(spec.components.schemas.PickedBase, {
      type: 'object',
      properties: {
        label: { type: 'string' },
        id: { type: 'string' }
      },
      required: ['label', 'id'],
      additionalProperties: false
    })
    assert.strictEqual(validate('PickedBase', { id: '1', label: 'l' }), true)
    assert.strictEqual(
      validate('PickedBase', { id: '1', label: 'l', name: 'x' }),
      false
    )
  })

  test('Should inherit the properties of a Partial base as optional', () => {
    const schema = spec.components.schemas.PartialBase
    assert.deepStrictEqual(Object.keys(schema.properties).sort(), [
      'id',
      'label',
      'name'
    ])
    assert.deepStrictEqual(schema.required, ['label'])
    assert.strictEqual(validate('PartialBase', { label: 'l' }), true)
    assert.strictEqual(
      validate('PartialBase', { label: 'l', id: '1', name: 'x' }),
      true
    )
    assert.strictEqual(validate('PartialBase', { id: '1' }), false)
  })

  test('Should use the narrowed type of an overridden property', () => {
    assert.deepStrictEqual(spec.components.schemas.Narrowed.properties.name, {
      type: 'string',
      enum: ['fixed']
    })
    assert.strictEqual(validate('Narrowed', { id: '1', name: 'fixed' }), true)
    assert.strictEqual(validate('Narrowed', { id: '1', name: 'other' }), false)
  })

  test('Should keep the JSDoc constraints of inherited properties', () => {
    assert.deepStrictEqual(
      spec.components.schemas.ExtendsConstrained.properties.code,
      { type: 'string', minLength: 3 }
    )
    assert.strictEqual(
      validate('ExtendsConstrained', { code: 'abc', extra: 1 }),
      true
    )
    assert.strictEqual(
      validate('ExtendsConstrained', { code: 'ab', extra: 1 }),
      false
    )
  })

  test('Should resolve the type arguments of a generic base', () => {
    assert.deepStrictEqual(spec.components.schemas.StringBox.properties.value, {
      type: 'string'
    })
    assert.strictEqual(validate('StringBox', { value: 'v', label: 'l' }), true)
    assert.strictEqual(validate('StringBox', { value: 1, label: 'l' }), false)
  })

  test('Should keep the index signature of a base as additionalProperties', () => {
    assert.deepStrictEqual(spec.components.schemas.ExtendsDictionary, {
      type: 'object',
      properties: { total: { type: 'number' } },
      required: ['total'],
      additionalProperties: { type: 'number' }
    })
    assert.strictEqual(
      validate('ExtendsDictionary', { total: 2, a: 1, b: 1 }),
      true
    )
    assert.strictEqual(
      validate('ExtendsDictionary', { total: 2, a: 'one' }),
      false
    )
  })

  test('Should let an interface close an open base with @additionalproperties false', () => {
    assert.strictEqual(
      spec.components.schemas.ClosesOpen.additionalProperties,
      false
    )
    assert.strictEqual(
      validate('ClosesOpen', { open: 'x', closed: 'y', other: 1 }),
      false
    )
  })

  test('Should narrow a property declared by several intersection members', () => {
    const schema = spec.components.schemas.Composition.properties.overlapping
    assert.deepStrictEqual(schema, {
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok'] } },
      required: ['status'],
      additionalProperties: false
    })
  })

  test('Should flatten an intersection of more than two members', () => {
    const schema = spec.components.schemas.Composition.properties.threeMembers
    assert.deepStrictEqual(schema, {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
        c: { type: 'boolean' }
      },
      required: ['a', 'b'],
      additionalProperties: false
    })
  })

  test('Should keep nullable on a flattened intersection', () => {
    const schema =
      spec.components.schemas.Composition.properties.nullableIntersection
    assert.strictEqual(schema.nullable, true)
    assert.strictEqual(schema.allOf, undefined)
    assert.deepStrictEqual(Object.keys(schema.properties), ['a', 'c'])
  })

  test('Should keep allOf for an intersection with a primitive', () => {
    const schema = spec.components.schemas.Composition.properties.branded
    assert.strictEqual(schema.allOf.length, 2)
    assert.deepStrictEqual(schema.allOf[0], { type: 'string' })
  })

  test('Should no longer emit a schema only used as a base', () => {
    for (const name of ['Foo', 'A', 'Article', 'Constrained', 'Dictionary']) {
      assert.strictEqual(spec.components.schemas[name], undefined, name)
    }
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
