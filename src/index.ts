import { getCompilerOptionsFromTsConfig, Project } from 'ts-morph'
import glob from 'glob'
import { promisify } from 'util'
import path from 'path'
import { addControllerToSpec } from './controller'
import { createSpec } from './openapi'
import { OpenAPIV3 } from 'openapi-types'
import YAML from 'yamljs'
import fs from 'fs'

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

  // Iterate over controllers and patch spec
  for (const controller of config.controllers) {
    const files = await promiseGlob(controller)
    for (const file of files) {
      const sourceFile = project.getSourceFileOrThrow(path.resolve(root, file))
      const controllers = sourceFile.getClasses()
      for (const controller of controllers) {
        const routeDecorator = controller.getDecorator('Route')
        if (routeDecorator === undefined) continue // skip
        addControllerToSpec(controller, spec)
      }
    }
  }

  // Write file
  let fileContent = JSON.stringify(spec, null, '\t')
  if (config.openapi.format === 'yaml') {
    fileContent = YAML.stringify(JSON.parse(fileContent), 10) // use json anyway to remove undefined
  }
  await fs.promises.writeFile(path.resolve(root, config.openapi.filePath), fileContent)
}

export * from './decorators'
