import express from 'express'
import { OpenAPIV3 } from 'openapi-types'

export function validateAndParse (
  req: express.Request,
  schemas: OpenAPIV3.ComponentsObject['schemas'],
  rules: {
    params: OpenAPIV3.OperationObject['parameters']
    body: OpenAPIV3.OperationObject['requestBody']
  }
): any[] {
  return []
}
