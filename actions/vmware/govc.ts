'use strict';
import '../../shared/Action'

async function action(...args: string[]) {
  const data = await vmware.govc.launch(...args);
  data.stdout && log(data.stdout);
  data.stderr && error(data.stderr);
  if (data.status > 0) {
    throw new Error('GOVC failed to launch');
  }
  return true;
};
