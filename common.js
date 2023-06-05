// player class
class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.dir = 1;
    this.anim = 0;
    this.aim = 0;
    this.ammo = 12*2;
    this.reloadCooldown = 0;
    this.zombie = false;
    this.spd = 3;
    this.boat = -1;
    this.gun = 1;
    this.grenade = 2;
    this.grenadeSlow = 0;
  }
}
if (typeof window == 'undefined') module.exports.Player = Player;

const PLAYERTICKMS = 1000/8;
const TICKMS = 1000/5;
const VOTETIME = 20;
const TICKS_PER_SEC = (1000 / TICKMS);
const SECS_PER_TICK = (TICKMS / 1000);
const MAPTIME = (60 * 15);
const SAFETIME = 12;
const M3CUTOFF = 4;
const PUNCH = 0.15;
const WATERPUNCH = 0.08;
const SAFETIMEZOMBIE = -10;
const M3PUNCH = 1;
const ENTRAD_PHYS = 0.3;
const SPEED = 3.5;
const ZOMSPEED = 3.6;
const PUNCHSPEED = 0.3;
const WATERMUL = 0.35;
const CHECKPOINT_ZOM_TIMER = 5;
if (typeof window == 'undefined') module.exports.CHECKPOINT_ZOM_TIMER = CHECKPOINT_ZOM_TIMER;
if (typeof window == 'undefined') module.exports.ZOMSPEED = ZOMSPEED;
if (typeof window == 'undefined') module.exports.WATERMUL = WATERMUL;
if (typeof window == 'undefined') module.exports.PUNCHSPEED = PUNCHSPEED;
if (typeof window == 'undefined') module.exports.SPEED = SPEED;
if (typeof window == 'undefined') module.exports.ENTRAD_PHYS = ENTRAD_PHYS;
if (typeof window == 'undefined') module.exports.M3PUNCH = M3PUNCH;
if (typeof window == 'undefined') module.exports.SAFETIMEZOMBIE = SAFETIMEZOMBIE;
if (typeof window == 'undefined') module.exports.PUNCH = PUNCH;
if (typeof window == 'undefined') module.exports.WATERPUNCH = WATERPUNCH;
if (typeof window == 'undefined') module.exports.M3CUTOFF = M3CUTOFF;
if (typeof window == 'undefined') module.exports.PLAYERTICKMS = PLAYERTICKMS;
if (typeof window == 'undefined') module.exports.TICKMS = TICKMS;
if (typeof window == 'undefined') module.exports.VOTETIME = VOTETIME;
if (typeof window == 'undefined') module.exports.TICKS_PER_SEC = TICKS_PER_SEC;
if (typeof window == 'undefined') module.exports.SECS_PER_TICK = SECS_PER_TICK;
if (typeof window == 'undefined') module.exports.MAPTIME = MAPTIME;
if (typeof window == 'undefined') module.exports.SAFETIME = SAFETIME;

class TileProps {
  constructor(solid, kills, isvoid, liquid, barrier, barrierId) {
    this.solid = solid;
    this.kills = kills;
    this.void = isvoid;
    this.liquid = liquid;
    this.barrier = barrier;
    this.barrierId = barrierId;
  }
}
if (typeof window == 'undefined') module.exports.TileProps = TileProps;

const GRENADE_PRIME = 1;
const GRENADE_EXP = 0.6;
if (typeof window == 'undefined') module.exports.GRENADE_PRIME = GRENADE_PRIME;
if (typeof window == 'undefined') module.exports.GRENADE_EXP = GRENADE_EXP;
var createGrenade = (x, y, ang) => {
  return [x, y, Math.cos(ang) * 4.5, Math.sin(ang) * 4.5, 0, true];
};
if (typeof window == 'undefined') module.exports.createGrenade = createGrenade;
var updateGrenades = (grenades, dt) => {
  grenades.forEach((g) => {
    if (!g[5]) return;
    if (isTileSolid(g[0]+.5+g[2]*dt, g[1]+.5)) g[2] *= -1;
    if (isTileSolid(g[0]+.5, g[1]+g[3]*dt+.5)) g[3] *= -1;
    if (g[4] < GRENADE_PRIME) {
      g[0] += g[2] * dt;
      g[1] += g[3] * dt;
    }
    g[2] -= Math.sign(g[2]) * dt * 2;
    g[3] -= Math.sign(g[3]) * dt * 2;
    g[4] += dt;
    if (g[4] > GRENADE_PRIME + GRENADE_EXP) {
      g[5] = false;
    }
  });
};
if (typeof window == 'undefined') module.exports.updateGrenades = updateGrenades;
var addGrenadeToArray = (grenades, grenade) => {
  for (let i = 0; i < grenades.length; i++) {
    let g = grenades[i];
    if (!g[5]) {
      for (let j = 0; j < 6; j++) g[j] = grenade[j];
      return;
    }
  }
  grenades.push(grenade);
};
if (typeof window == 'undefined') module.exports.addGrenadeToArray = addGrenadeToArray;

// maps
var mapName;
var mapTileProps;
var mapTileset;
var mapData;
var mapTiles;
var mapObjs;
var mapAiTiles;
var getMapName = () => {
  return mapName;
};
if (typeof window == 'undefined') module.exports.getMapName = getMapName;
var setMapName = (name) => {
  mapName = name;
};
if (typeof window == 'undefined') module.exports.setMapName = setMapName;
var loadTilesetsFromJSON = (json) => {
  mapTileset = json;
  mapTileProps = [];
  for (const tile in mapTileset.tiles) {
    let tileProps = new TileProps(false, false, false, false, false, 0);
    for (const propId in mapTileset.tiles[tile].properties) {
      let prop = mapTileset.tiles[tile].properties[propId];
      if (prop.name == 'solid') tileProps.solid = prop.value;
      if (prop.name == 'kills') tileProps.kills = prop.value;
      if (prop.name == 'void') tileProps.void = prop.value;
      if (prop.name == 'liquid') tileProps.liquid = prop.value;
      if (prop.name == 'barrier') tileProps.barrier = prop.value;
      if (prop.name == 'barrier_fall_id') tileProps.barrierId = parseInt(prop.value, 10);
    }
    mapTileProps.push(tileProps);
  }
};
if (typeof window == 'undefined') module.exports.loadTilesetsFromJSON  = loadTilesetsFromJSON ;
var loadMapDataFromJSON = (json) => {
  mapData = json;
  for (const layer in mapData.layers) {
    if (mapData.layers[layer].name == 'tiles') mapTiles = mapData.layers[layer];
    if (mapData.layers[layer].name == 'objs') mapObjs = mapData.layers[layer];
    if (mapData.layers[layer].name == 'ai') mapAiTiles = mapData.layers[layer];
  }
};
if (typeof window == 'undefined') module.exports.loadMapDataFromJSON = loadMapDataFromJSON;

var getMapWidth = () => {
  return mapData.width;
};
if (typeof window == 'undefined') module.exports.getMapWidth = getMapWidth;
var getMapTileData = () => {
  return mapTiles.data;
};
if (typeof window == 'undefined') module.exports.getMapTileData = getMapTileData;
var setMapTileData = (tilesArray) => {
  mapTiles.data = tilesArray;
};
if (typeof window == 'undefined') module.exports.setMapTileData = setMapTileData;
var getMapHeight = () => {
  return mapData.height;
};
if (typeof window == 'undefined') module.exports.getMapHeight = getMapHeight;
var getMapObjects = () => {
  return mapObjs;
};
if (typeof window == 'undefined') module.exports.getMapObjects = getMapObjects;
var getMapAITiles = () => {
  return mapAiTiles;
};
if (typeof window == 'undefined') module.exports.getMapAITiles = getMapAITiles;
var isMapLoaded = () => {
  return !!mapData && !!mapObjs && !!mapTiles;
};
if (typeof window == 'undefined') module.exports.isMapLoaded = isMapLoaded;
var getMapBackgroundColor = () => {
  return mapData.backgroundcolor;
};
if (typeof window == 'undefined') module.exports.getMapBackgroundColor = getMapBackgroundColor;

// returns the tile property corresponding to the tile
var getTileGeneric = (array, x, y) => {
  if (x < 0 || x >= mapData.width || y < 0 || y >= mapData.height) return 0;
  let i = Math.floor(y) * mapTiles.width + Math.floor(x) % mapTiles.width;
  return array[i];
};
var getTile = (x, y) => {
  let id = getTileGeneric(mapTiles.data, x, y);
  return id ? id - 1 : 0;
};
if (typeof window == 'undefined') module.exports.getTile = getTile;
var getAIDir = (x, y) => {
  let id = getTileGeneric(mapAiTiles.data, x, y) - mapTileset.tilecount;
  if (id > 8) id -= 8;
  switch (id) {
    case 1: return [0, -1];
    case 2: return [1, 0];
    case 3: return [0, 1];
    case 4: return [-1, 0];
    case 5: return [1, -1];
    case 6: return [-1, -1];
    case 7: return [-1, 1];
    case 8: return [1, 1];
    default: return [0, 0];
  }
};
if (typeof window == 'undefined') module.exports.getAIDir = getAIDir;
var isAIDirForced = (x, y) => {
  let id = getTileGeneric(mapAiTiles.data, x, y) - mapTileset.tilecount;
  return id > 8;
};
if (typeof window == 'undefined') module.exports.isAIDirForced = isAIDirForced;
var setTile = (x, y, id) => {
  if (x < 0 || x >= mapData.width || y < 0 || y >= mapData.height) return;
  let i = Math.floor(y) * mapTiles.width + Math.floor(x) % mapTiles.width;
  mapTiles.data[i] = id + 1;
};
if (typeof window == 'undefined') module.exports.setTile = setTile;
var getTileProps = (x, y) => {
  return mapTileProps[getTile(x, y)];
};
if (typeof window == 'undefined') module.exports.getTileProps = getTileProps;
var isTileSolid = (x, y) => getTileProps(x, y).solid;
if (typeof window == 'undefined') module.exports.isTileSolid = isTileSolid;
var tileLineCollision = (x, y, vertical, len) => {
  if (vertical) {
    return isTileSolid(x, y) + isTileSolid(x, y + len);
  } else {
    return isTileSolid(x, y) + isTileSolid(x + len, y);
  }
};
if (typeof window == 'undefined') module.exports.tileLineCollision = tileLineCollision;
// P is an array of [x, y]
var collisionResponseHalfBlock = (p) => {
  if (tileLineCollision(p[0] + 0.1 + 0.3, p[1] + 0.1, false, 0.2)) { // top
    p[1] = Math.ceil(p[1]) - 0.1;
  }
  if (tileLineCollision(p[0] + 0.1 + 0.3, p[1] + 0.9, false, 0.2)) { // bottom
    p[1] = Math.ceil(p[1]) - 0.9;
  }
  if (tileLineCollision(p[0] + 0.1, p[1] + 0.1 + 0.3, true, 0.2)) { // left
    p[0] = Math.ceil(p[0]) - 0.1;
  }
  if (tileLineCollision(p[0] + 0.9, p[1] + 0.1 + 0.3, true, 0.2)) { // left
    p[0] = Math.ceil(p[0]) - 0.9;
  }
};
if (typeof window == 'undefined') module.exports.collisionResponseHalfBlock = collisionResponseHalfBlock;
var collisionResponseCircles = (p1, p2, r1, r2, moveother, inset) => {
  let dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  let d = Math.sqrt(dx*dx + dy*dy);
  if (d >= r1 + r2) return;
  d += 0.01;
  let overlap = (r1 + r2) - d + 0.01;
  dx /= d; dy /= d;
  if (moveother) {
    p1[0] -= dx * overlap / 2 * inset;
    p1[1] -= dy * overlap / 2 * inset;
    p2[0] += dx * overlap / 2;
    p2[1] += dy * overlap / 2;
  } else {
    p1[0] -= dx * overlap * inset;
    p1[1] -= dy * overlap * inset;
  }
};
if (typeof window == 'undefined') module.exports.collisionResponseCircles = collisionResponseCircles;
var doesLineHitCircle = (x0, y0, x1, y1, cx, cy, r) => {
  let d = [x1 - x0, y1 - y0];
  let a = d[0]*d[0] + d[1]*d[1];
  let f = [x0-cx, y0-cy];
  let b = 2 * (f[0] * d[0] + f[1] * d[1]);
  let c = (f[0]*f[0] + f[1]*f[1]) - r*r;
  let discriminant = b*b-4*a*c;
  if (discriminant < 0) {
    return false;
  } else {
    let t1 = (-b - discriminant)/(2*a);
    let t2 = (-b + discriminant)/(2*a);
    return !(t1 < 0 && t2 < 0);
  }
};
if (typeof window == 'undefined') module.exports.doesLineHitCircle = doesLineHitCircle;
var lineTileCollision = (x0, y0, x1, y1) => {
  let xstep = 0, ystep = 0, numsteps = 0;
  if (Math.abs(x1-x0) >= Math.abs(y1-y0)) {
    xstep = Math.sign(x1-x0)*0.2;
    ystep = (y1-y0)/(x1-x0)*xstep;
    numsteps = Math.abs((x1 - x0) / 0.2);
  } else {
    ystep = Math.sign(y1-y0)*0.2;
    xstep = (x1-x0)/(y1-y0)*ystep;
    numsteps = Math.abs((y1 - y0) / 0.2);
  }
  let x = x0, y = y0;
  for (let i = 0; i < numsteps; i++) {
    if (isTileSolid(x, y)) return true;
    x += xstep;
    y += ystep;
  }
  return false;
};
if (typeof window == 'undefined') module.exports.lineTileCollision = lineTileCollision;
