import {
  Route,
  Post,
  Query,
  Body,
  Tags,
  Response,
  Header,
  Controller
} from '../../../src'

export enum EnumString {
  FOO = 'foo',
  BAR = 'bar'
}

export enum EnumNumber {
  FOO = 4,
  BAR = 6
}

/**
 * @additionalproperties true
 */
type ValidationTestBody = {
  string: string
  /**
   * @pattern [A-Z]+
   */
  stringWithPattern: string
  /**
   * @format date-time
   */
  stringWithFormat: Date
  stringEnum: EnumString
  nullable: string | null
  number: number
  /**
   * @minimum 4
   * @maximum 10
   */
  numberWithMinAndMax: number
  numberEnum: EnumNumber
  boolean: boolean
  tuple: [string, number]
  array: string[]
  record: Record<string, string>
  mappedType: { [key: string]: number }
  objectWithProps: {
    string: string
    number?: number
  }
  union: { foo: 'bar' } | { bar: 'foo' }
  intersection: { foo: 'bar' } & { bar: 'foo' }
  /**
   * @readonly
   */
  readonlyProp: string
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  class: {}
  anyOnly: any
  unionAdditionalProps: { foo: string } | { foo: string; bar: string }
}

@Route()
@Tags('my-tag')
export class MyController extends Controller {
  @Post('my-controller/')
  @Response(201)
  postController(
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
}
