/*eslint global-require:off*/
const glov_local_storage = require('./glov/local_storage.js');
glov_local_storage.storage_prefix = 'ld46'; // Before requiring anything else that might load from this

const assert = require('assert');
const engine = require('./glov/engine.js');
const input = require('./glov/input.js');
const { atan2, min, sqrt, PI } = Math;
const pico8 = require('./glov/pico8.js');
const { randCreate } = require('./glov/rand_alea.js');
const soundscape = require('./glov/soundscape.js');
const glov_sprites = require('./glov/sprites.js');
const sprite_animation = require('./glov/sprite_animation.js');
const ui = require('./glov/ui.js');
const { clamp } = require('../common/util.js');
const { vec2, v2addScale, v2copy, v2lengthSq, v2normalize, v2sub, vec4, v4clone, v4copy } = require('./glov/vmath.js');

const { KEYS, PAD } = input;

Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
export const game_width = 320;
export const game_height = 240;

let sprites = {};
let anims = {};

let state;

let rand = randCreate(0);
let base_seed = 3;
const SEG_SIZE = 8;
const ID_FACTOR = 65536;
const MAX_RAND_CONNECTIONS = 3;
function MazeSegment(sx, sy, sid) {
  rand.reseed(base_seed + sid);
  let connect_left = rand.range(SEG_SIZE - 2) + 1;
  let connect_top = rand.range(SEG_SIZE - 2) + 1;
  rand.reseed(base_seed + sid + 1);
  let connect_right = rand.range(SEG_SIZE - 2) + 1;
  rand.reseed(base_seed + sid + ID_FACTOR);
  rand.range(1);
  let connect_bottom = rand.range(SEG_SIZE - 2) + 1;
  this.connectivity = new Uint8Array(SEG_SIZE*SEG_SIZE*3);
  rand.reseed(base_seed + sid);
  // console.log('****');
  this.trace(connect_top, 0, connect_bottom, SEG_SIZE);
  // console.log('****');
  this.trace(0, connect_left, SEG_SIZE, connect_right);
  let num_rand = rand.range(MAX_RAND_CONNECTIONS+1);
  for (let ii = 0; ii < num_rand; ++ii) {
    this.trace(rand.range(SEG_SIZE), rand.range(SEG_SIZE), rand.range(SEG_SIZE), rand.range(SEG_SIZE));
  }
}
MazeSegment.prototype.connect = function (x0, y0, x1, y1) {
  if (x0 > x1) {
    let t = x0;
    x0 = x1;
    x1 = t;
  }
  if (y0 > y1) {
    let t = y0;
    y0 = y1;
    y1 = t;
  }
  let offs;
  let dx = x1 - x0;
  let dy = y1 - y0;
  if (dx === 1 && dy === 0) {
    offs = 0;
  } else if (dx === 0 && dy === 1) {
    offs = 1;
  } else if (dx === 1 && dy === 1) {
    offs = 2;
  } else {
    assert(false);
  }
  this.connectivity[(x0 + y0 * SEG_SIZE)*3 + offs] = 1;
};
MazeSegment.prototype.connected = function (x0, y0, x1, y1) {
  if (x0 > x1) {
    let t = x0;
    x0 = x1;
    x1 = t;
  }
  if (y0 > y1) {
    let t = y0;
    y0 = y1;
    y1 = t;
  }
  let offs;
  let dx = x1 - x0;
  let dy = y1 - y0;
  if (dx === 1 && dy === 0) {
    offs = 0;
  } else if (dx === 0 && dy === 1) {
    offs = 1;
  } else if (dx === 1 && dy === 1) {
    offs = 2;
  } else {
    assert(false);
  }
  return this.connectivity[(x0 + y0 * SEG_SIZE)*3 + offs];
};
MazeSegment.prototype.trace = function (x0, y0, x1, y1) {
  if (x0 === x1 && y0 === y1) {
    return;
  }
  let destx = x0;
  let desty = y0;
  if (x1 === x0 + 1 && y1 === y0 ||
    x1 === x0 + 1 && y1 === y0 + 1 ||
    x1 === x0 && y1 === y0 + 1
  ) {
    // direct connect possible
    destx = x1;
    desty = y1;
  } else {
    let horiz = (x0 !== x1);
    if (horiz && x0 < x1 && x0 === SEG_SIZE - 1) {
      horiz = false;
    }
    let vert = (y0 !== y1);
    if (vert && y0 < y1 && y0 === SEG_SIZE - 1) {
      vert = false;
    }
    assert(horiz || vert);
    if (horiz && vert) {
      if (rand.range(2)) {
        horiz = false;
      } else {
        vert = false;
      }
    }
    if (horiz) {
      if (x0 < x1) {
        destx++;
        if (rand.range(2) && desty !== SEG_SIZE - 1) {
          desty++;
        }
      } else {
        destx--;
        if (rand.range(2) && desty) {
          desty--;
        }
      }
    } else {
      if (y0 < y1) {
        desty++;
        if (rand.range(2) && destx !== SEG_SIZE - 1) {
          destx++;
        }
      } else {
        desty--;
        if (rand.range(2) && destx) {
          destx--;
        }
      }
    }
  }
  // console.log(`trace(${x0},${y0}, ${x1},${y1}): connect(${destx},${desty})`);
  this.connect(x0, y0, destx, desty);
  this.trace(destx, desty, x1, y1);
};
function Maze() {
  this.segments = [];
}
Maze.prototype.getSegment = function (sx, sy) {
  let key = sx + sy * ID_FACTOR;
  let seg = this.segments[key];
  if (!seg) {
    seg = this.segments[key] = new MazeSegment(sx, sy, key);
  }
  return seg;
};
const color_connected = vec4(1,1,0.5,1);
const color_disconnected = vec4(0.3, 0.3, 0.3, 1);
const hex_dx = sqrt(1 + 0.5*0.5);
const draw_debug_scale = 10;
const skewy = 0.5;
Maze.prototype.drawDebugSub = function (sx, sy, x0, y0) {
  let seg = this.getSegment(sx,sy);
  let z = Z.SPRITES + 1;
  function screenX(xx,yy) {
    return 0.5 + x0 + xx*hex_dx*draw_debug_scale;
  }
  function screenY(xx,yy) {
    return 0.5 + y0 + yy*draw_debug_scale - skewy * xx * draw_debug_scale;
  }
  for (let xx = 0; xx < SEG_SIZE; ++xx) {
    for (let yy = 0; yy < SEG_SIZE; ++yy) {
      ui.drawLine(screenX(xx,yy), screenY(xx,yy), screenX(xx+1,yy), screenY(xx+1,yy), z, 1, 1,
        seg.connected(xx, yy, xx+1, yy) ? color_connected : color_disconnected);
      ui.drawLine(screenX(xx,yy), screenY(xx,yy), screenX(xx+1,yy+1), screenY(xx+1,yy+1), z, 1, 1,
        seg.connected(xx, yy, xx+1, yy+1) ? color_connected : color_disconnected);
      ui.drawLine(screenX(xx,yy), screenY(xx,yy), screenX(xx,yy+1), screenY(xx,yy+1), z, 1, 1,
        seg.connected(xx, yy, xx, yy+1) ? color_connected : color_disconnected);
    }

  }
};
Maze.prototype.drawDebug = function () {
  let x0 = 0;
  let y0 = 0;
  for (let sx = 0; sx < 5; ++sx) {
    for (let sy = 0; sy < 5; ++sy) {
      this.drawDebugSub(sx,sy,
        x0 + sx*hex_dx*SEG_SIZE*draw_debug_scale,
        y0 + (sy - skewy * sx)*SEG_SIZE*draw_debug_scale);
    }
  }
};

function Entity() {
  this.pos = vec2(100.5,100.5);
  this.vel = vec2(0,0);
  this.speed = vec2(0.032, 0.032);
  this.accel = vec2(0.001, 0.001);
  this.impulse = vec2(0,0);
  this.facing = 1;
  this.sprite = sprites.fishball;
  this.head = anims.fishball.clone().setState('head');
  this.body = anims.fishball.clone().setState('body');
  this.tail = anims.fishball.clone().setState('tail');
  this.trail = [];
  let max_dist = 17/2;
  let norm_dist = 13/2;
  let norm = 0.005;
  for (let ii = 0; ii < 1; ++ii) {
    this.trail.push({
      pos: this.pos.slice(0),
      type: 'body',
      facing: 1,
      max_dist,
      norm_dist,
      norm,
      rot: 0,
    });
  }
  this.trail.push({
    pos: this.pos.slice(0),
    type: 'tail',
    facing: 1,
    max_dist: norm_dist * 1.1,
    norm_dist,
    norm: norm * 2,
    rot: 0,
  });
}
Entity.prototype.busy = function () {
  if (this.head.state !== 'head') {
    if (this.head.progress() === 1) {
      this.head.setState('head');
    } else {
      return true;
    }
  }
  return false;
};
Entity.prototype.impulseFromInput = function (dt) {
  this.impulse[0] = 0;
  this.impulse[1] = 0;
  if (this.busy()) {
    this.impulse[0] = (1 - this.head.progress()) * this.facing * dt;
  } else {
    this.impulse[0] -= input.keyDown(KEYS.LEFT) + input.keyDown(KEYS.A) + input.padButtonDown(PAD.LEFT);
    this.impulse[0] += input.keyDown(KEYS.RIGHT) + input.keyDown(KEYS.D) + input.padButtonDown(PAD.RIGHT);
    this.impulse[1] -= input.keyDown(KEYS.UP) + input.keyDown(KEYS.W) + input.padButtonDown(PAD.UP);
    this.impulse[1] += input.keyDown(KEYS.DOWN) + input.keyDown(KEYS.S) + input.padButtonDown(PAD.DOWN);
  }
};
Entity.prototype.update = (function () {
  let last_pos = vec2();
  let norm_pos = vec2();
  let tr_delta = vec2();
  return function entityUpdate(dt) {
    for (let ii = 0; ii < 2; ++ii) {
      let max_dv = dt * this.accel[ii];
      let desired = this.impulse[ii]/dt * this.speed[ii];
      let delta = desired - this.vel[ii];
      let dv = clamp(delta, -max_dv, max_dv);
      this.vel[ii] += dv;
      this.pos[ii] += this.vel[ii] * dt;
    }
    if (this.vel[0] > 0) {
      this.facing = 1;
    } else if (this.vel[0] < 0) {
      this.facing = -1;
    }
    v2copy(last_pos, this.pos);
    let { trail } = this;
    for (let ii = 0; ii < trail.length; ++ii) {
      let tr = trail[ii];
      v2sub(tr_delta, tr.pos, last_pos);
      let len = sqrt(v2lengthSq(tr_delta));
      if (len > 0.01) {
        tr.rot = atan2(tr_delta[0], -tr_delta[1]) + PI/2;
      }
      if (len > tr.max_dist + 0.01) {
        v2addScale(tr.pos, last_pos, tr_delta, tr.max_dist / len);
      } else {
        v2copy(norm_pos, last_pos);
        norm_pos[0] -= this.facing * tr.norm_dist;
        v2sub(tr_delta, norm_pos, tr.pos);
        let lensq = v2lengthSq(tr_delta);
        if (lensq > 0.01 * 0.01) {
          v2normalize(tr_delta, tr_delta);
          v2addScale(tr.pos, tr.pos, tr_delta, min(lensq, tr.norm * dt));
        }
      }
      if (tr.pos[0] > last_pos[0] + 0.01) {
        tr.facing = -1;
      } else if (tr.pos[0] < last_pos[0] - 0.01) {
        tr.facing = 1;
      }
      v2copy(last_pos, tr.pos);
    }

    this.head.update(dt);
    this.body.update(dt);
    this.tail.update(dt);
  };
}());
function GameState() {
  this.entities = [];
  this.player = new Entity();
  this.entities.push(this.player);
  this.maze = new Maze();
}
function actionDown() {
  return input.keyDown(KEYS.SPACE) || input.keyDown(KEYS.E) || input.keyDown(KEYS.ENTER) || input.padButtonDown(PAD.A);
}
GameState.prototype.update = function (dt) {
  if (!this.player.busy() && actionDown()) {
    this.player.head.setState('chomp');
  }
  this.player.impulseFromInput(dt);
  for (let ii = 0; ii < this.entities.length; ++ii) {
    this.entities[ii].update(dt);
  }
};
GameState.prototype.draw = function () {
  let z = Z.SPRITES;
  for (let ii = 0; ii < this.entities.length; ++ii) {
    let ent = this.entities[ii];
    ent.sprite.draw({
      x: ent.pos[0],
      y: ent.pos[1],
      w: ent.facing,
      z,
      frame: ent.head.getFrame(),
    });
    for (let jj = 0; jj < ent.trail.length; ++jj) {
      let tr = ent.trail[jj];
      ent.sprite.draw({
        x: tr.pos[0],
        y: tr.pos[1],
        w: tr.facing,
        z: z - (jj + 1)*0.1,
        frame: ent[tr.type].getFrame(),
        rot: tr.facing === 1 ? tr.rot : tr.rot + PI,
      });
    }
  }
  this.maze.drawDebug();
};

export function main() {
  if (!engine.startup({
    game_width,
    game_height,
    pixely: 'strict',
    viewport_postprocess: false,
    sound_manager: require('./glov/sound_manager.js').create(),
  })) {
    return;
  }

  // const font = engine.font;

  // Perfect sizes for pixely modes
  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);

  function initGraphics() {
    const sprite_size = 13;
    const createSprite = glov_sprites.create;
    const createAnimation = sprite_animation.create;

    sprites.fishball = createSprite({
      name: 'fishball',
      ws: [13, 13, 13],
      hs: [13, 13, 13],
      size: vec2(sprite_size, sprite_size),
      origin: vec2(0.5, 0.5),
    });
    anims.fishball = createAnimation({
      head: {
        frames: [0,1],
        times: [200, 200],
      },
      body: {
        frames: [2,3],
        times: [200, 200],
      },
      tail: {
        frames: [4,5],
        times: [200, 200],
      },
      chomp: {
        frames: [6,7,8,0],
        times: [80,130,400,0],
        loop: false,
      },
    });

    sprites.game_bg = createSprite({
      name: 'bg',
      uvs: vec4(0,0,game_width/32, game_height/32),
    });

    state = new GameState();
  }

  function test(dt) {
    state.update(dt);
    state.draw();

    sprites.game_bg.draw({
      x: 0, y: 0, z: Z.BACKGROUND,
      w: game_width,
      h: game_height,
      //color: pico8.colors[1],
    });
  }

  function testInit(dt) {
    engine.setState(test);
    test(dt);
  }

  initGraphics();
  engine.setState(testInit);
}
