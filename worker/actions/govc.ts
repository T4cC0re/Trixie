'use strict';

action = async (...args: string[]) => {
    const data = await vmware.govc.launch(...args);
    data.stdout && console.log(data.stdout);
    data.stderr && console.error(data.stderr);
    if (data.status > 0) {
        throw new Error('GOVC failed to launch');
    }
    return true;
};
