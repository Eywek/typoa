import { generate } from '../src'
import path from 'path'

generate({
  tsconfigFilePath: path.resolve(__dirname, './tsconfig.json'),
  controllers: [path.resolve(__dirname, './*.ts')],
  openapi: {
    filePath: '../tmp/openapi.yaml',
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
}).catch(err => console.error('error', err))
