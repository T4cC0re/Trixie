'use strict';

export interface SRVDBPropList {
    [property:string]: string
}
export interface SRVDBHostPropList {
    [host:string]: SRVDBPropList
}

export interface SRVCmd {
    cmd: 'get'|'set'|'del'|'call'|'history'|'search'|'list'|'propsearch'|'textsearch'
    host?: string
    props?: string[]
    search?: string[]|SRVDBPropList| string
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
     */
    public constructor(private username: string, private password: string) {}

    private call_internal = async (req: SRVDBRequest): Promise<SRVDBResponse> => {
      const url = 'http://servercfg.bigpoint.net/cmd.php?fmt=json';
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
      if (result.error){
          throw new Error(`SRVDB ERROR: ${result.error}`);
      }
      return result;
    };

    public get = async(host: string, ...properties: string[]): Promise<SRVDBPropList> => {
        let cmds = [
            {
                cmd: 'get',
                host: host,
                props: properties.length && properties || ['']
            } as SRVCmd
        ];

        const resp = await this.call_internal({cmds: cmds});
        return resp.cmds[0].props;
    };

    public list = async(host: string, ...properties: string[]): Promise<SRVDBPropList> => {
        let cmds = [
            {
                cmd: 'list',
                host: host,
                props: properties.length && properties || ['']
            } as SRVCmd
        ];

        const resp = await this.call_internal({cmds: cmds});
        return resp.cmds[0].props;
    };

    public propsearch = async(...properties: string[]): Promise<SRVDBHostPropList> => {
        let props = {};
        for (const prop of properties){
            const tmp = prop.split('=', 2);
            if(tmp.length == 2){
              props[tmp[0]] = tmp[1]
            }
        }

        console.log(props);

        let cmds = [
            {
                cmd: 'propsearch',
                search: props,
            } as SRVCmd
        ];

        const resp = await this.call_internal({cmds: cmds});
        return resp.cmds[0].hosts;
    };

    public history = async(host: string, onlycurrent?:boolean, ...properties: string[]): Promise<SRVDBPropList> => {
        let cmds = [
            {
                cmd: 'history',
                host: host,
                props: properties.length && properties || [''],
                onlycurrent: onlycurrent
            } as SRVCmd
        ];

        const resp = await this.call_internal({cmds: cmds});
        return resp.cmds[0].props;
    };

    public call = async(method: string, ...args: string[]): Promise<string> => {
        let cmds = [
            {
                cmd: 'call',
                method: method,
                args: args
            } as SRVCmd
        ];

        const resp = await this.call_internal({cmds: cmds});
        return resp.cmds[0].output;
    };

    public search = async(...queries: string[]): Promise<string[]> => {
        if (queries.length === 1 && !queries[0].includes('=')){
            let servicename: string, searchnet: string = '%';
            let parts = queries[0].split('.', 2);
            servicename = parts[0];
            searchnet = parts.length > 1 && parts[1] || '%'
            // Get hostname by servicename via workaround. Implementation in srvcfg is different, but this also works.
            const hostprops = await this.propsearch(`svc.${servicename}.ip=%`, `net=${searchnet}`);
            console.log(hostprops);
            return Object.keys(hostprops);
        } else {
            let cmds = [
                {
                    cmd: 'textsearch',
                    search: queries.join(' ')
                } as SRVCmd
            ];

            const resp = await this.call_internal({cmds: cmds});

            console.log(resp);
            return resp.cmds[0].hosts as any as string[];
        }
    };
}