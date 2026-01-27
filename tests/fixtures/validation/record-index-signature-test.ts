import { Controller, Route, Get } from '../../../src'

export type Meta = {
  'email-token'?: string
  esp?: string
  [key: string]: string | undefined
}

/**
 * @additionalproperties true
 */
export type Beta = {
  hydrogen: number
}

/**
 * @additionalproperties false
 */
export type Gamma = {
  iron: number
}

export type Delta = {
  oxygen: number
}

export interface Company {
  meta: Meta
}

@Route('/record-index-test')
export class RecordIndexSignatureTestController extends Controller {
  // Test direct usage of the type
  @Get('/direct')
  directType(): Meta {
    return {}
  }

  // Test complex type scenario
  @Get('/partial-pick')
  partialPickType(): Partial<Pick<Company, 'meta'>> {
    return {}
  }

  // Test intersection types
  @Get('/intersection')
  intersectionType(): Record<string, string> & {
    'specific-key'?: string
    'another-key'?: string
  } {
    return {}
  }

  // Test additional properties enabled
  @Get('/additionalPropertiesEnabled')
  additionalPropertiesEnabled(): Beta & {
    carbon: number
  } {
    return {
      carbon: 6,
      hydrogen: 1
    }
  }

  // Test additional properties disabled
  @Get('/additionalPropertiesDisabled')
  additionalPropertiesDisabled(): Gamma {
    return {
      iron: 26
    }
  }

  // Test additional properties default behaviour
  @Get('/additionalPropertiesDefault')
  additionalPropertiesDefault(): Delta {
    return {
      oxygen: 8
    }
  }
}
