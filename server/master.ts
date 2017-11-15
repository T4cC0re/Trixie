'use strict';

import 'libError';
import { fork } from 'cluster';
import { fork as cp_fork } from 'child_process';

import { MasterRPC } from 'libRPC';
import { cpus } from 'os';
import { VMWareData } from '../shared/vmware';
import { writeFileSync } from 'fs';

const config = require('../config.json');
let vmwareData: VMWareData = null;
const masterRPC = new MasterRPC();
masterRPC.registerProcess();

const getConfig = (): any => {
  return config;
};

const updateVMWareData = (newVMWareData: VMWareData): boolean => {
  console.log('updateVMWareData');
  vmwareData = newVMWareData;
  writeFileSync('../vmware.json', JSON.stringify(vmwareData, null, 2));
  return true;
};

const getVMWareData = (): VMWareData => {
  if (!vmwareData) {
    throw new Error('No VMWareData cached, yet. Please wait a while and try again.');
  }
  console.log('getVMWareData');
  return vmwareData;
};

const fakeAllocOnCluster = async (cluster: string, cores: number = 1, memory: number = 1): Promise<boolean> => {
  if (!vmwareData.cluster || !vmwareData.cluster[cluster]) {
    return false;
  }

  console.log('fakeAllocOnCluster');
  vmwareData.cluster[cluster].cpu -= cores * 2000;  // Assume 2GHz / core is used
  vmwareData.cluster[cluster].mem -= memory * 1024; // Duh!
  return true;
};

masterRPC.registerFunction('getConfig', getConfig);
masterRPC.registerFunction('updateVMWareData', updateVMWareData);
masterRPC.registerFunction('getVMWareData', getVMWareData);
masterRPC.registerFunction('fakeAllocOnCluster', fakeAllocOnCluster);

const forkTrixie = () => {
  masterRPC.installHandlerOn(fork().on('error', forkTrixie).on('exit', forkTrixie));
};

const runVMWareProbe = (wait: boolean = false): Promise<void> => {
  const proc = cp_fork('../vmwareprobe/probe');
  masterRPC.installHandlerOn(proc);
  if (!wait) {
    return new Promise<void>((resolve => {
      resolve();
    }));
  }
  return new Promise<void>((resolve => {
    proc.on('exit', function () {
      resolve();
    });
  }));
};

setImmediate(async() => {
  try {
    vmwareData = require('../vmware.json');
    // Refresh the cache in background.
    // runVMWareProbe();
  } catch (_ignore) {
    console.error('VMWare cache not found. Fetching...');
    await runVMWareProbe(true);
  }
  console.error('Starting up...');

  for (let c = 0; c < cpus().length; c++) {
    forkTrixie();
  }

  setInterval(runVMWareProbe, 300000);
});
