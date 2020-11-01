import { Controller, Route, Get, Body } from '../../src'

@Route()
export class MyController extends Controller {
  @Get()
  public async get (
    @Body('application/json', discriminatorFnNotFound) body: string | number
  ) {
    return
  }
}
