import { randomBytes } from 'crypto';

export class Util {

  /**
   * Generates a MAC address
   * @param {string} prefix If provided has to end with ':'. e.g. '00:50:56:' for VMWare
   * @returns {string}
   */
  static generateMac = (prefix: string = ''): string => {
    return prefix.padEnd(17, randomBytes(9)
      .toString('hex')
      .split('')
      .map((val, idx) => idx % 3 === 0 ? ':' : val)
      .slice(1)
      .join(''));
  };

  // @see https://docs.vmware.com/en/VMware-vSphere/6.0/com.vmware.vsphere.troubleshooting.doc/GUID-7F723748-E7B8-48B9-A773-3822C514684B.html
  static invalidMacs: RegExp = /^00:50:56:[4-9a-f][0-9a-f]:[0-9a-f]{2}:[0-9a-f]{2}$/i;

  /**
   * Generates a VMWare MAC address
   * @returns {string}
   */
  static generateVMWareMac = (): string => {
    let mac: string = null;
    while (true) {
      mac = Util.generateMac('00:50:56:');
      if (!Util.invalidMacs.test(mac)) {
        return mac;
      }
    }
  };

}