// Core test controller - extends the main controller with error-throwing behavior
import {
  Route,
  Get,
  Post,
  Query,
  Body,
  Tags,
  Response,
  Header,
  Controller
} from '../../../src'

type Serialize<T> = {
  [key in keyof T]: T[key] extends 'foo' ? 'bare' : T[key]
} & { id: number }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const bar = ['hi', 'hello'] as const

@Route()
@Tags('my-tag-core')
export class MyCoreController extends Controller {
  /**
   * @description My OpenAPI description for core tests
   */
  @Get('my-route')
  get(): Serialize<{ bar: 'foo'; foo: string }> & {
    h: (typeof bar)[number]
    true: true
    false: false
  } {
    throw new Error('My get error')
  }

  @Post('my-route')
  @Tags('my-post-tag')
  @Response(201)
  post(
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
  postController(
    @Header('x-custom-header') header: string,
    @Body() body: any,
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
