///<reference path="../server/ActionRunner.ts"/>
///<reference path="../server/trixie.ts"/>
///<reference path="./vmware.ts"/>
///<reference path="./platform1.ts"/>
///<reference path="./util.ts"/>
///<reference path="./ssh.ts"/>

type SubAction = <T>(action: string, ...args: any[]) => Promise<T>;

declare abstract function action(...args: any[]): Promise<boolean | object>;

declare const subAction: SubAction;
declare const vmware: VMWare;
declare const platform1: Platform1;
declare const Util: Util;
declare const log: OutputLogger;
declare const error: OutputLogger;
declare const user: UserObject;
declare const ssh: SSH;
