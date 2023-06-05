// library/dom globals
var socket = io();
var canvas = document.getElementById('game-screen');
var ctx = canvas.getContext('2d');

// game globals
var clientName = window.location.pathname.split('/').pop();
var players = { };
var zombies = [];
var boats = [];
var bulletFx = [];
var bulletCooldown = 0;
var lastTick = performance.now();
var lastUpdate = performance.now();
var keys = { left: false, right: false, down: false, up: false, fire: false, space: false };
var mousex = 0, mousey = 0;
var deltaTime = 0;
var gameTime = 0;
var connected = false;
var camx = 0, camy = 0;
var camw = 0, camh = 0;
var doorTimer = 0;
var chatLog = [];
var chatMsg = "";
var chatCursor = 0;
var isChatting = false;
var overrideTiles;
var onRestartTiles;
var boatTimer = 0;
var boatTimerName = "";
var lasers = [];
var mapTimeLeft = 0;
var nominatedMaps = [];
var finishScreenTimer = 0;
var zomCheckpointScreenTimer = 0;
var finishHumansWon = false;
var safeTimer = SAFETIME;
var grenades = [];
var motherZomTextTimer = 0;
var spawnBounds = [];
var checkpointBounds = [];
var spawnGrenades = 2;
players[clientName] = {...new Player()};

// game constants
const MAXCAMSZ = 16;
const gunReloads = [5, 1.5, 0.5];
const gunAmmo = [150, 24, 1];
const m3Reload = 1;

// canvas updates
var screenResize = (event) => {
  canvas.clientWidth = window.innerWidth;
  canvas.clientHeight = window.innerHeight;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  camScaleFactor = Math.max(canvas.clientWidth, canvas.clientHeight) / MAXCAMSZ;
  if (canvas.clientWidth > canvas.clientHeight) {
    camw = MAXCAMSZ;
    camh = canvas.clientHeight / canvas.clientWidth * MAXCAMSZ;
  } else {
    camw = canvas.clientWidth / canvas.clientHeight * MAXCAMSZ;
    camh = MAXCAMSZ;
  }
  ctx.font = "10px \"Pixel\"";
  ctx.webkitImageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;
};
window.addEventListener('resize', screenResize, false);
screenResize();

// sounds/music
var sounds = {};
var loopingSounds = {};
const audioCtx = new AudioContext();
var playSound = (name, loop, gain) => {
  if (!sounds[name]) return;
  const trackSource = audioCtx.createBufferSource();
  trackSource.buffer = sounds[name];
  if (gain) {
    let gainNode = audioCtx.createGain();
    gainNode.gain.value = gain;
    trackSource.connect(gainNode).connect(audioCtx.destination);
  } else {
    trackSource.connect(audioCtx.destination);
  }
  trackSource.start();
  if (loop) {
    trackSource.loop = true;
    loopingSounds[name] = trackSource;
  }
};
var stopSound = (name) => {
  if (loopingSounds[name]) {
    loopingSounds[name].stop();
    delete loopingSounds[name];
  }
};

// loading assets
const pixelFont = new FontFace("Pixel", "url(/assets/pixel-font.ttf)");
document.fonts.add(pixelFont);
ctx.font = "10px Pixel";
var images = {};
async function fetchImage(url) {
  let blob = await fetch(url).then(res => res.blob());
  let img = new Image();
  img.src = URL.createObjectURL(blob);
  return img;
}
async function loadSound(name, url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  sounds[name] = audioBuffer;
}
async function loadImage(name, url, fw, fh) {
  images[name] = {};
  images[name].img = await fetchImage(url);
  images[name].fw = fw;
  images[name].fh = fh;
}
(async function() { // actually load the main game images
  loadImage("player", "/assets/player.png", 16, 16);
  loadImage("zombie", "/assets/zombie.png", 16, 16);
  loadImage("bullet", "/assets/bullet.png", 8, 8);
  loadImage("clip", "/assets/clip.png", 64, 16);
  loadImage("clip_zombie", "/assets/clip_zombie.png", 64, 32);
  loadImage("laser", "/assets/laser.png", 16, 16);
  loadImage("logo", "/assets/logo.png", 128, 32);
  loadImage("win", "/assets/win.png", 96, 64);
  loadImage("zombies_win", "/assets/zombies_win.png", 64, 64);
  loadImage("grenade", "/assets/grenade.png", 16, 16);
  loadImage("explosion", "/assets/explosion.png", 64, 64);

  loadSound('ak47', '/assets/ak47.mp3');
  loadSound('m3', '/assets/m3.mp3');
  loadSound('m249', '/assets/m249.mp3');
  loadSound('zombie', '/assets/zombie.mp3');
  loadSound('welcome', '/assets/joinserver.mp3');
  loadSound('perfect', '/assets/perfect.mp3');
  loadSound('impressive', '/assets/impressive.mp3');
  loadSound('godlike', '/assets/godlike.mp3');
  loadSound('humiliation', '/assets/humiliation.mp3');
  loadSound('zombie_die', '/assets/zombie_die1.mp3');
  for (i = 1; i <= 10; i++) loadSound(String(i), '/assets/' + i + '.mp3');
})();

setTimeout(() => playSound('welcome'), 500);

// maps
var respawnClient = () => {
  if (players[clientName] && checkpointBounds.length > 0) {
    players[clientName].x = checkpointBounds[0] + Math.random() * checkpointBounds[2];
    players[clientName].y = checkpointBounds[1] + Math.random() * checkpointBounds[3];
    players[clientName].ammo = gunAmmo[players[clientName].gun];
    players[clientName].grenade = spawnGrenades;
  }
};
socket.on('override_tiles', (array) => {
  overrideTiles = array;
});
socket.on('changemap', async function(name) {
  setMapName(name);
  // Load the tile properties
  let res = await fetch('/assets/maps/' + name + '/tiles.tsj');
  loadTilesetsFromJSON(await res.json());

  res = await fetch('/assets/maps/' + name + '/map.tmj');
  loadImage('tiles', "/assets/maps/" + name + "/tiles.png", 16, 16);
  loadMapDataFromJSON(await res.json());
  onRestartTiles = structuredClone(getMapTileData());
  if (overrideTiles != undefined) {
    setMapTileData(overrideTiles);
    overrideTiles = undefined;
  }
  let musicURL = '/assets/maps/' + name + '/music.mp3';
  stopSound('music');
  if ((await fetch(musicURL)).ok) {
    loadSound('music', musicURL);
    setTimeout(() => playSound('music', true, 0.5), 500);
  }
  for (const i in getMapObjects().objects) {
    let obj = getMapObjects().objects[i];
    if (obj.name == 'spawn') {
      spawnBounds = [obj.x/16, obj.y/16, obj.width/16, obj.height/16];
      checkpointBounds = structuredClone(spawnBounds);
      checkpointId = -1;
    }
  }

  // Set our position
  respawnClient();
  mapTimeLeft = MAPTIME;
  doorTimer = 0;
  boatTimer = 0;
  grenades = [];
});

// rendering
let transformPoint = (x, y) => {
  x = ((x - camx) / camw) * canvas.clientWidth;
  y = ((y - camy) / camh) * canvas.clientHeight;
  return [x, y];
};
let drawImage = (img, x, y, dw, dh, fx, fy) => {
  if (!images[img] || !images[img].img) return;
  dw = (dw / camw) * canvas.clientWidth + 2;
  dh = (dh / camh) * canvas.clientHeight + 2;
  x = ((x - camx) / camw) * canvas.clientWidth - 1;
  y = ((y - camy) / camh) * canvas.clientHeight - 1;
  ctx.drawImage(images[img].img, images[img].fw * fx + 0.25, images[img].fh * fy + 0.25, images[img].fw - 0.5, images[img].fh - 0.5, x, y, dw, dh);
};
let drawText = (text, x, y) => {
  x = ((x - camx) / camw) * canvas.clientWidth;
  y = ((y - camy) / camh) * canvas.clientHeight;
  ctx.fillText(text, x, y);
};
let drawMap = () => {
  if (!isMapLoaded()) return;
  for (let y = Math.floor(camy); y < Math.ceil(camy + camh); y++) {  
    for (let x = Math.floor(camx); x < Math.ceil(camx + camw); x++) {
      if (x < 0 || y < 0 || x >= getMapWidth() || y >= getMapHeight()) continue;
      let i = getTile(x, y);
      drawImage('tiles', x, y, 1, 1, i % mapTileset.columns, Math.floor(i / mapTileset.columns));
    }
  }
};
let drawPlayer = (player) => {
  let frame = 0;
  switch (player.anim) {
    case 1:
      frame = Math.floor((gameTime / 150) % 2);
      break;
    case 3:
      frame = Math.floor((gameTime / 50) % 2) + 1;
      break;
    case 2:
      frame = [2, 0][Math.floor((gameTime / 50) % 2)];
      if (player.zombie) frame = 2;
      break;
    case 4:
      frame = 3;
      break;
    case 5:
      frame = Math.floor((gameTime / 50) % 2) + 3;
      break;
  }
  if (player.zombie) {
    let fire = 0;
    if (player.grenadeSlow > 0) fire = Math.floor((gameTime / 50) % 2);
    drawImage("zombie", player.x, player.y, 1, 1, frame, Number(player.dir == -1) + fire * 2);
  } else {
    if (player.gun == 2 && player.reloadCooldown < gunReloads[2]) {
      if (frame >= 3) frame = 4;
      else frame = 2;
    }
    drawImage("player", player.x, player.y, 1, 1, frame, Number(player.dir == -1) + player.gun * 2);
  }
};
let spawnBulletFx = (x, y, a) => {
  const spd = 40;
  for (const i in bulletFx) {
    if (!bulletFx[i][4]) {
      bulletFx[i][0] = x;
      bulletFx[i][1] = y;
      bulletFx[i][2] = Math.cos(a) * spd;
      bulletFx[i][3] = Math.sin(a) * spd;
      bulletFx[i][4] = true;
      return;
    }
  }
  bulletFx.push([x, y, Math.cos(a) * spd, Math.sin(a) * spd, true]);
};
let updateBulletFx = () => {
  if (bulletCooldown <= 0) {
    for (const name in players) {
      let player = players[name];
      if (player.zombie) continue;
      if (player.anim == 2 || player.anim == 3 || player.anim == 5) {
        spawnBulletFx(player.x + 0.5, player.y + 0.5, player.aim);
        bulletCooldown = 0.08;
      }
    }
  }
  bulletCooldown -= deltaTime;
  
  bulletFx.forEach((bullet, i) => {
    if (!bullet[4]) return;
    bullet[0] += bullet[2] * deltaTime;
    bullet[1] += bullet[3] * deltaTime;
    if (bullet[0] + 0.5 < camx || bullet[0] - 0.5 > camx + camw ||
        bullet[1] + 0.5 < camy || bullet[1] - 0.5 > camy + camh || isTileSolid(bullet[0], bullet[1])) {
      bullet[4] = false;
    }
  });
};
let drawBulletFx = () => {
  bulletFx.forEach((bullet) => {
    if (bullet[4]) drawImage("bullet", bullet[0] - 0.25, bullet[1] - 0.25, 0.5, 0.5, 0, 0);
  });
};

// chat box
const chatBoxWidth = 300;
const chatBoxHeight = 500;
const chatBoxPx = 10;
const chatBoxPadding = 15;
var drawChatBox = () => {
  ctx.fillStyle = '#273f597f';
  ctx.fillRect(canvas.clientWidth - chatBoxWidth - chatBoxPadding, canvas.clientHeight - chatBoxHeight - chatBoxPadding, chatBoxWidth, chatBoxHeight);
  ctx.fillStyle = '#273f597f';
  ctx.fillRect(canvas.clientWidth - chatBoxWidth - chatBoxPadding + 2, canvas.clientHeight - chatBoxPadding - 2*chatBoxPx, chatBoxWidth - 4, 2);
  ctx.drawImage(images['logo'].img, canvas.clientWidth - chatBoxPadding - chatBoxWidth, canvas.clientHeight - chatBoxPadding - chatBoxHeight - (chatBoxWidth / 4), chatBoxWidth, (chatBoxWidth / 4));
  ctx.font = chatBoxPx + 'px Pixel';
  ctx.textAlign = 'left';
  for (let i = 0; i < chatLog.length; i++) {
    ctx.fillStyle = chatLog[i][0];
    ctx.fillText(chatLog[i][1], canvas.clientWidth - chatBoxWidth - chatBoxPadding + 3, canvas.clientHeight - chatBoxPadding - chatBoxHeight + chatBoxPx + i*10);
  }
  ctx.fillStyle = '#ddf';
  if (isChatting) {
    ctx.fillText(clientName + ": " + chatMsg.substring(0, chatCursor) + "|" + chatMsg.substring(chatCursor, chatMsg.length), canvas.clientWidth - chatBoxWidth - chatBoxPadding + 3, canvas.clientHeight - chatBoxPadding - chatBoxPx/2);
  } else {
    ctx.fillText(">", canvas.clientWidth - chatBoxWidth - chatBoxPadding + 3, canvas.clientHeight - chatBoxPadding - chatBoxPx/2);
  }
  ctx.font = '10px Pixel';

  ctx.fillText("PLAYERS:", canvas.clientWidth - 115, 20);
  let i = 0;
  for (const name in players) {
    if (players[name].zombie) ctx.fillStyle = '#f00';
    else ctx.fillStyle = '#ddf';
    ctx.fillText(name, canvas.clientWidth - 215, 30 + i * 10);
    i++;
  }
};
var isMouseInsideChatBox = () => {
  let mx = mousex / camw * canvas.clientWidth;
  let my = mousey / camh * canvas.clientHeight;
  return mx > canvas.clientWidth - (chatBoxWidth + chatBoxPadding) && mx < canvas.clientWidth - chatBoxPadding &&
    my > canvas.clientHeight - (chatBoxHeight + chatBoxPadding) && my < canvas.clientHeight - chatBoxPadding;
};

// networking
let backToJoinScreen = () => { window.location.pathname = "/join"; };
var playerInterpNext = {};
var playerInterpLast = {};
var playerInterpTicks = {};
var zombieNext = [];
var zombieLast = [];
var zombieInterpTick = 0;
var boatLast = [];
var boatNext = [];
var boatInterpTick = 0;
socket.on('coninfo', (coninfo, safeTime, numGrenades) => {
  safeTimer = safeTime;
  spawnGrenades = numGrenades;
  players = coninfo;
  connected = true;
  if (safeTimer < SAFETIMEZOMBIE) players[clientName].zombie = true;
  console.log("--coninfo--");
  console.log("client name:", clientName);
  console.log("player list:", players);
  for (const name in coninfo) {
    playerInterpTicks[name] = 0;
    playerInterpNext[name] = [0, 0];
    playerInterpLast[name] = [0, 0];
  }
});
socket.on('nametaken', backToJoinScreen);
socket.on('newcon', (name) => {
  if (players[name]) return;
  players[name] = {...new Player()};
  playerInterpNext[name] = [0, 0];
  playerInterpLast[name] = [0, 0];
  if (safeTimer < SAFETIMEZOMBIE) playSound('zombie');
  console.log('a new player', name, 'connected!');
});
socket.on('delcon', (name) => {
  if (!players[name] || name == clientName) return;
  delete players[name];
  delete playerInterpNext[name];
  delete playerInterpLast[name];
  console.log('player', name, 'disconnected');
});
socket.on('restartgame', () => {
  setTimeout(() => {
    setMapTileData(structuredClone(onRestartTiles));
    for (const name in players) {
      players[name].zombie = false;
    }
    checkpointBounds = structuredClone(spawnBounds);
    respawnClient();
    safeTimer = SAFETIME;
    zombieLast = [];
    doorTimer = 0;
    boatTimer = 0;
    grenades = [];
  }, 500);
});
socket.on('hit', (name, ang, extraPunch) => {
  if (name != clientName || !players[clientName].zombie) return;
  let punch = Math.random() * PUNCH;
  if (getTileProps(players[clientName].x+.5, players[clientName].y+.5).liquid && players[clientName].boat < 0) punch = WATERPUNCH;
  punch += extraPunch;
  players[clientName].spd = PUNCHSPEED;
  players[clientName].x += Math.cos(ang) * punch;
  players[clientName].y += Math.sin(ang) * punch;
});
socket.on('pos', (name, pos) => {
  if (!players[name] || name == clientName) return;
  players[name].dir = pos[2];
  players[name].anim = pos[3];
  players[name].aim = pos[4];
  playerInterpLast[name][0] = playerInterpNext[name][0];
  playerInterpLast[name][1] = playerInterpNext[name][1];
  playerInterpNext[name] = pos;
  playerInterpTicks[name] = 0;
});
socket.on('zoms', (zoms) => {
  while (zombies.length < zoms.length) zombies.push([0, 0, -1, false]);
  zombies.length = zoms.length;
  while (zombieLast.length < zoms.length) zombieLast.push([0, 0, -1, false]);
  zombieLast.length = zombieLast.length;
  for (let i = 0; i < Math.min(zombieNext.length, zombieLast.length); i++) {
    zombieLast[i][0] = zombieNext[i][0];
    zombieLast[i][1] = zombieNext[i][1];
    zombieLast[i][2] = zombieNext[i][2];
    zombieLast[i][3] = zombieNext[i][3];
  }
  zombieNext = zoms;
  zombieInterpTick = 0;
});
socket.on('playerzom', (name) => {
  if (!players[name]) return;
  players[name].zombie = true;
  playSound('zombie');
});
socket.on('doortimer', (delay) => {
  doorTimer = delay;
});
socket.on('boats', (b) => {
  while (boats.length < b.length) boats.push([0, 0, 0, 0, 0, 0]);
  boats.length = b.length;
  while (boatLast.length < b.length) boatLast.push([0, 0]);
  boatLast.length = boatLast.length;
  for (let i = 0; i < Math.min(boatNext.length, boatLast.length); i++) {
    boatLast[i][0] = boatNext[i][0];
    boatLast[i][1] = boatNext[i][1];
  }
  boatNext = b;
  boatInterpTick = 0;
});
socket.on('breakdoor', (doorBounds) => {
  for (let y = doorBounds[1]; y <= doorBounds[3]; y++) {
    for (let x = doorBounds[0]; x <= doorBounds[2]; x++) {
      setTile(x, y, getTileProps(x, y).barrierId);
    }
  }
});
socket.on('boatlaunch', (name, delay) => {
  boatTimer = delay;
  boatTimerName = name;
});
socket.on('laser', (laser) => {
  laser.push(true);
  for (let i = 0; i < lasers.length; i++) {
    if (!lasers[i][5]) {
      lasers[i] = laser;
      return;
    }
  }
  lasers.push(laser);
});
socket.on('chat', (color, msg) => {
  chatLog.push([color, msg]);
  if (chatLog.length > 47) chatLog.shift();
});
socket.on('votingstart', (maps) => {
  nominatedMaps = maps;
  mapTimeLeft = VOTETIME;
});
socket.on('finish', () => {
  finishScreenTimer = 5;
  finishHumansWon = true;
  switch (Math.floor(Math.random() * 3)) {
    case 0: playSound('perfect'); break;
    case 1: playSound('impressive'); break;
    case 2: playSound('godlike'); break;
  }
  setTimeout(() => {
    for (const name in players) {
      players[name].zombie = false;
    }
    zombieLast = [];
  }, 500);
});
socket.on('gun', (name, gun) => {
  if (!players[name]) return;
  players[name].gun = gun;
  players[name].reloadCooldown = 0;
  players[name].ammo = 0;
});
socket.on('m3', (name, pos) => {
  if (!players[name] && name != clientName) return;
  players[name].reloadCooldown = 0;
  spawnBulletFx(pos[0]+.5, pos[1]+.5, pos[2]);
  spawnBulletFx(pos[0]+.5, pos[1]+.5, pos[2]-0.1);
  spawnBulletFx(pos[0]+.5, pos[1]+.5, pos[2]+0.1);
});
socket.on('grenade', (grenade) => {
  addGrenadeToArray(grenades, grenade);
});
socket.on('zombieswin', () => {
  playSound('humiliation', false, 2);
  finishScreenTimer = 5;
  finishHumansWon = false;
});
socket.on('motherzoms', (names) => {
  for (let name of names) {
    if (!name || !players[name]) continue;
    if (name == clientName) {
      respawnClient();
      motherZomTextTimer = 5;
    }
    setTimeout(() => players[name].zombie = true, 500);
  }
});
socket.on('checkpoint', (checkpoint, zspawnDelay) => {
  checkpointBounds = checkpoint;
  zomCheckpointScreenTimer = zspawnDelay;
});
socket.on('gnum', (gnum) => {
  spawnGrenades = gnum;
});

// connect to server
socket.emit('con', clientName);

// event listeners (input)
window.addEventListener('keydown', (event) => {
  if (isChatting) {
    if (event.key == "Enter") {
      socket.emit('chat', clientName, chatMsg);
      isChatting = false;
      chatCursor = 0;
      chatMsg = "";
      return;
    }
    if (event.key.length < 2) {
      chatMsg = chatMsg.substring(0, chatCursor) + event.key + chatMsg.substring(chatCursor, chatMsg.length);
      chatCursor++;
    }
    if (event.key == "Backspace" && chatCursor > 0) {
      chatMsg = chatMsg.substring(0, chatCursor-1) + chatMsg.substring(chatCursor, chatMsg.length);
      chatCursor--;
    }
    if (event.key == "ArrowLeft" && chatCursor > 0) chatCursor--;
    if (event.key == "ArrowRight" && chatCursor < chatMsg.length) chatCursor++;
    if (event.key == "Escape") {
      isChatting = false;
      chatCursor = 0;
      chatMsg = "";
    }
    return;
  }
  if (event.key.toLowerCase() == "t") {
    isChatting = true;
    keys.right = false;
    keys.left = false;
    keys.up = false;
    keys.down = false;
    keys.fire = false;
    return;
  }
  if (event.key == "ArrowRight" || event.key.toLowerCase() == "d") keys.right = true;
  if (event.key == "ArrowLeft" || event.key.toLowerCase() == "a") keys.left = true;
  if (event.key == "ArrowUp" || event.key.toLowerCase() == "w") keys.up = true;
  if (event.key == "ArrowDown" || event.key.toLowerCase() == "s") keys.down = true;
  if (event.key == " ") keys.space = true;
}, false);
window.addEventListener('keyup', (event) => {
  if (event.key == "ArrowRight" || event.key.toLowerCase() == "d") keys.right = false;
  if (event.key == "ArrowLeft" || event.key.toLowerCase() == "a") keys.left = false;
  if (event.key == "ArrowUp" || event.key.toLowerCase() == "w") keys.up = false;
  if (event.key == "ArrowDown" || event.key.toLowerCase() == "s") keys.down = false;
  if (event.key == " ") keys.space = false;
}, false);
window.addEventListener('mousedown', (event) => {
  if (!isChatting) {
    keys.fire = true;
  }
  else {
    if (!isMouseInsideChatBox()) {
      isChatting = false;
      chatMsg = "";
      chatCursor = 0;
    }
  }
}, false);
window.addEventListener('mouseup', (event) => {
  keys.fire = false;
}, false);
canvas.addEventListener('mousemove', (event) => {
  mousex = event.clientX / canvas.clientWidth * camw;
  mousey = event.clientY / canvas.clientHeight * camh;
}, false);

// update functions
var movePlayerBase = () => {
  let player = players[clientName];
  if (!player.zombie) {
    player.spd = SPEED;
    if (player.gun == 0 && player.ammo && keys.fire) player.spd = SPEED * (1/4);
  } else if (player.zombie && player.spd < ZOMSPEED) {
    player.spd += ZOMSPEED * deltaTime;
  }
  if (player.zombie && player.grenadeSlow > 0) player.spd = 0.25;
  let xvel = (keys.right - keys.left) * player.spd;
  let yvel = (keys.down - keys.up) * player.spd;
  if (player.boat >= 0) {
    xvel += boats[player.boat][4];
    yvel += boats[player.boat][5];
  }
  if (keys.right) player.dir = 1;
  if (keys.left) player.dir = -1;
  if (getTileProps(player.x + 0.5, player.y + 0.5).liquid && player.boat < 0) {
    xvel *= WATERMUL;
    yvel *= WATERMUL;
    if (player.zombie) player.spd = ZOMSPEED;
  }
  player.x += xvel * deltaTime;
  player.y += yvel * deltaTime;
  camx += (player.x - camw / 2 - camx) * deltaTime * 10;
  camy += (player.y - camh / 2 - camy) * deltaTime * 10;
  player.aim = Math.atan2((camy + mousey) - (player.y + 0.5), (camx + mousex) - (player.x + 0.5));
  let playerCoords = [player.x, player.y];
  for (const name in players) {
    if (name == clientName || !players[name].x || !players[name].y) continue;
    collisionResponseCircles(playerCoords, [players[name].x, players[name].y], ENTRAD_PHYS, ENTRAD_PHYS, true, 0.5);
  }
  if (player.zombie) {
    player.grenadeSlow -= deltaTime;
    grenades.forEach((g) => {
      if (!g[5] || g[4] < GRENADE_PRIME) return;
      if (player.x > g[0]-2 && player.x < g[0]+4 &&
          player.y > g[1]-2 && player.y < g[1]+4) {
        player.grenadeSlow = 2;
      }
    });
    zombies.forEach((zombie) => {
      collisionResponseCircles(playerCoords, zombie, ENTRAD_PHYS, ENTRAD_PHYS, false, 1.0);
    });
  } else {
    zombieLast.forEach((zombie) => {
      if (Math.sqrt(Math.pow(zombie[0]-playerCoords[0], 2) + Math.pow(zombie[1]-playerCoords[1], 2)) < 0.5+0.4) {
        if (!player.zombie) {
          socket.emit('playerzom', clientName);
          playSound('zombie');
          player.zombie = true;
        }
      }
    });
    for (const name in players) {
      if (name == clientName || !players[name].zombie) continue;
      if (Math.sqrt(Math.pow(players[name].x-player.x, 2) + Math.pow(players[name].y-player.y, 2)) < 0.5+0.5) {
        socket.emit('playerzom', clientName);
        player.zombie = true;
        playSound('zombie');
        break;
      }
    }
  }
  if (player.boat < 0) collisionResponseHalfBlock(playerCoords);
  player.x = playerCoords[0];
  player.y = playerCoords[1];
  if (gameTime - lastTick > PLAYERTICKMS) {
    lastTick = gameTime;
    socket.emit('pos', clientName, [player.x, player.y, player.dir, player.anim, player.aim]);
  }
};
var movePlayer = () => {
  let player = players[clientName];
  player.boat = -1;
  boats.forEach((boat, idx) => {
    if (player.x+.5 > boat[0] && player.x+.5 < boat[0] + boat[2] &&
        player.y+.5 > boat[1] && player.y+.5 < boat[1] + boat[3]) {
      player.boat = idx;
    }
  });
  movePlayerBase();
  let tileProps = getTileProps(player.x + 0.5, player.y + 0.5);
  let hitlaser = false;
  lasers.forEach((laser) => {
    if (player.x+.5 > laser[0] + 0.05 && player.x+.5 < laser[0] + 0.9 &&
        player.y+.5 > laser[1] + 0.05 && player.y+.5 < laser[1] + 0.9 && laser[5]) hitlaser = true;
  });
  if (((tileProps.void || tileProps.kills) && player.boat < 0) || hitlaser) {
    respawnClient();
    playSound('zombie_die');
  }
  player.anim = Number(keys.right || keys.left || keys.down || keys.up);
  player.reloadCooldown += deltaTime;
  if (!player.zombie) {
    if (keys.space && player.grenade > 0) {
      keys.space = false;
      socket.emit('grenade', clientName);
      player.grenade--;
    }
    if (player.ammo) {
      let shoot = keys.fire;
      if (player.gun == 2 && player.reloadCooldown < m3Reload) shoot = 0;
      player.anim += shoot * 2;
      if (shoot) player.reloadCooldown = 0;
      if (bulletCooldown <= 0 && player.ammo > 0 && shoot) {
        player.ammo--;
        if (player.gun == 0) playSound('m249');
        if (player.gun == 2) playSound('m3');
        if (player.gun == 1) playSound('ak47');
        if (player.gun == 2) {
          spawnBulletFx(player.x+.5, player.y+.5, player.aim);
          spawnBulletFx(player.x+.5, player.y+.5, player.aim-0.1);
          spawnBulletFx(player.x+.5, player.y+.5, player.aim+0.1);
          socket.emit('m3', clientName, M3PUNCH, [player.x, player.y, player.aim]);
        }
      }
    } else {
      if (player.reloadCooldown > gunReloads[player.gun]) {
        player.ammo = gunAmmo[player.gun];
      }
    }
    if (tileProps.liquid && player.boat < 0) {
      switch (player.anim) {
        case 2:
        case 3:
        case 5:
          player.anim = 5;
          break;
        default:
          player.anim = 4;
          break;
      }
    }
  } else {
    if (getTileProps(player.x + 0.5, player.y + 0.5).liquid && player.boat < 0) {
      player.anim = 2;
    }
  }
};
var updateFunc = (currTime) => {
  // basic things
  if (!connected || !isMapLoaded() || !images['tiles']) {
    window.requestAnimationFrame(updateFunc);
    return;
  }
  gameTime = currTime;
  deltaTime = (gameTime - lastUpdate) / 1000;

  // player movement
  movePlayer();
  updateBulletFx();
  updateGrenades(grenades, deltaTime);

  // lasers
  lasers.forEach((laser) => {
    if (!laser[5]) return;
    laser[0] += laser[2] * deltaTime;
    laser[1] += laser[3] * deltaTime;
    laser[4] -= deltaTime;
    if (laser[4] < 0) laser[5] = false;
  });

  // player and zombie interpolation
  for (const name in playerInterpNext) {
      if (name == clientName) continue;
      playerInterpTicks[name] += gameTime - lastUpdate;
      let tick = playerInterpTicks[name];
      let last = playerInterpLast[name];
      let next = playerInterpNext[name];
      players[name].x = last[0] + (next[0] - last[0]) * (tick / PLAYERTICKMS);
      players[name].y = last[1] + (next[1] - last[1]) * (tick / PLAYERTICKMS);
  }
  zombies.forEach((zombie, id) => {
    let tick = zombieInterpTick / TICKMS;
    let last = zombieLast[id];
    let next = zombieNext[id];
    zombie[0] = last[0] + (next[0] - last[0]) * tick;
    zombie[1] = last[1] + (next[1] - last[1]) * tick;
    zombie[2] = next[2];
    zombie[3] = next[3];
  });
  zombieInterpTick += gameTime - lastUpdate;
  boats.forEach((boat, id) => {
    let tick = boatInterpTick / TICKMS;
    let last = boatLast[id];
    let next = boatNext[id];
    boat[0] = last[0] + (next[0] - last[0]) * tick;
    boat[1] = last[1] + (next[1] - last[1]) * tick;
    boat[2] = next[2];
    boat[3] = next[3];
    boat[4] = next[4];
    boat[5] = next[5];
  });
  boatInterpTick += gameTime - lastUpdate;

  // rendering
  ctx.fillStyle = getMapBackgroundColor();
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawMap();
  boats.forEach(([x, y, w, h]) => {
    let [l, t] = transformPoint(x, y);
    let [r, b] = transformPoint(x + w, y + h);
    w = r-l, h = b-t;
    x = l, y = t;
    ctx.fillStyle = '#888';
    ctx.fillRect(x, y, w, h);
  });
  for (const name in players) {
    let player = players[name];
    if (name != clientName) player.reloadCooldown += deltaTime;
    drawPlayer(player);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    drawText(name, player.x + 0.5, player.y - 0.2);
  }
  zombies.forEach((zombie) => {
    let frame = Math.floor(gameTime / 150) % 2;
    if (getTileProps(zombie[0] + 0.5, zombie[1] + 0.5).liquid && zombie[2] < 0) frame = 2;
    let fire = 0;
    if (zombie[3]) fire = Math.floor(gameTime / 100) % 2 + 1;
    drawImage('zombie', zombie[0], zombie[1], 1, 1, frame, Number(zombie.dir == -1) + fire * 2);
  });
  drawBulletFx();
  lasers.forEach((laser) => {
    if (!laser[5]) return;
    let frame = Math.floor(gameTime / 50) % 2;
    drawImage('laser', laser[0], laser[1], 1, 1, frame, 0);
  });
  grenades.forEach((grenade) => {
    if (!grenade[5]) return;
    if (grenade[4] <= GRENADE_PRIME) {
      drawImage('grenade', grenade[0], grenade[1], 1, 1, 0, 0);
    } else {
      drawImage('explosion', grenade[0]-1, grenade[1]-1, 4, 4, Math.floor((grenade[4] - GRENADE_PRIME) * (6 / GRENADE_EXP)), 0);
    }
  });
  if (players[clientName].zombie) {
    drawImage('clip_zombie', camx + 1, camy + camh - 3.5, 4, 2, 0, 0);
  } else {
    let clipframe = Math.floor(12 - 12*(players[clientName].ammo / gunAmmo[players[clientName].gun]));
    drawImage('clip', camx + 1, camy + camh - 2.5, 4, 1, 0, clipframe);
  }
  if (doorTimer > 0) {
    doorTimer -= deltaTime;
    ctx.fillStyle = '#0f0';
    ctx.font = "15px Pixel";
    drawText("Door opening in " + Math.round(doorTimer) + " seconds!", camx + camw/2, camy + 0.5);
    ctx.font = "10px Pixel";
  }
  if (boatTimer > 0) {
    boatTimer -= deltaTime;
    ctx.fillStyle = '#ff0';
    ctx.font = "15px Pixel";
    drawText(boatTimerName + " leaving in " + Math.round(boatTimer) + " seconds!", camx + camw/2, camy + 1);
    ctx.font = "10px Pixel";
  }
  ctx.fillStyle = '#0f0';
  ctx.textAlign = 'left';
  drawText("playing on zeo_" + getMapName(), camx + 0.5, camy + camh - 0.5);
  let timeText = "time left " + Math.floor(mapTimeLeft / 60) + ":" + String(Math.floor(mapTimeLeft % 60)).padStart(2, '0');
  if (mapTimeLeft <= VOTETIME) timeText = Math.ceil(mapTimeLeft) + " seconds left for voting";
  if (mapTimeLeft > 0) drawText(timeText, camx + 0.5, camy + camh - 0.2);
  drawText(players[clientName].grenade ? "<" + players[clientName].grenade + " grenade left>" : "<no grenades>", camx + 0.5, camy + camh - 0.8);
  if (mapTimeLeft <= VOTETIME && nominatedMaps.length == 3) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f00';
    drawText("voting has begun! type a number in chat to vote for that map!", camx + camw/2, camy + camh - 0.6);
    ctx.textAlign = 'left';
  }
  if (safeTimer > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f00';
    drawText("safe time! " + Math.round(safeTimer) + " seconds to buy. (type !gun in chat)", camx + camw/2, camy + 0.3);
  }
  if (motherZomTextTimer > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0f';
    drawText("you are a mother zombie! infect other players!", camx + camw/2, camy + 5);
  }
  if (zomCheckpointScreenTimer > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0f';
    drawText("you triggered a zombie teleport! They will teleport in " + Math.ceil(zomCheckpointScreenTimer) + " seconds!", camx + camw/2, camy + 5);
  }
  motherZomTextTimer -= deltaTime;
  ctx.textAlign = 'left';
  drawChatBox();
  let oldSafeTimer = safeTimer;
  safeTimer -= deltaTime;
  if (Math.floor(safeTimer) != Math.floor(oldSafeTimer)) {
    playSound(String(Math.floor(safeTimer)+1));
    if (Math.floor(safeTimer) == -1) playSound('zombie');
  }
  finishScreenTimer -= deltaTime;
  zomCheckpointScreenTimer -= deltaTime;
  if (finishScreenTimer > 0) {
    drawImage(finishHumansWon ? 'win' : 'zombies_win', camx + camw / 2 - 4, camy + camh / 2 - 4, 8, 8, 0, 0);
  }

  // start next frame
  mapTimeLeft -= deltaTime;
  lastUpdate = gameTime;
  window.requestAnimationFrame(updateFunc);
};
window.requestAnimationFrame(updateFunc);
