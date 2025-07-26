import test from 'ava'
import fs from 'fs'
import path from 'path'

import { generate } from '../src'

test('Should handle Partial<> on classes with toJSON correctly', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/controller.*')],
    openapi: {
      filePath: '/tmp/partial-tojson-test.json',
      service: {
        name: 'partial-tojson-test',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/partial-tojson-router.ts'
    }
  })

  const specContent = await fs.promises.readFile('/tmp/partial-tojson-test.json')
  const spec = JSON.parse(specContent.toString())

  // Test Foo schema
  const fooSchema = spec.components.schemas.Foo
  t.truthy(fooSchema)
  t.is(fooSchema.type, 'object')
  t.truthy(fooSchema.properties.foo)
  t.is(fooSchema.properties.foo.type, 'string')
  t.deepEqual(fooSchema.required, ['foo'])

  // Test Foo_Partial schema
  const fooPartialSchema = spec.components.schemas.Foo_Partial
  t.truthy(fooPartialSchema)
  t.is(fooPartialSchema.type, 'object')
  t.truthy(fooPartialSchema.properties.foo)
  t.is(fooPartialSchema.properties.foo.type, 'string')
  t.falsy(fooPartialSchema.required)

  // Verify both schemas have the same properties
  t.deepEqual(
    Object.keys(fooSchema.properties).sort(),
    Object.keys(fooPartialSchema.properties).sort()
  )

  // Verify toJSON transformation
  t.falsy(fooSchema.properties.name)
  t.falsy(fooPartialSchema.properties.name)
  t.truthy(fooSchema.properties.foo)
  t.truthy(fooPartialSchema.properties.foo)

  // Test Bar interface schema
  const barSchema = spec.components.schemas.Bar
  t.truthy(barSchema)
  t.is(barSchema.type, 'object')
  t.truthy(barSchema.properties.bar)
  t.is(barSchema.properties.bar.type, 'string')
  t.deepEqual(barSchema.required, ['bar'])

  // Test Bar_Partial schema
  const barPartialSchema = spec.components.schemas.Bar_Partial
  t.truthy(barPartialSchema)
  t.is(barPartialSchema.type, 'object')
  t.truthy(barPartialSchema.properties.bar)
  t.is(barPartialSchema.properties.bar.type, 'string')
  t.falsy(barPartialSchema.required)

  // Verify Bar schemas have the same properties
  t.deepEqual(
    Object.keys(barSchema.properties).sort(),
    Object.keys(barPartialSchema.properties).sort()
  )

  // Verify Bar toJSON transformation
  t.falsy(barSchema.properties.id)
  t.falsy(barSchema.properties.data)
  t.falsy(barPartialSchema.properties.id)
  t.falsy(barPartialSchema.properties.data)
  t.truthy(barSchema.properties.bar)
  t.truthy(barPartialSchema.properties.bar)
})
