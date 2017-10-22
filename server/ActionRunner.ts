'use strict';

import { Script } from 'vm';
import { readFileSync } from 'fs';
import { VMWare } from "../shared/vmware";
import { Platform1 } from "../shared/platform1";
import { Util } from "../shared/util";
import Process = NodeJS.Process;
import Global = NodeJS.Global;

const StreamCache = require('stream-cache');

export interface OutputLine {
  log: string
  fd: 1 | 2
}

type OutputLogger = (...log: any[]) => void;

interface Sandbox extends Global {
  process: Process
  subAction: <T>(action: string, ...args: any[]) => Promise<T>
  vmware: VMWare
  platform1: Platform1
  Util: Util
  error: OutputLogger
  log: OutputLogger
  action: Function | null
  trixieAPI: number
  __outputBuffer: OutputLine[]
}

export interface ActionOutput<T> {
  output: OutputLine[]
  returnValue: T
  error?: Error
}

export class ActionRunner {
  constructor(private vmware: VMWare, private p1: Platform1) {
  }

  private runSubAction = async <T>(reqId: string, parentSandbox: Sandbox, action: string, ...args: any[]): Promise<T> => {
    const subAction = await this.run<T>(reqId, action, ...args);

    parentSandbox.__outputBuffer.push(...subAction.output);

    if (subAction.error) {
      throw subAction.error;
    }

    return subAction.returnValue;
  };

  private log = (buffer: OutputLine[], fd: 1 | 2, ...log: any[]): void => {
    log.forEach((entry) => {
      if (typeof entry != "string") {
        buffer.push({fd: fd, log: JSON.stringify(entry)});
      } else
        buffer.push({fd: fd, log: entry});
    });
    buffer.push({fd: fd, log: '\n'});
  };

  private buildSandbox = (reqId: string): Sandbox => {
    const sandbox = Object.assign(
      {},
      global,
      {
        vmware: this.vmware,
        platform1: this.p1,
        Util: Util,
        action: null,
        subAction: null,
        trixieAPI: 2,
        __outputBuffer: [],
      }
    ) as any as Sandbox;

    sandbox.log = (...log: any[]) => {
      this.log(sandbox.__outputBuffer, 1, ...log)
    };
    sandbox.error = (...log: any[]) => {
      this.log(sandbox.__outputBuffer, 2, ...log)
    };
    sandbox.process = Object.assign({}, process, {
      stdout: new StreamCache(),
      stderr: new StreamCache(),
      exit: (code: any) => {
        throw new Error(`EXIT ${code}`)
      }
    });

    sandbox.process.env.GOVC_USERNAME = null;
    sandbox.process.env.GOVC_PASSWORD = null;
    sandbox.console = null;
    sandbox.subAction = (action: string, ...args: any[]) => {
      return this.runSubAction(reqId, sandbox, action, ...args);
    };

    return sandbox;
  };

  public run = async <T>(reqId: string, action: string, ...args: any[]): Promise<ActionOutput<T>> => {
    console.log(`AUDIT\tACTION\t${reqId || 'internal'}\t${action}\t${JSON.stringify(args)}`);

    let script = null;
    try {
      script = new Script(
        readFileSync(`${__dirname}/../actions/${action.replace('.', '/').toLowerCase()}.js`)
          .toString('utf-8')
      );
    } catch (e) {
      return {
        returnValue: null,
        output: [],
        error: e,
      };
    }

    const sandbox = this.buildSandbox(reqId);

    script.runInNewContext(
      sandbox,
      {filename: action, displayErrors: true}
    );

    let returnValue: any;
    try {
      returnValue = await sandbox.action(...args) || null;
      return {
        returnValue: returnValue,
        output: sandbox.__outputBuffer
      }
    } catch (error) {
      return {
        returnValue: null,
        output: sandbox.__outputBuffer,
        error: error,
      }
    }
  }
}
