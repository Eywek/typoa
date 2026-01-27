import { CustomLogger, initLogger } from './logger'

type InternalFeatures = {
  /**
   * By default, validation accept any additional data even if it's not allowed by OpenAPI schema.
   * Enable this feature will throw if a property is not declared in the schema.
   * MIGHT BREAK YOUR API! Check before enabling it
   */
  enableThrowOnUnexpectedAdditionalData?: boolean
  /**
   * By default, validation accept any additional data even if it's not allowed by OpenAPI schema.
   * Enable this feature will log every case when a given property is not declared in the schema.
   * It helps to prepare the feature "enableThrowOnUnexpectedAdditionalData"
   */
  enableLogUnexpectedAdditionalData?: boolean
}

export type TypoaRuntimeOptions = {
  /**
   * You can provide a specific logger. The default one is https://www.npmjs.com/package/debug
   */
  customLogger?: CustomLogger
  /**
   * features flags to opt-in specific features of the library
   */
  features: InternalFeatures
}

export const options: Omit<TypoaRuntimeOptions, 'customLogger'> & {
  getCustomLogger: () => CustomLogger
} = (() => {
  const initializedLogger = initLogger()
  return {
    getCustomLogger: () => initializedLogger,
    features: {
      enableLogUnexpectedAdditionalData: false,
      enableThrowOnUnexpectedAdditionalData: false
    }
  }
})()

/**
 * Update options to affect library's behaviour
 */
export function setRuntimeOptions(incomingOptions: TypoaRuntimeOptions): void {
  const initializedLogger = initLogger(incomingOptions.customLogger)

  options.getCustomLogger = () => initializedLogger
  options.features.enableLogUnexpectedAdditionalData =
    incomingOptions.features.enableLogUnexpectedAdditionalData ?? false
  options.features.enableThrowOnUnexpectedAdditionalData =
    incomingOptions.features.enableThrowOnUnexpectedAdditionalData ?? false
}
