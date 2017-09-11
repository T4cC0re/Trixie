'use strict';
import {GOVCWrapper} from "./vmware/govcWrapper";

export class VMWare {

    private _govc: GOVCWrapper;

    public constructor(private username: string, private password: string, private vcenter: string, private govcPath: string = null) {
        this._govc = new GOVCWrapper(username, password, vcenter, govcPath);
    }

    public get govc() {return this._govc};

    /**
     *
     * @param datacenter
     * @param {number} cores
     * @param {number} memory
     * @param {number} disk
     * @param os
     * @param {boolean} limitIOPS
     * @returns {Promise<string>} Path to vm in VMWare (e.g. vm/srv000000)
     */
    public createVM = async (datacenter: string, cores: number, memory: number, disk: number, os: string, limitIOPS: boolean): Promise<string> => {
        const dcConfig = this.loadDCConfig(datacenter);
    };

    private loadDCConfig = (datacenter: string): DCConfig => {
        const configname: string = datacenter.startsWith('pinf')
            ? datacenter.substr(0,7)
            : datacenter;
        const tmpCfg = require('../datacenter.json')[configname];
        console.log(tmpCfg);
        if(!tmpCfg){throw new Error('datacenter unknown')}
    }
}