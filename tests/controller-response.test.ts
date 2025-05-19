import test from 'ava'
import fs from 'fs'
import path from 'path'
import { generate } from '../src'

test('Should apply controller-level responses correctly', async (t) => {
  await generate({
    tsconfigFilePath: path.resolve(__dirname, './fixture/tsconfig.json'),
    controllers: [path.resolve(__dirname, './fixture/controller-response.ts')],
    openapi: {
      filePath: '/tmp/controller-response-test.json',
      format: 'json',
      service: {
        name: 'controller-response-test',
        version: '1.0.0'
      },
      securitySchemes: {
        admin: {
          type: 'apiKey',
          name: 'x-admin-token',
          in: 'header'
        }
      }
    },
    router: {
      filePath: '/tmp/controller-response-router.ts'
    }
  })

  // Read the generated OpenAPI spec
  const specContent = await fs.promises.readFile('/tmp/controller-response-test.json')
  const spec = JSON.parse(specContent.toString())

  // Test UserController with controller-level responses
  // All methods should have 400, 403, 404 responses from controller
  t.truthy(spec.paths['/api/users'].get.responses['400'], 'List users should have 400 response from controller')
  t.truthy(spec.paths['/api/users'].get.responses['403'], 'List users should have 403 response from controller')
  t.truthy(spec.paths['/api/users'].get.responses['404'], 'List users should have 404 response from controller')

  t.truthy(spec.paths['/api/users/{id}'].get.responses['400'], 'Get user should have 400 response from controller')
  t.truthy(spec.paths['/api/users/{id}'].get.responses['403'], 'Get user should have 403 response from controller')
  t.truthy(spec.paths['/api/users/{id}'].get.responses['404'], 'Get user should have 404 response from controller')

  // Post method overrides 404 response
  t.truthy(spec.paths['/api/users'].post.responses['404'], 'Create user should have 404 response')
  t.is(
    spec.paths['/api/users'].post.responses['404'].description,
    'User not found - specific to this method',
    'Create user should override 404 description from controller'
  )

  // Put method has additional 409 response
  t.truthy(spec.paths['/api/users/{id}'].put.responses['409'], 'Update user should have 409 response')
  t.is(
    spec.paths['/api/users/{id}'].put.responses['409'].description,
    'User already exists',
    'Update user should have specific 409 description'
  )

  // Test ProductController without controller-level responses
  // List products has its own 404 response
  t.truthy(spec.paths['/api/products'].get.responses['404'], 'List products should have 404 response')
  t.is(
    spec.paths['/api/products'].get.responses['404'].description,
    'Product not found',
    'List products should have specific 404 description'
  )

  // Create product has no specific error responses
  t.falsy(spec.paths['/api/products'].post.responses['404'], 'Create product should not have 404 response')
  t.falsy(spec.paths['/api/products'].post.responses['400'], 'Create product should not have 400 response')

  // Test AdminController with security and responses
  t.deepEqual(
    spec.paths['/api/admin'].get.security,
    [{ admin: ['read'] }],
    'Get admin info should have admin read security'
  )
  t.truthy(spec.paths['/api/admin'].get.responses['401'], 'Get admin info should have 401 response')
  t.truthy(spec.paths['/api/admin'].get.responses['403'], 'Get admin info should have 403 response')

  // Create admin resource has additional 429 response and write security
  // Method level security is added to controller level security
  t.deepEqual(
    spec.paths['/api/admin'].post.security,
    [{ admin: ['read'] }, { admin: ['write'] }],
    'Create admin resource should have both controller and method level security'
  )
  t.truthy(spec.paths['/api/admin'].post.responses['429'], 'Create admin resource should have 429 response')
  t.is(
    spec.paths['/api/admin'].post.responses['429'].description,
    'Too many requests',
    'Create admin resource should have specific 429 description'
  )
})
