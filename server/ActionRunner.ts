'use strict';

import { Script } from 'vm';
import { readFileSync } from 'fs';
import { VMWare } from '../shared/vmware';
import { Platform1 } from '../shared/platform1';
import { Util } from '../shared/util';
import Process = NodeJS.Process;
import Global = NodeJS.Global;
import WebSocket = require('ws');
import {UserObject} from './trixie';
import { SSH } from '../shared/ssh';

const StreamCache = require('stream-cache');

export interface OutputLine {
  log: string
  fd: 1 | 2
}

type OutputLogger = (...log: any[]) => void;

interface Sandbox extends Global {
  process: Process
  require: Function
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
  constructor(private vmware: VMWare, private p1: Platform1, private ssh: SSH) {
  }

  private runSubAction = async <T>(reqId: string, user: UserObject, parentSandbox: Sandbox, action: string, ...args: any[]): Promise<T> => {
    const subAction = await this.run<T>(reqId, user, action, ...args);

    parentSandbox.__outputBuffer.push(...subAction.output);

    if (subAction.error) {
      throw subAction.error;
    }

    return subAction.returnValue;
  };

  private log = (buffer: OutputLine[], ws: WebSocket, fd: 1 | 2, ...log: any[]): void => {
    log.forEach((entry) => {
      if (ws) {
        if (typeof entry != 'string') {
          ws.send(JSON.stringify({fd: fd, log: JSON.stringify(entry) + '\n'}));
        } else {
          ws.send(JSON.stringify({fd: fd, log: entry + '\n'}));
        }
      } else {
        if (typeof entry != 'string') {
          buffer.push({fd: fd, log: JSON.stringify(entry)});
        } else {
          buffer.push({fd: fd, log: entry});
        }
      }
    });
    buffer.push({fd: fd, log: '\n'});
  };

  private buildSandbox = (reqId: string, user: UserObject, ws: WebSocket = null): Sandbox => {
    const sandbox = Object.assign(
      {},
      global,
      {
        require: require,
        ssh: this.ssh,
        vmware: this.vmware,
        platform1: this.p1,
        Util: Util,
        action: null,
        subAction: null,
        trixieAPI: 2,
        __outputBuffer: [],
        user: user,
      },
    ) as any as Sandbox;

    sandbox.log = (...log: any[]) => {
      this.log(sandbox.__outputBuffer, ws, 1, ...log);
    };
    sandbox.error = (...log: any[]) => {
      this.log(sandbox.__outputBuffer, ws, 2, ...log);
    };
    sandbox.process = Object.assign({}, process, {
      stdout: new StreamCache(),
      stderr: new StreamCache(),
      exit: (code: any) => {
        throw new Error(`EXIT ${code}`);
      },
    });

    sandbox.process.env.GOVC_USERNAME = null;
    sandbox.process.env.GOVC_PASSWORD = null;
    sandbox.console = null;
    sandbox.subAction = (action: string, ...args: any[]) => {
      return this.runSubAction(reqId, user, sandbox, action, ...args);
    };

    return sandbox;
  };

  public run = async <T>(req: string | WebSocket, user: UserObject, action: string, ...args: any[]): Promise<ActionOutput<T>> => {
    let reqId: string;
    let ws = null;
    if (typeof req == 'object') {
      ws = req;
      reqId = 'WebSocket';
    }
    // console.log(`AUDIT\tACTION\t${reqId || 'internal'}\t${action}\t${JSON.stringify(args)}`);

    let script = null;
    try {
      script = new Script(
        readFileSync(`${__dirname}/../actions/${action.replace('.', '/').toLowerCase()}.js`)
          .toString('utf-8'),
      );
    } catch (e) {
      return {
        returnValue: null,
        output: [],
        error: e,
      };
    }

    const sandbox = this.buildSandbox(reqId, user, ws);

    let returnValue: any;
    try {
      script.runInNewContext(
        sandbox,
        {filename: action, displayErrors: true},
      );
      returnValue = await sandbox.action(...args) || null;
      return {
        returnValue: returnValue,
        output: ws ? null : sandbox.__outputBuffer,
      };
    } catch (error) {
      return {
        returnValue: null,
        output: sandbox.__outputBuffer,
        error: error,
      };
    }
  };
}
