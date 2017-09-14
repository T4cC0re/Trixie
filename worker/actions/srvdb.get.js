'use strict';

async function action(...args) {
  const data = await platform1.srvdb.get(...args);
  for (const prop in data){
    console.log(`${prop}=${data[prop]}`);
  }
}
