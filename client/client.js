const ws = require('ws');
const fs = require('fs');
const {choice, input, getch, Key} = require('./input');

const addr = {host:'localhost',port:554};

const client = new ws.WebSocket(`ws://${addr.host}:${addr.port}`);

let token = null;
let userid = null;
let username = null;

function chunks(str,len) {
    let o = [''];
    for (let c of str) {
        if (o.at(-1).length >= len) o.push('');
        o[o.length-1] += c;
    }
    return o;
}

function getToken() { return new Promise(resolve=>{
    if (fs.existsSync('client.json')) {
        let cl = JSON.parse(fs.readFileSync('client.json'));
        client.send(JSON.stringify({
            type: 'login',
            token: cl.token
        }));
        client.once('message',(d)=>{
            let dat = JSON.parse(d);
            resolve( dat.token );
        });
    } else {
        resolve( null );
    }
})}

function saveToken(t) {
    if (t == null) return;
    let d = {};
    if (fs.existsSync('client.json')) {
        d = JSON.parse(fs.readFileSync('client.json'));
    }
    d.token = t;
    fs.writeFileSync('client.json',JSON.stringify(d));
}

function attemptLogin(username,password) { return new Promise(resolve=>{
    client.send(JSON.stringify({
        type: 'login',
        username, password
    }));
    client.once('message',(d)=>{
        let dat = JSON.parse(d);
        if (dat.token) {
            resolve( dat.token );
        } else {
            resolve( null );
        }
    });
})}

function register(username,password) { return new Promise(resolve=>{
    client.send(JSON.stringify({
        type: 'register',
        username, password
    }));
    client.once('message',(d)=>{
        let dat = JSON.parse(d);
        if (dat.token) {
            resolve( dat.token );
        } else {
            resolve( null );
        }
    });
})}

function getUsers() { return new Promise(resolve=>{
    client.send(JSON.stringify({
        type: 'getUsers',
    }));
    client.once('message',(d)=>{
        let dat = JSON.parse(d);
        if (dat.users) {
            resolve( dat.users );
        } else {
            resolve( [] );
        }
    });
})}

function getInfo() { return new Promise(resolve=>{
    client.send(JSON.stringify({
        type: 'getInfo',
    }));
    client.once('message',(d)=>{
        let dat = JSON.parse(d);
        resolve( dat );
    });
})}

client.on('open',async function(sock){
    let t = await getToken();
    if (!t) {
        let opt = await choice('',[
            'login',
            'register'
        ]);
        if (opt == 'login') {
            while (true) {
                console.log();
                let usr = await input('username: ');
                let pwd = await input('password: ',{replace:'*'});
                let t = await attemptLogin(usr,pwd);
                if (!t) {
                    console.log('\x1b[31mInvalid username/password\x1b[m');
                } else {
                    token = t;
                    break;
                }
            }
        } else if (opt == 'register') {
            console.log();
            let usr = await input('username: ');
            let pwa = await input('password: ',{replace:'*'});
            let pwb = await input('password: ',{replace:'*'});
            if (pwa != pwb) {
                console.log(`\x1b[31mPassword missmatch\x1b[m`);
                process.exit();
            }
            let t = await register(usr,pwa);
            if (!t) {
                console.log(`\x1b[31mAn user with this name already exists\x1b[m`);
            } else {
                console.log(`Restart to complete the registration process`);
            }
            process.exit();
        }
    } else {
        token = t;
    }
    saveToken(token);

    let msgi = 1;

    client.on('message',(d)=>{
        let dat = JSON.parse(d);
        //console.log(dat);
        if (dat.type == 'message') {
            if (msgi >= process.stdout.rows-2) {
                process.stdout.write(`\x1b[2J`);
                msgi = 1;
            }
            let a = false;
            let l = chunks(dat.content,process.stdout.columns-1).join('\n');
            for (let line of l.split('\n')) {
                process.stdout.write(`\x1b[${msgi};1H`);
                if (!a) {
                    process.stdout.write(`\x1b[36${dat.username==username?';3':''}m${dat.username}\x1b[m: `);
                    a = true;
                }
                process.stdout.write(`${line}`);
                msgi++;
            }
            updateInput();
        }
    });

    await (async () => {
        while (true) {
            await new Promise( r=>setTimeout(r,1) );
            if (token) return;
        }
    })();

    ({userid,username} = await getInfo());

    let value = '';
    let cur   = 0;

    function sendMessage() {
        client.send(JSON.stringify({
            type : 'message',
            content: value,
        }));
        value = '';
        cur = 0;
    }

    function updateInput() {
        process.stdout.write(`\x1b[${process.stdout.rows-1};1H\x1b[2K${value}\x1b[${cur+1}G`);
    }

    process.stdout.write(`\x1b[2J`);
    process.stdout.rows = Math.floor(process.stdout.rows);

    {
        let users = await getUsers();
        let l = chunks(`\x1b[36;1m[console]\x1b[m: Currently online: ${users.map(u=>`\x1b[32${u==username?';4':''}m${u}\x1b[m`).join(', ')}`,process.stdout.columns-1).join('\n');
        for (let line of l.split('\n')) {
            process.stdout.write(`\x1b[${msgi};1H`);
            process.stdout.write(`${line}`);
            msgi++;
        }
        updateInput();
    }

    while (true) {
        let chr = await getch(true,null);
        if (chr == undefined) return chr;
        if (chr == Key.backspace) {
            let l1 = value.length;
            value = value.slice(0,cur-1) + value.slice(cur);
            let diff = l1 - value.length;
            cur -= diff;
        } else
        if (chr == Key.delete) {
            value = value.slice(0,cur) + value.slice(cur+1);
        } else
        if (chr == Key.enter) {
            sendMessage();
        } else
        if (chr == Key.left) {
            let diff = cur - Math.max(0,cur-1);
            cur -= diff;
        } else
        if (chr == Key.right) {
            let diff =  Math.min(value.length,cur+1) - cur;
            cur += diff;
        } else
        if (chr == Key.home) {
            cur = 0;
        } else
        if (chr == Key.end) {
            process.stdout.write(`\x1b[${value.length-cur}C`);
            cur = value.length-1;
        } else if (chr.length && !Object.values(Key.ctrl).includes(chr) && chr.indexOf('\x1b')==-1) {
            value = value.slice(0,cur) + chr + value.slice(cur);
            cur += chr.length;
        }

        updateInput();
    }
});

client.on('error',function(err){
    if (err.code == 'ENOTFOUND' || err.code == 'ECONNREFUSED') {
        console.log(`\x1b[31mServer '${addr.host}:${addr.port}' unreachable (${err.code})\x1b[m`);
    } else {
        console.log(err);
    }
});