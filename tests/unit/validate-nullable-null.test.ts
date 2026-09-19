import express from 'express'
import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'

import {
  validateAndParse,
  validateAndParseResponse
} from '../../src/runtime/validator'

// prettier-ignore
const schemas = {
  Patch: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      manager: { type: 'string', nullable: true },
      archivedAt: { type: 'string', nullable: true, default: 'never' }
    },
    required: ['name', 'manager', 'archivedAt'],
    additionalProperties: false
  }
} as const

const bodyRules = {
  params: [{ name: 'body', in: 'body' }],
  body: {
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Patch' } }
    }
  },
  bodyDiscriminatorFn: undefined
}

describe('null on a nullable schema', () => {
  test('body: null stays null when the schema has no default', async () => {
    const [body] = await validateAndParse(
      {
        body: { name: 'x', manager: null, archivedAt: null },
        headers: { 'content-type': 'application/json' },
        readableEnded: true
      } as unknown as express.Request,
      schemas as any,
      bodyRules as any
    )

    assert.equal(body.manager, null)
    assert.ok('manager' in body)
    // JSON round-trip is what an Express handler sees; `undefined` would vanish here.
    assert.deepEqual(JSON.parse(JSON.stringify(body)), {
      name: 'x',
      manager: null,
      archivedAt: 'never'
    })
  })

  test('response: nullable fields stay in the payload as null', () => {
    const data = validateAndParseResponse(
      { name: 'x', manager: null, archivedAt: null },
      schemas as any,
      {
        200: {
          description: '',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Patch' }
            }
          }
        }
      },
      '200',
      'application/json'
    ) as Record<string, unknown>

    assert.equal(data.manager, null)
    assert.equal(
      JSON.stringify(data),
      '{"name":"x","manager":null,"archivedAt":"never"}'
    )
  })
})
