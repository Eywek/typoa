import path from 'path'
import { readFileSync } from 'fs'
import { strict as assert } from 'node:assert'
import { before, describe, test } from 'node:test'
import Ajv from 'ajv'
import type express from 'express'
import { OpenAPIV3 } from 'openapi-types'
import { generate } from '../../src'
import { validateAndParse } from '../../src/runtime/validator'
import { options } from '../../src/option'

describe('Lossless intersections', () => {
  let spec: OpenAPIV3.Document
  let properties: Record<string, any>
  const ajv = new Ajv({ strict: false })
  const literal = { type: 'string', enum: ['a'] }
  const kind = { $ref: '#/components/schemas/Kind' }
  const tags = { type: 'array', items: { allOf: [literal, kind] } }
  const direct = {
    allOf: [
      { type: 'array', items: literal },
      { type: 'array', items: kind }
    ]
  }
  const object = (
    properties: Record<string, unknown>,
    required = Object.keys(properties),
    additionalProperties: unknown = false
  ) => ({
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties
  })
  const named = object({
    name: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } }
  })

  before(async () => {
    const filePath = path.resolve(
      __dirname,
      'generated-openapi-array-intersections.json'
    )
    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [
        path.resolve(__dirname, '../fixtures/validation/array-intersections.ts')
      ],
      openapi: { filePath, service: { name: 'test', version: '1' } },
      router: {
        filePath: path.resolve(
          __dirname,
          'generated-router-array-intersections.ts'
        )
      }
    })
    spec = JSON.parse(readFileSync(filePath, 'utf8'))
    properties = (spec.components!.schemas!.Cases as OpenAPIV3.SchemaObject)
      .properties!
    ajv.addSchema({ components: spec.components }, 'spec')
  })

  const expected: Record<string, unknown> = {
    direct,
    tags,
    serialized: object({ tags }),
    choice: {
      oneOf: [object({ tags }), object({ other: { type: 'boolean' } })]
    },
    objects: { type: 'array', items: named },
    nullableObjects: { type: 'array', items: { ...named, nullable: true } },
    mixedNullableObjects: { type: 'array', items: named },
    nestedNullableObjects: {
      type: 'array',
      items: { type: 'array', items: { ...named, nullable: true } }
    },
    nested: { type: 'array', items: tags },
    nestedDirect: { type: 'array', items: direct },
    nestedObjects: { type: 'array', items: { type: 'array', items: named } },
    enumValue: { type: 'string', enum: ['b'] },
    conflict: object({
      value: { allOf: [{ type: 'string' }, { type: 'number' }] }
    }),
    optionalConflict: object({}, []),
    required: object({ value: { type: 'string' } }),
    constraints: object({
      name: { type: 'string', minLength: 2, maxLength: 4 }
    }),
    inherited: { $ref: '#/components/schemas/Inherited' },
    narrowed: { $ref: '#/components/schemas/Narrowed' },
    bounded: object({
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 2
      }
    }),
    indexed: object({}, [], {
      allOf: [{ type: 'string' }, { type: 'number' }]
    }),
    inheritedIndex: { $ref: '#/components/schemas/Indexed' },
    openIndex: object({ name: { type: 'string' } }, ['name'], {
      $ref: '#/components/schemas/AnyValue'
    }),
    anyIndex: object({ name: { type: 'string' } }, ['name'], {
      $ref: '#/components/schemas/AnyValue'
    }),
    indexedProperty: object(
      { count: { allOf: [{ type: 'number' }, { type: 'string' }] } },
      ['count'],
      { type: 'string' }
    ),
    numericIndex: object({ name: { type: 'number' } }, ['name'], {
      type: 'string'
    }),
    numericProperty: object(
      { 0: { allOf: [{ type: 'number' }, { type: 'string' }] } },
      ['0'],
      { type: 'string' }
    ),
    nonNumericProperty: object(
      { '01': { type: 'number' }, '1e2': { type: 'number' } },
      ['01', '1e2'],
      { type: 'string' }
    ),
    closed: object({ name: { type: 'string' } }),
    inheritedClosed: { $ref: '#/components/schemas/ClosedPair' },
    modifiers: object({ name: { type: 'string', readOnly: true } }),
    readMerge: object({ value: { type: 'string', readOnly: true } }),
    writeMerge: { $ref: '#/components/schemas/WritePair' },
    mutableClass: { $ref: '#/components/schemas/MutableItem' },
    mutableOverride: { $ref: '#/components/schemas/MutablePair' },
    branded: {
      allOf: [{ type: 'string' }, object({ tag: { type: 'string' } })]
    },
    reference: {
      allOf: [
        { $ref: '#/components/schemas/JsonValue' },
        object({ tag: { type: 'string' } })
      ]
    },
    referenceProperty: object({
      data: { $ref: '#/components/schemas/Named' },
      note: { type: 'string' }
    }),
    composedReference: {
      allOf: [
        { $ref: '#/components/schemas/JsonChoice' },
        object({ active: { type: 'boolean' } })
      ]
    },
    union: {
      oneOf: [
        object({ name: { type: 'string' }, active: { type: 'boolean' } }),
        object({ count: { type: 'number' }, active: { type: 'boolean' } })
      ]
    }
  }

  for (const [name, schema] of Object.entries(expected)) {
    test(`Should preserve the exact schema for ${name}`, () => {
      assert.deepEqual(properties[name], schema)
    })
  }

  test('Should retain enum references and composed references', () => {
    assert.deepEqual(
      spec.components!.schemas!.Indexed,
      object({ kind: literal }, ['kind'], { type: 'string' })
    )
    assert.deepEqual(spec.components!.schemas!.ClosedPair, expected.closed)
    assert.deepEqual(
      spec.components!.schemas!.Narrowed,
      object({ name: { type: 'string', minLength: 3 } })
    )
    assert.deepEqual(
      spec.components!.schemas!.Inherited,
      object({
        name: {
          allOf: [
            { type: 'string', minLength: 2 },
            { type: 'string', maxLength: 4 }
          ]
        }
      })
    )
    assert.deepEqual(spec.components!.schemas!.Kind, {
      type: 'string',
      enum: ['a', 'b']
    })
    assert.deepEqual(spec.components!.schemas!.JsonValue, { type: 'string' })
    assert.deepEqual(spec.components!.schemas!.JsonChoice, {
      oneOf: [
        object({ left: { type: 'string' } }),
        object({ right: { type: 'number' } })
      ]
    })
  })

  test('Should merge writeOnly metadata from a non-leading base', () => {
    assert.deepEqual(
      spec.components!.schemas!.WritePair,
      object({ value: { type: 'string', writeOnly: true } })
    )
  })

  test('Should not copy metadata from an overridden class property', () => {
    assert.deepEqual(
      spec.components!.schemas!.MutableItem,
      object({ value: { type: 'string', default: 'x' } }, [])
    )
  })

  test('Should let an interface override inherited readonly metadata', () => {
    assert.deepEqual(
      spec.components!.schemas!.MutablePair,
      object({
        value: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
      })
    )
  })

  const parse = (schema: OpenAPIV3.SchemaObject, value: unknown) =>
    validateAndParse(
      {
        body: value,
        headers: { 'content-type': 'application/json' }
      } as express.Request,
      spec.components!.schemas!,
      {
        params: [{ name: 'body', in: 'body' as any }],
        body: { required: true, content: { 'application/json': { schema } } }
      }
    )

  test('Should validate open index signatures without weakening named properties', async () => {
    for (const name of ['openIndex', 'anyIndex']) {
      for (const value of [
        { name: 'x', extra: 1 },
        { name: 'x', extra: { value: true } }
      ]) {
        assert.deepEqual(await parse(properties[name], value), [value])
      }
      for (const value of [{}, { name: {} }]) {
        await assert.rejects(() => parse(properties[name], value))
      }
    }
  })

  test('Should preserve array constraints for a small exhaustive set of values', async () => {
    const values: unknown[] = ['a', 'b', 'c', 3, null, {}]
    const arrays = [
      [],
      ...values.map(value => [value]),
      ...values.flatMap(a => values.map(b => [a, b]))
    ]
    for (const name of ['direct', 'tags', 'serialized', 'choice', 'nested']) {
      for (const array of arrays) {
        const value =
          name === 'serialized' || name === 'choice'
            ? { tags: array }
            : name === 'nested'
              ? [array]
              : array
        const valid = array.every(item => item === 'a')
        assert.equal(
          ajv.validate(
            { $ref: `spec#/components/schemas/Cases/properties/${name}` },
            value
          ),
          valid,
          `${name}: ${JSON.stringify(value)}`
        )
        if (valid)
          assert.deepEqual(await parse(properties[name], value), [value])
        else await assert.rejects(parse(properties[name], value))
      }
    }
  })

  const samples: Record<string, { valid: unknown[]; invalid: unknown[] }> = {
    nullableObjects: {
      valid: [
        [],
        [null],
        [{ name: 'x', tags: [] }],
        [null, { name: 'x', tags: ['a'] }]
      ],
      invalid: [
        [{}],
        [{ name: 'x' }],
        [{ name: 'x', tags: {} }],
        [{ name: 'x', tags: [], extra: true }]
      ]
    },
    mixedNullableObjects: {
      valid: [[], [{ name: 'x', tags: [] }]],
      invalid: [[null], [{}], [{ tags: [] }]]
    },
    nestedNullableObjects: {
      valid: [[], [[]], [[null, { name: 'x', tags: [] }]]],
      invalid: [[null], [[{}]], [[{ name: 'x' }]]]
    },
    mutableOverride: {
      valid: [
        { value: 'x', tags: [] },
        { value: 'y', tags: ['a'] }
      ],
      invalid: [{}, { value: {}, tags: [] }, { value: 'x', tags: {} }]
    },
    objects: {
      valid: [[], [{ name: 'x', tags: [] }]],
      invalid: [[{}], [{ name: 'x' }]]
    },
    nestedObjects: {
      valid: [[], [[{ name: 'x', tags: [] }]]],
      invalid: [[[{}]]]
    },
    enumValue: { valid: ['b'], invalid: ['a', 'c'] },
    conflict: { valid: [], invalid: [{}, { value: {} }] },
    optionalConflict: { valid: [{}], invalid: [{ value: {} }] },
    required: { valid: [{ value: 'x' }], invalid: [{}, { value: {} }] },
    inherited: {
      valid: [{ name: 'ab' }],
      invalid: [{ name: 'a' }, { name: 'abcde' }]
    },
    bounded: {
      valid: [{ tags: ['a'] }, { tags: ['a', 'b'] }],
      invalid: [{ tags: [] }, { tags: ['a', 'b', 'c'] }]
    },
    constraints: {
      valid: [{ name: 'ab' }, { name: 'abcd' }],
      invalid: [{ name: 'a' }, { name: 'abcde' }, {}]
    },
    indexed: { valid: [{}], invalid: [{ x: {} }] },
    inheritedIndex: {
      valid: [{ kind: 'a', other: 'b' }],
      invalid: [{ kind: 'b' }, { kind: 'a', other: {} }]
    },
    indexedProperty: { valid: [], invalid: [{}, { count: {} }] },
    numericIndex: {
      valid: [{ name: 1 }, { name: 1, 0: 'x' }],
      invalid: [{}, { name: {} }, { name: 1, 0: {} }]
    },
    numericProperty: { valid: [], invalid: [{}, { 0: {} }] },
    nonNumericProperty: {
      valid: [{ '01': 1, '1e2': 2 }],
      invalid: [{}, { '01': {}, '1e2': 2 }]
    },
    closed: {
      valid: [{ name: 'x' }],
      invalid: [{ name: 'x', extra: true }, {}]
    },
    inheritedClosed: {
      valid: [{ name: 'x' }],
      invalid: [{ name: 'x', extra: true }]
    },
    branded: { valid: [], invalid: ['x', {}] },
    reference: { valid: [], invalid: ['x', {}] },
    referenceProperty: {
      valid: [{ data: { name: 'x' }, note: 'n' }],
      invalid: [{ data: {}, note: 'n' }]
    },
    composedReference: { valid: [], invalid: [{ active: true }, {}] },
    union: {
      valid: [
        { name: 'x', active: true },
        { count: 1, active: false }
      ],
      invalid: [{ name: 'x' }, { active: true }]
    }
  }
  for (const [name, { valid, invalid }] of Object.entries(samples)) {
    test(`Should validate retained constraints for ${name}`, async () => {
      options.features.enableThrowOnUnexpectedAdditionalData = true
      try {
        for (const value of valid) {
          assert.equal(
            ajv.validate(
              { $ref: `spec#/components/schemas/Cases/properties/${name}` },
              value
            ),
            true
          )
          assert.deepEqual(await parse(properties[name], value), [value])
        }
        for (const value of invalid) {
          assert.equal(
            ajv.validate(
              { $ref: `spec#/components/schemas/Cases/properties/${name}` },
              value
            ),
            false
          )
          await assert.rejects(parse(properties[name], value))
        }
      } finally {
        options.features.enableThrowOnUnexpectedAdditionalData = false
      }
    })
  }

  test('Should keep readonly, required and non-nullable constraints together', async () => {
    const schema = properties.modifiers.properties.name
    assert.deepEqual(await parse(schema, 'x'), ['x'])
    await assert.rejects(parse(schema, null))
    assert.equal(
      ajv.validate(
        { $ref: 'spec#/components/schemas/Cases/properties/modifiers' },
        {}
      ),
      false
    )
  })
})
