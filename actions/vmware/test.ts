'use strict';

///<reference path="../shared/Action.d.ts"/>

async function action(ip: string, user: string, ..._command: string[]) {
  // return await ssh.execute(ip, 'autoinstall', log, error, 'wget -q http://admin-792-shellprovisioner-1.bigpoint.net/p1-ubuntu/slim-late.sh -O late.sh ; sudo bash late.sh');
  return await ssh.execute(ip, user, writeOut, writeErr, _command.join(' '));
}
