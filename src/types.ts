import { OpenAPIV3 } from 'openapi-types'

export type CodeGenControllers = Record<string, {
  name: string
  endpoint: string
  verb: string
  security?: Record<string, string[]>[]
  params: OpenAPIV3.OperationObject['parameters']
  body: OpenAPIV3.OperationObject['requestBody']
  bodyDiscriminator?: {
    path: string,
    name: string
  },
  responses: OpenAPIV3.OperationObject['responses'],
  validateResponse: boolean,
  middlewares?: {
    name: string
    path: string
    args?: any[]
  }[]
}[]>
