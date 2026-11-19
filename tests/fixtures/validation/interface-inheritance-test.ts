import { Controller, Route, Get } from '../../../src'

interface Foo {
  foo: number
}

interface Bar extends Foo {
  bar: number
}

interface Baz extends Bar {
  baz: string
}

// More complex inheritance scenarios
interface Base {
  id: string
  name: string
}

interface Extended extends Base {
  description: string
  active: boolean
}

interface MultipleInheritance extends Extended {
  metadata: Record<string, any>
}

// Extending a mapped type
interface A {
  a: string
}

interface B extends Omit<A, never> {
  b: number
}

interface Revision {
  id: string
}

interface Article {
  id: string
  revisions: string[]
}

interface SerializedArticle extends Omit<Article, 'revisions'> {
  revisions: Revision[]
}

type Intersected = A & { c: boolean }

/**
 * @additionalproperties true
 */
interface Open {
  open: string
}

interface ExtendsOpen extends Open {
  closed: string
}

@Route('/inheritance-test')
export class InterfaceInheritanceTestController extends Controller {
  @Get('/bar')
  getBar(): Bar {
    return { foo: 1, bar: 2 }
  }

  @Get('/baz')
  getBaz(): Baz {
    return { foo: 1, bar: 2, baz: 'test' }
  }

  @Get('/extended')
  getExtended(): Extended {
    return {
      id: '1',
      name: 'Test',
      description: 'A test item',
      active: true
    }
  }

  @Get('/multiple')
  getMultiple(): MultipleInheritance {
    return {
      id: '1',
      name: 'Test',
      description: 'A test item',
      active: true,
      metadata: { version: 1 }
    }
  }

  @Get('/b')
  getB(): B {
    return { a: 'x', b: 1 }
  }

  @Get('/article')
  getArticle(): SerializedArticle {
    return { id: '1', revisions: [{ id: 'r1' }] }
  }

  @Get('/intersected')
  getIntersected(): Intersected {
    return { a: 'x', c: true }
  }

  @Get('/extends-open')
  getExtendsOpen(): ExtendsOpen {
    return { open: 'x', closed: 'y' }
  }
}
