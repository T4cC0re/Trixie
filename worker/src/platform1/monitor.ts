'use strict';

export interface MonitorCmd {
    [key:string]: string|string[]|number|null
    cmd: 'purge'|'ack'
}

export interface MonitorRequest {
    cmds: MonitorCmd[]
}

export interface MonitorCmdResponse {
    [key:string]: string|string[]|number|null
    error?: string
}

export interface MonitorDBResponse {
    cmds: MonitorCmdResponse[]
    error?: string
}

export class Monitor {

    private request = require('request-promise-native');

    /**
     * Yes, this implementation uses basic auth...
     * @param {string} username
     * @param {string} password
     * @param {string} monitoring
     */
    public constructor(private username: string, private password: string, private monitoring: string = 'http://monitoring.bigpoint.net') {
    }

    private call_internal = async (req: MonitorRequest): Promise<MonitorDBResponse> => {
        const url = `${this.monitoring}/cmd.php?fmt=json`;
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

    public ack = async (pattern: string, duration:number|'ticket', reason: string, assignee: string): Promise<boolean> => {
        let cmds = [
            {
                cmd: 'ack',
                patternlist: pattern,
                user: assignee,
                duration: duration,
                reason: reason,
                assign: assignee
            } as MonitorCmd
        ];

        const resp = await this.call_internal({cmds: cmds});

        if (resp.cmds[0].error) {
            throw(resp.cmds[0].error);
        }

        return true;
    };

    /**
     * DO NOT USE DIRECTLY! USE Platform1.purge instead!
     * @param {string} host
     * @returns {Promise<boolean>}
     */
    public purge = async (host: string): Promise<boolean> => {
        let cmds = [
            {
                cmd: 'purge',
                host: host,
            } as MonitorCmd
        ];

        const resp = await this.call_internal({cmds: cmds});

        if (resp.cmds[0].error) {
            throw(resp.cmds[0].error);
        }

        return true;
    };
}