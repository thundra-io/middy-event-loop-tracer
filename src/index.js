const elt = require('./elt')

const { MIDDY_ELT_ENABLED } = require('./constants')

const eventLoopTracerMiddleware = (opts = {}) => {
    const eventLoopTracerMiddlewareBefore = async (request) => {
        if (!MIDDY_ELT_ENABLED) {
            return
        }
        await elt.beforeInvocation(opts, request.event, request.context)
    }

    const eventLoopTracerMiddlewareAfter = async (request) => {
        if (!MIDDY_ELT_ENABLED) {
            return
        }
        await elt.afterInvocation(
            opts,
            request.event,
            request.context,
            request.response,
            request.error,
            false
        )
    }

    const eventLoopTracerMiddlewareOnError = async (request) => {
        if (!MIDDY_ELT_ENABLED) {
            return
        }
        await elt.afterInvocation(
            opts,
            request.event,
            request.context,
            request.response,
            request.error,
            false
        )
    }

    return {
        before: eventLoopTracerMiddlewareBefore,
        after: eventLoopTracerMiddlewareAfter,
        onError: eventLoopTracerMiddlewareOnError,
    }
}

module.exports = eventLoopTracerMiddleware
module.exports.dumpTasks = elt.dumpTasks
module.exports.dumpTaskGroups = elt.dumpTaskGroups
