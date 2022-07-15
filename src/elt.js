const asyncHooks = require('async_hooks')

const logger = require('./logger')
const {
    MIDDY_ELT_TIMEOUT_MARGIN_DEFAULT_VALUE,
    MIDDY_ELT_TIMEOUT_MARGIN_ENV_VAR_NAME,
} = require('./constants')

const tasks = new Map()
const taskGroups = new Map()
let taskTracingActive = false
let rootExecutionId
let awsRequestId
let timeoutHandler

function _hashCode(s) {
    let h
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
    }
    return h
}

function _shouldSkipTask(type, resource) {
    /*
        Available types:

        FSEVENTWRAP, FSREQCALLBACK, GETADDRINFOREQWRAP, GETNAMEINFOREQWRAP, HTTPINCOMINGMESSAGE,
        HTTPCLIENTREQUEST, JSSTREAM, PIPECONNECTWRAP, PIPEWRAP, PROCESSWRAP, QUERYWRAP,
        SHUTDOWNWRAP, SIGNALWRAP, STATWATCHER, TCPCONNECTWRAP, TCPSERVERWRAP, TCPWRAP,
        TTYWRAP, UDPSENDWRAP, UDPWRAP, WRITEWRAP, ZLIB, SSLCONNECTION, PBKDF2REQUEST,
        RANDOMBYTESREQUEST, TLSWRAP, Microtask, Timeout, Immediate, TickObject
     */

    if (
        type === 'Timeout' &&
        typeof resource.hasRef === 'function' &&
        !resource.hasRef()
    ) {
        return true
    }

    return (
        type === 'HTTPPARSER' ||
        type === 'TCPPARSER' ||
        type === 'TickObject' ||
        type === 'GETADDRINFOREQWRAP' ||
        type === 'DNSCHANNEL' ||
        type === 'TLSWRAP' ||
        type === 'PIPEWRAP'
    )
}

function _shouldIgnoreCall(stackTrace) {
    if (stackTrace && stackTrace.length && stackTrace.length > 1) {
        const rootFrame = stackTrace[stackTrace.length - 1]
        // If called from Middy,
        // stack trace length must be bigger than 2 (middy + user handler) to be taken care of
        if (rootFrame.includes('@middy/core/') && stackTrace.length <= 2) {
            return true
        }
        return false
    }
    return true
}

function _trimStackTrace(stackTrace) {
    if (stackTrace && stackTrace.length) {
        let deepestInternalFrame = -1
        for (let i = 0; i < stackTrace.length; i++) {
            const frame = stackTrace[i]
            if (
                frame.includes('(internal/') ||
                frame.includes('(node:internal/')
            ) {
                deepestInternalFrame = i
            }
        }
        if (deepestInternalFrame >= 0) {
            return stackTrace.slice(deepestInternalFrame + 1)
        }
    }
    return stackTrace
}

function _getOrCreateTaskGroup(type, stack) {
    const id = type + '@' + awsRequestId + '_' + _hashCode(stack)
    let taskGroup = taskGroups.get(id)
    if (!taskGroup) {
        let stackTrace = stack.split('\n')
        stackTrace.shift()
        stackTrace = _trimStackTrace(stackTrace)
        if (_shouldIgnoreCall(stackTrace)) {
            return
        }
        taskGroup = {
            id,
            type,
            awsRequestId,
            count: 0,
            stackTrace,
        }
        taskGroups.set(id, taskGroup)
    }
    return taskGroup
}

function _initAsync(asyncId, type, triggerAsyncId, resource) {
    const eid = asyncHooks.executionAsyncId()

    // Check whether the task should be skipped or not
    if (
        !taskTracingActive ||
        _shouldSkipTask(type, resource) ||
        eid === rootExecutionId
    ) {
        return
    }

    // Capture stacktrace
    const stackTrace = {}
    Error.captureStackTrace(stackTrace)

    // Get the associated task group
    const taskGroup = _getOrCreateTaskGroup(type, stackTrace.stack)

    if (!taskGroup) {
        return
    }

    // Increase task count in the group
    taskGroup.count++

    // Register the initialized task and associate it with its group to be used later
    tasks.set(asyncId, taskGroup)
}

function _destroyAsync(asyncId) {
    // Get the associated task group
    const taskGroup = tasks.get(asyncId)
    if (taskGroup) {
        // Decrease task count in the group as it is destroyed
        taskGroup.count--
        if (taskGroup.count <= 0) {
            // If there is no associated task, no need to keep the task group anymore
            taskGroups.delete(taskGroup.id)
        }
        // Remove the completed task
        tasks.delete(asyncId)
    }
}

function _init() {
    const hook = asyncHooks.createHook({
        init: _initAsync,
        destroy: _destroyAsync,
        promiseResolve: _destroyAsync,
    })
    hook.enable()
}

const _setupTimeoutHandler = (opts, context) => {
    const timeoutMargin =
        parseInt(process.env[MIDDY_ELT_TIMEOUT_MARGIN_ENV_VAR_NAME]) ||
        (opts && opts.timeoutMargin) ||
        MIDDY_ELT_TIMEOUT_MARGIN_DEFAULT_VALUE

    timeoutHandler = setTimeout(() => {
        // Disable tracing
        _disableTracing()

        logger.info('About timeout! Dumping active tasks in the event loop ...')

        // Dump active tasks
        _dumpTaskGroups()
    }, context.getRemainingTimeInMillis() - timeoutMargin)
    timeoutHandler.unref()
}

const _destroyTimeoutHandler = () => {
    if (timeoutHandler) {
        clearTimeout(timeoutHandler)
        timeoutHandler = null
    }
}

function _enableTracing(reqId) {
    const execId = asyncHooks.executionAsyncId()
    rootExecutionId = execId
    awsRequestId = reqId
    taskTracingActive = true
}

function _disableTracing() {
    taskTracingActive = false
    rootExecutionId = null
    awsRequestId = null
}

function _dumpTasks() {
    let msg = 'Tasks:\n'
    for (const [key, value] of tasks) {
        msg += `- id=${key}, info=${JSON.stringify(value)}\n`
    }
    logger.info(msg)
}

function _dumpTaskGroups() {
    let msg = 'Task groups:\n'
    for (const [key, value] of taskGroups) {
        msg += `- ${JSON.stringify(value)}\n`
    }
    logger.info(msg)
}

const _beforeInvocation = async (opts, event, context) => {
    // Destroy/cancel previous timeout handler if there is
    _destroyTimeoutHandler()

    // Setup new timeout handler
    _setupTimeoutHandler(opts, context)

    // Enable tracing
    _enableTracing(context.awsRequestId)
}

const _afterInvocation = async (
    opts,
    event,
    context,
    response,
    error,
    timeout
) => {
    // Disable tracing
    _disableTracing()

    // Destroy/cancel timeout handler
    _destroyTimeoutHandler()
}

module.exports = {
    beforeInvocation: _beforeInvocation,
    afterInvocation: _afterInvocation,
    dumpTasks: _dumpTasks,
    dumpTaskGroups: _dumpTaskGroups,
}

_init()
