import { Route, Post, Body, Controller } from '../../../src'

type Id = `id-${number}`

export interface LiteralTypes {
  tpl: Id
  big: bigint
  lit: 'x' | true
  req: Required<{ a?: string }>
}

@Route('literal-types')
export class LiteralTypesController extends Controller {
  @Post()
  post(@Body() body: LiteralTypes): LiteralTypes {
    return body
  }
}
