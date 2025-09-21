import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { Project, getCompilerOptionsFromTsConfig } from 'ts-morph'
import { promisify } from 'util'
import glob from 'glob'
import debug from 'debug'
import { OpenAPIV3 } from 'openapi-types'
import { CodeGenerator, RouterGenerator, GenerationResult } from './generator'
import { OpenAPIConfiguration } from './index'

const log = debug('typoa:cache')
const promiseGlob = promisify(glob)

export const CACHE_VERSION = '1.0.0'

interface FileEntry {
  path: string
  contentHash: string
  lastModified: number
  types: Record<string, string>
  controllers: Record<string, string>
  isDependency: boolean
}

interface Cache {
  version: string
  files: Record<string, FileEntry>
  openApiSpec: OpenAPIV3.Document | null
  routerContent: string
  lastFullGeneration: number
}

export class CacheService {
  private _cacheFile: string
  private _cacheDir: string
  private _project: Project
  private _config: OpenAPIConfiguration
  private _root: string

  constructor(config: OpenAPIConfiguration) {
    this._config = config
    this._root = config.root ?? path.dirname(path.resolve(config.tsconfigFilePath))
    this._cacheDir = path.join(os.tmpdir(), 'typoa')
    this._cacheFile = path.join(this._cacheDir, 'cache.json')
    
    this._project = new Project({
      compilerOptions: getCompilerOptionsFromTsConfig(config.tsconfigFilePath).options
    })
    this._project.addSourceFilesFromTsConfig(config.tsconfigFilePath)
  }

  private async getControllerFiles(): Promise<string[]> {
    const controllerFileArrays = await Promise.all(
      this._config.controllers.map(pattern => promiseGlob(pattern))
    )
    return controllerFileArrays.flat().map(file => path.resolve(file))
  }

  async generateWithCache(): Promise<GenerationResult> {
    log('Starting generation with cache enabled')

    const cache = await this.loadCache()
    
    if (!cache) {
      log('No cache found, performing full generation')
      const currentFiles = await this.discoverFiles()
      return await this.fullGeneration(currentFiles)
    }

    // Check controller files for changes
    const controllerFiles = await this.getControllerFiles()
    
    if (await this.hasFileChanges(controllerFiles, cache, 'controller')) {
      log('Controller changes detected, performing full generation')
      const currentFiles = await this.discoverFiles()
      return await this.fullGeneration(currentFiles)
    }
    
    // Check dependency files from cache
    const dependencyFiles = Object.keys(cache.files).filter(f => cache.files[f].isDependency)
    
    if (await this.hasFileChanges(dependencyFiles, cache, 'dependency')) {
      log('Dependency changes detected, performing full generation')
      const currentFiles = await this.discoverFiles()
      return await this.fullGeneration(currentFiles)
    }

    log('No changes detected, using cached output')
    await this.updateTimestampsInCache(cache, [...controllerFiles, ...dependencyFiles])
    await this.saveCache(cache)

    return this.buildResultFromCache(cache)
  }

  private async hasFileChanges(filePaths: string[], cache: Cache, fileType: string): Promise<boolean> {
    for (const filePath of filePaths) {
      if (!cache.files[filePath]) {
        log(`New ${fileType} file detected: ${path.basename(filePath)}`)
        return true
      }
      
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8')
        const semanticChanges = await this.checkSemanticChanges(filePath, content, cache.files[filePath])
        if (semanticChanges) {
          log(`Semantic changes in ${fileType}: ${path.basename(filePath)}`)
          return true
        }
      } catch (error) {
        log(`${fileType} file deleted or inaccessible: ${path.basename(filePath)}`)
        return true
      }
    }
    return false
  }

  /**
   * Check if semantic changes occurred - returns true if regeneration is needed
   */
  private async checkSemanticChanges(filePath: string, content: string, cachedFile: FileEntry): Promise<boolean> {
    const currentContentHash = this.computeHash(content)
    if (cachedFile.contentHash === currentContentHash) {
      return false
    }

    try {
      const { types: currentTypes, controllers: currentControllers } = await this.extractFileSignature(content)

      const typeChanges = this.hasSemanticDifferences(currentTypes, cachedFile.types)
      const controllerChanges = this.hasSemanticDifferences(currentControllers, cachedFile.controllers)

      if (typeChanges || controllerChanges) {
        cachedFile.contentHash = currentContentHash
        cachedFile.types = currentTypes
        cachedFile.controllers = currentControllers
        return true
      }

      cachedFile.contentHash = currentContentHash
      return false

    } catch (error) {
      log(`Failed to parse semantic changes in ${path.basename(filePath)}: ${error}`)
      return true
    }
  }

  private hasSemanticDifferences(current: Record<string, string>, cached: Record<string, string>): boolean {
    const currentKeys = Object.keys(current)
    const cachedKeys = Object.keys(cached)

    if (currentKeys.length !== cachedKeys.length) {
      return true
    }

    for (const key of currentKeys) {
      if (cached[key] !== current[key]) {
        return true
      }
    }

    return false
  }

  private async extractFileSignature(content: string): Promise<{ types: Record<string, string>, controllers: Record<string, string> }> {
    const sourceFile = this._project.createSourceFile(`temp-${Date.now()}.ts`, content, { overwrite: true })
    
    const types: Record<string, string> = {}
    const controllers: Record<string, string> = {}

    try {
      // Extract types
      for (const iface of sourceFile.getInterfaces()) {
        const name = iface.getName()
        if (name) {
          types[name] = this.computeHash(iface.getText())
        }
      }

      for (const typeAlias of sourceFile.getTypeAliases()) {
        const name = typeAlias.getName()
        if (name) {
          types[name] = this.computeHash(typeAlias.getText())
        }
      }

      for (const enumDecl of sourceFile.getEnums()) {
        const name = enumDecl.getName()
        if (name) {
          types[name] = this.computeHash(enumDecl.getText())
        }
      }

      // Extract controllers
      for (const classDecl of sourceFile.getClasses()) {
        const routeDecorator = classDecl.getDecorator('Route')
        if (routeDecorator) {
          const className = classDecl.getName()
          if (className) {
            for (const method of classDecl.getMethods()) {
              const httpDecorators = ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Head', 'Options']
              if (httpDecorators.some(name => method.getDecorator(name))) {
                const controllerId = `${className}#${method.getName()}`
                controllers[controllerId] = this.computeHash(this.extractMethodSignature(method))
              }
            }
          }
        } else {
          const name = classDecl.getName()
          if (name) {
            types[name] = this.computeHash(classDecl.getText())
          }
        }
      }

      return { types, controllers }
    } finally {
      this._project.removeSourceFile(sourceFile)
    }
  }

  private extractMethodSignature(method: any): string {
    const decorators = method.getDecorators().map((d: any) => d.getText()).join(' ')
    const params = method.getParameters().map((p: any) => {
      const type = p.getTypeNode()?.getText() || 'any'
      return `${p.getName()}: ${type}`
    }).join(', ')
    const returnType = method.getReturnTypeNode()?.getText() || 'void'
    return `${decorators} ${method.getName()}(${params}): ${returnType}`
  }

  private async loadCache(): Promise<Cache | null> {
    if (!fs.existsSync(this._cacheFile)) {
      return null
    }

    try {
      const content = await fs.promises.readFile(this._cacheFile, 'utf-8')
      const data = JSON.parse(content)
      
      if (data.version !== CACHE_VERSION) {
        log('Cache version incompatible, invalidating')
        return null
      }
      
      return data
    } catch (error) {
      log(`Failed to load cache: ${error}`)
      return null
    }
  }

  private async saveCache(cache: Cache): Promise<void> {
    try {
      await fs.promises.mkdir(this._cacheDir, { recursive: true })
      const content = JSON.stringify(cache, null, 2)
      await fs.promises.writeFile(this._cacheFile, content)
      log('Cache saved successfully')
    } catch (error) {
      log(`Failed to save cache: ${error}`)
    }
  }

  private async discoverFiles(): Promise<FileEntry[]> {
    const controllerFiles = await this.getControllerFiles()
    const dependencyFiles = await this.discoverDependencies(controllerFiles)
    
    log(`Monitoring ${controllerFiles.length} controller files and ${dependencyFiles.length} dependency files`)
    
    const allFiles = [...controllerFiles, ...dependencyFiles]
    const fileEntries: FileEntry[] = []

    for (const filePath of allFiles) {
      const entry = await this.createFileEntry(filePath, !controllerFiles.includes(filePath))
      if (entry) {
        fileEntries.push(entry)
      }
    }

    return fileEntries
  }

  private async discoverDependencies(controllerFiles: string[]): Promise<string[]> {
    const dependencies = new Set<string>()

    for (const filePath of controllerFiles) {
      try {
        const sourceFile = this._project.addSourceFileAtPath(filePath)
        const imports = sourceFile.getImportDeclarations()

        for (const importDecl of imports) {
          const moduleSpecifier = importDecl.getModuleSpecifierValue()
          
          if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
            const resolved = this.resolveImportPath(filePath, moduleSpecifier)
            if (resolved && fs.existsSync(resolved)) {
              dependencies.add(resolved)
            }
          }
        }
      } catch (error) {
        log(`Failed to analyze imports in ${filePath}: ${error}`)
      }
    }

    return Array.from(dependencies)
  }

  private resolveImportPath(fromFile: string, moduleSpecifier: string): string | null {
    const basePath = path.resolve(path.dirname(fromFile), moduleSpecifier)
    const normalizedPath = basePath.endsWith('.js') 
      ? basePath.replace(/\.js$/, '.ts') 
      : basePath
    
    const extensions = ['', '.ts', '.js']
    const indexExtensions = ['/index.ts', '/index.js']
    
    for (const base of [normalizedPath, basePath]) {
      for (const ext of extensions) {
        const candidate = base + ext
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }
      
      for (const indexExt of indexExtensions) {
        const candidate = base + indexExt
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }
    }

    return null
  }

  private async createFileEntry(filePath: string, isDependency: boolean): Promise<FileEntry | null> {
    try {
      const stats = await fs.promises.stat(filePath)
      const content = await fs.promises.readFile(filePath, 'utf-8')
      const contentHash = this.computeHash(content)

      const entry: FileEntry = {
        path: filePath,
        contentHash,
        lastModified: stats.mtimeMs,
        types: {},
        controllers: {},
        isDependency
      }

      if (this.hasRelevantContent(content)) {
        await this.parseFileContent(entry, content)
      }

      return entry
    } catch (error) {
      log(`Failed to create file entry for ${filePath}: ${error}`)
      return null
    }
  }

  private hasRelevantContent(content: string): boolean {
    return content.includes('interface ') ||
           content.includes('type ') ||
           content.includes('class ') ||
           content.includes('enum ') ||
           content.includes('@Route')
  }

  private async parseFileContent(entry: FileEntry, content: string): Promise<void> {
    try {
      const { types, controllers } = await this.extractFileSignature(content)
      entry.types = types
      entry.controllers = controllers
    } catch (error) {
      log(`Failed to parse file content: ${error}`)
    }
  }

  private async updateTimestampsInCache(cache: Cache, filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      if (cache.files[filePath]) {
        const stats = await fs.promises.stat(filePath)
        cache.files[filePath].lastModified = stats.mtimeMs
      }
    }
  }

  private async fullGeneration(currentFiles: FileEntry[]): Promise<GenerationResult> {
    const cache: Cache = {
      version: CACHE_VERSION,
      files: {},
      openApiSpec: null,
      routerContent: '',
      lastFullGeneration: Date.now()
    }

    for (const file of currentFiles) {
      cache.files[file.path] = file
    }

    const result = await this.performGeneration()

    cache.openApiSpec = result.spec
    
    // Generate router content separately 
    const routerGenerator = new RouterGenerator(this._config, this._root)
    cache.routerContent = await routerGenerator.generateRouterContent(result)

    await this.saveCache(cache)

    return result
  }

  private async performGeneration(): Promise<GenerationResult> {
    const codeGenerator = new CodeGenerator(this._config, this._project, this._root)
    const result = await codeGenerator.generate()

    const routerGenerator = new RouterGenerator(this._config, this._root)
    await routerGenerator.generateRouterContent(result)

    return result
  }

  private buildResultFromCache(cache: Cache): GenerationResult {
    if (!cache.openApiSpec) {
      throw new Error('Cache has no OpenAPI spec')
    }

    const controllersPathByName: Record<string, string> = {}
    
    for (const file of Object.values(cache.files)) {
      for (const controllerId of Object.keys(file.controllers)) {
        const [className] = controllerId.split('#')
        controllersPathByName[className] = file.path
      }
    }

    return {
      spec: cache.openApiSpec,
      codegenControllers: {},
      controllersPathByName
    }
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)
  }

  async clear(): Promise<void> {
    try {
      if (fs.existsSync(this._cacheDir)) {
        await fs.promises.rm(this._cacheDir, { recursive: true })
      }
      log('Cache cleared')
    } catch (error) {
      log('Failed to clear cache:', error)
    }
  }
}

