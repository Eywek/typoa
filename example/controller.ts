import {
  Route,
  Get,
  Query,
  Body,
  Tags,
  Patch,
  Path,
  Response,
  Security,
  BodyDiscriminatorFunction,
  Header,
  Controller,
  Produces,
  Post
} from '../src'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const discriminatorFn: BodyDiscriminatorFunction = req => {
  return 'MyModelTwo'
}

class MyModel {
  get id() {
    return 'my-id'
  }
  /**
   * @pattern ^([A-Z]+)
   * @description This comment is used to test typoa
   */
  name!: string
}

class MyModelTwo extends MyModel {
  type!: 'two'
}

/**
 * @additionalproperties true
 */
class MyModelThree extends MyModel {
  type!: 'three'
}

const securities = { company: [] }

@Route()
@Tags('my-tag')
export class MyController extends Controller {
  @Get('{id}')
  @Response<{ errorCode: 1 }>(400)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public get(@Path('id') id: string, @Query('my-query-param') param?: number) {
    this.setStatus(201)
    this.setHeader('x-my-header', 'my-value')
    return 'get'
  }

  @Patch()
  @Security(securities)
  public patch(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Header('x-foo') foo: string,
    @Body('application/json', discriminatorFn) // eslint-disable-next-line @typescript-eslint/no-unused-vars
    body: MyModelTwo | MyModel | MyModelThree
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  ): {} {
    return new MyModelTwo()
  }

  @Get('text')
  @Produces('text/plain')
  public getText(): string {
    return 'This is plain text response'
  }

  @Get('xml')
  @Produces('application/xml')
  public getXml(): string {
    return '<response><message>Hello XML</message></response>'
  }

  @Post('csv')
  @Produces('text/csv')
  public postCsv(
    @Body()
    data: {
      items: Array<{ id: string; name: string }>
    }
  ): string {
    const header = 'id,name\n'
    const rows = data.items.map(item => `${item.id},${item.name}`).join('\n')
    return header + rows
  }
}

// Controller with @Produces at controller level
@Route('text-api')
@Produces('text/plain')
@Tags('text-controller')
export class TextController extends Controller {
  @Get('info')
  public getInfo(): string {
    return 'All endpoints in this controller return plain text by default'
  }

  @Get('json-override')
  @Produces('application/json')
  public getJsonOverride(): { message: string } {
    return {
      message: 'This endpoint overrides the controller-level content type'
    }
  }
}
