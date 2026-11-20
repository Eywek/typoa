import { Controller, Route, Get } from '../../../src'

@Route()
export class MyController extends Controller {
  @Get('/files/{path(*)}')
  public async get() {
    return
  }
}
