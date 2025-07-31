import path from 'path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { generate } from '../src';

const config = {
  tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
  controllers: [],
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

test('Should fail generate with not found additionalExportedTypeNames', async () => {
  await assert.rejects(() => generate(Object.assign({}, config, {
    openapi: Object.assign({}, config.openapi, {
      additionalExportedTypeNames: ['notfound']
    })
  })), { message: 'Unable to find the additional exported type named \'notfound\'' });
});

test('Should fail generate with not exported additionalExportedTypeNames', async () => {
  await assert.rejects(() => generate(Object.assign({}, config, {
    openapi: Object.assign({}, config.openapi, {
      additionalExportedTypeNames: ['NotExported']
    })
  })), { message: 'Unable to find the additional exported type named \'NotExported\'' });
});

test('Should fail generate with twice declared additionalExportedTypeNames', async () => {
  await assert.rejects(() => generate(Object.assign({}, config, {
    openapi: Object.assign({}, config.openapi, {
      additionalExportedTypeNames: ['FooAdditional']
    })
  })), { message: `We found multiple references for the additional exported type named \'FooAdditional\' in ${['additional-types-twice.ts', 'additional-types.ts'].map(file => path.resolve(__dirname, './fixture/', file)).join(', ')}` });
});
