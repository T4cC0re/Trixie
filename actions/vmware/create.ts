'use strict';

///<reference path="../shared/Action.d.ts"/>

/**
 * @param {string} datacenter
 * @param {number} cores
 * @param {number} memory
 * @param {number} disk
 * @param {string} os/template
 * @param {number} count
 * @returns {Promise<string>} Path to vm in VMWare (e.g. vm/srv000000)
 */
async function action(datacenter: string, cores: number, memory: number, disk: number, os: string, count: number) {
  let spawns: Promise<string>[] = [];

  for (let i = 0; i < count; i++) {
    spawns.push(spawn(datacenter, cores, memory, disk, os));
  }

  const srvIds = await Promise.all(spawns);

  log(`Successfully spawned:\n - ${srvIds.join(`\n - `)}`);

}

const spawn = async (datacenter: string, cores: number, memory: number, disk: number, os: string): Promise<string> => {
  try {
    const createDate = Math.round(Date.now() / 1000);
    const dcConfig = vmware.loadDCConfig(datacenter);
    const debug = dcConfig.domain === 'debug';
    const osConfig = vmware.loadOSConfig(dcConfig.isPinf ? 'pinf' : 'platform1', os);
    log(`Using dc ${dcConfig.domain} (${dcConfig.isPinf ? 'pinf' : 'platform1'}) to spawn ${os} ${osConfig.isTemplate ? 'from template' : 'via PXE'}...`);

    const cluster = await vmware.getLeastUsedCluster(dcConfig.domain);
    const storage = await vmware.getBestStorageInCluster(cluster);
    const host = await vmware.getHostInCluster(cluster);

    log(`Detected cluster ${cluster} to have the most free resources`);
    log(`Using storage '${storage}'`);
    log(`Using host '${host}'`);

    if (!await vmware.fakeAllocOnCluster(cluster, cores, memory)) {
      error(`could not fake allocate ${cores} CPU and ${memory} GiB RAM on cluster ${cluster}`);
    }

    log(`Generating MAC addresses...`);
    const macs: { [net: string]: string } = {};
    for (const net of dcConfig.networks) {
      let mac = Util.generateVMWareMac();
      while (!await platform1.srvdb.macAvailable(mac)) {
        mac = Util.generateVMWareMac();
      }
      macs[net] = mac;
    }

    const srvId = await platform1.srvdb.regsrv(...dcConfig.networks.map((net: string) => macs[net]));
    await platform1.srvdb.set(srvId, {net: dcConfig.isPinf ? dcConfig.networks[0] : datacenter || ''});

    log(`Spawning as: ${srvId}`);

    if (osConfig.isTemplate) {
      log(`Spawning from template...`);
      await createFromTemplate(host, storage, disk, memory, cores, dcConfig.networks[0], macs[dcConfig.networks[0]], osConfig.template, srvId);
    } else {
      await createFromScratch(host, storage, disk, memory, cores, dcConfig.networks[0], macs[dcConfig.networks[0]], osConfig.guestName, srvId);
    }

    for (const eth in dcConfig.networks) {
      log(`Creating and registering ethernet-${eth} in srvdb...`);
      await subAction('fix.eth', srvId, srvId, eth, dcConfig.networks[eth]);
    }

    if (osConfig.isPXE) {
      if (dcConfig.isPinf) {
        const mac1 = await platform1.srvdb.getValues(srvId, 'macs.0');
        await ssh.execute('autoinstall-792-pinf600-01.bigpoint.net', 'svc_trixie', log, error, `/usr/local/bin/generate-pxe-configuration-for-mac.py --mac ${mac1} --target ${os}`);
      } else {
        await ssh.execute(`autoinstall.${datacenter}.bigpoint.net`, 'svc_trixie', log, error, `/home/autoinstall/scripts/setoneshot ${srvId} ${os}`);
      }
    }

    const bootorder = osConfig.isTemplate ? 'disk' : 'ethernet,disk';

    log(`Setting boot-order, hot-add and sttributes...`);
    await Promise.all([vmware.enableHotAdd(srvId), vmware.setAttributes(srvId, user.account, createDate), vmware.setBootOrder(srvId, bootorder)]);

    log(`Powering on...`);
    await vmware.powerOn(srvId);

    if (dcConfig.isPinf || osConfig.isTemplate) {
      log(`Waiting for an IP...`);
      // Wait 4 minutes for a template and 15 for a PXE install.
      const ip = await vmware.waitForIP(srvId, osConfig.isTemplate ? 240 : 900);
      log(`IP: ${ip}`);

      // Hack for P1 ubuntu
      if (os == 't_bp-xenial') {
        log('Bootstrapping P1...');
        await ssh.execute(ip, 'autoinstall', log, error, 'wget -q http://autoinstall.bigpoint.net/p1-ubuntu/slim-late.sh -O late.sh ; sudo bash late.sh');
      }
    }

    log('Done');

    return srvId;
  } catch (_ignore) {
    return 'failed!';
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
    srvId,
  );
  log(proc.stdout);
  error(proc.stderr);

  if (proc.status) {
    throw new Error('Could not create VM');
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
    srvId,
  );
  log(proc.stdout);
  error(proc.stderr);

  if (proc.status) {
    throw new Error('Could not create VM');
  }

  proc = await vmware.govc.launch('vm.disk.change', `-vm=${srvId}`, `-size=${disk}GB`);

  log(proc.stdout);
  error(proc.stderr);

  if (proc.status) {
    error('Could not extend disk. Ignoring...');
  }
};