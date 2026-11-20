import {
  SymbolFlags,
  Type,
  Node,
  ts,
  Symbol as TsSymbol,
  MethodDeclaration,
  MethodSignature,
  EnumDeclaration,
  ParameterDeclaration,
  PropertyDeclaration
} from 'ts-morph'
import { OpenAPIV3 } from 'openapi-types'
import { getConfig } from '.'
import { options } from './option'
import { buildRef } from './runtime/ref'

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function resolveNullableType(
  nonNullableType: Type,
  isUndefined: boolean,
  isNull: boolean,
  spec: OpenAPIV3.Document
): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  if (isNull) {
    return appendMetaToResolvedType(resolve(nonNullableType, spec), {
      nullable: true
    })
  }
  return resolve(nonNullableType, spec)
}

function retrieveTypeName(type: Type): string {
  if (type.isArray()) {
    return `Array_${retrieveTypeName(type.getArrayElementType()!)}`
  }
  if (type.isIntersection()) {
    return `Intersection_${type
      .getIntersectionTypes()
      .map(type => retrieveTypeName(type))
      .join('_')}`
  }
  if (type.isUnion()) {
    return `Union_${type
      .getUnionTypes()
      .map(type => retrieveTypeName(type))
      .join('_')}`
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
      return type
        .getProperties()
        .map(
          prop =>
            `${prop.getName()}_${retrieveTypeName(prop.getTypeAtLocation(getDeclarationForProperty(type, prop)))}`
        )
        .join('_')
    }
  }
  return typeName
}

/**
 * Returns true if the type could be identified
 */
function isTypeIdentifier(type: Type): boolean {
  const kindName = type.getSymbol()?.getDeclarations()?.[0]?.getKindName()
  return (
    typeof kindName !== 'undefined' &&
    kindName !== 'MappedType' &&
    (type.isAnonymous() === false ||
      typeof type.getAliasSymbol() !== 'undefined')
  )
}

export function resolve(
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
    const unionTypes = type.getUnionTypes()
    const isUndefined = unionTypes.some(t => t.isUndefined())
    const isNull = unionTypes.some(t => t.isNull())

    return resolveNullableTypeFn(
      type.getNonNullableType(),
      isUndefined,
      isNull,
      spec
    )
  }
  // Handle types
  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow()
    // Handle empty arrays where element type is 'never'
    if (elementType.getText() === 'never') {
      return {
        type: 'array',
        items: {}
      }
    }
    return {
      type: 'array',
      items: resolve(elementType, spec)
    }
  }
  if (type.isBoolean()) {
    return { type: 'boolean' }
  }
  if (type.isBooleanLiteral()) {
    return {
      type: 'boolean',
      // @ts-expect-error https://github.com/microsoft/TypeScript/issues/26075
      enum: [type.compilerType.intrinsicName]
    }
  }
  if (type.isUnknown() || type.isAny()) {
    spec.components!.schemas!.AnyValue = {
      description: 'Can be any value',
      nullable: true
    }
    return { $ref: buildRef('AnyValue') }
  }
  if (type.isTuple()) {
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
    if (typeof spec.components!.schemas![enumName] === 'undefined') {
      const values = declaration.getMembers().map(m => m.getValue()!)
      const names = declaration.getMembers().map(m => m.getName())
      spec.components!.schemas![enumName] = {
        type: typeof values[0] as 'string' | 'number',
        enum: values,
        ...(getConfig()?.openapi?.xEnumVarnames
          ? { 'x-enum-varnames': names }
          : {})
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
    if (
      helperName === 'Partial' ||
      helperName === 'Omit' ||
      helperName === 'Pick' ||
      helperName === 'Promise'
    ) {
      const typeArguments = type.getAliasTypeArguments()
      const subjectType = typeArguments[0]
      if (isTypeIdentifier(subjectType) === false) {
        return resolveMappedObjectType(
          type,
          spec,
          helperName,
          subjectType,
          typeArguments
        )
      }
      switch (helperName) {
        case 'Omit':
        case 'Pick':
          const args = typeArguments[1].isUnion()
            ? typeArguments[1]
                .getUnionTypes()
                .map(t =>
                  capitalizeFirstLetter(
                    String(t.getAliasSymbol()?.getName() ?? t.getLiteralValue())
                  )
                )
            : [
                capitalizeFirstLetter(
                  String(typeArguments[1].getLiteralValue())
                )
              ]
          typeName = `${retrieveTypeName(subjectType)}_With${helperName === 'Omit' ? 'out' : ''}_${args.join('_')}`
          break
        case 'Partial':
          typeName = `${retrieveTypeName(subjectType)}_Partial`
          break
        case 'Promise':
          typeName = retrieveTypeName(subjectType)
          break
      }
    } else if (
      (type.getAliasTypeArguments().length === 1 ||
        type.getTypeArguments().length === 1) &&
      isTypeIdentifier(
        type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      )
    ) {
      // i.e. Serialized<Datasource> -> Serialized_Datasource
      const subjectType =
        type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      const name =
        type.getSymbol()?.getEscapedName() !== '__type'
          ? type.getSymbol()?.getEscapedName()
          : helperName
      typeName = `${name}_${retrieveTypeName(subjectType)}`
    } else if (
      (type.getAliasTypeArguments().length === 1 ||
        type.getTypeArguments().length === 1) &&
      (
        type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      )?.isAnonymous() === true
    ) {
      // i.e. Serialized<{ datasource: Datasource }> -> Serialized_datasource
      const subjectType =
        type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      const name =
        type.getSymbol()?.getEscapedName() !== '__type'
          ? type.getSymbol()?.getEscapedName()
          : helperName
      typeName = `${name}_${retrieveTypeName(subjectType)}`
    } else if (
      (type.getAliasTypeArguments().length === 1 ||
        type.getTypeArguments().length === 1) &&
      (
        type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      )?.isUnion() === true
    ) {
      // i.e. Serialized<WorkerDatasource | ProxyDatasource> -> Serialized_Union_WorkerDatasource_ProxyDatasource
      const subjectType =
        type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      const name =
        type.getSymbol()?.getEscapedName() !== '__type'
          ? type.getSymbol()?.getEscapedName()
          : helperName
      typeName = `${name}_Union_${subjectType
        .getUnionTypes()
        .map(t => retrieveTypeName(t))
        .join('_')}`
    } else if (
      (type.getAliasTypeArguments().length === 1 ||
        type.getTypeArguments().length === 1) &&
      (
        type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      )?.isIntersection() === true
    ) {
      // i.e. Serialized<WorkerDatasource & ProxyDatasource> -> Serialized_Intersection_WorkerDatasource_ProxyDatasource
      const subjectType =
        type.getTypeArguments()[0] ?? type.getAliasTypeArguments()[0]
      const name =
        type.getSymbol()?.getEscapedName() !== '__type'
          ? type.getSymbol()?.getEscapedName()
          : helperName
      typeName = `${name}_Intersection_${subjectType
        .getIntersectionTypes()
        .map(t => retrieveTypeName(t))
        .join('_')}`
    } else if (isTypeIdentifier(type) === false) {
      // For other and anonymous types, don't use ref
      return resolveObjectType(type, spec)
    }
    if (typeof spec.components!.schemas![typeName] === 'undefined') {
      if (
        helperName === 'Partial' ||
        helperName === 'Omit' ||
        helperName === 'Pick'
      ) {
        const typeArguments = type.getAliasTypeArguments()
        const subjectType = typeArguments[0]
        spec.components!.schemas![typeName] = resolveMappedObjectType(
          type,
          spec,
          helperName,
          subjectType,
          typeArguments
        )
      } else {
        spec.components!.schemas![typeName] = resolveObjectType(type, spec)
      }
    }
    // Return
    return { $ref: buildRef(typeName) }
  }
  if (type.isIntersection()) {
    // `allOf` validates the whole value against every member, so a member with
    // `additionalProperties: false` would reject the properties of the others.
    // Object intersections are flattened into a single schema instead.
    if (type.getIntersectionTypes().every(isPlainObjectType)) {
      return resolveObjectType(type, spec)
    }
    // Same for arrays: `X[] & Y[]` is described as a single array of `X & Y`,
    // so that the items of `X` do not reject the properties of `Y`.
    const members = type.getIntersectionTypes()
    const elementType = type.getNumberIndexType()
    if (
      members.every(member => member.isArray()) &&
      elementType &&
      !elementType.isNever()
    ) {
      return {
        type: 'array',
        items: resolveArrayIntersectionItems(members, type, spec)
      }
    }
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
  if (
    (type.isEnumLiteral() || type.isLiteral()) &&
    type.compilerType.isLiteral()
  ) {
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

type ResolvePropertiesReturnType = Required<
  Pick<OpenAPIV3.BaseSchemaObject, 'properties'>
> & {
  required?: string[]
  additionalProperties?:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.SchemaObject
    | boolean
}

type Schema = OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject

function resolveArrayIntersectionItems(
  members: Type[],
  type: Type | undefined,
  spec: OpenAPIV3.Document
): Schema {
  const elements = members.map(member => member.getArrayElementTypeOrThrow())
  const elementType = type?.getNumberIndexType()
  if (elements.every(element => element.isArray())) {
    const nestedElement = elementType?.getNumberIndexType()
    if (!nestedElement || nestedElement.isNever()) {
      return { allOf: elements.map(element => resolve(element, spec)) }
    }
    return {
      type: 'array',
      items: resolveArrayIntersectionItems(elements, elementType, spec)
    }
  }
  if (
    elements.every(isPlainObjectType) &&
    elementType &&
    !elementType.isNever()
  ) {
    return resolve(elementType, spec)
  }
  return intersectSchemas(elements.map(element => resolve(element, spec)))
}

function intersectSchemas(schemas: Schema[]): Schema {
  const readOnly = schemas.some(
    schema => 'readOnly' in schema && schema.readOnly
  )
  const writeOnly = schemas.some(
    schema => 'writeOnly' in schema && schema.writeOnly
  )
  const result = combineSchemas(
    schemas.map(schema => {
      const copy = { ...schema }
      if ('readOnly' in copy) delete copy.readOnly
      if ('writeOnly' in copy) delete copy.writeOnly
      return copy
    })
  )
  if (!readOnly && !writeOnly) return result
  return appendMetaToResolvedType(result, {
    ...(readOnly ? { readOnly: true } : {}),
    ...(writeOnly ? { writeOnly: true } : {})
  })
}

function combineSchemas(schemas: Schema[]): Schema {
  const unique = schemas.filter(
    (schema, index) =>
      schemas.findIndex(
        other => JSON.stringify(other) === JSON.stringify(schema)
      ) === index
  )
  if (unique.length === 1) return unique[0]
  if (
    unique.every(
      schema =>
        'type' in schema &&
        schema.type === 'array' &&
        Object.keys(schema).every(key => key === 'type' || key === 'items')
    )
  ) {
    return {
      type: 'array',
      items: intersectSchemas(
        unique.map(schema => (schema as OpenAPIV3.ArraySchemaObject).items)
      )
    }
  }
  const narrowest = unique.find(schema =>
    unique.every(other => {
      if (JSON.stringify(schema) === JSON.stringify(other)) return true
      if (
        !('type' in schema) ||
        !('type' in other) ||
        schema.type !== other.type
      )
        return false
      if (schema.nullable && !other.nullable) return false
      if (Object.keys(other).every(key => key === 'type' || key === 'nullable'))
        return true
      return (
        Object.keys(other).every(
          key => key === 'type' || key === 'enum' || key === 'nullable'
        ) &&
        schema.enum !== undefined &&
        other.enum !== undefined &&
        schema.enum.every(value => other.enum!.includes(value))
      )
    })
  )
  return (
    narrowest ?? {
      allOf: unique,
      ...(unique.every(schema => 'nullable' in schema && schema.nullable)
        ? { nullable: true }
        : {})
    }
  )
}

const intersectionConstraints = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'multipleOf'
] as const

function resolveProperties(
  type: Type,
  spec: OpenAPIV3.Document,
  names?: Set<string>
): ResolvePropertiesReturnType {
  const properties = type
    .getProperties()
    .filter(property => !names || names.has(property.getName()))
  const result: ResolvePropertiesReturnType = properties.reduce(
    (schema, property) => {
      const node = getDeclarationForProperty(type, property)
      const propertyType = property.getTypeAtLocation(node)
      if (
        Node.isMethodDeclaration(node) ||
        Node.isMethodSignature(node) ||
        propertyType.getCallSignatures().length > 0
      ) {
        return schema // ignore functions
      }
      const jsDocTags = property.compilerSymbol.getJsDocTags()
      reportMisspelledJsDocTags(
        jsDocTags,
        `${type.getSymbol()?.getName() ?? type.getText()}.${property.getName()}`
      )
      // Handle readonly / getters props / @readonly tag
      const modifierFlags =
        property.getValueDeclaration()?.getCombinedModifierFlags() ??
        node.getCombinedModifierFlags()
      const hasFlags = (flag: SymbolFlags) =>
        property.hasFlags(flag) || node.getSymbol()?.hasFlags(flag)
      const isReadonly =
        modifierFlags === ts.ModifierFlags.Readonly ||
        (hasFlags(SymbolFlags.GetAccessor) === true &&
          hasFlags(SymbolFlags.SetAccessor) === false) ||
        jsDocTags.some(tag => tag.name === 'readonly')
      // Required by default
      let required = type.isIntersection()
        ? !property.hasFlags(SymbolFlags.Optional)
        : !hasFlags(SymbolFlags.Optional)
      // We resolve the property, overriding the behavior for nullable values
      // if the value is optional (isUndefined = true) we don't push in the required array
      const resolvedType = resolve(
        propertyType,
        spec,
        (nonNullableType, isUndefined, isNull, spec) => {
          if (isUndefined) {
            required = false
          }
          if (isNull) {
            return appendMetaToResolvedType(resolve(nonNullableType, spec), {
              nullable: true
            })
          }
          return resolve(nonNullableType, spec)
        }
      )
      if (isReadonly) {
        appendMetaToResolvedType(resolvedType, {
          readOnly: true
        })
      }
      if (jsDocTags.some(tag => tag.name === 'writeonly')) {
        appendMetaToResolvedType(resolvedType, {
          writeOnly: true
        })
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
      if (
        'type' in resolvedType &&
        (resolvedType.type as any) === 'undefined'
      ) {
        return schema
      }
      schema.properties[property.getName()] = resolvedType
      if (required) {
        schema.required.push(property.getName())
      }
      return schema
    },
    { properties: {}, required: [] } as Required<
      Omit<ResolvePropertiesReturnType, 'additionalProperties'>
    >
  )
  if (result.required?.length === 0) {
    // OpenAPI don't want the required[] prop if it's empty
    delete result.required
  }
  const parents = type.isIntersection()
    ? type.getIntersectionTypes()
    : type.isClassOrInterface()
      ? type.getBaseTypes()
      : []
  if (parents.length > 0) {
    const indexes = parents.flatMap(member => {
      const index = member.getStringIndexType() ?? member.getNumberIndexType()
      return index ? [resolve(index, spec)] : []
    })
    const selected = new Set(
      Object.keys(result.properties).filter(name => {
        if (indexes.length > 0) return true
        const property = type.getPropertyOrThrow(name)
        if (
          property
            .getTypeAtLocation(getDeclarationForProperty(type, property))
            .getNonNullableType()
            .isNever()
        )
          return true
        return parents.some(parent => {
          const source = parent.getProperty(name)
          return (
            source &&
            (source.compilerSymbol
              .getJsDocTags()
              .some(tag =>
                [...intersectionConstraints, 'readonly', 'writeonly'].includes(
                  tag.name
                )
              ) ||
              source
                .getDeclarations()
                .some(
                  node =>
                    Node.isGetAccessorDeclaration(node) ||
                    (node.getCombinedModifierFlags() &
                      ts.ModifierFlags.Readonly) !==
                      0
                ))
          )
        })
      })
    )
    const members = parents.map(member =>
      resolveProperties(member, spec, selected)
    )
    for (const name of selected) {
      const properties = members.flatMap(member =>
        member.properties[name] ? [member.properties[name]] : []
      )
      const property = type.getPropertyOrThrow(name)
      const propertyType = property.getTypeAtLocation(
        getDeclarationForProperty(type, property)
      )
      if (indexes.length > 0 || propertyType.getNonNullableType().isNever()) {
        if (
          !type.isIntersection() ||
          !propertyType.getNonNullableType().isNever() ||
          properties.length === 0
        ) {
          properties.unshift(result.properties[name])
        }
        result.properties[name] = intersectSchemas([...properties, ...indexes])
      } else {
        const current = result.properties[name]
        const missing = properties.filter(schema => {
          if ('$ref' in schema) return false
          return intersectionConstraints.some(key => {
            const value = schema[key]
            if (value === undefined) return false
            if ('$ref' in current) return true
            const resolved = current[key]
            if (JSON.stringify(value) === JSON.stringify(resolved)) return false
            if (typeof value === 'number' && typeof resolved === 'number') {
              if (
                ['minimum', 'minLength', 'minItems'].includes(key) &&
                resolved >= value
              )
                return false
              if (
                ['maximum', 'maxLength', 'maxItems'].includes(key) &&
                resolved <= value
              )
                return false
            }
            return true
          })
        })
        result.properties[name] = intersectSchemas([current, ...missing])
        const annotations = properties.filter(
          schema => 'readOnly' in schema || 'writeOnly' in schema
        )
        if (annotations.length > 0) {
          appendMetaToResolvedType(result.properties[name], {
            ...(annotations.some(
              schema => 'readOnly' in schema && schema.readOnly
            )
              ? { readOnly: true }
              : {}),
            ...(annotations.some(
              schema => 'writeOnly' in schema && schema.writeOnly
            )
              ? { writeOnly: true }
              : {})
          })
        }
      }
    }
    if (
      indexes.length > 0 &&
      getAdditionalPropertiesFromJsDoc(type) === undefined
    ) {
      result.additionalProperties = intersectSchemas(indexes)
      return result
    }
  }
  const typeSymbol = type.getSymbol()
  const additionalPropertiesFromJSDoc = getAdditionalPropertiesFromJsDoc(type)
  // If JSDoc tag is explicitly set, use it (overrides index signature detection)
  if (additionalPropertiesFromJSDoc !== undefined) {
    result.additionalProperties = additionalPropertiesFromJSDoc
    return result
  } else {
    // Check for index signatures regardless of whether explicit properties exist
    const stringIndexType = type.getStringIndexType()
    const numberIndexType = type.getNumberIndexType()
    // Handle mapped types and objects with index signatures (ex: { [key: string]: any } or Record<string, any>)
    if (
      (typeof stringIndexType !== 'undefined' &&
        stringIndexType.getText() !== 'never') ||
      (typeof numberIndexType !== 'undefined' &&
        numberIndexType.getText() !== 'never')
    ) {
      result.additionalProperties = resolve(
        stringIndexType ?? numberIndexType!,
        spec
      )
    } else {
      // Edge cases where TypeScript's getStringIndexType() might fail to detect
      // index signatures in complex type scenarios (e.g., after type transformations)

      // Check if the type represents a Record-like structure that should have additionalProperties
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
            (typeof apparentStringIndexType !== 'undefined' &&
              apparentStringIndexType.getText() !== 'never') ||
            (typeof apparentNumberIndexType !== 'undefined' &&
              apparentNumberIndexType.getText() !== 'never')
          ) {
            result.additionalProperties = resolve(
              apparentStringIndexType ?? apparentNumberIndexType!,
              spec
            )
          }
        }
      } else {
        // No index signature found and no JSDoc tag - default to false (no additional properties allowed)
        result.additionalProperties = false
      }
    }
    return result
  }
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
function resolveMappedObjectType(
  type: Type,
  spec: OpenAPIV3.Document,
  helperName: string,
  subjectType: Type,
  typeArguments?: Type[]
): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  // Check if we're omitting or picking the toJSON property
  let shouldSkipToJSON = false
  if (
    (helperName === 'Omit' || helperName === 'Pick') &&
    typeArguments &&
    typeArguments.length > 1
  ) {
    const omittedKeys = typeArguments[1].isUnion()
      ? typeArguments[1].getUnionTypes().map(t => String(t.getLiteralValue()))
      : [String(typeArguments[1].getLiteralValue())]
    if (helperName === 'Omit' && omittedKeys.includes('toJSON')) {
      // If we're omitting toJSON, don't follow it to avoid infinite loops
      shouldSkipToJSON = true
    } else if (helperName === 'Pick' && !omittedKeys.includes('toJSON')) {
      // If we're picking properties and toJSON is not in the list, skip it
      shouldSkipToJSON = true
    }
  }
  // Check if the subject type has a toJSON method
  const toJSONProperty = subjectType.getProperty('toJSON')
  if (toJSONProperty && !shouldSkipToJSON) {
    const node = getDeclarationForProperty(subjectType, toJSONProperty) as
      | MethodDeclaration
      | MethodSignature
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
 * Reads the `@additionalproperties true|false` JSDoc tag of a type, from its alias
 * (`type X = { ... }`) first, then from its symbol (interfaces, classes).
 * Extended interfaces and intersection members are flattened into the schema of the
 * type, so one of them allowing additional properties makes the type allow them too.
 */
function getAdditionalPropertiesFromJsDoc(type: Type): boolean | undefined {
  for (const symbol of [type.getAliasSymbol(), type.getSymbol()]) {
    const tag = symbol?.compilerSymbol
      .getJsDocTags()
      .find(tag => tag.name === 'additionalproperties')
    const tagText = tag?.text
      ?.map(t => t.text)
      .join(' ')
      .trim()
      .toLowerCase()
    if (tagText === 'true') {
      return true
    }
    if (tagText === 'false') {
      return false
    }
  }
  const parents = type.isIntersection()
    ? type.getIntersectionTypes()
    : type.isInterface()
      ? type.getBaseTypes()
      : []
  if (
    parents.some(parent => getAdditionalPropertiesFromJsDoc(parent) === false)
  ) {
    return false
  }
  if (parents.some(parent => getAdditionalPropertiesFromJsDoc(parent))) {
    return true
  }
  return undefined
}

/**
 * Object types whose properties can be merged into a single schema
 * when they are intersected.
 */
function isPlainObjectType(type: Type): boolean {
  if (
    (type.isObject() === false && type.isClassOrInterface() === false) ||
    type.isArray() ||
    type.isTuple() ||
    type.getCallSignatures().length > 0 ||
    typeof type.getProperty('toJSON') !== 'undefined'
  ) {
    return false
  }
  const typeName = type.getSymbol()?.getName()
  return typeName !== 'Date' && typeName !== 'Buffer'
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
function resolveObjectType(
  type: Type,
  spec: OpenAPIV3.Document
): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  // toJSON methods
  const toJSONProperty = type.getProperty('toJSON')
  if (toJSONProperty) {
    const node = getDeclarationForProperty(type, toJSONProperty) as
      | MethodDeclaration
      | MethodSignature
    return resolve(node.getReturnType(), spec)
  }
  // Inherited properties are flattened into the schema rather than composed with
  // `allOf`: `allOf` validates the whole value against every member, so a base with
  // `additionalProperties: false` would reject the properties added by the interface.
  const propertiesResult = resolveProperties(type, spec)
  if (propertiesResult.additionalProperties === undefined) {
    // If no JSDoc tag and no index signature, default to false
    propertiesResult.additionalProperties = false
  }
  return {
    type: 'object',
    ...propertiesResult
  }
}

function getDeclarationForProperty(rootType: Type, property: TsSymbol): Node {
  const firstDeclaration = property.getDeclarations()[0] as Node | undefined // Can be undefined with Record<'foo', string>.foo
  return firstDeclaration ?? rootType.getSymbolOrThrow().getDeclarations()[0]
}

export function appendMetaToResolvedType(
  type:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.ArraySchemaObject
    | OpenAPIV3.NonArraySchemaObject,
  metas: Partial<OpenAPIV3.NonArraySchemaObject>
):
  | OpenAPIV3.ReferenceObject
  | OpenAPIV3.ArraySchemaObject
  | OpenAPIV3.NonArraySchemaObject {
  if ('$ref' in type) {
    // siblings aren't allowed with ref (ex: for readonly) see https://stackoverflow.com/a/51402417
    const ref = type.$ref
    // @ts-expect-error $ref isn't optional but we need to delete it to mutate the type
    delete type.$ref
    return Object.assign(type, {
      // Mutate type deleting $ref
      allOf: [{ $ref: ref }],
      ...metas
    })
  }
  return Object.assign(type, metas)
}

const supportedJsDocTags = [
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

// Tags handled by the callers of appendJsDocTags, listed here only so that a
// misspelling of them (`@readOnly`, `@writeonly `) is reported too.
const otherKnownJsDocTags = ['readonly', 'writeonly']

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      previous = current
    }
  }
  return row[b.length]
}

/**
 * An unknown JSDoc tag is ignored on purpose (`@see`, `@deprecated`, ...), but a tag
 * that is one or two letters away from a constraint we support is almost certainly a
 * typo — and silently dropping `@minLenght 3` means the constraint vanishes from the
 * spec and from validation with no trace. Report it through the logger, or fail the
 * generation when `openapi.strictJsDocTags` is enabled.
 */
export function reportMisspelledJsDocTags(
  jsDocTags: ts.JSDocTagInfo[],
  location: string
) {
  const known = [...supportedJsDocTags, ...otherKnownJsDocTags]
  for (const tag of jsDocTags) {
    if (known.includes(tag.name)) continue
    const [suggestion, distance] = known
      .map(candidate => [
        candidate,
        levenshtein(tag.name.toLowerCase(), candidate.toLowerCase())
      ])
      .sort((a, b) => (a[1] as number) - (b[1] as number))[0] as [
      string,
      number
    ]
    if (distance > 2) continue
    const message =
      `Unknown JSDoc tag @${tag.name} on ${location}, did you mean @${suggestion}? ` +
      `Misspelled tags are not applied to the schema.`
    if (getConfig()?.openapi?.strictJsDocTags === true) {
      throw new Error(message)
    }
    options.getCustomLogger().warn(message)
  }
}

export function appendJsDocTags(
  jsDocTags: ts.JSDocTagInfo[],
  resolvedType:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.ArraySchemaObject
    | OpenAPIV3.NonArraySchemaObject
) {
  const supportedTags = supportedJsDocTags

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
    const value = numericTags.includes(tag.name)
      ? parseFloat(textValue)
      : textValue

    appendMetaToResolvedType(resolvedType, {
      [tag.name]: value
    })
  }
}

export function appendInitializer(
  node: ParameterDeclaration | PropertyDeclaration,
  schema:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.ArraySchemaObject
    | OpenAPIV3.NonArraySchemaObject
): boolean {
  // Default value
  const initializer = node.getInitializer()
  const initializerType = initializer?.getType()
  if (initializerType?.isLiteral()) {
    const initializerLiteralType = initializerType.compilerType as
      | ts.StringLiteralType
      | ts.NumberLiteralType
      | ts.TrueLiteral
      | ts.FalseLiteral
      | ts.NullLiteral
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
