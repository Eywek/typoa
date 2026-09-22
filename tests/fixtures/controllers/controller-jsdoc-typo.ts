import { Route, Get } from '../../../src/runtime/decorators'
import { Controller } from '../../../src/runtime/interfaces'

export interface TypoDto {
  /** @minLenght 3 */
  name: string
}

@Route('/typo')
export class JsDocTypoController extends Controller {
  @Get()
  public async get(): Promise<TypoDto> {
    return { name: 'x' }
  }
}
