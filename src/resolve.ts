import { SymbolFlags, Type } from 'ts-morph'
import ts from 'typescript'
import { OpenAPIV3 } from 'openapi-types'

export function buildRef (name: string) {
  return `#/components/schemas/${name}`
}

export function stringifyName (rawName: string) {
  let name = rawName
  if (name.startsWith('Promise<')) {
    const nameWithoutPromise = name.substr('Promise<'.length)
    name = nameWithoutPromise.substr(0, nameWithoutPromise.length - 1)
  }
  name = name.replace(/import\(.+\)\./g, '')
  return encodeURIComponent(
    name
      .replace(/<|>/g, '_')
      .replace(/\s+/g, '')
      .replace(/,/g, '.')
      .replace(/\'([^']*)\'/g, '$1')
      .replace(/\"([^"]*)\"/g, '$1')
      .replace(/&/g, '-and-')
      .replace(/\|/g, '-or-')
      .replace(/\[\]/g, '-Array')
      .replace(/{|}/g, '_') // SuccessResponse_{indexesCreated-number}_ -> SuccessResponse__indexesCreated-number__
      .replace(/([a-z]+):([a-z]+)/gi, '$1-$2') // SuccessResponse_indexesCreated:number_ -> SuccessResponse_indexesCreated-number_
      .replace(/;/g, '--')
      .replace(/([a-z]+)\[([a-z]+)\]/gi, '$1-at-$2') // Partial_SerializedDatasourceWithVersion[format]_ -> Partial_SerializedDatasourceWithVersion~format~_,
      .replace(/{|}|\[|\]|\(|\)/g, '_')
      .replace(/:/g, '-')
      .replace(/\?/g, '..')
      .replace(/'|"/g, '')
  )
}

function resolveNullableType (
  nonNullableType: Type,
  isUndefined: boolean,
  spec: OpenAPIV3.Document
): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  return Object.assign(resolve(nonNullableType, spec), { nullable: true })
}

export function resolve (
  type: Type,
  spec: OpenAPIV3.Document,
  resolveNullableTypeFn = resolveNullableType
): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  // Promises
  if (type.getSymbol()?.getEscapedName() === 'Promise') {
    return resolve(type.getTypeArguments()[0], spec)
  }
  // Nullable
  // We allow to override the behavior because for undefined values
  // we want to avoid putting it in the `required` prop for objects
  if (type.isNullable()) {
    const isUndefined = type.getUnionTypes().some(t => t.isUndefined())
    return resolveNullableTypeFn(type.getNonNullableType(), isUndefined, spec)
  }
  // JSDoc
  const jsDocTags = type.getSymbol()?.compilerSymbol.getJsDocTags()
  const description = jsDocTags?.find(tag => tag.name === 'description')?.text
  const pattern = jsDocTags?.find(tag => tag.name === 'pattern')?.text
  // Handle types
  if (type.isArray()) {
    return {
      type: 'array',
      items: resolve(type.getArrayElementTypeOrThrow(), spec),
      description
    }
  }
  if (type.isBoolean()) {
    return { type: 'boolean', description }
  }
  if (type.isUnknown()) {
    return { type: 'object', description }
  }
  if (type.isTuple()) { // OpenAPI doesn't support it, so we take it as an union of array
    return {
      type: 'array',
      items: {
        oneOf: type.getTupleElements().map(type => resolve(type, spec))
      },
      description
    }
  }
  if (type.isClassOrInterface() || type.isObject()) {
    const typeName = type.getSymbolOrThrow().getName()
    // Special case for date
    if (typeName === 'Date') {
      return { type: 'string', format: 'date-time', description }
    }
    // Special case for anonymous types and generic interfaces
    const typeArguments = type.getTypeArguments()
    if (typeName === '__type' || typeName === '__object' || typeArguments.length > 0) {
      return {
        ...resolveProperties(type, spec),
        description
      }
    }
    // Use ref for models and other defined types
    const refName = stringifyName(typeName)
    // Add to spec components if not already resolved
    // tslint:disable-next-line: strict-type-predicates
    if (typeof spec.components!.schemas![refName] === 'undefined') {
      spec.components!.schemas![refName] = {
        ...resolveProperties(type, spec),
        description
      }
    }
    // Return
    return { $ref: buildRef(refName) }
  }
  if (type.isIntersection()) {
    return {
      allOf: type.getIntersectionTypes().map(type => resolve(type, spec)),
      description
    }
  }
  if (type.isUnion()) {
    const values = type.getUnionTypes().map(type => resolve(type, spec))
    if (type.isEnum()) {
      const enumName = stringifyName(type.getSymbolOrThrow().getName())
      // Add to spec components if not already resolved
      // tslint:disable-next-line: strict-type-predicates
      if (typeof spec.components!.schemas![enumName] === 'undefined') {
        spec.components!.schemas![enumName] = {
          type: 'string',
          enum: type.getUnionTypes().map(type => (resolve(type, spec) as OpenAPIV3.NonArraySchemaObject).enum![0]),
          description,
          pattern
        }
      }
      return { $ref: buildRef(enumName) }
    }
    return {
      oneOf: values,
      description
    }
  }
  if ((type.isEnumLiteral() || type.isLiteral()) && type.compilerType.isLiteral()) {
    return {
      type: type.isNumberLiteral() ? 'number' : 'string',
      enum: [type.compilerType.value],
      description,
      pattern
    }
  }
  const typeName = type.getText() as 'string' | 'number' | 'void'
  if (typeName === 'void') {
    return { type: 'object' }
  }
  return {
    type: typeName,
    description,
    pattern
  }
}

type ResolvePropertiesReturnType = Required<Pick<OpenAPIV3.BaseSchemaObject, 'properties'>> & { required?: string[] }
function resolveProperties (type: Type, spec: OpenAPIV3.Document): ResolvePropertiesReturnType {
  const result: ResolvePropertiesReturnType = type.getProperties().reduce((schema, property) => {
    const firstDeclaration = property.getDeclarations()[0]
    // tslint:disable-next-line: strict-type-predicates
    if (typeof firstDeclaration === 'undefined') {
      throw new Error(`Can't found declaration on '${type.getText()}.${property.getName()}' property`)
    }
    const propertyType = property.getTypeAtLocation(firstDeclaration)
    // Handle readonly / getters props
    const modifierFlags = property.getValueDeclaration()?.getCombinedModifierFlags()
    const isReadonly = modifierFlags === ts.ModifierFlags.Readonly || (
      property.hasFlags(SymbolFlags.GetAccessor) === true &&
      property.hasFlags(SymbolFlags.SetAccessor) === false
    )
    // Required by default
    let required = true
    // We resolve the property, overriding the behavior for nullable values
    // if the value is optional (isUndefined = true) we don't push in the required array
    const resolvedType = resolve(propertyType, spec, (nonNullableType, isUndefined, spec) => {
      if (isUndefined) {
        required = false
        return resolve(nonNullableType, spec)
      }
      return Object.assign(resolve(nonNullableType, spec), { nullable: true })
    })
    if (isReadonly) {
      Object.assign(resolvedType, { readOnly: true })
    }
    schema.properties[property.getName()] = resolvedType
    if (required) {
      schema.required.push(property.getName())
    }
    return schema
  }, { properties: {}, required: [] } as Required<ResolvePropertiesReturnType>)
  if (result.required?.length === 0) {
    // OpenAPI don't want the required[] prop if it's empty
    delete result.required
  }
  return result
}
