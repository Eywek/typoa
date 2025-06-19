import { Route, Get, Post, Produces, Controller, Body, Query } from '../../src'

type User = {
  id: string
  name: string
}

// Controller with method-level @Produces
@Route('/api/produces')
export class ProducesController extends Controller {
  @Get('/json')
  @Produces('application/json')
  public async getJson(): Promise<User> {
    return { id: '1', name: 'John Doe' }
  }

  @Get('/text')
  @Produces('text/plain')
  public async getText(): Promise<string> {
    return 'Hello, World!'
  }

  @Get('/xml')
  @Produces('application/xml')
  public async getXml(): Promise<string> {
    return '<user><id>1</id><name>John Doe</name></user>'
  }

  @Get('/binary')
  @Produces('application/octet-stream')
  public async getBinary(): Promise<Buffer> {
    return Buffer.from('binary data')
  }

  @Post('/csv')
  @Produces('text/csv')
  public async postCsv(
    @Body() data: { users: User[] }
  ): Promise<string> {
    const header = 'id,name\n'
    const rows = data.users.map(user => `${user.id},${user.name}`).join('\n')
    return header + rows
  }

  // Default content type (should be application/json)
  @Get('/default')
  public async getDefault(): Promise<User> {
    return { id: '2', name: 'Jane Doe' }
  }
}

// Controller with controller-level @Produces
@Route('/api/text-controller')
@Produces('text/plain')
export class TextController extends Controller {
  @Get('/info')
  public async getInfo(): Promise<string> {
    return 'This is text controller info'
  }

  @Get('/details')
  public async getDetails(
    @Query('format') format?: string
  ): Promise<string> {
    return `Details in ${format || 'default'} format`
  }

  // This should override the controller-level @Produces
  @Get('/json-override')
  @Produces('application/json')
  public async getJsonOverride(): Promise<User> {
    return { id: '3', name: 'Override User' }
  }
}
