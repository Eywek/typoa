import { generate } from '../src'
import path from 'path'
import { inspect } from 'util'
import fs from 'fs'

generate({
  tsconfigFilePath: path.resolve(__dirname, './tsconfig.json'),
  controllers: [path.resolve(__dirname, './*.ts')],
  openapi: {
    filePath: '/tmp/openapi.yaml',
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
    }
  },
  router: {
    filePath: './router.ts',
    securityMiddlewarePath: './security.ts'
  }
}).then(() => console.log(inspect(JSON.parse(fs.readFileSync('/tmp/openapi.yaml').toString()), false, 100, true)))
  .catch((err) => console.error('error', err))
