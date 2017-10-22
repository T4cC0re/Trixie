///<reference path="../server/ActionRunner.d.ts"/>
///<reference path="./vmare.d.ts"/>
///<reference path="./platform1.d.ts"/>
///<reference path="./util.d.ts"/>

type SubAction = <T>(action: string, ...args: any[]) => Promise<T>;

declare abstract function action(...args: any[]): Promise<boolean | object>;

declare const subAction: SubAction;
declare const vmware: VMWare;
declare const platform1: Platform1;
declare const Util: Util;
declare const log: OutputLogger;
declare const error: OutputLogger;