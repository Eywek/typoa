// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function securityMiddleware(scopes: Record<string, string[]>) {
  return function (req: any, res: any, next: any) {
    return next()
  }
}
