/*eslint global-require:off*/
const glov_local_storage = require('./glov/local_storage.js');
glov_local_storage.storage_prefix = 'ld46'; // Before requiring anything else that might load from this

const assert = require('assert');
const camera2d = require('./glov/camera2d.js');
const engine = require('./glov/engine.js');
const input = require('./glov/input.js');
const { abs, atan2, floor, min, round, sqrt, PI } = Math;
const pico8 = require('./glov/pico8.js');
const { randCreate } = require('./glov/rand_alea.js');
const soundscape = require('./glov/soundscape.js');
const glov_sprites = require('./glov/sprites.js');
const sprite_animation = require('./glov/sprite_animation.js');
const ui = require('./glov/ui.js');
const { clamp, defaults, lineCircleIntersect, sign } = require('../common/util.js');
const { vec2, v2addScale, v2copy, v2floor, v2lengthSq, v2normalize, v2scale, v2same, v2set, v2sub, vec4, v4clone, v4copy } = require('./glov/vmath.js');

const { KEYS, PAD } = input;

const SPEEDSCALE = 3;

Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
export const game_width = 320;
export const game_height = 240;

let sprites = {};
let caves = {};
let anims = {};

let origin = vec2(0,0);

let state;

const PIXEL_STRICT = true;

let rand = randCreate(0);
let base_seed = 3;
const SEG_SIZE = 8;
const ID_FACTOR = 65536;
const MAX_RAND_CONNECTIONS = 3;


// Segment intersection
// http://local.wasp.uwa.edu.au/~pbourke/geometry/lineline2d/
function lineLineIntersect(out, p1, p2, p3, p4) {
  let denom = (p4[1] - p3[1])*(p2[0] - p1[0]) - (p4[0] - p3[0])*(p2[1] - p1[1]);
  if (denom === 0) {
    return false; // parallel
  }
  let ua = ((p4[0] - p3[0])*(p1[1] - p3[1]) - (p4[1] - p3[1])*(p1[0] - p3[0])) / denom;
  let ub = ((p2[0] - p1[0])*(p1[1] - p3[1]) - (p2[1] - p1[1])*(p1[0] - p3[0])) / denom;
  if (ua>=0 && ua<=1 && ub>=0 && ub<=1) {
    v2set(out, p1[0] + ua * (p2[0] - p1[0]), p1[1] + ua * (p2[1] - p1[1]));
    return true;
  }
  return false;
}

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
  this.collision = [];
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
const hex_dx = sqrt(1 - 0.5*0.5);
const draw_debug_scale = 10;
const skewy = 0.5;
Maze.prototype.drawDebugSub = function (sx, sy, x0, y0) {
  let seg = this.getSegment(sx,sy);
  let z = Z.BACKGROUND + 1;
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
Maze.prototype.connected = function (tx0, ty0, tx1, ty1) {
  if (tx0 > tx1) {
    let t = tx0;
    tx0 = tx1;
    tx1 = t;
  }
  if (ty0 > ty1) {
    let t = ty0;
    ty0 = ty1;
    ty1 = t;
  }
  let sx = floor(tx0 / SEG_SIZE);
  let rx0 = tx0 - sx * SEG_SIZE;
  let rx1 = tx1 - sx * SEG_SIZE;
  let sy = floor(ty0 / SEG_SIZE);
  let ry0 = ty0 - sy * SEG_SIZE;
  let ry1 = ty1 - sy * SEG_SIZE;
  return this.getSegment(sx, sy).connected(rx0, ry0, rx1, ry1);
};
Maze.prototype.completelyBlocked = function (tx, ty) {
  let sx = floor(tx / SEG_SIZE);
  let rx = tx - sx * SEG_SIZE;
  let sy = floor(ty / SEG_SIZE);
  let ry = ty - sy * SEG_SIZE;
  let seg_lr = this.getSegment(sx, sy);
  if (seg_lr.connected(rx, ry, rx + 1, ry) ||
    seg_lr.connected(rx, ry, rx, ry + 1) ||
    seg_lr.connected(rx, ry, rx + 1, ry + 1)
  ) {
    return false;
  }
  if (this.connected(tx - 1, ty - 1, tx, ty) ||
    this.connected(tx - 1, ty, tx, ty) ||
    this.connected(tx, ty - 1, tx, ty)
  ) {
    return false;
  }
  return true;
};
const CAVE_SCALE = 2;
const CAVE_W = 43 * CAVE_SCALE;
const CAVE_H = 49 * CAVE_SCALE;
const CAVE_SKEWY = floor(CAVE_H/2);
Maze.prototype.draw = function () {
  let collision = this.collision = [];
  let tx0 = floor((origin[0] - CAVE_W) / CAVE_W);
  let tx1 = floor((origin[0] + game_width + CAVE_W) / CAVE_W) + 1;
  let z = Z.BACKGROUND + 2;

  for (let tx = tx0; tx < tx1; ++tx) {
    let screen_x = tx * CAVE_W;
    let ty0 = floor((origin[1] + tx * CAVE_SKEWY) / CAVE_H);
    let ty1 = ty0 + floor(game_height / CAVE_H) + 3;
    for (let ty = ty0; ty < ty1; ++ty) {
      let screen_y = ty * CAVE_H - tx * CAVE_SKEWY;
      let bleft = 1 - this.connected(tx, ty, tx, ty+1);
      let bur = 1 - this.connected(tx, ty, tx+1, ty+1);
      let blr = 1 - this.connected(tx, ty+1, tx+1, ty+1);
      let btot = bleft + bur + blr;
      let w = 1;
      let h = 1;
      let s;
      if (bleft && blr) {
        collision.push([[tx, ty + 0.5], [tx + 0.5, ty + 1]]);
      }
      if (bur && blr) {
        collision.push([[tx + 0.5, ty + 0.5], [tx + 0.5, ty + 1]]);
      }
      if (bleft && bur) {
        collision.push([[tx, ty + 0.5], [tx + 0.5, ty + 0.5]]);
      }
      if (!btot) {
        s = caves.empty;
      } else if (btot === 1) {
        if (bleft) {
          s = caves.one_left;
        } else if (blr) {
          s = caves.one_lr;
        } else {
          s = caves.one_lr;
          h = -1;
        }
      } else if (btot === 2) {
        if (bleft && blr) {
          s = caves.two_leftlr;
        } else if (bur && blr) {
          s = caves.two_urlr;
        } else {
          s = caves.two_leftlr;
          h = -1;
        }
      } else if (btot === 3) {
        s = caves.full;
      } else {
        assert(false);
      }
      s.draw({
        x: screen_x + (w === -1 ? CAVE_W : 0),
        y: screen_y + (h === -1 ? CAVE_H : 0),
        z,
        w: CAVE_W * w,
        h: CAVE_H * h,
      });

      let bright = 1 - this.connected(tx+1, ty, tx+1, ty+1);
      let bul = 1 - this.connected(tx, ty, tx+1, ty);
      let bll = bur;
      btot = bright + bul + bll;
      w = -1;
      h = 1;
      if (bul && bll) {
        collision.push([[tx + 0.5, ty], [tx + 0.5, ty + 0.5]]);
      }
      if (bul && bright) {
        collision.push([[tx + 0.5, ty], [tx + 1, ty + 0.5]]);
      }
      if (bright && bll) {
        collision.push([[tx + 1, ty + 0.5], [tx + 0.5, ty + 0.5]]);
      }
      if (!btot) {
        s = caves.empty;
      } else if (btot === 1) {
        if (bright) {
          s = caves.one_left;
        } else if (bll) {
          s = caves.one_lr;
        } else {
          s = caves.one_lr;
          h = -1;
        }
      } else if (btot === 2) {
        if (bright && bll) {
          s = caves.two_leftlr;
        } else if (bul && bll) {
          s = caves.two_urlr;
        } else {
          s = caves.two_leftlr;
          h = -1;
        }
      } else if (btot === 3) {
        s = caves.full;
      } else {
        assert(false);
      }
      s.draw({
        x: screen_x + (w === -1 ? CAVE_W : 0),
        y: screen_y + (h === -1 ? CAVE_H : 0) - CAVE_SKEWY,
        z,
        w: CAVE_W * w,
        h: CAVE_H * h,
      });

      if (this.completelyBlocked(tx, ty)) {
        ui.drawCircle(screen_x, screen_y, z+1, 20 * CAVE_SCALE, 1, pico8.colors[11]);
      }
    }
  }

  // Convert to world space
  for (let ii = 0; ii < collision.length; ++ii) {
    let col = collision[ii];
    col[0][1] = col[0][1] * CAVE_H - col[0][0] * CAVE_SKEWY;
    col[0][0] *= CAVE_W;
    col[1][1] = col[1][1] * CAVE_H - col[1][0] * CAVE_SKEWY;
    col[1][0] *= CAVE_W;
    // ui.drawLine(col[0][0], col[0][1], col[1][0], col[1][1], Z.BACKGROUND + 3, 1.25, 1, vec4(0,0,0,0.25));
  }
};

function cavePosFromWorldPos(out, w) {
  let tx = round(w[0] / CAVE_W);
  let ty = round((w[1] + tx * CAVE_SKEWY) / CAVE_H);
  v2set(out, tx, ty);
  return out;
}

function Entity() {
  this.pos = vec2(290,140);
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
  let max_dist = 9;
  let norm_dist = 7;
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
  v2scale(this.impulse, this.impulse, SPEEDSCALE);
  if (engine.DEBUG && input.keyDown(KEYS.SHIFT)) {
    v2scale(this.impulse, this.impulse, 3);
  }
};
const ENTITY_RADIUS = 7;
const CAVE_RADIUS = 10;
const CAVE_RADIUS_CHECK = ENTITY_RADIUS + CAVE_RADIUS;
Entity.prototype.update = (function () {
  let last_pos = vec2();
  let norm_pos = vec2();
  let tr_delta = vec2();
  let start_pos = vec2();
  let start_cpos = vec2();
  let test = vec2();
  function colUnBlocked(dest) {
    if (v2same(start_pos, dest)) {
      return true;
    }
    let collision = state.maze.collision;
    for (let ii = 0; ii < collision.length; ++ii) {
      let col = collision[ii];
      if (lineLineIntersect(test, start_pos, dest, col[0], col[1])) {
        return false;
      }
      if (lineCircleIntersect(col[0], col[1], dest, CAVE_RADIUS_CHECK)) {
        return false;
      }
    }
    return true;
  }
  return function entityUpdate(dt) {
    cavePosFromWorldPos(start_cpos, this.pos);
    v2copy(start_pos, this.pos);
    for (let ii = 0; ii < 2; ++ii) {
      let max_dv = dt * this.accel[ii];
      let imp = this.impulse[ii];
      if (abs(imp) < 1) {
        imp = 0;
      }
      let desired = imp/dt * this.speed[ii];
      let delta = desired - this.vel[ii];
      let dv = clamp(delta, -max_dv, max_dv);
      this.vel[ii] += dv;
      this.pos[ii] += this.vel[ii] * dt;
    }

    if (!colUnBlocked(this.pos)) {
      let good = false;
      let xsave = this.pos[0];
      let ysave = this.pos[1];
      let dx = xsave - start_pos[0];
      let dy = ysave - start_pos[1];
      if (dy && dx) {
        this.pos[0] = start_pos[0];
        good = colUnBlocked(this.pos);
        if (!good) {
          this.pos[0] = xsave;
          this.pos[1] = start_pos[1];
          good = colUnBlocked(this.pos);
        }
      }
      if (!good && dy) {
        // going up/down, try up/down to the right and left
        this.pos[0] = start_pos[0] - dy * hex_dx;
        this.pos[1] = start_pos[1] + dy * 0.45;
        good = (!dx || sign(dx) === -sign(dy)) && colUnBlocked(this.pos);
        if (!good) {
          this.pos[0] = start_pos[0] + dy * hex_dx;
          good = (!dx || sign(dx) === sign(dy)) && colUnBlocked(this.pos);
        }
      }
      if (!good && dx) {
        // going left/right, try up and down to the left/right
        this.pos[0] = start_pos[0] + dx * hex_dx * 0.95;
        this.pos[1] = start_pos[1] + dx * 0.5;
        good = (!dy || sign(dx) === sign(dy)) && colUnBlocked(this.pos);
        if (!good) {
          this.pos[1] = start_pos[1] - dx * 0.5;
          good = (!dy || sign(dx) === -sign(dy)) && colUnBlocked(this.pos);
        }
      }
      if (!good) {
        v2copy(this.pos, start_pos);
        v2set(this.vel, 0, 0);
      }
    }

    if (this.pos[0] > start_pos[0]) {
      this.facing = 1;
    } else if (this.pos[0] < start_pos[0]) {
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
  origin[0] = this.player.pos[0] - game_width / 2;
  origin[1] = this.player.pos[1] - game_height / 2;
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
  let z = Z.SPRITES + 1;
  for (let ii = 0; ii < this.entities.length; ++ii) {
    let ent = this.entities[ii];
    ent.sprite.draw({
      x: floor(ent.pos[0]),
      y: floor(ent.pos[1]),
      w: ent.facing,
      z,
      frame: ent.head.getFrame(),
    });
    for (let jj = 0; jj < ent.trail.length; ++jj) {
      let tr = ent.trail[jj];
      ent.sprite.draw({
        x: floor(tr.pos[0]),
        y: floor(tr.pos[1]),
        w: tr.facing,
        z: z - (jj + 1)*0.1,
        frame: ent[tr.type].getFrame(),
        rot: tr.facing === 1 ? tr.rot : tr.rot + PI,
      });
    }
  }
  // this.maze.drawDebug();
  this.maze.draw();
};

export function main() {
  if (!engine.startup({
    game_width,
    game_height,
    pixely: PIXEL_STRICT ? 'strict' : 'on',
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
      origin: vec2(6/13, 6/13),
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
    });

    let caves_param = {
      ws: [43],
      hs: [49],
    };
    caves.empty = createSprite(defaults({ name: 'cave/0' }, caves_param));
    caves.one_left = createSprite(defaults({ name: 'cave/1-left' }, caves_param));
    caves.one_lr = createSprite(defaults({ name: 'cave/1-lr' }, caves_param));
    caves.two_leftlr = createSprite(defaults({ name: 'cave/2-leftlr' }, caves_param));
    caves.two_urlr = createSprite(defaults({ name: 'cave/2-urlr' }, caves_param));
    caves.full = createSprite(defaults({ name: 'cave/3' }, caves_param));

    state = new GameState();
  }

  let fpos = vec2();
  let origin_int = vec2(0,0);
  const ORIGIN_PAD = 50;
  const ORIGIN_SHIFT_SPEED = PIXEL_STRICT ? 0.02 : 0.01;
  function shiftView(dt) {
    let pos = state.player.pos;
    v2floor(fpos, pos);
    let max_shift = dt * ORIGIN_SHIFT_SPEED * (v2lengthSq(state.player.vel) < 0.00001 ? 2 : 1);
    for (let ii = 0; ii < 2; ++ii) {
      let dim = (ii === 0 ? game_width : game_height);
      // clamp
      if (fpos[ii] - ORIGIN_PAD < origin[ii]) {
        origin[ii] = fpos[ii] - ORIGIN_PAD;
      }
      if (fpos[ii] + ORIGIN_PAD > origin[ii] + dim) {
        origin[ii] = fpos[ii] + ORIGIN_PAD - dim;
      }
      // also slowly center
      let desired = fpos[ii] - dim / 2;
      let delta = clamp(desired - origin[ii], -max_shift, max_shift);
      origin[ii] += delta;
      if (PIXEL_STRICT) {
        origin_int[ii] = floor(origin[ii]);
      } else {
        origin_int[ii] = origin[ii]; // floor(origin[ii]);
      }
    }
    let ox = origin_int[0];
    let oy = origin_int[1];
    if (engine.render_width) {
      camera2d.set(ox, oy, ox + game_width, oy + game_height);
    } else {
      camera2d.setAspectFixed(game_width, game_height);
      camera2d.set(camera2d.x0() + ox, camera2d.y0() + oy, camera2d.x1() + ox, camera2d.y1() + oy);
    }
  }

  function test(dt) {
    state.update(dt);
    shiftView(dt);
    state.draw();

    camera2d.setAspectFixed(game_width, game_height);
    const bg_scale = 1/32;
    sprites.game_bg.draw({
      x: 0, y: 0, z: Z.BACKGROUND,
      w: game_width,
      h: game_height,
      uvs: vec4(origin_int[0]*bg_scale,origin_int[1]*bg_scale,
        (origin_int[0] + game_width)*bg_scale, (origin_int[1] + game_height)*bg_scale),
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
