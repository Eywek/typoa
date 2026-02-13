import { Decorator, Type, Node } from 'ts-morph'
import { OpenAPIV3 } from 'openapi-types'
import path from 'path'

export function getLiteralFromType(type: Type): string {
  if (type.isLiteral() && type.compilerType.isLiteral()) {
    return String(type.compilerType.value)
  }
  throw new Error('Not a literal value found')
}

export function extractDecoratorValues(decorator?: Decorator): string[] {
  if (decorator === undefined) return []
  return decorator.getArguments().map(arg => {
    return getLiteralFromType(arg.getType())
  })
}

export function extractFunctionArguments(
  decorator?: Decorator
): { name: string; path: string; args?: any[] }[] {
  if (!decorator) return []
  const arg = decorator.getArguments()[0]
  return [findFunctionDefinition(arg.getType(), arg)]
}

function findFunctionDefinition(
  type: Type,
  node?: Node
): { name: string; path: string; args?: any[] } {
  const symbol = type.getSymbol()
  if (!symbol) {
    throw new Error('Not a function reference found')
  }
  // Get function name and path
  const name = symbol.getName()
  const declarations = symbol.getDeclarations()
  if (!declarations || declarations.length === 0) {
    throw new Error(`No declarations found for middleware function '${name}'`)
  }
  const decl = declarations[0]
  let filePath: string | undefined
  let args: any[] | undefined
  // Handle factory function call
  if (node && Node.isCallExpression(node)) {
    // Store factory arguments
    args = node.getArguments().map(arg => {
      if (Node.isNumericLiteral(arg)) {
        return Number(arg.getText())
      }
      if (Node.isStringLiteral(arg)) {
        return arg.getText().slice(1, -1) // Remove quotes
      }
      return undefined
    })
    // Get the factory function declaration
    const factorySymbol = node.getExpression().getSymbol()
    if (factorySymbol) {
      const factoryDecl = factorySymbol.getDeclarations()[0]
      if (factoryDecl) {
        filePath = factoryDecl.getSourceFile().getFilePath()
      }
    }
  }
  // Handle normal function or variable
  if (!filePath) {
    if (Node.isFunctionDeclaration(decl) && !decl.isExported()) {
      throw new Error(`Middleware function '${name}' must be exported`)
    }
    if (
      Node.isVariableDeclaration(decl) &&
      !decl.getVariableStatement()?.isExported()
    ) {
      throw new Error(`Middleware function '${name}' must be exported`)
    }
    filePath = decl.getSourceFile().getFilePath()
  }
  return { name, path: filePath, args }
}

export function appendToSpec(
  spec: OpenAPIV3.Document,
  path: string,
  verb: 'get' | 'patch' | 'put' | 'delete' | 'post',
  operation: OpenAPIV3.OperationObject
): void {
  if (typeof spec.paths[path] === 'undefined') {
    spec.paths[path] = {}
  }
  spec.paths[path][verb] = operation
}

export function normalizeUrl(str: string): string {
  return (
    '/' +
    str
      .split('/')
      .filter(s => s.length > 0) // remove useless slashes
      .join('/')
  )
}

export function getRelativeFilePath(
  absoluteRoot: string,
  absolutePath: string
): string {
  // Get relative path, without taking filename in account
  const dirPath = path.relative(absoluteRoot, path.dirname(absolutePath))
  // Add `./` if it's in the same directory and relative resolve an empty string + add filename
  let filePath = (dirPath || '.') + '/' + path.basename(absolutePath)

  filePath = filePath.replace(/\\/g, '/')
  if (!filePath.startsWith('/') && !filePath.startsWith('.')) {
    filePath = `./${filePath}`
  }
  // Remove `.ts` extension to prevent typescript warning
  return filePath.substr(0, filePath.length - path.extname(filePath).length)
}

export function resolveProperty(
  schema:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.ArraySchemaObject
    | OpenAPIV3.NonArraySchemaObject,
  components: OpenAPIV3.ComponentsObject,
  path: string[]
): { value: unknown; meta: { isObject: boolean } } {
  if ('$ref' in schema) {
    return resolveProperty(
      components.schemas![schema.$ref.substr('#/components/schemas/'.length)],
      components,
      path
    )
  }
  if (typeof schema.allOf !== 'undefined') {
    const resolved = schema.allOf
      .map(schema => resolveProperty(schema, components, path))
      .reverse() // find the last element (override) in the allOf
      .find(({ value }) => typeof value !== 'string' || value.length > 0)
    return {
      value: resolved?.value ?? '',
      meta: { isObject: resolved?.meta.isObject ?? false }
    }
  }
  if (schema.type === 'array') {
    return resolveProperty(schema.items, components, path)
  }
  if (path.length === 0) {
    if (typeof schema.enum !== 'undefined') {
      return {
        value: schema.enum,
        meta: { isObject: false }
      }
    }
    if (schema.type === 'object') {
      return {
        value: JSON.stringify(
          Object.entries(schema.properties ?? {}).reduce<
            Record<string, unknown>
          >((obj, [key, value]) => {
            const resolved = resolveProperty(value, components, [])
            obj[key] = resolved.meta.isObject
              ? JSON.parse(resolved.value as string)
              : resolved.value
            return obj
          }, {})
        ),
        meta: { isObject: true }
      }
    }
    return { value: schema.type, meta: { isObject: false } }
  }
  if (typeof schema.properties === 'undefined') {
    return { value: '', meta: { isObject: false } }
  }
  const property = schema.properties[path[0]] as
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.ArraySchemaObject
    | OpenAPIV3.NonArraySchemaObject
    | undefined
  if (typeof property === 'undefined') {
    return { value: '', meta: { isObject: false } }
  }
  return resolveProperty(property, components, path.slice(1))
}
