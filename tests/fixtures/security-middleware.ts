export function securityMiddleware(scopes: Record<string, string[]>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return function (req: any, res: any, next: any) {
    return res.json({ scopes })
  }
}
