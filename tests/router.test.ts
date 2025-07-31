import path from 'path';
import fs from 'fs';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';

import { generate } from '../src';

let baseURL: string;
let server: http.Server;
let endpoint: string;

before(async () => {
  // Generate router
  const tmpFile = path.resolve(__dirname, './fixture/router.ts');
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [
      path.resolve(__dirname, './fixture/router-controller.ts'),
      path.resolve(__dirname, './fixture/folder/*.ts')
    ],
    openapi: {
      filePath: '/tmp/openapi.json',
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: tmpFile,
      securityMiddlewarePath: path.resolve(__dirname, './fixture/security-middleware.ts'),
      validateResponse: true
    }
  });

  const routerContent = (await fs.promises.readFile(tmpFile)).toString();
  await fs.promises.writeFile(tmpFile, routerContent.replace(/typoa/g, '../../src'));

  // Start HTTP server
  const app = express();
  app.use(express.json());

  const { bindToRouter } = require(tmpFile);
  bindToRouter(app);

  // Error handler for proper test response formatting
  function errorHandler(err: any, req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (err.name === 'ValidateError') {
      if (err.fields && Object.keys(err.fields).length > 0) {
        res.status(err.status || 400).json({ fields: err.fields });
      } else {
        res.status(err.status || 400).json({ message: err.message });
      }
    } else {
      res.status(err.status || 500).json({ message: err.message });
    }
  }
  app.use(errorHandler);

  server = await new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(() => resolve(server));
  });

  const port = (server.address() as AddressInfo).port;
  endpoint = `http://localhost:${port}`;
  baseURL = `${endpoint}/my-controller`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => err ?
      reject(err)
      : resolve())
  );
});

// Test data used across multiple tests
const validBody = {
  string: 'my-string',
  stringWithPattern: 'FOO',
  stringWithFormat: new Date(),
  stringEnum: 'foo',
  nullable: null,
  number: 1,
  numberWithMinAndMax: 5,
  numberEnum: 4,
  boolean: false,
  tuple: ['foo', 1],
  array: ['bar'],
  object: { ignored: 1 },
  record: { foo: '1' },
  mappedType: { foo: 1 },
  objectWithProps: { string: 'my-string' },
  union: { foo: 'bar' },
  intersection: { foo: 'bar', bar: 'foo' },
  readonlyProp: 'my prop',
  class: {},
  unionAdditionalProps: { foo: '1', bar: '2' }
};

// Helper function for POST requests with JSON body
const postJSON = (url: string, body: any, headers: Record<string, string> = {}) => {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-custom-header': 'my-header',
      ...headers
    },
    body: JSON.stringify(body)
  });
};

test('Should throw error on GET /', async () => {
  const res = await fetch(`${baseURL}/`);
  const data = await res.json() as any;
  assert.strictEqual(res.status, 500);
  assert.strictEqual(data.message, 'My get error');
});

test('Should accept valid request body', async () => {
  const res = await postJSON(`${baseURL}/?my-query-param&my-default-param=bar`, validBody);
  const data = await res.json() as any;

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.headers.get('x-foo'), 'bar');

  delete (validBody as any).object.ignored;
  delete (validBody as any).readonlyProp;

  assert.deepStrictEqual(data, Object.assign({}, validBody, {
    stringWithFormat: validBody.stringWithFormat.toISOString(),
    url: '/my-controller/?my-query-param&my-default-param=bar',
    formatIsDate: true,
    queryParam: '',
    class: { foo: 'bar' },
    defaultParam: 'bar',
    bool: false
  }));
});

test('Should parse bool param without value as true', async () => {
  const res = await postJSON(`${baseURL}/?my-bool`, validBody);
  const data = await res.json() as any;
  assert.strictEqual(res.status, 201);
  assert.strictEqual(data.bool, true);
});

describe('Request validation', () => {
  test('Should reject missing required header', async () => {
    const res = await fetch(`${baseURL}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody)
    });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'x-custom-header': { message: 'Param is required' }
    });
  });

  test('Should reject invalid string type', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, string: 1 });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.string': { message: 'This property must be a string', value: 1 }
    });
  });

  test('Should reject string pattern mismatch', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, stringWithPattern: '1' });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.stringWithPattern': { message: 'This property must match the pattern: /[A-Z]+/', value: '1' }
    });
  });

  test('Should reject invalid date format', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, stringWithFormat: 'invalid-date' });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.stringWithFormat': { message: 'This property must be a valid date', value: 'invalid-date' }
    });
  });

  test('Should reject invalid enum value', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, stringEnum: 'not in enum' });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.stringEnum': { message: 'This property must be one of foo,bar', value: 'not in enum' }
    });
  });

  test('Should reject undefined nullable field', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, nullable: undefined });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.nullable': { message: 'This property is required' }
    });
  });

  test('Should reject invalid number type', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, number: 'not a number' });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.number': { message: 'This property must be a number', value: 'not a number' }
    });
  });

  test('Should reject number below minimum', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, numberWithMinAndMax: 3 });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.numberWithMinAndMax': { message: 'This property must be >= 4', value: 3 }
    });
  });

  test('Should reject number above maximum', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, numberWithMinAndMax: 11 });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.numberWithMinAndMax': { message: 'This property must be <= 10', value: 11 }
    });
  });

  test('Should reject invalid number enum', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, numberEnum: 300 });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.numberEnum': { message: 'This property must be one of 4,6', value: 300 }
    });
  });

  test('Should reject invalid boolean type', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, boolean: 10 });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.boolean': { message: 'This property must be a boolean', value: 10 }
    });
  });

  for (const val of [true, false, 'true', 'false', 1, 0, '1', '0']) {
    test(`Should accept boolean value: ${JSON.stringify(val)}`, async () => {
      const res = await postJSON(`${baseURL}/`, { ...validBody, boolean: val });
      assert.strictEqual(res.status, 201);
    });
  }

  test('Should reject invalid tuple', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, tuple: [{}] });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.tuple.0': { message: 'Found no matching schema for provided value', value: {} }
    });
  });

  test('Should reject non-array for array field', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, array: {} });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.array': { message: 'This property must be an array', value: {} }
    });
  });

  test('Should reject invalid additional properties', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, record: { foo: 1 } });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.record.foo': { message: 'This property must be a string', value: 1 }
    });
  });

  test('Should reject non-object for object field', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, object: 'foo' });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.object': { message: 'This property must be an object', value: 'foo' }
    });
  });

  test('Should reject array when object expected', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, object: [] });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.object': { message: 'This property must be an object', value: [] }
    });
  });

  test('Should reject invalid union type', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, union: { bar: 'bar' } });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.union': { message: 'Found no matching schema for provided value', value: { bar: 'bar' } }
    });
  });

  test('Should reject invalid intersection type', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, intersection: { foo: 'bar', bar: 'bar' } });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.intersection.1.bar': { message: 'This property must be one of foo', value: 'bar' }
    });
  });

  test('Should reject null for non-nullable field', async () => {
    const res = await postJSON(`${baseURL}/`, { ...validBody, intersection: null });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.intersection': { message: 'This property is not nullable' }
    });
  });

  for (const type of ['any', 'unknown']) {
    test(`Should accept various values for ${type} type`, async () => {
      const testValues = [3, [], {}, '3', { foo: 1 }];

      for (const value of testValues) {
        const res = await postJSON(`${baseURL}/`, { ...validBody, [type]: value });
        assert.strictEqual(res.status, 201, `Failed for ${type} with value: ${JSON.stringify(value)}`);
      }
    });
  }
});

describe('Routing and path handling', () => {
  test('Should parse path parameters correctly', async () => {
    const res = await fetch(`${baseURL}/20/1`, { method: 'DELETE' });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(data, {
      id: 20,
      bool: true,
      limit: 20
    });
  });

  test('Should accept string as string array for query params', async () => {
    const res = await fetch(`${baseURL}/20/1?filter=a`, { method: 'DELETE' });
    assert.strictEqual(res.status, 200);
  });

  test('Should return 404 for invalid path regex', async () => {
    const res = await fetch(`${baseURL}/20/true`, { method: 'DELETE' });
    assert.strictEqual(res.status, 404);
  });
});

describe('Content type and middleware', () => {
  test('Should reject unsupported content type', async () => {
    const res = await fetch(`${baseURL}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/html' },
      body: 'hey'
    });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.message, 'This content-type is not allowed');
  });

  test('Should use discriminator function correctly', async () => {
    const res = await fetch(`${baseURL}/?one`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'one' })
    });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(data, { type: 'one' });
  });

  test('Should reject invalid discriminator', async () => {
    const res = await fetch(`${baseURL}/?one`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'two' })
    });
    const data = await res.json() as any;

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(data.fields, {
      'body.type': { message: 'This property must be one of one', value: 'two' }
    });
  });

  test('Should handle security interceptor', async () => {
    const res = await fetch(`${baseURL}/intercepted`);
    const data = await res.json() as any;

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(data, { scopes: { company: ['read'] } });
  });

  test('Should handle controller-level security', async () => {
    const res = await fetch(`${endpoint}/my-2nd-controller`);
    const data = await res.json() as any;

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(data, { scopes: { company: [] } });
  });

  test('Should return 204 for no-content endpoint', async () => {
    const res = await fetch(`${baseURL}/no-content`);
    const text = await res.text();

    assert.strictEqual(res.status, 204);
    assert.strictEqual(text, '');
  });

  test('Should not validate body for file uploads', async () => {
    const res = await fetch(`${baseURL}/file`, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
      body: ''
    });
    const text = await res.text();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, '"ok"');
  });

  test('Should remove extra properties from response', async () => {
    const res = await fetch(`${baseURL}/getExtra`);
    const data = await res.json() as any;

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(data, { foo: 1 });
  });
});
