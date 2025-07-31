import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../src';

const config = {
  tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
  openapi: {
    filePath: '/tmp/openapi.json',
    service: {
      name: 'my-service',
      version: '1.0.0'
    }
  },
  router: {
    filePath: '/tmp/router.ts'
  }
};

test('Should fail generate with not found discriminator function', async () => {
  await assert.rejects(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, './fixture/router-controller-discriminator-not-found.ts')]
  })), { message: 'The 2nd argument of @Body() decorator must be the name of a function defined in source files' });
});

test('Should fail generate with discriminator function declared twice', async () => {
  await assert.rejects(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, './fixture/router-controller-discriminator-twice.ts')]
  })), { message: 'The 2nd argument of @Body() decorator must be the name of a function defined only once' });
});

test('Should fail generate with discriminator function not exported', async () => {
  await assert.rejects(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, './fixture/router-controller-discriminator-not-exported.ts')]
  })), { message: 'The 2nd argument of @Body() decorator must be the name of an exported function' });
});

test('Should fail generate with discriminator function invalid', async () => {
  await assert.rejects(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, './fixture/router-controller-discriminator-arrow-fn.ts')]
  })), { message: 'The 2nd argument of @Body() decorator must be the name of a function' });
});
