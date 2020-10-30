import { Decorator } from 'ts-morph'
import { OpenAPIV3 } from 'openapi-types'

export function extractDecoratorValues (decorator?: Decorator): string[] {
  if (decorator === undefined) return []
  return decorator.getArguments().map((arg) => {
    const type = arg.getType()
    if (type.isLiteral() && type.compilerType.isLiteral()) {
      return String(type.compilerType.value)
    }
    throw new Error('Not a literal value found for decorator')
  })
}

export function appendToSpec (
  spec: OpenAPIV3.Document,
  path: string,
  verb: 'get' | 'patch' | 'put' | 'delete' | 'post',
  operation: OpenAPIV3.OperationObject
): void {
  // tslint:disable-next-line: strict-type-predicates
  if (typeof spec.paths[path] === 'undefined') {
    spec.paths[path] = {}
  }
  spec.paths[path][verb] = operation
}

export function normalizeUrl (str: string): string {
  return '/' + str.split('/')
    .filter(s => s.length > 0) // remove useless slashes
    .map((str) => { // Remove regex from express paths /foo/{id([A-Z]+)} => /foo/{id}
      return str.replace(/{([A-Za-z0-9-_]+)\(.+\)}/g, (match, captureGroup) => {
        return `{${captureGroup}}`
      })
    })
    .join('/')
}
