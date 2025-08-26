import fs from 'fs'
import path from 'path'
import { Project } from 'ts-morph'
import { promisify } from 'util'
import glob from 'glob'
import YAML from 'yamljs'
import debug from 'debug'
import { OpenAPIV3 } from 'openapi-types'
import handlebars from 'handlebars'
import { CodeGenControllers } from './types'
import { createSpec } from './openapi'
import { addController } from './controller'
import { resolve } from './resolve'
import { getRelativeFilePath, resolveProperty } from './utils'
import { OpenAPIConfiguration } from './index'
import { TypeAliasDeclaration, ClassDeclaration, InterfaceDeclaration, ExportedDeclarations } from 'ts-morph'

const log = debug('typoa:generator')
const promiseGlob = promisify(glob)

export interface GenerationResult {
  spec: OpenAPIV3.Document
  codegenControllers: CodeGenControllers
  controllersPathByName: Record<string, string>
}

export class CodeGenerator {
  private _config: OpenAPIConfiguration
  private _project: Project
  private _root: string

  constructor(config: OpenAPIConfiguration, project: Project, root: string) {
    this._config = config
    this._project = project
    this._root = root
  }

  async generate(): Promise<GenerationResult> {
    log('Starting code generation')
    
    const spec = this.createOpenAPISpec()
    const codegenControllers: CodeGenControllers = {}
    const controllersPathByName: Record<string, string> = {}

    await this.processControllers(spec, codegenControllers, controllersPathByName)
    await this.processAdditionalTypes(spec)
    await this.processErrorsToDescription(spec)
    await this.writeOpenApiFiles(spec)

    return { spec, codegenControllers, controllersPathByName }
  }

  private createOpenAPISpec(): OpenAPIV3.Document {
    log('Creating OpenAPI spec')
    const spec = createSpec({
      name: this._config.openapi.service.name,
      version: this._config.openapi.service.version
    })

    if (this._config.openapi.securitySchemes) {
      spec.components!.securitySchemes = this._config.openapi.securitySchemes
    }

    return spec
  }

  private async processControllers(
    spec: OpenAPIV3.Document,
    codegenControllers: CodeGenControllers,
    controllersPathByName: Record<string, string>
  ): Promise<void> {
    log('Processing controllers')
    
    await Promise.all(this._config.controllers.map(async controller => {
      const files = await promiseGlob(controller)
      await Promise.all(files.map(async file => {
        const filePath = path.resolve(file)
        const sourceFile = this._project.getSourceFileOrThrow(filePath)
        const controllers = sourceFile.getClasses()
        
        for (const controllerClass of controllers) {
          const routeDecorator = controllerClass.getDecorator('Route')
          if (routeDecorator === undefined) continue
          
          addController(controllerClass, spec, codegenControllers, this._config.router)
          controllersPathByName[controllerClass.getName()!] = filePath
        }
      }))
    }))
  }

  private async processAdditionalTypes(spec: OpenAPIV3.Document): Promise<void> {
    if (!this._config.openapi.additionalExportedTypeNames?.length) {
      return
    }

    log('Processing additional exported types')
    
    for (const typeName of this._config.openapi.additionalExportedTypeNames) {
      const sourceFiles = this._project.getSourceFiles()
      const declarations = sourceFiles
        .map(file => ({ file: file.getFilePath(), declaration: file.getExportedDeclarations().get(typeName)?.[0] }))
        .filter(({ declaration }) => typeof declaration !== 'undefined') as { declaration: ExportedDeclarations, file: string }[]
      
      if (declarations.length === 0) {
        throw new Error(`Unable to find the additional exported type named '${typeName}'`)
      }
      if (declarations.length > 1) {
        throw new Error(`We found multiple references for the additional exported type named '${typeName}' in ${declarations.map(({ file }) => file).join(', ')}`)
      }
      
      const declaration = declarations[0].declaration as TypeAliasDeclaration | ClassDeclaration | InterfaceDeclaration
      const name = declaration.getName()!
      const type = declaration.getType()
      const resolved = resolve(type.isAny() ? declaration.getSymbol()?.getDeclaredType() ?? type : type, spec)
      
      if (!('$ref' in resolved) || resolved.$ref.substring('#/components/schemas/'.length) !== name) {
        spec.components!.schemas![name] = resolved
      }
    }
  }

  private async processErrorsToDescription(spec: OpenAPIV3.Document): Promise<void> {
    if (!this._config.openapi.outputErrorsToDescription?.enabled) {
      return
    }

    log('Processing errors to description')
    
    const errorsConfig = this._config.openapi.outputErrorsToDescription
    const tableColumns = errorsConfig.tableColumns
    const methods = ['get', 'patch', 'put', 'delete', 'post', 'head', 'options'] as const
    const responses = Object.values(spec.paths)
      .map((path) => {
        return methods.map(method => path[method]?.responses ?? {})
      }).flat()
      .reduce<{ code: number, response: OpenAPIV3.ResponseObject }[]>((list, responses) => {
        for (const code in responses) {
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
        const buildRow = (content: OpenAPIV3.ReferenceObject | OpenAPIV3.ArraySchemaObject | OpenAPIV3.NonArraySchemaObject) => tableColumns.map(({ value }) => {
          switch (value.type) {
            case 'path':
              const resolved = resolveProperty(content, spec.components!, value.value)
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
          return content.oneOf.map((content) => buildRow(content))
        }
        return [buildRow(content)]
      })
      .flat(1)
      .filter(content => typeof content !== 'undefined') as string[][]
    
    if (typeof errorsConfig.sortColumn === 'string') {
      const columnIndex = tableColumns.findIndex(column => column.name === errorsConfig.sortColumn)
      rows = rows.sort((a, b) => {
        const aValue = a[columnIndex]
        const bValue = b[columnIndex]
        if (String(parseFloat(aValue)) === aValue && String(parseFloat(bValue)) === bValue) {
          return parseFloat(aValue) - parseFloat(bValue)
        }
        return aValue.localeCompare(bValue)
      })
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

  async writeOpenApiFiles(spec: OpenAPIV3.Document): Promise<void> {
    log('Writing OpenAPI files')
    
    const jsonContent = JSON.stringify(spec, null, '\t')
    
    const filePaths = Array.isArray(this._config.openapi.filePath)
      ? this._config.openapi.filePath
      : [this._config.openapi.filePath]

    for (const filePath of filePaths) {
      const resolvedPath = path.resolve(this._root, filePath)
      
      if (filePath.toLowerCase().endsWith('.yaml') || filePath.toLowerCase().endsWith('.yml')) {
        const yamlContent = YAML.stringify(JSON.parse(jsonContent), 10)
        await fs.promises.writeFile(resolvedPath, yamlContent)
      } else {
        await fs.promises.writeFile(resolvedPath, jsonContent)
      }
    }
  }
}

export class RouterGenerator {
  private _config: OpenAPIConfiguration
  private _root: string

  constructor(config: OpenAPIConfiguration, root: string) {
    this._config = config
    this._root = root
  }

  async generateRouterContent(result: GenerationResult): Promise<string> {
    log('Generating router content')
    
    const templateFilePath = this._config.router.templateFilePath ?
      path.resolve(this._root, this._config.router.templateFilePath) :
      path.resolve(__dirname, './template/express.ts.hbs')
    
    handlebars.registerHelper('json', (context: any) => {
      return JSON.stringify(context)
    })
    
    const templateContent = await fs.promises.readFile(templateFilePath)
    const compiledTemplate = handlebars.compile(templateContent.toString(), { noEscape: true })
    const routerFilePath = path.resolve(this._root, this._config.router.filePath)
    
    const templateContext = this.buildTemplateContext(result, routerFilePath)
    const routerContent = compiledTemplate(templateContext)

    await fs.promises.writeFile(routerFilePath, routerContent)
    
    return routerContent
  }

  private buildTemplateContext(result: GenerationResult, routerFilePath: string) {
    return {
      securityMiddleware: this._config.router.securityMiddlewarePath ? getRelativeFilePath(
        path.dirname(routerFilePath),
        path.resolve(this._root, this._config.router.securityMiddlewarePath)
      ) : undefined,
      validateResponse: this._config.router.validateResponse,
      runtimeImport: this._config.router.runtimeImport ?? process.env.TYPOA_RUNTIME_IMPORT ?? 'typoa',
      controllers: Object.keys(result.codegenControllers).map((controllerName) => {
        return {
          name: controllerName,
          path: getRelativeFilePath(path.dirname(routerFilePath), result.controllersPathByName[controllerName]),
          methods: result.codegenControllers[controllerName].map((method) => {
            if (method.bodyDiscriminator) {
              method.bodyDiscriminator.path = getRelativeFilePath(
                path.dirname(routerFilePath),
                method.bodyDiscriminator.path
              )
            }
            return method
          })
        }
      }),
      schemas: result.spec?.components?.schemas,
      middlewares: Object
        .values(result.codegenControllers)
        .flatMap(controller => controller.flatMap(method => method.middlewares || []))
        .filter((middleware, index, self) => self.findIndex(m => m.name === middleware.name) === index)
    }
  }
}
