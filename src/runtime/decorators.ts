// tslint:disable: ban-types
import express from 'express'

export function Route (route?: string): Function {
  return () => {
    return
  }
}

export function Tags (...tags: string[]): Function {
  return () => {
    return
  }
}

export function Get (route?: string, ...tagsOrOperation: Function[]): Function {
  return () => {
    return
  }
}

export function Post (route?: string, ...tagsOrOperation: Function[]): Function {
  return () => {
    return
  }
}

export function Delete (route?: string, ...tagsOrOperation: Function[]): Function {
  return () => {
    return
  }
}

export function Patch (route?: string, ...tagsOrOperation: Function[]): Function {
  return () => {
    return
  }
}

export function Put (route?: string, ...tagsOrOperation: Function[]): Function {
  return () => {
    return
  }
}

export type BodyDiscriminatorFunction = (req: express.Request) => Promise<string> | string

export function Body (contentType: string = 'application/json', discriminator?: BodyDiscriminatorFunction): Function {
  return () => {
    return
  }
}

export function Produces (contentType: string): Function {
  return () => {
    return
  }
}

export function Query (name: string): Function {
  return () => {
    return
  }
}

export function Header (name: string): Function {
  return () => {
    return
  }
}

export function Path (name: string): Function {
  return () => {
    return
  }
}

export function Security (securities: Record<string, string[]>): Function {
  return () => {
    return
  }
}

export function Response <T> (httpCode: number, description?: string): Function {
  return () => {
    return
  }
}

export function Request (): Function {
  return () => {
    return
  }
}

export function OperationId (operation: string): Function {
  return () => {
    return
  }
}

export function Hidden (): Function {
  return () => {
    return
  }
}

export function Deprecated (): Function {
  return () => {
    return
  }
}

export type MiddlewareFunction = (req: express.Request, res: express.Response, next: express.NextFunction) => void | Promise<void>

export function Middleware(middleware: MiddlewareFunction): Function {
  return () => {
    return
  }
}
