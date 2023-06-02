// library/dom globals
var socket = io();
var canvas = document.getElementById('game-screen');
var ctx = canvas.getContext('2d');

// game globals
var clientName = window.location.pathname.split('/').pop();
var players = {};
var lastTick = performance.now();
var lastUpdate = performance.now();
var keys = { left: false, right: false, down: false, up: false };
var deltaTime = 0;
var connected = false;

// game constants
const tickms = 1000/8;

// canvas updates
var screenResize = (event) => {
  canvas.clientWidth = window.innerWidth;
  canvas.clientHeight = window.innerHeight;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};
window.addEventListener('resize', screenResize, false);
screenResize();

// loading assets
const pixelFont = new FontFace("Pixel", "url(/assets/pixel-font.ttf)");
document.fonts.add(pixelFont);
ctx.font = "10px \"Pixel\"";
var images = {};
async function loadImg(url) {
  let blob = await fetch(url).then(res => res.blob());
  let img = new Image();
  img.src = URL.createObjectURL(blob);
  return img;
}
(async function() {
  async function addImage(name, url, fw, fh) {
    images[name] = {};
    images[name].img = await loadImg(url);
    images[name].fw = fw;
    images[name].fh = fh;
  };
  addImage("player", "/assets/player.png", 16, 16);
  addImage("zombie", "/assets/zombie.png", 16, 16);
})();

// rendering
let drawImage = (img, x, y, dw, dh, fx, fy) => {
  if (!images[img]) return;
  ctx.drawImage(images[img].img, images[img].fw * fx, images[img].fh * fy, images[img].fw, images[img].fh, x, y, dw, dh);
};

// networking
var playerInterpNext = {};
var playerInterpLast = {};
var playerInterpTicks = {};
socket.on('coninfo', (coninfo) => {
  players = coninfo;
  connected = true;
  console.log("--coninfo--");
  console.log("client name:", clientName);
  console.log("player list:", players);
  for (const name in coninfo) {
    playerInterpTicks[name] = 0;
    playerInterpNext[name] = [0, 0];
    playerInterpLast[name] = [0, 0];
  }
});
socket.on('nametaken', () => {
  window.location.pathname = "/join";
});
socket.on('newcon', (name) => {
  if (players[name]) return;
  players[name] = new Player();
  playerInterpNext[name] = [0, 0];
  playerInterpLast[name] = [0, 0];
  console.log('a new player', name, 'connected!');
});
socket.on('delcon', (name) => {
  if (!players[name]) return;
  delete players[name];
  delete playerInterpNext[name];
  delete playerInterpLast[name];
  console.log('player', name, 'disconnected');
});
socket.on('pos', (name, pos) => {
  if (!players[name]) return;
  players[name].dir = pos[2];
  players[name].anim = pos[3];
  playerInterpLast[name][0] = playerInterpNext[name][0];
  playerInterpLast[name][1] = playerInterpNext[name][1];
  playerInterpNext[name] = pos;
  playerInterpTicks[name] = 0;
});

// connect to server
socket.emit('con', clientName);

// event listeners (keyboard)
window.addEventListener('keydown', (event) => {
  if (event.key == "ArrowRight") keys.right = true;
  if (event.key == "ArrowLeft") keys.left = true;
  if (event.key == "ArrowUp") keys.up = true;
  if (event.key == "ArrowDown") keys.down = true;
});
window.addEventListener('keyup', (event) => {
  if (event.key == "ArrowRight") keys.right = false;
  if (event.key == "ArrowLeft") keys.left = false;
  if (event.key == "ArrowUp") keys.up = false;
  if (event.key == "ArrowDown") keys.down = false;
});

// update function
var updateFunc = (time) => {
  // basic things
  if (!connected) {
    window.requestAnimationFrame(updateFunc);
    return;
  }
  deltaTime = (time - lastUpdate) / 1000;

  // player movement
  players[clientName].x += (keys.right - keys.left) * deltaTime * 64;
  players[clientName].y += (keys.down - keys.up) * deltaTime * 64;
  if (keys.right) players[clientName].dir = 1;
  if (keys.left) players[clientName].dir = -1;
  players[clientName].anim = keys.right || keys.left || keys.down || keys.up;
  if (time - lastTick > tickms) {
    lastTick = time;
    socket.emit('pos', clientName, [players[clientName].x, players[clientName].y, players[clientName].dir, players[clientName].anim]);
  }

  // player interpolation
  for (const name in playerInterpNext) {
      if (name == clientName) continue;
      playerInterpTicks[name] += time - lastUpdate;
      let tick = playerInterpTicks[name];
      let last = playerInterpLast[name];
      let next = playerInterpNext[name];
      players[name].x = last[0] + (next[0] - last[0]) * (tick / tickms);
      players[name].y = last[1] + (next[1] - last[1]) * (tick / tickms);
  }

  // rendering
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  for (const name in players) {
    let player = players[name];
    if (player.anim == 0) {
      drawImage("player", players[name].x, players[name].y, 32, 32, 0, players[name].dir == -1);
    } else {
      drawImage("player", players[name].x, players[name].y, 32, 32, Math.floor((time / 150) % 2), players[name].dir == -1);
    }
    ctx.fillStyle = '#000';
    ctx.fillText(name, player.x - 8, players.y - 10);
  }

  // start next frame
  lastUpdate = time;
  window.requestAnimationFrame(updateFunc);
};
window.requestAnimationFrame(updateFunc);
