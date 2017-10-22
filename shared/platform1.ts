'use strict';
import { SRVDB } from "./platform1/srvdb";
import { Monitor } from "./platform1/monitor";

export class Platform1 {

  private _srvdb: SRVDB;
  private _monitor: Monitor;

  constructor(username: string, password: string) {
    this._srvdb = new SRVDB(username, password);
    this._monitor = new Monitor(username, password);
  }

  public get srvdb() {
    return this._srvdb
  };

  public get monitor() {
    return this._monitor
  };

  public purge = async (host: string): Promise<boolean> => {
    return !!(
      await this._srvdb.del(host, 'svc', 'app', 'dhcp', 'dyndns', 'gpg', 'heartbeat', 'keytab', 'monitoring', 'mysql', 'network', 'os', 'perf', 'vpn', 'syncbase', 'apt') &&
      await this._srvdb.dyndns(host, 'purge') &&
      await this._monitor.purge(host)
    );
  };
}