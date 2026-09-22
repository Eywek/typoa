import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'

import { validateAndParseResponse } from '../../src/runtime/validator'

const schemas = {
  Item: {
    type: 'object',
    properties: {
      day: { type: 'string', format: 'date', nullable: true },
      at: { type: 'string', format: 'date-time' }
    },
    required: ['day', 'at'],
    additionalProperties: false
  }
} as const

const rules = {
  200: {
    description: '',
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Item' } }
    }
  }
}

const validate = (data: unknown) =>
  validateAndParseResponse(
    data,
    schemas as any,
    rules,
    '200',
    'application/json'
  ) as Record<string, unknown>

describe('Date instances in a response', () => {
  test('format: date serialises a Date to YYYY-MM-DD', () => {
    const data = validate({
      day: new Date('2026-01-01T00:00:00Z'),
      at: new Date(0)
    })

    assert.equal(data.day, '2026-01-01')
  })

  test('format: date-time keeps the Date for JSON serialisation', () => {
    const at = new Date('2026-01-01T10:20:30.000Z')
    const data = validate({ day: '2026-01-01', at })

    assert.equal(data.at, at)
    assert.equal(
      JSON.stringify(data),
      '{"day":"2026-01-01","at":"2026-01-01T10:20:30.000Z"}'
    )
  })

  test('format: date still accepts a string and null', () => {
    assert.equal(
      validate({ day: '2026-01-01', at: new Date(0) }).day,
      '2026-01-01'
    )
    assert.equal(validate({ day: null, at: new Date(0) }).day ?? null, null)
  })

  test('an invalid Date is a 500, not a crash in toISOString()', () => {
    assert.throws(() => validate({ day: new Date('nope'), at: new Date(0) }), {
      message: /Invalid response/
    })
  })
})
