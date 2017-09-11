'use strict';

setImmediate(async () =>{
  const data = await platform1.srvdb.get(...args);
  for (const prop in data){
    console.log(`${prop}=${data[prop]}`);
  }
  const data2 = await platform1.srvdb.srvfind('drasaonline%.%');

  for (const host in data2){
    console.log(`${host}=${data2[host]}`);
  }
});