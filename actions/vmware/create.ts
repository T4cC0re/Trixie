'use strict';
import '../../shared/Action'

/**
 * @param {string} datacenter
 * @param {number} cores
 * @param {number} memory
 * @param {number} disk
 * @param {string} os/template
 * @returns {Promise<string>} Path to vm in VMWare (e.g. vm/srv000000)
 */
async function action(datacenter: string, cores: number, memory: number, disk: number, os: string) {
  const dcConfig = vmware.loadDCConfig(datacenter);
  const debug = dcConfig.domain === "debug";
  const osConfig = vmware.loadOSConfig(dcConfig.isPinf ? "pinf" : "platform1", os);
  log(osConfig);
  log(`Using dc ${dcConfig.domain} (${dcConfig.isPinf ? "pinf" : "platform1"}) to spawn ${os} ${osConfig.isTemplate ? 'from template' : 'via PXE'}...`);
  let cluster, storage, host;
  if (debug) {
    cluster = "-";
    storage = "FreeNAS";
    host = "soarin.localdomain";
  } else {
    cluster = await vmware.getLeastUsedCluster(dcConfig.domain);
    storage = await vmware.getBestStorageInCluster(cluster);
    host = await vmware.getHostInCluster(cluster);
  }

  log(`Detected cluster ${cluster} to have the most free resources`);
  log(`Using storage '${storage}'`);
  log(`Using host '${host}'`);

  const macs: { [net: string]: string } = {};
  for (const net of dcConfig.networks) {
    let mac = Util.generateVMWareMac();
    if (!debug) {
      while (!await platform1.srvdb.macAvailable(mac)) {
        mac = Util.generateVMWareMac();
      }
    }
    macs[net] = mac;
  }
  log(macs);

  let srvId;
  if (debug) {
    srvId = "srv254254";
  } else {
    srvId = platform1.srvdb.regsrv(...dcConfig.networks.map((net: string) => macs[net]));
  }

  if (osConfig.isTemplate) {
    await createFromTemplate(host, storage, disk, memory, cores, dcConfig.networks[0], macs[dcConfig.networks[0]], osConfig.template, srvId);
  } else {
    await createFromScratch(host, storage, disk, memory, cores, dcConfig.networks[0], macs[dcConfig.networks[0]], osConfig.guestName, srvId);
    if (osConfig.isPXE) {
      //TODO: Call to oneshor
    }
  }

  for (const eth in dcConfig.networks) {
    if ((eth as any as number) == 0) {
      continue;
    }
    await subAction('fix.eth', srvId, srvId, eth, dcConfig.networks[eth]);
  }

  await setBootOrder(srvId, 'ethernet,disk');

  return false;
}

const setBootOrder = async (srvId: string, order: string) => {
  const proc = await vmware.govc.launch('device.boot', `-vm=${srvId}`, `-order=${order}`);

  log(proc.stdout);
  error(proc.stderr);

  if (proc.status) {
    throw new Error("Could not set boot-order");
  }
};

const createFromScratch = async (host: string,
                                 storage: number,
                                 disk: number,
                                 memory: number,
                                 cores: number,
                                 network: string,
                                 mac: string,
                                 guestOS: string,
                                 srvId: string) => {
  const proc = await vmware.govc.launch(
    'vm.create',
    `-host=${host}`,
    `-ds=${storage}`,
    `-disk=${disk}GB`,
    `-disk.controller=lsilogic`,
    `-m=${memory * 1024}`,
    `-c=${cores}`,
    `-on=false`,
    `-annotation=TrixieBuilt`,
    `-net=${network}`,
    `-net.address=${mac}`,
    `-net.adapter=vmxnet3`,
    `-g=${guestOS}`,
    srvId
  );
  log(proc.stdout);
  error(proc.stderr);

  if (proc.status) {
    throw new Error("Could not create VM");
  }
};

const createFromTemplate = async (host: string,
                                  storage: number,
                                  disk: number,
                                  memory: number,
                                  cores: number,
                                  network: string,
                                  mac: string,
                                  template: string,
                                  srvId: string) => {
  let proc = await vmware.govc.launch(
    'vm.clone',
    `-host=${host}`,
    `-ds=${storage}`,
    `-m=${memory * 1024}`,
    `-c=${cores}`,
    `-on=false`,
    `-annotation=TrixieBuilt`,
    `-net=${network}`,
    `-net.address=${mac}`,
    `-net.adapter=vmxnet3`,
    `-vm=${template}`,
    srvId
  );
  log(proc.stdout);
  error(proc.stderr);

  if (proc.status) {
    throw new Error("Could not create VM");
  }

  proc = await vmware.govc.launch('vm.disk.change', `-vm=${srvId}`, `-size=${disk}GB`);

  log(proc.stdout);
  error(proc.stderr);

  if (proc.status) {
    error("Could not extend disk. Ignoring...");
  }
};