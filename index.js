// imports
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const common = require("./common.js");
const fs = require('fs');

// app routes
app.get('/join', (req, res) => { res.sendFile(__dirname + "/client/index.html"); });
app.get('/join/:name', (req, res) => {
  const name = req.params.name;
  const nonAlphaNumeric = /[^a-zA-Z0-9_]/;
  if (name.length >= 3 && name.length <= 16 && !nonAlphaNumeric.test(name)) {
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
var zombies = [];
var playerIds = {};
var safeTimer = common.SAFETIME * (common.TICKS_PER_SEC);
var doorTimer = 0;
var doorBounds = [];
var activatedDoors = [];
var boats = [];
var boatActivated = [];
var boatDelays = [];
var boatSpeeds = [];
var boatPoints = [];
var boatLoops = [];
var boatWaypoints = [];
var boatNames = [];
var boatWaypointLast = [];
var laserIdCutoff = -1;
var laserBounds = [];
var laserLifetime = 0;
var laserTimer = 0;
var laserInterval = 0;
var laserCount = 0;
var laserVel = [0, 0];
var laserActive = false;
var rtvs = [];
var mapTime = 0;
var nominatedMaps = [];
var votes = [];
var isVoting = false;
var playerToVote = {};
var finishedMap = false;
var grenades = [];
var zombiesWonReset = false;
var spawnBounds = [];
var checkpointBounds = [];
var checkpointId = -1;
var zombieNumOverride = -1;
var zombieMotherRatio = (11/12);
var spawnGrenades = 2;

const maps = [
  "pizzatime",
  "atix_panic",
  "mario_tower",
  "jurrasic_park",
  "boatescape",
];

// maps
let loadMap = (name) => {
  common.setMapName(name);
  common.loadTilesetsFromJSON(JSON.parse(fs.readFileSync('./assets/maps/' + common.getMapName() + '/tiles.tsj').toString()));
  common.loadMapDataFromJSON(JSON.parse(fs.readFileSync('./assets/maps/' + common.getMapName() + '/map.tmj').toString()));
  zombiesWonReset = false;
  boats = [];
  grenades = [];
  boatActivated = [];
  boatDelays = [];
  boatSpeeds = [];
  boatPoints = [];
  boatLoops = [];
  boatWaypoints = [];
  boatWaypointLast = [];
  boatNames = [];
  laserIdCutoff = -1;
  laserActive = false;
  laserBounds = [0, 0, 0, 0];
  laserInterval = 0;
  laserCount = 0;
  laserLifetime = 0;
  laserTimer = 0;
  finishedMap = false;
  laserVel = [0, 0];
  for (const id in common.getMapObjects().objects) {
    let obj = common.getMapObjects().objects[id];
    if (obj.name == 'spawn') {
      spawnBounds = [obj.x/16, obj.y/16, obj.width/16, obj.height/16];
      checkpointBounds = structuredClone(spawnBounds);
    }
    if (obj.name != "boat") continue;
    boats.push([obj.x/16, obj.y/16, obj.width/16, obj.height/16, 0, 0]);
    let spd = 1, delay = 0, loop = false;
    for (const propid in obj.properties) {
      let prop = obj.properties[propid];
      if (prop.name == 'delay') delay = prop.value;
      if (prop.name == 'loop') loop = prop.value;
      if (prop.name == 'speed') spd = prop.value;
    }
    delay = Math.round(delay * (common.TICKS_PER_SEC));
    boatWaypointLast.push([obj.x/16, obj.y/16]);
    boatNames.push(obj.type);
    boatDelays.push(delay);
    boatSpeeds.push(spd);
    boatLoops.push(loop);
    boatPoints.push(0);
    boatActivated.push(delay ? false : true);
    let waypoints = [];
    for (const j in common.getMapObjects().objects) {
      let pt = common.getMapObjects().objects[j];
      if (pt.name != "track_point" || pt.type.split('_')[0] != obj.type) continue;
      let id = pt.type.split('_')[1];
      while (waypoints.length - 1 < id) waypoints.push([0, 0]);
      waypoints[id] = [pt.x / 16, pt.y / 16];
    }
    boatWaypoints.push(waypoints);
  }
};
mapTime = common.MAPTIME * common.TICKS_PER_SEC;
loadMap(maps[4]); // default map on server start

// networking
io.on('connection', (socket) => {
  socket.on('con', (name) => {
    console.log('a user connected with id:', socket.id);
    if (!players[name]) {
      players[name] = new common.Player();
      if (safeTimer < common.SAFETIMEZOMBIE * common.TICKS_PER_SEC) {
        players[name].zombie = true;
      }
      playerIds[name] = socket.id;
      socket.emit('coninfo', players, safeTimer * common.SECS_PER_TICK, spawnGrenades);
      if (activatedDoors.length > 0) socket.emit('override_tiles', common.getMapTileData());
      socket.emit('changemap', common.getMapName(), mapTime * common.SECS_PER_TICK);
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
  socket.on('playerzom', (name) => {
    if (!players[name] || playerIds[name] != socket.id) return;
    players[name].zombie = true;
    socket.broadcast.emit('playerzom', name);
  });
  socket.on('chat', (name, msg) => {
    if (!players[name] || playerIds[name] != socket.id) return;
    if (msg.toLowerCase() == "rtv") {
      io.emit('chat', '#0f0', name + " wants to rock the vote!");
      if (rtvs.find((rtver) => rtver == name) == undefined) {
        rtvs.push(name);
      }
      let numPlayers = 0;
      for (const _ in players) numPlayers++;
      if (numPlayers > 6) numPlayers = Math.ceil(numPlayers / 4 * 3);
      if (rtvs.length >= numPlayers && mapTime > common.VOTETIME * (common.TICKS_PER_SEC)) {
        mapTime = common.VOTETIME * (common.TICKS_PER_SEC);
      }
      io.emit('chat', '#0f0', rtvs.length + "/" + numPlayers + " votes needed");
    } else if ((msg == "1" || msg == "2" || msg == "3") && isVoting) {
      if (playerToVote[name] != undefined && playerToVote[name] == msg) return;
      if (playerToVote[name]) votes[Number(playerToVote[name]) - 1]--;
      playerToVote[name] = msg;
      votes[Number(msg) - 1]++;
      io.emit('chat', '#00f', name + " voted for " + nominatedMaps[Number(msg)]);
      io.emit('chat', '#ff0', nominatedMaps[0] + "(" + votes[0] + "),");
      io.emit('chat', '#ff0', nominatedMaps[1] + "(" + votes[1] + "),");
      io.emit('chat', '#ff0', nominatedMaps[2] + "(" + votes[2] + ")");
    } else if (msg.split(' ')[0] == 'nominate' && !isVoting) {
      let args = msg.split(' ');
      if (args.length == 1) {
        maps.forEach((mapname) => {
          socket.emit('chat', '#00f', mapname);
        });
      } else {
        if (maps.find((mapname) => mapname == args[1]) != undefined) {
          if (nominatedMaps.length < 3) {
            nominatedMaps.push(args[1]);
            io.emit('chat', '#00f', name + " nominated " + args[1] + "!");
          }
        } else {
          maps.filter((mapname) => mapname.includes(args[1])).forEach((mapname) => {
            socket.emit('chat', '#00f', mapname);
          });
        }
      }
    } else if (msg.startsWith("!")) {
      if (msg.toLowerCase() == "!gun" || msg.toLowerCase() == "!guns") socket.emit('chat', '#ff0', "use !ak, !m3, or !m249");
      if (msg == "!ak") {
        io.emit('gun', name, 1);
        players[name].gun = 1;
      }
      if (msg == "!m3") {
        io.emit('gun', name, 2);
        players[name].gun = 2;
      }
      if (msg == "!m249") {
        io.emit('gun', name, 0);
        players[name].gun = 0;
      }
      let args = msg.split(' ');
      if (args[0] == '!zm') {
        if (args.length > 1) zombieMotherRatio = 1 - Math.min(1, Math.max(0, Number(args[1]) / 100));
        else {
          socket.emit('chat', '#fff', "!zm set mother zombie percentage");
          socket.emit('chat', '#fff', "default: 8.3");
        }
      }
      if (args[0] == '!z') {
        if (args.length > 1) zombieNumOverride = Number(args[1]);
        else {
          socket.emit('chat', '#fff', "!z override number of ai zombies");
          socket.emit('chat', '#fff', "default: -1");
        }
      }
      if (args[0] == '!g') {
        if (args.length > 1) {
          spawnGrenades = Math.max(0, Math.min(10, Math.floor(Number(args[1]))));
          io.emit('gnum', spawnGrenades);
        } else {
          socket.emit('chat', '#fff', "!g override number of grenades");
          socket.emit('chat', '#fff', "default: 2");
        }
      }
      if (msg == '!help') {
        socket.emit('chat', '#fff', "help:");
        socket.emit('chat', '#fff', "WSAD or ARROWS to move");
        socket.emit('chat', '#fff', "!guns to buy guns");
        socket.emit('chat', '#fff', "SPACE to throw grenade");
        socket.emit('chat', '#fff', "");
        socket.emit('chat', '#fff', "other commands:");
        socket.emit('chat', '#fff', "!zm set mother zombie percentage");
        socket.emit('chat', '#fff', "!z set number of ai zombies");
        socket.emit('chat', '#fff', "!g set number of grenades");
        socket.emit('chat', '#fff', "\"rtv\" call a vote to change map");
      }
    } else {
      io.emit('chat', '#ddd', name + ": " + msg);
    }
  });
  socket.on('pos', (name, pos) => {
    if (!players[name] || playerIds[name] != socket.id) return;
    players[name].x = pos[0];
    players[name].y = pos[1];
    players[name].dir = pos[2];
    players[name].anim = pos[3];
    players[name].aim = pos[4];
    if (!players[name].zombie && players[name].gun != 2) {
      switch (players[name].anim) {
        case 2:
        case 3:
        case 5:
          doPlayerShoot(socket, name, 0, 0.3);
      }
    }
    socket.broadcast.emit('pos', name, pos);
  });
  socket.on('m3', (name, extraPunch, pos) => {
    if (!players[name] || playerIds[name] != socket.id) return;
    players[name].x = pos[0];
    players[name].y = pos[1];
    players[name].aim = pos[2];
    doPlayerShoot(socket, name, extraPunch, 0.6);
    socket.broadcast.emit('m3', name, pos);
  });
  socket.on('grenade', (name) => {
    if (!players[name] || playerIds[name] != socket.id) return;
    let grenade = common.createGrenade(players[name].x, players[name].y, players[name].aim);
    io.emit('grenade', grenade);
    common.addGrenadeToArray(grenades, grenade);
  });
});

// game
var doPlayerShoot = (socket, name, extraPunch, rad) => {
  let player = players[name];
  let startX = player.x + 0.5;
  let startY = player.y + 0.5;
  let endX = player.x + 0.5 + Math.cos(player.aim) * 32;
  let endY = player.y + 0.5 + Math.sin(player.aim) * 32;
  let getFactor = (x0, y0, x1, y1) => {
    x0 = x1-x0; y0 = y1-y0;
    let f = (Math.sqrt(x0*x0+y0*y0)/common.M3CUTOFF);
    return 1 - Math.min(1, f);
  };
  zombies.forEach((zombie) => {
    if (common.doesLineHitCircle(startX, startY, endX, endY, zombie.x+.5, zombie.y+.5, rad) &&
        !common.lineTileCollision(startX, startY, zombie.x + 0.5, zombie.y + 0.5)) {
      let punch = Math.random() * common.PUNCH;
      if (common.getTileProps(zombie.x + 0.5, zombie.y + 0.5).liquid && zombie.boat < 0) punch = common.WATERPUNCH;
      punch += extraPunch * getFactor(startX, startY, zombie.x+.5, zombie.y+.5);
      zombie.spd = common.PUNCHSPEED;
      zombie.x += Math.cos(player.aim) * punch;
      zombie.y += Math.sin(player.aim) * punch;
    }
  });
  for (const otherName in players) {
    if (name == otherName) continue;
    let p = players[otherName];
    if (common.doesLineHitCircle(startX, startY, endX, endY, p.x+.5, p.y+.5, rad) &&
        !common.lineTileCollision(startX, startY, p.x+.5, p.y+.5)) {
      socket.broadcast.emit('hit', otherName, player.aim, extraPunch*getFactor(startX, startY, p.x+.5, p.y+.5));
    }
  }
};
var softReset = () => {
  zombiesWonReset = false;
  io.emit('restartgame');
  loadMap(common.getMapName());
  checkpointBounds = structuredClone(spawnBounds);
  for (const name in players) players[name].zombie = false;
  zombies = [];
  safeTimer = common.SAFETIME * (common.TICKS_PER_SEC);
  doorTimer = 0;
  doorBounds = [];
  activatedDoors = [];
};
var spawnZombie = (x, y) => {
  let zom = { x: 0, y: 0, dir: 1, spd: 0, exp: 0, boat: -1 };
  zom.x = x;
  zom.y = y;
  zom.spd = common.ZOMSPEED;
  zombies.push(zom);
};
var getSpawnCoord = () => {
  let x = checkpointBounds[0] + (checkpointBounds[2] * .2) + (Math.random() * checkpointBounds[2] * .6);
  let y = checkpointBounds[1] + (checkpointBounds[3] * .2) + (Math.random() * checkpointBounds[3] * .6);
  return [x, y];
};
var spawnZombies = () => {
  let numPlayers = 0;
  for (const _ in players) numPlayers++;
  let numSpawns = numPlayers;
  if (numSpawns < 8) numSpawns = 10;
  if (numPlayers >= 8) numSpawns /= 2;
  if (numPlayers >= 10) numSpawns /= 2;
  if (numPlayers >= 16) numSpawns /= 2;
  if (numPlayers >= 32) numSpawns /= 2;
  if (zombieNumOverride != -1) numSpawns = zombieNumOverride;
  for (let i = 0; i < numSpawns; i++) {
    let [x, y] = getSpawnCoord();
    spawnZombie(x, y);
  }
  if (numPlayers == 1 || zombieMotherRatio > 0.99) return;
  let names = [];
  for (const name in players) names.push(name);
  for (let i = 0; i < Math.ceil(numPlayers*zombieMotherRatio); i++) {
    let idx = Math.floor(Math.random() * names.length);
    names.splice(idx, 1);
  }
  io.emit('motherzoms', names);
  for (let name of names) {
    if (!players[name]) continue;
    players[name].zombie = true;
  }
};
var updateZombies = () => {
  zombies.forEach((zombie) => {
    // get closest player
    let tx = 0, ty = 0, dist = Infinity;
    for (const name in players) {
      let dx = players[name].x - zombie.x;
      let dy = players[name].y - zombie.y;
      let d = Math.sqrt(dx*dx + dy*dy);
      if (d < dist && !players[name].zombie && !common.lineTileCollision(zombie.x+.5, zombie.y+.5, players[name].x+.5, players[name].y+.5)) {
        dist = d;
        tx = players[name].x;
        ty = players[name].y;
      }
    }
    zombie.boat = -1;
    boats.forEach((boat, idx) => {
      if (zombie.x + 0.5 > boat[0] && zombie.x + 0.5 < boat[0] + boat[2] &&
          zombie.y + 0.5 > boat[1] && zombie.y + 0.5 < boat[1] + boat[3]) zombie.boat = idx;
    });

    let ang = Math.atan2(ty - zombie.y, tx - zombie.x);
    let velx = 0, vely = 0;
    if (dist == Infinity || common.isAIDirForced(zombie.x+.5, zombie.y+.5)) {
      [velx, vely] = common.getAIDir(zombie.x+.5, zombie.y+.5);
      if (zombie.boat >= 0 && dist != Infinity) {
        velx = Math.cos(ang);
        vely = Math.sin(ang);
      } else if (zombie.boat >= 0 && !(boats[zombie.boat][4] == 0 && boats[zombie.boat][5] == 0)) {
        velx = 0; vely = 0;
      }
    } else {
      velx = Math.cos(ang);
      vely = Math.sin(ang);
    }
    
    if (zombie.spd < common.ZOMSPEED) zombie.spd += common.ZOMSPEED * (common.SECS_PER_TICK);
    if (zombie.spd > common.ZOMSPEED) zombie.spd = common.ZOMSPEED;
    let spd = zombie.spd;
    if (common.getTileProps(zombie.x + 0.5, zombie.y + 0.5).liquid && zombie.boat < 0) {
      spd = common.WATERMUL * common.ZOMSPEED;
    }
    zombie.exp -= common.SECS_PER_TICK;
    if (zombie.exp > 0) spd = 0.3;
    zombie.x += velx * (common.SECS_PER_TICK) * spd;
    zombie.y += vely * (common.SECS_PER_TICK) * spd;
    if (zombie.boat >= 0) {
      zombie.x += boats[zombie.boat][4] * common.SECS_PER_TICK;
      zombie.y += boats[zombie.boat][5] * common.SECS_PER_TICK;
    }

    let zombieCoords = [zombie.x, zombie.y];
    zombies.forEach((other) => {
      let otherCoords = [other.x, other.y];
      common.collisionResponseCircles(zombieCoords, otherCoords, common.ENTRAD_PHYS, common.ENTRAD_PHYS, true, 1);
      other.x = otherCoords[0];
      other.y = otherCoords[1];
    });
    common.collisionResponseHalfBlock(zombieCoords);
    zombie.x = zombieCoords[0];
    zombie.y = zombieCoords[1];

    grenades.forEach((g) => {
      if (!g[5] || g[4] < common.GRENADE_PRIME) return;
      if (zombie.x > g[0]-2 && zombie.x < g[0]+4 &&
          zombie.y > g[1]-2 && zombie.y < g[1]+4) {
        zombie.exp = 2;
      }
    });

    // zombies dieing
    let tileProps = common.getTileProps(zombie.x + 0.5, zombie.y + 0.5);
    if ((tileProps.kills || tileProps.void) && zombie.boat < 0) {
      [zombie.x, zombie.y] = getSpawnCoord();
    }
  });
  io.emit('zoms', zombies.map((zombie) => [zombie.x, zombie.y, zombie.boat, zombie.exp > 0]));
};
setInterval(() => {
  updateZombies();

  // update boats
  boats.forEach((boat, i) => {
    if (!boatActivated[i]) {
      for (const name in players) {
        let p = players[name];
        if (p.x+.5 > boat[0] && p.x+.5 < boat[0] + boat[2] &&
            p.y+.5 > boat[1] && p.y+.5 < boat[1] + boat[3] && safeTimer <= 0) {
          boatActivated[i] = true;
          io.emit('boatlaunch', boatNames[i], Math.round(boatDelays[i] / (common.TICKS_PER_SEC)));
        }
      }
    } else {
      if (boatDelays[i]-- > 0 || (!boatLoops[i] && boatPoints[i] >= boatWaypoints[i].length)) {
        boat[4] = 0;
        boat[5] = 0;
        return;
      }
      let [tx, ty] = boatWaypoints[i][boatPoints[i]];
      let dx = (tx - boatWaypointLast[i][0]), dy = (ty - boatWaypointLast[i][1]);
      let dist = Math.sqrt(dx*dx + dy*dy);
      dx /= dist; 
      dy /= dist;
      boat[4] = dx * boatSpeeds[i];
      boat[5] = dy * boatSpeeds[i];
      boat[0] += boat[4] * (common.SECS_PER_TICK);
      boat[1] += boat[5] * (common.SECS_PER_TICK);
      if (Math.abs((boat[0] - tx) + (boat[1] - ty)) < boatSpeeds[i] * (common.SECS_PER_TICK) + 0.2) {
        boatWaypointLast[i] = [boat[0], boat[1]];
        boatPoints[i]++;
        if (boatLoops[i] && boatPoints[i] >= boatWaypoints[i].length) {
          boatPoints[i] = 0;
        }
      }
    }
  });
  io.emit('boats', boats);

  // update lasers and grenades
  common.updateGrenades(grenades, common.SECS_PER_TICK);
  if (laserActive) {
    laserTimer++;
    if (laserTimer >= laserInterval) {
      laserTimer = 0;
      for (let i = 0; i < laserCount; i++) {
        let x = Math.random() * laserBounds[2] + laserBounds[0] - 0.5;
        let y = Math.random() * laserBounds[3] + laserBounds[1] - 0.5;
        io.emit('laser', [x, y, laserVel[0], laserVel[1], laserLifetime]);
      }
    }
  }
  
  // spawn zombies
  safeTimer -= 1;
  let numZoms = zombies.length;
  for (const name in players) if (players[name].zombie) numZoms++;
  if (numZoms == 0 && safeTimer < 0 && !finishedMap) {
    spawnZombies();
  }
  // trigger doors and lasers
  for (const id in common.getMapObjects().objects) {
    if (safeTimer > 0) break;
    let obj = common.getMapObjects().objects[id];
    let touched = false, playerTouched = false, zombieTouched = false;
    for (const name in players) {
      let p = players[name];
      let x = (p.x+.5) * 16, y = (p.y+.5) * 16;
      if (x > obj.x && x < obj.x + obj.width &&
          y > obj.y && y < obj.y + obj.height) {
        touched = true;
        playerTouched = true;
      }
    }
    zombies.forEach((zom) => {
      let x = (zom.x+.5) * 16, y = (zom.y+.5) * 16;
      if (x > obj.x && x < obj.x + obj.width &&
          y > obj.y && y < obj.y + obj.height) {
        touched = true;
        zombieTouched = true;
      }
    });
    if (obj.name == "door_trigger") {
      let zombieOnly = false;
      for (const propId in obj.properties) {
        let prop = obj.properties[propId];
        if (prop.name == "zombie_only") zombieOnly = prop.value;
      }
      if (!zombieOnly && !touched) continue;
      if (zombieOnly && !zombieTouched) continue;
      if (activatedDoors.find((id) => id == obj.id) != undefined) continue;
      activatedDoors.push(obj.id);
      currentTriggerDoor = obj.type;
      for (const propId in obj.properties) {
        let prop = obj.properties[propId];
        if (prop.name == "delay") {
          io.emit('doortimer', prop.value);
          doorTimer = prop.value * (common.TICKS_PER_SEC);
        }
      }
      for (const oid in common.getMapObjects().objects) {
        let otherObj = common.getMapObjects().objects[oid];
        if (otherObj.name != "door" || otherObj.type != obj.type) continue;
        let bounds = [Math.floor(otherObj.x/16), Math.floor(otherObj.y/16), Math.floor((otherObj.x + otherObj.width)/16), Math.floor((otherObj.y + otherObj.height)/16)];
        doorBounds.push(bounds);
      }
    } else if (obj.name == "laser_enable") {
      if (!playerTouched) continue;
      if (obj.type <= laserIdCutoff) continue;
      laserIdCutoff = obj.type;
      laserActive = true;
      laserTimer = 0;
      laserVel = [0, 0];

      for (const i in common.getMapObjects().objects) {
        let other = common.getMapObjects().objects[i];
        if (other.name != "laser_spawner" || other.type != obj.type) continue;
        laserBounds = [other.x/16, other.y/16, other.width/16, other.height/16];
        for (const p in other.properties) {
          let prop = other.properties[p];
          if (prop.name == "lifetime") laserLifetime = prop.value;
          if (prop.name == "num_per_tick") laserCount = prop.value;
          if (prop.name == "tick_interval") laserInterval = prop.value;
          if (prop.name == "xvel") laserVel[0] = prop.value;
          if (prop.name == "yvel") laserVel[1] = prop.value;
        }
      }
    } else if (obj.name == "laser_disable") {
      if (!playerTouched) continue;
      if (obj.type == laserIdCutoff) continue;
      laserActive = false;
    } else if (obj.name == "finish" && !finishedMap) {
      if (!playerTouched) continue;
      finishedMap = true;
      io.emit('chat', '#f0f', 'MAP COMPLETE!!!');
      io.emit('finish');
      zombies = [];
      for (const name in players) players[name].zombie = false;
      setTimeout(softReset, 5000);
    } else if (obj.name == "checkpoint" && !finishedMap && safeTimer < 0) {
      if (!touched) continue;
      if (obj.type <= checkpointId) continue;
      let zspawnDelay = 0;
      for (const p in obj.properties) {
        let prop = obj.properties[p];
        if (prop.name == "zspawn_delay") zspawnDelay = prop.value;
      }
      checkpointId = obj.type;
      bounds = [obj.x / 16, obj.y/16, obj.width/16, obj.height/16];
      io.emit('checkpoint', bounds, zspawnDelay);
      if (zspawnDelay > 0) {
        setTimeout(() => {
          checkpointBounds = bounds;
          zombies.forEach((zom) => {
            [zom.x, zom.y] = getSpawnCoord();
          });
        }, zspawnDelay * 1000);
      } else {
        setTimeout(() => {
          checkpointBounds = bounds;
        }, 6000);
      }
    }
  }
  doorTimer--;
  if (doorTimer < 0) {
    doorTimer = 0;
    while (doorBounds.length > 0) {
      let bounds = doorBounds.pop();
      for (let y = bounds[1]; y <= bounds[3]; y++) {
        for (let x = bounds[0]; x <= bounds[2]; x++) {
          common.setTile(x, y, common.getTileProps(x, y).barrierId);
        }
      }
      io.emit('breakdoor', bounds);
    }
  }
  // restart game
  if (mapTime < common.VOTETIME * (common.TICKS_PER_SEC) && !isVoting) {
    isVoting = true;
    while (nominatedMaps.length < 3) nominatedMaps.push(
      maps[Math.floor(Math.random() * maps.length)]
    );
    votes = [0, 0, 0];
    playerToVote = {};
    io.emit('votingstart', nominatedMaps);
    io.emit('chat', '#ff0', "ROCK THE VOTE");
    io.emit('chat', '#ff0', "map 1: " + nominatedMaps[0] + ",");
    io.emit('chat', '#ff0', "map 2: " + nominatedMaps[1] + ",");
    io.emit('chat', '#ff0', "map 3: " + nominatedMaps[2]);
  }
  if (isVoting && mapTime < 0) {
    isVoting = false;
    rtvs = [];
    common.setMapName(nominatedMaps[votes.map((v, i) => [v, i]).reduce((acc, val) => {
      if (val[0] > acc[0]) {
        return val;
      } else {
        return acc;
      }
    }, [-1, 0])[1]]);
    console.log(common.getMapName());
    nominatedMaps = [];
    zombies = [];
    mapTime = common.MAPTIME * common.TICKS_PER_SEC;
    io.emit('chat', '#f00', "changing map...");
    softReset();
    loadMap(common.getMapName());
    io.emit('changemap', common.getMapName(), common.MAPTIME);
  }
  mapTime--;
  let numZombiePlayers = 0, numPlayers = 0;
  for (const name in players) {
    if (players[name].zombie) numZombiePlayers++;
    numPlayers++;
  }
  if (numZombiePlayers === numPlayers && numPlayers > 0 && numZombiePlayers > 0 && !zombiesWonReset) {
    zombiesWonReset = true;
    zombies = [];
    io.emit('zombieswin');
    setTimeout(softReset, 4000);
  }
}, common.TICKMS);

