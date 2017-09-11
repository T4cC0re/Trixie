console.log(args);

platform1.srvdb.get(args[0]).then((data) => {console.log(data);}).catch(console.log);