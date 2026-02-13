import * as path from 'path'
import { OpenAPIV3 } from 'openapi-types'
import {
  ArrayLiteralExpression,
  ClassDeclaration,
  LiteralExpression,
  PropertyAssignment,
  Node,
  FunctionDeclaration,
  VariableDeclaration,
  Identifier,
  MethodDeclaration,
  ParameterDeclaration,
  CallExpression
} from 'ts-morph'
import {
  appendToSpec,
  extractDecoratorValues,
  extractFunctionArguments,
  normalizeUrl,
  getLiteralFromType,
  getRelativeFilePath
} from './utils'
import {
  resolve,
  appendJsDocTags,
  appendInitializer,
  appendMetaToResolvedType
} from './resolve'
import { CodeGenControllers } from './types'
import { OpenAPIConfiguration } from './'
import { options } from './option'

const VERB_DECORATORS = ['Get', 'Post', 'Put', 'Delete', 'Patch']
const PARAMETER_DECORATORS = ['Query', 'Body', 'Path', 'Header', 'Request']
const MIDDLEWARE_DECORATOR = 'Middleware'
const RESPONSE_DECORATOR = 'Response'
const PRODUCES_DECORATOR = 'Produces'

export function addController(
  controller: ClassDeclaration,
  spec: OpenAPIV3.Document,
  codegenControllers: CodeGenControllers,
  config: OpenAPIConfiguration['router']
): void {
  const logger = options.getCustomLogger()
  logger.debug(`Handle ${controller.getName()} controller`)

  const routeDecorator = controller.getDecoratorOrThrow('Route')
  const controllerEndpoint = extractDecoratorValues(routeDecorator)[0]
  const controllerName = controller.getName()!
  const methods = controller.getMethods()
  const controllerTags = extractDecoratorValues(controller.getDecorator('Tags'))
  const controllerSecurities = getSecurities(controller)
  const controllerMiddlewares = getMiddlewares(controller)
  const controllerResponses = getResponses(controller, spec)
  for (const method of methods) {
    logger.debug(`Handle ${controllerName}.${method.getName()} method`)

    const jsDocTags = method
      .getJsDocs()
      .map(doc => doc.getTags())
      .flat()
    const summaryTag = jsDocTags.find(tag => tag.getTagName() === 'summary')
    const descriptionTag = jsDocTags.find(
      tag => tag.getTagName() === 'description'
    )
    const operation: OpenAPIV3.OperationObject = {
      summary: summaryTag?.getCommentText(),
      description: descriptionTag?.getCommentText(),
      parameters: [],
      responses: {},
      tags: [...controllerTags] // copy elements
    }

    // Get middlewares (combine controller and method level)
    const methodMiddlewares = getMiddlewares(method)
    const middlewares = [...controllerMiddlewares, ...methodMiddlewares].map(
      middleware => ({
        ...middleware,
        relativePath: getRelativeFilePath(
          path.dirname(config.filePath),
          middleware.path
        )
      })
    )

    // Get content type from @Produces decorator
    const producesDecorator =
      method.getDecorator(PRODUCES_DECORATOR) ||
      controller.getDecorator(PRODUCES_DECORATOR)
    const contentType = producesDecorator
      ? extractDecoratorValues(producesDecorator)[0]
      : 'application/json'

    // Get HTTP verbs
    const verbDecorators = method.getDecorators().filter(decorator => {
      return VERB_DECORATORS.includes(decorator.getName())
    })
    if (verbDecorators.length === 0) {
      logger.trace(
        `Found no HTTP verbs for ${controller.getName()}.${method.getName()} method, skipping`
      )
      continue // skip
    }
    let hasSuccessResponse = false
    const returnType = method.getReturnType()

    // Check method-level responses
    const methodResponses = method
      .getDecorators()
      .filter(decorator => decorator.getName() === RESPONSE_DECORATOR)
    const methodResponsesMap = new Map<
      string,
      {
        description?: string
        schema?: any
      }
    >()

    // Process method-level responses
    for (const responseDecorator of methodResponses) {
      const [httpCode, description] = extractDecoratorValues(responseDecorator)
      const typeArguments = responseDecorator.getTypeArguments()
      if (typeArguments.length > 0) {
        const type = typeArguments[0].getType()
        methodResponsesMap.set(httpCode, {
          description: description ?? '',
          schema: resolve(type, spec)
        })
      } else {
        methodResponsesMap.set(httpCode, {
          description: description ?? ''
        })
      }
      if (parseInt(httpCode, 10) >= 200 && parseInt(httpCode, 10) <= 299) {
        hasSuccessResponse = true
      }
    }

    // Merge controller and method responses (method takes precedence)
    // First add controller-level responses that aren't overridden by the method
    for (const [httpCode, response] of Object.entries(controllerResponses)) {
      if (!methodResponsesMap.has(httpCode)) {
        operation.responses![httpCode] = response
        if (parseInt(httpCode, 10) >= 200 && parseInt(httpCode, 10) <= 299) {
          hasSuccessResponse = true
        }
      }
    }

    // Then add method-level responses
    for (const [httpCode, response] of methodResponsesMap.entries()) {
      if (response.schema) {
        operation.responses![httpCode] = {
          description: response.description ?? '',
          content: {
            [contentType]: {
              schema: response.schema
            }
          }
        }
      } else {
        operation.responses![httpCode] = {
          description: response.description ?? ''
        }
      }
    }
    // Add default success response
    if (!hasSuccessResponse) {
      if (
        returnType.isUndefined() ||
        returnType.getText() === 'void' ||
        returnType.getText() === 'Promise<void>'
      ) {
        operation.responses![204] = {
          description: 'No Content'
        }
      } else {
        operation.responses![200] = {
          description: 'Ok',
          content: {
            [contentType]: {
              schema: resolve(returnType, spec)
            }
          }
        }
      }
    }
    // We use another array for codegen parameters instead of operation.parameters
    // because we want to have Request() and Body() in the codegen one
    // to send it to the method at runtime
    const codegenParameters: OpenAPIV3.OperationObject['parameters'] = []

    // Get parameters
    const params = method.getParameters()
    for (const parameter of params) {
      const decorator = parameter.getDecorators().find(decorator => {
        return PARAMETER_DECORATORS.includes(decorator.getName())
      })
      if (typeof decorator === 'undefined') {
        throw new Error(
          `Parameter ${controller.getName()}.${method.getName()}.${parameter.getName()} must have a decorator.`
        )
      }
      if (decorator.getName() === 'Body') {
        codegenParameters.push({ name: 'body', in: 'body' })
        continue // skip, will be handled below
      }
      if (decorator.getName() === 'Request') {
        codegenParameters.push({
          name: 'request',
          in: 'request'
        })
        continue // skip, only for router codegen
      }
      const node = decorator.getParent() as ParameterDeclaration
      const type = node.getType()

      const isOptional = node.hasQuestionToken() || node.isOptional()
      let required = !isOptional

      const schema = resolve(
        type,
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
      // Default value
      if (appendInitializer(node, schema)) {
        required = false
      }
      // JSDoc tags
      appendJsDocTags(
        node.getSymbol()?.compilerSymbol.getJsDocTags() ?? [],
        schema
      )
      const generatedParameter = {
        name: extractDecoratorValues(decorator)[0],
        in: decorator.getName().toLowerCase(),
        schema,
        required
      }
      operation.parameters!.push(generatedParameter)
      codegenParameters.push(generatedParameter)
    }

    // Handle body
    const bodyParameters = method
      .getParameters()
      .filter(param => param.getDecorator('Body'))
      .map(param => ({
        decorator: param.getDecoratorOrThrow('Body'),
        param
      }))
    let bodyRequired = true
    if (bodyParameters.length > 0) {
      operation.requestBody = {
        required: bodyRequired, // Will be updated below if body is nullable/optional
        content: {}
      }
    }
    let codegenBodyDiscriminator: { path: string; name: string } | undefined
    for (const { decorator, param } of bodyParameters) {
      let contentType: string = 'application/json'
      const bodyArguments = decorator.getArguments()
      const firstArgumentType = bodyArguments[0]?.getType()
      if (firstArgumentType && firstArgumentType.compilerType.isLiteral()) {
        contentType = String(firstArgumentType.compilerType.value)
      }
      // Check if body parameter is optional or nullable
      const isOptional = param.hasQuestionToken() || param.isOptional()
      bodyRequired = !isOptional
      const bodySchema = resolve(
        param.getType(),
        spec,
        (nonNullableType, isUndefined, isNull, spec) => {
          if (isUndefined) {
            bodyRequired = false
          }
          if (isNull) {
            return appendMetaToResolvedType(resolve(nonNullableType, spec), {
              nullable: true
            })
          }
          return resolve(nonNullableType, spec)
        }
      )
      ;(
        operation.requestBody as Extract<
          typeof operation.requestBody,
          { content: any }
        >
      ).content[contentType] = {
        schema: bodySchema
      }
      // Update requestBody.required based on nullability
      ;(operation.requestBody as { required?: boolean }).required = bodyRequired
      // Handle discriminator
      // We find the function in the 2nd arg of Body() to be able to
      // import it and call it at runtime to decide which schema we want to validate against
      if (bodyArguments[1]) {
        const node = bodyArguments[1]
        if (!Node.isIdentifier(node)) {
          throw new Error(
            `The 2nd argument of @Body() decorator must be the name of a function`
          )
        }
        codegenBodyDiscriminator = findDiscriminatorFunction(node)
      }
    }

    // Handle tags
    operation.tags!.push(...extractDecoratorValues(method.getDecorator('Tags')))

    // Security
    operation.security = [...controllerSecurities, ...getSecurities(method)]
    // OperationId
    if (method.getDecorator('OperationId')) {
      operation.operationId = extractDecoratorValues(
        method.getDecorator('OperationId')
      )[0]
    } else {
      const name = method.getName()
      operation.operationId = name.charAt(0).toUpperCase() + name.slice(1)
    }
    // Deprecated
    if (method.getDecorator('Deprecated')) {
      operation.deprecated = true
    }
    // Add to spec + codegen
    const isHidden =
      typeof (
        method.getDecorator('Hidden') || controller.getDecorator('Hidden')
      ) !== 'undefined'
    for (const decorator of verbDecorators) {
      const decoratorArgs = decorator.getArguments()
      const path =
        decoratorArgs.length > 0
          ? getLiteralFromType(decoratorArgs[0].getType())
          : undefined
      const tags: string[] = []
      let operationId = operation.operationId
      for (const arg of decoratorArgs.slice(1)) {
        const fn = arg as CallExpression
        const args = fn
          .getArguments()
          .map(arg => getLiteralFromType(arg.getType()))
        if (fn.getText().startsWith('OperationId')) {
          operationId = args[0]
        } else if (fn.getText().startsWith('Tags')) {
          tags.push(...args)
        }
      }
      const endpoint = normalizeUrl(
        (controllerEndpoint || '/') + '/' + (path || '/')
      )
      const verb = decorator.getName()
      // OpenAPI
      if (isHidden === false) {
        logger.debug(
          `Adding '${verb} ${endpoint}' for ${controllerName}.${method.getName()} method to spec`
        )

        appendToSpec(
          spec,
          endpoint
            .split('/')
            // Remove regex from express paths /foo/{id([A-Z]+)} => /foo/{id}
            .map(path =>
              path.replace(
                /{([A-Za-z0-9-_]+)\(.+\)}/g,
                (match, captureGroup) => {
                  return `{${captureGroup}}`
                }
              )
            )
            .join('/'),
          verb.toLowerCase() as any,
          Object.assign({}, operation, {
            tags: [...(operation.tags ?? []), ...tags],
            operationId
          })
        )
      }
      // Codegen
      if (typeof codegenControllers[controllerName] === 'undefined') {
        codegenControllers[controllerName] = []
      }
      codegenControllers[controllerName].push({
        name: method.getName(),
        endpoint: endpoint
          .split('/')
          // replace as express format
          .map(path => path.replace(/{(.+)}/g, (matches, match) => `:${match}`))
          .join('/'),
        verb: verb.toLowerCase(),
        security: operation.security,
        params: codegenParameters,
        body: operation.requestBody,
        bodyDiscriminator: codegenBodyDiscriminator,
        responses: operation.responses,
        validateResponse: config.validateResponse ?? false,
        middlewares: middlewares.length > 0 ? middlewares : undefined,
        contentType
      })
    }
  }
}

function getSecurities(declaration: ClassDeclaration | MethodDeclaration) {
  const security: OpenAPIV3.SecurityRequirementObject[] = []
  const securityDecorators = declaration
    .getDecorators()
    .filter(decorator => decorator.getName() === 'Security')
  if (securityDecorators.length > 0) {
    for (const securityDecorator of securityDecorators) {
      const securities = securityDecorator.getArguments()[0].getType()
      security.push(
        securities.getProperties().reduce((properties, property) => {
          const firstDeclaration =
            property.getDeclarations()[0] as PropertyAssignment
          const initializer =
            firstDeclaration.getInitializer() as ArrayLiteralExpression
          const elements = initializer.getElements() as LiteralExpression[]
          properties[property.getName()] = elements.map(element =>
            element.getLiteralText()
          )
          return properties
        }, {} as OpenAPIV3.SecurityRequirementObject)
      )
    }
  }
  return security
}

function getMiddlewares(
  declaration: ClassDeclaration | MethodDeclaration
): { name: string; path: string }[] {
  const middlewareDecorators = declaration
    .getDecorators()
    .filter(decorator => decorator.getName() === MIDDLEWARE_DECORATOR)
  return middlewareDecorators.flatMap(decorator =>
    extractFunctionArguments(decorator)
  )
}

function getResponses(
  declaration: ClassDeclaration,
  spec: OpenAPIV3.Document
): Record<string, OpenAPIV3.ResponseObject> {
  const responses: Record<string, OpenAPIV3.ResponseObject> = {}
  const responseDecorators = declaration
    .getDecorators()
    .filter(decorator => decorator.getName() === RESPONSE_DECORATOR)
  const producesDecorator = declaration.getDecorator(PRODUCES_DECORATOR)
  const contentType = producesDecorator
    ? extractDecoratorValues(producesDecorator)[0]
    : 'application/json'

  for (const responseDecorator of responseDecorators) {
    const [httpCode, description] = extractDecoratorValues(responseDecorator)
    const typeArguments = responseDecorator.getTypeArguments()
    if (typeArguments.length > 0) {
      const type = typeArguments[0].getType()
      responses[httpCode] = {
        description: description ?? '',
        content: {
          [contentType]: {
            schema: resolve(type, spec)
          }
        }
      }
    } else {
      responses[httpCode] = {
        description: description ?? ''
      }
    }
  }

  return responses
}

function findDiscriminatorFunction(node: Identifier): {
  path: string
  name: string
} {
  const functionName = node.compilerNode.escapedText.toString()
  const sourceFiles = node.getProject().getSourceFiles()
  let discriminatorFunction:
    | FunctionDeclaration
    | VariableDeclaration
    | undefined
  const foundFunctions = sourceFiles
    .map(source => source.getFunction(functionName))
    .filter(val => typeof val !== 'undefined')
  const foundVariables = sourceFiles
    .map(source => source.getVariableDeclaration(functionName))
    .filter(val => typeof val !== 'undefined')
  if (foundFunctions.length + foundVariables.length > 1) {
    throw new Error(
      `The 2nd argument of @Body() decorator must be the name of a function defined only once`
    )
  }
  // eslint-disable-next-line prefer-const
  discriminatorFunction = foundFunctions[0] ?? foundVariables[0]
  if (typeof discriminatorFunction === 'undefined') {
    throw new Error(
      `The 2nd argument of @Body() decorator must be the name of a function defined in source files`
    )
  }
  if (discriminatorFunction.isExported() === false) {
    throw new Error(
      `The 2nd argument of @Body() decorator must be the name of an exported function`
    )
  }
  const path = discriminatorFunction.getSourceFile().getFilePath().toString()
  return { path, name: functionName }
}
