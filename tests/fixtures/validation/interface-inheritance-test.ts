import { Controller, Route, Get, Post, Body } from '../../../src'

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

/**
 * @additionalproperties false
 */
interface ClosesOpen extends Open {
  closed: string
}

interface Timestamps {
  createdAt: string
  readonly updatedAt: string
}

interface SeveralBases extends Base, Timestamps {
  tags?: string[]
}

interface PickedBase extends Pick<Base, 'id'> {
  label: string
}

interface PartialBase extends Partial<Base> {
  label: string
}

interface Narrowed extends Base {
  name: 'fixed'
}

interface Constrained {
  /**
   * @minLength 3
   */
  code: string
}

interface ExtendsConstrained extends Constrained {
  extra: number
}

interface Box<T> {
  value: T
}

interface StringBox extends Box<string> {
  label: string
}

interface Dictionary {
  [key: string]: number
}

interface ExtendsDictionary extends Dictionary {
  total: number
}

type Branded = string & { __brand: 'Id' }

interface Composition {
  base: Base
  closesOpen: ClosesOpen
  severalBases: SeveralBases
  pickedBase: PickedBase
  partialBase: PartialBase
  narrowed: Narrowed
  extendsConstrained: ExtendsConstrained
  stringBox: StringBox
  extendsDictionary: ExtendsDictionary
  overlapping: { status: string } & { status: 'ok' }
  threeMembers: A & { b: number } & { c?: boolean }
  nullableIntersection: (A & { c: boolean }) | null
  branded: Branded
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

  @Get('/several-bases')
  getSeveralBases(): SeveralBases {
    return {
      id: '1',
      name: 'Test',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02'
    }
  }

  @Get('/composition')
  getComposition(): Composition {
    throw new Error('Only used for the generated schema')
  }

  @Post('/b')
  postB(@Body() body: B): B {
    return body
  }

  @Post('/several-bases')
  postSeveralBases(@Body() body: SeveralBases): SeveralBases {
    return { ...body, updatedAt: '2026-01-02' }
  }
}
