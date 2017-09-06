#!/usr/bin/env node
'use strict';

import {GOVCWrapper} from "./vmware/govcWrapper";
import {SRVDB} from "./platform1/srvdb";
import {inspect} from "util";

const govc = new GOVCWrapper(process.env['GOVC_USERNAME'], process.env['GOVC_PASSWORD'], 'https://vcenter-1054-vcs-01.bigpoint.net');
const srvdb = new SRVDB(/*process.env['GOVC_USERNAME'], process.env['GOVC_PASSWORD']*/);

setImmediate(async() => {
    // console.log('_networks:', inspect(await srvdb.get('_networks'), {depth: null}));
    // console.log('history:', inspect(await srvdb.history('srv051069', true), {depth: null}));
    // console.log('list:', inspect(await srvdb.list('srv051069', 'svc%'), {depth: null}));
    // console.log('set:', inspect(await srvdb.set('srv068242', {'comment.trixie': 'another test 2'}), {depth: null}));
    // console.log('del:', inspect(await srvdb.del('srv068100', 'svc.new-%'), {depth: null}));
    // console.log('call:', inspect(await srvdb.call('dyndns', 'srv068100', 'force'), {depth: null}));
    // console.log('freeip:', inspect(await srvdb.freeip('nue2_pub_www2'), {depth: null}));
    // console.log('get:', inspect(await srvdb.get('srv068100'), {depth: null}));
    // console.log('getServicenames:', inspect(await srvdb.getServicenames('srv051069'), {depth: null}));
    // console.log('propsearch:', inspect(await srvdb.propsearch('svc.busdev-287-web-%.scope=global', 'svc.busdev-287-web-%.ip=10.%'), {depth: null}));
    // console.log('search for IP', inspect(await srvdb.search('%=10.24.12.51'), {depth: null}));
    // console.log('search for svcname', inspect(await srvdb.search('drasaonline%'), {depth: null}));
    // console.log('srvfind', inspect(await srvdb.srvfind('%drasaonline%.nue2'), {depth: null}));

    console.log(await srvdb.freeip('nue2_pub_www2'));
    // console.log(JSON.parse((await govc.launch('about', '-json')).stdout));
});
