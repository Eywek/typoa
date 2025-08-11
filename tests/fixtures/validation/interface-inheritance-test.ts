import { Controller, Route, Get } from '../../../src'

interface Foo {
  foo: number;
}

interface Bar extends Foo {
  bar: number;
}

interface Baz extends Bar {
  baz: string;
}

// More complex inheritance scenarios
interface Base {
  id: string;
  name: string;
}

interface Extended extends Base {
  description: string;
  active: boolean;
}

interface MultipleInheritance extends Extended {
  metadata: Record<string, any>;
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
}
