import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../../src';

test('Should handle Omit<Class, "toJSON"> with circular toJSON correctly', async () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi-circular-tojson-test.json');
  const routerFile = path.resolve(__dirname, 'generated-router-circular-tojson.ts');

  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, '../fixtures/controllers/controller-infinite-loop-trigger.ts')],
    openapi: {
      filePath: openapiFile,
      service: {
        name: 'circular-tojson-test',
        version: '1.0.0'
      }
    },
    router: {
      filePath: routerFile
    }
  });

  const spec = (await import(openapiFile)).default;

  // Verify that generation completed without infinite loop
  assert.ok(spec);
  assert.ok(spec.components);
  assert.ok(spec.components.schemas);
  
  // Verify the controller paths were generated
  assert.ok(spec.paths);
  assert.ok(spec.paths['/infinite-loop-trigger']);
  assert.ok(spec.paths['/infinite-loop-trigger'].get);
  assert.ok(spec.paths['/infinite-loop-trigger'].post);
  
  // Verify that Foo schema was generated (should reference Foo_Without_ToJSON to break circular reference)
  const fooSchema = spec.components.schemas.Foo;
  assert.ok(fooSchema);
  assert.strictEqual(fooSchema.$ref, '#/components/schemas/Foo_Without_ToJSON');
  
  // Verify that Omit schemas were generated with proper names and structure
  const omitSchema = spec.components.schemas['Foo_Without_ToJSON'];
  assert.ok(omitSchema);
  assert.strictEqual(omitSchema.type, 'object');
  assert.ok(omitSchema.properties);
  assert.ok(omitSchema.properties.foo);
  assert.strictEqual(omitSchema.properties.foo.type, 'string');
  
  // Verify the response schema references are correct
  const getResponse = spec.paths['/infinite-loop-trigger'].get.responses['200'];
  assert.ok(getResponse);
  assert.ok(getResponse.content);
  assert.ok(getResponse.content['application/json']);
  assert.ok(getResponse.content['application/json'].schema);
  assert.strictEqual(getResponse.content['application/json'].schema.$ref, '#/components/schemas/Foo_Without_ToJSON');
});
