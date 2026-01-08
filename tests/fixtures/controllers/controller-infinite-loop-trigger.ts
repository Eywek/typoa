import { Get, Post, Body, Route } from '../../../src'

// Using Omit<Foo, 'toJSON'> creates circular dependency during type resolution:
// 1. Omit<Foo, 'toJSON'> tries to resolve Foo properties
// 2. When resolving Foo.toJSON method, it encounters return type Omit<Foo, 'toJSON'>
// 3. This creates circular dependency: Omit<Foo, 'toJSON'> → Foo → Omit<Foo, 'toJSON'> → ∞
// The mapped type resolver gets stuck in infinite recursion

class Foo {
  public foo: string = 'default'

  public toJSON (): Omit<Foo, 'toJSON'> {
    return { foo: 'bar' }
  }
}

@Route('infinite-loop-trigger')
export class InfiniteLoopTriggerController {
  @Get()
  public getSerializedFoo (): Omit<Foo, 'toJSON'> {
    return { foo: 'bar' }
  }

  @Post()
  public createFoo (@Body() data: Omit<Foo, 'toJSON'>): Foo {
    const foo = new Foo()
    foo.foo = data.foo
    return foo
  }

  @Get('both')
  public getBoth (): { serialized: Omit<Foo, 'toJSON'>, foo: Foo } {
    return {
      serialized: { foo: 'bar' },
      foo: new Foo()
    }
  }
}
