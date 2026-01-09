import {
  Route,
  Get,
  Post,
  Produces,
  Body
} from '../../../src/runtime/decorators'
import { Controller } from '../../../src/runtime/interfaces'

interface User {
  id: string
  name: string
}

@Route('/api/binary')
export class BinaryFormatController extends Controller {
  @Get('/octet-stream')
  @Produces('application/octet-stream')
  public async getOctetStream(): Promise<Buffer> {
    return Buffer.from('binary data')
  }

  @Get('/png')
  @Produces('image/png')
  public async getPng(): Promise<Buffer> {
    return Buffer.from('fake png data')
  }

  @Get('/jpeg')
  @Produces('image/jpeg')
  public async getJpeg(): Promise<Buffer> {
    return Buffer.from('fake jpeg data')
  }

  @Get('/pdf')
  @Produces('application/pdf')
  public async getPdf(): Promise<Buffer> {
    return Buffer.from('fake pdf data')
  }

  @Get('/zip')
  @Produces('application/zip')
  public async getZip(): Promise<Buffer> {
    return Buffer.from('fake zip data')
  }

  @Get('/mp3')
  @Produces('audio/mpeg')
  public async getMp3(): Promise<Buffer> {
    return Buffer.from('fake mp3 data')
  }

  @Get('/mp4')
  @Produces('video/mp4')
  public async getMp4(): Promise<Buffer> {
    return Buffer.from('fake mp4 data')
  }

  @Post('/upload-png')
  public async uploadPng(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body('image/png') data: Buffer
  ): Promise<{ success: boolean }> {
    return { success: true }
  }

  @Post('/upload-pdf')
  public async uploadPdf(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body('application/pdf') data: Buffer
  ): Promise<{ success: boolean }> {
    return { success: true }
  }

  // Regular JSON endpoint for comparison
  @Get('/json')
  @Produces('application/json')
  public async getJson(): Promise<User> {
    return { id: '1', name: 'John Doe' }
  }
}
