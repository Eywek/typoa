import { Controller, Route, Get, Body } from '../../../src'

export const discriminatorFnTwice = () => 'string'

@Route()
export class MyController extends Controller {
  @Get()
  public async get(
    @Body('application/json', discriminatorFnTwice) // eslint-disable-next-line @typescript-eslint/no-unused-vars
    body: string | number
  ) {
    return
  }
}
