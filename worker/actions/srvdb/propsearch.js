'use strict';

async function action(...args) {
  const data = await platform1.srvdb.propsearch(...args);
  for (const host in data){
    for(const prop in data[host]){
      console.log(`${host}:${prop}=${data[host][prop]}`);
    }
  }
}
