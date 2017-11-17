'use strict';

import { SpawnSyncReturns, execFile } from 'child_process';
import { accessSync, lstatSync, readdirSync, realpathSync } from 'fs';
import { R_OK, X_OK } from 'constants';
import { delimiter, join } from 'path';

export class GOVCWrapper {

  public constructor(private username: string, private password: string, private vcenter: string, private binary: string = null) {
    this.binary = GOVCWrapper.detectBinary('govc', binary);
    if (!this.binary) {
      throw new Error('unable to find govc');
    }
  }

  static detectBinary(binary: string, govcPath?: string): string | null {
    govcPath = govcPath || process.cwd();
    let instance: string;

    //region internal functions
    const isFileExecutable = (path?: string): boolean => {
      try {
        accessSync(path, R_OK | X_OK);
        return true;
      } catch (_ignore) {
        return false;
      }
    };

    const isBinaryOk = (path?: string): string => {
      if (!path) {
        return null;
      }

      path = realpathSync(path);

      if (!lstatSync(path).isFile()) {
        return null;
      }

      if (!isFileExecutable(path)) {
        return null;
      }


      return path;
    };

    const findInPath = (path?: string): string => {
      if (!path) {
        return null;
      }
      try {
        let files = readdirSync(path);
        for (let idx = 0; idx < files.length; idx++) {
          let file: any = files[idx];
          if (file.includes(binary)) {
            let govcPath = realpathSync(join(path, file.toString()));
            if (instance = isBinaryOk(govcPath)) {
              return instance;
            }
          }
        }
      } catch (_ignore) {
      }
      return null;
    };
    //endregion

    //Check given path first
    if (instance = isBinaryOk(govcPath)) {
      return instance;
    }

    //detect from current workdir
    if (instance = findInPath(process.cwd())) {
      return instance;
    }

    //detect from PATH
    let paths = process.env.PATH.split(delimiter);
    for (let idx = 0; idx < paths.length; idx++) {
      if (instance = findInPath(paths[idx])) {
        return instance;
      }
    }

    //return null of nothing found
    return null;
  };

  public launch = (...params: string[]): Promise<SpawnSyncReturns<string>> => {
    return new Promise<SpawnSyncReturns<string>>(resolve => {
      if (params.length >= 1 && params[0] == 'env') {
        console.error('env command is prohibited');
        return resolve(null);
      }

      console.log(`AUDIT\tGOVC\t['${params.join(`' '`)}']`);

      execFile(this.binary,
        params,
        {
          maxBuffer: 2 * 1024 * 1024, // 2 MiB buffer
          encoding: 'utf8',
          env: {
            GOVC_USERNAME: this.username,
            GOVC_PASSWORD: this.password,
            GOVC_INSECURE: 'true',
            GOVC_PERSIST_SESSION: 'true',
            GOVC_URL: this.vcenter,
          },
        }, (error: any, stdout: string, stderr: string) => {
          let status = 0;
          let signal = '';
          if (error) {
            status = error.code;
            signal = error.signal;
          }
          resolve({
            status,
            signal,
            stdout,
            stderr,
            pid: 0,
            output: [],
            error,
          });
        });
    });
  };
}