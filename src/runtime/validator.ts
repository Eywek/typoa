import express from 'express'
import { OpenAPIV3 } from 'openapi-types'
import { buildRef } from '../resolve'
import { BodyDiscriminatorFunction } from './decorators'
import { options } from '../option'
import { CustomLogger } from '../logger'

const { features } = options

type ValidationErrorDetail = { errorMessage: string; fieldName: string }
export class ValidateError extends Error {
  public status = 400
  public name = 'ValidateError'

  constructor(
    public fields: Record<
      string,
      {
        message: string
        value?: any
        details?: Array<ValidationErrorDetail>
      }
    >,
    public message: string
  ) {
    super(message)
  }
}

export async function validateAndParse(
  req: express.Request,
  schemas: OpenAPIV3.ComponentsObject['schemas'],
  rules: {
    params: OpenAPIV3.ParameterObject[]
    body?: OpenAPIV3.RequestBodyObject
    bodyDiscriminatorFn?: BodyDiscriminatorFunction
  }
): Promise<any[]> {
  const logger = options.getCustomLogger()

  const args: any[] = []
  for (const param of rules.params || []) {
    // Handling @Request()
    if (param.in === 'request') {
      args.push(req)
      continue
    }
    // Handling body
    if (param.in === 'body') {
      args.push(
        await validateBody(
          req,
          rules.body!,
          rules.bodyDiscriminatorFn,
          schemas,
          logger
        )
      )
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
        if (
          'type' in schema &&
          schema.type === 'boolean' &&
          value?.length === 0
        ) {
          value = 'true' // allow empty values for param boolean
        }
        if (
          'type' in schema &&
          schema.type === 'array' &&
          typeof value === 'string'
        ) {
          value = [value]
        }
        break
      case 'path':
        value = req.params[param.name]
        break
    }
    const isUndefined = typeof value === 'undefined'
    if (param.required === true && isUndefined) {
      throw new ValidateError(
        {
          [param.name]: {
            message: 'Param is required',
            value
          }
        },
        'Missing parameter'
      )
    }
    // Don't validate
    if (isUndefined) {
      args.push(undefined)
      continue
    }
    const validationResponse = validateAndParseValueAgainstSchema(
      param.name,
      value,
      param.schema!,
      schemas,
      'unknown',
      logger
    )
    if (!validationResponse.succeed) {
      throw new ValidateError(
        {
          [param.name]: {
            message: validationResponse.errorMessage,
            value,
            details: validationResponse.details
          }
        },
        'Missing parameter'
      )
    }
    args.push(validationResponse.value)
  }
  return args
}

export function validateAndParseResponse(
  data: unknown,
  schemas: OpenAPIV3.ComponentsObject['schemas'],
  rules: Record<string, OpenAPIV3.ResponseObject>,
  statusCode: string,
  contentType: string
): unknown {
  const logger = options.getCustomLogger()
  try {
    const rule = rules[statusCode] ?? rules.default
    if (!rule)
      throw new ValidateError(
        {
          response: {
            message: `Missing response schema for status code ${statusCode}`
          }
        },
        'Invalid status code'
      )
    const expectedSchema = rule.content?.[contentType]?.schema
    if (typeof expectedSchema === 'undefined') {
      if (typeof data === 'undefined' || data === null) {
        return data
      }
      logger.error(`Schema is not found for '${contentType}', throwing error`)
      throw new ValidateError({}, 'This content-type is not allowed')
    }
    const ValidationResponse = validateAndParseValueAgainstSchema(
      'response',
      data,
      expectedSchema,
      schemas,
      'unknown',
      logger
    )
    if (!ValidationResponse.succeed) {
      throw new ValidateError(
        { response: { message: ValidationResponse.errorMessage } },
        'Invalid response'
      )
    }
    return ValidationResponse.value
  } catch (e) {
    if (e instanceof ValidateError) {
      // validation error on the result is a server, not client error
      e.status = 500
    }
    throw e
  }
}

async function validateBody(
  req: express.Request,
  rule: OpenAPIV3.RequestBodyObject,
  discriminatorFn: BodyDiscriminatorFunction | undefined,
  schemas: OpenAPIV3.ComponentsObject['schemas'],
  logger: CustomLogger
): Promise<unknown> {
  const body = req.body
  const contentType = (req.headers['content-type'] ?? 'application/json').split(
    ';'
  )[0]
  const expectedSchema = rule.content[contentType]?.schema
  if (typeof expectedSchema === 'undefined') {
    logger.error(`Schema is not found for '${contentType}', throwing error`)
    throw new ValidateError({}, 'This content-type is not allowed')
  }
  if (req.readableEnded === false) {
    logger.warn(`! Warning: Body has not be parsed, body validation skipped !`)
    return body
  }
  if (discriminatorFn) {
    const schemaName = await discriminatorFn(req)
    const validationResult = validateAndParseValueAgainstSchema(
      'body',
      body,
      { $ref: buildRef(schemaName) },
      schemas,
      'unknown',
      logger
    )
    if (validationResult.succeed) {
      return validationResult.value
    }
    // Extract the failing value from the body based on the field path
    const fieldPath = validationResult.fieldName || 'body'
    const failingValue =
      fieldPath === 'body'
        ? body
        : getNestedValue(body, fieldPath.replace('body.', ''))
    const errorField: {
      message: string
      value?: any
      details: Array<ValidationErrorDetail>
    } = {
      message: validationResult.errorMessage,
      details: validationResult.details ?? []
    }
    if (failingValue !== null && failingValue !== undefined) {
      errorField.value = failingValue
    }
    throw new ValidateError(
      {
        [fieldPath]: errorField
      },
      validationResult.errorMessage
    )
  }
  const validationResult = validateAndParseValueAgainstSchema(
    'body',
    body,
    expectedSchema,
    schemas,
    'unknown',
    logger
  )
  if (validationResult.succeed) {
    return validationResult.value
  }
  const fieldPath = validationResult.fieldName || 'body'
  const failingValue =
    fieldPath === 'body'
      ? body
      : getNestedValue(body, fieldPath.replace('body.', ''))
  const errorField: {
    message: string
    value?: any
    details: Array<ValidationErrorDetail>
  } = {
    message: validationResult.errorMessage,
    details: validationResult.details ?? []
  }
  if (failingValue !== null && failingValue !== undefined) {
    errorField.value = failingValue
  }
  throw new ValidateError(
    {
      [fieldPath]: errorField
    },
    validationResult.errorMessage
  )
}

function getFromRef(
  schema:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.ArraySchemaObject
    | OpenAPIV3.NonArraySchemaObject,
  schemas: OpenAPIV3.ComponentsObject['schemas']
): OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject {
  if ('$ref' in schema) {
    const schemaName =
      schemas![schema.$ref.substr('#/components/schemas/'.length)]
    if (typeof schemaName === 'undefined') {
      throw new Error(`Schema '${schema.$ref}' not found`)
    }
    return getFromRef(schemaName, schemas)
  }
  return schema
}

function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined
    }
    // Handle array indices
    if (/^\d+$/.test(part)) {
      current = current[parseInt(part, 10)]
    } else {
      current = current[part]
    }
  }
  return current
}

type SafeValidatedValue =
  | {
      succeed: false
      value?: unknown
      errorMessage: string
      fieldName: string
      details?: Array<ValidationErrorDetail>
    }
  | { succeed: true; value: unknown }
function validateAndParseValueAgainstSchema(
  name: string,
  value: unknown,
  schema:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.ArraySchemaObject
    | OpenAPIV3.NonArraySchemaObject,
  schemas: OpenAPIV3.ComponentsObject['schemas'],
  parentType: 'allOf' | 'oneOf' | 'array' | 'object' | 'unknown',
  logger: CustomLogger
): SafeValidatedValue {
  const currentSchema = getFromRef(schema, schemas)
  // Nullable
  if (value === null) {
    if (currentSchema.nullable) {
      return { succeed: true, value: currentSchema.default }
    }
    return {
      succeed: false,
      errorMessage: `This property is not nullable`,
      fieldName: name
    }
  }
  // Strings
  if (currentSchema.type === 'string') {
    // Special case for date format
    if (value instanceof Date && currentSchema.format === 'date-time') {
      return { succeed: true, value }
    }
    // Special case for binary format
    if (currentSchema.format === 'binary' && Buffer.isBuffer(value)) {
      return { succeed: true, value }
    }
    if (typeof value !== 'string') {
      return {
        succeed: false,
        errorMessage: `This property must be a string`,
        fieldName: name
      }
    }
    if (
      typeof currentSchema.minLength !== 'undefined' &&
      value.length < currentSchema.minLength
    ) {
      return {
        succeed: false,
        errorMessage: `This property must have ${currentSchema.minLength} characters minimum`,
        fieldName: name
      }
    }
    if (
      typeof currentSchema.maxLength !== 'undefined' &&
      value.length > currentSchema.maxLength
    ) {
      return {
        succeed: false,
        errorMessage: `This property can have ${currentSchema.maxLength} characters maximum`,
        fieldName: name
      }
    }
    if (currentSchema.enum && currentSchema.enum.includes(value) === false) {
      return {
        succeed: false,
        errorMessage: `This property must be one of ${currentSchema.enum}`,
        fieldName: name,
        value
      }
    }
    if (currentSchema.pattern) {
      const patternResult = validateAndParsePattern(
        name,
        value,
        currentSchema.pattern
      )
      if (!patternResult.succeed) {
        return {
          succeed: false,
          errorMessage: patternResult.errorMessage,
          fieldName: name
        }
      }
    }
    if (currentSchema.format) {
      const formatResult = validateAndParseFormat(
        name,
        value,
        currentSchema.format,
        logger
      )
      if (!formatResult.succeed) {
        return {
          succeed: false,
          errorMessage: formatResult.errorMessage,
          fieldName: name
        }
      }
    }
    return { succeed: true, value }
  }
  // Numbers
  if (currentSchema.type === 'number') {
    // Note: in body we don't want to parseFloat() because fields should
    // already be parsed. And we don't want to transform a field with type string | number
    // into a number if it's a string in the body
    const isInBody = name === 'body' || name.startsWith('body.')
    const parsedValue = isInBody ? (value as number) : parseFloat(String(value))
    if (isNaN(parsedValue)) {
      return {
        succeed: false,
        errorMessage: 'This property must be a number',
        fieldName: name
      }
    }
    if (typeof currentSchema.minimum !== 'undefined') {
      if (parsedValue < currentSchema.minimum) {
        return {
          succeed: false,
          errorMessage: `This property must be >= ${currentSchema.minimum}`,
          fieldName: name
        }
      }
    }
    if (typeof currentSchema.maximum !== 'undefined') {
      if (parsedValue > currentSchema.maximum) {
        return {
          succeed: false,
          errorMessage: `This property must be <= ${currentSchema.maximum}`,
          fieldName: name
        }
      }
    }
    if (
      currentSchema.enum &&
      currentSchema.enum.includes(parsedValue) === false
    ) {
      return {
        succeed: false,
        errorMessage: `This property must be one of ${currentSchema.enum}`,
        fieldName: name,
        value
      }
    }
    return { succeed: true, value: parsedValue }
  }
  // Boolean
  if (currentSchema.type === 'boolean') {
    const parsedValue = String(value)
    if (['0', '1', 'false', 'true'].includes(parsedValue) === false) {
      return {
        succeed: false,
        errorMessage: 'This property must be a boolean',
        fieldName: name
      }
    }
    return {
      succeed: true,
      value: parsedValue === '1' || parsedValue === 'true'
    }
  }
  // Array
  if (currentSchema.type === 'array') {
    if (!Array.isArray(value)) {
      return {
        succeed: false,
        errorMessage: 'This property must be an array',
        fieldName: name
      }
    }
    if (
      typeof currentSchema.minItems !== 'undefined' &&
      value.length < currentSchema.minItems
    ) {
      return {
        succeed: false,
        errorMessage: `This property must have ${currentSchema.minItems} items minimum`,
        fieldName: name
      }
    }
    if (
      typeof currentSchema.maxItems !== 'undefined' &&
      value.length > currentSchema.maxItems
    ) {
      return {
        succeed: false,
        errorMessage: `This property can have ${currentSchema.maxItems} items maximum`,
        fieldName: name
      }
    }
    const values = value.map((item, i) =>
      validateAndParseValueAgainstSchema(
        `${name}.${i}`,
        item,
        currentSchema.items,
        schemas,
        'array',
        logger
      )
    )
    const everyItemIsGood = values.every(value => value.succeed)
    const firstFailure = values.find(value => value.succeed === false)
    return everyItemIsGood
      ? { succeed: true, value: values.map(({ value }) => value) }
      : {
          succeed: false,
          errorMessage: firstFailure?.errorMessage ?? '',
          fieldName: firstFailure?.fieldName ?? name
        }
  }
  // Object
  if (currentSchema.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value) === true) {
      return {
        succeed: false,
        errorMessage: 'This property must be an object',
        fieldName: name
      }
    }
    const filteredProperties: Record<string, unknown> = {}
    const propertyNames = Object.keys(currentSchema.properties || {}).filter(
      propName => {
        // Ignore readOnly properties
        const val = currentSchema.properties![propName]
        return !('readOnly' in val) || val.readOnly !== true
      }
    )

    for (const propName of propertyNames) {
      const propValue = (value as Record<string, unknown>)[propName]
      const isNotDefined = typeof propValue === 'undefined'
      const propSchema = currentSchema.properties![propName]
      const isAnyValue =
        '$ref' in propSchema &&
        propSchema.$ref === '#/components/schemas/AnyValue'
      if (
        currentSchema.required?.includes(propName) &&
        isNotDefined === true &&
        isAnyValue === false
      ) {
        return {
          succeed: false,
          errorMessage: `Property ${propName} is required`,
          fieldName: `${name}.${propName}`
        }
      }
      if (isNotDefined === false) {
        const validationResult = validateAndParseValueAgainstSchema(
          `${name}.${propName}`,
          propValue,
          currentSchema.properties![propName],
          schemas,
          'unknown',
          logger
        )
        if (!validationResult.succeed) {
          return validationResult
        }
        filteredProperties[propName] = validationResult.value
      } else {
        const propertySchema = getFromRef(
          currentSchema.properties![propName],
          schemas
        )
        if (propertySchema.default) {
          filteredProperties[propName] = propertySchema.default
        }
      }
    }

    // Check for additional properties
    // Compare against schema property names (excluding readOnly) to identify additional keys
    const additionalKeys = Object.keys(value).filter(
      key => propertyNames.includes(key) === false
    )
    if (
      parentType !== 'allOf' &&
      (features?.enableThrowOnUnexpectedAdditionalData ||
        features?.enableLogUnexpectedAdditionalData) &&
      currentSchema.additionalProperties === false
    ) {
      if (additionalKeys.length > 0) {
        if (features.enableLogUnexpectedAdditionalData) {
          logger.warn(
            `Additional properties are not allowed. Found: ${additionalKeys.join(', ')}`
          )
        }
        if (features.enableThrowOnUnexpectedAdditionalData) {
          return {
            succeed: false,
            errorMessage: `Additional properties are not allowed. Found: ${additionalKeys.join(', ')}`,
            fieldName: name
          }
        }
      }
    } else if (
      features?.enableThrowOnUnexpectedAdditionalData &&
      currentSchema.additionalProperties === true
    ) {
      for (const propName of additionalKeys) {
        const propValue = (value as Record<string, unknown>)[propName]
        if (typeof propValue !== 'undefined') {
          filteredProperties[propName] = propValue
        }
      }
    } else if (
      currentSchema.additionalProperties &&
      typeof currentSchema.additionalProperties !== 'boolean'
    ) {
      // additionalProperties is a schema object - validate against it
      for (const propName of additionalKeys) {
        const propValue = (value as Record<string, unknown>)[propName]
        if (typeof propValue !== 'undefined') {
          const validationResult = validateAndParseValueAgainstSchema(
            `${name}.${propName}`,
            propValue,
            currentSchema.additionalProperties as any,
            schemas,
            'unknown',
            logger
          )
          if (!validationResult.succeed) {
            return validationResult
          }
          filteredProperties[propName] = validationResult.value
        }
      }
    } else {
      if (
        parentType !== 'allOf' &&
        (features?.enableThrowOnUnexpectedAdditionalData ||
          features?.enableLogUnexpectedAdditionalData) &&
        additionalKeys.length > 0
      ) {
        if (features.enableLogUnexpectedAdditionalData) {
          logger.warn(
            `Additional properties are not allowed. Found: ${additionalKeys.join(', ')}`
          )
        }
        if (features.enableThrowOnUnexpectedAdditionalData) {
          return {
            succeed: false,
            errorMessage: `Additional properties are not allowed. Found: ${additionalKeys.join(', ')}`,
            fieldName: name
          }
        }
      }
    }
    return { succeed: true, value: filteredProperties }
  }
  // AllOf
  if (currentSchema.allOf) {
    // try to validate every allOf and merge their results
    const schemasValues = currentSchema.allOf.map((schema, i) =>
      validateAndParseValueAgainstSchema(
        `${name}.${i}`,
        value,
        schema,
        schemas,
        'allOf',
        logger
      )
    )

    // Check for any failures first
    const firstFailure = schemasValues.find(v => !v.succeed)
    if (firstFailure) {
      return firstFailure
    }
    if (schemasValues.length === 1) {
      return schemasValues[0]
    }
    // All succeeded, merge values
    const mergedValue = Object.assign(
      {},
      ...schemasValues.map(v => v.value as Record<string, unknown>)
    )
    return { succeed: true, value: mergedValue }
  }
  // OneOf
  if (currentSchema.oneOf) {
    let matchingValue: unknown | undefined
    const details: Array<ValidationErrorDetail> = []

    currentSchema.oneOf.forEach((schema, i) => {
      const validationResult = validateAndParseValueAgainstSchema(
        `${name}.${i}`,
        value,
        schema,
        schemas,
        'oneOf',
        logger
      )
      if (validationResult.succeed) {
        // set as matching value if we haven't found one
        if (typeof matchingValue === 'undefined') {
          matchingValue = validationResult.value
          return
        }
        // replace matched value if the new one have more keys
        if (
          typeof matchingValue === 'object' &&
          matchingValue !== null &&
          typeof validationResult.value === 'object' &&
          validationResult.value !== null &&
          Object.keys(validationResult.value).length >
            Object.keys(matchingValue).length
        ) {
          matchingValue = validationResult.value
        }
      } else {
        details.push({
          errorMessage: validationResult.errorMessage,
          fieldName: validationResult.fieldName
        })
      }
    })
    if (typeof matchingValue === 'undefined') {
      return {
        succeed: false,
        errorMessage: 'Found no matching schema for provided value',
        fieldName: name,
        details
      }
    }
    return { succeed: true, value: matchingValue }
  }
  logger.warn(
    `Schema of ${name} is not yet supported, skipping value validation`
  )
  return { succeed: true, value }
}

function validateAndParseFormat(
  name: string,
  value: string,
  format: string,
  logger: CustomLogger
): SafeValidatedValue {
  if (format === 'date' || format === 'date-time') {
    const date = new Date(value)
    if (String(date) === 'Invalid Date') {
      return {
        succeed: false,
        errorMessage: 'This property must be a valid date',
        fieldName: name
      }
    }
    return { succeed: true, value: date }
  }
  logger.warn(
    `Format '${format}' is not yet supported, value is returned without additionnal parsing`
  )
  return { succeed: true, value }
}

function validateAndParsePattern(
  name: string,
  value: string,
  pattern: string
): SafeValidatedValue {
  const regex = new RegExp(pattern)
  if (!regex.test(value)) {
    return {
      succeed: false,
      errorMessage: `This property must match the pattern: ${regex}`,
      fieldName: name
    }
  }
  return { succeed: true, value }
}
