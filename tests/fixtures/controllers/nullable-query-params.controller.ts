import { Controller, Get, Query, Route } from '../../../src'

@Route('/nullable-query-params')
export class NullableQueryParamsController extends Controller {
  @Get('/nullable')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public nullableQuery(@Query('param') param: boolean | null): void {
    return
  }

  @Get('/optional')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public optionalQuery(@Query('param') param?: boolean): void {
    return
  }

  @Get('/undefined')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public undefinedQuery(@Query('param') param: boolean | undefined): void {
    return
  }

  @Get('/nullable-and-undefined')
  public nullableAndUndefinedQuery(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Query('param') param: boolean | null | undefined
  ): void {
    return
  }
}
