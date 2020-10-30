import { Route, Get, Post, Query, Body, Tags, Patch, Path, Response, Delete, Security } from '../../src'

type Serialize<T extends any> = {
    [key in keyof T]: T[key] extends 'foo' ? 'bare' :
                      T[key]
} & { id: number }

type DeepDeepGeneric<T extends any> = {
  [key in keyof T]: { value: T[key] } & { bar: string }
}
type DeepGeneric<T extends any> = Omit<DeepDeepGeneric<T>, 'bar'> & { fobar: number }

const bar = ['hi', 'hello'] as const

enum MyEnum {
  FOO = 'foo',
  BAR = 'bar'
}

class DatasourceVersion {
  type!: string
}
type Serialized<T extends any> = T & { id: string }
// tslint:disable-next-line: max-classes-per-file
class Datasource {
  /**
   * @pattern ^([A-Z]+)
   */
  name!: string
  /**
   * @description This comment is used to test toag
   */
  versions!: DatasourceVersion[]
  version!: DatasourceVersion | null
}

const routes = { post: 'my-route' } as const

const Errors = {
  NotFound: { error_code: 911, status_code: 404 }
} as const

interface SuccessResponse<T> {
  /**
   * @example 2020-10-30T19:02:06.523Z
   */
  date: Date
  data: T
}

// tslint:disable-next-line: max-classes-per-file
class GettersClass {
  get fooGet () {
    return ''
  }
  get barGetAndSet () {
    return ''
  }
  set barGetAndSet (val: string) {
    return
  }
}

const securities = { company: [] }

// tslint:disable-next-line: max-classes-per-file
@Route()
@Tags('my-tag')
export class MyController {
  @Get('my-route')
  get (): Serialize<{ bar: 'foo', foo: string }> & { h: (typeof bar)[number] } {
    return {} as any
  }
  @Post(routes.post)
  @Tags('my-post-tag')
  post (
    @Query('my-param') param: string
  ) {
    return {} as DeepGeneric<{ foo: string, bar: number }>
  }
  @Post('my-2nd-route')
  @Response<typeof Errors['NotFound']>(Errors.NotFound.status_code)
  postRaw (
    @Body() body: Omit<Datasource, 'version' | 'versions'> & DatasourceVersion
  ): { fooPost: string, barPost: { barFooPost: string } } {
    return {} as any
  }
  @Patch('/{id}')
  @Response<{ error_code: 910 }>(400)
  patch (
    @Path('id') id: string
  ): Promise<{ enum: MyEnum, date?: Date }> {
    return {} as any
  }
  @Delete('')
  @Response(400)
  delete (): SuccessResponse<Datasource> {
    return {} as any
  }
  @Get('/list')
  list (): Partial<Serialized<Datasource>> {
    return {} as any
  }
  ignoredMethod () {
    return 'ignored'
  }
  @Post('/missing')
  missing (): { tuple: [string, ...number[]], bool: boolean, nullable: string | null, optional?: number, enumLiteral: MyEnum.FOO } {
    return {} as any
  }
  @Get('/no-required/{id([A-Z]+)}')
  noRequired (
    @Path('id') id: string
  ): { foo?: string, readonly barReadonly?: number, unknown: unknown, void: void } {
    return {} as any
  }
  @Security({ company: ['my-scope'] })
  @Post('/file')
  file (
    @Body('multipart/form-data') body: {
      /**
       * @format binary
       */
      file: string
    }
  ): {} {
    return {} as any
  }
  @Patch('/getters')
  @Security(securities)
  getters (
    @Body() body: GettersClass
  ): {} {
    return {} as any
  }
}
