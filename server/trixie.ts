'use strict';

import 'libError';
import { Platform1 } from "../shared/platform1";
import { VMWare } from "../shared/vmware";
import { ActionOutput, ActionRunner } from "./ActionRunner";
import { createServer, Next, plugins, Request as rRequest, Response } from 'restify';
import * as jsonwebtoken from 'jsonwebtoken'
import { Util } from "../shared/util";
import { ClientRPC } from "libRPC";

interface Request extends rRequest {
  userObj: UserObject
  requestId: string
}

interface UserObject {
  groups: string[]
  dn: string
  account: string
  name: string
  mail: string
  uid: number
  title: string
  iat: number
  exp: number
}

interface TrixieResponse {
  code: number,
  stdout?: string,
  stderr?: string,
  error?: string
  returnValue: any
}

setImmediate(async () => {
  const clientRPC = new ClientRPC();
  clientRPC.registerProcess();

  const globalConfig = await clientRPC.callOnMaster<any>('getConfig');

  const vmware = new VMWare(globalConfig.ADCredentials.username, globalConfig.ADCredentials.password, globalConfig.vmware.url, globalConfig.vmware.govc, clientRPC);
  const p1 = new Platform1(globalConfig.ADCredentials.username, globalConfig.ADCredentials.password);
  const ar = new ActionRunner(vmware, p1);

  const auth = async (req: Request): Promise<boolean> => {
    const token = req.header('X-Trixie-Auth');
    req.requestId = Util.generateMac();

    let willAuth = false;

    if (token && token.length) {
      try {
        const payload: any = jsonwebtoken.verify(token, globalConfig.JWTSecret);
        req.userObj = payload;
        willAuth = (
          (globalConfig.users as string[]).includes(payload.sub)
          || (globalConfig.users as string[]).includes(payload.account)
          || (payload.groups as string[]).some(group => globalConfig.groups.includes(group))
        );
      } catch (e) {
        logError(e);
      }
    }

    if (!req.userObj) {
      req.userObj = {} as UserObject;
    }

    console.log(`AUDIT\tENDPOINT\t${req.userObj.account || "-"}\t${req.getPath()}\t${req.requestId}`);

    return willAuth;
  };

  const debugLogin = (req: Request, res: Response): boolean => {
    if (req.header("X-Trixie-Debug") !== "trixie_debug") {
      return false;
    }

    const userObj = {
      groups: ["debug"],
      dn: "debug",
      account: "trixie_debug",
      name: "Built-in Trixie debug account",
      mail: "no@mail.com",
      uid: 65534,
      title: "Senior Debugger",
      iat: Math.floor(Date.now() / 1000) - 30, //backdate 30sec for time-drift
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // Valid for an hour (+30sec)
    };

    const token = jsonwebtoken.sign(
      userObj,
      globalConfig.JWTSecret,
      {
        subject: userObj.dn,
        issuer: "Trixie",
        algorithm: "HS512",
      }
    );

    console.log(`AUDIT\tDEBUGLOGIN\t${req.requestId}`);

    res.send(200, {code: 200, token: token, tokenValidity: userObj.exp});
    res.end();
    return true;
  };

  /**
   * GET|POST /auth
   * GET - Supply Basic auth to retrieve a token.
   *
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   */
  const loginOrRefresh = async (req: Request, res: Response, next: Next) => {
    await auth(req);
    if (debugLogin(req, res)) {
      return next();
    }

    if (req.authorization
      && req.authorization.basic
      && req.authorization.basic.username
      && req.authorization.basic.password
    ) {
      const verify = require('ldap-verifyuser');
      const config = {
        server: 'ldaps://adldap-460-03.bigpoint.net',
        adrdn: 'BIGPOINT\\',
        adquery: 'dc=BIGPOINT,dc=LOCAL',
        debug: true,
        rawAdrdn: false,
        tlsOptions: {rejectUnauthorized: false}
      };

      verify.verifyUser(config, req.authorization.basic.username, req.authorization.basic.password, (err: Error, data: any) => {
        if (err) {
          logError(err);
        }
        if (data.valid && !data.locked) {
          // console.log(data.raw);

          if (!data.raw || !data.raw.dn) {
            console.error("User does not have DN.");
            res.send(500);
            res.end();
          }

          console.log(`AUDIT\tLOGIN\t${req.authorization.basic.username}\tOK`);

          const groups: string[] = [];

          for (const groupItem of data.raw.memberOf || {}) {
            try {
              groups.push(/CN=([^,]*)/i.exec(groupItem)[1]);
            } catch (_) {
            }
          }

          const userObj = {
            groups: groups,
            dn: data.raw.dn,
            account: data.raw.sAMAccountName || "unknown",
            name: data.raw.cn || "unknown",
            mail: data.raw.mail || "unknown@example.com",
            uid: parseInt(data.raw.uidNumber || 65534, 10),
            title: data.raw.title || "unknown",
            iat: Math.floor(Date.now() / 1000) - 30, //backdate 30sec for time-drift
            exp: Math.floor(Date.now() / 1000) + (60 * 60) // Valid for an hour (+30sec)
            // BP SSH Keys: msExchExtensionCustomAttribute1
          };

          const token = jsonwebtoken.sign(
            userObj,
            globalConfig.JWTSecret,
            {
              subject: userObj.dn,
              issuer: "Trixie",
              algorithm: "HS512",
            }
          );

          res.send(200, {code: 200, token: token, tokenValidity: userObj.exp});
          res.end();
          return next();
        } else {
          console.log(`AUDIT\tLOGIN\t${req.authorization.basic.username}\t${err ? "ERROR" : (data.locked ? "LOCK" : "FAIL")}`);
          res.header('WWW-Authenticate', 'Basic realm="Trixie Authentication"');
          res.send(401, {code: 401, error: "Unauthorized"});
          res.end();
          return next();
        }
      });
    } else {
      console.log(`AUDIT\tLOGIN\t-\tFAIL`);
      res.header('WWW-Authenticate', 'Basic realm="Trixie Authentication"');
      res.send(401, {code: 401, error: "Unauthorized | Refresh not yet implemented"});
      res.end();
      return next();
    }
  };

  /**
   * GET|POST /action/:action
   * GET if action does not accept parameters
   * POST if :action should be supplied with parameters (generally preferred over GET)
   * Body: JSON Object
   *  {
 *    params: string[] // Parameters for :action
 *  }
   *
   * @param {Request} req
   * @param {Response} res
   * @param {Next} next
   * @returns {Promise<void>}
   */
  const performAction = async (req: Request, res: Response, next: Next) => {
    if (!await auth(req)) {
      res.send(401, {code: 401, error: "Unauthorized"});
      res.end();
      return next();
    } else if (!req.params.action) {
      res.send(400, {code: 400, error: "No action specified"});
      res.end();
      return next();
    }

    let params = [];

    if (req.isUpload()) {

    }

    if (typeof req.body === 'object') {
      if (req.body.params && req.body.params.length) {
        params = req.body.params;
      }
    }

    let action: ActionOutput<any>;
    try {
      action = await ar.run(req.requestId, req.params.action, ...params);
    } catch (e) {
      action = {
        output: [],
        returnValue: null,
        error: e
      };
    }


    if (action.error) {
      (action as any as TrixieResponse).code = 500;
      try {
        (action as any as TrixieResponse).error = await formatError(action.error);
      } catch (_ignore) {
        (action as any as TrixieResponse).error = JSON.stringify(action.error);
      }
      console.error(action.error);
      res.send(
        500, action);
      res.end();
      return next();
    }

    (action as any).code = 200;
    res.send(200, action);
    res.end();
    return next();
  };

  const server = createServer({name: "Trixie"});
  server.use(plugins.bodyParser());
  server.use(plugins.queryParser());
  server.use(plugins.gzipResponse());
  server.use(plugins.authorizationParser());
  server.post('/action/:action', performAction);
  server.get('/action/:action', performAction);
  server.get('/auth', loginOrRefresh);
  server.on("error", (err) =>
    logError(err)
  );
  server.listen(8080, function () {
    console.log('%s listening at %s', server.name, server.url);
  });

  if (process.argv[2] === 'action') {
    // const ar = new ActionRunner(vmware, p1);
    // await ar.run(...process.argv.slice(3));
  } else {
    // EXAMPLES:
    // console.log('_networks:', inspect(await p1.srvdb.get('_networks'), {depth: null}));
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
    // console.log('srvfind', inspect(await p1.srvdb.srvfind('mylittlefarm-171-www-%'), {depth: null}));
    // console.log(await p1.srvdb.freeip('nue2_pub_www2'));
    // console.log(JSON.parse((await govc.launch('about', '-json')).stdout));
    // console.log(await vmware.createVM('pinf614_1', 2, 2048, 20, 'ubuntu1604', false));
  }
});