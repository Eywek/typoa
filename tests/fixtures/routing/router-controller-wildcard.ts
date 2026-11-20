import { Controller, Route, Get, Path } from '../../../src'

@Route()
export class MyController extends Controller {
  @Get('/files/{path(*)}')
  public async get(@Path('path') path: string): Promise<{ path: string }> {
    return { path }
  }
}
