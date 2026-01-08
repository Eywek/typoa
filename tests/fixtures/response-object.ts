import { Route, Get, Security, Post, Put } from '../../src'

type SuccessResponse<T extends any> = { data: T }

type Entity = {
  name: string
}
type Entity2 = {
  name: number
}

@Route('/my-3nd-controller/')
@Security({ company: [] })
export class My3ndController {
  @Get('/')
  public async list (): Promise<SuccessResponse<Entity[]>> {
    return { data: [{ name: 'foo' }] }
  }
  @Get('/example')
  public async getIntersection (): Promise<SuccessResponse<Entity & { example: string }>> {
    return { data: { name: 'foo', example: '' } }
  }
  @Get('/union')
  public async getUnion (): Promise<SuccessResponse<Entity | Entity2>> {
    return { data: { name: 'foo' } }
  }
  @Post('/')
  public async create (): Promise<SuccessResponse<Entity>> {
    return { data: { name: 'foo' } }
  }
  @Put('/')
  public async update (): Promise<SuccessResponse<{ entity: Entity, count: number }>> {
    return { data: { entity: { name: 'foo' }, count: 1 } }
  }
}
