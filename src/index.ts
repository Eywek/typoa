import { getCompilerOptionsFromTsConfig, Project } from 'ts-morph'
import glob from 'glob'
import { promisify } from 'util'
import path from 'path'
import { addController } from './controller'
import { createSpec } from './openapi'
import { OpenAPIV3 } from 'openapi-types'
import YAML from 'yamljs'
import fs from 'fs'
import { CodeGenControllers } from './types'
import handlebars from 'handlebars'
import { getRelativeFilePath } from './utils'

export type OpenAPIConfiguration = {
  tsconfigFilePath: string
  controllers: string[]
  root?: string
  openapi: {
    filePath: string
    format: 'json' | 'yaml'
    securitySchemes?: Record<string, OpenAPIV3.SecuritySchemeObject>
    service: {
      name: string
      version: string
    }
  },
  router: {
    templateFilePath?: string
    filePath: string,
    securityMiddlewarePath?: string
  }
}

const promiseGlob = promisify(glob)
export async function generate (config: OpenAPIConfiguration) {
  const root = config.root ?? path.dirname(path.resolve(config.tsconfigFilePath))
  // initialize
  const project = new Project({
    compilerOptions: getCompilerOptionsFromTsConfig(config.tsconfigFilePath).options
  })
  project.addSourceFilesFromTsConfig(config.tsconfigFilePath)

  // Init spec
  const spec = createSpec({ name: config.openapi.service.name, version: config.openapi.service.version })
  if (typeof config.openapi.securitySchemes !== 'undefined') {
    spec.components!.securitySchemes = config.openapi.securitySchemes
  }

  // Codegen object
  const codegenControllers: CodeGenControllers = {}
  const controllersPathByName: Record<string, string> = {}

  // Iterate over controllers and patch spec
  for (const controller of config.controllers) {
    const files = await promiseGlob(controller)
    for (const file of files) {
      const filePath = path.resolve(root, file)
      const sourceFile = project.getSourceFileOrThrow(filePath)
      const controllers = sourceFile.getClasses()
      for (const controller of controllers) {
        const routeDecorator = controller.getDecorator('Route')
        if (routeDecorator === undefined) continue // skip
        addController(controller, spec, codegenControllers)
        controllersPathByName[controller.getName()!] = filePath
      }
    }
  }

  // Write OpenAPI file
  let fileContent = JSON.stringify(spec, null, '\t')
  if (config.openapi.format === 'yaml') {
    fileContent = YAML.stringify(JSON.parse(fileContent), 10) // use json anyway to remove undefined
  }
  await fs.promises.writeFile(path.resolve(root, config.openapi.filePath), fileContent)

  // Codegen
  const templateFilePath = config.router.templateFilePath ?
    path.resolve(root, config.router.templateFilePath) :
    path.resolve(__dirname, './template/express.ts.hbs')
  handlebars.registerHelper('json', (context: any) => {
    return JSON.stringify(context)
  })
  const templateContent = await fs.promises.readFile(templateFilePath)
  const compiledTemplate = handlebars.compile(templateContent.toString(), { noEscape: true }) // don't espace json strings
  const routerFilePath = path.resolve(root, config.router.filePath)
  const routerFileContent = compiledTemplate({
    securityMiddleware: config.router.securityMiddlewarePath ? getRelativeFilePath(
      path.dirname(routerFilePath),
      path.resolve(root, config.router.securityMiddlewarePath)
     ) : undefined,
    controllers: Object.keys(codegenControllers).map((controllerName) => {
      return {
        name: controllerName,
        path: getRelativeFilePath(path.dirname(routerFilePath), controllersPathByName[controllerName]),
        methods: codegenControllers[controllerName].map((method) => {
          if (method.bodyDiscriminator) { // Update path
            method.bodyDiscriminator.path = getRelativeFilePath(
              path.dirname(routerFilePath),
              method.bodyDiscriminator.path
            )
          }
          return method
        })
      }
    }),
    schemas: spec.components!.schemas
  })
  await fs.promises.writeFile(routerFilePath, routerFileContent)
}

export * from './runtime/decorators'
export * from './runtime/interfaces'
export * as RuntimeResponse from './runtime/response'
export * as Validator from './runtime/validator'
