const path = require('path')

const ORIGINAL_HANDLER_ENV_VAR_NAME = '_HANDLER'
const {
    MIDDY_ELT_ENABLED,
    MIDDY_ELT_HANDLER_ENV_VAR_NAME,
} = require('./constants')

if (!MIDDY_ELT_ENABLED) {
    return
}

const userHandler = process.env[ORIGINAL_HANDLER_ENV_VAR_NAME]
const srcRootPath = path.dirname(require.resolve('middy-event-loop-tracer/src'))
const wrapperHandler = `${srcRootPath}/handler.wrapper`

// Switch user handler with "middy-event-loop-tracer" wrapper handler
process.env[ORIGINAL_HANDLER_ENV_VAR_NAME] = wrapperHandler
process.env[MIDDY_ELT_HANDLER_ENV_VAR_NAME] = userHandler
