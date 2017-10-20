///<reference path="../tsd/ActionRunner.d.ts"/>
///<reference path="../tsd/vmware.d.ts"/>
///<reference path="../tsd/platform1.d.ts"/>
///<reference path="../tsd/util.d.ts"/>

type Action = (...args: any[]) => Promise<boolean|object>;
type SubAction = <T>(action: string, ...args: any[]) => Promise<T>;

declare let action: Action;
declare const subAction: SubAction;
declare const vmware: VMWare;
declare const platform1: Platform1;
declare const Util: Util;
