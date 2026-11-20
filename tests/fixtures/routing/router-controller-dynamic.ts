import { Controller, Get, Path, Query, Route } from '../../../src'

@Route('dynamic')
export class DynamicController extends Controller {
  @Get('/static')
  public staticRoute(): { handler: string } {
    return { handler: 'static' }
  }

  @Get('/a/{x}/b/{y}')
  public multiple(
    @Path('x') x: string,
    @Path('y') y: string
  ): { x: string; y: string } {
    return { x, y }
  }

  @Get('/regex/{id([A-Z]+)}')
  public regex(@Path('id') id: string): { id: string } {
    return { id }
  }

  @Get('/encoded/{value}')
  public encoded(@Path('value') value: string): { value: string } {
    return { value }
  }

  @Get('/file/{id}.json')
  public dotted(@Path('id') id: string): { id: string } {
    return { id }
  }

  @Get('/item-{id}')
  public hyphenated(@Path('id') id: string): { id: string } {
    return { id }
  }

  @Get('/query/{id}')
  public query(
    @Path('id') id: string,
    @Query('search') search?: string,
    @Query('page') page?: number
  ): { id: string; search?: string; page?: number } {
    return { id, search, page }
  }

  @Get('/number/{id}')
  public number(@Path('id') id: number): { id: number } {
    return { id }
  }

  @Get('/{id}')
  public single(@Path('id') id: string): { handler: string; id: string } {
    return { handler: 'dynamic', id }
  }
}
