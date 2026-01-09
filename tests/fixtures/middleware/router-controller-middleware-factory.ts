import { Route, Get, Middleware } from '../../../src'

export const middlewareFactory = () => (req: any, res: any, next: any) => next()

@Route('/test-factory')
export class TestFactoryController {
  @Get('/')
  @Middleware(middlewareFactory())
  public async get() {
    return 'OK'
  }
}
