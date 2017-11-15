'use strict';

///<reference path="../shared/Action.d.ts"/>

async function action(srvid: string) {
  const success = await platform1.purge(srvid);
  log(success);
  return success;
}
