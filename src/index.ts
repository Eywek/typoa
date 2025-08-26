import path from 'path'
import { OpenAPIV3 } from 'openapi-types'
import { CacheService } from './cache'
import { CodeGenerator, RouterGenerator, GenerationResult } from './generator'
import { getCompilerOptionsFromTsConfig, Project } from 'ts-morph'

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

    /**
     * If `true`, the result will be validated against the schema
     * and any extra properties will be removed.
     */
    validateResponse?: boolean;

    /**
     * Override the module name used for runtime imports inside the generated router
     * Defaults to 'typoa'. Useful for tests to point to local source (e.g. '../../src').
     */
    runtimeImport?: string;
  }
  /**
   * Enable caching system (uses '.typoa-cache' directory)
   */
  cache?: boolean
}

export async function generate (config: OpenAPIConfiguration): Promise<GenerationResult> {
  if (config.cache) {
    const orchestrator = new CacheService(config)
    return await orchestrator.generateWithCache()
  }

  return await generateWithoutCache(config)
}

async function generateWithoutCache(config: OpenAPIConfiguration): Promise<GenerationResult> {
  const root = config.root ?? path.dirname(path.resolve(config.tsconfigFilePath))
  const project = new Project({
    compilerOptions: getCompilerOptionsFromTsConfig(config.tsconfigFilePath).options
  })
  project.addSourceFilesFromTsConfig(config.tsconfigFilePath)

  const codeGenerator = new CodeGenerator(config, project, root)
  const result = await codeGenerator.generate()

  const routerGenerator = new RouterGenerator(config, root)
  await routerGenerator.generateRouterContent(result)

  return result
}

export * from './runtime/decorators'
export * from './runtime/interfaces'
export * as RuntimeResponse from './runtime/response'
export * as Validator from './runtime/validator'
