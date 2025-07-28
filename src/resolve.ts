import { SymbolFlags, Type, Node, ts, Symbol as TsSymbol, MethodDeclaration, MethodSignature, EnumDeclaration, ParameterDeclaration, PropertyDeclaration } from 'ts-morph'
import { OpenAPIV3 } from 'openapi-types'

export function buildRef (name: string): string {
  return `#/components/schemas/${name}`
}

function capitalizeFirstLetter (str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function resolveNullableType (
  nonNullableType: Type,
  isUndefined: boolean,
  spec: OpenAPIV3.Document
): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  return appendMetaToResolvedType(resolve(nonNullableType, spec), { nullable: true })
}

function retrieveTypeName (type: Type): string {
  if (type.isArray()) {
    return `Array_${retrieveTypeName(type.getArrayElementType()!)}`
  }
  if (type.isIntersection()) {
    return `Intersection_${type.getIntersectionTypes().map(type => retrieveTypeName(type)).join('_')}`
  }
  if (type.isUnion()) {
    return `Union_${type.getUnionTypes().map(type => retrieveTypeName(type)).join('_')}`
  }
  const typeName = type.getSymbol()?.getName()
  if (typeof typeName === 'undefined') {
    return type.getText().replace(/-/g, '_').replace(/"/g, '')
  }
  if (typeName === '__type') {
    const aliasName = type.getAliasSymbol()?.getName()
    if (typeof aliasName !== 'undefined' && aliasName !== '__type') {
      return aliasName
    }
    const declaration = type.getSymbolOrThrow().getDeclarations()[0]
    if (declaration && Node.isLiteralTypeNode(declaration)) {
      const aliasSymbol = declaration.getType().getAliasSymbol()
      if (aliasSymbol) {
        return aliasSymbol.getName()
      }
    }
    // handle literal record
    if (type.isObject()) {
      return type.getProperties().map(prop => (`${prop.getName()}_${retrieveTypeName(prop.getTypeAtLocation(getDeclarationForProperty(type, prop)))}`)).join('_')
    }
  }
  return typeName
}

/**
 * Returns true if the type could be identified
 */
function isTypeIdentifier (type: Type): boolean {
  const kindName = type.getSymbol()?.getDeclarations()?.[0]?.getKindName()
  return typeof kindName !== 'undefined' && kindName !== 'MappedType' && (type.isAnonymous() === false || typeof type.getAliasSymbol() !== 'undefined')
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
    return {
      type: 'array',
      items: {
        oneOf: type.getTupleElements().map(type => resolve(type, spec))
      }
    }
  }
  if (type.isEnum()) {
    const symbol = type.getSymbolOrThrow()
    const enumName = symbol.getName()
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
    // Special case for Buffer, treat as binary string
    if (typeName === 'Buffer') {
      return { type: 'string', format: 'binary' }
    }
    // Handle mapped types
    const helperName = type.getAliasSymbol()?.getEscapedName()
    if (helperName === 'Partial' || helperName === 'Omit' || helperName === 'Pick' || helperName === 'Promise') {
      const typeArguments = type.getAliasTypeArguments()
      const subjectType = typeArguments[0]
      if (isTypeIdentifier(subjectType) === false) {
        return resolveMappedObjectType(type, spec, helperName, subjectType, typeArguments)
      }
      switch (helperName) {
        case 'Omit':
        case 'Pick':
          const args = typeArguments[1].isUnion()
            ? typeArguments[1].getUnionTypes().map(t => capitalizeFirstLetter(String(t.getAliasSymbol()?.getName() ?? t.getLiteralValue())))
            : [capitalizeFirstLetter(String(typeArguments[1].getLiteralValue()))]
          typeName = `${retrieveTypeName(subjectType)}_With${helperName === 'Omit' ? 'out' : ''}_${args.join('_')}`
          break
        case 'Partial':
          typeName = `${retrieveTypeName(subjectType)}_Partial`
          break
        case 'Promise':
          typeName = retrieveTypeName(subjectType)
          break
      }
    } else if ((type.getAliasTypeArguments().length === 1 || type.getTypeArguments().length === 1) && isTypeIdentifier(type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0])) { // i.e. Serialized<Datasource> -> Serialized_Datasource
      const subjectType = type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      const name = type.getSymbol()?.getEscapedName() !== '__type' ? type.getSymbol()?.getEscapedName() : helperName
      typeName = `${name}_${retrieveTypeName(subjectType)}`
    }  else if ((type.getAliasTypeArguments().length === 1 || type.getTypeArguments().length === 1) && (type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0])?.isAnonymous() === true) { // i.e. Serialized<{ datasource: Datasource }> -> Serialized_datasource
      const subjectType = type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      const name = type.getSymbol()?.getEscapedName() !== '__type' ? type.getSymbol()?.getEscapedName() : helperName
      typeName = `${name}_${retrieveTypeName(subjectType)}`
    } else if ((type.getAliasTypeArguments().length === 1 || type.getTypeArguments().length === 1) && (type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0])?.isUnion() === true) { // i.e. Serialized<WorkerDatasource | ProxyDatasource> -> Serialized_Union_WorkerDatasource_ProxyDatasource
      const subjectType = type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      const name = type.getSymbol()?.getEscapedName() !== '__type' ? type.getSymbol()?.getEscapedName() : helperName
      typeName = `${name}_Union_${subjectType.getUnionTypes().map(t => retrieveTypeName(t)).join('_')}`
    } else if ((type.getAliasTypeArguments().length === 1 || type.getTypeArguments().length === 1) && (type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0])?.isIntersection() === true) { // i.e. Serialized<WorkerDatasource & ProxyDatasource> -> Serialized_Intersection_WorkerDatasource_ProxyDatasource
      const subjectType = type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      const name = type.getSymbol()?.getEscapedName() !== '__type' ? type.getSymbol()?.getEscapedName() : helperName
      typeName = `${name}_Intersection_${subjectType.getIntersectionTypes().map(t => retrieveTypeName(t)).join('_')}`
    } else if (isTypeIdentifier(type) === false) { // For other and anonymous types, don't use ref
      return resolveObjectType(type, spec)
    }

    // Add to spec components if not already resolved
    // tslint:disable-next-line: strict-type-predicates
    if (typeof spec.components!.schemas![typeName] === 'undefined') {
      if (helperName === 'Partial' || helperName === 'Omit' || helperName === 'Pick') {
        const typeArguments = type.getAliasTypeArguments()
        const subjectType = typeArguments[0]
        spec.components!.schemas![typeName] = resolveMappedObjectType(type, spec, helperName, subjectType, typeArguments)
      } else {
        spec.components!.schemas![typeName] = resolveObjectType(type, spec)
      }
    }
    // Return
    return { $ref: buildRef(typeName) }
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
  const typeName = type.getText() as 'string' | 'number' | 'void' | 'null'
  // map null or void as object so that the schema stays valid
  if (typeName === 'null' || typeName === 'void') {
    return { type: 'object' as any }
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
    if ('type' in resolvedType && (resolvedType.type as any) === 'undefined') {
      return schema
    }
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
  
  // Check for index signatures regardless of whether explicit properties exist
  const stringIndexType = type.getStringIndexType()
  const numberIndexType = type.getNumberIndexType()
  
  // Handle mapped types and objects with index signatures (ex: { [key: string]: any } or Record<string, any>)
  if (
    (typeof stringIndexType !== 'undefined' && stringIndexType.getText() !== 'never') ||
    (typeof numberIndexType !== 'undefined' && numberIndexType.getText() !== 'never')
  ) {
    result.additionalProperties = resolve(
      stringIndexType ?? numberIndexType!,
      spec
    )
  } else {
    // Edge cases where TypeScript's getStringIndexType() might fail to detect
    // index signatures in complex type scenarios (e.g., after type transformations) 
    
    // Check if the type represents a Record-like structure that should have additionalProperties
    const typeSymbol = type.getSymbol()
    const typeText = type.getText()
    
    // Handle cases where the type might be a transformed Record type
    if (typeSymbol?.getName() === '__type' || typeText.includes('Record<')) {
      // For anonymous types that might be transformed Record types, 
      // check if the structure suggests it should have additional properties
      
      // Check the type's apparent type for index signatures
      const apparentType = type.getApparentType()
      if (apparentType && apparentType !== type) {
        const apparentStringIndexType = apparentType.getStringIndexType()
        const apparentNumberIndexType = apparentType.getNumberIndexType()
        
        if (
          (typeof apparentStringIndexType !== 'undefined' && apparentStringIndexType.getText() !== 'never') ||
          (typeof apparentNumberIndexType !== 'undefined' && apparentNumberIndexType.getText() !== 'never')
        ) {
          result.additionalProperties = resolve(
            apparentStringIndexType ?? apparentNumberIndexType!,
            spec
          )
        }
      }
    }
  }
  
  return result
}

/**
 * Resolves mapped object types when applied to types with toJSON methods.
 * 
 * When a mapped type is applied to a class/interface that has a toJSON method, we need to
 * apply the transformation to the toJSON return type rather than the original object properties.
 * This is because the toJSON method defines the actual serialized structure.
 * 
 * @returns The resolved OpenAPI schema with transformations applied
 */
function resolveMappedObjectType (
  type: Type,
  spec: OpenAPIV3.Document,
  helperName: string,
  subjectType: Type,
  typeArguments?: Type[]
): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  // Check if the subject type has a toJSON method
  const toJSONProperty = subjectType.getProperty('toJSON')
  if (toJSONProperty) {
    const node = getDeclarationForProperty(subjectType, toJSONProperty) as MethodDeclaration | MethodSignature
    const toJSONReturnType = resolve(node.getReturnType(), spec)
    
    // Apply mapped type transformation to the toJSON return type
    if ('$ref' in toJSONReturnType) {
      // For reference types, we need to create a new schema with the transformation applied
      // This is more complex, so for now we'll fall back to normal resolution
      return resolveObjectType(type, spec)
    }
    
    if (toJSONReturnType.type === 'object' && toJSONReturnType.properties) {
      const transformedSchema = { ...toJSONReturnType }
      
      switch (helperName) {
        case 'Partial':
          // Make all properties optional by removing them from required array
          delete transformedSchema.required
          break
        // Note: Omit and Pick are not implemented because they require understanding
        // the relationship between input properties and toJSON output properties,
        // which cannot be determined generically without analyzing the toJSON implementation
      }
      
      return transformedSchema
    }
  }
  
  // Fall back to normal object resolution if no toJSON or transformation failed
  return resolveObjectType(type, spec)
}

/**
 * Resolves object types (classes, interfaces, and plain objects) to OpenAPI schemas.
 * 
 * This function handles the conversion of TypeScript object types to OpenAPI schema objects.
 * It has special handling for classes/interfaces that have a toJSON method - in such cases,
 * it resolves to the return type of the toJSON method instead of the object's properties.
 * For regular objects without toJSON, it resolves all properties using resolveProperties.
 * 
 * @returns The resolved OpenAPI schema (either a reference or inline schema)
 */
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
    // @ts-expect-error $ref isn't optionnal
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
  const supportedTags = [
    'format',
    'example',
    'description',
    'title',
    'pattern',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems'
  ]
  
  const numericTags = [
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems'
  ]
  
  for (const tag of jsDocTags) {
    if (!supportedTags.includes(tag.name) || !tag.text) {
      continue
    }
    
    const textValue = tag.text.map(t => t.text).join('\n')
    const value = numericTags.includes(tag.name) ? parseFloat(textValue) : textValue
    
    appendMetaToResolvedType(resolvedType, {
      [tag.name]: value
    })
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
