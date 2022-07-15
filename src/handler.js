const loader = require('./loader.js')
const { MIDDY_ELT_HANDLER_ENV_VAR_NAME } = require('./constants.js')
const { beforeInvocation, afterInvocation } = require('./elt.js')

// Load user handler
const userHandler = loader.loadHandler(
    process.env.LAMBDA_TASK_ROOT,
    process.env[MIDDY_ELT_HANDLER_ENV_VAR_NAME]
)

// Export wrapper handler
module.exports.wrapper = async function (event, context) {
    await beforeInvocation(null, event, context)
    try {
        // Delegate to user handler
        const responsePromise = userHandler(event, context)
        const response = await responsePromise
        await afterInvocation(null, event, context, response, null)
        return response
    } catch (error) {
        await afterInvocation(null, event, context, null, error)
        throw error
    }
}
