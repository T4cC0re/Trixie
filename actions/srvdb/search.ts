'use strict';

///<reference path="../shared/Action.d.ts"/>

async function action(...args: string[]) {
  const data = await platform1.srvdb.search(...args);
  for (const host of data) {
    log(host);
  }
  return true;
}
