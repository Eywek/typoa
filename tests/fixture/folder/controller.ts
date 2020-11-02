import { Route, Get, Security } from '../../../src'

@Route('/my-2nd-controller/')
@Security({ company: [] })
export class My2ndController {
  @Get('/')
  public get () {
    return 'foo'
  }
}
