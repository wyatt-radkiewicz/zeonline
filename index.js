// imports
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const Player = require("./common.js");

// app routes
app.get('/join', (req, res) => { res.sendFile(__dirname + "/client/index.html"); });
app.get('/join/:name', (req, res) => {
  const name = req.params.name;
  const nonAlphaNumeric = /[^a-zA-Z0-9]/;
  if (name && !nonAlphaNumeric.test(name) && name.length >= 3 && name.length <= 16) {
    res.sendFile(__dirname + "/client/game.html");
  } else {
    res.sendFile(__dirname + "/client/index.html");
  }
});
app.get('/common.js', (req, res) => {
  res.sendFile(__dirname + "/common.js");
});
app.use(express.static('client'));
app.use('/assets', express.static('assets'));
server.listen(3000, () => {
  console.log('listening on port 3000.');
}); 

// game globals
var players = {};
var playerIds = {};

// networking
io.on('connection', (socket) => {
  socket.on('con', (name) => {
    console.log('a user connected with id:', socket.id);
    if (!players[name]) {
      players[name] = new Player();
      playerIds[name] = socket.id;
      socket.emit('coninfo', players);
      socket.broadcast.emit('newcon', name);
    } else {
      socket.emit('nametaken');
    }
  });
  socket.on('disconnect', () => {
    var name;
    for (const playerName in playerIds) {
      if (playerIds[playerName] == socket.id) {
        name = playerName;
        break;
      }
    }
    if (name && players[name]) {
      console.log('user', name, 'disconnected.');
      delete players[name];
      delete playerIds[name];
      io.emit('delcon', name);
    }
  });
  socket.on('pos', (name, pos) => {
    if (!players[name] || playerIds[name] != socket.id) return;
    players[name].x = pos[0];
    players[name].y = pos[1];
    players[name].dir = pos[2];
    players[name].anim = pos[3];
    socket.broadcast.emit('pos', name, pos);
  });
});
