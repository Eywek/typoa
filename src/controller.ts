import { OpenAPIV3 } from 'openapi-types'
import { ArrayLiteralExpression, ClassDeclaration, LiteralExpression, PropertyAssignment } from 'ts-morph'
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
    if (bodyParameter) {
      let contentType: string = 'application/json'
      const firstArgumentType = bodyParameter
        .getDecoratorOrThrow('Body')
        .getArguments()[0]?.getType()
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
      appendToSpec(spec, endpoint, verb.toLowerCase() as any, operation)
      // Codegen
      // tslint:disable-next-line: strict-type-predicates
      if (typeof codegenControllers[controllerName] === 'undefined') {
        codegenControllers[controllerName] = []
      }
      codegenControllers[controllerName].push({
        name: method.getName(),
        endpoint,
        verb: verb.toLowerCase(),
        security: operation.security,
        params: codegenParameters,
        body: operation.requestBody
      })
    }
  }
}
