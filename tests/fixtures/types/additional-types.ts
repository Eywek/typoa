export enum FooAdditional {
  BAR
}

export enum UniqueAdditionalType {
  VALUE = 42
}

// Not exported for testing purposes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
enum NotExported {
  FOO,
  BAR
}
