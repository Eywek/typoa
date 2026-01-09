import { OpenAPIV3 } from 'openapi-types'

export function createSpec(info: {
  name: string
  version: string
}): OpenAPIV3.Document {
  return {
    openapi: '3.0.0',
    info: {
      title: info.name,
      version: info.version
    },
    paths: {},
    components: {
      schemas: {}
    }
  }
}
