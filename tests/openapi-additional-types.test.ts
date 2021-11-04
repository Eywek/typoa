import test from 'ava'
import path from 'path'
import { generate } from '../src'

const config = {
  tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
  controllers: [],
  openapi: {
    filePath: '/tmp/openapi.json',
    format: 'json' as const,
    service: {
      name: 'my-service',
      version: '1.0.0'
    }
  },
  router: {
    filePath: '/tmp/router.ts'
  }
}

test('Should fail generate with not found additionalExportedTypeNames', async (t) => {
  await t.throwsAsync(() => generate(Object.assign({}, config, {
    openapi: Object.assign({}, config.openapi, {
      additionalExportedTypeNames: ['notfound']
    })
  })), { message: 'Unable to find the additional exported type named \'notfound\'' })
})

test('Should fail generate with not exported additionalExportedTypeNames', async (t) => {
  await t.throwsAsync(() => generate(Object.assign({}, config, {
    openapi: Object.assign({}, config.openapi, {
      additionalExportedTypeNames: ['NotExported']
    })
  })), { message: 'Unable to find the additional exported type named \'NotExported\'' })
})

test('Should fail generate with twice declared additionalExportedTypeNames', async (t) => {
  await t.throwsAsync(() => generate(Object.assign({}, config, {
    openapi: Object.assign({}, config.openapi, {
      additionalExportedTypeNames: ['FooAdditional']
    })
  })), { message: `We found multiple references for the additional exported type named \'FooAdditional\' in ${['additional-types-twice.ts', 'additional-types.ts'].map(file => path.resolve(__dirname, './fixture/', file)).join(', ')}` })
})
