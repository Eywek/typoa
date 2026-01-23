import debug from 'debug'

export type TypoaLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

export type CustomLogger = { [K in TypoaLogLevel]: (message: string) => void }

const defaultLogger = debug('typoa')

export function initLogger(customLogger?: CustomLogger): CustomLogger {
  return (
    customLogger ?? {
      trace: defaultLogger,
      debug: defaultLogger,
      info: defaultLogger,
      warn: defaultLogger,
      error: defaultLogger
    }
  )
}
