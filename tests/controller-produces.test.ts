import test from 'ava'
import fs from 'fs'
import path from 'path'
import { generate } from '../src'

test('Should apply @Produces decorator correctly', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/controller-produces.ts')],
    openapi: {
      filePath: '/tmp/controller-produces-test.json',
      format: 'json',
      service: {
        name: 'controller-produces-test',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/controller-produces-router.ts'
    }
  })

  // Read the generated OpenAPI spec
  const specContent = await fs.promises.readFile('/tmp/controller-produces-test.json')
  const spec = JSON.parse(specContent.toString())

  // Test ProducesController with method-level @Produces decorators

  // JSON endpoint should have application/json content type
  const jsonResponse = spec.paths['/api/produces/json'].get.responses['200']
  t.truthy(jsonResponse.content['application/json'])
  t.falsy(jsonResponse.content['text/plain'])

  // Text endpoint should have text/plain content type
  const textResponse = spec.paths['/api/produces/text'].get.responses['200']
  t.truthy(textResponse.content['text/plain'])
  t.falsy(textResponse.content['application/json'])

  // XML endpoint should have application/xml content type
  const xmlResponse = spec.paths['/api/produces/xml'].get.responses['200']
  t.truthy(xmlResponse.content['application/xml'])
  t.falsy(xmlResponse.content['application/json'])

  // Binary endpoint should have application/octet-stream content type
  const binaryResponse = spec.paths['/api/produces/binary'].get.responses['200']
  t.truthy(binaryResponse.content['application/octet-stream'])
  t.falsy(binaryResponse.content['application/json'])

  // CSV endpoint should have text/csv content type
  const csvResponse = spec.paths['/api/produces/csv'].post.responses['200']
  t.truthy(csvResponse.content['text/csv'])
  t.falsy(csvResponse.content['application/json'])

  // Default endpoint should have application/json (default behavior)
  const defaultResponse = spec.paths['/api/produces/default'].get.responses['200']
  t.truthy(defaultResponse.content['application/json'])
  t.falsy(defaultResponse.content['text/plain'])

  // Test TextController with controller-level @Produces decorator

  // Info endpoint should inherit text/plain from controller
  const infoResponse = spec.paths['/api/text-controller/info'].get.responses['200']
  t.truthy(infoResponse.content['text/plain'])
  t.falsy(infoResponse.content['application/json'])

  // Details endpoint should also inherit text/plain from controller
  const detailsResponse = spec.paths['/api/text-controller/details'].get.responses['200']
  t.truthy(detailsResponse.content['text/plain'])
  t.falsy(detailsResponse.content['application/json'])

  // JSON override endpoint should override controller-level @Produces
  const overrideResponse = spec.paths['/api/text-controller/json-override'].get.responses['200']
  t.truthy(overrideResponse.content['application/json'])
  t.falsy(overrideResponse.content['text/plain'])

  // Read the generated router file
  const routerContent = await fs.promises.readFile('/tmp/controller-produces-router.ts')
  const routerString = routerContent.toString()

  // Verify that the router uses the correct content types
  t.true(routerString.includes("'text/plain'"))
  t.true(routerString.includes("'application/xml'"))
  t.true(routerString.includes("'application/octet-stream'"))
  t.true(routerString.includes("'text/csv'"))
  t.true(routerString.includes("'application/json'"))
})

test('Should handle @Produces with request body correctly', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/controller-produces.ts')],
    openapi: {
      filePath: '/tmp/controller-produces-body-test.json',
      format: 'json',
      service: {
        name: 'controller-produces-body-test',
        version: '1.0.0'
      }
    },
    router: {
      filePath: '/tmp/controller-produces-body-router.ts'
    }
  })

  // Read the generated OpenAPI spec
  const specContent = await fs.promises.readFile('/tmp/controller-produces-body-test.json')
  const spec = JSON.parse(specContent.toString())

  // Test CSV endpoint with request body
  const csvEndpoint = spec.paths['/api/produces/csv'].post

  // Should have request body with application/json (default for @Body)
  t.truthy(csvEndpoint.requestBody)
  t.truthy(csvEndpoint.requestBody.content['application/json'])

  // Should have response with text/csv content type
  t.truthy(csvEndpoint.responses['200'].content['text/csv'])
  t.falsy(csvEndpoint.responses['200'].content['application/json'])
})
