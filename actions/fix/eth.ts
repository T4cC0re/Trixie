'use strict';
///<reference path="../shared/Action.d.ts"/>

async function action(srvId: string, vmName: string, eth: number, network: string): Promise<boolean> {
  // Does the VM have a 2nd if?
  const tmp1 = JSON.parse((await vmware.govc.launch('device.info', '-json', '-vm', vmName, `ethernet-${eth}`)).stdout || 'null');
  let ethX = null, oldMAC = null;
  if (tmp1 && tmp1.Devices.length) {
    ethX = tmp1.Devices[0];
  }

  if (ethX) {
    if (ethX.Connectable.StartConnected === true && ethX.Connectable.Connected === true) {
      error(ethX.MacAddress);
      error(`eth${eth} is already ok!`);
      // Synchronously register MAC for VM to be sure.
      const properties = {};
      properties[`macs.${eth}`] = ethX.MacAddress;
      await platform1.srvdb.set(srvId, properties);
      return true;
    } else {
      error(`eth${eth} has broken config. removing it!`);
      if (/^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$/i.test(ethX.MacAddress)) {
        oldMAC = ethX.MacAddress.replace('-', ':');
      }
      // Remove the old interface
      if ((await vmware.govc.launch('device.remove', `-vm=${vmName}`, `ethernet-${eth}`)).status) {
        throw new Error(`Could not remove interface`);
      }
    }
  }

// No ethX (anymore :D)
// Try to fetch MAC from srvdb
  let mac = null, srvdbmacs = await platform1.srvdb.getValues(srvId, `macs.${eth}`);

// Do we get a non-empty response from srvdb?
  if (srvdbmacs.length) {
    // Use mac from srvdb then...
    mac = srvdbmacs[0];
    error(`Using MAC ${mac} from srvdb`);
  } else {
    // Use old MAC if existent or generate a unique MAC (unique in srvdb, that is)
    if (oldMAC) {
      error(`Reusing MAC ${oldMAC} from old interface`);
      mac = oldMAC;
    } else {
      mac = Util.generateVMWareMac();
      while (!await platform1.srvdb.macAvailable(mac)) {
        mac = Util.generateVMWareMac();
      }
      error(`Generated MAC ${mac}`);
    }

    // Asynchronously register mac for VM.
    const properties = {};
    properties[`macs.${eth}`] = mac;
    await platform1.srvdb.set(srvId, properties);
  }

  if ((await vmware.govc.launch('vm.network.add', `-vm=${vmName}`, `-net=${network}`, '-net.adapter=vmxnet3', `-net.address=${mac}`)).status) {
    throw new Error("Could not add interface")
  }
  error('Added new interface to VM');

  return true;
}
