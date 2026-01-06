import { Controller, Get, Query, Route } from '../../../src'

@Route('/nullable-query-params')
export class NullableQueryParamsController extends Controller {
  @Get('/nullable')
  public nullableQuery(
    @Query('param') param: boolean | null
  ): void {
    return
  }

  @Get('/optional')
  public optionalQuery(
    @Query('param') param?: boolean
  ): void {
    return
  }

  @Get('/undefined')
  public undefinedQuery(
    @Query('param') param: boolean | undefined
  ): void {
    return
  }

  @Get('/nullable-and-undefined')
  public nullableAndUndefinedQuery(
    @Query('param') param: boolean | null | undefined
  ): void {
    return
  }
}
