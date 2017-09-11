'use strict';

import {runInNewContext} from 'vm';
import {readFileSync} from 'fs';
import {VMWare} from "./vmware";
import {Platform1} from "./platform1";

export class ActionRunner {
   constructor (private vmware: VMWare, private p1: Platform1) {

   }

   public run = async(...action: string[]): Promise<void> => {
       console.error(`Running action '${action[0]}'...`);
        const sandbox = Object.assign(
            {},
            global,
            {
                ActionRunner: this,
                vmWare: this.vmware,
                platform1: this.p1,
                args: action.slice(1)
            }
        );

       runInNewContext(
           readFileSync(`${__dirname}/../actions/${action[0]}.js`).toString('utf-8'),
           sandbox,
           {filename: action[0], displayErrors: true}
       );
   }
}