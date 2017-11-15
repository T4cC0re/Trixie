'use strict';
///<reference path="../shared/Action.d.ts"/>
import { SRVHist } from '../../shared/platform1/srvdb';
// const formatTimeStamp = require("lib/util").Util.formatTimeStamp;

const formatTimeStamp = (ts: number) => {
  const date = new Date(ts * 1000);
  return `${
    date.getUTCFullYear()}-${
    (date.getUTCMonth() + 1).toString().padStart(2, '0')}-${
    date.getUTCDate().toString().padStart(2, '0')} ${
    date.getUTCHours().toString().padStart(2, '0')}:${
    date.getUTCMinutes().toString().padStart(2, '0')}:${
    date.getUTCSeconds().toString().padStart(2, '0')
    }`;
};

async function action(...args: string[]) {
  let onlycurrent = false;
  if (args.length >= 2) {
    if (args[0] === '-c') {
      args = args.slice(1);
      onlycurrent = true;
    }
    if (args[1] === '-c') {
      args = [args[0], ...args.slice(2) || []];
      onlycurrent = true;
    }
  }
  log(onlycurrent, args);

  let data = await platform1.srvdb
    .history(args[0], onlycurrent, ...args.slice(1) || [])
    .sort((a: SRVHist, b: SRVHist) => b.ts - a.ts);

  for (const hist of data) {
    log(`${hist.user.padEnd(31, ' ')}${formatTimeStamp(hist.ts)} ${hist.name}=${hist.value}`);
  }
}
