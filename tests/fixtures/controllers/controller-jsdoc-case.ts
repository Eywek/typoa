import { Route, Get } from '../../../src/runtime/decorators'
import { Controller } from '../../../src/runtime/interfaces'

export interface CaseDto {
  /** @maxlength 10 */
  code: string
}

@Route('/case')
export class JsDocCaseController extends Controller {
  @Get()
  public async get(): Promise<CaseDto> {
    return { code: 'x' }
  }
}
