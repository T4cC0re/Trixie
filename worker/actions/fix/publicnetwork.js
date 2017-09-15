'use strict';

async function action(...args) {
  const srvid = args[0];
  const vmInfo = JSON.parse((await vmware.govc.launch('vm.info', '-json', `vm/${srvid}`)).stdout || null);
  let vmName = null;
  if (vmInfo && vmInfo.VirtualMachines && vmInfo.VirtualMachines.length === 1) {
    // We have found exactly one VM with the 'fake' name. This means it'll work.
    vmName = `vm/${srvid}`;
  } else {
    // Fallback via search (slower)
    const vmNames = (await vmware.govc.launch('find', 'vm', '-name', srvid)).stdout.split('\n');
    if (vmNames.length > 1){
      console.error('More than 1 machine found');
      return;
    }
    if (vmNames.length < 1){
      console.error('No machine found');
      return;
    }
    vmName = vmNames[0];
  }

  if (!vmName || !vmName.includes('vm/')) {
    console.error('vm not found');
    return;
  }

  // Does the VM have a 2nd if?
  const tmp1 = JSON.parse((await vmware.govc.launch('device.info', '-json', '-vm', vmName, 'ethernet-1')).stdout || 'null');
  let eth1 = null, oldMAC = null;
  if (tmp1 && tmp1.Devices.length) {
    eth1 = tmp1.Devices[0];
  }

  if(eth1) {
    if (eth1.Connectable.StartConnected === true && eth1.Connectable.Connected === true) {
      console.error('eth1 is already ok!');
      // Synchronously register MAC for VM to be sure.
      await platform1.srvdb.set(srvid, {'macs.1': eth1.MacAddress});
      return;
    } else {
      console.error('eth1 has broken config removing it!');
      if(/^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$/i.test(eth1.MacAddress)){
        oldMAC = eth1.MacAddress.replace('-', ':');
      }
      // Remove the old interface
      await vmware.govc.launch('device.remove', `-vm=${vmName}`, 'ethernet-1');
    }
  }

  // No eth1 / 2nd interface (anymore :D)
  // Try to fetch MAC from srvdb
  let mac = null, srvdbmacs = await platform1.srvdb.getValues(srvid, 'macs.1');

  // Do we get a non-empty response from srvdb?
  if (srvdbmacs.length) {
    // Use mac from srvdb then...
    mac = srvdbmacs[0];
    console.error(`Using MAC ${mac} from srvdb`);
  } else {
    // Use old MAC if existent or generate a unique MAC (unique in srvdb, that is)
    if(oldMAC){
      console.error(`Reusing MAC ${oldMAC} from old interface`);
      mac = oldMAC;
    } else {
      mac = Util.generateVMWareMac();
      while (! await platform1.srvdb.macAvailable(mac)) {
        mac = Util.generateVMWareMac();
      }
      console.error(`Generated MAC ${oldMAC}`);
    }
    // Asynchronously register mac for VM.
    platform1.srvdb.set(srvid, {'macs.1': mac});
  }

  await vmware.govc.launch('vm.network.add', `-vm=${vmName}`, '-net=4_pub_nuev', '-net.adapter=vmxnet3', `-net.address=${mac}`);
  console.error('Added new interface to VM');
}