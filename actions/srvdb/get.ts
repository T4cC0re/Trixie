'use strict';

///<reference path="../shared/Action.d.ts"/>

async function action(...args: string[]) {
  const data = await platform1.srvdb.get(...args);
  for (const prop in data) {
    log(`${prop}=${data[prop]}`);
  }
  return true;
}
