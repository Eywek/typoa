import { Controller, Route, Get } from '../../../src'

export type Meta = {
    'email-token'?: string
    'esp'?: string
    [key: string]: string | undefined
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
}
