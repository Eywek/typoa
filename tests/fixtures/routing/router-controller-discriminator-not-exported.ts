import { Controller, Route, Get, Body } from '../../../src'

const discriminatorFnNotExported = () => 'string'

@Route()
export class MyController extends Controller {
  @Get()
  public async get(
    @Body('application/json', discriminatorFnNotExported) // eslint-disable-next-line @typescript-eslint/no-unused-vars
    body: string | number
  ) {
    return
  }
}
