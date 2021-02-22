// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

require('module-alias/register');
require('dotenv').config();
const fetch = require('node-fetch');
const AsyncLock = require('async-lock');
const { default: PQueue } = require('p-queue');
require('@dbc/common/init');
const logger = require('@dbc/common/logger');
const { getFrameworkInformer } = require('@dbc/common/k8s');
const { alwaysRetryDecorator } = require('@dbc/common/util');
const config = require('@dbc/watcher/framework/config');
const axios = require('axios').default;
const profiler = require('v8-profiler-node8');
const fs = require('fs');

const BlackHoleStream = require("black-hole-stream");

// Here, we use AsyncLock to control the concurrency of frameworks with the same name;
// e.g. If framework A has event1, event2, and event3, we use AsyncLock
// to ensure they will be delivered to write-merger in order.
// In the same time, we use PQueue to control the concurrency of frameworks with different names;
// e.g. If there are framework 1 ~ framework 30000, only some of them can be processed concurrently.
const lock = new AsyncLock({ maxPending: Number.MAX_SAFE_INTEGER });
const queue = new PQueue({ concurrency: config.maxRpcConcurrency });

async function synchronizeFramework(eventType, apiObject) {
  const res = await fetch(
    `${config.writeMergerUrl}/api/v1/watchEvents/${eventType}`,
    {
      method: 'POST',
      body: JSON.stringify(apiObject),
      headers: { 'Content-Type': 'application/json' },
      timeout: config.writeMergerConnectionTimeoutSecond * 1000,
    },
  );
  // res.body.pipe(new BlackHoleStream())
  if (!res.ok) {
    throw new Error(`Request returns a ${res.status} error.`);
  }
}

async function synchronizeFrameworkAxios(eventType, apiObject) {
  await axios(
    {
      method: 'post',
      url: `${config.writeMergerUrl}/api/v1/watchEvents/${eventType}`,
      data: JSON.stringify(apiObject),
      headers: { 'Content-Type': 'application/json' },
      timeout: config.writeMergerConnectionTimeoutSecond * 1000,
    },
  );
}


const eventHandler = (eventType, apiObject) => {
  /*
    framework name-based lock + always retry
  */
  const receivedTs = new Date().getTime();
  const state =
    apiObject.status && apiObject.status.state
      ? apiObject.status.state
      : 'Unknown';
  logger.info(
    `Event type=${eventType} receivedTs=${receivedTs} framework=${apiObject.metadata.name} state=${state} received.`,
  );
  // lock.acquire(apiObject.metadata.name, () => {
  //   return queue.add(
  //     alwaysRetryDecorator(
  //       () => synchronizeFrameworkAxios(eventType, apiObject),
  //       `Sync to write merger type=${eventType} receivedTs=${receivedTs} framework=${apiObject.metadata.name} state=${state}`,
  //     ),
  //   );
  // });
  synchronizeFramework(eventType, apiObject);
};

async function timePeriod(ms) {
  await new Promise((resolve, reject) => {
    setTimeout(() => resolve(), ms);
  });
}

function outputSnapshot(){
  global.gc();
  logger.warn('ok')
  logger.warn('output snapshot')
  const snapshot = profiler.takeSnapshot();
  logger.warn('gc!')
  const d = new Date();
  snapshot.export(function(error, result) {
    fs.writeFileSync(`snapshot-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}.heapsnapshot`, result);
    snapshot.delete();
  });
}

// outputSnapshot()
// setInterval(outputSnapshot, 1200 * 1000)

const informer = getFrameworkInformer(600);

setInterval(() => {global.gc(); logger.warn('gc!')}, 20000)


informer.on('add', apiObject => {
  eventHandler('ADDED', apiObject);
});
informer.on('update', apiObject => {
  eventHandler('MODIFED', apiObject);
});
informer.on('delete', apiObject => {
  eventHandler('DELETED', apiObject);
});
informer.on('error', err => {
  // If any error happens, the process should exit, and let Kubernetes restart it.
  logger.error(err, function() {
    setTimeout(() => {

      informer.start();
    }, 5000);
  });
});
informer.start();


// function makeid(length) {
//    let result           = [];
//    let characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//    let charactersLength = characters.length;
//    for (let i = 0; i < length; i++ ) {
//       result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
//    }
//    return result.join('');
// }


// setInterval(outputSnapshot, 1000 * 300)


// function getLargeString(sizeMB) {
//   return makeid(sizeMB * 1024 * 1024)
// }



// async function postIt(str) {
//   const res = await fetch(
//     `${config.writeMergerUrl}/api/v1/watchEvents/UNKNOWN`,
//     {
//       method: 'POST',
//       body: JSON.stringify({str: str}),
//       headers: { 'Content-Type': 'application/json' },
//       timeout: config.writeMergerConnectionTimeoutSecond * 1000,
//     },
//   );
// }

// intervalSeconds = 10
// concurrentRequest = 30

// async function doIt() {
//   while(true) {
//     str = getLargeString(10)
//     for (let i = 0; i < concurrentRequest; i++){
//       console.log(i)
//       postIt(str).catch(err => logger.error(err))
//     }
//     await timePeriod(1000 * intervalSeconds)
//   }
// }


// doIt()




