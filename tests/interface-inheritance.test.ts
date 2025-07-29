import fs from 'fs'
import path from 'path'
import test from 'ava'

import { generate } from '../src'

test('Should generate allOf schemas for interface inheritance', async (t) => {
  const tempSpecPath = '/tmp/interface-inheritance-test.json'

  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/interface-inheritance-test.ts')],
    openapi: {
      filePath: tempSpecPath,
      service: {
        name: 'test-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/test-router.ts'
    }
  })

  const specContent = await fs.promises.readFile(tempSpecPath)
  const spec = JSON.parse(specContent.toString())

  // Verify the Base schema
  const baseSchema = spec.components.schemas.Base
  t.truthy(baseSchema)
  t.is(baseSchema.type, 'object')
  t.truthy(baseSchema.properties.id)
  t.truthy(baseSchema.properties.name)
  t.deepEqual(baseSchema.required, ['id', 'name'])

  // Verify the Foo schema
  const fooSchema = spec.components.schemas.Foo
  t.truthy(fooSchema)
  t.is(fooSchema.type, 'object')
  t.truthy(fooSchema.properties.foo)
  t.deepEqual(fooSchema.required, ['foo'])

  // Verify the Bar schema uses allOf
  const barSchema = spec.components.schemas.Bar
  t.truthy(barSchema)
  t.truthy(barSchema.allOf, 'Bar should use allOf for inheritance')
  t.is(barSchema.allOf.length, 2)
  
  // First element should be a reference to Foo
  const fooRef = barSchema.allOf[0]
  t.truthy(fooRef.$ref)
  t.is(fooRef.$ref, '#/components/schemas/Foo')
  
  // Second element should contain Bar's own properties
  const barProperties = barSchema.allOf[1]
  t.is(barProperties.type, 'object')
  t.truthy(barProperties.properties.bar)
  t.deepEqual(barProperties.required, ['bar'])

  // Verify the Baz schema uses allOf with Bar reference
  const bazSchema = spec.components.schemas.Baz
  t.truthy(bazSchema)
  t.truthy(bazSchema.allOf, 'Baz should use allOf for inheritance')
  t.is(bazSchema.allOf.length, 2)
  
  // First element should be a reference to Bar
  const barRef = bazSchema.allOf[0]
  t.truthy(barRef.$ref)
  t.is(barRef.$ref, '#/components/schemas/Bar')
  
  // Second element should contain Baz's own properties
  const bazProperties = bazSchema.allOf[1]
  t.is(bazProperties.type, 'object')
  t.truthy(bazProperties.properties.baz)
  t.deepEqual(bazProperties.required, ['baz'])

  // Verify Extended interface uses allOf
  const extendedSchema = spec.components.schemas.Extended
  t.truthy(extendedSchema)
  t.truthy(extendedSchema.allOf)
  t.is(extendedSchema.allOf.length, 2)
  
  // First element should be a reference to Base
  const baseRef = extendedSchema.allOf[0]
  t.truthy(baseRef.$ref)
  t.is(baseRef.$ref, '#/components/schemas/Base')
  
  // Second element should contain Extended's own properties
  const extendedProperties = extendedSchema.allOf[1]
  t.is(extendedProperties.type, 'object')
  t.truthy(extendedProperties.properties.description)
  t.truthy(extendedProperties.properties.active)
  t.deepEqual(extendedProperties.required, ['description', 'active'])

  // Verify MultipleInheritance uses allOf with Extended reference
  const multipleSchema = spec.components.schemas.MultipleInheritance
  t.truthy(multipleSchema)
  t.truthy(multipleSchema.allOf)
  t.is(multipleSchema.allOf.length, 2)
  
  // First element should be a reference to Extended
  const extendedRef = multipleSchema.allOf[0]
  t.truthy(extendedRef.$ref)
  t.is(extendedRef.$ref, '#/components/schemas/Extended')
  
  // Second element should contain MultipleInheritance's own properties
  const multipleProperties = multipleSchema.allOf[1]
  t.is(multipleProperties.type, 'object')
  t.truthy(multipleProperties.properties.metadata)
  t.deepEqual(multipleProperties.required, ['metadata'])
})
