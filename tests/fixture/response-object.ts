import { Route, Get, Security, Post } from '../../src'

type SuccessResponse<T extends any> = { data: T }

type Entity = {
  name: string
}

@Route('/my-3nd-controller/')
@Security({ company: [] })
export class My3ndController {
  @Get('/')
  public async list (): Promise<SuccessResponse<Entity[]>> {
    return { data: [{ name: 'foo' }] }
  }
  @Post('/')
  public async create (): Promise<SuccessResponse<Entity>> {
    return { data: { name: 'foo' } }
  }
}
