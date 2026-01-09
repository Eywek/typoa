import {
  Route,
  Patch,
  Body,
  Controller,
  BodyDiscriminatorFunction,
  Response
} from '../../../src'

// Types for discriminator demo
export type One = { type: 'one' }
export type Two = { type: 'two' }

// Always pick the 'One' schema
export const discriminatorFn: BodyDiscriminatorFunction = async () => 'One'

@Route()
export class MiddlewareController extends Controller {
  @Patch('/123')
  @Response<One>(200)
  public async patch(
    @Body('application/json', discriminatorFn)
    body: One | Two
  ): Promise<One> {
    // Echo back the validated body
    return body as One
  }
}
