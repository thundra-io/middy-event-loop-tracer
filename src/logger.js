module.exports.info = function (msg) {
    console.info('[MIDDY-ELT]', msg)
}

module.exports.error = function (msg, e) {
    console.error('[MIDDY-ELT]', msg, e)
}
