import { OpenAPIV3 } from 'openapi-types'
import { ArrayLiteralExpression, ClassDeclaration, LiteralExpression, PropertyAssignment, Node, FunctionDeclaration, VariableDeclaration, Identifier } from 'ts-morph'
import { appendToSpec, extractDecoratorValues, normalizeUrl } from './utils'
import { buildRef, resolve, stringifyName } from './resolve'
import debug from 'debug'
import { CodeGenControllers } from './types'

const log = debug('toag:controller')

const VERB_DECORATORS = ['Get', 'Post', 'Put', 'Delete', 'Patch']
const PARAMETER_DECORATORS = ['Query', 'Body', 'Path', 'Header', 'Request']

export function addController (
  controller: ClassDeclaration,
  spec: OpenAPIV3.Document,
  codegenControllers: CodeGenControllers
): void {
  log(`Handle ${controller.getName()} controller`)
  const routeDecorator = controller.getDecoratorOrThrow('Route')
  const controllerEndpoint = extractDecoratorValues(routeDecorator)[0]
  const controllerName = controller.getName()!
  const methods = controller.getMethods()
  const controllerTags = extractDecoratorValues(controller.getDecorator('Tags'))
  for (const method of methods) {
    log(`Handle ${controllerName}.${method.getName()} method`)
    const operation: OpenAPIV3.OperationObject = {
      parameters: [],
      responses: {},
      tags: [...controllerTags] // copy elements
    }

    // Get HTTP verbs
    const verbDecorators = method.getDecorators().filter((decorator) => {
      return VERB_DECORATORS.includes(decorator.getName())
    })
    if (verbDecorators.length === 0) {
      log(`Found no HTTP verbs for ${controller.getName()}.${method.getName()} method, skipping`)
      continue // skip
    }

    // Resolve response type
    const returnType = method.getReturnType()
    const returnTypeName = stringifyName(returnType.getText())
    operation.responses![200] = {
      description: 'Ok',
      content: {
        'application/json': {
          schema: { $ref: buildRef(returnTypeName) }
        }
      }
    }
    spec.components!.schemas![returnTypeName] = resolve(returnType, spec)

    // Other response
    const responses = method.getDecorators().filter(decorator => decorator.getName() === 'Response')
    for (const responseDecorator of responses) {
      const [ httpCode, description ] = extractDecoratorValues(responseDecorator)
      const typeArguments = responseDecorator.getTypeArguments()
      if (typeArguments.length > 0) {
        const type = typeArguments[0].getType()
        const typeName = stringifyName(type.getText())
        spec.components!.schemas![typeName] = resolve(type, spec)
        operation.responses![httpCode] = {
          description: description ?? '',
          content: {
            'application/json': {
              schema: { $ref: buildRef(typeName) }
            }
          }
        }
      } else {
        operation.responses![httpCode] = { description: description ?? '' }
      }
    }

    // We use another array for codegen parameters instead of operation.parameters
    // because we want to have Request() and Body() in the codegen one
    // to send it to the method at runtime
    const codegenParameters: OpenAPIV3.OperationObject['parameters'] = []

    // Get parameters
    const params = method.getParameters()
    for (const parameter of params) {
      const decorator = parameter.getDecorators().find((decorator) => {
        return PARAMETER_DECORATORS.includes(decorator.getName())
      })
      if (typeof decorator === 'undefined') {
        throw new Error(`Parameter ${controller.getName()}.${method.getName()}.${parameter.getName()} must have a decorator.`)
      }
      if (decorator.getName() === 'Body') {
        codegenParameters.push({ name: 'body', in: 'body' })
        continue // skip, will be handled below
      }
      if (decorator.getName() === 'Request') {
        codegenParameters.push({ name: 'request', in: 'request' })
        continue // skip, only for router codegen
      }
      let required = true
      const schema = resolve(decorator.getParent().getType(), spec, (type, isUndefined, spec) => {
        required = false
        return resolve(type, spec) // don't have `nullable` prop
      })
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
    const bodyParameter = method.getParameters().find(params => params.getDecorator('Body'))
    let codegenBodyDiscriminator: { path: string, name: string } | undefined
    if (bodyParameter) {
      let contentType: string = 'application/json'
      const bodyArguments = bodyParameter.getDecoratorOrThrow('Body').getArguments()
      const firstArgumentType = bodyArguments[0]?.getType()
      if (firstArgumentType && firstArgumentType.compilerType.isLiteral()) {
        contentType = String(firstArgumentType.compilerType.value)
      }
      operation.requestBody = {
        required: true,
        content: {
          [contentType]: {
            schema: resolve(bodyParameter.getType(), spec)
          }
        }
      }
      // Handle discriminator
      // We find the function in the 2nd arg of Body() to be able to
      // import it and call it at runtime to decide which schema we want to validate against
      if (bodyArguments[1]) {
        const node = bodyArguments[1]
        if (!Node.isIdentifier(node)) {
          throw new Error(`The 2nd argument of @Body() decorator must be the name of a function`)
        }
        codegenBodyDiscriminator = findDiscriminatorFunction(node)
      }
    }

    // Handle tags
    operation.tags!.push(...extractDecoratorValues(method.getDecorator('Tags')))

    // Security
    const securityDecorators = method.getDecorators().filter(decorator => decorator.getName() === 'Security')
    if (securityDecorators.length > 0) {
      operation.security = []
      for (const securityDecorator of securityDecorators) {
        const securities = securityDecorator.getArguments()[0].getType()
        operation.security.push(
          securities.getProperties().reduce((properties, property) => {
            const firstDeclaration = property.getDeclarations()[0] as PropertyAssignment
            const initializer = firstDeclaration.getInitializer() as ArrayLiteralExpression
            const elements = initializer.getElements() as LiteralExpression[]
            properties[property.getName()] = elements.map((element) => element.getLiteralText())
            return properties
          }, {} as OpenAPIV3.SecurityRequirementObject)
        )
      }
    }

    // Add to spec + codegen
    for (const decorator of verbDecorators) {
      const endpoint = normalizeUrl((controllerEndpoint || '/') + (extractDecoratorValues(decorator)[0] || '/'))
      const verb = decorator.getName()
      // OpenAPI
      log(`Adding '${verb} ${endpoint}' for ${controllerName}.${method.getName()} method to spec`)
      appendToSpec(
        spec,
        endpoint
          .split('/')
          // Remove regex from express paths /foo/{id([A-Z]+)} => /foo/{id}
          .map(path => path.replace(/{([A-Za-z0-9-_]+)\(.+\)}/g, (match, captureGroup) => {
            return `{${captureGroup}}`
          }))
          .join('/'),
        verb.toLowerCase() as any, operation
      )
      // Codegen
      // tslint:disable-next-line: strict-type-predicates
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
        bodyDiscriminator: codegenBodyDiscriminator
      })
    }
  }
}

function findDiscriminatorFunction (node: Identifier): { path: string, name: string } {
  const functionName = node.compilerNode.escapedText.toString()
  const sourceFiles = node.getProject().getSourceFiles()
  let discriminatorFunction: FunctionDeclaration | VariableDeclaration | undefined
  const foundFunctions = sourceFiles
    .map(source => source.getFunction(functionName))
    .filter(val => typeof val !== 'undefined') as FunctionDeclaration[]
  const foundVariables = sourceFiles
    .map(source => source.getVariableDeclaration(functionName))
    .filter(val => typeof val !== 'undefined') as VariableDeclaration[]
  if (foundFunctions.length + foundVariables.length > 1) {
    throw new Error(`The 2nd argument of @Body() decorator must be the name of a function defined only once`)
  }
  discriminatorFunction = foundFunctions[0] ?? foundVariables[0]
  // tslint:disable-next-line: strict-type-predicates
  if (typeof discriminatorFunction === 'undefined') {
    throw new Error(`The 2nd argument of @Body() decorator must be the name of a function defined in source files`)
  }
  if (discriminatorFunction.isExported() === false) {
    throw new Error(`The 2nd argument of @Body() decorator must be the name of an exported function`)
  }
  const path = discriminatorFunction.getSourceFile().getFilePath().toString()
  return { path, name: functionName }
}
