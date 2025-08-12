import fs from 'fs';
import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../../src';


test('Should apply @Produces decorator correctly', async () => {
    const openapiFile = path.resolve(__dirname, 'generated-openapi-controller-produces-test.json');
    const routerFile = path.resolve(__dirname, 'generated-router-openapi-controller-produces.ts');
    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [path.resolve(__dirname, '../fixtures/controllers/controller-produces.ts')],
      openapi: {
        filePath: openapiFile,
        service: {
          name: 'controller-produces-test',
          version: '1.0.0'
        }
      },
      router: {
        filePath: routerFile
      }
    });

    const spec = (await import(openapiFile)).default;

    // Test ProducesController with method-level @Produces decorators

    // JSON endpoint should have application/json content type
    const jsonResponse = spec.paths['/api/produces/json'].get.responses['200'];
    assert.ok(jsonResponse.content['application/json']);
    assert.ok(!jsonResponse.content['text/plain']);

    // Text endpoint should have text/plain content type
    const textResponse = spec.paths['/api/produces/text'].get.responses['200'];
    assert.ok(textResponse.content['text/plain']);
    assert.ok(!textResponse.content['application/json']);

    // XML endpoint should have application/xml content type
    const xmlResponse = spec.paths['/api/produces/xml'].get.responses['200'];
    assert.ok(xmlResponse.content['application/xml']);
    assert.ok(!xmlResponse.content['application/json']);

    // Binary endpoint should have application/octet-stream content type
    const binaryResponse = spec.paths['/api/produces/binary'].get.responses['200'];
    assert.ok(binaryResponse.content['application/octet-stream']);
    assert.ok(!binaryResponse.content['application/json']);

    // CSV endpoint should have text/csv content type
    const csvResponse = spec.paths['/api/produces/csv'].post.responses['200'];
    assert.ok(csvResponse.content['text/csv']);
    assert.ok(!csvResponse.content['application/json']);

    // Default endpoint should have application/json (default behavior)
    const defaultResponse = spec.paths['/api/produces/default'].get.responses['200'];
    assert.ok(defaultResponse.content['application/json']);
    assert.ok(!defaultResponse.content['text/plain']);

    // Test TextController with controller-level @Produces decorator

    // Info endpoint should inherit text/plain from controller
    const infoResponse = spec.paths['/api/text-controller/info'].get.responses['200'];
    assert.ok(infoResponse.content['text/plain']);
    assert.ok(!infoResponse.content['application/json']);

    // Details endpoint should also inherit text/plain from controller
    const detailsResponse = spec.paths['/api/text-controller/details'].get.responses['200'];
    assert.ok(detailsResponse.content['text/plain']);
    assert.ok(!detailsResponse.content['application/json']);

    // JSON override endpoint should override controller-level @Produces
    const overrideResponse = spec.paths['/api/text-controller/json-override'].get.responses['200'];
    assert.ok(overrideResponse.content['application/json']);
    assert.ok(!overrideResponse.content['text/plain']);

    // Read the generated router file
    const routerContent = await fs.promises.readFile(routerFile);
    const routerString = routerContent.toString();

    // Verify that the router uses the correct content types
    assert.strictEqual(routerString.includes("'text/plain'"), true);
    assert.strictEqual(routerString.includes("'application/xml'"), true);
    assert.strictEqual(routerString.includes("'application/octet-stream'"), true);
    assert.strictEqual(routerString.includes("'text/csv'"), true);
    assert.strictEqual(routerString.includes("'application/json'"), true);
  });

  test('Should handle @Produces with request body correctly', async () => {
    const openapiFile = path.resolve(__dirname, 'generated-openapi-controller-produces-body-test.json');
    const routerFile = path.resolve(__dirname, 'generated-router-openapi-controller-produces-body.ts');

    await generate({
      tsconfigFilePath: path.resolve(__dirname, '../fixtures/tsconfig.json'),
      controllers: [path.resolve(__dirname, '../fixtures/controllers/controller-produces.ts')],
      openapi: {
        filePath: openapiFile,
        service: {
          name: 'controller-produces-body-test',
          version: '1.0.0'
        }
      },
      router: {
        filePath: routerFile
      }
    });

    const spec = (await import(openapiFile)).default;

    // Test CSV endpoint with request body
    const csvEndpoint = spec.paths['/api/produces/csv'].post;

    // Should have request body with application/json (default for @Body)
    assert.ok(csvEndpoint.requestBody);
    assert.ok(csvEndpoint.requestBody.content['application/json']);

    // Should have response with text/csv content type
    assert.ok(csvEndpoint.responses['200'].content['text/csv']);
    assert.ok(!csvEndpoint.responses['200'].content['application/json']);
  });
