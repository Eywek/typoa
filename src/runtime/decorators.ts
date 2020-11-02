import express from 'express'

// tslint:disable-next-line: ban-types
export function Route (route?: string): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Tags (...tags: string[]): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Get (route?: string, ...tags: string[]): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Post (route?: string, ...tags: string[]): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Delete (route?: string, ...tags: string[]): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Patch (route?: string, ...tags: string[]): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Put (route?: string, ...tags: string[]): Function {
  return () => {
    return
  }
}

export type BodyDiscriminatorFunction = (req: express.Request) => Promise<string> | string

// tslint:disable-next-line: ban-types
export function Body (contentType: string = 'application/json', discriminator?: BodyDiscriminatorFunction): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Query (name: string): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Header (name: string): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Path (name: string): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Security (securities: Record<string, string[]>): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Response <T> (httpCode: number, description?: string): Function {
  return () => {
    return
  }
}

// tslint:disable-next-line: ban-types
export function Request (): Function {
  return () => {
    return
  }
}
