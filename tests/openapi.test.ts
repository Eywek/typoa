import fs from 'fs';
import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../src';

test('Should generate openapi definition', async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/controller.*')],
    openapi: {
      filePath: '/tmp/openapi-test-valid.json',
      service: {
        name: 'my-service',
        version: '1.0.0'
      },
      securitySchemes: {
        company: {
          type: 'apiKey',
          name: 'x-company-id',
          in: 'header'
        }
      },
      additionalExportedTypeNames: ['CustomExportedEnum', 'C'],
      outputErrorsToDescription: {
        enabled: true,
        tableColumns: [{
          name: 'Error code',
          value: { type: 'path', value: ['error_code'] }
        }, {
          name: 'Status code',
          value: { type: 'path', value: ['status_code'] }
        }, {
          name: 'Payload',
          value: { type: 'path', value: ['payload'] }
        }, {
          name: 'Description',
          value: { type: 'description' }
        }, {
          name: 'HTTP Code',
          value: { type: 'statusCode' }
        }],
        sortColumn: 'Error code',
        uniqueColumn: 'Error code'
      }
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  });

  // Just verify we can read the generated file and it's valid JSON
  const specContent = await fs.promises.readFile('/tmp/openapi-test-valid.json');
  const spec = JSON.parse(specContent.toString());
  assert.strictEqual(spec.openapi, '3.0.0');
  assert.strictEqual(spec.info.title, 'my-service');
  assert.strictEqual(spec.info.version, '1.0.0');

  // Verify some specific components in the schema
  assert.ok(spec.components.schemas.MyEnum);
  assert.ok(spec.components.schemas.Datasource);
  assert.ok(spec.paths['/my-route'].get);
});

test('Should generate a valid yaml definition', async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [],
    openapi: {
      filePath: '/tmp/openapi.yaml',
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  });
  const specContent = await fs.promises.readFile('/tmp/openapi.yaml');
  assert.strictEqual(specContent.toString(), `openapi: 3.0.0
info:
    title: my-service
    version: 1.0.0
paths: {}
components:
    schemas: {}
`);
});

test('Should generate both json and yaml definitions using array of file paths', async () => {
  const jsonPath = '/tmp/openapi-array-test.json';
  const yamlPath = '/tmp/openapi-array-test.yaml';

  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [],
    openapi: {
      filePath: [jsonPath, yamlPath],
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  });

  // Check JSON file
  const jsonContent = await fs.promises.readFile(jsonPath);
  const jsonData = JSON.parse(jsonContent.toString());
  assert.strictEqual(jsonData.openapi, '3.0.0');
  assert.strictEqual(jsonData.info.title, 'my-service');
  assert.strictEqual(jsonData.info.version, '1.0.0');

  // Check YAML file
  const yamlContent = await fs.promises.readFile(yamlPath);
  assert.ok(yamlContent.toString().includes('openapi: 3.0.0'));
  assert.ok(yamlContent.toString().includes('title: my-service'));
  assert.ok(yamlContent.toString().includes('version: 1.0.0'));
});

test('Should fail with a missing parameter decorator', async () => {
  await assert.rejects(() => generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/invalid-controller.ts')],
    openapi: {
      filePath: '/tmp/openapi.yaml',
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  }), { message: 'Parameter MyController.get.invalidParameter must have a decorator.' });
});

test('Should generate the right definition with response object', async () => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/response-object.ts')],
    openapi: {
      filePath: '/tmp/openapi-test-object-response.json',
      service: {
        name: 'my-service',
        version: '1.0.0'
      },
      additionalExportedTypeNames: [],
    },
    router: {
      filePath: '/tmp/router.ts'
    }
  });
  const specContent = (await fs.promises.readFile('/tmp/openapi-test-object-response.json')).toString();
  const spec = JSON.parse(specContent);

  // Verify we have different response schemas for different endpoints
  assert.ok(spec.components.schemas['SuccessResponse_Array_Entity'], 'Should have SuccessResponse_Array_Entity schema');
  assert.ok(spec.components.schemas['SuccessResponse_Entity'], 'Should have SuccessResponse_Entity schema');
  assert.ok(spec.components.schemas['SuccessResponse_entity_Entity_count_number'], 'Should have SuccessResponse_entity_Entity_count_number schema');

  // Verify the endpoints reference different schemas (not the same type for get and post)
  const listResponse = spec.paths['/my-3nd-controller'].get.responses['200'].content['application/json'].schema;
  const createResponse = spec.paths['/my-3nd-controller'].post.responses['200'].content['application/json'].schema;
  assert.notStrictEqual(listResponse.$ref, createResponse.$ref, 'GET and POST should have different response schemas');
});
