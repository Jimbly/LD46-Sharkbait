const assert = require('assert');
const engine = require('./engine.js');
const { floor, min, random } = Math;
const { ridx } = require('../../common/util.js');

// TODO: (low-level) if change is set every frame, we leak sounds, they keep playing - playing() and stop() on
//   still-loading sounds or something going wrong?
// TODO: Allow specifying a layer to be silent for a certain percentage of time (or should intensity control that?)
// TODO: Maybe fade rel_intensity up from 0 if a layer was just enabled / tags changed?

const DEFAULT_PERIOD = 30000;
const DEFAULT_PERIOD_NOISE = 15000;
let inherit_props = ['min_intensity', 'max', 'period', 'period_noise'];
function SoundScape(params) {
  let { base_path, layers } = params;
  this.intensity = 0;
  this.tags = {};
  let sound_manager = engine.sound_manager;
  this.sound_manager = sound_manager;
  function preload(layer, parent) {
    let { files, tags } = layer;
    for (let ii = 0; ii < files.length; ++ii) {
      files[ii] = `${base_path}${files[ii]}`;
      sound_manager.loadSound(files[ii], { streaming: true });
    }
    if (parent) {
      for (let ii = 0; ii < inherit_props.length; ++ii) {
        let key = inherit_props[ii];
        if (layer[key] === undefined) {
          layer[key] = parent[key];
        }
      }
    }
    layer.period = layer.period || DEFAULT_PERIOD;
    layer.period_noise = layer.period_noise || DEFAULT_PERIOD_NOISE;
    for (let tag in tags) {
      preload(tags[tag], layer);
    }
  }
  this.layer_state = {};
  let now = engine.global_timer;
  for (let key in layers) {
    preload(layers[key]);
    this.layer_state[key] = {
      active: [],
      rel_intensity: random(),
      change: now + layers[key].period + random() * layers[key].period_noise,
    };
  }
  this.layer_data = layers;
}
SoundScape.prototype.getTag = function (tag) {
  return this.tags[tag];
};
SoundScape.prototype.setTag = function (tag, value) {
  this.tags[tag] = value;
};
SoundScape.prototype.setIntensity = function (value) {
  this.intensity = value;
};
SoundScape.prototype.getLayer = function (key) {
  let layer = this.layer_data[key];
  let ret = layer;
  let priority = 0;
  for (let tag in layer.tags) {
    if (!this.tags[tag]) {
      continue;
    }
    let taglayer = layer.tags[tag];
    if (taglayer.priority > priority) {
      ret = taglayer;
      priority = taglayer.priority;
    }
  }
  return ret;
};
function stop(active_list, idx) {
  let to_remove = active_list[idx];
  ridx(active_list, idx);
  to_remove.sound.fadeOut();
}
SoundScape.prototype.tick = function () {
  let now = engine.global_timer;
  let { intensity, layer_state, sound_manager } = this;
  for (let key in layer_state) {
    let data = this.getLayer(key);
    let { files } = data;
    let state = layer_state[key];
    if (now > state.change) {
      state.change = now + data.period + random() * data.period_noise;
      state.rel_intensity = random();
    }
    let wanted = 0;
    if (intensity > data.min_intensity && data.max) {
      wanted = 1 + floor(data.max * state.rel_intensity);
    }
    wanted = min(wanted, files.length);
    // Ensure active sounds are in the current file list
    let active_files = {};
    for (let ii = state.active.length - 1; ii >= 0; --ii) {
      let active_sound = state.active[ii];
      let { file, sound, start } = active_sound;
      if (files.indexOf(file) === -1 && sound.playing()) {
        stop(state.active, ii);
      } else if (!sound.playing() && now - start > 1000) {
        ridx(state.active, ii);
      } else {
        active_files[file] = true;
      }
    }
    // Stop any extras
    while (state.active.length > wanted) {
      let idx = floor(random() * state.active.length);
      stop(state.active, idx);
    }
    // Start new to match
    while (state.active.length < wanted) {
      let valid_files = files.filter((a) => !active_files[a]);
      assert(valid_files.length);
      let idx = floor(random() * valid_files.length);
      let file = valid_files[idx];
      let sound = sound_manager.play(file);
      if (!sound) {
        // still loading?
        --wanted;
        continue;
      }
      state.active.push({
        file,
        sound,
        start: now,
      });
    }
  }
};

SoundScape.prototype.debug = function () {
  let { layer_state } = this;
  let ret = [];
  for (let key in layer_state) {
    let state = layer_state[key];
    let { active, rel_intensity } = state;
    if (active.length) {
      ret.push(`Layer ${key} (${rel_intensity.toFixed(2)}):`);
    }
    for (let ii = 0; ii < active.length; ++ii) {
      let active_sound = active[ii];
      ret.push(`  ${active_sound.file}`);
    }
  }
  return ret;
};

export function create(params) {
  return new SoundScape(params);
}
