// tslint:disable: max-classes-per-file
import { Route, Get, Post, Query, Body, Tags, Patch, Path, Response, Delete, Security, OperationId, Deprecated, Hidden, Header, Controller } from '../../../src'

type Serialize<T extends any> = {
    [key in keyof T]: T[key] extends 'foo' ? 'bare' :
                      T[key]
} & { id: number }

const bar = ['hi', 'hello'] as const

export enum EnumString {
  FOO = 'foo',
  BAR = 'bar'
}

export enum EnumNumber {
  FOO = 4,
  BAR = 6
}

type ValidationTestBody = {
  string: string,
  /**
   * @pattern [A-Z]+
   */
  stringWithPattern: string,
  /**
   * @format date-time
   */
  stringWithFormat: Date,
  stringEnum: EnumString,
  nullable: string | null,
  number: number,
  /**
   * @minimum 4
   * @maximum 10
   */
  numberWithMinAndMax: number,
  numberEnum: EnumNumber,
  boolean: boolean,
  tuple: [string, number],
  array: string[],
  object: {},
  record: Record<string, string>,
  mappedType: { [key: string]: number },
  objectWithProps: {
    string: string,
    number?: number
  },
  union: { foo: 'bar' } | { bar: 'foo' },
  intersection: { foo: 'bar' } & { bar: 'foo' },
  /**
   * @readonly
   */
  readonlyProp: string,
  class: {},
  anyOnly: any,
  unionAdditionalProps: { foo: string } | { foo: string, bar: string }
}

enum MyEnum {
  FOO = 'foo',
  BAR = 'bar'
}

type A = 'a'
type B = 'b'
export type C = A | B

class DatasourceVersion {
  type!: string
}
type Serialized<T extends any> = T & { id: string }
class Datasource {
  /**
   * @pattern ^([A-Z]+)
   * @writeonly
   */
  name!: string
  /**
   * @description This comment is used to test typoa
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

type TestRefReadonlyAndTags = { foo: string }

export enum CustomExportedEnum {
  FOO,
  BAR
}

class GettersClass {
  get fooGet () {
    return ''
  }
  readonly fooReadonly!: string // test again because we use Partial<GettersClass>
  /**
   * @readonly
   * @description my comment
   */
  fooReadonlyComment!: TestRefReadonlyAndTags // test again because we use Partial<GettersClass>
  get barGetAndSet () {
    return ''
  }
  set barGetAndSet (val: string) {
    return
  }
  public ignoredMethod () {
    return 'foo'
  }
}

class Foo {
  public name!: { value: string }
  public toJSON (): { foo: string } {
    return { foo: this.name.value }
  }
}

interface Bar {
  id: string
  data: { content: string }
  toJSON(): { bar: string }
}

const securities = { company: [] }

@Route()
@Tags('my-tag')
export class MyController extends Controller {
  /**
   * @description My OpenAPI description
   */
  @Get('my-route')
  get (): Serialize<{ bar: 'foo', foo: string }> & { h: (typeof bar)[number], true: true, false: false } {
    return {} as any
  }
  @Post(routes.post)
  @Tags('my-post-tag')
  @Response(201)
  post (
    @Header('x-custom-header') header: string,
    @Body() body: any,
    @Query('my-query-param') queryParam?: string,
    @Query('my-default-param') defaultParam: string = 'foo',
    @Query('my-bool') bool: boolean = false
  ) {
    this.setStatus(201)
    this.setHeader('x-foo', 'bar')
    return {
      ...body,
      url: '/my-route?my-query-param&my-default-param=bar', 
      formatIsDate: body.stringWithFormat instanceof Date, 
      queryParam: queryParam || '', 
      defaultParam, 
      bool,
      class: { foo: 'bar' }
    }
  }

  @Post('my-controller/')
  @Response(201)
  postController (
    @Header('x-custom-header') header: string,
    @Body() body: ValidationTestBody,
    @Query('my-query-param') queryParam?: string,
    @Query('my-default-param') defaultParam: string = 'foo',
    @Query('my-bool') bool: boolean = false
  ) {
    this.setStatus(201)
    this.setHeader('x-foo', 'bar')
    return Object.assign({}, body, { 
      url: '/my-controller/?my-bool', 
      formatIsDate: body.stringWithFormat instanceof Date, 
      queryParam: queryParam || '', 
      defaultParam, 
      bool,
      class: { foo: 'bar' }
    })
  }

  @Post('my-2nd-route')
  @Response<typeof Errors['NotFound'] & { foo: 'bar' }>(Errors.NotFound.status_code)
  postRaw (
    @Body() body: Omit<Datasource, 'version' | 'versions'> & DatasourceVersion
  ): { fooPost: string, barPost: { barFooPost: string } } {
    return {} as any
  }
  
  @Patch('/{id}')
  @Response<{ error_code: 910, payload: { number: number } }>(400, 'Description for my response')
  patch (
    @Path('id') id: string
  ): Promise<{ enum: MyEnum, date?: Date, recordString: Record<string, string>, record: Record<'foo', string>, mappedType: { [key: number]: number }, emptyObject: Record<string, never> }> {
    return {} as any
  }

  @Delete('')
  @Response(400)
  delete (): SuccessResponse<Datasource> {
    return {} as any
  }

  @Get('/list', Tags('list-tag'), OperationId('list-operation'))
  list (): Partial<Serialized<Datasource>> {
    return {} as any
  }

  ignoredMethod () {
    return 'ignored'
  }

  @Post('/missing')
  @Response<{ error_code: 910, payload: { number: number } }>(400, 'Description for my response')
  missing (): { tuple: [string, ...number[]], bool: boolean, nullable: string | null, optional?: number, enumLiteral: MyEnum.FOO } {
    return {} as any
  }

  @Get('/no-required/{id([A-Z]+)}')
  noRequired (
    @Path('id') id: string
  ): { foo?: string, readonly barReadonly?: number, unknown: unknown, void: void, ignored: () => string, ignoredSignature (): string } {
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
      /**
       * @readonly
       */
      readonlyComment: string
    }
  ): {} {
    return {} as any
  }
  @Patch('/getters')
  @Security(securities)
  getters (
    @Body() body: Partial<GettersClass>,
    /**
     * @minimum 1
     */
    @Query('limit') limit = 20
  ): {} {
    return {} as any
  }

  @Post('/foo')
  @OperationId('foo-get')
  foo (
    @Body() body: Foo
  ) {
    return
  }

  @Patch('/partial-foo')
  @OperationId('partial-foo')
  partialFoo (
    @Body() body: Partial<Foo>
  ) {
    return
  }

  @Post('/bar')
  @OperationId('bar-get')
  bar (
    @Body() body: Bar
  ) {
    return
  }

  @Patch('/partial-bar')
  @OperationId('partial-bar')
  partialBar (
    @Body() body: Partial<Bar>
  ) {
    return
  }
  
  @Get('/undefined')
  @Deprecated()
  undefined () {
    return undefined
  }
  @Get('/hidden-route')
  @Hidden()
  hidden () {
    return undefined
  }
}

@Route()
@Hidden()
export class MyHiddenController {
  @Get('my-route')
  get (): string {
    return {} as any
  }
}
