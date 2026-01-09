import { Route, Middleware, Get } from '../../../src'

export const testMiddleware = (req: any, res: any, next: any) => next()

@Route('/test')
@Middleware(testMiddleware)
export class TestController {
  @Get('/')
  public async get() {
    return 'OK'
  }
}
