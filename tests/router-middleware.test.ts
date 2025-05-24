import test from 'ava'
import path from 'path'
import { generate } from '../src'

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
}

test('Should generate router with method middleware', async (t) => {
  await t.notThrowsAsync(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, './fixture/router-controller-middleware-method.ts')]
  })))
})

test('Should generate router with controller middleware', async (t) => {
  await t.notThrowsAsync(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, './fixture/router-controller-middleware-controller.ts')]
  })))
})

test('Should generate router with both controller and method middleware', async (t) => {
  await t.notThrowsAsync(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, './fixture/router-controller-middleware-both.ts')]
  })))
})

test('Should generate router with factory middleware', async (t) => {
  await t.notThrowsAsync(() => generate(Object.assign({}, config, {
    controllers: [path.resolve(__dirname, './fixture/router-controller-middleware-factory.ts')]
  })))
})
