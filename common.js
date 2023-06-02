// player class
class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.dir = 1;
    this.anim = 0;
  }
}

if (typeof window === 'undefined') {
  module.exports = Player;
}
