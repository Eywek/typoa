import { Route, Get, Query, Body, Tags, Patch, Path, Response, Security, BodyDiscriminatorFunction, Header, Controller } from '../src'

export const discriminatorFn: BodyDiscriminatorFunction = (req) => {
  return 'MyModelTwo'
}

// tslint:disable-next-line: max-classes-per-file
class MyModel {
  get id () {
    return 'my-id'
  }
  /**
   * @pattern ^([A-Z]+)
   * @description This comment is used to test typoa
   */
  name!: string
}

// tslint:disable-next-line: max-classes-per-file
class MyModelTwo extends MyModel {
  type!: 'two'
}

const securities = { company: [] }

// tslint:disable-next-line: max-classes-per-file
@Route()
@Tags('my-tag')
export class MyController extends Controller {
  @Get('{id}')
  @Response<{ errorCode: 1 }>(400)
  public get (
    @Path('id') id: string,
    @Query('my-query-param') param?: number
  ) {
    this.setStatus(201)
    this.setHeader('x-my-header', 'my-value')
    return 'get'
  }

  @Patch()
  @Security(securities)
  public patch (
    @Header('x-foo') foo: string,
    @Body('application/json', discriminatorFn) body: MyModelTwo | MyModel
  ): {} {
    return new MyModelTwo()
  }
}
