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
    subAction: <T>(action: string, ...args: any[]) => Promise<T>
    vmware: VMWare
    platform1: Platform1
    Util: Util
    console: Console
    action: Function | null
}

export interface ActionOutput<T> {
    stdout: string
    stderr: string
    returnValue: T
    error?: Error
}

export class ActionRunner {
    constructor(private vmware: VMWare, private p1: Platform1) {
    }

    private gatherOutput = (sandbox: Sandbox): { stdout: string, stderr: string } => {
        let stdout = "";
        let stderr = "";

        try {
            stdout = (sandbox.process.stdout as any)._buffers
                .reduce((prev: string, buffer: Buffer) => prev + buffer.toString('utf-8'));
        } catch (_) {
        }

        try {
            stderr = (sandbox.process.stderr as any)._buffers
                .reduce((prev: string, buffer: Buffer) => prev + buffer.toString('utf-8'));
        } catch (_) {
        }

        return {
            stdout: stdout,
            stderr: stderr,
        }
    };

    private runSubAction = async <T>(parentSandbox: Sandbox, action: string, ...args: any[]): Promise<T> => {
        const subAction = await this.run<T>(action, ...args);
        parentSandbox.process.stdout.write(subAction.stdout);
        parentSandbox.process.stderr.write(subAction.stderr);
        if (subAction.error) {
            throw subAction.error;
        }
        return subAction.returnValue;
    };

    private buildSandbox = (): Sandbox => {
        const sandbox = Object.assign(
            {},
            global,
            {
                vmware: this.vmware,
                platform1: this.p1,
                Util: Util,
                action: null,
                subAction: null
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
        sandbox.subAction = (action: string, ...args: any[]) => {
            return this.runSubAction(sandbox, action, ...args);
        };

        return sandbox;
    };

    public run = async <T>(action: string, ...args: any[]): Promise<ActionOutput<T>> => {
        console.error(`Running action '${action}'...`);

        let script = null;
        try {
            script = new Script(readFileSync(`${__dirname}/../actions/${action.replace('.', '/').toLowerCase()}.js`).toString('utf-8'));
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
            {filename: action, displayErrors: true}
        );

        let returnValue: any;
        try {
            returnValue = await sandbox.action(...args) || null;
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