import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../../src';

test('Should generate additionalProperties for types with specific keys and index signatures', async () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi-record-index-signature-test.json');
  const routerFile = path.resolve(__dirname, 'generated-router-record-index-signature.ts');

  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, '../fixtures/validation/record-index-signature-test.ts')],
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
  });

  const spec = (await import(openapiFile)).default;

  // Verify the Meta schema
  const metaSchema = spec.components.schemas.Meta;
  assert.ok(metaSchema);
  assert.strictEqual(metaSchema.type, 'object');

  // Should have specific properties
  assert.ok(metaSchema.properties);
  assert.ok(metaSchema.properties['email-token']);
  assert.ok(metaSchema.properties['esp']);
  assert.strictEqual(metaSchema.properties['email-token'].type, 'string');
  assert.strictEqual(metaSchema.properties['esp'].type, 'string');

  // Should NOT have required array (both properties are optional)
  assert.ok(!metaSchema.required);

  // Should have additionalProperties for the index signature
  assert.ok(metaSchema.additionalProperties);
  assert.strictEqual(metaSchema.additionalProperties.type, 'string');
  assert.strictEqual(metaSchema.additionalProperties.nullable, true);

  // Verify direct endpoint response
  const directResponse = spec.paths['/record-index-test/direct'].get.responses['200'];
  const directSchema = directResponse.content['application/json'].schema;
  assert.strictEqual(directSchema.$ref, '#/components/schemas/Meta');

  // Verify partial-pick endpoint response  
  const partialPickResponse = spec.paths['/record-index-test/partial-pick'].get.responses['200'];
  const partialPickSchema = partialPickResponse.content['application/json'].schema;

  // The partial-pick should either reference Meta or have inline properties
  // that preserve the additionalProperties via reference
  if (partialPickSchema.$ref) {
    // If it's a reference, verify the referenced schema has the correct structure
    const referencedSchemaName = partialPickSchema.$ref.split('/').pop();
    const referencedSchema = spec.components.schemas[referencedSchemaName];
    assert.ok(referencedSchema);
  } else {
    // If it's inline, verify it has the meta property with correct reference
    assert.ok(partialPickSchema.properties);
    assert.ok(partialPickSchema.properties.meta);
    assert.strictEqual(partialPickSchema.properties.meta.$ref, '#/components/schemas/Meta');
  }

  // Verify intersection type endpoint
  const intersectionResponse = spec.paths['/record-index-test/intersection'].get.responses['200'];
  const intersectionSchema = intersectionResponse.content['application/json'].schema;

  // Intersection types should generate allOf
  assert.ok(intersectionSchema.allOf);
  assert.strictEqual(intersectionSchema.allOf.length, 2);

  // One part should have additionalProperties (Record<string, string>) 
  const recordPart = intersectionSchema.allOf.find((part: any) =>
    part.additionalProperties && Object.keys(part.properties || {}).length === 0);
  assert.ok(recordPart);
  assert.strictEqual(recordPart.additionalProperties.type, 'string');

  // Other part should have specific properties
  const specificPart = intersectionSchema.allOf.find((part: any) => part.properties && Object.keys(part.properties).length > 0);
  assert.ok(specificPart);
  assert.ok(specificPart.properties['specific-key']);
  assert.ok(specificPart.properties['another-key']);
});
