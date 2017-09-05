#!/usr/bin/env node
'use strict';

import {GOVCWrapper} from "./vmware/govcWrapper";
import {SRVDB} from "./platform1/srvdb";
import {inspect} from "util";

const govc = new GOVCWrapper(process.env['GOVC_USERNAME'], process.env['GOVC_PASSWORD'], 'https://vcenter-1054-vcs-01.bigpoint.net');
const srvdb = new SRVDB(process.env['GOVC_USERNAME'], process.env['GOVC_PASSWORD']);

setImmediate(async() => {
    console.log('get:', inspect(await srvdb.get('srv051069', 'svc.%.ip', 'svc.%.scope'), {depth: null}));
    console.log('_networks:', inspect(await srvdb.get('_networks'), {depth: null}));
    console.log('history:', inspect(await srvdb.history('srv051069', true), {depth: null}));
    console.log('list:', inspect(await srvdb.list('srv051069', 'svc%'), {depth: null}));
    console.log('call:', inspect(await srvdb.call('dyndns', 'srv051069', 'force'), {depth: null}));
    console.log('propsearch:', inspect(await srvdb.propsearch('propsearch', 'svc.busdev-287-web-%.scope=global', 'svc.busdev-287-web-%.ip=10.%'), {depth: null}));
    console.log('search for IP', inspect(await srvdb.search('%=10.24.12.51'), {depth: null}));
    console.log('search for svcname', inspect(await srvdb.search('busdev-287%.pinf612'), {depth: null}));
    console.log(JSON.parse((await govc.launch('about', '-json')).stdout));
});
