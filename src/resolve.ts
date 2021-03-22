import { SymbolFlags, Type, Node, ts, Symbol as TsSymbol, MethodDeclaration, MethodSignature, EnumDeclaration, ParameterDeclaration, PropertyDeclaration } from 'ts-morph'
import { OpenAPIV3 } from 'openapi-types'

export function buildRef (name: string) {
  return `#/components/schemas/${name}`
}

function stringifyName (rawName: string) {
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
  return appendMetaToResolvedType(resolve(nonNullableType, spec), { nullable: true })
}

function retrieveTypeName (
  type: Type
): string {
  const typeName = type.getSymbolOrThrow().getName()
  if (typeName === '__type') {
    const declaration = type.getSymbolOrThrow().getDeclarations()[0]
    if (declaration && Node.isTypeLiteralNode(declaration)) {
      const aliasSymbol = declaration.getType().getAliasSymbol()
      if (aliasSymbol) {
        return aliasSymbol.getName()
      }
    }
  }
  return typeName
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
  // Handle types
  if (type.isArray()) {
    return {
      type: 'array',
      items: resolve(type.getArrayElementTypeOrThrow(), spec)
    }
  }
  if (type.isBoolean()) {
    return { type: 'boolean' }
  }
  if (type.isBooleanLiteral()) {
    // @ts-expect-error https://github.com/microsoft/TypeScript/issues/26075
    return { type: 'boolean', enum: [type.compilerType.intrinsicName] }
  }
  if (type.isUnknown() || type.isAny()) {
    spec.components!.schemas!.AnyValue = {
      description: 'Can be any value',
      nullable: true
    }
    return { $ref: buildRef('AnyValue') }
  }
  if (type.isTuple()) { // OpenAPI doesn't support it, so we take it as an union of array
    // tslint:disable-next-line: no-console
    console.warn('typoa warning: Tuple aren\'t supported by OpenAPI, so we\'re transforming it to an array')
    return {
      type: 'array',
      items: {
        oneOf: type.getTupleElements().map(type => resolve(type, spec))
      }
    }
  }
  if (type.isEnum()) {
    const symbol = type.getSymbolOrThrow()
    const enumName = stringifyName(symbol.getName())
    const declaration = symbol.getDeclarations()[0] as EnumDeclaration
    // Add to spec components if not already resolved
    // tslint:disable-next-line: strict-type-predicates
    if (typeof spec.components!.schemas![enumName] === 'undefined') {
      const values = declaration.getMembers().map(m => m.getValue()!)
      spec.components!.schemas![enumName] = {
        type: (typeof values[0]) as 'string' | 'number',
        enum: values
      }
    }
    return { $ref: buildRef(enumName) }
  }
  if (type.isClassOrInterface() || type.isObject()) {
    let typeName = retrieveTypeName(type)
    // Special case for date
    if (typeName === 'Date') {
      return { type: 'string', format: 'date-time' }
    }
    // Handle mapped types
    const typeArguments = type.getTypeArguments()
    const isMappedType = type.getSymbolOrThrow().getDeclarations()[0]?.getKindName() === 'MappedType'
    if (typeName === '__type' && isMappedType) {
      typeName = type.getText()
    }
    // Special case for anonymous types and generic interfaces
    if (typeName === '__type' || typeName === '__object' || typeArguments.length > 0) {
      return resolveObjectType(type, spec)
    }
    const isRecord = type.getAliasSymbol()?.getEscapedName() === 'Record'
    if (isRecord) { // inline records
      return resolveObjectType(type, spec)
    }
    // Use ref for models and other defined types
    const refName = stringifyName(typeName)
    // Add to spec components if not already resolved
    // tslint:disable-next-line: strict-type-predicates
    if (typeof spec.components!.schemas![refName] === 'undefined') {
      spec.components!.schemas![refName] = resolveObjectType(type, spec)
    }
    // Return
    return { $ref: buildRef(refName) }
  }
  if (type.isIntersection()) {
    return {
      allOf: type.getIntersectionTypes().map(type => resolve(type, spec))
    }
  }
  if (type.isUnion()) {
    const values = type.getUnionTypes().map(type => resolve(type, spec))
    return {
      oneOf: values
    }
  }
  if ((type.isEnumLiteral() || type.isLiteral()) && type.compilerType.isLiteral()) {
    return {
      type: type.isNumberLiteral() ? 'number' : 'string',
      enum: [type.compilerType.value]
    }
  }
  const typeName = type.getText() as 'string' | 'number' | 'void'
  if (typeName === 'void') {
    return { type: 'object' }
  }
  return {
    type: typeName
  }
}

type ResolvePropertiesReturnType = Required<Pick<OpenAPIV3.BaseSchemaObject, 'properties'>> &
  { required?: string[], additionalProperties?: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject }
function resolveProperties (type: Type, spec: OpenAPIV3.Document): ResolvePropertiesReturnType {
  const result: ResolvePropertiesReturnType = type.getProperties().reduce((schema, property) => {
    const node = getDeclarationForProperty(type, property)
    const propertyType = property.getTypeAtLocation(node)
    if (Node.isMethodDeclaration(node) || Node.isMethodSignature(node) || propertyType.getCallSignatures().length > 0) {
      return schema// ignore functions
    }
    const jsDocTags = property.compilerSymbol.getJsDocTags()
    // Handle readonly / getters props / @readonly tag
    const modifierFlags = property.getValueDeclaration()?.getCombinedModifierFlags() ?? node.getCombinedModifierFlags()
    const hasFlags = (flag: SymbolFlags) => property.hasFlags(flag) || node.getSymbol()?.hasFlags(flag)
    const isReadonly = modifierFlags === ts.ModifierFlags.Readonly || (
      hasFlags(SymbolFlags.GetAccessor) === true &&
      hasFlags(SymbolFlags.SetAccessor) === false
    ) || jsDocTags.some(tag => tag.name === 'readonly')
    // Required by default
    let required = hasFlags(SymbolFlags.Optional) ? false : true
    // We resolve the property, overriding the behavior for nullable values
    // if the value is optional (isUndefined = true) we don't push in the required array
    const resolvedType = resolve(propertyType, spec, (nonNullableType, isUndefined, spec) => {
      if (isUndefined) {
        required = false
        return resolve(nonNullableType, spec)
      }
      return appendMetaToResolvedType(resolve(nonNullableType, spec), { nullable: true })
    })
    if (isReadonly) {
      appendMetaToResolvedType(resolvedType, { readOnly: true })
    }
    if (jsDocTags.some(tag => tag.name === 'writeonly')) {
      appendMetaToResolvedType(resolvedType, { writeOnly: true })
    }
    // JSDoc tags
    appendJsDocTags(jsDocTags, resolvedType)
    // initializer
    if (Node.isPropertyDeclaration(node)) {
      if (appendInitializer(node, resolvedType)) {
        required = false
      }
    }
    // Add to spec
    schema.properties[property.getName()] = resolvedType
    if (required) {
      schema.required.push(property.getName())
    }
    return schema
  }, { properties: {}, required: [] } as Required<Omit<ResolvePropertiesReturnType, 'additionalProperties'>>)
  if (result.required?.length === 0) {
    // OpenAPI don't want the required[] prop if it's empty
    delete result.required
  }
  if (Object.keys(result.properties).length === 0) {
    const stringIndexType = type.getStringIndexType()
    const numberIndexType = type.getNumberIndexType()
    // This is a mapped type string string or number as key (ex: { [key: string]: any } or Record<string, any>)
    if (
      (typeof stringIndexType !== 'undefined' && stringIndexType.getText() !== 'never') ||
      (typeof numberIndexType !== 'undefined' && numberIndexType.getText() !== 'never')
    ) {
      result.additionalProperties = resolve(
        stringIndexType ?? numberIndexType!,
        spec
      )
    }
  }
  return result
}

function resolveObjectType (type: Type, spec: OpenAPIV3.Document): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  // toJSON methods
  const toJSONProperty = type.getProperty('toJSON')
  if (toJSONProperty) {
    const node = getDeclarationForProperty(type, toJSONProperty) as MethodDeclaration | MethodSignature
    return resolve(node.getReturnType(), spec)
  }
  return {
    type: 'object',
    ...resolveProperties(type, spec)
  }
}

function getDeclarationForProperty (rootType: Type, property: TsSymbol): Node {
  const firstDeclaration = property.getDeclarations()[0] as Node | undefined // Can be undefined with Record<'foo', string>.foo
  return firstDeclaration ?? rootType.getSymbolOrThrow().getDeclarations()[0]
}

export function appendMetaToResolvedType (
  type: OpenAPIV3.ReferenceObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject,
  metas: Partial<OpenAPIV3.NonArraySchemaObject>
): OpenAPIV3.ReferenceObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject {
  if ('$ref' in type) { // siblings aren't allowed with ref (ex: for readonly) see https://stackoverflow.com/a/51402417
    const ref = type.$ref
    delete type.$ref
    return Object.assign(type, { // Mutate type deleting $ref
      allOf: [{ $ref: ref }],
      ...metas
    })
  }
  return Object.assign(type, metas)
}

export function appendJsDocTags (
  jsDocTags: ts.JSDocTagInfo[],
  resolvedType: OpenAPIV3.ReferenceObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject
) {
  for (const tag of jsDocTags) {
    if (['format', 'example', 'description', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(tag.name) && tag.text) {
      appendMetaToResolvedType(resolvedType, {
        [tag.name]: ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(tag.name) ? parseFloat(tag.text) : tag.text
      })
    }
  }
}

export function appendInitializer (
  node: ParameterDeclaration | PropertyDeclaration,
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject
): boolean {
  // Default value
  const initializer = node.getInitializer()
  const initializerType = initializer?.getType()

  if (initializerType?.isLiteral()) {
    const initializerLiteralType = initializerType.compilerType as ts.StringLiteralType | ts.NumberLiteralType | ts.TrueLiteral | ts.FalseLiteral | ts.NullLiteral
    let value: boolean | string | number | null
    if ('value' in initializerLiteralType) {
      value = initializerLiteralType.value
    } else if (initializerLiteralType.kind === ts.SyntaxKind.TrueKeyword) {
      value = true
    } else if (initializerLiteralType.kind === ts.SyntaxKind.FalseKeyword) {
      value = false
    } else {
      value = null
    }
    appendMetaToResolvedType(schema, { default: value })
    return true
  }
  return false
}
