/**
 * Tells React it is running inside a test environment, which is what lets `act()` flush
 * updates without warning on every call.
 */
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

export {}
