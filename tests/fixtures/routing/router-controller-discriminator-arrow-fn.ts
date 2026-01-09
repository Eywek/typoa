import { Controller, Route, Get, Body } from '../../../src'

@Route()
export class MyController extends Controller {
  @Get()
  public async get(
    @Body('application/json', () => 'string') // eslint-disable-next-line @typescript-eslint/no-unused-vars
    body: string | number
  ) {
    return
  }
}
