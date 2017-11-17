import * as ssh2 from 'ssh2';
import { readFileSync } from 'fs';

const Client = ssh2.Client;

export class SSH {
  private privateKey: string;

  constructor(private keyFile: string) {
    this.privateKey = readFileSync(this.keyFile).toString();
  }

  private dummylog = (..._dummy:any[]) => {};

  execute = (host: string, username: string, stdout?: Function, stderr?: Function, ...command: string[]): Promise<boolean> => {
    stdout = stdout || this.dummylog;
    stderr = stderr || this.dummylog;

    return new Promise<boolean>((resolve) => {
      const conn = new Client();
      conn.on('ready', function () {
        stdout('SSH :: Client :: ready\n');
        conn.exec(command.join(' '), function (err: Error, stream: any) {
          if (err) throw err;
          stream.on('close', (code: number, signal: number) => {
            stdout('SSH :: Stream :: close :: code: ' + code + ', signal: ' + signal + '\n');
            conn.end();
            resolve(code <= 0);
          }).on('data', (data: Buffer) => {
            stdout(data.toString());
          }).stderr.on('data', (data: Buffer) => {
            stderr(data.toString());
          });
        });
      }).on('error', async (err: Error) => {
        stderr(await formatError(err));
        resolve(false);
      }).connect({
        host: host,
        port: 22,

        hostHash: 'sha1',
        hostVerifier: () => true,
        username: username,
        privateKey: this.privateKey,
        keepaliveInterval: 2500,
        keepaliveCountMax: 3
      });
    });
  };
}
