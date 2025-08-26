export enum FooAdditional {
  BAR
}

export enum UniqueAdditionalType {
  VALUE = 42
}

// Not exported for testing purposes
// @ts-ignore: Intentionally unused for testing
enum NotExported {
  FOO,
  BAR
}
