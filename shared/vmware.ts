'use strict';
import { GOVCWrapper } from "./vmware/govcWrapper";
import { ChildRPC, ClientRPC } from "libRPC";

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

export class VMWare {
  private _govc: GOVCWrapper;

  public constructor(username: string, password: string, vcenter: string, govcPath: string = null, private rpc?: ClientRPC | ChildRPC) {
    this._govc = new GOVCWrapper(username, password, vcenter, govcPath);
  }

  public get govc() {
    return this._govc
  };

  private getVMWareData = async (): Promise<any> => {
    let data: any;
    if (this.rpc) {
      data = await this.rpc.callOnMaster<any>('getVMWareData');
      if (!data || !Object.keys(data).length) {
        data = await this.gatherVMWareData();
        await this.rpc.callOnMaster('updateVMWareData', data);
      }
    } else {
      data = await this.gatherVMWareData();
    }

    return data;
  };

  public gatherVMWareData = async (): Promise<any> => {
    //TODO: Move VMWare data aggregation here.
    console.log('gatherVMWareData');
    return {a: "b"}
  };

  public getLeastUsedCluster = async (domain: string): Promise<string> => {

    const data = await this.getVMWareData();

    const ls = JSON.parse((await  this._govc.launch('ls', '-json', `host/${domain}`)).stdout).elements;

    let bestMemCluster = null;
    let bestCPUCluster = null;

    // @see https://www.vmware.com/support/developer/converter-sdk/conv50_apireference/cluster_services_counters.html
    for (let cluster of ls.map((element: any) => element.Path) as string[]) {
      const CPUUsage = JSON.parse((await this._govc.launch('metric.sample', '-json', cluster, 'clusterServices.effectivecpu.average')).stdout);
      const memUsage = JSON.parse((await this._govc.launch('metric.sample', '-json', cluster, 'clusterServices.effectivemem.average')).stdout);
      const freeCPUMHz = CPUUsage.Sample[0].Value[0].Value.slice(-1);
      const freeMemMiB = memUsage.Sample[0].Value[0].Value.slice(-1);
      if (!bestCPUCluster || bestCPUCluster.cpu < freeCPUMHz) {
        bestCPUCluster = {name: cluster, mem: freeMemMiB, cpu: freeCPUMHz}
      }
      if (!bestMemCluster || bestMemCluster.mem < freeMemMiB) {
        bestMemCluster = {name: cluster, mem: freeMemMiB, cpu: freeCPUMHz}
      }
      console.log(cluster, freeCPUMHz, freeMemMiB);
      // return;//
    }

    // Cluster with most free CPU also has most free RAM
    if (bestCPUCluster.name == bestMemCluster.name) {
      return bestCPUCluster.name;
    }

    // Randomize best CPU and best RAM cluster
    return (Math.random() >= 0.5) ? bestCPUCluster.name : bestMemCluster.name
  };

  public getBestStorageInCluster = async (cluster: string): Promise<string> => {
    cluster = cluster.replace(/^.*?(NUE-DOM|NUEv)(\d-Cluster-\d+)/, 'NUEv$2');
    const result: { Name: string, Info: any }[] = JSON.parse((await this._govc.launch('datastore.info', '-json', `${cluster}/*`)).stdout).Datastores;
    return result.sort((a, b) => a.Info.FreeSpace - b.Info.FreeSpace).slice(-1)[0].Name;
  };

  public getHostInCluster = async (cluster: string): Promise<string> => {
    // JSON is too slow here.
    const result: string = (await this._govc.launch('host.info', cluster)).stdout;
    const hostRegex = /^Name:\s+(.*)$/;
    const hosts: string[] = [];
    result.split('\n').forEach((value: string) => {
      let match;
      if (match = hostRegex.exec(value)) {
        hosts.push(match[1]);
      }
    });

    return hosts[Math.floor(Math.random() * hosts.length)];
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
          guestName: matches[1]
        }
      } else {
        return {
          template: null,
          isPXE: true,
          isTemplate: false,
          pxeTarget: os,
          guestName: matches[1]
        }
      }
    } else {
      throw new Error(`Malformatted OS in config.`)
    }
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
        pinf.name = `pinf${pinf.vlan}`
      } else {
        throw new Error(`Could not parse pinf dc '${datacenter}'`)
      }
      tmpCfg.chefEnv = require('../chefenv.json')[pinf.name] || pinf.name;
      tmpCfg.networks = tmpCfg.networks.map((net) => net.replace(`$PINF`, pinf.vlan));
      if (!tmpCfg.domain || tmpCfg.domain == 'auto') {
        switch (pinf.domain) {
          case 1:
            tmpCfg.domain = "DOM1";
            break;
          case 2:
            tmpCfg.domain = "DOM2";
            break;
        }
      }
    }

    return tmpCfg;
  }
}