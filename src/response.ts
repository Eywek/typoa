import { Controller } from './interfaces'
import express from 'express'
import { Readable } from 'stream'

const isStream = (data: any): data is Readable =>
  typeof data === 'object' && data !== null &&
  typeof data.pipe === 'function' &&
  data.readable === true &&
  typeof data._read === 'function'

export function send (
  controller: Controller | InstanceType<new () => any>,
  data: unknown,
  res: express.Response
): void {
  let status: number | undefined
  let headers: Record<string, string | undefined> | undefined
  // Get defined headers / status
  if ((controller instanceof Controller) || 'getHeaders' in controller && 'getStatus' in controller) {
    status = controller.getStatus()
    headers = controller.getHeaders()
  }
  // Set headers
  for (const [name, value] of Object.entries(headers ?? {})) {
    res.set(name, value)
  }
  // Reply
  if (isStream(data)) {
    data.pipe(res)
  } else if (typeof data !== 'undefined' && data !== null) {
    res.status(status ?? 200).json(data)
  } else {
    res.status(status ?? 204).end()
  }
}
