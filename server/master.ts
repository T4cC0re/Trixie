'use strict';

import 'libError';
import { fork } from 'cluster';
import { fork as cp_fork } from 'child_process';

import { MasterRPC } from "libRPC";
import { cpus } from "os"

const config = require('../config.json');
const vmwareData = {};
const masterRPC = new MasterRPC();
masterRPC.registerProcess();

const getConfig = (): any => {
  return config;
};

const updateVMWareData = (newVmwareData: any): void => {
  Object.assign(vmwareData, newVmwareData);
  console.log('vmwareData updated!', vmwareData);
};

const getVMWareData = (): any => {
  console.log('getVMWareData');
  return vmwareData;
};

masterRPC.registerFunction('getConfig', getConfig);
masterRPC.registerFunction('updateVMWareData', updateVMWareData);
masterRPC.registerFunction('getVMWareData', getVMWareData);

const forkTrixie = () => {
  masterRPC.installHandlerOn(fork().on('error', forkTrixie).on('exit', forkTrixie));
};

const runVMWareProbe = () => {
  masterRPC.installHandlerOn(cp_fork('../vmwareprobe/probe'));
};

for (let c = 0; c < cpus().length; c++) {
  forkTrixie();
}

runVMWareProbe();
setInterval(runVMWareProbe, 60000);
