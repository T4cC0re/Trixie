'use strict';
///<reference path="../shared/Action.d.ts"/>

async function action(pattern: string): Promise<boolean> {
  const result = await platform1.srvdb.srvfind(pattern);
  if (!result) {
    return false;
  }

  for (const srvId in result) {
    log(`${platform1.srvdb.srv2ip(srvId)} ${result[srvId].net}: ${result[srvId].serviceNames.sort().join(', ')}`)
  }

  return true;
}