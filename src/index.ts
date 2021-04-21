import { getCompilerOptionsFromTsConfig, Project, Symbol as TsSymbol, TypeAliasDeclaration, ClassDeclaration, InterfaceDeclaration } from 'ts-morph'
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
import { getRelativeFilePath, resolveProperty } from './utils'
import { resolve } from './resolve'

export type OpenAPIConfiguration = {
  tsconfigFilePath: string
  /**
   * List of controllers paths
   */
  controllers: string[]
  root?: string
  openapi: {
    /**
     * Where you want the spec to be exported
     */
    filePath: string
    /**
     * The exported format
     */
    format: 'json' | 'yaml'
    /**
     * OpenAPI security schemes to add to the spec
     */
    securitySchemes?: Record<string, OpenAPIV3.SecuritySchemeObject>
    /**
     * OpenAPI service informations to add to the spec
     */
    service: {
      name: string
      version: string
    },
    /**
     * Additional types you want to export in the schemas of the spec
     * (could be useful when using the spec to generate typescript openapi clients...)
     */
    additionalExportedTypeNames?: string[]
    /**
     * If you enable this option we will find every responses
     * with an HTTP code >300 and output it to a markdown
     * table on `info.description`
     */
    outputErrorsToDescription?: {
      enabled: false
    } | {
      enabled: true
      /**
       * Define table columns (name + how value is retrieved)
       */
      tableColumns: {
        name: string
        value: ({
          type: 'path',
          /**
           * Path of data to display in the cell (e.g. `['status_code']` or `['data', 'payload']`)
           */
          value: string[]
        } | {
          type: 'statusCode'
        } | {
          type: 'description'
        })
      }[]
      /**
       * Sort rows by a column
       */
      sortColumn?: string
      /**
       * Ensure unicity via a column value
       */
      uniqueColumn?: string
    }
  },
  router: {
    /**
     * The handlebars template path we use to generate the router file
     */
    templateFilePath?: string
    /**
     * Where you want the express router to be exported
     */
    filePath: string,
    /**
     * The path of the middleware that must be called when @Security()
     * decorator is applied on the route
     * You must export a variable/function named `securityMiddleware`
     */
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

  // additional exported type names
  for (const typeName of config.openapi.additionalExportedTypeNames ?? []) {
    const sourceFiles = project.getSourceFiles()
    const symbols = sourceFiles
      .map(file => file.getLocal(typeName))
      .filter(symbol => typeof symbol !== 'undefined') as TsSymbol[]
    if (symbols.length === 0) {
      throw new Error(`Unable to find the additional exported type named '${typeName}'`)
    }
    if (symbols.length > 1) {
      throw new Error(`We found multiple references for the additional exported type named '${typeName}'`)
    }
    const symbol = symbols[0]
    const firstDeclaration = symbol.getDeclarations()[0] as TypeAliasDeclaration | ClassDeclaration | InterfaceDeclaration
    // Add to spec
    const name = firstDeclaration.getName()!
    const resolved = resolve(firstDeclaration.getType(), spec)
    if (!('$ref' in resolved) || resolved.$ref.substr('#/components/schemas/'.length) !== name) {
      spec.components!.schemas![name] = resolved
    }
  }

  // Export all responses
  if (typeof config.openapi.outputErrorsToDescription !== 'undefined' && config.openapi.outputErrorsToDescription.enabled === true) {
    const errorsConfig = config.openapi.outputErrorsToDescription
    const tableColumns = errorsConfig.tableColumns
    const methods = ['get', 'patch', 'put', 'delete', 'post', 'head', 'options'] as const
    const responses = Object.values(spec.paths)
      .map((path) => {
        return methods.map(method => path[method]?.responses ?? {})
      }).flat()
      .reduce<{ code: number, response: OpenAPIV3.ResponseObject }[]>((list, responses) => {
        for (const code in responses) {
          // note: we don't generate responses with $ref so we can use `as`
          list.push({ code: parseInt(code, 10), response: responses[code] as OpenAPIV3.ResponseObject })
        }
        return list
      }, [])
    let rows = responses
      .filter((response) => response.code > 300 && typeof response.response.content !== 'undefined')
      .map((response) => {
        const content = response.response.content!['application/json'].schema
        if (typeof content === 'undefined') {
          return undefined
        }
        return tableColumns.map(({ value }) => {
          switch (value.type) {
            case 'path':
              return String(resolveProperty(content, spec.components!, value.value))
            case 'description':
              return String(response.response.description)
            case 'statusCode':
              return String(response.code)
          }
        })
      })
      .filter(content => typeof content !== 'undefined') as string[][]
    if (typeof errorsConfig.sortColumn === 'string') {
      const columnIndex = tableColumns.findIndex(column => column.name === errorsConfig.sortColumn)
      rows = rows.sort((a, b) => a[columnIndex].localeCompare(b[columnIndex]))
    }
    if (typeof errorsConfig.uniqueColumn === 'string') {
      const columnIndex = tableColumns.findIndex(column => column.name === errorsConfig.uniqueColumn)
      rows = rows.filter((row, i) => rows.findIndex(r => r[columnIndex] === row[columnIndex]) === i)
    }
    const headers = tableColumns.map(column => column.name)
    const markdown = `| ${headers.join(' | ')} |\n` +
      `| ${new Array(headers.length).fill(':---').join(' | ')} |\n` +
      rows.map(row => `| ${row.join(' | ')} |`).join('\n')
    spec.info.description = `# Errors\n${markdown}`
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
