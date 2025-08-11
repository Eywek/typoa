import { Get, Route } from '../../../src'

@Route()
export class MyController {
  @Get()
  get (
    invalidParameter: string
  ) {
    return invalidParameter
  }
}
