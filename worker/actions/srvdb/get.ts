'use strict';

action = async (...args) => {
    const data = await platform1.srvdb.get(...args);
    for (const prop in data) {
        console.log(`${prop}=${data[prop]}`);
    }
};
