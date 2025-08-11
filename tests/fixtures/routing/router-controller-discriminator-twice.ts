import { Controller, Route, Get, Body } from '../../../src'

@Route()
export class MyController extends Controller {
  @Get()
  public async get (
    @Body('application/json', discriminatorFnTwice) body: string | number
  ) {
    return
  }
}

export const discriminatorFnTwice = () => 'string'
