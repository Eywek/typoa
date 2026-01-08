import express from 'express'
import { OpenAPIV3 } from 'openapi-types'
import debug from 'debug'
import { buildRef } from '../resolve'
import { BodyDiscriminatorFunction } from './decorators'

const log = debug('typoa:validator')

export class ValidateError extends Error {
  public status = 400
  public name = 'ValidateError'

  constructor (public fields: Record<string, { message: string; value?: any }>, public message: string) {
    super(message)
  }
}

export async function validateAndParse (
  req: express.Request,
  schemas: OpenAPIV3.ComponentsObject['schemas'],
  rules: {
    params: OpenAPIV3.ParameterObject[]
    body?: OpenAPIV3.RequestBodyObject,
    bodyDiscriminatorFn?: BodyDiscriminatorFunction
  }
): Promise<any[]> {
  const args: any[] = []
  for (const param of (rules.params || [])) {
    // Handling @Request()
    if (param.in === 'request') {
      args.push(req)
      continue
    }
    // Handling body
    if (param.in === 'body') {
      args.push(await validateBody(req, rules.body!, rules.bodyDiscriminatorFn, schemas))
      continue
    }
    // Handling other params: header, query and path
    let value: string | undefined | string[]
    switch (param.in) {
      case 'header':
        value = req.headers[param.name]
        break
      case 'query':
        value = req.query[param.name] as string | undefined | string[]
        const schema = param.schema!
        if ('type' in schema && schema.type === 'boolean' && value?.length === 0) {
          value = 'true' // allow empty values for param boolean
        }
        if ('type' in schema && schema.type === 'array' && typeof value === 'string') {
          value = [value]
        }
        break
      case 'path':
        value = req.params[param.name]
        break
    }
    const isUndefined = typeof value === 'undefined'
    if (param.required === true && isUndefined) {
      throw new ValidateError({
        [param.name]: { message: 'Param is required', value }
      }, 'Missing parameter')
    }
    if (isUndefined) { // Don't validate
      args.push(undefined)
      continue
    }
    args.push(validateAndParseValueAgainstSchema(param.name, value, param.schema!, schemas))
  }
  return args
}

export function validateAndParseResponse (
  data: unknown,
  schemas: OpenAPIV3.ComponentsObject['schemas'],
  rules: Record<string, OpenAPIV3.ResponseObject>,
  statusCode: string,
  contentType: string
): unknown {
  try {
    const rule = rules[statusCode] ?? rules.default
    if (!rule) throw new ValidateError({ response: { message: `Missing response schema for status code ${statusCode}` } }, 'Invalid status code')
    const expectedSchema = rule.content?.[contentType]?.schema
    if (typeof expectedSchema === 'undefined') {
      if (typeof data === 'undefined' || data === null) {
        return data
      }
      log(`Schema is not found for '${contentType}', throwing error`)
      throw new ValidateError({}, 'This content-type is not allowed')
    }
    return validateAndParseValueAgainstSchema('response', data, expectedSchema, schemas)
  } catch (e) {
    if (e instanceof ValidateError) {
      // validation error on the result is a server, not client error
      e.status = 500
    }
    throw e
  }
}

async function validateBody (
  req: express.Request,
  rule: OpenAPIV3.RequestBodyObject,
  discriminatorFn: BodyDiscriminatorFunction | undefined,
  schemas: OpenAPIV3.ComponentsObject['schemas']
): Promise<any> {
  const body = req.body
  const contentType = (req.headers['content-type'] ?? 'application/json').split(';')[0]
  const expectedSchema = rule.content[contentType]?.schema
  if (typeof expectedSchema === 'undefined') {
    log(`Schema is not found for '${contentType}', throwing error`)
    throw new ValidateError({}, 'This content-type is not allowed')
  }
  if (req.readableEnded === false) {
    log(`! Warning: Body has not be parsed, body validation skipped !`)
    return body
  }
  if (discriminatorFn) {
    const schemaName = await discriminatorFn(req)
    return validateAndParseValueAgainstSchema('body', body, { $ref: buildRef(schemaName) }, schemas)
  }
  return validateAndParseValueAgainstSchema('body', body, expectedSchema, schemas)
}

function getFromRef (
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject,
  schemas: OpenAPIV3.ComponentsObject['schemas']
): OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject {
  if ('$ref' in schema) {
    const schemaName = schemas![schema.$ref.substr('#/components/schemas/'.length)]
    // tslint:disable-next-line: strict-type-predicates
    if (typeof schemaName === 'undefined') {
      throw new Error(`Schema '${schema.$ref}' not found`)
    }
    return getFromRef(schemaName, schemas)
  }
  return schema
}

function validateAndParseValueAgainstSchema (
  name: string,
  value: unknown,
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject,
  schemas: OpenAPIV3.ComponentsObject['schemas']
): unknown {
  const currentSchema = getFromRef(schema, schemas)
  // Nullable
  if (value === null) {
    if (currentSchema.nullable) {
      return currentSchema.default ?? null
    }
    throw new ValidateError({
      [name]: { message: 'This property is not nullable' }
    }, 'Invalid parameter')
  }
  // Strings
  if (currentSchema.type === 'string') {
    // Special case for date format
    if (value instanceof Date && currentSchema.format === 'date-time') {
      return value
    }
    // Special case for binary format
    if (currentSchema.format === 'binary' && Buffer.isBuffer(value)) {
      return value
    }
    if (typeof value !== 'string') {
      throw new ValidateError({
        [name]: { message: 'This property must be a string', value }
      }, 'Invalid parameter')
    }
    if (typeof currentSchema.minLength !== 'undefined' && value.length < currentSchema.minLength) {
      throw new ValidateError({
        [name]: { message: `This property must have ${currentSchema.minLength} characters minimum`, value }
      }, 'Invalid parameter')
    }
    if (typeof currentSchema.maxLength !== 'undefined' && value.length > currentSchema.maxLength) {
      throw new ValidateError({
        [name]: { message: `This property can have ${currentSchema.maxLength} characters maximum`, value }
      }, 'Invalid parameter')
    }
    if (currentSchema.enum && currentSchema.enum.includes(value) === false) {
      throw new ValidateError({
        [name]: { message: `This property must be one of ${currentSchema.enum}`, value }
      }, 'Invalid parameter')
    }
    if (currentSchema.pattern) {
      validateAndParsePattern(name, value, currentSchema.pattern)
    }
    if (currentSchema.format) {
      return validateAndParseFormat(name, value, currentSchema.format)
    }
    return value
  }
  // Numbers
  if (currentSchema.type === 'number') {
    // Note: in body we don't want to parseFloat() because fields should
    // already be parsed. And we don't want to transform a field with type string | number
    // into a number if it's a string in the body
    const isInBody = name === 'body' || name.startsWith('body.')
    const parsedValue = isInBody ? value as number : parseFloat(String(value))
    if (isNaN(parsedValue)) {
      throw new ValidateError({
        [name]: { message: 'This property must be a number', value }
      }, 'Invalid parameter')
    }
    if (typeof currentSchema.minimum !== 'undefined') {
      if (parsedValue < currentSchema.minimum) {
        throw new ValidateError({
          [name]: { message: `This property must be >= ${currentSchema.minimum}`, value }
        }, 'Invalid parameter')
      }
    }
    if (typeof currentSchema.maximum !== 'undefined') {
      if (parsedValue > currentSchema.maximum) {
        throw new ValidateError({
          [name]: { message: `This property must be <= ${currentSchema.maximum}`, value }
        }, 'Invalid parameter')
      }
    }
    if (currentSchema.enum && currentSchema.enum.includes(parsedValue) === false) {
      throw new ValidateError({
        [name]: { message: `This property must be one of ${currentSchema.enum}`, value }
      }, 'Invalid parameter')
    }
    return parsedValue
  }
  // Boolean
  if (currentSchema.type === 'boolean') {
    const parsedValue = String(value)
    if (['0', '1', 'false', 'true'].includes(parsedValue) === false) {
      throw new ValidateError({
        [name]: { message: 'This property must be a boolean', value }
      }, 'Invalid parameter')
    }
    return parsedValue === '1' || parsedValue === 'true'
  }
  // Array
  if (currentSchema.type === 'array') {
    if (!Array.isArray(value)) {
      throw new ValidateError({
        [name]: { message: 'This property must be an array', value }
      }, 'Invalid parameter')
    }
    if (typeof currentSchema.minItems !== 'undefined' && value.length < currentSchema.minItems) {
      throw new ValidateError({
        [name]: { message: `This property must have ${currentSchema.minItems} items minimum`, value }
      }, 'Invalid parameter')
    }
    if (typeof currentSchema.maxItems !== 'undefined' && value.length > currentSchema.maxItems) {
      throw new ValidateError({
        [name]: { message: `This property can have ${currentSchema.maxItems} items maximum`, value }
      }, 'Invalid parameter')
    }
    return value.map((item, i) => {
      return validateAndParseValueAgainstSchema(`${name}.${i}`, item, currentSchema.items, schemas)
    })
  }
  // Object
  if (currentSchema.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value) === true) {
      throw new ValidateError({
        [name]: { message: 'This property must be an object', value }
      }, 'Invalid parameter')
    }
    const filteredProperties = Object.keys(currentSchema.properties || {})
      .filter((propName) => { // Ignore readOnly properties
        const val = currentSchema.properties![propName]
        return !('readOnly' in val) || val.readOnly !== true
      })
      .reduce((props, propName) => {
        const propValue = (value as Record<string, unknown>)[propName]
        const isNotDefined = typeof propValue === 'undefined'
        const propSchema = currentSchema.properties![propName]
        const isAnyValue = '$ref' in propSchema && propSchema.$ref === '#/components/schemas/AnyValue'
        if (currentSchema.required?.includes(propName) && (isNotDefined === true && isAnyValue === false)) {
          throw new ValidateError({
            [`${name}.${propName}`]: { message: 'This property is required' }
          }, 'Invalid parameter')
        }
        if (isNotDefined === false) {
          props[propName] = validateAndParseValueAgainstSchema(
            `${name}.${propName}`,
            propValue,
            currentSchema.properties![propName],
            schemas
          )
        } else {
          const propertySchema = getFromRef(currentSchema.properties![propName], schemas)
          if (propertySchema.default) {
            props[propName] = propertySchema.default
          }
        }
        return props
      }, {} as Record<string, unknown>)
    // Validate remaining keys with additionalProperties if present
    if (currentSchema.additionalProperties && typeof currentSchema.additionalProperties !== 'boolean') {
      const filteredKeys = Object.keys(filteredProperties)
      const keys = Object.keys(value).filter(key => filteredKeys.includes(key) === false)
      return Object.assign(filteredProperties, keys.reduce((props, propName) => {
        const propValue = (value as Record<string, unknown>)[propName]
        if (typeof propValue !== 'undefined') {
          props[propName] = validateAndParseValueAgainstSchema(
            `${name}.${propName}`,
            propValue,
            currentSchema.additionalProperties as any,
            schemas
          )
        }
        return props
      }, {} as Record<string, unknown>))
    }
    return filteredProperties
  }
  // AllOf
  if (currentSchema.allOf) {
    // try to validate every allOf and merge their results
    const schemasValues = currentSchema.allOf.map((schema, i) => {
      return validateAndParseValueAgainstSchema(
        `${name}.${i}`,
        value,
        schema,
        schemas
      )
    })
    if (schemasValues.length === 1) {
      return schemasValues[0]
    }
    return Object.assign({}, ...schemasValues)
  }
  // OneOf
  if (currentSchema.oneOf) {
    let matchingValue: unknown | undefined

    currentSchema.oneOf.forEach((schema, i) => {
      const { succeed, value: parsedValue } = validateAndParseValueAgainstSchemaSafely(
        `${name}.${i}`,
        value,
        schema,
        schemas
      )

      if (succeed) {
        // set as matching value if we haven't found one
        if (typeof matchingValue === 'undefined') {
          matchingValue = parsedValue
          return
        }
        // replace matched value if the new one have more keys
        if (
          typeof matchingValue === 'object' && matchingValue !== null &&
          typeof parsedValue === 'object' && parsedValue !== null &&
          Object.keys(parsedValue).length > Object.keys(matchingValue).length
        ) {
          matchingValue = parsedValue
        }
      }
    })

    if (typeof matchingValue === 'undefined') {
      throw new ValidateError({
        [name]: { message: 'Found no matching schema for provided value', value }
      }, 'Invalid parameter')
    }
    return matchingValue
  }
  log(`Schema of ${name} is not yet supported, skipping value validation`)
  return value
}

type SafeValidatedValue = { succeed: false, value: null, errorMessage: string } | { succeed: true, value: unknown, errorMessage: null }
function validateAndParseValueAgainstSchemaSafely (
  name: string,
  value: unknown,
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject,
  schemas: OpenAPIV3.ComponentsObject['schemas']
): SafeValidatedValue {
  const currentSchema = getFromRef(schema, schemas)
  // Nullable
  if (value === null) {
    if (currentSchema.nullable) {
      return currentSchema.default ?? null
    }
    return { succeed: false, value: null, errorMessage: `This property is not nullable`};
  }
  // Strings
  if (currentSchema.type === 'string') {
    // Special case for date format
    if (value instanceof Date && currentSchema.format === 'date-time') {
      return { succeed: true, value, errorMessage: null }
    }
    // Special case for binary format
    if (currentSchema.format === 'binary' && Buffer.isBuffer(value)) {
      return { succeed: true, value, errorMessage: null }
    }
    if (typeof value !== 'string') {
      return { succeed: false, value: null, errorMessage: `This property must be a string`};
    }
    if (typeof currentSchema.minLength !== 'undefined' && value.length < currentSchema.minLength) {
      return { succeed: false, value: null, errorMessage: `This property must have ${currentSchema.minLength} characters minimum`};
    }
    if (typeof currentSchema.maxLength !== 'undefined' && value.length > currentSchema.maxLength) {
      return { succeed: false, value: null, errorMessage: `This property can have ${currentSchema.maxLength} characters maximum`};
    }
    if (currentSchema.enum && currentSchema.enum.includes(value) === false) {
      return { succeed: false, value: null, errorMessage: `This property must be one of ${currentSchema.enum}`};
    }
    if (currentSchema.pattern) {
      validateAndParsePattern(name, value, currentSchema.pattern)
    }
    if (currentSchema.format) {
      return validateAndParseFormatSafely(name, value, currentSchema.format)
    }
    return { succeed: true, value, errorMessage: null }
  }
  // Numbers
  if (currentSchema.type === 'number') {
    // Note: in body we don't want to parseFloat() because fields should
    // already be parsed. And we don't want to transform a field with type string | number
    // into a number if it's a string in the body
    const isInBody = name === 'body' || name.startsWith('body.')
    const parsedValue = isInBody ? value as number : parseFloat(String(value))
    if (isNaN(parsedValue)) {
      return { succeed: false, value: null, errorMessage: 'This property must be a number' }
    }
    if (typeof currentSchema.minimum !== 'undefined') {
      if (parsedValue < currentSchema.minimum) {
        return { succeed: false, value: null, errorMessage: `This property must be >= ${currentSchema.minimum}` }
      }
    }
    if (typeof currentSchema.maximum !== 'undefined') {
      if (parsedValue > currentSchema.maximum) {
        return { succeed: false, value: null, errorMessage: `This property must be <= ${currentSchema.maximum}` }
      }
    }
    if (currentSchema.enum && currentSchema.enum.includes(parsedValue) === false) {
      return { succeed: false, value: null, errorMessage: `This property must be one of ${currentSchema.enum}` }
    }
    return { succeed: true, value: parsedValue, errorMessage: null }
  }
  // Boolean
  if (currentSchema.type === 'boolean') {
    const parsedValue = String(value)
    if (['0', '1', 'false', 'true'].includes(parsedValue) === false) {
      return { succeed: false, value: null, errorMessage: 'This property must be a boolean' }
    }
    return { succeed: true, value: parsedValue === '1' || parsedValue === 'true', errorMessage: null }
  }
  // Array
  if (currentSchema.type === 'array') {
    if (!Array.isArray(value)) {
      return { succeed: false, value: null, errorMessage: "This property must be an array"};
    }
    if (typeof currentSchema.minItems !== 'undefined' && value.length < currentSchema.minItems) {
      return { succeed: false, value: null, errorMessage: `This property must have ${currentSchema.minItems} items minimum`};
    }
    if (typeof currentSchema.maxItems !== 'undefined' && value.length > currentSchema.maxItems) {
      return { succeed: false, value: null, errorMessage: `This property can have ${currentSchema.maxItems} items maximum`};
    }

    const values = value.map((item, i) => validateAndParseValueAgainstSchemaSafely(`${name}.${i}`, item, currentSchema.items, schemas))
    const everyItemIsGood = values.every(value => value.succeed)
    return everyItemIsGood ? { succeed: true, value: values.map(({value}) => value), errorMessage: null}: { succeed: false, value: null, errorMessage: values.filter(value => value.succeed === false).at(0)?.errorMessage ?? ''}
  }
  // Object
  if (currentSchema.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value) === true) {
      return { succeed: false, value: null, errorMessage: 'This property must be an object' }
    }
    const filteredProperties = Object.keys(currentSchema.properties || {})
      .filter((propName) => { // Ignore readOnly properties
        const val = currentSchema.properties![propName]
        return !('readOnly' in val) || val.readOnly !== true
      })
      .reduce((props, propName) => {
        const propValue = (value as Record<string, unknown>)[propName]
        const isNotDefined = typeof propValue === 'undefined'
        const propSchema = currentSchema.properties![propName]
        const isAnyValue = '$ref' in propSchema && propSchema.$ref === '#/components/schemas/AnyValue'
        if (currentSchema.required?.includes(propName) && (isNotDefined === true && isAnyValue === false)) {
      return { succeed: false, value: null, errorMessage: `Property ${propName} is required` }
        }
        if (isNotDefined === false) {
          props[propName] = validateAndParseValueAgainstSchema(
            `${name}.${propName}`,
            propValue,
            currentSchema.properties![propName],
            schemas
          )
        } else {
          const propertySchema = getFromRef(currentSchema.properties![propName], schemas)
          if (propertySchema.default) {
            props[propName] = propertySchema.default
          }
        }
        return props
      }, {} as Record<string, unknown>)
    // Validate remaining keys with additionalProperties if present
    if (currentSchema.additionalProperties && typeof currentSchema.additionalProperties !== 'boolean') {
      const filteredKeys = Object.keys(filteredProperties)
      const keys = Object.keys(value).filter(key => filteredKeys.includes(key) === false)

      const data = Object.assign(filteredProperties, keys.reduce<Record<string, unknown>>((props, propName) => {
        const propValue = (value as Record<string, unknown>)[propName]

        if (typeof propValue !== 'undefined') {
          props[propName] = validateAndParseValueAgainstSchema(
            `${name}.${propName}`,
            propValue,
            currentSchema.additionalProperties as any,
            schemas
          )
        }
        return props
      }, {} satisfies Record<string, unknown>))

      return {succeed: true, value: data, errorMessage: null}
    }
    return {succeed: true, value: filteredProperties, errorMessage: null}
  }
  // AllOf
  if (currentSchema.allOf) {
    // try to validate every allOf and merge their results
    const schemasValues = currentSchema.allOf.map((schema, i) => {
      return validateAndParseValueAgainstSchema(
        `${name}.${i}`,
        value,
        schema,
        schemas
      )
    })
    if (schemasValues.length === 1) {
      return { succeed: true, value: schemasValues[0], errorMessage: null }
    }
    return Object.assign({}, ...schemasValues)
  }
  // OneOf
  if (currentSchema.oneOf) {
    let matchingValue: unknown | undefined
    currentSchema.oneOf.forEach((schema, i) => {
      try {

        const parsedValue = validateAndParseValueAgainstSchema(
          `${name}.${i}`,
          value,
          schema,
          schemas
        )
        // set as matching value if we haven't found one
        if (typeof matchingValue === 'undefined') {
          matchingValue = parsedValue
          return
        }
        // replace matched value if the new one have more keys
        if (
          typeof matchingValue === 'object' && matchingValue !== null &&
          typeof parsedValue === 'object' && parsedValue !== null &&
          Object.keys(parsedValue).length > Object.keys(matchingValue).length
        ) {
          matchingValue = parsedValue
        }
      } catch {
        // noop, try another schema
      }
    })
    if (typeof matchingValue === 'undefined') {
      return { succeed: false, value: null, errorMessage: 'Found no matching schema for provided value' }
    }
    return { succeed: true, value: matchingValue, errorMessage: null }
  }
  log(`Schema of ${name} is not yet supported, skipping value validation`)
  return { succeed: true, value, errorMessage: null }
}

function validateAndParseFormat (name: string, value: string, format: string) {
  if (format === 'date' || format === 'date-time') {
    const date = new Date(value)
    if (String(date) === 'Invalid Date') {
      throw new ValidateError({
        [name]: { message: 'This property must be a valid date', value }
      }, 'Invalid parameter')
    }
    return date
  }
  log(`Format '${format}' is not yet supported, value is returned without additionnal parsing`)
  return value
}

function validateAndParseFormatSafely (_: unknown, value: string, format: string): SafeValidatedValue {
  if (format === 'date' || format === 'date-time') {
    const date = new Date(value)
    if (String(date) === 'Invalid Date') {
      return { succeed: false, value: null, errorMessage: 'This property must be a valid date' }
    }
    return { succeed: true, value: date, errorMessage: null }
  }
  log(`Format '${format}' is not yet supported, value is returned without additionnal parsing`)
  return { succeed: true, value, errorMessage: null }
}

function validateAndParsePattern (name: string, value: string, pattern: string) {
  const regex = new RegExp(pattern)
  if (!regex.test(value)) {
    throw new ValidateError({
      [name]: { message: `This property must match the pattern: ${regex}`, value }
    }, 'Invalid parameter')
  }
  return value
}
