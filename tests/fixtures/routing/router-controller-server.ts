import { Controller, Get, Path, Route } from '../../../src'

@Route()
export class ServerController extends Controller {
  @Get('/no-required/{id([A-Z]+)}')
  public uppercase(@Path('id') id: string): { id: string } {
    return { id }
  }

  @Get('/ascii/{id([a-z]+)}')
  public ascii(@Path('id') id: string): { id: string } {
    return { id }
  }

  @Get('/slug/{id([a-z0-9-]+)}')
  public slug(@Path('id') id: string): { id: string } {
    return { id }
  }

  @Get(
    '/uuid/{id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})}'
  )
  public uuid(@Path('id') id: string): { id: string } {
    return { id }
  }
}
