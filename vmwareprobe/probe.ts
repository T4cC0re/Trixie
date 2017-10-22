import { ChildRPC } from "libRPC";
import { VMWare } from "../shared/vmware";

const rpc = new ChildRPC();
rpc.registerProcess();

setImmediate(async () => {
  const globalConfig = await rpc.callOnMaster<any>('getConfig');
  const vmware = new VMWare(globalConfig.ADCredentials.username, globalConfig.ADCredentials.password, globalConfig.vmware.url, globalConfig.vmware.govc);
  const data = await vmware.gatherVMWareData();
  console.log(data);
  await rpc.callOnMaster('updateVMWareData', data);

  process.exit(0);
});