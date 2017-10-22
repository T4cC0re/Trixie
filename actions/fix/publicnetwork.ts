'use strict';
import '../../shared/Action'

async function action (srvId: string) {
    const vmInfo = JSON.parse((await vmware.govc.launch('vm.info', '-json', `vm/${srvId}`)).stdout || null);
    let vmName = null;
    if (vmInfo && vmInfo.VirtualMachines && vmInfo.VirtualMachines.length === 1) {
        // We have found exactly one VM with the 'fake' name. This means it'll work.
        vmName = `vm/${srvId}`;
    } else {
        // Fallback via search (slower)
        const vmNames = (await vmware.govc.launch('find', 'vm', '-name', srvId)).stdout.split('\n');
        if (vmNames.length > 1) {
            error('More than 1 machine found');
            return false;
        }
        if (vmNames.length < 1) {
            error('No machine found');
            return false;
        }
        vmName = vmNames[0];
    }

    if (!vmName || !vmName.includes('vm/')) {
        error('vm not found');
        return false;
    }

    const success = await subAction<boolean>('fix.eth', srvId, vmName, 1, '4_pub_nuev');
    if (success) {
        log('Success!');
    } else {
        log('Failure!');
    }

    return success;
};
