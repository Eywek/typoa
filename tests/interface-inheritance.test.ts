import fs from 'fs';
import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../src';

test('Should generate allOf schemas for interface inheritance', async () => {
  const tempSpecPath = '/tmp/interface-inheritance-test.json';

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
  });

  const specContent = await fs.promises.readFile(tempSpecPath);
  const spec = JSON.parse(specContent.toString());

  // Verify the Base schema
  const baseSchema = spec.components.schemas.Base;
  assert.ok(baseSchema);
  assert.strictEqual(baseSchema.type, 'object');
  assert.ok(baseSchema.properties.id);
  assert.ok(baseSchema.properties.name);
  assert.deepStrictEqual(baseSchema.required, ['id', 'name']);

  // Verify the Foo schema
  const fooSchema = spec.components.schemas.Foo;
  assert.ok(fooSchema);
  assert.strictEqual(fooSchema.type, 'object');
  assert.ok(fooSchema.properties.foo);
  assert.deepStrictEqual(fooSchema.required, ['foo']);

  // Verify the Bar schema uses allOf
  const barSchema = spec.components.schemas.Bar;
  assert.ok(barSchema);
  assert.ok(barSchema.allOf, 'Bar should use allOf for inheritance');
  assert.strictEqual(barSchema.allOf.length, 2);

  // First element should be a reference to Foo
  const fooRef = barSchema.allOf[0];
  assert.ok(fooRef.$ref);
  assert.strictEqual(fooRef.$ref, '#/components/schemas/Foo');

  // Second element should contain Bar's own properties
  const barProperties = barSchema.allOf[1];
  assert.strictEqual(barProperties.type, 'object');
  assert.ok(barProperties.properties.bar);
  assert.deepStrictEqual(barProperties.required, ['bar']);

  // Verify the Baz schema uses allOf with Bar reference
  const bazSchema = spec.components.schemas.Baz;
  assert.ok(bazSchema);
  assert.ok(bazSchema.allOf, 'Baz should use allOf for inheritance');
  assert.strictEqual(bazSchema.allOf.length, 2);

  // First element should be a reference to Bar
  const barRef = bazSchema.allOf[0];
  assert.ok(barRef.$ref);
  assert.strictEqual(barRef.$ref, '#/components/schemas/Bar');

  // Second element should contain Baz's own properties
  const bazProperties = bazSchema.allOf[1];
  assert.strictEqual(bazProperties.type, 'object');
  assert.ok(bazProperties.properties.baz);
  assert.deepStrictEqual(bazProperties.required, ['baz']);

  // Verify Extended interface uses allOf
  const extendedSchema = spec.components.schemas.Extended;
  assert.ok(extendedSchema);
  assert.ok(extendedSchema.allOf);
  assert.strictEqual(extendedSchema.allOf.length, 2);

  // First element should be a reference to Base
  const baseRef = extendedSchema.allOf[0];
  assert.ok(baseRef.$ref);
  assert.strictEqual(baseRef.$ref, '#/components/schemas/Base');

  // Second element should contain Extended's own properties
  const extendedProperties = extendedSchema.allOf[1];
  assert.strictEqual(extendedProperties.type, 'object');
  assert.ok(extendedProperties.properties.description);
  assert.ok(extendedProperties.properties.active);
  assert.deepStrictEqual(extendedProperties.required, ['description', 'active']);

  // Verify MultipleInheritance uses allOf with Extended reference
  const multipleSchema = spec.components.schemas.MultipleInheritance;
  assert.ok(multipleSchema);
  assert.ok(multipleSchema.allOf);
  assert.strictEqual(multipleSchema.allOf.length, 2);

  // First element should be a reference to Extended
  const extendedRef = multipleSchema.allOf[0];
  assert.ok(extendedRef.$ref);
  assert.strictEqual(extendedRef.$ref, '#/components/schemas/Extended');

  // Second element should contain MultipleInheritance's own properties
  const multipleProperties = multipleSchema.allOf[1];
  assert.strictEqual(multipleProperties.type, 'object');
  assert.ok(multipleProperties.properties.metadata);
  assert.deepStrictEqual(multipleProperties.required, ['metadata']);
});
