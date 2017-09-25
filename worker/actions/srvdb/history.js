'use strict';
// const formatTimeStamp = require("lib/util").Util.formatTimeStamp;

const formatTimeStamp = (ts) => {
  const date = new Date(ts*1000);
  return `${
    date.getUTCFullYear()}-${
    (date.getUTCMonth() + 1).toString().padStart(2,'0')}-${
    date.getUTCDate().toString().padStart(2,'0')} ${
    date.getUTCHours().toString().padStart(2,'0')}:${
    date.getUTCMinutes().toString().padStart(2,'0')}:${
    date.getUTCSeconds().toString().padStart(2,'0')
    }`
};

async function action(...args) {
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
  console.log(onlycurrent, args);

  let data = await platform1.srvdb.history(args[0], onlycurrent, ...args.slice(1) || []);

  data = data.sort((a, b) => b.ts - a.ts); // Highest first

  for (const hist of data){
    console.log(`${hist.user.padEnd(31, ' ')}${formatTimeStamp(hist.ts)} ${hist.name}=${hist.value}`)
  }
  // console.log(data);
}
