import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../../src';

test('Should apply binary format for specified content types', async () => {
  const openapiFile = path.resolve(__dirname, 'generated-openapi-binary-format-test.json');
  const routerFile = path.resolve(__dirname, 'generated-router-binary-format.ts');

  await generate({
    tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
    controllers: [path.resolve(__dirname, '../fixtures/controllers/controller-binary-format.ts')],
    openapi: {
      filePath: openapiFile,
      service: {
        name: 'binary-format-test',
        version: '1.0.0'
      }
    },
    router: {
      filePath: routerFile
    }
  });

  const spec = (await import(openapiFile)).default;

  // Test binary content types should have format: binary
  const binaryEndpoints = [
    { path: '/api/binary/octet-stream', contentType: 'application/octet-stream' },
    { path: '/api/binary/png', contentType: 'image/png' },
    { path: '/api/binary/jpeg', contentType: 'image/jpeg' },
    { path: '/api/binary/pdf', contentType: 'application/pdf' },
    { path: '/api/binary/zip', contentType: 'application/zip' },
    { path: '/api/binary/mp3', contentType: 'audio/mpeg' },
    { path: '/api/binary/mp4', contentType: 'video/mp4' }
  ];

  for (const endpoint of binaryEndpoints) {
    const response = spec.paths[endpoint.path].get.responses['200'];
    const schema = response.content[endpoint.contentType].schema;
    assert.strictEqual(schema.format, 'binary', `${endpoint.path} should have format: binary`);
    assert.strictEqual(schema.type, 'string', `${endpoint.path} should have type: string`);
  }

  // Test request body with binary content types
  const uploadPngResponse = spec.paths['/api/binary/upload-png'].post.requestBody;
  const uploadPdfResponse = spec.paths['/api/binary/upload-pdf'].post.requestBody;

  assert.strictEqual(uploadPngResponse.content['image/png'].schema.format, 'binary');
  assert.strictEqual(uploadPdfResponse.content['application/pdf'].schema.format, 'binary');

  // Test regular JSON endpoint should NOT have binary format
  const jsonResponse = spec.paths['/api/binary/json'].get.responses['200'];
  const jsonSchema = jsonResponse.content['application/json'].schema;

  assert.ok(!jsonSchema.format,);
  assert.ok(jsonSchema.$ref);
  assert.strictEqual(jsonSchema.$ref, '#/components/schemas/User');

  // Verify User schema is an object
  const userSchema = spec.components.schemas.User;
  assert.strictEqual(userSchema.type, 'object');
});
