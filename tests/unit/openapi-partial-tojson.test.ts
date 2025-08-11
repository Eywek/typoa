import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../../src';

test('Should handle Partial<> on classes with toJSON correctly', async () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi-partial-tojson-test.json');
  const routerFile = path.resolve(__dirname, 'generated-router-partial-tojson.ts');

  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, '../fixtures/controllers/controller.*')],
    openapi: {
      filePath: openapiFile,
      service: {
        name: 'partial-tojson-test',
        version: '1.0.0'
      }
    },
    router: {
      filePath: routerFile
    }
  });

  const spec = (await import(openapiFile)).default;

  // Test Foo schema
  const fooSchema = spec.components.schemas.Foo;
  assert.ok(fooSchema);
  assert.strictEqual(fooSchema.type, 'object');
  assert.ok(fooSchema.properties.foo);
  assert.strictEqual(fooSchema.properties.foo.type, 'string');
  assert.deepStrictEqual(fooSchema.required, ['foo']);

  // Test Foo_Partial schema
  const fooPartialSchema = spec.components.schemas.Foo_Partial;
  assert.ok(fooPartialSchema);
  assert.strictEqual(fooPartialSchema.type, 'object');
  assert.ok(fooPartialSchema.properties.foo);
  assert.strictEqual(fooPartialSchema.properties.foo.type, 'string');
  assert.ok(!fooPartialSchema.required);

  // Verify both schemas have the same properties
  assert.deepStrictEqual(
    Object.keys(fooSchema.properties).sort(),
    Object.keys(fooPartialSchema.properties).sort()
  );

  // Verify toJSON transformation
  assert.ok(!fooSchema.properties.name);
  assert.ok(!fooPartialSchema.properties.name);
  assert.ok(fooSchema.properties.foo);
  assert.ok(fooPartialSchema.properties.foo);

  // Test Bar interface schema
  const barSchema = spec.components.schemas.Bar;
  assert.ok(barSchema);
  assert.strictEqual(barSchema.type, 'object');
  assert.ok(barSchema.properties.bar);
  assert.strictEqual(barSchema.properties.bar.type, 'string');
  assert.deepStrictEqual(barSchema.required, ['bar']);

  // Test Bar_Partial schema
  const barPartialSchema = spec.components.schemas.Bar_Partial;
  assert.ok(barPartialSchema);
  assert.strictEqual(barPartialSchema.type, 'object');
  assert.ok(barPartialSchema.properties.bar);
  assert.strictEqual(barPartialSchema.properties.bar.type, 'string');
  assert.ok(!barPartialSchema.required);

  // Verify Bar schemas have the same properties
  assert.deepStrictEqual(
    Object.keys(barSchema.properties).sort(),
    Object.keys(barPartialSchema.properties).sort()
  );

  // Verify Bar toJSON transformation
  assert.ok(!barSchema.properties.id);
  assert.ok(!barSchema.properties.data);
  assert.ok(!barPartialSchema.properties.id);
  assert.ok(!barPartialSchema.properties.data);
  assert.ok(barSchema.properties.bar);
  assert.ok(barPartialSchema.properties.bar);
});
