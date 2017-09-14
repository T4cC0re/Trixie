#!/usr/bin/env node
'use strict';

import {isMaster} from 'cluster';

if(isMaster) {
    require('./master');
} else {
    require('./trixie');
}