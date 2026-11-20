import { Body, Controller, Post, Route } from '../../../src'

export enum Kind {
  A = 'a',
  B = 'b'
}

type Serialized<T> = { [K in keyof T]: T[K] }
type Envelope<T> = { data: T }
interface Item {
  tags: Kind.A[]
}
interface Named {
  name: string
}
interface Tagged {
  tags: string[]
}
interface Short {
  /** @minLength 2 */
  name: string
}
interface Long {
  /** @maxLength 4 */
  name: string
}
interface Inherited extends Short, Long {}
interface Narrowed extends Short {
  /** @minLength 3 */
  name: string
}
interface ShortList {
  /** @minItems 1 */
  tags: string[]
}
interface LongList {
  /** @maxItems 2 */
  tags: string[]
}
/** @additionalproperties true */
interface Open {
  name: string
}
/** @additionalproperties false */
interface Closed {
  name: string
}
interface ClosedPair extends Open, Closed {}
interface Indexed extends Record<string, string> {
  kind: 'a'
}
interface JsonValue {
  toJSON(): string
}
interface JsonChoice {
  toJSON(): { left: string } | { right: number }
}

export interface Cases {
  direct: Array<'a'> & Kind[]
  tags: Kind.A[] & Kind[]
  serialized: Serialized<Item> & { tags: Kind[] }
  choice: (Serialized<Item> & { tags: Kind[] }) | { other: boolean }
  objects: Named[] & Tagged[]
  nested: Kind.A[][] & Kind[][]
  nestedDirect: Array<Array<'a'>> & Kind[][]
  nestedObjects: Named[][] & Tagged[][]
  enumValue: ('a' | 'b') & ('b' | 'c')
  conflict: { value: string } & { value: number }
  optionalConflict: { value?: string } & { value?: number }
  required: { value?: string } & { value: string }
  constraints: Short & Long
  inherited: Inherited
  narrowed: Narrowed
  bounded: ShortList & LongList
  indexed: Record<string, string> & Record<string, number>
  indexedProperty: Record<string, string> & { count: number }
  inheritedIndex: Indexed
  closed: Open & Closed
  inheritedClosed: ClosedPair
  modifiers: { readonly name: string | null } & { name?: string }
  branded: string & { tag: string }
  reference: JsonValue & { tag: string }
  referenceProperty: Envelope<Named> & { note: string }
  composedReference: JsonChoice & { active: boolean }
  union: ({ name: string } | { count: number }) & { active: boolean }
}

@Route('intersections')
export class IntersectionController extends Controller {
  @Post()
  public create(@Body() body: Cases): Cases {
    return body
  }
}
