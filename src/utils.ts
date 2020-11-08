import { Decorator, Type } from 'ts-morph'
import { OpenAPIV3 } from 'openapi-types'
import path from 'path'

export function getLiteralFromType (type: Type): string {
  if (type.isLiteral() && type.compilerType.isLiteral()) {
    return String(type.compilerType.value)
  }
  throw new Error('Not a literal value found')
}

export function extractDecoratorValues (decorator?: Decorator): string[] {
  if (decorator === undefined) return []
  return decorator.getArguments().map((arg) => {
    return getLiteralFromType(arg.getType())
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
    .join('/')
}

export function getRelativeFilePath (absoluteRoot: string, absolutePath: string): string {
  // Get relative path, without taking filename in account
  const dirPath = path.relative(
    absoluteRoot,
    path.dirname(absolutePath)
  )
  // Add `./` if it's in the same directory and relative resolve an empty string + add filename
  let filePath = (dirPath || '.') + '/' + path.basename(absolutePath)
  if (!filePath.startsWith('/') && !filePath.startsWith('.')) {
    filePath = `./${filePath}`
  }
  // Remove `.ts` extension to prevent typescript warning
  return filePath.substr(0, filePath.length - path.extname(filePath).length)
}
