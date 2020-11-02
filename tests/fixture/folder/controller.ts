import { Route, Get } from '../../../src'

@Route()
export class My2ndController {
  @Get()
  public get () {
    return 'foo'
  }
}
