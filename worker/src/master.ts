'use strict';

import 'libError';
import {fork} from 'cluster';

setImmediate(async () => {
  fork();
});