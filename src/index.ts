import {
  getCompilerOptionsFromTsConfig,
  Project,
  TypeAliasDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
  ExportedDeclarations
} from 'ts-morph'
import { glob } from 'glob'
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
     * Can be a single file path or an array of file paths
     * The file extension (.json, .yaml, or .yml) determines the output format
     */
    filePath: string | string[]
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
    }
    /**
     * Additional types you want to export in the schemas of the spec
     * (could be useful when using the spec to generate typescript openapi clients...)
     */
    additionalExportedTypeNames?: string[]
    /**
     * Add support for x-enum-varnames
     */
    xEnumVarnames?: boolean
    /**
     * If you enable this option we will find every responses
     * with an HTTP code >300 and output it to a markdown
     * table on `info.description`
     */
    outputErrorsToDescription?:
      | {
          enabled: false
        }
      | {
          enabled: true
          /**
           * Define table columns (name + how value is retrieved)
           */
          tableColumns: {
            name: string
            value:
              | {
                  type: 'path'
                  /**
                   * Path of data to display in the cell (e.g. `['status_code']` or `['data', 'payload']`)
                   */
                  value: string[]
                }
              | {
                  type: 'statusCode'
                }
              | {
                  type: 'description'
                }
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
  }
  router: {
    /**
     * The handlebars template path we use to generate the router file
     */
    templateFilePath?: string
    /**
     * Where you want the express router to be exported
     */
    filePath: string
    /**
     * The path of the middleware that must be called when @Security()
     * decorator is applied on the route
     * You must export a variable/function named `securityMiddleware`
     */
    securityMiddlewarePath?: string

    /**
     * If `true`, the result will be validated against the schema
     * and any extra properties will be removed.
     */
    validateResponse?: boolean

    /**
     * Override the module name used for runtime imports inside the generated router
     * Defaults to 'typoa'. Useful for tests to point to local source (e.g. '../../src').
     */
    runtimeImport?: string
  }
}

let configStore: OpenAPIConfiguration | undefined = undefined
export function getConfig(): OpenAPIConfiguration | undefined {
  return configStore
}

export async function generate(config: OpenAPIConfiguration) {
  configStore = config

  const root =
    config.root ?? path.dirname(path.resolve(config.tsconfigFilePath))
  // initialize
  const project = new Project({
    compilerOptions: getCompilerOptionsFromTsConfig(config.tsconfigFilePath)
      .options
  })
  project.addSourceFilesFromTsConfig(config.tsconfigFilePath)

  // Init spec
  const spec = createSpec({
    name: config.openapi.service.name,
    version: config.openapi.service.version
  })
  if (typeof config.openapi.securitySchemes !== 'undefined') {
    spec.components!.securitySchemes = config.openapi.securitySchemes
  }
  // Codegen object
  const codegenControllers: CodeGenControllers = {}
  const controllersPathByName: Record<string, string> = {}

  // Iterate over controllers and patch spec
  await Promise.all(
    config.controllers.map(async controller => {
      const files = await glob(controller)
      await Promise.all(
        files.map(async file => {
          const filePath = path.resolve(root, file)
          const sourceFile = project.getSourceFileOrThrow(filePath)
          const controllers = sourceFile.getClasses()
          for (const controller of controllers) {
            const routeDecorator = controller.getDecorator('Route')
            if (routeDecorator === undefined) continue // skip
            addController(controller, spec, codegenControllers, config.router)
            controllersPathByName[controller.getName()!] = filePath
          }
        })
      )
    })
  )

  // additional exported type names
  for (const typeName of config.openapi.additionalExportedTypeNames ?? []) {
    const sourceFiles = project.getSourceFiles()
    const declarations = sourceFiles
      .map(file => ({
        file: file.getFilePath(),
        declaration: file.getExportedDeclarations().get(typeName)?.[0]
      }))
      .filter(({ declaration }) => typeof declaration !== 'undefined') as {
      declaration: ExportedDeclarations
      file: string
    }[]
    if (declarations.length === 0) {
      throw new Error(
        `Unable to find the additional exported type named '${typeName}'`
      )
    }
    if (declarations.length > 1) {
      throw new Error(
        `We found multiple references for the additional exported type named '${typeName}' in ${declarations.map(({ file }) => file).join(', ')}`
      )
    }
    const declaration = declarations[0].declaration as
      | TypeAliasDeclaration
      | ClassDeclaration
      | InterfaceDeclaration
    // Add to spec
    const name = declaration.getName()!
    const type = declaration.getType()
    const resolved = resolve(
      type.isAny()
        ? (declaration.getSymbol()?.getDeclaredType() ?? type)
        : type,
      spec
    )
    if (
      !('$ref' in resolved) ||
      resolved.$ref.substr('#/components/schemas/'.length) !== name
    ) {
      spec.components!.schemas![name] = resolved
    }
  }
  // Export all responses
  if (
    typeof config.openapi.outputErrorsToDescription !== 'undefined' &&
    config.openapi.outputErrorsToDescription.enabled === true
  ) {
    const errorsConfig = config.openapi.outputErrorsToDescription
    const tableColumns = errorsConfig.tableColumns
    const methods = [
      'get',
      'patch',
      'put',
      'delete',
      'post',
      'head',
      'options'
    ] as const
    const responses = Object.values(spec.paths)
      .map(path => {
        return methods.map(method => path?.[method]?.responses ?? {})
      })
      .flat()
      .reduce<
        {
          code: number
          response: OpenAPIV3.ResponseObject
        }[]
      >((list, responses) => {
        for (const code in responses) {
          // note: we don't generate responses with $ref so we can use `as`
          list.push({
            code: parseInt(code, 10),
            response: responses[code] as OpenAPIV3.ResponseObject
          })
        }
        return list
      }, [])
    let rows = responses
      .filter(
        response =>
          response.code > 300 &&
          typeof response.response.content !== 'undefined'
      )
      .map(response => {
        const content = response.response.content!['application/json'].schema
        if (typeof content === 'undefined') {
          return undefined
        }
        const buildRow = (
          content:
            | OpenAPIV3.ReferenceObject
            | OpenAPIV3.ArraySchemaObject
            | OpenAPIV3.NonArraySchemaObject
        ) =>
          tableColumns.map(({ value }) => {
            switch (value.type) {
              case 'path':
                const resolved = resolveProperty(
                  content,
                  spec.components!,
                  value.value
                )
                if (resolved.meta.isObject) {
                  return '```' + String(resolved.value) + '```'
                }
                return String(resolved.value)
              case 'description':
                return String(response.response.description)
              case 'statusCode':
                return String(response.code)
            }
          })
        if ('oneOf' in content && typeof content.oneOf !== 'undefined') {
          return content.oneOf.map(content => buildRow(content))
        }
        return [buildRow(content)]
      })
      .flat(1)
      .filter(content => typeof content !== 'undefined')
    if (typeof errorsConfig.sortColumn === 'string') {
      const columnIndex = tableColumns.findIndex(
        column => column.name === errorsConfig.sortColumn
      )
      rows = rows.sort((a, b) => {
        const aValue = a[columnIndex]
        const bValue = b[columnIndex]
        if (
          String(parseFloat(aValue)) === aValue &&
          String(parseFloat(bValue)) === bValue
        ) {
          return parseFloat(aValue) - parseFloat(bValue)
        }
        return aValue.localeCompare(bValue)
      })
    }
    if (typeof errorsConfig.uniqueColumn === 'string') {
      const columnIndex = tableColumns.findIndex(
        column => column.name === errorsConfig.uniqueColumn
      )
      rows = rows.filter(
        (row, i) =>
          rows.findIndex(r => r[columnIndex] === row[columnIndex]) === i
      )
    }
    const headers = tableColumns.map(column => column.name)
    const markdown =
      `| ${headers.join(' | ')} |\n` +
      `| ${new Array(headers.length).fill(':---').join(' | ')} |\n` +
      rows.map(row => `| ${row.join(' | ')} |`).join('\n')
    spec.info.description = `# Errors\n${markdown}`
  }
  // Write OpenAPI file(s)
  const jsonContent = JSON.stringify(spec, null, '\t')

  // Convert filePath to array for unified processing
  const filePaths = Array.isArray(config.openapi.filePath)
    ? config.openapi.filePath
    : [config.openapi.filePath]

  // Process each file path
  for (const filePath of filePaths) {
    const resolvedPath = path.resolve(root, filePath)
    // Determine format based on file extension
    if (
      filePath.toLowerCase().endsWith('.yaml') ||
      filePath.toLowerCase().endsWith('.yml')
    ) {
      const yamlContent = YAML.stringify(JSON.parse(jsonContent), 10) // use json anyway to remove undefined
      await fs.promises.writeFile(resolvedPath, yamlContent)
    } else {
      // Default to JSON for any other extension or no extension
      await fs.promises.writeFile(resolvedPath, jsonContent)
    }
  }

  // Codegen
  const templateFilePath = config.router.templateFilePath
    ? path.resolve(root, config.router.templateFilePath)
    : path.resolve(__dirname, './template/express.ts.hbs')

  handlebars.registerHelper('json', (context: any) => {
    return JSON.stringify(context)
  })
  const templateContent = await fs.promises.readFile(templateFilePath)
  const compiledTemplate = handlebars.compile(templateContent.toString(), {
    noEscape: true
  }) // don't escape json strings
  const routerFilePath = path.resolve(root, config.router.filePath)
  const routerFileContent = compiledTemplate({
    securityMiddleware: config.router.securityMiddlewarePath
      ? getRelativeFilePath(
          path.dirname(routerFilePath),
          path.resolve(root, config.router.securityMiddlewarePath)
        )
      : undefined,
    validateResponse: config.router.validateResponse,
    runtimeImport:
      config.router.runtimeImport ??
      process.env.TYPOA_RUNTIME_IMPORT ??
      'typoa',
    controllers: Object.keys(codegenControllers).map(controllerName => {
      return {
        name: controllerName,
        path: getRelativeFilePath(
          path.dirname(routerFilePath),
          controllersPathByName[controllerName]
        ),
        methods: codegenControllers[controllerName].map(method => {
          if (method.bodyDiscriminator) {
            // Update path
            method.bodyDiscriminator.path = getRelativeFilePath(
              path.dirname(routerFilePath),
              method.bodyDiscriminator.path
            )
          }
          return method
        })
      }
    }),
    schemas: spec.components!.schemas,
    middlewares: Object.values(codegenControllers)
      .flatMap(controller =>
        controller.flatMap(method => method.middlewares || [])
      )
      .filter(
        (middleware, index, self) =>
          self.findIndex(m => m.name === middleware.name) === index
      )
  })

  await fs.promises.writeFile(routerFilePath, routerFileContent)
}

export * from './runtime/decorators'
export * from './runtime/interfaces'
export * as RuntimeResponse from './runtime/response'
export * as Validator from './runtime/validator'
export { type TypoaRuntimeOptions, setRuntimeOptions } from './option'
