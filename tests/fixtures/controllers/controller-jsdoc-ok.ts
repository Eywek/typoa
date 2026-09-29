import { Route, Get } from '../../../src/runtime/decorators'
import { Controller } from '../../../src/runtime/interfaces'

export interface OkDto {
  /**
   * Standard JSDoc tags that typoa does not use must stay allowed.
   * @deprecated use `code` instead
   * @see https://example.com
   * @minLength 1
   */
  name: string
}

@Route('/ok')
export class JsDocOkController extends Controller {
  @Get()
  public async get(): Promise<OkDto> {
    return { name: 'x' }
  }
}
