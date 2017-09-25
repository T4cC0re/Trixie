import {randomBytes} from 'crypto';

export class Util {

    /**
     * Generates a MAC address
     * @param {string} prefix If provided has to end with ':'. e.g. '00:50:56:' for VMWare
     * @returns {string}
     */
    static generateMac = (prefix: string): string => {
        return prefix.padEnd(17, randomBytes(9)
            .toString('hex')
            .split('')
            .map((val, idx) => idx % 3 === 0 ? ':' : val)
            .slice(1)
            .join(''))
    };

    /**
     * Generates a VMWare MAC address
     * @returns {string}
     */
    static generateVMWareMac = (): string => {
        return Util.generateMac('00:50:56:');
    };

}