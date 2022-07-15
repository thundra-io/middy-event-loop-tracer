# middy-event-loop-tracer

![build Status](https://github.com/serkan-ozal/middy-event-loop-tracer/actions/workflows/build.yml/badge.svg)
![npm version](https://badge.fury.io/js/middy-event-loop-tracer.svg)
![license](https://img.shields.io/badge/license-MIT-blue)

Middy middleware for dumping active tasks with their stacktraces in the event queue just before AWS Lambda function timeouts. 
So you can understand what was going on in the function when timeout happens. 

A sample event loop dump will look like this:
```
START RequestId: 90dc31a4-10cf-4485-8c8e-914891b4cddb Version: $LATEST
2021-11-30T17:24:58.366Z	90dc31a4-10cf-4485-8c8e-914891b4cddb	INFO	About timeout! Dumping active tasks in the event loop ...
2021-11-30T17:24:58.366Z	90dc31a4-10cf-4485-8c8e-914891b4cddb	INFO	Task groups:
2021-11-30T17:24:58.366Z	90dc31a4-10cf-4485-8c8e-914891b4cddb	INFO	- 
{
    "id": "PROMISE@90dc31a4-10cf-4485-8c8e-914891b4cddb_1662448958",
    "type": "PROMISE",
    "awsRequestId": "90dc31a4-10cf-4485-8c8e-914891b4cddb",
    "count": 1380,
    "stackTrace": [
        "    at AsyncHook._initAsync (/var/task/src/middleware.js:95:11)",
        "    at PromiseWrap.emitInitNative (internal/async_hooks.js:195:43)",
        "    at new Promise (<anonymous>)",
        "    at Request.promise (/var/runtime/node_modules/aws-sdk/lib/request.js:783:12)",
        "    at myHandler (/var/task/src/index.js:31:46)",
        "    at runRequest (/var/task/node_modules/@middy/core/index.js:86:32)"
    ]
}

2021-11-30T17:24:58.366Z	90dc31a4-10cf-4485-8c8e-914891b4cddb	INFO	- 
{
    "id": "TCPWRAP@90dc31a4-10cf-4485-8c8e-914891b4cddb_842007963",
    "type": "TCPWRAP",
    "awsRequestId": "90dc31a4-10cf-4485-8c8e-914891b4cddb",
    "count": 50,
    "stackTrace": [
        "    at AsyncHook._initAsync (/var/task/src/middleware.js:95:11)",
        "    at TCP.emitInitNative (internal/async_hooks.js:195:43)",
        "    at TLSSocket._wrapHandle (_tls_wrap.js:592:7)",
        "    at new TLSSocket (_tls_wrap.js:499:18)",
        "    at Object.connect (_tls_wrap.js:1595:19)",
        "    at Agent.createConnection (https.js:132:22)",
        "    at Agent.createSocket (_http_agent.js:321:26)",
        "    at Agent.addRequest (_http_agent.js:275:10)",
        "    at new ClientRequest (_http_client.js:297:16)",
        "    at Object.request (https.js:316:10)"
    ]
}

2021-11-30T17:24:58.366Z	90dc31a4-10cf-4485-8c8e-914891b4cddb	INFO	- 
{
    "id": "HTTPCLIENTREQUEST@90dc31a4-10cf-4485-8c8e-914891b4cddb_2122473569",
    "type": "HTTPCLIENTREQUEST",
    "awsRequestId": "90dc31a4-10cf-4485-8c8e-914891b4cddb",
    "count": 50,
    "stackTrace": [
        "    at AsyncHook._initAsync (/var/task/src/middleware.js:95:11)",
        "    at HTTPClientAsyncResource.emitInitNative (internal/async_hooks.js:195:43)",
        "    at tickOnSocket (_http_client.js:679:10)",
        "    at onSocketNT (_http_client.js:750:5)",
        "    at processTicksAndRejections (internal/process/task_queues.js:84:21)"
    ]
}

END RequestId: 90dc31a4-10cf-4485-8c8e-914891b4cddb
REPORT RequestId: 90dc31a4-10cf-4485-8c8e-914891b4cddb	Duration: 5005.41 ms	Billed Duration: 5000 ms	Memory Size: 1024 MB	Max Memory Used: 139 MB	Init Duration: 447.07 ms	
2021-11-30T17:24:58.869Z 90dc31a4-10cf-4485-8c8e-914891b4cddb Task timed out after 5.01 seconds
```


## Installation

You can add `middy-event-loop-tracer` package into your AWS Lambda function either by NPM package or by AWS Lambda layer as shown below:

### By NPM package

To install the middleware, you can use NPM:

```
npm install --save middy-event-loop-tracer
```

### By AWS Lambda Layer

You can also add `middy-event-loop-tracer` as layer into your AWS Lambda function.

```
arn:aws:lambda:${region}:273094347961:layer:middy-event-loop-tracer:${layer-version}

```

**Latest layer version:** ![middy-event-loop-tracer](https://api.globadge.com/v1/badgen/aws/lambda/layer/latest-version/us-east-1/273094347961/middy-event-loop-tracer) (badge powered by [Globadge serverless](https://www.globadge.com/badges/serverless))

**Note:** In the ARN above, you need to replace `${region}` with the actual AWS region you deployed your AWS Lambda function. 

### Notes on installation

- The `middy-event-loop-tracer` requires `@middy/core` version `2.0.0`+. 

- There is also **standalone** mode to be able to use `middy-event-loop-tracer` without `middy` framework. You can check [Standalone Usage (without Middy)](#standalone-usage-without-middy) section for the details.


## Usage

* Register `middy-event-loop-tracer` middleware in your handler:
```javascript
const middy = require('@middy/core');
const eventLoopTracer = require('middy-event-loop-tracer');

const handler = async(event, context) => {
  // Do something meaningful

  return {
    statusCode: 200,
  }
}

module.exports.handler = middy(handler).use(eventLoopTracer());
```

* **Optionally**, you can configure timeout margin which is the minimum remaining time 
before the actual timeout happens to assume that invocation will timeout. 
So we take action and dump the active tasks in the event loop because when the timeout happens, 
the game is over and there is nothing to do.
By default, timeout margin is `500` milliseconds and 
it can be configured by *environment variable* or *options* passed to middleware:

  - **By environment variable:**
  Set `MIDDY_ELT_TIMEOUT_MARGIN` environment variable with the desired value for the timeout margin.
  ```
  MIDDY_ELT_TIMEOUT_MARGIN=250
  ```  

  - **By options:**
  Pass the timeout margin through options.
  ```javascript
  const eventLoopTracer = require('middy-event-loop-tracer');

  module.exports.handler = middy(handler).use(eventLoopTracer({timeoutMargin: 250}));
  ```
  
* **Optionally**, you can disable/enable event loop tracer without changing code even though it is registered to `middy` or self activated on bootstrap.

  - **By environment variable:**
  Set `MIDDY_ELT_ENABLE` environment variable to `false` to disable event loop tracer or to `true` (which is default) to enable tracer back.
  ```
  MIDDY_ELT_ENABLE=false
  ```  

## Standalone Usage (without Middy)

If you want to use `middy-event-loop-tracer` standalone without `middy`, you need to activate standalone mode during bootstrap through environment variable without any code change. For activation, you need to set (or append to existing one) `NODE_OPTIONS` environment variable with the standalone mode bootstrap options to initialize tracer at startup:
  ```
  NODE_OPTIONS=-r middy-event-loop-tracer/src/bootstrap
  ```  
  
To configure tracer in the standalone mode, you can use **environment variables** mentioned in the [Usage](#usage) section above.  

## Contributing

Everyone is very welcome to contribute to this repository. 
Feel free to [raise issues](https://github.com/serkan-ozal/middy-event-loop-tracer/issues) 
or to [submit Pull Requests](https://github.com/serkan-ozal/middy-event-loop-tracer/pulls).


## License

Licensed under [MIT License](LICENSE).
