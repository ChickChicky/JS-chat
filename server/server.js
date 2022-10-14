const ws = require('ws');
const fs = require('fs');
const EventEmitter = require('events');

const addr = {host:'localhost',port:554};

const server = new ws.Server({
    ...addr
});

function loadUsers() {
    if (fs.existsSync('server.users.json')) {
        let d = fs.readFileSync('server.users.json');
        return JSON.parse(d);
    }
    return {};
}

function saveUsers(dat) {
    fs.writeFileSync('server.users.json',JSON.stringify(dat),'utf-8');
}

function modifyUser(id,payload) {
    let users = loadUsers();
    if (!users||!users[id]) return false;
    Object.assign(users[id],payload);
    saveUsers(users);
    return true;
}

function generateToken() {
    let chars = '0123456789'+'abcdefghijklmnopqrstuvwxyz'+'ABCDEFGHIJKLMNOPQRSTUVWXYZ'+'+-*=$!:;.#~&§%';
    return Array(50).fill().map(()=>chars[Math.floor(Math.random()*chars.length)]).join('');
}

function generateID() {
    let chars = '0123456789'+'abcdef';
    return Array(10).fill().map(()=>chars[Math.floor(Math.random()*chars.length)]).join('');
}

function getToken(opt) {
    if (opt.token) {
        let u = loadUsers();
        let usr = Object.values(u).find(d=>d.token==opt.token);
        if (usr) return opt.token;
        return null;
    } else {
        let u = loadUsers();
        let usr = Object.values(u).find(d=>d.username==opt.username&&d.password==d.password)
        if (usr) return usr.token;
        return null;
    }
}

const MessageDistributor = new EventEmitter();

let online = [];

server.on('connection',function(sock,req){

    let token = null;
    let user = null;
    let userid = null;

    function finalizeAuthentification(t) {
        if (!t) return;
        token = t;
        let u = loadUsers();
        let i = Object.values(u).findIndex(usr=>usr.token==token);
        userid = Object.keys(u)[i];
        user   = u[userid];
        online.push(userid);
    }

    function onMessage(msg) {
        sock.send(JSON.stringify({
            ...msg
        }));
    }

    MessageDistributor.on('message',onMessage);

    sock.on('message',(d)=>{
        let dat = JSON.parse(d);
        if (dat.type == 'login') {
            let t = getToken(dat);
            sock.send(JSON.stringify({
                token: t
            }));
            if (t) finalizeAuthentification(t);
        } else if (dat.type == 'register') {
            let u = loadUsers();
            if (Object.values(u).some(usr=>usr.username==dat.username)) {
                sock.send(JSON.stringify({
                    token: null,
                }));
            } else {
                let t = generateToken();
                let id = generateID();
                u[id] = { username:dat.username, password:dat.password, token:t };
                saveUsers(u);
                sock.send(JSON.stringify({
                    token: t
                }));
            }
        } else if (dat.type == 'message') {
            if (user && userid && token) {
                MessageDistributor.emit('message',{
                    type: 'message',
                    content: dat.content,
                    username: user.username,
                    userid: userid,
                });
            }
        } else if (dat.type == 'getUsers') {
            let users = loadUsers();
            sock.send(JSON.stringify({
                users: online.map(o=>users[o].username)
            }));
        } else if (dat.type == 'getInfo') {
            if (!user) {
                sock.send(JSON.stringify( { } ));
            } else {
                sock.send(JSON.stringify({
                    userid, username: user.username
                }));
            }
        }
    });

    sock.on('close',()=>{
        MessageDistributor.off('message',onMessage);
        online = online.filter(u=>u!=userid);
    });

});

server.on('listening',function(){
    console.log('Ready !');
});