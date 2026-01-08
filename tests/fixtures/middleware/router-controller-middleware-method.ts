import { Route, Get, Middleware } from '../../../src'

export const testMiddleware = (req: any, res: any, next: any) => next()

@Route('/test')
export class TestController {
  @Get('/')
  @Middleware(testMiddleware)
  public async get () {
    return 'OK'
  }
}
