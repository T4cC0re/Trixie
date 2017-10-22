'use strict';
import '../../shared/Action'

async function action(...args: string[]) {
  const data = await platform1.srvdb.propsearch(...args);
  for (const host in data){
    for(const prop in data[host]){
      subAction('srvdb.history', host, prop);
    }
  }
}
