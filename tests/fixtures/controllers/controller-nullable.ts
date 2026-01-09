import {
  Route,
  Get,
  Post,
  Put,
  Query,
  Body,
  Header,
  Controller
} from '../../../src'

// Test DTO for body parameters
interface CreateUserDto {
  name: string
  email: string | null // nullable property
  age?: number // optional property
  nickname?: string | null // optional and nullable
}

@Route('nullable')
export class NullableController extends Controller {
  /**
   * Test @Query with T | null - should be required: true, nullable: true
   */
  @Get('query-null')
  queryNull(@Query('filter') filter: string | null): {
    filter: string | null
  } {
    return { filter }
  }

  /**
   * Test @Query with T? - should be required: false, no nullable
   */
  @Get('query-optional')
  queryOptional(@Query('filter') filter?: string): {
    filter: string | undefined
  } {
    return { filter }
  }

  /**
   * Test @Query with T | undefined - should be required: false, no nullable
   */
  @Get('query-undefined')
  queryUndefined(@Query('filter') filter: string | undefined): {
    filter: string | undefined
  } {
    return { filter }
  }

  /**
   * Test @Query with T | null | undefined - should be required: false, nullable: true
   */
  @Get('query-null-undefined')
  queryNullUndefined(@Query('filter') filter: string | null | undefined): {
    filter: string | null | undefined
  } {
    return { filter }
  }

  /**
   * Test @Header with T | null - should be required: true, nullable: true
   */
  @Get('header-null')
  headerNull(@Header('x-custom') custom: string | null): {
    custom: string | null
  } {
    return { custom }
  }

  /**
   * Test @Header with T? - should be required: false, no nullable
   */
  @Get('header-optional')
  headerOptional(@Header('x-custom') custom?: string): {
    custom: string | undefined
  } {
    return { custom }
  }

  /**
   * Test @Body with T | null - should be required: false (nullable body), nullable: true in schema
   */
  @Post('body-null')
  bodyNull(@Body() body: CreateUserDto | null): {
    received: boolean
  } {
    return { received: body !== null }
  }

  /**
   * Test @Body with T? - should be required: false
   */
  @Put('body-optional')
  bodyOptional(@Body() body?: CreateUserDto): {
    received: boolean
  } {
    return { received: body !== undefined }
  }

  /**
   * Test @Body with T | undefined - should be required: false
   */
  @Put('body-undefined')
  bodyUndefined(@Body() body: CreateUserDto | undefined): {
    received: boolean
  } {
    return { received: body !== undefined }
  }
}
