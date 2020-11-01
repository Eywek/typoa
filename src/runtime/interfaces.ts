export class Controller {
  private statusCode?: number = undefined
  private headers = {} as Record<string, string | undefined>

  public setStatus (statusCode: number) {
    this.statusCode = statusCode
  }

  public getStatus () {
    return this.statusCode
  }

  public setHeader (name: string, value?: string) {
    this.headers[name] = value
  }

  public getHeaders () {
    return this.headers
  }
}
