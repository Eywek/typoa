import { Route, Middleware, Get } from "../../../src"

export const controllerMiddleware = (req: any, res: any, next: any) => next()
export const methodMiddleware = (req: any, res: any, next: any) => next()

@Route('/test')
@Middleware(controllerMiddleware)
export class TestController {
  @Get('/')
  @Middleware(methodMiddleware)
  public async get() {
    return 'OK'
  }
}
