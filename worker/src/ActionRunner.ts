'use strict';

import {Script} from 'vm';
import {Console} from 'console';
import {readFileSync} from 'fs';
import {VMWare} from "./vmware";
import {Platform1} from "./platform1";
import {Util} from "./util";
import Process = NodeJS.Process;
import Global = NodeJS.Global;

const StreamCache = require('stream-cache');

interface Sandbox extends Global {
    process: Process
    ActionRunner: ActionRunner
    vmware: VMWare
    platform1: Platform1
    Util: Util
    console: Console
    action: Function | null
}

export interface ActionOutput {
    stdout: string
    stderr: string
    returnValue: any
    error?: Error
}

export class ActionRunner {
    constructor(private vmware: VMWare, private p1: Platform1) {}

    private gatherOutput = (sandbox: Sandbox): { stdout: string, stderr: string } => {
        let stdout = "";
        let stderr = "";

        try{
            stdout = (sandbox.process.stdout as any)._buffers
                .reduce((prev: string, buffer: Buffer) => prev + buffer.toString('utf-8'));
        } catch (_) {}

        try{
            stderr = (sandbox.process.stderr as any)._buffers
                .reduce((prev: string, buffer: Buffer) => prev + buffer.toString('utf-8'));
        } catch (_) {}

        return {
            stdout: stdout,
            stderr: stderr,
        }
    };

    private buildSandbox = (): Sandbox => {
        const sandbox = Object.assign(
            {},
            global,
            {
                ActionRunner: this,
                vmware: this.vmware,
                platform1: this.p1,
                Util: Util,
                action: null
            }
        );

        sandbox.process = Object.assign({}, process, {
            stdout: new StreamCache(),
            stderr: new StreamCache(),
            exit: (code: any) => {
                throw new Error(`EXIT ${code}`)
            }
        });

        sandbox.process.env.GOVC_USERNAME = null;
        sandbox.process.env.GOVC_PASSWORD = null;
        sandbox.console = new Console(
            sandbox.process.stdout,
            sandbox.process.stderr
        );

        return sandbox;
    };

    public run = async (...action: string[]): Promise<ActionOutput> => {
        console.error(`Running action '${action[0]}'...`);

        let script = null;
        try {
            script = new Script(readFileSync(`${__dirname}/../actions/${action[0].replace('.', '/').toLowerCase()}.js`).toString('utf-8'));
        } catch (e) {
            return {
                stderr: '',
                stdout: '',
                returnValue: null,
                error: e,
            };
        }

        const sandbox = this.buildSandbox();

        script.runInNewContext(
            sandbox,
            {filename: action[0], displayErrors: true}
        );

        let returnValue: any;
        try {
            returnValue = await sandbox.action(...action.slice(1)) || null;
            return Object.assign(
                {},
                this.gatherOutput(sandbox),
                {
                    returnValue: returnValue,
                }
            );
        } catch (error) {
            return Object.assign(
                {},
                this.gatherOutput(sandbox),
                {
                    returnValue: null,
                    error: error,
                }
            );
        }
    }
}