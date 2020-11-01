export function securityMiddleware (scopes: Record<string, string[]>) {
  return function (req: any, res: any, next: any) {
    return res.json({ scopes })
  }
}
