'use strict';
import { GOVCWrapper } from './vmware/govcWrapper';
import { ChildRPC, ClientRPC } from 'libRPC';

interface PinfCfg {
  vlan: number
  domain: number
  name: string
}

export interface DCConfig {
  isPinf: boolean
  domain: string,
  networks: string[]
  comment: string
  chefEnv?: string // Only set if `isPinf`
}

export interface OSConfig {
  isPXE: boolean
  isTemplate: boolean
  template: string | null
  pxeTarget: string | null
  guestName: string
}

export interface ClusterUtil {
  [name: string]: {
    name: string
    mem: number
    cpu: number
  }
}

export interface ClusterHosts {
  [cluster: string]: string[]
}

export interface VMWareData {
  cluster: ClusterUtil
  hostsInCluster: ClusterHosts
}

export class VMWare {
  private _govc: GOVCWrapper;

  public constructor(username: string, password: string, vcenter: string, govcPath: string = null, private rpc?: ClientRPC | ChildRPC) {
    this._govc = new GOVCWrapper(username, password, vcenter, govcPath);
  }

  public get govc() {
    return this._govc;
  };

  public powerOn = async (vmName: string) => {
    const proc = await this._govc.launch('vm.power', `-on`, vmName);

    if (proc.status) {
      throw new Error('Could not power on');
    }
  };

  public powerOff = async (vmName: string, force: boolean) => {
    const proc = await this._govc.launch('vm.power', `-off`, ...(force ? ['-force', vmName] : [vmName]));

    if (proc.status) {
      throw new Error('Could not power off');
    }
  };

  public setBootOrder = async (vmName: string, order: string) => {
    const proc = await this._govc.launch('device.boot', `-vm=${vmName}`, `-order=${order}`);

    if (proc.status) {
      throw new Error('Could not set boot-order');
    }
  };

  /**
   * Lookup VMWareData on master via RPC or fetch manually and push.
   * Note: If no RPC is available always aggregates!
   * @returns {Promise<VMWareData>}
   */
  private getVMWareData = async (): Promise<VMWareData> => {
    let data: any;
    if (this.rpc) {
      data = await this.rpc.callOnMaster<VMWareData>('getVMWareData');
      if (!data || !Object.keys(data).length) {
        data = await this.gatherVMWareData();
        await this.rpc.callOnMaster('updateVMWareData', data);
      }
    } else {
      data = await this.gatherVMWareData();
    }

    return data;
  };

  public fakeAllocOnCluster = async (cluster: string, cores: number = 1, memory: number = 1): Promise<boolean> => {
    if (!this.rpc) {
      return true;
    }
    return await this.rpc.callOnMaster<boolean>('fakeAllocOnCluster', cluster, cores, memory);
  };

  /**
   * Aggregate VMWareData for usage calculations.
   * @returns {Promise<VMWareData>}
   */
  public gatherVMWareData = async (): Promise<VMWareData> => {
    console.log('gatherVMWareData');

    const data: VMWareData = {
      cluster: {},
      hostsInCluster: {},
    };

    // region gather cluster utilization
    const clusters = JSON.parse((await  this._govc.launch('ls', '-json', 'host/*')).stdout).elements;
    for (let cluster of clusters.map((element: any) => element.Path) as string[]) {
      try {
        //region gather cpu/memory
        if (cluster.toLowerCase().includes('standalone')) {
          continue;
        }
        // @see https://www.vmware.com/support/developer/converter-sdk/conv50_apireference/cluster_services_counters.html
        const CPUUsage = JSON.parse((await this._govc.launch('metric.sample', '-json', cluster, 'clusterServices.effectivecpu.average')).stdout);
        const memUsage = JSON.parse((await this._govc.launch('metric.sample', '-json', cluster, 'clusterServices.effectivemem.average')).stdout);
        const freeCPUMHz = CPUUsage.Sample[0].Value[0].Value.slice(-1)[0] || 0;
        const freeMemMiB = memUsage.Sample[0].Value[0].Value.slice(-1)[0] || 0;
        console.log(cluster, 'freeCPU', freeCPUMHz, 'freeMem', freeMemMiB);
        data.cluster[cluster] = {name: cluster, mem: freeMemMiB, cpu: freeCPUMHz};
        //endregion
      } catch (_ignore) {
      }
      try {
        //region gather hosts for each cluster
        data.hostsInCluster[cluster] = [];
        const result: string = (await this._govc.launch('host.info', cluster)).stdout;
        const hostRegex = /^Name:\s+(.*)$/;
        result.split('\n').forEach((value: string) => {
          let match;
          if (match = hostRegex.exec(value)) {
            data.hostsInCluster[cluster].push(match[1]);
          }
        });
        //endregion
      } catch (_ignore) {
      }
    }
    // endregion
    return data;
  };

  public getLeastUsedCluster = async (domain: string): Promise<string> => {
    const data = await this.getVMWareData();

    let bestMemCluster = null;
    let bestCPUCluster = null;

    // @see https://www.vmware.com/support/developer/converter-sdk/conv50_apireference/cluster_services_counters.html
    for (let cluster in data.cluster) {
      if (!cluster.includes(domain)) {
        continue;
      }
      if (!bestCPUCluster || (bestCPUCluster.cpu < data.cluster[cluster].cpu)) {
        bestCPUCluster = data.cluster[cluster];
      }
      if (!bestMemCluster || (bestMemCluster.mem < data.cluster[cluster].mem)) {
        bestMemCluster = data.cluster[cluster];
      }
    }

    // Cluster with most free CPU also has most free RAM
    if (bestCPUCluster.name == bestMemCluster.name) {
      return bestCPUCluster.name;
    }

    // Randomize best CPU and best RAM cluster
    return (Math.random() >= 0.5) ? bestCPUCluster.name : bestMemCluster.name;
  };

  public getBestStorageInDomain = async (domain: string): Promise<string> => {
    // This is not cached, as it's quite fast
    const cluster =`NUEv_NetApp_Cluster-${domain}`;
    const result: { Name: string, Info: any }[] = JSON.parse((await this._govc.launch('datastore.info', '-json', `${cluster}/*`)).stdout).Datastores;
    return result.sort((a, b) => a.Info.FreeSpace - b.Info.FreeSpace).slice(-1)[0].Name;
  };

  public getHostInCluster = async (cluster: string): Promise<string> => {
    const hosts = (await this.getVMWareData()).hostsInCluster[cluster] || [];
    return hosts[Math.floor(Math.random() * hosts.length)] || null;
  };

  public loadOSConfig = (block: string, os: string): OSConfig => {
    const osCfg = require('../os.json')[block] || {};
    if (!osCfg[os]) {
      throw new Error(`OS ${os} not found in os-block ${block}`);
    }

    const regex = /^([^!]+)(?:\!(?:local|template):(\S+))?$/i;
    let matches;
    if (matches = regex.exec(osCfg[os])) {
      if (matches[2]) {
        return {
          template: matches[2],
          isPXE: false,
          isTemplate: true,
          pxeTarget: null,
          guestName: matches[1],
        };
      } else {
        return {
          template: null,
          isPXE: true,
          isTemplate: false,
          pxeTarget: os,
          guestName: matches[1],
        };
      }
    } else {
      throw new Error(`Malformatted OS in config.`);
    }
  };

  public getIP = async (vmName: string): Promise<string> => {
    const proc = await this.govc.launch(`vm.ip`, `-wait`, `5s`, vmName);

    if (proc.status) {
      return null;
    }
    return proc.stdout.trim();
  };

  public enableHotAdd = async (vmName: string): Promise<boolean> => {
    const proc = await this.govc.launch(`vm.change`, `-e`, `mem.hotadd=true`, `-e`, `vcpu.hotadd=true`, `-e`, `vcpu.hotremove=true`, `-vm=${vmName}`);

    return !proc.status;
  };

  public setAttributes = async (vmName: string, createdBy: string, createdOn: number): Promise<void> => {
    const proc1 = this.govc.launch(`fields.set`, `CreatedBy`, `trixie<${createdBy}>`, vmName);
    const proc2 = this.govc.launch(`fields.set`, `CreatedOn`, (new Date(createdOn * 1000)).toISOString(), vmName);
    await Promise.all([proc1, proc2]);
  };

  public waitForIP = (vmName: string, maxTime: number = 240): Promise<string> => {
    return new Promise<string>(async (resolve, reject) => {
      let interval: any, timeout: any;
      const tryGetIP = async () => {
        const ip = await this.getIP(vmName);
        if (ip) {
          clearInterval(interval);
          clearTimeout(timeout);
          return resolve(ip);
        }
        return;
      };
      interval = setInterval(tryGetIP, 10000);
      timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('timeout'));
      }, maxTime * 1000);
    });
  };

  public loadDCConfig = (datacenter: string): DCConfig => {
    const configname: string = datacenter.startsWith('pinf') ? 'pinf' : datacenter;
    const tmpCfg: DCConfig = Object.assign({}, require('../datacenter.json')[configname]); //Do not alter item in cache!
    if (!tmpCfg) {
      throw new Error(`dc '${datacenter}' unknown`);
    }
    if (tmpCfg.isPinf) {
      let pinf: PinfCfg = {} as PinfCfg; //Cast here as we throw if we can't parse.
      const regex = /pinf(6\d\d)_([1|2])/;
      let results;
      if ((results = regex.exec(datacenter)) !== null) {
        // The result can be accessed through the `m`-variable.
        pinf.vlan = parseInt(results[1], 10);
        pinf.domain = parseInt(results[2], 10);
        pinf.name = `pinf${pinf.vlan}`;
      } else {
        throw new Error(`Could not parse pinf dc '${datacenter}'`);
      }
      tmpCfg.chefEnv = require('../chefenv.json')[pinf.name] || pinf.name;
      tmpCfg.networks = tmpCfg.networks.map<string>((net) => net.replace('$PINF' as any, pinf.vlan as any)); // No idea why the TS compiler does not like this without 'any' casts
      if (!tmpCfg.domain || tmpCfg.domain == 'auto') {
        switch (pinf.domain) {
          case 1:
            tmpCfg.domain = 'DOM1';
            break;
          case 2:
            tmpCfg.domain = 'DOM2';
            break;
        }
      }
    }

    return tmpCfg;
  };
}