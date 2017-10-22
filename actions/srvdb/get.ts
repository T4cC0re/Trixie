'use strict';
import '../../shared/Action'

async function action(...args: string[]) {
  const data = await platform1.srvdb.get(...args);
  for (const prop in data) {
    log(`${prop}=${data[prop]}`);
  }
  return true;
}
