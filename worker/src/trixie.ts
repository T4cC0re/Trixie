#!/usr/bin/env node
'use strict';

import {inspect} from "util";
import {Platform1} from "./platform1";
import {VMWare} from "./vmware";
import {ActionRunner} from "./ActionRunner";

const vmware = new VMWare(process.env['GOVC_USERNAME'], process.env['GOVC_PASSWORD'], 'https://vcenter-1054-vcs-01.bigpoint.net', 'C:\\Users\\hmeyer\\scripts\\govc.exe');
const govc = vmware.govc;
const p1 = new Platform1(process.env['GOVC_USERNAME'], process.env['GOVC_PASSWORD']);

setImmediate(async () => {
if (process.argv[2] === 'action') {
    const ar = new ActionRunner(vmware, p1);
    await ar.run(...process.argv.slice(3))
} else {
        // EXAMPLES:
        console.log('_networks:', inspect(await p1.srvdb.get('_networks'), {depth: null}));
        // console.log('history:', inspect(await p1.srvdb.history('srv051069', true), {depth: null}));
        // console.log('list:', inspect(await p1.srvdb.list('srv051069', 'svc%'), {depth: null}));
        // console.log('set:', inspect(await p1.srvdb.set('srv068242', {'comment.trixie': 'another test 2'}), {depth: null}));
        // console.log('del:', inspect(await p1.srvdb.del('srv068100', 'svc.new-%'), {depth: null}));
        // console.log('call:', inspect(await p1.srvdb.call('dyndns', 'srv068100', 'force'), {depth: null}));
        // console.log('freeip:', inspect(await p1.srvdb.freeip('nue2_pub_www2'), {depth: null}));
        // console.log('get:', inspect(await p1.srvdb.get('srv068100'), {depth: null}));
        // console.log('getServicenames:', inspect(await p1.srvdb.getServicenames('srv051069'), {depth: null}));
        // console.log('propsearch:', inspect(await p1.srvdb.propsearch('svc.busdev-287-web-%.scope=global', 'svc.busdev-287-web-%.ip=10.%'), {depth: null}));
        // console.log('search for IP', inspect(await p1.srvdb.search('%=10.24.12.51'), {depth: null}));
        // console.log('search for svcname', inspect(await p1.srvdb.search('drasaonline%.nue%'), {depth: null}));
        // console.log('ack', inspect(await p1.monitor.ack('%@srv068242', 'ticket', 'test ack', 'hmeyer'), {depth: null}));
        // console.log('purge', inspect(await p1.purge('srv068242'), {depth: null}));
        // console.log('srvfind', inspect(await p1.srvdb.srvfind('%drasaonline%.nue2'), {depth: null}));
        // console.log(await p1.srvdb.freeip('nue2_pub_www2'));
        // console.log(JSON.parse((await govc.launch('about', '-json')).stdout));
        // console.log(await vmware.createVM('pinf614_1', 2, 2048, 20, 'ubuntu1604', false));
}
});