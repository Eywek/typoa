import { Controller, Route, Get, Body } from '../../../src'

@Route()
export class MyController extends Controller {
  @Get()
  public async get(
    // @ts-expect-error legacy
    @Body('application/json', discriminatorFnNotFound) // eslint-disable-next-line @typescript-eslint/no-unused-vars
    body: string | number
  ) {
    return
  }
}
