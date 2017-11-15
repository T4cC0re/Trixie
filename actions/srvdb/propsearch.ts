'use strict';
///<reference path="../shared/Action.d.ts"/>

async function action(...args: string[]) {
  const data = await platform1.srvdb.propsearch(...args);
  for (const host in data){
    for(const prop in data[host]){
      log(`${host}:${prop}=${data[host][prop]}`);
    }
  }
}
