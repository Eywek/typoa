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

  @Get('/digits/{id([0-9]+)}')
  public digits(@Path('id') id: string): { id: string } {
    return { id }
  }

  @Get('/extension/{ext(png|jpg)}')
  public extension(@Path('ext') ext: string): { ext: string } {
    return { ext }
  }

  @Get('/patterns/{letters([A-Z]+)}/{digits([0-9]+)}')
  public patterns(
    @Path('letters') letters: string,
    @Path('digits') digits: string
  ): { letters: string; digits: string } {
    return { letters, digits }
  }

  @Get('/fallback/{id([0-9]+)}')
  public patterned(@Path('id') id: string): { handler: string; id: string } {
    return { handler: 'patterned', id }
  }

  @Get('/fallback/{id}')
  public fallback(@Path('id') id: string): { handler: string; id: string } {
    return { handler: 'fallback', id }
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
