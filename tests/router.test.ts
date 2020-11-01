import test from 'ava'
import path from 'path'
import { generate } from '../src'
import fs from 'fs'
import express from 'express'
import bodyParser from 'body-parser'
import http from 'http'
import { AddressInfo } from 'net'
import axios, { AxiosInstance } from 'axios'

let api: AxiosInstance
let server: http.Server
test.before(async (t) => {
  // Generate router
  const tmpFile = path.resolve(__dirname, './fixture/router.ts')
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/router-controller.ts')],
    openapi: {
      filePath: '/tmp/openapi.json',
      format: 'json',
      service: {
        name: 'my-service',
        version: '1.0.0'
      }
    },
    router: {
      filePath: tmpFile,
      securityMiddlewarePath: path.resolve(__dirname, './fixture/security-middleware.ts')
    }
  })
  const routerContent = (await fs.promises.readFile(tmpFile)).toString()
  await fs.promises.writeFile(tmpFile, routerContent.replace(/toag/g, '../../src'))

  // Start HTTP server
  const app = express()
  // tslint:disable-next-line: deprecation
  app.use(bodyParser.json({ type: 'application/json' }))
  const { bindToRouter } = require(tmpFile)
  bindToRouter(app)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(err.status || 500)
    return res.json({ message: err.message, ...err })
  })
  server = await new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(() => {
      return resolve(server)
    })
  })
  const port = (server.address() as AddressInfo).port
  api = axios.create({ baseURL: `http://localhost:${port}`, validateStatus: () => true })
})

test.after(async (t) => {
  // End server
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
})

const body = {
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
  record: {},
  objectWithProps: {
    string: 'my-string'
  },
  union: { foo: 'bar' },
  intersection: { foo: 'bar', bar: 'foo' }
}

test('Check endpoints', async (t) => {
  // Throw error
  const res = await api.get('/')
  t.is(res.status, 500)
  t.is(res.data.message, 'My get error')
})

test('Valid body', async (t) => {
  const res = await api.post('/', body, {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 201)
  t.is(res.headers['x-foo'], 'bar')
  delete body.object.ignored
  t.deepEqual(res.data, Object.assign({}, body, { stringWithFormat: body.stringWithFormat.toISOString(), url: '/', formatIsDate: true }))
})

test('Missing header', async (t) => {
  const res = await api.post('/', body, {
    headers: {}
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'x-custom-header': { message: 'Param is required' }
  })
})

test('Invalid body with string', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    string: 1
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.string': { message: 'This property must be a string', value: 1 }
  })
})

test('Invalid body with string pattern', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    stringWithPattern: '1'
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.stringWithPattern': { message: 'This property must match the pattern: /[A-Z]+/', value: '1' }
  })
})

test('Invalid body with format', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    stringWithFormat: 'invalid-date'
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.stringWithFormat': { message: 'This property must be a valid date', value: 'invalid-date' }
  })
})

test('Invalid body with enum', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    stringEnum: 'not in enum'
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.stringEnum': { message: 'This property must be one of foo,bar', value: 'not in enum' }
  })
})

test('Invalid body with nullable', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    nullable: undefined
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.nullable': { message: 'This property is required' }
  })
})

test('Invalid body with number', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    number: 'not a number'
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.number': { message: 'This property must be a number', value: 'not a number' }
  })
})

test('Invalid body with number min', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    numberWithMinAndMax: 3
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.numberWithMinAndMax': { message: 'This property must be >= 4', value: 3 }
  })
})

test('Invalid body with number max', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    numberWithMinAndMax: 11
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.numberWithMinAndMax': { message: 'This property must be <= 10', value: 11 }
  })
})

test('Invalid body with number enum', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    numberEnum: 300
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.numberEnum': { message: 'This property must be one of 4,6', value: 300 }
  })
})

test('Invalid body with boolean', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    boolean: 10
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.boolean': { message: 'This property must be a boolean', value: 10 }
  })
})

for (const val of [true, false, 'true', 'false', 1, 0, '1', '0']) {
  test(`Valid body with boolean = ${JSON.stringify(val)}`, async (t) => {
    const res = await api.post('/', Object.assign({}, body, {
      boolean: val
    }), {
      headers: {
        'x-custom-header': 'my-header'
      }
    })
    t.is(res.status, 201)
  })
}

test('Invalid body with tuple', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    tuple: [{}]
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.tuple.0': { message: 'Found no matching schema for provided value', value: {} }
  })
})

test('Invalid body with array', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    array: {}
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.array': { message: 'This property must be an array', value: {} }
  })
})

test('Invalid body with object', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    object: 'foo'
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.object': { message: 'This property must be an object', value: 'foo' }
  })
})

test('Invalid body with union', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    union: { bar: 'bar' }
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.union': { message: 'Found no matching schema for provided value', value: { bar: 'bar' } }
  })
})

test('Invalid body with intersection', async (t) => {
  const res = await api.post('/', Object.assign({}, body, {
    intersection: { foo: 'bar', bar: 'bar' }
  }), {
    headers: {
      'x-custom-header': 'my-header'
    }
  })
  t.is(res.status, 400)
  t.deepEqual(res.data.fields, {
    'body.intersection.1.bar': { message: 'This property must be one of foo', value: 'bar' }
  })
})

test('Should parse path', async (t) => {
  const res = await api.delete('/20/1')
  t.is(res.status, 200)
  t.deepEqual(res.data, {
    id: 20,
    bool: true
  })
})

test('Should return 404 with path not matching regex', async (t) => {
  const res = await api.delete('/20/true')
  t.is(res.status, 404)
})

test('Should ignore body with not found content-type', async (t) => {
  const res = await api.patch('/', 'hey', {
    headers: {
      'Content-Type': 'text/html'
    }
  })
  t.is(res.status, 200)
  t.deepEqual(res.data, {})
})

test('Should use discriminator function', async (t) => {
  {
    const res = await api.patch('/?one', { type: 'one' })
    t.is(res.status, 200)
    t.deepEqual(res.data, { type: 'one' })
  }
  {
    const res = await api.patch('/?one', { type: 'two' })
    t.is(res.status, 400)
    t.deepEqual(res.data.fields, {
      'body.type': { message: 'This property must be one of one', value: 'two' }
    })
  }
})

test('Should get intercepted', async (t) => {
  const res = await api.get('/intercepted')
  t.is(res.status, 200)
  t.deepEqual(res.data, { scopes: { company: ['read'] } })
})

test('Should return 204', async (t) => {
  const res = await api.get('/no-content')
  t.is(res.status, 204)
  t.is(res.data, '')
})
