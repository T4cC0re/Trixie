'use strict';
import { randomBytes } from "crypto";
import { Netmask } from 'netmask'
import { toLong } from 'ip';

const ping = require('ping').promise;

// Taken from readme of ping
export interface PingConfig {
  numeric?: boolean
  timeout?: number
  min_reply?: number
  extra?: string[]
}

// Taken from readme of ping
export interface PingResponse {
  host: string
  numeric_host: string
  alive: boolean
  output: string
  time: number
  min: string
  max: string
  avg: string
  stddev: string
}

export interface SRVDBPropList {
  [property: string]: string
}

export interface SRVHist {
  ts: number,
  host: string,
  value: string
}

export interface SRVDBHostServiceList {
  [host: string]: {
    net: string,
    serviceNames: string[]
  }
}

export interface SRVDBHostPropList {
  [host: string]: SRVDBPropList
}

export interface SRVCmd {
  cmd: 'get' | 'set' | 'del' | 'call' | 'history' | 'search' | 'list' | 'propsearch' | 'textsearch'
  host?: string
  props?: string[]
  search?: string[] | SRVDBPropList | string
  args?: string[]
  onlycurrent?: boolean
}

export interface SRVDBRequest {
  cmds: SRVCmd[]
}

export interface SRVCmdResponse {
  error?: string
  props?: SRVDBPropList
  output?: string
  hosts?: SRVDBHostPropList
}

export interface SRVDBResponse {
  cmds: SRVCmdResponse[]
  error?: string
}

export class SRVDB {

  private request = require('request-promise-native');

  /**
   * Yes, this implementation uses basic auth...
   * @param {string} username
   * @param {string} password
   * @param {string} servercfg
   */
  public constructor(private username: string, private password: string, private servercfg: string = 'http://servercfg.bigpoint.net') {
  }

  private callInternal = async (req: SRVDBRequest): Promise<SRVDBResponse> => {
    const url = `${this.servercfg}/cmd.php?fmt=json`;
    const result = await this.request({
      uri: url,
      method: 'POST',
      body: req,
      json: true,
      headers: {
        'content-type': 'application/json'
      },
      auth: {
        user: this.username,
        password: this.password
      }
    });

    if (result.error) {
      throw new Error(`SRVDB ERROR: ${result.error}`);
    }

    return result;
  };

  public get = async (host: string, ...properties: string[]): Promise<SRVDBPropList> => {
    let cmds = [
      {
        cmd: 'get',
        host: host,
        props: properties.length && properties || ['']
      } as SRVCmd
    ];

    const resp = await this.callInternal({cmds: cmds});

    return resp.cmds[0].props;
  };

  public getValues = async (host: string, ...properties: string[]): Promise<string[]> => {
    return (Object as any).values(await this.get(host, ...properties));
  };

  public del = async (host: string, ...properties: string[]): Promise<boolean> => {
    let cmds = [
      {
        cmd: 'del',
        host: host,
        props: properties.length && properties || ['']
      } as SRVCmd
    ];

    const resp = await this.callInternal({cmds: cmds});

    if (resp.cmds[0].error) {
      throw(resp.cmds[0].error);
    }

    return true;
  };

  public set = async (host: string, properties: SRVDBPropList): Promise<boolean> => {
    let cmds = [
      {
        cmd: 'set',
        host: host,
        props: Object.keys(properties).length && properties || []
      } as SRVCmd
    ];

    const resp = await this.callInternal({cmds: cmds});

    if (resp.cmds[0].error) {
      throw(resp.cmds[0].error);
    }

    return true;
  };

  public list = async (host: string, ...properties: string[]): Promise<SRVDBPropList> => {
    let cmds = [
      {
        cmd: 'list',
        host: host,
        props: properties.length && properties || ['']
      } as SRVCmd
    ];

    const resp = await this.callInternal({cmds: cmds});

    return resp.cmds[0].props;
  };

  public propsearch = async (...properties: string[]): Promise<SRVDBHostPropList> => {
    let props = {};
    for (const prop of properties) {
      const tmp = prop.split('=', 2);
      if (tmp.length == 2) {
        props[tmp[0]] = tmp[1]
      }
    }

    let cmds = [
      {
        cmd: 'propsearch',
        search: props,
      } as SRVCmd
    ];

    const resp = await this.callInternal({cmds: cmds});

    return resp.cmds[0].hosts;
  };

  public history = async (host: string, onlycurrent?: boolean, ...properties: string[]): Promise<SRVHist[]> => {
    let cmds = [
      {
        cmd: 'history',
        host: host,
        props: properties.length && properties || [''],
        onlycurrent: onlycurrent || false
      } as SRVCmd
    ];

    const resp = await this.callInternal({cmds: cmds});

    return resp.cmds[0].props as any as SRVHist[];
  };

  public call = async (method: string, ...args: string[]): Promise<string> => {
    let cmds = [
      {
        cmd: 'call',
        method: method,
        args: args
      } as SRVCmd
    ];

    const resp = await this.callInternal({cmds: cmds});

    return resp.cmds[0].output;
  };

  public search = async (...queries: string[]): Promise<string[]> => {
    if (queries.length === 1 && !queries[0].includes('=')) {
      // Get hostname by servicename via workaround. Implementation in srvcfg is different, but this also works.
      const parts = queries[0].split('.', 2);
      const servicename = parts[0];
      const searchnet = parts.length > 1 && parts[1] || '%';
      return Object.keys(await this.propsearch(`svc.${servicename}.ip=%`, `net=${searchnet}`));
    } else {
      let cmds = [
        {
          cmd: 'textsearch',
          search: queries.join(' ')
        } as SRVCmd
      ];

      const resp = await this.callInternal({cmds: cmds});

      return resp.cmds[0].hosts as any as string[];
    }
  };

  public regsrv = async (...macAdresses: string[]): Promise<string> => {
    return this.call('regsrv', ...macAdresses);
  };

  public dyndns = async (srvId: string, command: 'purge' | 'force'): Promise<string> => {
    return this.call('dyndns', srvId, command);
  };

  public getServicenames = async (srvId: string): Promise<string[]> => {
    const props = await this.get(srvId, 'svc.%.ip');
    const regex = /svc\.(.*)\.ip/i;
    const servicenames = [];
    for (let prop in props) {
      let svcArr = regex.exec(prop);
      if (svcArr && svcArr.length > 1) {
        servicenames.push(svcArr[1]);
      }
    }

    return servicenames;
  };

  public srvfind = async (pattern: string): Promise<SRVDBHostServiceList> => {
    const parts = pattern.split('.', 2);
    const servicename = parts[0];
    const searchnet = parts.length > 1 && parts[1] || '%';
    const hosts = await this.search(`svc.${servicename}.ip=%`, `net=${searchnet}`);
    const ret = {};

    for (const host of hosts) {
      ret[host].serviceNames.push(...(await this.getServicenames(host)));
    }

    return ret;
  };

  /**
   * Check if a given MAC address is available / not in srvdb.
   * @param {string} mac
   * @returns {Promise<boolean>}
   */
  public macAvailable = async (mac: string): Promise<boolean> => {
    if (!mac) return false;
    console.log(`checking MAC ${mac} against SRVDB`);
    return !(await this.search(`macs.%=${mac}`)).length
  };

  /**
   * Used by freeip to validate and lock an IP.
   * @param {string} ip
   * @param {string} network
   * @returns {Promise<string>}
   */
  private checkip = async (ip: string, network: string): Promise<string> => {
    const id = `trixie-${randomBytes(8).toString('hex')}`;

    // Validate IP is in range
    const segments = ip.split('.');
    if (parseInt(segments[3], 10) <= 8 || parseInt(segments[3], 10) >= 254) {
      throw new Error('IP out of range');
    }

    // Check ip responds to ping
    const pingres = (await ping.probe(ip, {timeout: 1} as PingConfig)) as PingResponse;
    if (pingres.alive) {
      throw new Error('IP responded to ping.')
    }

    // Check for duplicate IPs
    const dupes = await this.search(`svc.%.ip=${ip}`);
    if (dupes.length > 0) {
      throw new Error(`IP is duplicate. (${dupes.join(', ')})`);
    }

    // Check if already reserved
    const reserved = await this.getValues('_freeip', `res.${ip}`);
    if (reserved && reserved[0] && parseInt(reserved[0], 10) > (Math.floor(Date.now() / 1000) - 3600)) {
      throw new Error(`IP already reserved at ${reserved[0]} for 3600 sec. Now it's ${Math.floor(Date.now() / 1000)}`);
    }

    // Lock IP
    let tmp = {};
    tmp[`lock.${ip}`] = id;
    if (!await this.set('_freeip', tmp)) {
      throw new Error('Could not lock IP');
    }

    // Verify Lock
    const lock = await this.getValues('_freeip', `lock.${ip}`);
    if (!lock || lock.length < 1 || lock[0] !== id) {
      throw new Error('Lock aquired by another host');
    }

    // Reserve IP for 3600 sec.
    tmp = {};
    tmp[`res.${ip}`] = Math.floor(Date.now() / 1000);
    if (!await this.set('_freeip', tmp)) {
      throw new Error('Could not reserve IP');
    }

    // Update new last IP in srvdb
    tmp = {};
    tmp[`last.${network}`] = ip;
    if (!await this.set('_freeip', tmp)) {
      throw new Error('Could not update last IP');
    }

    return ip;
  };

  public srv2ip = (srvId: string): string => {
    const regex = /^srv(00(\d)|0(\d\d)|(\d\d\d))(00(\d)|0(\d\d)|(\d\d\d))$/i;
    const subst = `$2$3$4.$6$7$8`;

    return srvId.replace(regex, subst);
  };

  public freeip = async (network: string): Promise<string> => {
    // Try last IP from srvdb:
    let tmp = await this.getValues('_freeip', `last.${network}`);
    if (tmp && tmp.length > 0) {
      try {
        return await this.checkip(tmp[0], network);
      } catch (e) {
        console.error(`ip ${tmp[0]} unsusable. ${e.message}`);
      }
    }

    // Detect min and max IP of network:
    tmp = await this.getValues('_networks', `${network}.matchnet`);
    let mask: Netmask;

    if (tmp && tmp.length >= 1) {
      mask = new Netmask(tmp[0]);
    } else {
      throw new Error(`Invalid network ${network}`);
    }

    const lastIP = (await this.getValues('_freeip', `last.${network}`))[0] || null;

    if (lastIP == null) {
      throw new Error(`no usable IP in ${network}`);
    }

    const lastLong = toLong(lastIP);
    let IPsInRange: any = {};

    // Try IPs from last to top of range
    mask.forEach((ip: string, long: number) => {
      IPsInRange[ip] = long;
    });

    for (let ip in IPsInRange) {
      if (IPsInRange[ip] < lastLong) {
        continue;
      }

      try {
        return await this.checkip(ip, network);
      } catch (e) {
        console.error(`ip ${ip} unsusable. ${e.message}`)
      }
    }


    // Try all IPs of network
    for (let ip in IPsInRange) {
      try {
        return await this.checkip(ip, network);
      } catch (e) {
        console.error(`ip ${ip} unsusable. ${e.message}`)
      }
    }

    throw new Error(`no usable IP in ${network}`);
  }
}