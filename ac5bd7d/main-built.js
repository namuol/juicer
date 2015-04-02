(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],2:[function(require,module,exports){
/*!
 *  howler.js v1.1.24
 *  howlerjs.com
 *
 *  (c) 2013-2014, James Simpson of GoldFire Studios
 *  goldfirestudios.com
 *
 *  MIT License
 */

(function() {
  // setup
  var cache = {};

  // setup the audio context
  var ctx = null,
    usingWebAudio = true,
    noAudio = false;
  try {
    if (typeof AudioContext !== 'undefined') {
      ctx = new AudioContext();
    } else if (typeof webkitAudioContext !== 'undefined') {
      ctx = new webkitAudioContext();
    } else {
      usingWebAudio = false;
    }
  } catch(e) {
    usingWebAudio = false;
  }

  if (!usingWebAudio) {
    if (typeof Audio !== 'undefined') {
      try {
        new Audio();
      } catch(e) {
        noAudio = true;
      }
    } else {
      noAudio = true;
    }
  }

  // create a master gain node
  if (usingWebAudio) {
    var masterGain = (typeof ctx.createGain === 'undefined') ? ctx.createGainNode() : ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  }

  // create global controller
  var HowlerGlobal = function(codecs) {
    this._volume = 1;
    this._muted = false;
    this.usingWebAudio = usingWebAudio;
    this.noAudio = noAudio;
    this._howls = [];
    this._codecs = codecs;
    this.iOSAutoEnable = true;
  };
  HowlerGlobal.prototype = {
    /**
     * Get/set the global volume for all sounds.
     * @param  {Float} vol Volume from 0.0 to 1.0.
     * @return {Howler/Float}     Returns self or current volume.
     */
    volume: function(vol) {
      var self = this;

      // make sure volume is a number
      vol = parseFloat(vol);

      if (vol >= 0 && vol <= 1) {
        self._volume = vol;

        if (usingWebAudio) {
          masterGain.gain.value = vol;
        }

        // loop through cache and change volume of all nodes that are using HTML5 Audio
        for (var key in self._howls) {
          if (self._howls.hasOwnProperty(key) && self._howls[key]._webAudio === false) {
            // loop through the audio nodes
            for (var i=0; i<self._howls[key]._audioNode.length; i++) {
              self._howls[key]._audioNode[i].volume = self._howls[key]._volume * self._volume;
            }
          }
        }

        return self;
      }

      // return the current global volume
      return (usingWebAudio) ? masterGain.gain.value : self._volume;
    },

    /**
     * Mute all sounds.
     * @return {Howler}
     */
    mute: function() {
      this._setMuted(true);

      return this;
    },

    /**
     * Unmute all sounds.
     * @return {Howler}
     */
    unmute: function() {
      this._setMuted(false);

      return this;
    },

    /**
     * Handle muting and unmuting globally.
     * @param  {Boolean} muted Is muted or not.
     */
    _setMuted: function(muted) {
      var self = this;

      self._muted = muted;

      if (usingWebAudio) {
        masterGain.gain.value = muted ? 0 : self._volume;
      }

      for (var key in self._howls) {
        if (self._howls.hasOwnProperty(key) && self._howls[key]._webAudio === false) {
          // loop through the audio nodes
          for (var i=0; i<self._howls[key]._audioNode.length; i++) {
            self._howls[key]._audioNode[i].muted = muted;
          }
        }
      }
    },

    /**
     * Check for codec support.
     * @param  {String} ext Audio file extention.
     * @return {Boolean}
     */
    codecs: function(ext) {
      return this._codecs[ext];
    },

    /**
     * iOS will only allow audio to be played after a user interaction.
     * Attempt to automatically unlock audio on the first user interaction.
     * Concept from: http://paulbakaus.com/tutorials/html5/web-audio-on-ios/
     * @return {Howler}
     */
    _enableiOSAudio: function() {
      var self = this;

      // only run this on iOS if audio isn't already eanbled
      if (ctx && (self._iOSEnabled || !/iPhone|iPad|iPod/i.test(navigator.userAgent))) {
        return;
      }

      self._iOSEnabled = false;

      // call this method on touch start to create and play a buffer,
      // then check if the audio actually played to determine if
      // audio has now been unlocked on iOS
      var unlock = function() {
        // create an empty buffer
        var buffer = ctx.createBuffer(1, 1, 22050);
        var source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        // play the empty buffer
        if (typeof source.start === 'undefined') {
          source.noteOn(0);
        } else {
          source.start(0);
        }

        // setup a timeout to check that we are unlocked on the next event loop
        setTimeout(function() {
          if ((source.playbackState === source.PLAYING_STATE || source.playbackState === source.FINISHED_STATE)) {
            // update the unlocked state and prevent this check from happening again
            self._iOSEnabled = true;
            self.iOSAutoEnable = false;

            // remove the touch start listener
            window.removeEventListener('touchstart', unlock, false);
          }
        }, 0);
      };

      // setup a touch start listener to attempt an unlock in
      window.addEventListener('touchstart', unlock, false);

      return self;
    }
  };

  // check for browser codec support
  var audioTest = null;
  var codecs = {};
  if (!noAudio) {
    audioTest = new Audio();
    codecs = {
      mp3: !!audioTest.canPlayType('audio/mpeg;').replace(/^no$/, ''),
      opus: !!audioTest.canPlayType('audio/ogg; codecs="opus"').replace(/^no$/, ''),
      ogg: !!audioTest.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/, ''),
      wav: !!audioTest.canPlayType('audio/wav; codecs="1"').replace(/^no$/, ''),
      aac: !!audioTest.canPlayType('audio/aac;').replace(/^no$/, ''),
      m4a: !!(audioTest.canPlayType('audio/x-m4a;') || audioTest.canPlayType('audio/m4a;') || audioTest.canPlayType('audio/aac;')).replace(/^no$/, ''),
      mp4: !!(audioTest.canPlayType('audio/x-mp4;') || audioTest.canPlayType('audio/mp4;') || audioTest.canPlayType('audio/aac;')).replace(/^no$/, ''),
      weba: !!audioTest.canPlayType('audio/webm; codecs="vorbis"').replace(/^no$/, '')
    };
  }

  // allow access to the global audio controls
  var Howler = new HowlerGlobal(codecs);

  // setup the audio object
  var Howl = function(o) {
    var self = this;

    // setup the defaults
    self._autoplay = o.autoplay || false;
    self._buffer = o.buffer || false;
    self._duration = o.duration || 0;
    self._format = o.format || null;
    self._loop = o.loop || false;
    self._loaded = false;
    self._sprite = o.sprite || {};
    self._src = o.src || '';
    self._pos3d = o.pos3d || [0, 0, -0.5];
    self._volume = o.volume !== undefined ? o.volume : 1;
    self._urls = o.urls || [];
    self._rate = o.rate || 1;

    // allow forcing of a specific panningModel ('equalpower' or 'HRTF'),
    // if none is specified, defaults to 'equalpower' and switches to 'HRTF'
    // if 3d sound is used
    self._model = o.model || null;

    // setup event functions
    self._onload = [o.onload || function() {}];
    self._onloaderror = [o.onloaderror || function() {}];
    self._onend = [o.onend || function() {}];
    self._onpause = [o.onpause || function() {}];
    self._onplay = [o.onplay || function() {}];

    self._onendTimer = [];

    // Web Audio or HTML5 Audio?
    self._webAudio = usingWebAudio && !self._buffer;

    // check if we need to fall back to HTML5 Audio
    self._audioNode = [];
    if (self._webAudio) {
      self._setupAudioNode();
    }

    // automatically try to enable audio on iOS
    if (typeof ctx !== 'undefined' && ctx && Howler.iOSAutoEnable) {
      Howler._enableiOSAudio();
    }

    // add this to an array of Howl's to allow global control
    Howler._howls.push(self);

    // load the track
    self.load();
  };

  // setup all of the methods
  Howl.prototype = {
    /**
     * Load an audio file.
     * @return {Howl}
     */
    load: function() {
      var self = this,
        url = null;

      // if no audio is available, quit immediately
      if (noAudio) {
        self.on('loaderror');
        return;
      }

      // loop through source URLs and pick the first one that is compatible
      for (var i=0; i<self._urls.length; i++) {
        var ext, urlItem;

        if (self._format) {
          // use specified audio format if available
          ext = self._format;
        } else {
          // figure out the filetype (whether an extension or base64 data)
          urlItem = self._urls[i];
          ext = /^data:audio\/([^;,]+);/i.exec(urlItem);
          if (!ext) {
            ext = /\.([^.]+)$/.exec(urlItem.split('?', 1)[0]);
          }

          if (ext) {
            ext = ext[1].toLowerCase();
          } else {
            self.on('loaderror');
            return;
          }
        }

        if (codecs[ext]) {
          url = self._urls[i];
          break;
        }
      }

      if (!url) {
        self.on('loaderror');
        return;
      }

      self._src = url;

      if (self._webAudio) {
        loadBuffer(self, url);
      } else {
        var newNode = new Audio();

        // listen for errors with HTML5 audio (http://dev.w3.org/html5/spec-author-view/spec.html#mediaerror)
        newNode.addEventListener('error', function () {
          if (newNode.error && newNode.error.code === 4) {
            HowlerGlobal.noAudio = true;
          }

          self.on('loaderror', {type: newNode.error ? newNode.error.code : 0});
        }, false);

        self._audioNode.push(newNode);

        // setup the new audio node
        newNode.src = url;
        newNode._pos = 0;
        newNode.preload = 'auto';
        newNode.volume = (Howler._muted) ? 0 : self._volume * Howler.volume();

        // add this sound to the cache
        cache[url] = self;

        // setup the event listener to start playing the sound
        // as soon as it has buffered enough
        var listener = function() {
          // round up the duration when using HTML5 Audio to account for the lower precision
          self._duration = Math.ceil(newNode.duration * 10) / 10;

          // setup a sprite if none is defined
          if (Object.getOwnPropertyNames(self._sprite).length === 0) {
            self._sprite = {_default: [0, self._duration * 1000]};
          }

          if (!self._loaded) {
            self._loaded = true;
            self.on('load');
          }

          if (self._autoplay) {
            self.play();
          }

          // clear the event listener
          newNode.removeEventListener('canplaythrough', listener, false);
        };
        newNode.addEventListener('canplaythrough', listener, false);
        newNode.load();
      }

      return self;
    },

    /**
     * Get/set the URLs to be pulled from to play in this source.
     * @param  {Array} urls  Arry of URLs to load from
     * @return {Howl}        Returns self or the current URLs
     */
    urls: function(urls) {
      var self = this;

      if (urls) {
        self.stop();
        self._urls = (typeof urls === 'string') ? [urls] : urls;
        self._loaded = false;
        self.load();

        return self;
      } else {
        return self._urls;
      }
    },

    /**
     * Play a sound from the current time (0 by default).
     * @param  {String}   sprite   (optional) Plays from the specified position in the sound sprite definition.
     * @param  {Function} callback (optional) Returns the unique playback id for this sound instance.
     * @return {Howl}
     */
    play: function(sprite, callback) {
      var self = this;

      // if no sprite was passed but a callback was, update the variables
      if (typeof sprite === 'function') {
        callback = sprite;
      }

      // use the default sprite if none is passed
      if (!sprite || typeof sprite === 'function') {
        sprite = '_default';
      }

      // if the sound hasn't been loaded, add it to the event queue
      if (!self._loaded) {
        self.on('load', function() {
          self.play(sprite, callback);
        });

        return self;
      }

      // if the sprite doesn't exist, play nothing
      if (!self._sprite[sprite]) {
        if (typeof callback === 'function') callback();
        return self;
      }

      // get the node to playback
      self._inactiveNode(function(node) {
        // persist the sprite being played
        node._sprite = sprite;

        // determine where to start playing from
        var pos = (node._pos > 0) ? node._pos : self._sprite[sprite][0] / 1000;

        // determine how long to play for
        var duration = 0;
        if (self._webAudio) {
          duration = self._sprite[sprite][1] / 1000 - node._pos;
          if (node._pos > 0) {
            pos = self._sprite[sprite][0] / 1000 + pos;
          }
        } else {
          duration = self._sprite[sprite][1] / 1000 - (pos - self._sprite[sprite][0] / 1000);
        }

        // determine if this sound should be looped
        var loop = !!(self._loop || self._sprite[sprite][2]);

        // set timer to fire the 'onend' event
        var soundId = (typeof callback === 'string') ? callback : Math.round(Date.now() * Math.random()) + '',
          timerId;
        (function() {
          var data = {
            id: soundId,
            sprite: sprite,
            loop: loop
          };
          timerId = setTimeout(function() {
            // if looping, restart the track
            if (!self._webAudio && loop) {
              self.stop(data.id).play(sprite, data.id);
            }

            // set web audio node to paused at end
            if (self._webAudio && !loop) {
              self._nodeById(data.id).paused = true;
              self._nodeById(data.id)._pos = 0;

              // clear the end timer
              self._clearEndTimer(data.id);
            }

            // end the track if it is HTML audio and a sprite
            if (!self._webAudio && !loop) {
              self.stop(data.id);
            }

            // fire ended event
            self.on('end', soundId);
          }, duration * 1000);

          // store the reference to the timer
          self._onendTimer.push({timer: timerId, id: data.id});
        })();

        if (self._webAudio) {
          var loopStart = self._sprite[sprite][0] / 1000,
            loopEnd = self._sprite[sprite][1] / 1000;

          // set the play id to this node and load into context
          node.id = soundId;
          node.paused = false;
          refreshBuffer(self, [loop, loopStart, loopEnd], soundId);
          self._playStart = ctx.currentTime;
          node.gain.value = self._volume;

          if (typeof node.bufferSource.start === 'undefined') {
            node.bufferSource.noteGrainOn(0, pos, duration);
          } else {
            node.bufferSource.start(0, pos, duration);
          }
        } else {
          if (node.readyState === 4 || !node.readyState && navigator.isCocoonJS) {
            node.readyState = 4;
            node.id = soundId;
            node.currentTime = pos;
            node.muted = Howler._muted || node.muted;
            node.volume = self._volume * Howler.volume();
            setTimeout(function() { node.play(); }, 0);
          } else {
            self._clearEndTimer(soundId);

            (function(){
              var sound = self,
                playSprite = sprite,
                fn = callback,
                newNode = node;
              var listener = function() {
                sound.play(playSprite, fn);

                // clear the event listener
                newNode.removeEventListener('canplaythrough', listener, false);
              };
              newNode.addEventListener('canplaythrough', listener, false);
            })();

            return self;
          }
        }

        // fire the play event and send the soundId back in the callback
        self.on('play');
        if (typeof callback === 'function') callback(soundId);

        return self;
      });

      return self;
    },

    /**
     * Pause playback and save the current position.
     * @param {String} id (optional) The play instance ID.
     * @return {Howl}
     */
    pause: function(id) {
      var self = this;

      // if the sound hasn't been loaded, add it to the event queue
      if (!self._loaded) {
        self.on('play', function() {
          self.pause(id);
        });

        return self;
      }

      // clear 'onend' timer
      self._clearEndTimer(id);

      var activeNode = (id) ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        activeNode._pos = self.pos(null, id);

        if (self._webAudio) {
          // make sure the sound has been created
          if (!activeNode.bufferSource || activeNode.paused) {
            return self;
          }

          activeNode.paused = true;
          if (typeof activeNode.bufferSource.stop === 'undefined') {
            activeNode.bufferSource.noteOff(0);
          } else {
            activeNode.bufferSource.stop(0);
          }
        } else {
          activeNode.pause();
        }
      }

      self.on('pause');

      return self;
    },

    /**
     * Stop playback and reset to start.
     * @param  {String} id  (optional) The play instance ID.
     * @return {Howl}
     */
    stop: function(id) {
      var self = this;

      // if the sound hasn't been loaded, add it to the event queue
      if (!self._loaded) {
        self.on('play', function() {
          self.stop(id);
        });

        return self;
      }

      // clear 'onend' timer
      self._clearEndTimer(id);

      var activeNode = (id) ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        activeNode._pos = 0;

        if (self._webAudio) {
          // make sure the sound has been created
          if (!activeNode.bufferSource || activeNode.paused) {
            return self;
          }

          activeNode.paused = true;

          if (typeof activeNode.bufferSource.stop === 'undefined') {
            activeNode.bufferSource.noteOff(0);
          } else {
            activeNode.bufferSource.stop(0);
          }
        } else if (!isNaN(activeNode.duration)) {
          activeNode.pause();
          activeNode.currentTime = 0;
        }
      }

      return self;
    },

    /**
     * Mute this sound.
     * @param  {String} id (optional) The play instance ID.
     * @return {Howl}
     */
    mute: function(id) {
      var self = this;

      // if the sound hasn't been loaded, add it to the event queue
      if (!self._loaded) {
        self.on('play', function() {
          self.mute(id);
        });

        return self;
      }

      var activeNode = (id) ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        if (self._webAudio) {
          activeNode.gain.value = 0;
        } else {
          activeNode.muted = true;
        }
      }

      return self;
    },

    /**
     * Unmute this sound.
     * @param  {String} id (optional) The play instance ID.
     * @return {Howl}
     */
    unmute: function(id) {
      var self = this;

      // if the sound hasn't been loaded, add it to the event queue
      if (!self._loaded) {
        self.on('play', function() {
          self.unmute(id);
        });

        return self;
      }

      var activeNode = (id) ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        if (self._webAudio) {
          activeNode.gain.value = self._volume;
        } else {
          activeNode.muted = false;
        }
      }

      return self;
    },

    /**
     * Get/set volume of this sound.
     * @param  {Float}  vol Volume from 0.0 to 1.0.
     * @param  {String} id  (optional) The play instance ID.
     * @return {Howl/Float}     Returns self or current volume.
     */
    volume: function(vol, id) {
      var self = this;

      // make sure volume is a number
      vol = parseFloat(vol);

      if (vol >= 0 && vol <= 1) {
        self._volume = vol;

        // if the sound hasn't been loaded, add it to the event queue
        if (!self._loaded) {
          self.on('play', function() {
            self.volume(vol, id);
          });

          return self;
        }

        var activeNode = (id) ? self._nodeById(id) : self._activeNode();
        if (activeNode) {
          if (self._webAudio) {
            activeNode.gain.value = vol;
          } else {
            activeNode.volume = vol * Howler.volume();
          }
        }

        return self;
      } else {
        return self._volume;
      }
    },

    /**
     * Get/set whether to loop the sound.
     * @param  {Boolean} loop To loop or not to loop, that is the question.
     * @return {Howl/Boolean}      Returns self or current looping value.
     */
    loop: function(loop) {
      var self = this;

      if (typeof loop === 'boolean') {
        self._loop = loop;

        return self;
      } else {
        return self._loop;
      }
    },

    /**
     * Get/set sound sprite definition.
     * @param  {Object} sprite Example: {spriteName: [offset, duration, loop]}
     *                @param {Integer} offset   Where to begin playback in milliseconds
     *                @param {Integer} duration How long to play in milliseconds
     *                @param {Boolean} loop     (optional) Set true to loop this sprite
     * @return {Howl}        Returns current sprite sheet or self.
     */
    sprite: function(sprite) {
      var self = this;

      if (typeof sprite === 'object') {
        self._sprite = sprite;

        return self;
      } else {
        return self._sprite;
      }
    },

    /**
     * Get/set the position of playback.
     * @param  {Float}  pos The position to move current playback to.
     * @param  {String} id  (optional) The play instance ID.
     * @return {Howl/Float}      Returns self or current playback position.
     */
    pos: function(pos, id) {
      var self = this;

      // if the sound hasn't been loaded, add it to the event queue
      if (!self._loaded) {
        self.on('load', function() {
          self.pos(pos);
        });

        return typeof pos === 'number' ? self : self._pos || 0;
      }

      // make sure we are dealing with a number for pos
      pos = parseFloat(pos);

      var activeNode = (id) ? self._nodeById(id) : self._activeNode();
      if (activeNode) {
        if (pos >= 0) {
          self.pause(id);
          activeNode._pos = pos;
          self.play(activeNode._sprite, id);

          return self;
        } else {
          return self._webAudio ? activeNode._pos + (ctx.currentTime - self._playStart) : activeNode.currentTime;
        }
      } else if (pos >= 0) {
        return self;
      } else {
        // find the first inactive node to return the pos for
        for (var i=0; i<self._audioNode.length; i++) {
          if (self._audioNode[i].paused && self._audioNode[i].readyState === 4) {
            return (self._webAudio) ? self._audioNode[i]._pos : self._audioNode[i].currentTime;
          }
        }
      }
    },

    /**
     * Get/set the 3D position of the audio source.
     * The most common usage is to set the 'x' position
     * to affect the left/right ear panning. Setting any value higher than
     * 1.0 will begin to decrease the volume of the sound as it moves further away.
     * NOTE: This only works with Web Audio API, HTML5 Audio playback
     * will not be affected.
     * @param  {Float}  x  The x-position of the playback from -1000.0 to 1000.0
     * @param  {Float}  y  The y-position of the playback from -1000.0 to 1000.0
     * @param  {Float}  z  The z-position of the playback from -1000.0 to 1000.0
     * @param  {String} id (optional) The play instance ID.
     * @return {Howl/Array}   Returns self or the current 3D position: [x, y, z]
     */
    pos3d: function(x, y, z, id) {
      var self = this;

      // set a default for the optional 'y' & 'z'
      y = (typeof y === 'undefined' || !y) ? 0 : y;
      z = (typeof z === 'undefined' || !z) ? -0.5 : z;

      // if the sound hasn't been loaded, add it to the event queue
      if (!self._loaded) {
        self.on('play', function() {
          self.pos3d(x, y, z, id);
        });

        return self;
      }

      if (x >= 0 || x < 0) {
        if (self._webAudio) {
          var activeNode = (id) ? self._nodeById(id) : self._activeNode();
          if (activeNode) {
            self._pos3d = [x, y, z];
            activeNode.panner.setPosition(x, y, z);
            activeNode.panner.panningModel = self._model || 'HRTF';
          }
        }
      } else {
        return self._pos3d;
      }

      return self;
    },

    /**
     * Fade a currently playing sound between two volumes.
     * @param  {Number}   from     The volume to fade from (0.0 to 1.0).
     * @param  {Number}   to       The volume to fade to (0.0 to 1.0).
     * @param  {Number}   len      Time in milliseconds to fade.
     * @param  {Function} callback (optional) Fired when the fade is complete.
     * @param  {String}   id       (optional) The play instance ID.
     * @return {Howl}
     */
    fade: function(from, to, len, callback, id) {
      var self = this,
        diff = Math.abs(from - to),
        dir = from > to ? 'down' : 'up',
        steps = diff / 0.01,
        stepTime = len / steps;

      // if the sound hasn't been loaded, add it to the event queue
      if (!self._loaded) {
        self.on('load', function() {
          self.fade(from, to, len, callback, id);
        });

        return self;
      }

      // set the volume to the start position
      self.volume(from, id);

      for (var i=1; i<=steps; i++) {
        (function() {
          var change = self._volume + (dir === 'up' ? 0.01 : -0.01) * i,
            vol = Math.round(1000 * change) / 1000,
            toVol = to;

          setTimeout(function() {
            self.volume(vol, id);

            if (vol === toVol) {
              if (callback) callback();
            }
          }, stepTime * i);
        })();
      }
    },

    /**
     * [DEPRECATED] Fade in the current sound.
     * @param  {Float}    to      Volume to fade to (0.0 to 1.0).
     * @param  {Number}   len     Time in milliseconds to fade.
     * @param  {Function} callback
     * @return {Howl}
     */
    fadeIn: function(to, len, callback) {
      return this.volume(0).play().fade(0, to, len, callback);
    },

    /**
     * [DEPRECATED] Fade out the current sound and pause when finished.
     * @param  {Float}    to       Volume to fade to (0.0 to 1.0).
     * @param  {Number}   len      Time in milliseconds to fade.
     * @param  {Function} callback
     * @param  {String}   id       (optional) The play instance ID.
     * @return {Howl}
     */
    fadeOut: function(to, len, callback, id) {
      var self = this;

      return self.fade(self._volume, to, len, function() {
        if (callback) callback();
        self.pause(id);

        // fire ended event
        self.on('end');
      }, id);
    },

    /**
     * Get an audio node by ID.
     * @return {Howl} Audio node.
     */
    _nodeById: function(id) {
      var self = this,
        node = self._audioNode[0];

      // find the node with this ID
      for (var i=0; i<self._audioNode.length; i++) {
        if (self._audioNode[i].id === id) {
          node = self._audioNode[i];
          break;
        }
      }

      return node;
    },

    /**
     * Get the first active audio node.
     * @return {Howl} Audio node.
     */
    _activeNode: function() {
      var self = this,
        node = null;

      // find the first playing node
      for (var i=0; i<self._audioNode.length; i++) {
        if (!self._audioNode[i].paused) {
          node = self._audioNode[i];
          break;
        }
      }

      // remove excess inactive nodes
      self._drainPool();

      return node;
    },

    /**
     * Get the first inactive audio node.
     * If there is none, create a new one and add it to the pool.
     * @param  {Function} callback Function to call when the audio node is ready.
     */
    _inactiveNode: function(callback) {
      var self = this,
        node = null;

      // find first inactive node to recycle
      for (var i=0; i<self._audioNode.length; i++) {
        if (self._audioNode[i].paused && self._audioNode[i].readyState === 4) {
          // send the node back for use by the new play instance
          callback(self._audioNode[i]);
          node = true;
          break;
        }
      }

      // remove excess inactive nodes
      self._drainPool();

      if (node) {
        return;
      }

      // create new node if there are no inactives
      var newNode;
      if (self._webAudio) {
        newNode = self._setupAudioNode();
        callback(newNode);
      } else {
        self.load();
        newNode = self._audioNode[self._audioNode.length - 1];

        // listen for the correct load event and fire the callback
        var listenerEvent = navigator.isCocoonJS ? 'canplaythrough' : 'loadedmetadata';
        var listener = function() {
          newNode.removeEventListener(listenerEvent, listener, false);
          callback(newNode);
        };
        newNode.addEventListener(listenerEvent, listener, false);
      }
    },

    /**
     * If there are more than 5 inactive audio nodes in the pool, clear out the rest.
     */
    _drainPool: function() {
      var self = this,
        inactive = 0,
        i;

      // count the number of inactive nodes
      for (i=0; i<self._audioNode.length; i++) {
        if (self._audioNode[i].paused) {
          inactive++;
        }
      }

      // remove excess inactive nodes
      for (i=self._audioNode.length-1; i>=0; i--) {
        if (inactive <= 5) {
          break;
        }

        if (self._audioNode[i].paused) {
          // disconnect the audio source if using Web Audio
          if (self._webAudio) {
            self._audioNode[i].disconnect(0);
          }

          inactive--;
          self._audioNode.splice(i, 1);
        }
      }
    },

    /**
     * Clear 'onend' timeout before it ends.
     * @param  {String} soundId  The play instance ID.
     */
    _clearEndTimer: function(soundId) {
      var self = this,
        index = 0;

      // loop through the timers to find the one associated with this sound
      for (var i=0; i<self._onendTimer.length; i++) {
        if (self._onendTimer[i].id === soundId) {
          index = i;
          break;
        }
      }

      var timer = self._onendTimer[index];
      if (timer) {
        clearTimeout(timer.timer);
        self._onendTimer.splice(index, 1);
      }
    },

    /**
     * Setup the gain node and panner for a Web Audio instance.
     * @return {Object} The new audio node.
     */
    _setupAudioNode: function() {
      var self = this,
        node = self._audioNode,
        index = self._audioNode.length;

      // create gain node
      node[index] = (typeof ctx.createGain === 'undefined') ? ctx.createGainNode() : ctx.createGain();
      node[index].gain.value = self._volume;
      node[index].paused = true;
      node[index]._pos = 0;
      node[index].readyState = 4;
      node[index].connect(masterGain);

      // create the panner
      node[index].panner = ctx.createPanner();
      node[index].panner.panningModel = self._model || 'equalpower';
      node[index].panner.setPosition(self._pos3d[0], self._pos3d[1], self._pos3d[2]);
      node[index].panner.connect(node[index]);

      return node[index];
    },

    /**
     * Call/set custom events.
     * @param  {String}   event Event type.
     * @param  {Function} fn    Function to call.
     * @return {Howl}
     */
    on: function(event, fn) {
      var self = this,
        events = self['_on' + event];

      if (typeof fn === 'function') {
        events.push(fn);
      } else {
        for (var i=0; i<events.length; i++) {
          if (fn) {
            events[i].call(self, fn);
          } else {
            events[i].call(self);
          }
        }
      }

      return self;
    },

    /**
     * Remove a custom event.
     * @param  {String}   event Event type.
     * @param  {Function} fn    Listener to remove.
     * @return {Howl}
     */
    off: function(event, fn) {
      var self = this,
        events = self['_on' + event],
        fnString = fn ? fn.toString() : null;

      if (fnString) {
        // loop through functions in the event for comparison
        for (var i=0; i<events.length; i++) {
          if (fnString === events[i].toString()) {
            events.splice(i, 1);
            break;
          }
        }
      } else {
        self['_on' + event] = [];
      }

      return self;
    },

    /**
     * Unload and destroy the current Howl object.
     * This will immediately stop all play instances attached to this sound.
     */
    unload: function() {
      var self = this;

      // stop playing any active nodes
      var nodes = self._audioNode;
      for (var i=0; i<self._audioNode.length; i++) {
        // stop the sound if it is currently playing
        if (!nodes[i].paused) {
          self.stop(nodes[i].id);
          self.on('end', nodes[i].id);
        }

        if (!self._webAudio) {
          // remove the source if using HTML5 Audio
          nodes[i].src = '';
        } else {
          // disconnect the output from the master gain
          nodes[i].disconnect(0);
        }
      }

      // make sure all timeouts are cleared
      for (i=0; i<self._onendTimer.length; i++) {
        clearTimeout(self._onendTimer[i].timer);
      }

      // remove the reference in the global Howler object
      var index = Howler._howls.indexOf(self);
      if (index !== null && index >= 0) {
        Howler._howls.splice(index, 1);
      }

      // delete this sound from the cache
      delete cache[self._src];
      self = null;
    }

  };

  // only define these functions when using WebAudio
  if (usingWebAudio) {

    /**
     * Buffer a sound from URL (or from cache) and decode to audio source (Web Audio API).
     * @param  {Object} obj The Howl object for the sound to load.
     * @param  {String} url The path to the sound file.
     */
    var loadBuffer = function(obj, url) {
      // check if the buffer has already been cached
      if (url in cache) {
        // set the duration from the cache
        obj._duration = cache[url].duration;

        // load the sound into this object
        loadSound(obj);
        return;
      }
      
      if (/^data:[^;]+;base64,/.test(url)) {
        // Decode base64 data-URIs because some browsers cannot load data-URIs with XMLHttpRequest.
        var data = atob(url.split(',')[1]);
        var dataView = new Uint8Array(data.length);
        for (var i=0; i<data.length; ++i) {
          dataView[i] = data.charCodeAt(i);
        }
        
        decodeAudioData(dataView.buffer, obj, url);
      } else {
        // load the buffer from the URL
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function() {
          decodeAudioData(xhr.response, obj, url);
        };
        xhr.onerror = function() {
          // if there is an error, switch the sound to HTML Audio
          if (obj._webAudio) {
            obj._buffer = true;
            obj._webAudio = false;
            obj._audioNode = [];
            delete obj._gainNode;
            obj.load();
          }
        };
        try {
          xhr.send();
        } catch (e) {
          xhr.onerror();
        }
      }
    };

    /**
     * Decode audio data from an array buffer.
     * @param  {ArrayBuffer} arraybuffer The audio data.
     * @param  {Object} obj The Howl object for the sound to load.
     * @param  {String} url The path to the sound file.
     */
    var decodeAudioData = function(arraybuffer, obj, url) {
      // decode the buffer into an audio source
      ctx.decodeAudioData(
        arraybuffer,
        function(buffer) {
          if (buffer) {
            cache[url] = buffer;
            loadSound(obj, buffer);
          }
        },
        function(err) {
          obj.on('loaderror');
        }
      );
    };

    /**
     * Finishes loading the Web Audio API sound and fires the loaded event
     * @param  {Object}  obj    The Howl object for the sound to load.
     * @param  {Objecct} buffer The decoded buffer sound source.
     */
    var loadSound = function(obj, buffer) {
      // set the duration
      obj._duration = (buffer) ? buffer.duration : obj._duration;

      // setup a sprite if none is defined
      if (Object.getOwnPropertyNames(obj._sprite).length === 0) {
        obj._sprite = {_default: [0, obj._duration * 1000]};
      }

      // fire the loaded event
      if (!obj._loaded) {
        obj._loaded = true;
        obj.on('load');
      }

      if (obj._autoplay) {
        obj.play();
      }
    };

    /**
     * Load the sound back into the buffer source.
     * @param  {Object} obj   The sound to load.
     * @param  {Array}  loop  Loop boolean, pos, and duration.
     * @param  {String} id    (optional) The play instance ID.
     */
    var refreshBuffer = function(obj, loop, id) {
      // determine which node to connect to
      var node = obj._nodeById(id);

      // setup the buffer source for playback
      node.bufferSource = ctx.createBufferSource();
      node.bufferSource.buffer = cache[obj._src];
      node.bufferSource.connect(node.panner);
      node.bufferSource.loop = loop[0];
      if (loop[0]) {
        node.bufferSource.loopStart = loop[1];
        node.bufferSource.loopEnd = loop[1] + loop[2];
      }
      node.bufferSource.playbackRate.value = obj._rate;
    };

  }

  /**
   * Add support for AMD (Asynchronous Module Definition) libraries such as require.js.
   */
  if (typeof define === 'function' && define.amd) {
    define(function() {
      return {
        Howler: Howler,
        Howl: Howl
      };
    });
  }

  /**
   * Add support for CommonJS libraries such as browserify.
   */
  if (typeof exports !== 'undefined') {
    exports.Howler = Howler;
    exports.Howl = Howl;
  }

  // define globally in case AMD is not available or available but not used

  if (typeof window !== 'undefined') {
    window.Howler = Howler;
    window.Howl = Howl;
  }

})();

},{}],3:[function(require,module,exports){
/**
 * @license
 * pixi.js - v1.5.3
 * Copyright (c) 2012-2014, Mat Groves
 * http://goodboydigital.com/
 *
 * Compiled: 2014-04-24
 *
 * pixi.js is licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license.php
 */
(function(){var c=this,d=d||{};d.WEBGL_RENDERER=0,d.CANVAS_RENDERER=1,d.VERSION="v1.5.3",d.blendModes={NORMAL:0,ADD:1,MULTIPLY:2,SCREEN:3,OVERLAY:4,DARKEN:5,LIGHTEN:6,COLOR_DODGE:7,COLOR_BURN:8,HARD_LIGHT:9,SOFT_LIGHT:10,DIFFERENCE:11,EXCLUSION:12,HUE:13,SATURATION:14,COLOR:15,LUMINOSITY:16},d.scaleModes={DEFAULT:0,LINEAR:0,NEAREST:1},d.INTERACTION_FREQUENCY=30,d.AUTO_PREVENT_DEFAULT=!0,d.RAD_TO_DEG=180/Math.PI,d.DEG_TO_RAD=Math.PI/180,d.Point=function(a,b){this.x=a||0,this.y=b||0},d.Point.prototype.clone=function(){return new d.Point(this.x,this.y)},d.Point.prototype.constructor=d.Point,d.Point.prototype.set=function(a,b){this.x=a||0,this.y=b||(0!==b?this.x:0)},d.Rectangle=function(a,b,c,d){this.x=a||0,this.y=b||0,this.width=c||0,this.height=d||0},d.Rectangle.prototype.clone=function(){return new d.Rectangle(this.x,this.y,this.width,this.height)},d.Rectangle.prototype.contains=function(a,b){if(this.width<=0||this.height<=0)return!1;var c=this.x;if(a>=c&&a<=c+this.width){var d=this.y;if(b>=d&&b<=d+this.height)return!0}return!1},d.Rectangle.prototype.constructor=d.Rectangle,d.EmptyRectangle=new d.Rectangle(0,0,0,0),d.Polygon=function(a){if(a instanceof Array||(a=Array.prototype.slice.call(arguments)),"number"==typeof a[0]){for(var b=[],c=0,e=a.length;e>c;c+=2)b.push(new d.Point(a[c],a[c+1]));a=b}this.points=a},d.Polygon.prototype.clone=function(){for(var a=[],b=0;b<this.points.length;b++)a.push(this.points[b].clone());return new d.Polygon(a)},d.Polygon.prototype.contains=function(a,b){for(var c=!1,d=0,e=this.points.length-1;d<this.points.length;e=d++){var f=this.points[d].x,g=this.points[d].y,h=this.points[e].x,i=this.points[e].y,j=g>b!=i>b&&(h-f)*(b-g)/(i-g)+f>a;j&&(c=!c)}return c},d.Polygon.prototype.constructor=d.Polygon,d.Circle=function(a,b,c){this.x=a||0,this.y=b||0,this.radius=c||0},d.Circle.prototype.clone=function(){return new d.Circle(this.x,this.y,this.radius)},d.Circle.prototype.contains=function(a,b){if(this.radius<=0)return!1;var c=this.x-a,d=this.y-b,e=this.radius*this.radius;return c*=c,d*=d,e>=c+d},d.Circle.prototype.constructor=d.Circle,d.Ellipse=function(a,b,c,d){this.x=a||0,this.y=b||0,this.width=c||0,this.height=d||0},d.Ellipse.prototype.clone=function(){return new d.Ellipse(this.x,this.y,this.width,this.height)},d.Ellipse.prototype.contains=function(a,b){if(this.width<=0||this.height<=0)return!1;var c=(a-this.x)/this.width,d=(b-this.y)/this.height;return c*=c,d*=d,1>=c+d},d.Ellipse.prototype.getBounds=function(){return new d.Rectangle(this.x,this.y,this.width,this.height)},d.Ellipse.prototype.constructor=d.Ellipse,d.determineMatrixArrayType=function(){return"undefined"!=typeof Float32Array?Float32Array:Array},d.Matrix2=d.determineMatrixArrayType(),d.Matrix=function(){this.a=1,this.b=0,this.c=0,this.d=1,this.tx=0,this.ty=0},d.Matrix.prototype.fromArray=function(a){this.a=a[0],this.b=a[1],this.c=a[3],this.d=a[4],this.tx=a[2],this.ty=a[5]},d.Matrix.prototype.toArray=function(a){this.array||(this.array=new Float32Array(9));var b=this.array;return a?(this.array[0]=this.a,this.array[1]=this.c,this.array[2]=0,this.array[3]=this.b,this.array[4]=this.d,this.array[5]=0,this.array[6]=this.tx,this.array[7]=this.ty,this.array[8]=1):(this.array[0]=this.a,this.array[1]=this.b,this.array[2]=this.tx,this.array[3]=this.c,this.array[4]=this.d,this.array[5]=this.ty,this.array[6]=0,this.array[7]=0,this.array[8]=1),b},d.identityMatrix=new d.Matrix,d.DisplayObject=function(){this.position=new d.Point,this.scale=new d.Point(1,1),this.pivot=new d.Point(0,0),this.rotation=0,this.alpha=1,this.visible=!0,this.hitArea=null,this.buttonMode=!1,this.renderable=!1,this.parent=null,this.stage=null,this.worldAlpha=1,this._interactive=!1,this.defaultCursor="pointer",this.worldTransform=new d.Matrix,this.color=[],this.dynamic=!0,this._sr=0,this._cr=1,this.filterArea=null,this._bounds=new d.Rectangle(0,0,1,1),this._currentBounds=null,this._mask=null,this._cacheAsBitmap=!1,this._cacheIsDirty=!1},d.DisplayObject.prototype.constructor=d.DisplayObject,d.DisplayObject.prototype.setInteractive=function(a){this.interactive=a},Object.defineProperty(d.DisplayObject.prototype,"interactive",{get:function(){return this._interactive},set:function(a){this._interactive=a,this.stage&&(this.stage.dirty=!0)}}),Object.defineProperty(d.DisplayObject.prototype,"worldVisible",{get:function(){var a=this;do{if(!a.visible)return!1;a=a.parent}while(a);return!0}}),Object.defineProperty(d.DisplayObject.prototype,"mask",{get:function(){return this._mask},set:function(a){this._mask&&(this._mask.isMask=!1),this._mask=a,this._mask&&(this._mask.isMask=!0)}}),Object.defineProperty(d.DisplayObject.prototype,"filters",{get:function(){return this._filters},set:function(a){if(a){for(var b=[],c=0;c<a.length;c++)for(var d=a[c].passes,e=0;e<d.length;e++)b.push(d[e]);this._filterBlock={target:this,filterPasses:b}}this._filters=a}}),Object.defineProperty(d.DisplayObject.prototype,"cacheAsBitmap",{get:function(){return this._cacheAsBitmap},set:function(a){this._cacheAsBitmap!==a&&(a?this._generateCachedSprite():this._destroyCachedSprite(),this._cacheAsBitmap=a)}}),d.DisplayObject.prototype.updateTransform=function(){this.rotation!==this.rotationCache&&(this.rotationCache=this.rotation,this._sr=Math.sin(this.rotation),this._cr=Math.cos(this.rotation));var a=this.parent.worldTransform,b=this.worldTransform,c=this.pivot.x,d=this.pivot.y,e=this._cr*this.scale.x,f=-this._sr*this.scale.y,g=this._sr*this.scale.x,h=this._cr*this.scale.y,i=this.position.x-e*c-d*f,j=this.position.y-h*d-c*g,k=a.a,l=a.b,m=a.c,n=a.d;b.a=k*e+l*g,b.b=k*f+l*h,b.tx=k*i+l*j+a.tx,b.c=m*e+n*g,b.d=m*f+n*h,b.ty=m*i+n*j+a.ty,this.worldAlpha=this.alpha*this.parent.worldAlpha},d.DisplayObject.prototype.getBounds=function(a){return a=a,d.EmptyRectangle},d.DisplayObject.prototype.getLocalBounds=function(){return this.getBounds(d.identityMatrix)},d.DisplayObject.prototype.setStageReference=function(a){this.stage=a,this._interactive&&(this.stage.dirty=!0)},d.DisplayObject.prototype.generateTexture=function(a){var b=this.getLocalBounds(),c=new d.RenderTexture(0|b.width,0|b.height,a);return c.render(this,new d.Point(-b.x,-b.y)),c},d.DisplayObject.prototype.updateCache=function(){this._generateCachedSprite()},d.DisplayObject.prototype._renderCachedSprite=function(a){a.gl?d.Sprite.prototype._renderWebGL.call(this._cachedSprite,a):d.Sprite.prototype._renderCanvas.call(this._cachedSprite,a)},d.DisplayObject.prototype._generateCachedSprite=function(){this._cacheAsBitmap=!1;var a=this.getLocalBounds();if(this._cachedSprite)this._cachedSprite.texture.resize(0|a.width,0|a.height);else{var b=new d.RenderTexture(0|a.width,0|a.height);this._cachedSprite=new d.Sprite(b),this._cachedSprite.worldTransform=this.worldTransform}var c=this._filters;this._filters=null,this._cachedSprite.filters=c,this._cachedSprite.texture.render(this,new d.Point(-a.x,-a.y)),this._cachedSprite.anchor.x=-(a.x/a.width),this._cachedSprite.anchor.y=-(a.y/a.height),this._filters=c,this._cacheAsBitmap=!0},d.DisplayObject.prototype._destroyCachedSprite=function(){this._cachedSprite&&(this._cachedSprite.texture.destroy(!0),this._cachedSprite=null)},d.DisplayObject.prototype._renderWebGL=function(a){a=a},d.DisplayObject.prototype._renderCanvas=function(a){a=a},Object.defineProperty(d.DisplayObject.prototype,"x",{get:function(){return this.position.x},set:function(a){this.position.x=a}}),Object.defineProperty(d.DisplayObject.prototype,"y",{get:function(){return this.position.y},set:function(a){this.position.y=a}}),d.DisplayObjectContainer=function(){d.DisplayObject.call(this),this.children=[]},d.DisplayObjectContainer.prototype=Object.create(d.DisplayObject.prototype),d.DisplayObjectContainer.prototype.constructor=d.DisplayObjectContainer,d.DisplayObjectContainer.prototype.addChild=function(a){this.addChildAt(a,this.children.length)},d.DisplayObjectContainer.prototype.addChildAt=function(a,b){if(!(b>=0&&b<=this.children.length))throw new Error(a+" The index "+b+" supplied is out of bounds "+this.children.length);a.parent&&a.parent.removeChild(a),a.parent=this,this.children.splice(b,0,a),this.stage&&a.setStageReference(this.stage)},d.DisplayObjectContainer.prototype.swapChildren=function(a,b){if(a!==b){var c=this.children.indexOf(a),d=this.children.indexOf(b);if(0>c||0>d)throw new Error("swapChildren: Both the supplied DisplayObjects must be a child of the caller.");this.children[c]=b,this.children[d]=a}},d.DisplayObjectContainer.prototype.getChildAt=function(a){if(a>=0&&a<this.children.length)return this.children[a];throw new Error("Supplied index does not exist in the child list, or the supplied DisplayObject must be a child of the caller")},d.DisplayObjectContainer.prototype.removeChild=function(a){return this.removeChildAt(this.children.indexOf(a))},d.DisplayObjectContainer.prototype.removeChildAt=function(a){var b=this.getChildAt(a);return this.stage&&b.removeStageReference(),b.parent=void 0,this.children.splice(a,1),b},d.DisplayObjectContainer.prototype.removeChildren=function(a,b){var c=a||0,d="number"==typeof b?b:this.children.length,e=d-c;if(e>0&&d>=e){for(var f=this.children.splice(c,e),g=0;g<f.length;g++){var h=f[g];this.stage&&h.removeStageReference(),h.parent=void 0}return f}throw new Error("Range Error, numeric values are outside the acceptable range")},d.DisplayObjectContainer.prototype.updateTransform=function(){if(this.visible&&(d.DisplayObject.prototype.updateTransform.call(this),!this._cacheAsBitmap))for(var a=0,b=this.children.length;b>a;a++)this.children[a].updateTransform()},d.DisplayObjectContainer.prototype.getBounds=function(a){if(0===this.children.length)return d.EmptyRectangle;if(a){var b=this.worldTransform;this.worldTransform=a,this.updateTransform(),this.worldTransform=b}for(var c,e,f,g=1/0,h=1/0,i=-1/0,j=-1/0,k=!1,l=0,m=this.children.length;m>l;l++){var n=this.children[l];n.visible&&(k=!0,c=this.children[l].getBounds(a),g=g<c.x?g:c.x,h=h<c.y?h:c.y,e=c.width+c.x,f=c.height+c.y,i=i>e?i:e,j=j>f?j:f)}if(!k)return d.EmptyRectangle;var o=this._bounds;return o.x=g,o.y=h,o.width=i-g,o.height=j-h,o},d.DisplayObjectContainer.prototype.getLocalBounds=function(){var a=this.worldTransform;this.worldTransform=d.identityMatrix;for(var b=0,c=this.children.length;c>b;b++)this.children[b].updateTransform();var e=this.getBounds();return this.worldTransform=a,e},d.DisplayObjectContainer.prototype.setStageReference=function(a){this.stage=a,this._interactive&&(this.stage.dirty=!0);for(var b=0,c=this.children.length;c>b;b++){var d=this.children[b];d.setStageReference(a)}},d.DisplayObjectContainer.prototype.removeStageReference=function(){for(var a=0,b=this.children.length;b>a;a++){var c=this.children[a];c.removeStageReference()}this._interactive&&(this.stage.dirty=!0),this.stage=null},d.DisplayObjectContainer.prototype._renderWebGL=function(a){if(this.visible&&!(this.alpha<=0)){if(this._cacheAsBitmap)return this._renderCachedSprite(a),void 0;var b,c;if(this._mask||this._filters){for(this._mask&&(a.spriteBatch.stop(),a.maskManager.pushMask(this.mask,a),a.spriteBatch.start()),this._filters&&(a.spriteBatch.flush(),a.filterManager.pushFilter(this._filterBlock)),b=0,c=this.children.length;c>b;b++)this.children[b]._renderWebGL(a);a.spriteBatch.stop(),this._filters&&a.filterManager.popFilter(),this._mask&&a.maskManager.popMask(a),a.spriteBatch.start()}else for(b=0,c=this.children.length;c>b;b++)this.children[b]._renderWebGL(a)}},d.DisplayObjectContainer.prototype._renderCanvas=function(a){if(this.visible!==!1&&0!==this.alpha){if(this._cacheAsBitmap)return this._renderCachedSprite(a),void 0;this._mask&&a.maskManager.pushMask(this._mask,a.context);for(var b=0,c=this.children.length;c>b;b++){var d=this.children[b];d._renderCanvas(a)}this._mask&&a.maskManager.popMask(a.context)}},d.Sprite=function(a){d.DisplayObjectContainer.call(this),this.anchor=new d.Point,this.texture=a,this._width=0,this._height=0,this.tint=16777215,this.blendMode=d.blendModes.NORMAL,a.baseTexture.hasLoaded?this.onTextureUpdate():(this.onTextureUpdateBind=this.onTextureUpdate.bind(this),this.texture.addEventListener("update",this.onTextureUpdateBind)),this.renderable=!0},d.Sprite.prototype=Object.create(d.DisplayObjectContainer.prototype),d.Sprite.prototype.constructor=d.Sprite,Object.defineProperty(d.Sprite.prototype,"width",{get:function(){return this.scale.x*this.texture.frame.width},set:function(a){this.scale.x=a/this.texture.frame.width,this._width=a}}),Object.defineProperty(d.Sprite.prototype,"height",{get:function(){return this.scale.y*this.texture.frame.height},set:function(a){this.scale.y=a/this.texture.frame.height,this._height=a}}),d.Sprite.prototype.setTexture=function(a){this.texture.baseTexture!==a.baseTexture?(this.textureChange=!0,this.texture=a):this.texture=a,this.cachedTint=16777215,this.updateFrame=!0},d.Sprite.prototype.onTextureUpdate=function(){this._width&&(this.scale.x=this._width/this.texture.frame.width),this._height&&(this.scale.y=this._height/this.texture.frame.height),this.updateFrame=!0},d.Sprite.prototype.getBounds=function(a){var b=this.texture.frame.width,c=this.texture.frame.height,d=b*(1-this.anchor.x),e=b*-this.anchor.x,f=c*(1-this.anchor.y),g=c*-this.anchor.y,h=a||this.worldTransform,i=h.a,j=h.c,k=h.b,l=h.d,m=h.tx,n=h.ty,o=i*e+k*g+m,p=l*g+j*e+n,q=i*d+k*g+m,r=l*g+j*d+n,s=i*d+k*f+m,t=l*f+j*d+n,u=i*e+k*f+m,v=l*f+j*e+n,w=-1/0,x=-1/0,y=1/0,z=1/0;y=y>o?o:y,y=y>q?q:y,y=y>s?s:y,y=y>u?u:y,z=z>p?p:z,z=z>r?r:z,z=z>t?t:z,z=z>v?v:z,w=o>w?o:w,w=q>w?q:w,w=s>w?s:w,w=u>w?u:w,x=p>x?p:x,x=r>x?r:x,x=t>x?t:x,x=v>x?v:x;var A=this._bounds;return A.x=y,A.width=w-y,A.y=z,A.height=x-z,this._currentBounds=A,A},d.Sprite.prototype._renderWebGL=function(a){if(this.visible&&!(this.alpha<=0)){var b,c;if(this._mask||this._filters){var d=a.spriteBatch;for(this._mask&&(d.stop(),a.maskManager.pushMask(this.mask,a),d.start()),this._filters&&(d.flush(),a.filterManager.pushFilter(this._filterBlock)),d.render(this),b=0,c=this.children.length;c>b;b++)this.children[b]._renderWebGL(a);d.stop(),this._filters&&a.filterManager.popFilter(),this._mask&&a.maskManager.popMask(a),d.start()}else for(a.spriteBatch.render(this),b=0,c=this.children.length;c>b;b++)this.children[b]._renderWebGL(a)}},d.Sprite.prototype._renderCanvas=function(a){if(this.visible!==!1&&0!==this.alpha){var b=this.texture.frame,c=a.context,e=this.texture;if(this.blendMode!==a.currentBlendMode&&(a.currentBlendMode=this.blendMode,c.globalCompositeOperation=d.blendModesCanvas[a.currentBlendMode]),this._mask&&a.maskManager.pushMask(this._mask,a.context),b&&b.width&&b.height&&e.baseTexture.source){c.globalAlpha=this.worldAlpha;var f=this.worldTransform;if(a.roundPixels?c.setTransform(f.a,f.c,f.b,f.d,0|f.tx,0|f.ty):c.setTransform(f.a,f.c,f.b,f.d,f.tx,f.ty),a.smoothProperty&&a.scaleMode!==this.texture.baseTexture.scaleMode&&(a.scaleMode=this.texture.baseTexture.scaleMode,c[a.smoothProperty]=a.scaleMode===d.scaleModes.LINEAR),16777215!==this.tint){if(this.cachedTint!==this.tint){if(!e.baseTexture.hasLoaded)return;this.cachedTint=this.tint,this.tintedTexture=d.CanvasTinter.getTintedTexture(this,this.tint)}c.drawImage(this.tintedTexture,0,0,b.width,b.height,this.anchor.x*-b.width,this.anchor.y*-b.height,b.width,b.height)}else if(e.trim){var g=e.trim;c.drawImage(this.texture.baseTexture.source,b.x,b.y,b.width,b.height,g.x-this.anchor.x*g.width,g.y-this.anchor.y*g.height,b.width,b.height)}else c.drawImage(this.texture.baseTexture.source,b.x,b.y,b.width,b.height,this.anchor.x*-b.width,this.anchor.y*-b.height,b.width,b.height)}for(var h=0,i=this.children.length;i>h;h++){var j=this.children[h];j._renderCanvas(a)}this._mask&&a.maskManager.popMask(a.context)}},d.Sprite.fromFrame=function(a){var b=d.TextureCache[a];if(!b)throw new Error('The frameId "'+a+'" does not exist in the texture cache'+this);return new d.Sprite(b)},d.Sprite.fromImage=function(a,b,c){var e=d.Texture.fromImage(a,b,c);return new d.Sprite(e)},d.SpriteBatch=function(a){d.DisplayObjectContainer.call(this),this.textureThing=a,this.ready=!1},d.SpriteBatch.prototype=Object.create(d.DisplayObjectContainer.prototype),d.SpriteBatch.constructor=d.SpriteBatch,d.SpriteBatch.prototype.initWebGL=function(a){this.fastSpriteBatch=new d.WebGLFastSpriteBatch(a),this.ready=!0},d.SpriteBatch.prototype.updateTransform=function(){d.DisplayObject.prototype.updateTransform.call(this)},d.SpriteBatch.prototype._renderWebGL=function(a){!this.visible||this.alpha<=0||!this.children.length||(this.ready||this.initWebGL(a.gl),a.spriteBatch.stop(),a.shaderManager.activateShader(a.shaderManager.fastShader),this.fastSpriteBatch.begin(this,a),this.fastSpriteBatch.render(this),a.shaderManager.activateShader(a.shaderManager.defaultShader),a.spriteBatch.start())},d.SpriteBatch.prototype._renderCanvas=function(a){var b=a.context;b.globalAlpha=this.worldAlpha,d.DisplayObject.prototype.updateTransform.call(this);for(var c=this.worldTransform,e=!0,f=0;f<this.children.length;f++){var g=this.children[f];if(g.visible){var h=g.texture,i=h.frame;if(b.globalAlpha=this.worldAlpha*g.alpha,g.rotation%(2*Math.PI)===0)e&&(b.setTransform(c.a,c.c,c.b,c.d,c.tx,c.ty),e=!1),b.drawImage(h.baseTexture.source,i.x,i.y,i.width,i.height,g.anchor.x*-i.width*g.scale.x+g.position.x+.5|0,g.anchor.y*-i.height*g.scale.y+g.position.y+.5|0,i.width*g.scale.x,i.height*g.scale.y);else{e||(e=!0),d.DisplayObject.prototype.updateTransform.call(g);var j=g.worldTransform;a.roundPixels?b.setTransform(j.a,j.c,j.b,j.d,0|j.tx,0|j.ty):b.setTransform(j.a,j.c,j.b,j.d,j.tx,j.ty),b.drawImage(h.baseTexture.source,i.x,i.y,i.width,i.height,g.anchor.x*-i.width+.5|0,g.anchor.y*-i.height+.5|0,i.width,i.height)}}}},d.MovieClip=function(a){d.Sprite.call(this,a[0]),this.textures=a,this.animationSpeed=1,this.loop=!0,this.onComplete=null,this.currentFrame=0,this.playing=!1},d.MovieClip.prototype=Object.create(d.Sprite.prototype),d.MovieClip.prototype.constructor=d.MovieClip,Object.defineProperty(d.MovieClip.prototype,"totalFrames",{get:function(){return this.textures.length}}),d.MovieClip.prototype.stop=function(){this.playing=!1},d.MovieClip.prototype.play=function(){this.playing=!0},d.MovieClip.prototype.gotoAndStop=function(a){this.playing=!1,this.currentFrame=a;var b=this.currentFrame+.5|0;this.setTexture(this.textures[b%this.textures.length])},d.MovieClip.prototype.gotoAndPlay=function(a){this.currentFrame=a,this.playing=!0},d.MovieClip.prototype.updateTransform=function(){if(d.Sprite.prototype.updateTransform.call(this),this.playing){this.currentFrame+=this.animationSpeed;var a=this.currentFrame+.5|0;this.loop||a<this.textures.length?this.setTexture(this.textures[a%this.textures.length]):a>=this.textures.length&&(this.gotoAndStop(this.textures.length-1),this.onComplete&&this.onComplete())}},d.MovieClip.prototype.fromFrames=function(a){for(var b=[],c=0;c<a.length;c++)b.push(new d.Texture.fromFrame(a[c]));return new d.MovieClip(b)},d.MovieClip.prototype.fromImages=function(a){for(var b=[],c=0;c<a.length;c++)b.push(new d.Texture.fromImage(a[c]));return new d.MovieClip(b)},d.FilterBlock=function(){this.visible=!0,this.renderable=!0},d.Text=function(a,b){this.canvas=document.createElement("canvas"),this.context=this.canvas.getContext("2d"),d.Sprite.call(this,d.Texture.fromCanvas(this.canvas)),this.setText(a),this.setStyle(b),this.updateText(),this.dirty=!1},d.Text.prototype=Object.create(d.Sprite.prototype),d.Text.prototype.constructor=d.Text,d.Text.prototype.setStyle=function(a){a=a||{},a.font=a.font||"bold 20pt Arial",a.fill=a.fill||"black",a.align=a.align||"left",a.stroke=a.stroke||"black",a.strokeThickness=a.strokeThickness||0,a.wordWrap=a.wordWrap||!1,a.wordWrapWidth=a.wordWrapWidth||100,a.wordWrapWidth=a.wordWrapWidth||100,a.dropShadow=a.dropShadow||!1,a.dropShadowAngle=a.dropShadowAngle||Math.PI/6,a.dropShadowDistance=a.dropShadowDistance||4,a.dropShadowColor=a.dropShadowColor||"black",this.style=a,this.dirty=!0},d.Text.prototype.setText=function(a){this.text=a.toString()||" ",this.dirty=!0},d.Text.prototype.updateText=function(){this.context.font=this.style.font;var a=this.text;this.style.wordWrap&&(a=this.wordWrap(this.text));for(var b=a.split(/(?:\r\n|\r|\n)/),c=[],d=0,e=0;e<b.length;e++){var f=this.context.measureText(b[e]).width;c[e]=f,d=Math.max(d,f)}var g=d+this.style.strokeThickness;this.style.dropShadow&&(g+=this.style.dropShadowDistance),this.canvas.width=g+this.context.lineWidth;var h=this.determineFontHeight("font: "+this.style.font+";")+this.style.strokeThickness,i=h*b.length;this.style.dropShadow&&(i+=this.style.dropShadowDistance),this.canvas.height=i,navigator.isCocoonJS&&this.context.clearRect(0,0,this.canvas.width,this.canvas.height),this.context.font=this.style.font,this.context.strokeStyle=this.style.stroke,this.context.lineWidth=this.style.strokeThickness,this.context.textBaseline="top";var j,k;if(this.style.dropShadow){this.context.fillStyle=this.style.dropShadowColor;var l=Math.sin(this.style.dropShadowAngle)*this.style.dropShadowDistance,m=Math.cos(this.style.dropShadowAngle)*this.style.dropShadowDistance;for(e=0;e<b.length;e++)j=this.style.strokeThickness/2,k=this.style.strokeThickness/2+e*h,"right"===this.style.align?j+=d-c[e]:"center"===this.style.align&&(j+=(d-c[e])/2),this.style.fill&&this.context.fillText(b[e],j+l,k+m)}for(this.context.fillStyle=this.style.fill,e=0;e<b.length;e++)j=this.style.strokeThickness/2,k=this.style.strokeThickness/2+e*h,"right"===this.style.align?j+=d-c[e]:"center"===this.style.align&&(j+=(d-c[e])/2),this.style.stroke&&this.style.strokeThickness&&this.context.strokeText(b[e],j,k),this.style.fill&&this.context.fillText(b[e],j,k);this.updateTexture()},d.Text.prototype.updateTexture=function(){this.texture.baseTexture.width=this.canvas.width,this.texture.baseTexture.height=this.canvas.height,this.texture.frame.width=this.canvas.width,this.texture.frame.height=this.canvas.height,this._width=this.canvas.width,this._height=this.canvas.height,this.requiresUpdate=!0},d.Text.prototype._renderWebGL=function(a){this.requiresUpdate&&(this.requiresUpdate=!1,d.updateWebGLTexture(this.texture.baseTexture,a.gl)),d.Sprite.prototype._renderWebGL.call(this,a)},d.Text.prototype.updateTransform=function(){this.dirty&&(this.updateText(),this.dirty=!1),d.Sprite.prototype.updateTransform.call(this)},d.Text.prototype.determineFontHeight=function(a){var b=d.Text.heightCache[a];if(!b){var c=document.getElementsByTagName("body")[0],e=document.createElement("div"),f=document.createTextNode("M");e.appendChild(f),e.setAttribute("style",a+";position:absolute;top:0;left:0"),c.appendChild(e),b=e.offsetHeight,d.Text.heightCache[a]=b,c.removeChild(e)}return b},d.Text.prototype.wordWrap=function(a){for(var b="",c=a.split("\n"),d=0;d<c.length;d++){for(var e=this.style.wordWrapWidth,f=c[d].split(" "),g=0;g<f.length;g++){var h=this.context.measureText(f[g]).width,i=h+this.context.measureText(" ").width;0===g||i>e?(g>0&&(b+="\n"),b+=f[g],e=this.style.wordWrapWidth-h):(e-=i,b+=" "+f[g])}d<c.length-1&&(b+="\n")}return b},d.Text.prototype.destroy=function(a){a&&this.texture.destroy()},d.Text.heightCache={},d.BitmapText=function(a,b){d.DisplayObjectContainer.call(this),this._pool=[],this.setText(a),this.setStyle(b),this.updateText(),this.dirty=!1},d.BitmapText.prototype=Object.create(d.DisplayObjectContainer.prototype),d.BitmapText.prototype.constructor=d.BitmapText,d.BitmapText.prototype.setText=function(a){this.text=a||" ",this.dirty=!0},d.BitmapText.prototype.setStyle=function(a){a=a||{},a.align=a.align||"left",this.style=a;var b=a.font.split(" ");this.fontName=b[b.length-1],this.fontSize=b.length>=2?parseInt(b[b.length-2],10):d.BitmapText.fonts[this.fontName].size,this.dirty=!0,this.tint=a.tint},d.BitmapText.prototype.updateText=function(){for(var a=d.BitmapText.fonts[this.fontName],b=new d.Point,c=null,e=[],f=0,g=[],h=0,i=this.fontSize/a.size,j=0;j<this.text.length;j++){var k=this.text.charCodeAt(j);if(/(?:\r\n|\r|\n)/.test(this.text.charAt(j)))g.push(b.x),f=Math.max(f,b.x),h++,b.x=0,b.y+=a.lineHeight,c=null;else{var l=a.chars[k];l&&(c&&l[c]&&(b.x+=l.kerning[c]),e.push({texture:l.texture,line:h,charCode:k,position:new d.Point(b.x+l.xOffset,b.y+l.yOffset)}),b.x+=l.xAdvance,c=k)}}g.push(b.x),f=Math.max(f,b.x);var m=[];for(j=0;h>=j;j++){var n=0;"right"===this.style.align?n=f-g[j]:"center"===this.style.align&&(n=(f-g[j])/2),m.push(n)}var o=this.children.length,p=e.length,q=this.tint||16777215;for(j=0;p>j;j++){var r=o>j?this.children[j]:this._pool.pop();r?r.setTexture(e[j].texture):r=new d.Sprite(e[j].texture),r.position.x=(e[j].position.x+m[e[j].line])*i,r.position.y=e[j].position.y*i,r.scale.x=r.scale.y=i,r.tint=q,r.parent||this.addChild(r)}for(;this.children.length>p;){var s=this.getChildAt(this.children.length-1);this._pool.push(s),this.removeChild(s)}this.textWidth=f*i,this.textHeight=(b.y+a.lineHeight)*i},d.BitmapText.prototype.updateTransform=function(){this.dirty&&(this.updateText(),this.dirty=!1),d.DisplayObjectContainer.prototype.updateTransform.call(this)},d.BitmapText.fonts={},d.InteractionData=function(){this.global=new d.Point,this.target=null,this.originalEvent=null},d.InteractionData.prototype.getLocalPosition=function(a){var b=a.worldTransform,c=this.global,e=b.a,f=b.b,g=b.tx,h=b.c,i=b.d,j=b.ty,k=1/(e*i+f*-h);return new d.Point(i*k*c.x+-f*k*c.y+(j*f-g*i)*k,e*k*c.y+-h*k*c.x+(-j*e+g*h)*k)},d.InteractionData.prototype.constructor=d.InteractionData,d.InteractionManager=function(a){this.stage=a,this.mouse=new d.InteractionData,this.touchs={},this.tempPoint=new d.Point,this.mouseoverEnabled=!0,this.pool=[],this.interactiveItems=[],this.interactionDOMElement=null,this.onMouseMove=this.onMouseMove.bind(this),this.onMouseDown=this.onMouseDown.bind(this),this.onMouseOut=this.onMouseOut.bind(this),this.onMouseUp=this.onMouseUp.bind(this),this.onTouchStart=this.onTouchStart.bind(this),this.onTouchEnd=this.onTouchEnd.bind(this),this.onTouchMove=this.onTouchMove.bind(this),this.last=0,this.currentCursorStyle="inherit",this.mouseOut=!1},d.InteractionManager.prototype.constructor=d.InteractionManager,d.InteractionManager.prototype.collectInteractiveSprite=function(a,b){for(var c=a.children,d=c.length,e=d-1;e>=0;e--){var f=c[e];f._interactive?(b.interactiveChildren=!0,this.interactiveItems.push(f),f.children.length>0&&this.collectInteractiveSprite(f,f)):(f.__iParent=null,f.children.length>0&&this.collectInteractiveSprite(f,b))}},d.InteractionManager.prototype.setTarget=function(a){this.target=a,null===this.interactionDOMElement&&this.setTargetDomElement(a.view)},d.InteractionManager.prototype.setTargetDomElement=function(a){this.removeEvents(),window.navigator.msPointerEnabled&&(a.style["-ms-content-zooming"]="none",a.style["-ms-touch-action"]="none"),this.interactionDOMElement=a,a.addEventListener("mousemove",this.onMouseMove,!0),a.addEventListener("mousedown",this.onMouseDown,!0),a.addEventListener("mouseout",this.onMouseOut,!0),a.addEventListener("touchstart",this.onTouchStart,!0),a.addEventListener("touchend",this.onTouchEnd,!0),a.addEventListener("touchmove",this.onTouchMove,!0),window.addEventListener("mouseup",this.onMouseUp,!0)},d.InteractionManager.prototype.removeEvents=function(){this.interactionDOMElement&&(this.interactionDOMElement.style["-ms-content-zooming"]="",this.interactionDOMElement.style["-ms-touch-action"]="",this.interactionDOMElement.removeEventListener("mousemove",this.onMouseMove,!0),this.interactionDOMElement.removeEventListener("mousedown",this.onMouseDown,!0),this.interactionDOMElement.removeEventListener("mouseout",this.onMouseOut,!0),this.interactionDOMElement.removeEventListener("touchstart",this.onTouchStart,!0),this.interactionDOMElement.removeEventListener("touchend",this.onTouchEnd,!0),this.interactionDOMElement.removeEventListener("touchmove",this.onTouchMove,!0),this.interactionDOMElement=null,window.removeEventListener("mouseup",this.onMouseUp,!0))},d.InteractionManager.prototype.update=function(){if(this.target){var a=Date.now(),b=a-this.last;if(b=b*d.INTERACTION_FREQUENCY/1e3,!(1>b)){this.last=a;var c=0;if(this.dirty){this.dirty=!1;var e=this.interactiveItems.length;for(c=0;e>c;c++)this.interactiveItems[c].interactiveChildren=!1;this.interactiveItems=[],this.stage.interactive&&this.interactiveItems.push(this.stage),this.collectInteractiveSprite(this.stage,this.stage)}var f=this.interactiveItems.length,g="inherit",h=!1;for(c=0;f>c;c++){var i=this.interactiveItems[c];i.__hit=this.hitTest(i,this.mouse),this.mouse.target=i,i.__hit&&!h?(i.buttonMode&&(g=i.defaultCursor),i.interactiveChildren||(h=!0),i.__isOver||(i.mouseover&&i.mouseover(this.mouse),i.__isOver=!0)):i.__isOver&&(i.mouseout&&i.mouseout(this.mouse),i.__isOver=!1)}this.currentCursorStyle!==g&&(this.currentCursorStyle=g,this.interactionDOMElement.style.cursor=g)}}},d.InteractionManager.prototype.onMouseMove=function(a){this.mouse.originalEvent=a||window.event;var b=this.interactionDOMElement.getBoundingClientRect();this.mouse.global.x=(a.clientX-b.left)*(this.target.width/b.width),this.mouse.global.y=(a.clientY-b.top)*(this.target.height/b.height);for(var c=this.interactiveItems.length,d=0;c>d;d++){var e=this.interactiveItems[d];e.mousemove&&e.mousemove(this.mouse)}},d.InteractionManager.prototype.onMouseDown=function(a){this.mouse.originalEvent=a||window.event,d.AUTO_PREVENT_DEFAULT&&this.mouse.originalEvent.preventDefault();for(var b=this.interactiveItems.length,c=0;b>c;c++){var e=this.interactiveItems[c];if((e.mousedown||e.click)&&(e.__mouseIsDown=!0,e.__hit=this.hitTest(e,this.mouse),e.__hit&&(e.mousedown&&e.mousedown(this.mouse),e.__isDown=!0,!e.interactiveChildren)))break}},d.InteractionManager.prototype.onMouseOut=function(){var a=this.interactiveItems.length;this.interactionDOMElement.style.cursor="inherit";for(var b=0;a>b;b++){var c=this.interactiveItems[b];c.__isOver&&(this.mouse.target=c,c.mouseout&&c.mouseout(this.mouse),c.__isOver=!1)}this.mouseOut=!0,this.mouse.global.x=-1e4,this.mouse.global.y=-1e4},d.InteractionManager.prototype.onMouseUp=function(a){this.mouse.originalEvent=a||window.event;for(var b=this.interactiveItems.length,c=!1,d=0;b>d;d++){var e=this.interactiveItems[d];e.__hit=this.hitTest(e,this.mouse),e.__hit&&!c?(e.mouseup&&e.mouseup(this.mouse),e.__isDown&&e.click&&e.click(this.mouse),e.interactiveChildren||(c=!0)):e.__isDown&&e.mouseupoutside&&e.mouseupoutside(this.mouse),e.__isDown=!1}},d.InteractionManager.prototype.hitTest=function(a,b){var c=b.global;if(!a.worldVisible)return!1;var e=a instanceof d.Sprite,f=a.worldTransform,g=f.a,h=f.b,i=f.tx,j=f.c,k=f.d,l=f.ty,m=1/(g*k+h*-j),n=k*m*c.x+-h*m*c.y+(l*h-i*k)*m,o=g*m*c.y+-j*m*c.x+(-l*g+i*j)*m;if(b.target=a,a.hitArea&&a.hitArea.contains)return a.hitArea.contains(n,o)?(b.target=a,!0):!1;if(e){var p,q=a.texture.frame.width,r=a.texture.frame.height,s=-q*a.anchor.x;if(n>s&&s+q>n&&(p=-r*a.anchor.y,o>p&&p+r>o))return b.target=a,!0}for(var t=a.children.length,u=0;t>u;u++){var v=a.children[u],w=this.hitTest(v,b);if(w)return b.target=a,!0}return!1},d.InteractionManager.prototype.onTouchMove=function(a){var b,c=this.interactionDOMElement.getBoundingClientRect(),d=a.changedTouches,e=0;for(e=0;e<d.length;e++){var f=d[e];b=this.touchs[f.identifier],b.originalEvent=a||window.event,b.global.x=(f.clientX-c.left)*(this.target.width/c.width),b.global.y=(f.clientY-c.top)*(this.target.height/c.height),navigator.isCocoonJS&&(b.global.x=f.clientX,b.global.y=f.clientY);for(var g=0;g<this.interactiveItems.length;g++){var h=this.interactiveItems[g];h.touchmove&&h.__touchData[f.identifier]&&h.touchmove(b)}}},d.InteractionManager.prototype.onTouchStart=function(a){var b=this.interactionDOMElement.getBoundingClientRect();d.AUTO_PREVENT_DEFAULT&&a.preventDefault();for(var c=a.changedTouches,e=0;e<c.length;e++){var f=c[e],g=this.pool.pop();g||(g=new d.InteractionData),g.originalEvent=a||window.event,this.touchs[f.identifier]=g,g.global.x=(f.clientX-b.left)*(this.target.width/b.width),g.global.y=(f.clientY-b.top)*(this.target.height/b.height),navigator.isCocoonJS&&(g.global.x=f.clientX,g.global.y=f.clientY);for(var h=this.interactiveItems.length,i=0;h>i;i++){var j=this.interactiveItems[i];
if((j.touchstart||j.tap)&&(j.__hit=this.hitTest(j,g),j.__hit&&(j.touchstart&&j.touchstart(g),j.__isDown=!0,j.__touchData=j.__touchData||{},j.__touchData[f.identifier]=g,!j.interactiveChildren)))break}}},d.InteractionManager.prototype.onTouchEnd=function(a){for(var b=this.interactionDOMElement.getBoundingClientRect(),c=a.changedTouches,d=0;d<c.length;d++){var e=c[d],f=this.touchs[e.identifier],g=!1;f.global.x=(e.clientX-b.left)*(this.target.width/b.width),f.global.y=(e.clientY-b.top)*(this.target.height/b.height),navigator.isCocoonJS&&(f.global.x=e.clientX,f.global.y=e.clientY);for(var h=this.interactiveItems.length,i=0;h>i;i++){var j=this.interactiveItems[i];j.__touchData&&j.__touchData[e.identifier]&&(j.__hit=this.hitTest(j,j.__touchData[e.identifier]),f.originalEvent=a||window.event,(j.touchend||j.tap)&&(j.__hit&&!g?(j.touchend&&j.touchend(f),j.__isDown&&j.tap&&j.tap(f),j.interactiveChildren||(g=!0)):j.__isDown&&j.touchendoutside&&j.touchendoutside(f),j.__isDown=!1),j.__touchData[e.identifier]=null)}this.pool.push(f),this.touchs[e.identifier]=null}},d.Stage=function(a){d.DisplayObjectContainer.call(this),this.worldTransform=new d.Matrix,this.interactive=!0,this.interactionManager=new d.InteractionManager(this),this.dirty=!0,this.stage=this,this.stage.hitArea=new d.Rectangle(0,0,1e5,1e5),this.setBackgroundColor(a)},d.Stage.prototype=Object.create(d.DisplayObjectContainer.prototype),d.Stage.prototype.constructor=d.Stage,d.Stage.prototype.setInteractionDelegate=function(a){this.interactionManager.setTargetDomElement(a)},d.Stage.prototype.updateTransform=function(){this.worldAlpha=1;for(var a=0,b=this.children.length;b>a;a++)this.children[a].updateTransform();this.dirty&&(this.dirty=!1,this.interactionManager.dirty=!0),this.interactive&&this.interactionManager.update()},d.Stage.prototype.setBackgroundColor=function(a){this.backgroundColor=a||0,this.backgroundColorSplit=d.hex2rgb(this.backgroundColor);var b=this.backgroundColor.toString(16);b="000000".substr(0,6-b.length)+b,this.backgroundColorString="#"+b},d.Stage.prototype.getMousePosition=function(){return this.interactionManager.mouse.global};for(var e=0,f=["ms","moz","webkit","o"],h=0;h<f.length&&!window.requestAnimationFrame;++h)window.requestAnimationFrame=window[f[h]+"RequestAnimationFrame"],window.cancelAnimationFrame=window[f[h]+"CancelAnimationFrame"]||window[f[h]+"CancelRequestAnimationFrame"];window.requestAnimationFrame||(window.requestAnimationFrame=function(a){var b=(new Date).getTime(),c=Math.max(0,16-(b-e)),d=window.setTimeout(function(){a(b+c)},c);return e=b+c,d}),window.cancelAnimationFrame||(window.cancelAnimationFrame=function(a){clearTimeout(a)}),window.requestAnimFrame=window.requestAnimationFrame,d.hex2rgb=function(a){return[(a>>16&255)/255,(a>>8&255)/255,(255&a)/255]},d.rgb2hex=function(a){return(255*a[0]<<16)+(255*a[1]<<8)+255*a[2]},"function"!=typeof Function.prototype.bind&&(Function.prototype.bind=function(){var a=Array.prototype.slice;return function(b){function c(){var f=e.concat(a.call(arguments));d.apply(this instanceof c?this:b,f)}var d=this,e=a.call(arguments,1);if("function"!=typeof d)throw new TypeError;return c.prototype=function f(a){return a&&(f.prototype=a),this instanceof f?void 0:new f}(d.prototype),c}}()),d.AjaxRequest=function(){var a=["Msxml2.XMLHTTP.6.0","Msxml2.XMLHTTP.3.0","Microsoft.XMLHTTP"];if(!window.ActiveXObject)return window.XMLHttpRequest?new window.XMLHttpRequest:!1;for(var b=0;b<a.length;b++)try{return new window.ActiveXObject(a[b])}catch(c){}},d.canUseNewCanvasBlendModes=function(){var a=document.createElement("canvas");a.width=1,a.height=1;var b=a.getContext("2d");return b.fillStyle="#000",b.fillRect(0,0,1,1),b.globalCompositeOperation="multiply",b.fillStyle="#fff",b.fillRect(0,0,1,1),0===b.getImageData(0,0,1,1).data[0]},d.getNextPowerOfTwo=function(a){if(a>0&&0===(a&a-1))return a;for(var b=1;a>b;)b<<=1;return b},d.EventTarget=function(){var a={};this.addEventListener=this.on=function(b,c){void 0===a[b]&&(a[b]=[]),-1===a[b].indexOf(c)&&a[b].push(c)},this.dispatchEvent=this.emit=function(b){if(a[b.type]&&a[b.type].length)for(var c=0,d=a[b.type].length;d>c;c++)a[b.type][c](b)},this.removeEventListener=this.off=function(b,c){var d=a[b].indexOf(c);-1!==d&&a[b].splice(d,1)},this.removeAllEventListeners=function(b){var c=a[b];c&&(c.length=0)}},d.autoDetectRenderer=function(a,b,c,e,f){a||(a=800),b||(b=600);var g=function(){try{var a=document.createElement("canvas");return!!window.WebGLRenderingContext&&(a.getContext("webgl")||a.getContext("experimental-webgl"))}catch(b){return!1}}();return g?new d.WebGLRenderer(a,b,c,e,f):new d.CanvasRenderer(a,b,c,e)},d.autoDetectRecommendedRenderer=function(a,b,c,e,f){a||(a=800),b||(b=600);var g=function(){try{var a=document.createElement("canvas");return!!window.WebGLRenderingContext&&(a.getContext("webgl")||a.getContext("experimental-webgl"))}catch(b){return!1}}(),h=/Android/i.test(navigator.userAgent);return g&&!h?new d.WebGLRenderer(a,b,c,e,f):new d.CanvasRenderer(a,b,c,e)},d.PolyK={},d.PolyK.Triangulate=function(a){var b=!0,c=a.length>>1;if(3>c)return[];for(var e=[],f=[],g=0;c>g;g++)f.push(g);g=0;for(var h=c;h>3;){var i=f[(g+0)%h],j=f[(g+1)%h],k=f[(g+2)%h],l=a[2*i],m=a[2*i+1],n=a[2*j],o=a[2*j+1],p=a[2*k],q=a[2*k+1],r=!1;if(d.PolyK._convex(l,m,n,o,p,q,b)){r=!0;for(var s=0;h>s;s++){var t=f[s];if(t!==i&&t!==j&&t!==k&&d.PolyK._PointInTriangle(a[2*t],a[2*t+1],l,m,n,o,p,q)){r=!1;break}}}if(r)e.push(i,j,k),f.splice((g+1)%h,1),h--,g=0;else if(g++>3*h){if(!b)return window.console.log("PIXI Warning: shape too complex to fill"),[];for(e=[],f=[],g=0;c>g;g++)f.push(g);g=0,h=c,b=!1}}return e.push(f[0],f[1],f[2]),e},d.PolyK._PointInTriangle=function(a,b,c,d,e,f,g,h){var i=g-c,j=h-d,k=e-c,l=f-d,m=a-c,n=b-d,o=i*i+j*j,p=i*k+j*l,q=i*m+j*n,r=k*k+l*l,s=k*m+l*n,t=1/(o*r-p*p),u=(r*q-p*s)*t,v=(o*s-p*q)*t;return u>=0&&v>=0&&1>u+v},d.PolyK._convex=function(a,b,c,d,e,f,g){return(b-d)*(e-c)+(c-a)*(f-d)>=0===g},d.initDefaultShaders=function(){},d.CompileVertexShader=function(a,b){return d._CompileShader(a,b,a.VERTEX_SHADER)},d.CompileFragmentShader=function(a,b){return d._CompileShader(a,b,a.FRAGMENT_SHADER)},d._CompileShader=function(a,b,c){var d=b.join("\n"),e=a.createShader(c);return a.shaderSource(e,d),a.compileShader(e),a.getShaderParameter(e,a.COMPILE_STATUS)?e:(window.console.log(a.getShaderInfoLog(e)),null)},d.compileProgram=function(a,b,c){var e=d.CompileFragmentShader(a,c),f=d.CompileVertexShader(a,b),g=a.createProgram();return a.attachShader(g,f),a.attachShader(g,e),a.linkProgram(g),a.getProgramParameter(g,a.LINK_STATUS)||window.console.log("Could not initialise shaders"),g},d.PixiShader=function(a){this.gl=a,this.program=null,this.fragmentSrc=["precision lowp float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform sampler2D uSampler;","void main(void) {","   gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor ;","}"],this.textureCount=0,this.attributes=[],this.init()},d.PixiShader.prototype.init=function(){var a=this.gl,b=d.compileProgram(a,this.vertexSrc||d.PixiShader.defaultVertexSrc,this.fragmentSrc);a.useProgram(b),this.uSampler=a.getUniformLocation(b,"uSampler"),this.projectionVector=a.getUniformLocation(b,"projectionVector"),this.offsetVector=a.getUniformLocation(b,"offsetVector"),this.dimensions=a.getUniformLocation(b,"dimensions"),this.aVertexPosition=a.getAttribLocation(b,"aVertexPosition"),this.aTextureCoord=a.getAttribLocation(b,"aTextureCoord"),this.colorAttribute=a.getAttribLocation(b,"aColor"),-1===this.colorAttribute&&(this.colorAttribute=2),this.attributes=[this.aVertexPosition,this.aTextureCoord,this.colorAttribute];for(var c in this.uniforms)this.uniforms[c].uniformLocation=a.getUniformLocation(b,c);this.initUniforms(),this.program=b},d.PixiShader.prototype.initUniforms=function(){this.textureCount=1;var a,b=this.gl;for(var c in this.uniforms){a=this.uniforms[c];var d=a.type;"sampler2D"===d?(a._init=!1,null!==a.value&&this.initSampler2D(a)):"mat2"===d||"mat3"===d||"mat4"===d?(a.glMatrix=!0,a.glValueLength=1,"mat2"===d?a.glFunc=b.uniformMatrix2fv:"mat3"===d?a.glFunc=b.uniformMatrix3fv:"mat4"===d&&(a.glFunc=b.uniformMatrix4fv)):(a.glFunc=b["uniform"+d],a.glValueLength="2f"===d||"2i"===d?2:"3f"===d||"3i"===d?3:"4f"===d||"4i"===d?4:1)}},d.PixiShader.prototype.initSampler2D=function(a){if(a.value&&a.value.baseTexture&&a.value.baseTexture.hasLoaded){var b=this.gl;if(b.activeTexture(b["TEXTURE"+this.textureCount]),b.bindTexture(b.TEXTURE_2D,a.value.baseTexture._glTextures[b.id]),a.textureData){var c=a.textureData,d=c.magFilter?c.magFilter:b.LINEAR,e=c.minFilter?c.minFilter:b.LINEAR,f=c.wrapS?c.wrapS:b.CLAMP_TO_EDGE,g=c.wrapT?c.wrapT:b.CLAMP_TO_EDGE,h=c.luminance?b.LUMINANCE:b.RGBA;if(c.repeat&&(f=b.REPEAT,g=b.REPEAT),b.pixelStorei(b.UNPACK_FLIP_Y_WEBGL,!!c.flipY),c.width){var i=c.width?c.width:512,j=c.height?c.height:2,k=c.border?c.border:0;b.texImage2D(b.TEXTURE_2D,0,h,i,j,k,h,b.UNSIGNED_BYTE,null)}else b.texImage2D(b.TEXTURE_2D,0,h,b.RGBA,b.UNSIGNED_BYTE,a.value.baseTexture.source);b.texParameteri(b.TEXTURE_2D,b.TEXTURE_MAG_FILTER,d),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_MIN_FILTER,e),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_S,f),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_T,g)}b.uniform1i(a.uniformLocation,this.textureCount),a._init=!0,this.textureCount++}},d.PixiShader.prototype.syncUniforms=function(){this.textureCount=1;var a,b=this.gl;for(var c in this.uniforms)a=this.uniforms[c],1===a.glValueLength?a.glMatrix===!0?a.glFunc.call(b,a.uniformLocation,a.transpose,a.value):a.glFunc.call(b,a.uniformLocation,a.value):2===a.glValueLength?a.glFunc.call(b,a.uniformLocation,a.value.x,a.value.y):3===a.glValueLength?a.glFunc.call(b,a.uniformLocation,a.value.x,a.value.y,a.value.z):4===a.glValueLength?a.glFunc.call(b,a.uniformLocation,a.value.x,a.value.y,a.value.z,a.value.w):"sampler2D"===a.type&&(a._init?(b.activeTexture(b["TEXTURE"+this.textureCount]),b.bindTexture(b.TEXTURE_2D,a.value.baseTexture._glTextures[b.id]||d.createWebGLTexture(a.value.baseTexture,b)),b.uniform1i(a.uniformLocation,this.textureCount),this.textureCount++):this.initSampler2D(a))},d.PixiShader.prototype.destroy=function(){this.gl.deleteProgram(this.program),this.uniforms=null,this.gl=null,this.attributes=null},d.PixiShader.defaultVertexSrc=["attribute vec2 aVertexPosition;","attribute vec2 aTextureCoord;","attribute vec2 aColor;","uniform vec2 projectionVector;","uniform vec2 offsetVector;","varying vec2 vTextureCoord;","varying vec4 vColor;","const vec2 center = vec2(-1.0, 1.0);","void main(void) {","   gl_Position = vec4( ((aVertexPosition + offsetVector) / projectionVector) + center , 0.0, 1.0);","   vTextureCoord = aTextureCoord;","   vec3 color = mod(vec3(aColor.y/65536.0, aColor.y/256.0, aColor.y), 256.0) / 256.0;","   vColor = vec4(color * aColor.x, aColor.x);","}"],d.PixiFastShader=function(a){this.gl=a,this.program=null,this.fragmentSrc=["precision lowp float;","varying vec2 vTextureCoord;","varying float vColor;","uniform sampler2D uSampler;","void main(void) {","   gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor ;","}"],this.vertexSrc=["attribute vec2 aVertexPosition;","attribute vec2 aPositionCoord;","attribute vec2 aScale;","attribute float aRotation;","attribute vec2 aTextureCoord;","attribute float aColor;","uniform vec2 projectionVector;","uniform vec2 offsetVector;","uniform mat3 uMatrix;","varying vec2 vTextureCoord;","varying float vColor;","const vec2 center = vec2(-1.0, 1.0);","void main(void) {","   vec2 v;","   vec2 sv = aVertexPosition * aScale;","   v.x = (sv.x) * cos(aRotation) - (sv.y) * sin(aRotation);","   v.y = (sv.x) * sin(aRotation) + (sv.y) * cos(aRotation);","   v = ( uMatrix * vec3(v + aPositionCoord , 1.0) ).xy ;","   gl_Position = vec4( ( v / projectionVector) + center , 0.0, 1.0);","   vTextureCoord = aTextureCoord;","   vColor = aColor;","}"],this.textureCount=0,this.init()},d.PixiFastShader.prototype.init=function(){var a=this.gl,b=d.compileProgram(a,this.vertexSrc,this.fragmentSrc);a.useProgram(b),this.uSampler=a.getUniformLocation(b,"uSampler"),this.projectionVector=a.getUniformLocation(b,"projectionVector"),this.offsetVector=a.getUniformLocation(b,"offsetVector"),this.dimensions=a.getUniformLocation(b,"dimensions"),this.uMatrix=a.getUniformLocation(b,"uMatrix"),this.aVertexPosition=a.getAttribLocation(b,"aVertexPosition"),this.aPositionCoord=a.getAttribLocation(b,"aPositionCoord"),this.aScale=a.getAttribLocation(b,"aScale"),this.aRotation=a.getAttribLocation(b,"aRotation"),this.aTextureCoord=a.getAttribLocation(b,"aTextureCoord"),this.colorAttribute=a.getAttribLocation(b,"aColor"),-1===this.colorAttribute&&(this.colorAttribute=2),this.attributes=[this.aVertexPosition,this.aPositionCoord,this.aScale,this.aRotation,this.aTextureCoord,this.colorAttribute],this.program=b},d.PixiFastShader.prototype.destroy=function(){this.gl.deleteProgram(this.program),this.uniforms=null,this.gl=null,this.attributes=null},d.StripShader=function(){this.program=null,this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying float vColor;","uniform float alpha;","uniform sampler2D uSampler;","void main(void) {","   gl_FragColor = texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y));","   gl_FragColor = gl_FragColor * alpha;","}"],this.vertexSrc=["attribute vec2 aVertexPosition;","attribute vec2 aTextureCoord;","attribute float aColor;","uniform mat3 translationMatrix;","uniform vec2 projectionVector;","varying vec2 vTextureCoord;","uniform vec2 offsetVector;","varying float vColor;","void main(void) {","   vec3 v = translationMatrix * vec3(aVertexPosition, 1.0);","   v -= offsetVector.xyx;","   gl_Position = vec4( v.x / projectionVector.x -1.0, v.y / projectionVector.y + 1.0 , 0.0, 1.0);","   vTextureCoord = aTextureCoord;","   vColor = aColor;","}"]},d.StripShader.prototype.init=function(){var a=d.gl,b=d.compileProgram(a,this.vertexSrc,this.fragmentSrc);a.useProgram(b),this.uSampler=a.getUniformLocation(b,"uSampler"),this.projectionVector=a.getUniformLocation(b,"projectionVector"),this.offsetVector=a.getUniformLocation(b,"offsetVector"),this.colorAttribute=a.getAttribLocation(b,"aColor"),this.aVertexPosition=a.getAttribLocation(b,"aVertexPosition"),this.aTextureCoord=a.getAttribLocation(b,"aTextureCoord"),this.translationMatrix=a.getUniformLocation(b,"translationMatrix"),this.alpha=a.getUniformLocation(b,"alpha"),this.program=b},d.PrimitiveShader=function(a){this.gl=a,this.program=null,this.fragmentSrc=["precision mediump float;","varying vec4 vColor;","void main(void) {","   gl_FragColor = vColor;","}"],this.vertexSrc=["attribute vec2 aVertexPosition;","attribute vec4 aColor;","uniform mat3 translationMatrix;","uniform vec2 projectionVector;","uniform vec2 offsetVector;","uniform float alpha;","uniform vec3 tint;","varying vec4 vColor;","void main(void) {","   vec3 v = translationMatrix * vec3(aVertexPosition , 1.0);","   v -= offsetVector.xyx;","   gl_Position = vec4( v.x / projectionVector.x -1.0, v.y / -projectionVector.y + 1.0 , 0.0, 1.0);","   vColor = aColor * vec4(tint * alpha, alpha);","}"],this.init()},d.PrimitiveShader.prototype.init=function(){var a=this.gl,b=d.compileProgram(a,this.vertexSrc,this.fragmentSrc);a.useProgram(b),this.projectionVector=a.getUniformLocation(b,"projectionVector"),this.offsetVector=a.getUniformLocation(b,"offsetVector"),this.tintColor=a.getUniformLocation(b,"tint"),this.aVertexPosition=a.getAttribLocation(b,"aVertexPosition"),this.colorAttribute=a.getAttribLocation(b,"aColor"),this.attributes=[this.aVertexPosition,this.colorAttribute],this.translationMatrix=a.getUniformLocation(b,"translationMatrix"),this.alpha=a.getUniformLocation(b,"alpha"),this.program=b},d.PrimitiveShader.prototype.destroy=function(){this.gl.deleteProgram(this.program),this.uniforms=null,this.gl=null,this.attribute=null},d.WebGLGraphics=function(){},d.WebGLGraphics.renderGraphics=function(a,b){var c=b.gl,e=b.projection,f=b.offset,g=b.shaderManager.primitiveShader;a._webGL[c.id]||(a._webGL[c.id]={points:[],indices:[],lastIndex:0,buffer:c.createBuffer(),indexBuffer:c.createBuffer()});var h=a._webGL[c.id];a.dirty&&(a.dirty=!1,a.clearDirty&&(a.clearDirty=!1,h.lastIndex=0,h.points=[],h.indices=[]),d.WebGLGraphics.updateGraphics(a,c)),b.shaderManager.activatePrimitiveShader(),c.blendFunc(c.ONE,c.ONE_MINUS_SRC_ALPHA),c.uniformMatrix3fv(g.translationMatrix,!1,a.worldTransform.toArray(!0)),c.uniform2f(g.projectionVector,e.x,-e.y),c.uniform2f(g.offsetVector,-f.x,-f.y),c.uniform3fv(g.tintColor,d.hex2rgb(a.tint)),c.uniform1f(g.alpha,a.worldAlpha),c.bindBuffer(c.ARRAY_BUFFER,h.buffer),c.vertexAttribPointer(g.aVertexPosition,2,c.FLOAT,!1,24,0),c.vertexAttribPointer(g.colorAttribute,4,c.FLOAT,!1,24,8),c.bindBuffer(c.ELEMENT_ARRAY_BUFFER,h.indexBuffer),c.drawElements(c.TRIANGLE_STRIP,h.indices.length,c.UNSIGNED_SHORT,0),b.shaderManager.deactivatePrimitiveShader()},d.WebGLGraphics.updateGraphics=function(a,b){for(var c=a._webGL[b.id],e=c.lastIndex;e<a.graphicsData.length;e++){var f=a.graphicsData[e];f.type===d.Graphics.POLY?(f.fill&&f.points.length>3&&d.WebGLGraphics.buildPoly(f,c),f.lineWidth>0&&d.WebGLGraphics.buildLine(f,c)):f.type===d.Graphics.RECT?d.WebGLGraphics.buildRectangle(f,c):(f.type===d.Graphics.CIRC||f.type===d.Graphics.ELIP)&&d.WebGLGraphics.buildCircle(f,c)}c.lastIndex=a.graphicsData.length,c.glPoints=new Float32Array(c.points),b.bindBuffer(b.ARRAY_BUFFER,c.buffer),b.bufferData(b.ARRAY_BUFFER,c.glPoints,b.STATIC_DRAW),c.glIndicies=new Uint16Array(c.indices),b.bindBuffer(b.ELEMENT_ARRAY_BUFFER,c.indexBuffer),b.bufferData(b.ELEMENT_ARRAY_BUFFER,c.glIndicies,b.STATIC_DRAW)},d.WebGLGraphics.buildRectangle=function(a,b){var c=a.points,e=c[0],f=c[1],g=c[2],h=c[3];if(a.fill){var i=d.hex2rgb(a.fillColor),j=a.fillAlpha,k=i[0]*j,l=i[1]*j,m=i[2]*j,n=b.points,o=b.indices,p=n.length/6;n.push(e,f),n.push(k,l,m,j),n.push(e+g,f),n.push(k,l,m,j),n.push(e,f+h),n.push(k,l,m,j),n.push(e+g,f+h),n.push(k,l,m,j),o.push(p,p,p+1,p+2,p+3,p+3)}if(a.lineWidth){var q=a.points;a.points=[e,f,e+g,f,e+g,f+h,e,f+h,e,f],d.WebGLGraphics.buildLine(a,b),a.points=q}},d.WebGLGraphics.buildCircle=function(a,b){var c=a.points,e=c[0],f=c[1],g=c[2],h=c[3],i=40,j=2*Math.PI/i,k=0;if(a.fill){var l=d.hex2rgb(a.fillColor),m=a.fillAlpha,n=l[0]*m,o=l[1]*m,p=l[2]*m,q=b.points,r=b.indices,s=q.length/6;for(r.push(s),k=0;i+1>k;k++)q.push(e,f,n,o,p,m),q.push(e+Math.sin(j*k)*g,f+Math.cos(j*k)*h,n,o,p,m),r.push(s++,s++);r.push(s-1)}if(a.lineWidth){var t=a.points;for(a.points=[],k=0;i+1>k;k++)a.points.push(e+Math.sin(j*k)*g,f+Math.cos(j*k)*h);d.WebGLGraphics.buildLine(a,b),a.points=t}},d.WebGLGraphics.buildLine=function(a,b){var c=0,e=a.points;if(0!==e.length){if(a.lineWidth%2)for(c=0;c<e.length;c++)e[c]+=.5;var f=new d.Point(e[0],e[1]),g=new d.Point(e[e.length-2],e[e.length-1]);if(f.x===g.x&&f.y===g.y){e.pop(),e.pop(),g=new d.Point(e[e.length-2],e[e.length-1]);var h=g.x+.5*(f.x-g.x),i=g.y+.5*(f.y-g.y);e.unshift(h,i),e.push(h,i)}var j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B,C,D,E,F,G=b.points,H=b.indices,I=e.length/2,J=e.length,K=G.length/6,L=a.lineWidth/2,M=d.hex2rgb(a.lineColor),N=a.lineAlpha,O=M[0]*N,P=M[1]*N,Q=M[2]*N;for(l=e[0],m=e[1],n=e[2],o=e[3],r=-(m-o),s=l-n,F=Math.sqrt(r*r+s*s),r/=F,s/=F,r*=L,s*=L,G.push(l-r,m-s,O,P,Q,N),G.push(l+r,m+s,O,P,Q,N),c=1;I-1>c;c++)l=e[2*(c-1)],m=e[2*(c-1)+1],n=e[2*c],o=e[2*c+1],p=e[2*(c+1)],q=e[2*(c+1)+1],r=-(m-o),s=l-n,F=Math.sqrt(r*r+s*s),r/=F,s/=F,r*=L,s*=L,t=-(o-q),u=n-p,F=Math.sqrt(t*t+u*u),t/=F,u/=F,t*=L,u*=L,x=-s+m-(-s+o),y=-r+n-(-r+l),z=(-r+l)*(-s+o)-(-r+n)*(-s+m),A=-u+q-(-u+o),B=-t+n-(-t+p),C=(-t+p)*(-u+o)-(-t+n)*(-u+q),D=x*B-A*y,Math.abs(D)<.1?(D+=10.1,G.push(n-r,o-s,O,P,Q,N),G.push(n+r,o+s,O,P,Q,N)):(j=(y*C-B*z)/D,k=(A*z-x*C)/D,E=(j-n)*(j-n)+(k-o)+(k-o),E>19600?(v=r-t,w=s-u,F=Math.sqrt(v*v+w*w),v/=F,w/=F,v*=L,w*=L,G.push(n-v,o-w),G.push(O,P,Q,N),G.push(n+v,o+w),G.push(O,P,Q,N),G.push(n-v,o-w),G.push(O,P,Q,N),J++):(G.push(j,k),G.push(O,P,Q,N),G.push(n-(j-n),o-(k-o)),G.push(O,P,Q,N)));for(l=e[2*(I-2)],m=e[2*(I-2)+1],n=e[2*(I-1)],o=e[2*(I-1)+1],r=-(m-o),s=l-n,F=Math.sqrt(r*r+s*s),r/=F,s/=F,r*=L,s*=L,G.push(n-r,o-s),G.push(O,P,Q,N),G.push(n+r,o+s),G.push(O,P,Q,N),H.push(K),c=0;J>c;c++)H.push(K++);H.push(K-1)}},d.WebGLGraphics.buildPoly=function(a,b){var c=a.points;if(!(c.length<6)){var e=b.points,f=b.indices,g=c.length/2,h=d.hex2rgb(a.fillColor),i=a.fillAlpha,j=h[0]*i,k=h[1]*i,l=h[2]*i,m=d.PolyK.Triangulate(c),n=e.length/6,o=0;for(o=0;o<m.length;o+=3)f.push(m[o]+n),f.push(m[o]+n),f.push(m[o+1]+n),f.push(m[o+2]+n),f.push(m[o+2]+n);for(o=0;g>o;o++)e.push(c[2*o],c[2*o+1],j,k,l,i)}},d.glContexts=[],d.WebGLRenderer=function(a,b,c,e,f){d.defaultRenderer||(d.defaultRenderer=this),this.type=d.WEBGL_RENDERER,this.transparent=!!e,this.width=a||800,this.height=b||600,this.view=c||document.createElement("canvas"),this.view.width=this.width,this.view.height=this.height,this.contextLost=this.handleContextLost.bind(this),this.contextRestoredLost=this.handleContextRestored.bind(this),this.view.addEventListener("webglcontextlost",this.contextLost,!1),this.view.addEventListener("webglcontextrestored",this.contextRestoredLost,!1),this.options={alpha:this.transparent,antialias:!!f,premultipliedAlpha:!!e,stencil:!0};try{this.gl=this.view.getContext("experimental-webgl",this.options)}catch(g){try{this.gl=this.view.getContext("webgl",this.options)}catch(h){throw new Error(" This browser does not support webGL. Try using the canvas renderer"+this)}}var i=this.gl;this.glContextId=i.id=d.WebGLRenderer.glContextId++,d.glContexts[this.glContextId]=i,d.blendModesWebGL||(d.blendModesWebGL=[],d.blendModesWebGL[d.blendModes.NORMAL]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.ADD]=[i.SRC_ALPHA,i.DST_ALPHA],d.blendModesWebGL[d.blendModes.MULTIPLY]=[i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.SCREEN]=[i.SRC_ALPHA,i.ONE],d.blendModesWebGL[d.blendModes.OVERLAY]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.DARKEN]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.LIGHTEN]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.COLOR_DODGE]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.COLOR_BURN]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.HARD_LIGHT]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.SOFT_LIGHT]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.DIFFERENCE]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.EXCLUSION]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.HUE]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.SATURATION]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.COLOR]=[i.ONE,i.ONE_MINUS_SRC_ALPHA],d.blendModesWebGL[d.blendModes.LUMINOSITY]=[i.ONE,i.ONE_MINUS_SRC_ALPHA]),this.projection=new d.Point,this.projection.x=this.width/2,this.projection.y=-this.height/2,this.offset=new d.Point(0,0),this.resize(this.width,this.height),this.contextLost=!1,this.shaderManager=new d.WebGLShaderManager(i),this.spriteBatch=new d.WebGLSpriteBatch(i),this.maskManager=new d.WebGLMaskManager(i),this.filterManager=new d.WebGLFilterManager(i,this.transparent),this.renderSession={},this.renderSession.gl=this.gl,this.renderSession.drawCount=0,this.renderSession.shaderManager=this.shaderManager,this.renderSession.maskManager=this.maskManager,this.renderSession.filterManager=this.filterManager,this.renderSession.spriteBatch=this.spriteBatch,this.renderSession.renderer=this,i.useProgram(this.shaderManager.defaultShader.program),i.disable(i.DEPTH_TEST),i.disable(i.CULL_FACE),i.enable(i.BLEND),i.colorMask(!0,!0,!0,this.transparent)},d.WebGLRenderer.prototype.constructor=d.WebGLRenderer,d.WebGLRenderer.prototype.render=function(a){if(!this.contextLost){this.__stage!==a&&(a.interactive&&a.interactionManager.removeEvents(),this.__stage=a),d.WebGLRenderer.updateTextures(),a.updateTransform(),a._interactive&&(a._interactiveEventsAdded||(a._interactiveEventsAdded=!0,a.interactionManager.setTarget(this)));var b=this.gl;b.viewport(0,0,this.width,this.height),b.bindFramebuffer(b.FRAMEBUFFER,null),this.transparent?b.clearColor(0,0,0,0):b.clearColor(a.backgroundColorSplit[0],a.backgroundColorSplit[1],a.backgroundColorSplit[2],1),b.clear(b.COLOR_BUFFER_BIT),this.renderDisplayObject(a,this.projection),a.interactive?a._interactiveEventsAdded||(a._interactiveEventsAdded=!0,a.interactionManager.setTarget(this)):a._interactiveEventsAdded&&(a._interactiveEventsAdded=!1,a.interactionManager.setTarget(this))}},d.WebGLRenderer.prototype.renderDisplayObject=function(a,b,c){this.renderSession.drawCount=0,this.renderSession.currentBlendMode=9999,this.renderSession.projection=b,this.renderSession.offset=this.offset,this.spriteBatch.begin(this.renderSession),this.filterManager.begin(this.renderSession,c),a._renderWebGL(this.renderSession),this.spriteBatch.end()},d.WebGLRenderer.updateTextures=function(){var a=0;for(a=0;a<d.Texture.frameUpdates.length;a++)d.WebGLRenderer.updateTextureFrame(d.Texture.frameUpdates[a]);for(a=0;a<d.texturesToDestroy.length;a++)d.WebGLRenderer.destroyTexture(d.texturesToDestroy[a]);d.texturesToUpdate.length=0,d.texturesToDestroy.length=0,d.Texture.frameUpdates.length=0},d.WebGLRenderer.destroyTexture=function(a){for(var b=a._glTextures.length-1;b>=0;b--){var c=a._glTextures[b],e=d.glContexts[b];e&&c&&e.deleteTexture(c)}a._glTextures.length=0},d.WebGLRenderer.updateTextureFrame=function(a){a.updateFrame=!1,a._updateWebGLuvs()},d.WebGLRenderer.prototype.resize=function(a,b){this.width=a,this.height=b,this.view.width=a,this.view.height=b,this.gl.viewport(0,0,this.width,this.height),this.projection.x=this.width/2,this.projection.y=-this.height/2},d.createWebGLTexture=function(a,b){return a.hasLoaded&&(a._glTextures[b.id]=b.createTexture(),b.bindTexture(b.TEXTURE_2D,a._glTextures[b.id]),b.pixelStorei(b.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),b.texImage2D(b.TEXTURE_2D,0,b.RGBA,b.RGBA,b.UNSIGNED_BYTE,a.source),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_MAG_FILTER,a.scaleMode===d.scaleModes.LINEAR?b.LINEAR:b.NEAREST),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_MIN_FILTER,a.scaleMode===d.scaleModes.LINEAR?b.LINEAR:b.NEAREST),a._powerOf2?(b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_S,b.REPEAT),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_T,b.REPEAT)):(b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_S,b.CLAMP_TO_EDGE),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_T,b.CLAMP_TO_EDGE)),b.bindTexture(b.TEXTURE_2D,null)),a._glTextures[b.id]},d.updateWebGLTexture=function(a,b){a._glTextures[b.id]&&(b.bindTexture(b.TEXTURE_2D,a._glTextures[b.id]),b.pixelStorei(b.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),b.texImage2D(b.TEXTURE_2D,0,b.RGBA,b.RGBA,b.UNSIGNED_BYTE,a.source),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_MAG_FILTER,a.scaleMode===d.scaleModes.LINEAR?b.LINEAR:b.NEAREST),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_MIN_FILTER,a.scaleMode===d.scaleModes.LINEAR?b.LINEAR:b.NEAREST),a._powerOf2?(b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_S,b.REPEAT),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_T,b.REPEAT)):(b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_S,b.CLAMP_TO_EDGE),b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_T,b.CLAMP_TO_EDGE)),b.bindTexture(b.TEXTURE_2D,null))},d.WebGLRenderer.prototype.handleContextLost=function(a){a.preventDefault(),this.contextLost=!0},d.WebGLRenderer.prototype.handleContextRestored=function(){try{this.gl=this.view.getContext("experimental-webgl",this.options)}catch(a){try{this.gl=this.view.getContext("webgl",this.options)}catch(b){throw new Error(" This browser does not support webGL. Try using the canvas renderer"+this)}}var c=this.gl;c.id=d.WebGLRenderer.glContextId++,this.shaderManager.setContext(c),this.spriteBatch.setContext(c),this.maskManager.setContext(c),this.filterManager.setContext(c),this.renderSession.gl=this.gl,c.disable(c.DEPTH_TEST),c.disable(c.CULL_FACE),c.enable(c.BLEND),c.colorMask(!0,!0,!0,this.transparent),this.gl.viewport(0,0,this.width,this.height);for(var e in d.TextureCache){var f=d.TextureCache[e].baseTexture;f._glTextures=[]}this.contextLost=!1},d.WebGLRenderer.prototype.destroy=function(){this.view.removeEventListener("webglcontextlost",this.contextLost),this.view.removeEventListener("webglcontextrestored",this.contextRestoredLost),d.glContexts[this.glContextId]=null,this.projection=null,this.offset=null,this.shaderManager.destroy(),this.spriteBatch.destroy(),this.maskManager.destroy(),this.filterManager.destroy(),this.shaderManager=null,this.spriteBatch=null,this.maskManager=null,this.filterManager=null,this.gl=null,this.renderSession=null},d.WebGLRenderer.glContextId=0,d.WebGLMaskManager=function(a){this.maskStack=[],this.maskPosition=0,this.setContext(a)},d.WebGLMaskManager.prototype.setContext=function(a){this.gl=a},d.WebGLMaskManager.prototype.pushMask=function(a,b){var c=this.gl;0===this.maskStack.length&&(c.enable(c.STENCIL_TEST),c.stencilFunc(c.ALWAYS,1,1)),this.maskStack.push(a),c.colorMask(!1,!1,!1,!1),c.stencilOp(c.KEEP,c.KEEP,c.INCR),d.WebGLGraphics.renderGraphics(a,b),c.colorMask(!0,!0,!0,!0),c.stencilFunc(c.NOTEQUAL,0,this.maskStack.length),c.stencilOp(c.KEEP,c.KEEP,c.KEEP)},d.WebGLMaskManager.prototype.popMask=function(a){var b=this.gl,c=this.maskStack.pop();c&&(b.colorMask(!1,!1,!1,!1),b.stencilOp(b.KEEP,b.KEEP,b.DECR),d.WebGLGraphics.renderGraphics(c,a),b.colorMask(!0,!0,!0,!0),b.stencilFunc(b.NOTEQUAL,0,this.maskStack.length),b.stencilOp(b.KEEP,b.KEEP,b.KEEP)),0===this.maskStack.length&&b.disable(b.STENCIL_TEST)},d.WebGLMaskManager.prototype.destroy=function(){this.maskStack=null,this.gl=null},d.WebGLShaderManager=function(a){this.maxAttibs=10,this.attribState=[],this.tempAttribState=[];for(var b=0;b<this.maxAttibs;b++)this.attribState[b]=!1;this.setContext(a)},d.WebGLShaderManager.prototype.setContext=function(a){this.gl=a,this.primitiveShader=new d.PrimitiveShader(a),this.defaultShader=new d.PixiShader(a),this.fastShader=new d.PixiFastShader(a),this.activateShader(this.defaultShader)},d.WebGLShaderManager.prototype.setAttribs=function(a){var b;for(b=0;b<this.tempAttribState.length;b++)this.tempAttribState[b]=!1;for(b=0;b<a.length;b++){var c=a[b];this.tempAttribState[c]=!0}var d=this.gl;for(b=0;b<this.attribState.length;b++)this.attribState[b]!==this.tempAttribState[b]&&(this.attribState[b]=this.tempAttribState[b],this.tempAttribState[b]?d.enableVertexAttribArray(b):d.disableVertexAttribArray(b))},d.WebGLShaderManager.prototype.activateShader=function(a){this.currentShader=a,this.gl.useProgram(a.program),this.setAttribs(a.attributes)},d.WebGLShaderManager.prototype.activatePrimitiveShader=function(){var a=this.gl;a.useProgram(this.primitiveShader.program),this.setAttribs(this.primitiveShader.attributes)},d.WebGLShaderManager.prototype.deactivatePrimitiveShader=function(){var a=this.gl;a.useProgram(this.defaultShader.program),this.setAttribs(this.defaultShader.attributes)},d.WebGLShaderManager.prototype.destroy=function(){this.attribState=null,this.tempAttribState=null,this.primitiveShader.destroy(),this.defaultShader.destroy(),this.fastShader.destroy(),this.gl=null},d.WebGLSpriteBatch=function(a){this.vertSize=6,this.size=2e3;var b=4*this.size*this.vertSize,c=6*this.size;this.vertices=new Float32Array(b),this.indices=new Uint16Array(c),this.lastIndexCount=0;for(var d=0,e=0;c>d;d+=6,e+=4)this.indices[d+0]=e+0,this.indices[d+1]=e+1,this.indices[d+2]=e+2,this.indices[d+3]=e+0,this.indices[d+4]=e+2,this.indices[d+5]=e+3;this.drawing=!1,this.currentBatchSize=0,this.currentBaseTexture=null,this.setContext(a)},d.WebGLSpriteBatch.prototype.setContext=function(a){this.gl=a,this.vertexBuffer=a.createBuffer(),this.indexBuffer=a.createBuffer(),a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,this.indexBuffer),a.bufferData(a.ELEMENT_ARRAY_BUFFER,this.indices,a.STATIC_DRAW),a.bindBuffer(a.ARRAY_BUFFER,this.vertexBuffer),a.bufferData(a.ARRAY_BUFFER,this.vertices,a.DYNAMIC_DRAW),this.currentBlendMode=99999},d.WebGLSpriteBatch.prototype.begin=function(a){this.renderSession=a,this.shader=this.renderSession.shaderManager.defaultShader,this.start()},d.WebGLSpriteBatch.prototype.end=function(){this.flush()
},d.WebGLSpriteBatch.prototype.render=function(a){var b=a.texture;(b.baseTexture!==this.currentBaseTexture||this.currentBatchSize>=this.size)&&(this.flush(),this.currentBaseTexture=b.baseTexture),a.blendMode!==this.currentBlendMode&&this.setBlendMode(a.blendMode);var c=a._uvs||a.texture._uvs;if(c){var d,e,f,g,h=a.worldAlpha,i=a.tint,j=this.vertices,k=a.anchor.x,l=a.anchor.y;if(a.texture.trim){var m=a.texture.trim;e=m.x-k*m.width,d=e+b.frame.width,g=m.y-l*m.height,f=g+b.frame.height}else d=b.frame.width*(1-k),e=b.frame.width*-k,f=b.frame.height*(1-l),g=b.frame.height*-l;var n=4*this.currentBatchSize*this.vertSize,o=a.worldTransform,p=o.a,q=o.c,r=o.b,s=o.d,t=o.tx,u=o.ty;j[n++]=p*e+r*g+t,j[n++]=s*g+q*e+u,j[n++]=c.x0,j[n++]=c.y0,j[n++]=h,j[n++]=i,j[n++]=p*d+r*g+t,j[n++]=s*g+q*d+u,j[n++]=c.x1,j[n++]=c.y1,j[n++]=h,j[n++]=i,j[n++]=p*d+r*f+t,j[n++]=s*f+q*d+u,j[n++]=c.x2,j[n++]=c.y2,j[n++]=h,j[n++]=i,j[n++]=p*e+r*f+t,j[n++]=s*f+q*e+u,j[n++]=c.x3,j[n++]=c.y3,j[n++]=h,j[n++]=i,this.currentBatchSize++}},d.WebGLSpriteBatch.prototype.renderTilingSprite=function(a){var b=a.tilingTexture;(b.baseTexture!==this.currentBaseTexture||this.currentBatchSize>=this.size)&&(this.flush(),this.currentBaseTexture=b.baseTexture),a.blendMode!==this.currentBlendMode&&this.setBlendMode(a.blendMode),a._uvs||(a._uvs=new d.TextureUvs);var c=a._uvs;a.tilePosition.x%=b.baseTexture.width*a.tileScaleOffset.x,a.tilePosition.y%=b.baseTexture.height*a.tileScaleOffset.y;var e=a.tilePosition.x/(b.baseTexture.width*a.tileScaleOffset.x),f=a.tilePosition.y/(b.baseTexture.height*a.tileScaleOffset.y),g=a.width/b.baseTexture.width/(a.tileScale.x*a.tileScaleOffset.x),h=a.height/b.baseTexture.height/(a.tileScale.y*a.tileScaleOffset.y);c.x0=0-e,c.y0=0-f,c.x1=1*g-e,c.y1=0-f,c.x2=1*g-e,c.y2=1*h-f,c.x3=0-e,c.y3=1*h-f;var i=a.worldAlpha,j=a.tint,k=this.vertices,l=a.width,m=a.height,n=a.anchor.x,o=a.anchor.y,p=l*(1-n),q=l*-n,r=m*(1-o),s=m*-o,t=4*this.currentBatchSize*this.vertSize,u=a.worldTransform,v=u.a,w=u.c,x=u.b,y=u.d,z=u.tx,A=u.ty;k[t++]=v*q+x*s+z,k[t++]=y*s+w*q+A,k[t++]=c.x0,k[t++]=c.y0,k[t++]=i,k[t++]=j,k[t++]=v*p+x*s+z,k[t++]=y*s+w*p+A,k[t++]=c.x1,k[t++]=c.y1,k[t++]=i,k[t++]=j,k[t++]=v*p+x*r+z,k[t++]=y*r+w*p+A,k[t++]=c.x2,k[t++]=c.y2,k[t++]=i,k[t++]=j,k[t++]=v*q+x*r+z,k[t++]=y*r+w*q+A,k[t++]=c.x3,k[t++]=c.y3,k[t++]=i,k[t++]=j,this.currentBatchSize++},d.WebGLSpriteBatch.prototype.flush=function(){if(0!==this.currentBatchSize){var a=this.gl;if(a.bindTexture(a.TEXTURE_2D,this.currentBaseTexture._glTextures[a.id]||d.createWebGLTexture(this.currentBaseTexture,a)),this.currentBatchSize>.5*this.size)a.bufferSubData(a.ARRAY_BUFFER,0,this.vertices);else{var b=this.vertices.subarray(0,4*this.currentBatchSize*this.vertSize);a.bufferSubData(a.ARRAY_BUFFER,0,b)}a.drawElements(a.TRIANGLES,6*this.currentBatchSize,a.UNSIGNED_SHORT,0),this.currentBatchSize=0,this.renderSession.drawCount++}},d.WebGLSpriteBatch.prototype.stop=function(){this.flush()},d.WebGLSpriteBatch.prototype.start=function(){var a=this.gl;a.activeTexture(a.TEXTURE0),a.bindBuffer(a.ARRAY_BUFFER,this.vertexBuffer),a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,this.indexBuffer);var b=this.renderSession.projection;a.uniform2f(this.shader.projectionVector,b.x,b.y);var c=4*this.vertSize;a.vertexAttribPointer(this.shader.aVertexPosition,2,a.FLOAT,!1,c,0),a.vertexAttribPointer(this.shader.aTextureCoord,2,a.FLOAT,!1,c,8),a.vertexAttribPointer(this.shader.colorAttribute,2,a.FLOAT,!1,c,16),this.currentBlendMode!==d.blendModes.NORMAL&&this.setBlendMode(d.blendModes.NORMAL)},d.WebGLSpriteBatch.prototype.setBlendMode=function(a){this.flush(),this.currentBlendMode=a;var b=d.blendModesWebGL[this.currentBlendMode];this.gl.blendFunc(b[0],b[1])},d.WebGLSpriteBatch.prototype.destroy=function(){this.vertices=null,this.indices=null,this.gl.deleteBuffer(this.vertexBuffer),this.gl.deleteBuffer(this.indexBuffer),this.currentBaseTexture=null,this.gl=null},d.WebGLFastSpriteBatch=function(a){this.vertSize=10,this.maxSize=6e3,this.size=this.maxSize;var b=4*this.size*this.vertSize,c=6*this.maxSize;this.vertices=new Float32Array(b),this.indices=new Uint16Array(c),this.vertexBuffer=null,this.indexBuffer=null,this.lastIndexCount=0;for(var d=0,e=0;c>d;d+=6,e+=4)this.indices[d+0]=e+0,this.indices[d+1]=e+1,this.indices[d+2]=e+2,this.indices[d+3]=e+0,this.indices[d+4]=e+2,this.indices[d+5]=e+3;this.drawing=!1,this.currentBatchSize=0,this.currentBaseTexture=null,this.currentBlendMode=0,this.renderSession=null,this.shader=null,this.matrix=null,this.setContext(a)},d.WebGLFastSpriteBatch.prototype.setContext=function(a){this.gl=a,this.vertexBuffer=a.createBuffer(),this.indexBuffer=a.createBuffer(),a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,this.indexBuffer),a.bufferData(a.ELEMENT_ARRAY_BUFFER,this.indices,a.STATIC_DRAW),a.bindBuffer(a.ARRAY_BUFFER,this.vertexBuffer),a.bufferData(a.ARRAY_BUFFER,this.vertices,a.DYNAMIC_DRAW),this.currentBlendMode=99999},d.WebGLFastSpriteBatch.prototype.begin=function(a,b){this.renderSession=b,this.shader=this.renderSession.shaderManager.fastShader,this.matrix=a.worldTransform.toArray(!0),this.start()},d.WebGLFastSpriteBatch.prototype.end=function(){this.flush()},d.WebGLFastSpriteBatch.prototype.render=function(a){var b=a.children,c=b[0];if(c.texture._uvs){this.currentBaseTexture=c.texture.baseTexture,c.blendMode!==this.currentBlendMode&&this.setBlendMode(c.blendMode);for(var d=0,e=b.length;e>d;d++)this.renderSprite(b[d]);this.flush()}},d.WebGLFastSpriteBatch.prototype.renderSprite=function(a){if(a.visible&&(a.texture.baseTexture===this.currentBaseTexture||(this.flush(),this.currentBaseTexture=a.texture.baseTexture,a.texture._uvs))){var b,c,d,e,f,g,h,i,j=this.vertices;if(b=a.texture._uvs,c=a.texture.frame.width,d=a.texture.frame.height,a.texture.trim){var k=a.texture.trim;f=k.x-a.anchor.x*k.width,e=f+a.texture.frame.width,h=k.y-a.anchor.y*k.height,g=h+a.texture.frame.height}else e=a.texture.frame.width*(1-a.anchor.x),f=a.texture.frame.width*-a.anchor.x,g=a.texture.frame.height*(1-a.anchor.y),h=a.texture.frame.height*-a.anchor.y;i=4*this.currentBatchSize*this.vertSize,j[i++]=f,j[i++]=h,j[i++]=a.position.x,j[i++]=a.position.y,j[i++]=a.scale.x,j[i++]=a.scale.y,j[i++]=a.rotation,j[i++]=b.x0,j[i++]=b.y1,j[i++]=a.alpha,j[i++]=e,j[i++]=h,j[i++]=a.position.x,j[i++]=a.position.y,j[i++]=a.scale.x,j[i++]=a.scale.y,j[i++]=a.rotation,j[i++]=b.x1,j[i++]=b.y1,j[i++]=a.alpha,j[i++]=e,j[i++]=g,j[i++]=a.position.x,j[i++]=a.position.y,j[i++]=a.scale.x,j[i++]=a.scale.y,j[i++]=a.rotation,j[i++]=b.x2,j[i++]=b.y2,j[i++]=a.alpha,j[i++]=f,j[i++]=g,j[i++]=a.position.x,j[i++]=a.position.y,j[i++]=a.scale.x,j[i++]=a.scale.y,j[i++]=a.rotation,j[i++]=b.x3,j[i++]=b.y3,j[i++]=a.alpha,this.currentBatchSize++,this.currentBatchSize>=this.size&&this.flush()}},d.WebGLFastSpriteBatch.prototype.flush=function(){if(0!==this.currentBatchSize){var a=this.gl;if(this.currentBaseTexture._glTextures[a.id]||d.createWebGLTexture(this.currentBaseTexture,a),a.bindTexture(a.TEXTURE_2D,this.currentBaseTexture._glTextures[a.id]),this.currentBatchSize>.5*this.size)a.bufferSubData(a.ARRAY_BUFFER,0,this.vertices);else{var b=this.vertices.subarray(0,4*this.currentBatchSize*this.vertSize);a.bufferSubData(a.ARRAY_BUFFER,0,b)}a.drawElements(a.TRIANGLES,6*this.currentBatchSize,a.UNSIGNED_SHORT,0),this.currentBatchSize=0,this.renderSession.drawCount++}},d.WebGLFastSpriteBatch.prototype.stop=function(){this.flush()},d.WebGLFastSpriteBatch.prototype.start=function(){var a=this.gl;a.activeTexture(a.TEXTURE0),a.bindBuffer(a.ARRAY_BUFFER,this.vertexBuffer),a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,this.indexBuffer);var b=this.renderSession.projection;a.uniform2f(this.shader.projectionVector,b.x,b.y),a.uniformMatrix3fv(this.shader.uMatrix,!1,this.matrix);var c=4*this.vertSize;a.vertexAttribPointer(this.shader.aVertexPosition,2,a.FLOAT,!1,c,0),a.vertexAttribPointer(this.shader.aPositionCoord,2,a.FLOAT,!1,c,8),a.vertexAttribPointer(this.shader.aScale,2,a.FLOAT,!1,c,16),a.vertexAttribPointer(this.shader.aRotation,1,a.FLOAT,!1,c,24),a.vertexAttribPointer(this.shader.aTextureCoord,2,a.FLOAT,!1,c,28),a.vertexAttribPointer(this.shader.colorAttribute,1,a.FLOAT,!1,c,36),this.currentBlendMode!==d.blendModes.NORMAL&&this.setBlendMode(d.blendModes.NORMAL)},d.WebGLFastSpriteBatch.prototype.setBlendMode=function(a){this.flush(),this.currentBlendMode=a;var b=d.blendModesWebGL[this.currentBlendMode];this.gl.blendFunc(b[0],b[1])},d.WebGLFilterManager=function(a,b){this.transparent=b,this.filterStack=[],this.offsetX=0,this.offsetY=0,this.setContext(a)},d.WebGLFilterManager.prototype.setContext=function(a){this.gl=a,this.texturePool=[],this.initShaderBuffers()},d.WebGLFilterManager.prototype.begin=function(a,b){this.renderSession=a,this.defaultShader=a.shaderManager.defaultShader;var c=this.renderSession.projection;this.width=2*c.x,this.height=2*-c.y,this.buffer=b},d.WebGLFilterManager.prototype.pushFilter=function(a){var b=this.gl,c=this.renderSession.projection,e=this.renderSession.offset;a._filterArea=a.target.filterArea||a.target.getBounds(),this.filterStack.push(a);var f=a.filterPasses[0];this.offsetX+=a._filterArea.x,this.offsetY+=a._filterArea.y;var g=this.texturePool.pop();g?g.resize(this.width,this.height):g=new d.FilterTexture(this.gl,this.width,this.height),b.bindTexture(b.TEXTURE_2D,g.texture);var h=a._filterArea,i=f.padding;h.x-=i,h.y-=i,h.width+=2*i,h.height+=2*i,h.x<0&&(h.x=0),h.width>this.width&&(h.width=this.width),h.y<0&&(h.y=0),h.height>this.height&&(h.height=this.height),b.bindFramebuffer(b.FRAMEBUFFER,g.frameBuffer),b.viewport(0,0,h.width,h.height),c.x=h.width/2,c.y=-h.height/2,e.x=-h.x,e.y=-h.y,b.uniform2f(this.defaultShader.projectionVector,h.width/2,-h.height/2),b.uniform2f(this.defaultShader.offsetVector,-h.x,-h.y),b.colorMask(!0,!0,!0,!0),b.clearColor(0,0,0,0),b.clear(b.COLOR_BUFFER_BIT),a._glFilterTexture=g},d.WebGLFilterManager.prototype.popFilter=function(){var a=this.gl,b=this.filterStack.pop(),c=b._filterArea,e=b._glFilterTexture,f=this.renderSession.projection,g=this.renderSession.offset;if(b.filterPasses.length>1){a.viewport(0,0,c.width,c.height),a.bindBuffer(a.ARRAY_BUFFER,this.vertexBuffer),this.vertexArray[0]=0,this.vertexArray[1]=c.height,this.vertexArray[2]=c.width,this.vertexArray[3]=c.height,this.vertexArray[4]=0,this.vertexArray[5]=0,this.vertexArray[6]=c.width,this.vertexArray[7]=0,a.bufferSubData(a.ARRAY_BUFFER,0,this.vertexArray),a.bindBuffer(a.ARRAY_BUFFER,this.uvBuffer),this.uvArray[2]=c.width/this.width,this.uvArray[5]=c.height/this.height,this.uvArray[6]=c.width/this.width,this.uvArray[7]=c.height/this.height,a.bufferSubData(a.ARRAY_BUFFER,0,this.uvArray);var h=e,i=this.texturePool.pop();i||(i=new d.FilterTexture(this.gl,this.width,this.height)),i.resize(this.width,this.height),a.bindFramebuffer(a.FRAMEBUFFER,i.frameBuffer),a.clear(a.COLOR_BUFFER_BIT),a.disable(a.BLEND);for(var j=0;j<b.filterPasses.length-1;j++){var k=b.filterPasses[j];a.bindFramebuffer(a.FRAMEBUFFER,i.frameBuffer),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,h.texture),this.applyFilterPass(k,c,c.width,c.height);var l=h;h=i,i=l}a.enable(a.BLEND),e=h,this.texturePool.push(i)}var m=b.filterPasses[b.filterPasses.length-1];this.offsetX-=c.x,this.offsetY-=c.y;var n=this.width,o=this.height,p=0,q=0,r=this.buffer;if(0===this.filterStack.length)a.colorMask(!0,!0,!0,!0);else{var s=this.filterStack[this.filterStack.length-1];c=s._filterArea,n=c.width,o=c.height,p=c.x,q=c.y,r=s._glFilterTexture.frameBuffer}f.x=n/2,f.y=-o/2,g.x=p,g.y=q,c=b._filterArea;var t=c.x-p,u=c.y-q;a.bindBuffer(a.ARRAY_BUFFER,this.vertexBuffer),this.vertexArray[0]=t,this.vertexArray[1]=u+c.height,this.vertexArray[2]=t+c.width,this.vertexArray[3]=u+c.height,this.vertexArray[4]=t,this.vertexArray[5]=u,this.vertexArray[6]=t+c.width,this.vertexArray[7]=u,a.bufferSubData(a.ARRAY_BUFFER,0,this.vertexArray),a.bindBuffer(a.ARRAY_BUFFER,this.uvBuffer),this.uvArray[2]=c.width/this.width,this.uvArray[5]=c.height/this.height,this.uvArray[6]=c.width/this.width,this.uvArray[7]=c.height/this.height,a.bufferSubData(a.ARRAY_BUFFER,0,this.uvArray),a.viewport(0,0,n,o),a.bindFramebuffer(a.FRAMEBUFFER,r),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,e.texture),this.applyFilterPass(m,c,n,o),a.useProgram(this.defaultShader.program),a.uniform2f(this.defaultShader.projectionVector,n/2,-o/2),a.uniform2f(this.defaultShader.offsetVector,-p,-q),this.texturePool.push(e),b._glFilterTexture=null},d.WebGLFilterManager.prototype.applyFilterPass=function(a,b,c,e){var f=this.gl,g=a.shaders[f.id];g||(g=new d.PixiShader(f),g.fragmentSrc=a.fragmentSrc,g.uniforms=a.uniforms,g.init(),a.shaders[f.id]=g),f.useProgram(g.program),f.uniform2f(g.projectionVector,c/2,-e/2),f.uniform2f(g.offsetVector,0,0),a.uniforms.dimensions&&(a.uniforms.dimensions.value[0]=this.width,a.uniforms.dimensions.value[1]=this.height,a.uniforms.dimensions.value[2]=this.vertexArray[0],a.uniforms.dimensions.value[3]=this.vertexArray[5]),g.syncUniforms(),f.bindBuffer(f.ARRAY_BUFFER,this.vertexBuffer),f.vertexAttribPointer(g.aVertexPosition,2,f.FLOAT,!1,0,0),f.bindBuffer(f.ARRAY_BUFFER,this.uvBuffer),f.vertexAttribPointer(g.aTextureCoord,2,f.FLOAT,!1,0,0),f.bindBuffer(f.ARRAY_BUFFER,this.colorBuffer),f.vertexAttribPointer(g.colorAttribute,2,f.FLOAT,!1,0,0),f.bindBuffer(f.ELEMENT_ARRAY_BUFFER,this.indexBuffer),f.drawElements(f.TRIANGLES,6,f.UNSIGNED_SHORT,0),this.renderSession.drawCount++},d.WebGLFilterManager.prototype.initShaderBuffers=function(){var a=this.gl;this.vertexBuffer=a.createBuffer(),this.uvBuffer=a.createBuffer(),this.colorBuffer=a.createBuffer(),this.indexBuffer=a.createBuffer(),this.vertexArray=new Float32Array([0,0,1,0,0,1,1,1]),a.bindBuffer(a.ARRAY_BUFFER,this.vertexBuffer),a.bufferData(a.ARRAY_BUFFER,this.vertexArray,a.STATIC_DRAW),this.uvArray=new Float32Array([0,0,1,0,0,1,1,1]),a.bindBuffer(a.ARRAY_BUFFER,this.uvBuffer),a.bufferData(a.ARRAY_BUFFER,this.uvArray,a.STATIC_DRAW),this.colorArray=new Float32Array([1,16777215,1,16777215,1,16777215,1,16777215]),a.bindBuffer(a.ARRAY_BUFFER,this.colorBuffer),a.bufferData(a.ARRAY_BUFFER,this.colorArray,a.STATIC_DRAW),a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,this.indexBuffer),a.bufferData(a.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,1,2,1,3,2]),a.STATIC_DRAW)},d.WebGLFilterManager.prototype.destroy=function(){var a=this.gl;this.filterStack=null,this.offsetX=0,this.offsetY=0;for(var b=0;b<this.texturePool.length;b++)this.texturePool.destroy();this.texturePool=null,a.deleteBuffer(this.vertexBuffer),a.deleteBuffer(this.uvBuffer),a.deleteBuffer(this.colorBuffer),a.deleteBuffer(this.indexBuffer)},d.FilterTexture=function(a,b,c,e){this.gl=a,this.frameBuffer=a.createFramebuffer(),this.texture=a.createTexture(),e=e||d.scaleModes.DEFAULT,a.bindTexture(a.TEXTURE_2D,this.texture),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,e===d.scaleModes.LINEAR?a.LINEAR:a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,e===d.scaleModes.LINEAR?a.LINEAR:a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE),a.bindFramebuffer(a.FRAMEBUFFER,this.framebuffer),a.bindFramebuffer(a.FRAMEBUFFER,this.frameBuffer),a.framebufferTexture2D(a.FRAMEBUFFER,a.COLOR_ATTACHMENT0,a.TEXTURE_2D,this.texture,0),this.renderBuffer=a.createRenderbuffer(),a.bindRenderbuffer(a.RENDERBUFFER,this.renderBuffer),a.framebufferRenderbuffer(a.FRAMEBUFFER,a.DEPTH_STENCIL_ATTACHMENT,a.RENDERBUFFER,this.renderBuffer),this.resize(b,c)},d.FilterTexture.prototype.clear=function(){var a=this.gl;a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT)},d.FilterTexture.prototype.resize=function(a,b){if(this.width!==a||this.height!==b){this.width=a,this.height=b;var c=this.gl;c.bindTexture(c.TEXTURE_2D,this.texture),c.texImage2D(c.TEXTURE_2D,0,c.RGBA,a,b,0,c.RGBA,c.UNSIGNED_BYTE,null),c.bindRenderbuffer(c.RENDERBUFFER,this.renderBuffer),c.renderbufferStorage(c.RENDERBUFFER,c.DEPTH_STENCIL,a,b)}},d.FilterTexture.prototype.destroy=function(){var a=this.gl;a.deleteFramebuffer(this.frameBuffer),a.deleteTexture(this.texture),this.frameBuffer=null,this.texture=null},d.CanvasMaskManager=function(){},d.CanvasMaskManager.prototype.pushMask=function(a,b){b.save();var c=a.alpha,e=a.worldTransform;b.setTransform(e.a,e.c,e.b,e.d,e.tx,e.ty),d.CanvasGraphics.renderGraphicsMask(a,b),b.clip(),a.worldAlpha=c},d.CanvasMaskManager.prototype.popMask=function(a){a.restore()},d.CanvasTinter=function(){},d.CanvasTinter.getTintedTexture=function(a,b){var c=a.texture;b=d.CanvasTinter.roundColor(b);var e="#"+("00000"+(0|b).toString(16)).substr(-6);if(c.tintCache=c.tintCache||{},c.tintCache[e])return c.tintCache[e];var f=d.CanvasTinter.canvas||document.createElement("canvas");if(d.CanvasTinter.tintMethod(c,b,f),d.CanvasTinter.convertTintToImage){var g=new Image;g.src=f.toDataURL(),c.tintCache[e]=g}else c.tintCache[e]=f,d.CanvasTinter.canvas=null;return f},d.CanvasTinter.tintWithMultiply=function(a,b,c){var d=c.getContext("2d"),e=a.frame;c.width=e.width,c.height=e.height,d.fillStyle="#"+("00000"+(0|b).toString(16)).substr(-6),d.fillRect(0,0,e.width,e.height),d.globalCompositeOperation="multiply",d.drawImage(a.baseTexture.source,e.x,e.y,e.width,e.height,0,0,e.width,e.height),d.globalCompositeOperation="destination-atop",d.drawImage(a.baseTexture.source,e.x,e.y,e.width,e.height,0,0,e.width,e.height)},d.CanvasTinter.tintWithOverlay=function(a,b,c){var d=c.getContext("2d"),e=a.frame;c.width=e.width,c.height=e.height,d.globalCompositeOperation="copy",d.fillStyle="#"+("00000"+(0|b).toString(16)).substr(-6),d.fillRect(0,0,e.width,e.height),d.globalCompositeOperation="destination-atop",d.drawImage(a.baseTexture.source,e.x,e.y,e.width,e.height,0,0,e.width,e.height)},d.CanvasTinter.tintWithPerPixel=function(a,b,c){var e=c.getContext("2d"),f=a.frame;c.width=f.width,c.height=f.height,e.globalCompositeOperation="copy",e.drawImage(a.baseTexture.source,f.x,f.y,f.width,f.height,0,0,f.width,f.height);for(var g=d.hex2rgb(b),h=g[0],i=g[1],j=g[2],k=e.getImageData(0,0,f.width,f.height),l=k.data,m=0;m<l.length;m+=4)l[m+0]*=h,l[m+1]*=i,l[m+2]*=j;e.putImageData(k,0,0)},d.CanvasTinter.roundColor=function(a){var b=d.CanvasTinter.cacheStepsPerColorChannel,c=d.hex2rgb(a);return c[0]=Math.min(255,c[0]/b*b),c[1]=Math.min(255,c[1]/b*b),c[2]=Math.min(255,c[2]/b*b),d.rgb2hex(c)},d.CanvasTinter.cacheStepsPerColorChannel=8,d.CanvasTinter.convertTintToImage=!1,d.CanvasTinter.canUseMultiply=d.canUseNewCanvasBlendModes(),d.CanvasTinter.tintMethod=d.CanvasTinter.canUseMultiply?d.CanvasTinter.tintWithMultiply:d.CanvasTinter.tintWithPerPixel,d.CanvasRenderer=function(a,b,c,e){d.defaultRenderer=d.defaultRenderer||this,this.type=d.CANVAS_RENDERER,this.clearBeforeRender=!0,this.roundPixels=!1,this.transparent=!!e,d.blendModesCanvas||(d.blendModesCanvas=[],d.canUseNewCanvasBlendModes()?(d.blendModesCanvas[d.blendModes.NORMAL]="source-over",d.blendModesCanvas[d.blendModes.ADD]="lighter",d.blendModesCanvas[d.blendModes.MULTIPLY]="multiply",d.blendModesCanvas[d.blendModes.SCREEN]="screen",d.blendModesCanvas[d.blendModes.OVERLAY]="overlay",d.blendModesCanvas[d.blendModes.DARKEN]="darken",d.blendModesCanvas[d.blendModes.LIGHTEN]="lighten",d.blendModesCanvas[d.blendModes.COLOR_DODGE]="color-dodge",d.blendModesCanvas[d.blendModes.COLOR_BURN]="color-burn",d.blendModesCanvas[d.blendModes.HARD_LIGHT]="hard-light",d.blendModesCanvas[d.blendModes.SOFT_LIGHT]="soft-light",d.blendModesCanvas[d.blendModes.DIFFERENCE]="difference",d.blendModesCanvas[d.blendModes.EXCLUSION]="exclusion",d.blendModesCanvas[d.blendModes.HUE]="hue",d.blendModesCanvas[d.blendModes.SATURATION]="saturation",d.blendModesCanvas[d.blendModes.COLOR]="color",d.blendModesCanvas[d.blendModes.LUMINOSITY]="luminosity"):(d.blendModesCanvas[d.blendModes.NORMAL]="source-over",d.blendModesCanvas[d.blendModes.ADD]="lighter",d.blendModesCanvas[d.blendModes.MULTIPLY]="source-over",d.blendModesCanvas[d.blendModes.SCREEN]="source-over",d.blendModesCanvas[d.blendModes.OVERLAY]="source-over",d.blendModesCanvas[d.blendModes.DARKEN]="source-over",d.blendModesCanvas[d.blendModes.LIGHTEN]="source-over",d.blendModesCanvas[d.blendModes.COLOR_DODGE]="source-over",d.blendModesCanvas[d.blendModes.COLOR_BURN]="source-over",d.blendModesCanvas[d.blendModes.HARD_LIGHT]="source-over",d.blendModesCanvas[d.blendModes.SOFT_LIGHT]="source-over",d.blendModesCanvas[d.blendModes.DIFFERENCE]="source-over",d.blendModesCanvas[d.blendModes.EXCLUSION]="source-over",d.blendModesCanvas[d.blendModes.HUE]="source-over",d.blendModesCanvas[d.blendModes.SATURATION]="source-over",d.blendModesCanvas[d.blendModes.COLOR]="source-over",d.blendModesCanvas[d.blendModes.LUMINOSITY]="source-over")),this.width=a||800,this.height=b||600,this.view=c||document.createElement("canvas"),this.context=this.view.getContext("2d",{alpha:this.transparent}),this.refresh=!0,this.view.width=this.width,this.view.height=this.height,this.count=0,this.maskManager=new d.CanvasMaskManager,this.renderSession={context:this.context,maskManager:this.maskManager,scaleMode:null,smoothProperty:null},"imageSmoothingEnabled"in this.context?this.renderSession.smoothProperty="imageSmoothingEnabled":"webkitImageSmoothingEnabled"in this.context?this.renderSession.smoothProperty="webkitImageSmoothingEnabled":"mozImageSmoothingEnabled"in this.context?this.renderSession.smoothProperty="mozImageSmoothingEnabled":"oImageSmoothingEnabled"in this.context&&(this.renderSession.smoothProperty="oImageSmoothingEnabled")},d.CanvasRenderer.prototype.constructor=d.CanvasRenderer,d.CanvasRenderer.prototype.render=function(a){d.texturesToUpdate.length=0,d.texturesToDestroy.length=0,a.updateTransform(),this.context.setTransform(1,0,0,1,0,0),this.context.globalAlpha=1,!this.transparent&&this.clearBeforeRender?(this.context.fillStyle=a.backgroundColorString,this.context.fillRect(0,0,this.width,this.height)):this.transparent&&this.clearBeforeRender&&this.context.clearRect(0,0,this.width,this.height),this.renderDisplayObject(a),a.interactive&&(a._interactiveEventsAdded||(a._interactiveEventsAdded=!0,a.interactionManager.setTarget(this))),d.Texture.frameUpdates.length>0&&(d.Texture.frameUpdates.length=0)},d.CanvasRenderer.prototype.resize=function(a,b){this.width=a,this.height=b,this.view.width=a,this.view.height=b},d.CanvasRenderer.prototype.renderDisplayObject=function(a,b){this.renderSession.context=b||this.context,a._renderCanvas(this.renderSession)},d.CanvasRenderer.prototype.renderStripFlat=function(a){var b=this.context,c=a.verticies,d=c.length/2;this.count++,b.beginPath();for(var e=1;d-2>e;e++){var f=2*e,g=c[f],h=c[f+2],i=c[f+4],j=c[f+1],k=c[f+3],l=c[f+5];b.moveTo(g,j),b.lineTo(h,k),b.lineTo(i,l)}b.fillStyle="#FF0000",b.fill(),b.closePath()},d.CanvasRenderer.prototype.renderStrip=function(a){var b=this.context,c=a.verticies,d=a.uvs,e=c.length/2;this.count++;for(var f=1;e-2>f;f++){var g=2*f,h=c[g],i=c[g+2],j=c[g+4],k=c[g+1],l=c[g+3],m=c[g+5],n=d[g]*a.texture.width,o=d[g+2]*a.texture.width,p=d[g+4]*a.texture.width,q=d[g+1]*a.texture.height,r=d[g+3]*a.texture.height,s=d[g+5]*a.texture.height;b.save(),b.beginPath(),b.moveTo(h,k),b.lineTo(i,l),b.lineTo(j,m),b.closePath(),b.clip();var t=n*r+q*p+o*s-r*p-q*o-n*s,u=h*r+q*j+i*s-r*j-q*i-h*s,v=n*i+h*p+o*j-i*p-h*o-n*j,w=n*r*j+q*i*p+h*o*s-h*r*p-q*o*j-n*i*s,x=k*r+q*m+l*s-r*m-q*l-k*s,y=n*l+k*p+o*m-l*p-k*o-n*m,z=n*r*m+q*l*p+k*o*s-k*r*p-q*o*m-n*l*s;b.transform(u/t,x/t,v/t,y/t,w/t,z/t),b.drawImage(a.texture.baseTexture.source,0,0),b.restore()}},d.CanvasBuffer=function(a,b){this.width=a,this.height=b,this.canvas=document.createElement("canvas"),this.context=this.canvas.getContext("2d"),this.canvas.width=a,this.canvas.height=b},d.CanvasBuffer.prototype.clear=function(){this.context.clearRect(0,0,this.width,this.height)},d.CanvasBuffer.prototype.resize=function(a,b){this.width=this.canvas.width=a,this.height=this.canvas.height=b},d.CanvasGraphics=function(){},d.CanvasGraphics.renderGraphics=function(a,b){for(var c=a.worldAlpha,e="",f=0;f<a.graphicsData.length;f++){var g=a.graphicsData[f],h=g.points;if(b.strokeStyle=e="#"+("00000"+(0|g.lineColor).toString(16)).substr(-6),b.lineWidth=g.lineWidth,g.type===d.Graphics.POLY){b.beginPath(),b.moveTo(h[0],h[1]);for(var i=1;i<h.length/2;i++)b.lineTo(h[2*i],h[2*i+1]);h[0]===h[h.length-2]&&h[1]===h[h.length-1]&&b.closePath(),g.fill&&(b.globalAlpha=g.fillAlpha*c,b.fillStyle=e="#"+("00000"+(0|g.fillColor).toString(16)).substr(-6),b.fill()),g.lineWidth&&(b.globalAlpha=g.lineAlpha*c,b.stroke())}else if(g.type===d.Graphics.RECT)(g.fillColor||0===g.fillColor)&&(b.globalAlpha=g.fillAlpha*c,b.fillStyle=e="#"+("00000"+(0|g.fillColor).toString(16)).substr(-6),b.fillRect(h[0],h[1],h[2],h[3])),g.lineWidth&&(b.globalAlpha=g.lineAlpha*c,b.strokeRect(h[0],h[1],h[2],h[3]));else if(g.type===d.Graphics.CIRC)b.beginPath(),b.arc(h[0],h[1],h[2],0,2*Math.PI),b.closePath(),g.fill&&(b.globalAlpha=g.fillAlpha*c,b.fillStyle=e="#"+("00000"+(0|g.fillColor).toString(16)).substr(-6),b.fill()),g.lineWidth&&(b.globalAlpha=g.lineAlpha*c,b.stroke());else if(g.type===d.Graphics.ELIP){var j=g.points,k=2*j[2],l=2*j[3],m=j[0]-k/2,n=j[1]-l/2;b.beginPath();var o=.5522848,p=k/2*o,q=l/2*o,r=m+k,s=n+l,t=m+k/2,u=n+l/2;b.moveTo(m,u),b.bezierCurveTo(m,u-q,t-p,n,t,n),b.bezierCurveTo(t+p,n,r,u-q,r,u),b.bezierCurveTo(r,u+q,t+p,s,t,s),b.bezierCurveTo(t-p,s,m,u+q,m,u),b.closePath(),g.fill&&(b.globalAlpha=g.fillAlpha*c,b.fillStyle=e="#"+("00000"+(0|g.fillColor).toString(16)).substr(-6),b.fill()),g.lineWidth&&(b.globalAlpha=g.lineAlpha*c,b.stroke())}}},d.CanvasGraphics.renderGraphicsMask=function(a,b){var c=a.graphicsData.length;if(0!==c){c>1&&(c=1,window.console.log("Pixi.js warning: masks in canvas can only mask using the first path in the graphics object"));for(var e=0;1>e;e++){var f=a.graphicsData[e],g=f.points;if(f.type===d.Graphics.POLY){b.beginPath(),b.moveTo(g[0],g[1]);for(var h=1;h<g.length/2;h++)b.lineTo(g[2*h],g[2*h+1]);g[0]===g[g.length-2]&&g[1]===g[g.length-1]&&b.closePath()}else if(f.type===d.Graphics.RECT)b.beginPath(),b.rect(g[0],g[1],g[2],g[3]),b.closePath();else if(f.type===d.Graphics.CIRC)b.beginPath(),b.arc(g[0],g[1],g[2],0,2*Math.PI),b.closePath();else if(f.type===d.Graphics.ELIP){var i=f.points,j=2*i[2],k=2*i[3],l=i[0]-j/2,m=i[1]-k/2;b.beginPath();var n=.5522848,o=j/2*n,p=k/2*n,q=l+j,r=m+k,s=l+j/2,t=m+k/2;b.moveTo(l,t),b.bezierCurveTo(l,t-p,s-o,m,s,m),b.bezierCurveTo(s+o,m,q,t-p,q,t),b.bezierCurveTo(q,t+p,s+o,r,s,r),b.bezierCurveTo(s-o,r,l,t+p,l,t),b.closePath()}}}},d.Graphics=function(){d.DisplayObjectContainer.call(this),this.renderable=!0,this.fillAlpha=1,this.lineWidth=0,this.lineColor="black",this.graphicsData=[],this.tint=16777215,this.blendMode=d.blendModes.NORMAL,this.currentPath={points:[]},this._webGL=[],this.isMask=!1,this.bounds=null,this.boundsPadding=10},d.Graphics.prototype=Object.create(d.DisplayObjectContainer.prototype),d.Graphics.prototype.constructor=d.Graphics,Object.defineProperty(d.Graphics.prototype,"cacheAsBitmap",{get:function(){return this._cacheAsBitmap},set:function(a){this._cacheAsBitmap=a,this._cacheAsBitmap?this._generateCachedSprite():(this.destroyCachedSprite(),this.dirty=!0)}}),d.Graphics.prototype.lineStyle=function(a,b,c){return this.currentPath.points.length||this.graphicsData.pop(),this.lineWidth=a||0,this.lineColor=b||0,this.lineAlpha=arguments.length<3?1:c,this.currentPath={lineWidth:this.lineWidth,lineColor:this.lineColor,lineAlpha:this.lineAlpha,fillColor:this.fillColor,fillAlpha:this.fillAlpha,fill:this.filling,points:[],type:d.Graphics.POLY},this.graphicsData.push(this.currentPath),this},d.Graphics.prototype.moveTo=function(a,b){return this.currentPath.points.length||this.graphicsData.pop(),this.currentPath=this.currentPath={lineWidth:this.lineWidth,lineColor:this.lineColor,lineAlpha:this.lineAlpha,fillColor:this.fillColor,fillAlpha:this.fillAlpha,fill:this.filling,points:[],type:d.Graphics.POLY},this.currentPath.points.push(a,b),this.graphicsData.push(this.currentPath),this},d.Graphics.prototype.lineTo=function(a,b){return this.currentPath.points.push(a,b),this.dirty=!0,this},d.Graphics.prototype.beginFill=function(a,b){return this.filling=!0,this.fillColor=a||0,this.fillAlpha=arguments.length<2?1:b,this},d.Graphics.prototype.endFill=function(){return this.filling=!1,this.fillColor=null,this.fillAlpha=1,this},d.Graphics.prototype.drawRect=function(a,b,c,e){return this.currentPath.points.length||this.graphicsData.pop(),this.currentPath={lineWidth:this.lineWidth,lineColor:this.lineColor,lineAlpha:this.lineAlpha,fillColor:this.fillColor,fillAlpha:this.fillAlpha,fill:this.filling,points:[a,b,c,e],type:d.Graphics.RECT},this.graphicsData.push(this.currentPath),this.dirty=!0,this},d.Graphics.prototype.drawCircle=function(a,b,c){return this.currentPath.points.length||this.graphicsData.pop(),this.currentPath={lineWidth:this.lineWidth,lineColor:this.lineColor,lineAlpha:this.lineAlpha,fillColor:this.fillColor,fillAlpha:this.fillAlpha,fill:this.filling,points:[a,b,c,c],type:d.Graphics.CIRC},this.graphicsData.push(this.currentPath),this.dirty=!0,this},d.Graphics.prototype.drawEllipse=function(a,b,c,e){return this.currentPath.points.length||this.graphicsData.pop(),this.currentPath={lineWidth:this.lineWidth,lineColor:this.lineColor,lineAlpha:this.lineAlpha,fillColor:this.fillColor,fillAlpha:this.fillAlpha,fill:this.filling,points:[a,b,c,e],type:d.Graphics.ELIP},this.graphicsData.push(this.currentPath),this.dirty=!0,this},d.Graphics.prototype.clear=function(){return this.lineWidth=0,this.filling=!1,this.dirty=!0,this.clearDirty=!0,this.graphicsData=[],this.bounds=null,this},d.Graphics.prototype.generateTexture=function(){var a=this.getBounds(),b=new d.CanvasBuffer(a.width,a.height),c=d.Texture.fromCanvas(b.canvas);return b.context.translate(-a.x,-a.y),d.CanvasGraphics.renderGraphics(this,b.context),c},d.Graphics.prototype._renderWebGL=function(a){if(this.visible!==!1&&0!==this.alpha&&this.isMask!==!0){if(this._cacheAsBitmap)return this.dirty&&(this._generateCachedSprite(),d.updateWebGLTexture(this._cachedSprite.texture.baseTexture,a.gl),this.dirty=!1),this._cachedSprite.alpha=this.alpha,d.Sprite.prototype._renderWebGL.call(this._cachedSprite,a),void 0;if(a.spriteBatch.stop(),this._mask&&a.maskManager.pushMask(this.mask,a),this._filters&&a.filterManager.pushFilter(this._filterBlock),this.blendMode!==a.spriteBatch.currentBlendMode){a.spriteBatch.currentBlendMode=this.blendMode;var b=d.blendModesWebGL[a.spriteBatch.currentBlendMode];a.spriteBatch.gl.blendFunc(b[0],b[1])}if(d.WebGLGraphics.renderGraphics(this,a),this.children.length){a.spriteBatch.start();for(var c=0,e=this.children.length;e>c;c++)this.children[c]._renderWebGL(a);a.spriteBatch.stop()}this._filters&&a.filterManager.popFilter(),this._mask&&a.maskManager.popMask(a),a.drawCount++,a.spriteBatch.start()}},d.Graphics.prototype._renderCanvas=function(a){if(this.visible!==!1&&0!==this.alpha&&this.isMask!==!0){var b=a.context,c=this.worldTransform;this.blendMode!==a.currentBlendMode&&(a.currentBlendMode=this.blendMode,b.globalCompositeOperation=d.blendModesCanvas[a.currentBlendMode]),b.setTransform(c.a,c.c,c.b,c.d,c.tx,c.ty),d.CanvasGraphics.renderGraphics(this,b);for(var e=0,f=this.children.length;f>e;e++)this.children[e]._renderCanvas(a)}},d.Graphics.prototype.getBounds=function(a){this.bounds||this.updateBounds();var b=this.bounds.x,c=this.bounds.width+this.bounds.x,d=this.bounds.y,e=this.bounds.height+this.bounds.y,f=a||this.worldTransform,g=f.a,h=f.c,i=f.b,j=f.d,k=f.tx,l=f.ty,m=g*c+i*e+k,n=j*e+h*c+l,o=g*b+i*e+k,p=j*e+h*b+l,q=g*b+i*d+k,r=j*d+h*b+l,s=g*c+i*d+k,t=j*d+h*c+l,u=m,v=n,w=m,x=n;w=w>o?o:w,w=w>q?q:w,w=w>s?s:w,x=x>p?p:x,x=x>r?r:x,x=x>t?t:x,u=o>u?o:u,u=q>u?q:u,u=s>u?s:u,v=p>v?p:v,v=r>v?r:v,v=t>v?t:v;var y=this._bounds;return y.x=w,y.width=u-w,y.y=x,y.height=v-x,y},d.Graphics.prototype.updateBounds=function(){for(var a,b,c,e,f,g=1/0,h=-1/0,i=1/0,j=-1/0,k=0;k<this.graphicsData.length;k++){var l=this.graphicsData[k],m=l.type,n=l.lineWidth;if(a=l.points,m===d.Graphics.RECT)b=a[0]-n/2,c=a[1]-n/2,e=a[2]+n,f=a[3]+n,g=g>b?b:g,h=b+e>h?b+e:h,i=i>c?b:i,j=c+f>j?c+f:j;else if(m===d.Graphics.CIRC||m===d.Graphics.ELIP)b=a[0],c=a[1],e=a[2]+n/2,f=a[3]+n/2,g=g>b-e?b-e:g,h=b+e>h?b+e:h,i=i>c-f?c-f:i,j=c+f>j?c+f:j;
else for(var o=0;o<a.length;o+=2)b=a[o],c=a[o+1],g=g>b-n?b-n:g,h=b+n>h?b+n:h,i=i>c-n?c-n:i,j=c+n>j?c+n:j}var p=this.boundsPadding;this.bounds=new d.Rectangle(g-p,i-p,h-g+2*p,j-i+2*p)},d.Graphics.prototype._generateCachedSprite=function(){var a=this.getLocalBounds();if(this._cachedSprite)this._cachedSprite.buffer.resize(a.width,a.height);else{var b=new d.CanvasBuffer(a.width,a.height),c=d.Texture.fromCanvas(b.canvas);this._cachedSprite=new d.Sprite(c),this._cachedSprite.buffer=b,this._cachedSprite.worldTransform=this.worldTransform}this._cachedSprite.anchor.x=-(a.x/a.width),this._cachedSprite.anchor.y=-(a.y/a.height),this._cachedSprite.buffer.context.translate(-a.x,-a.y),d.CanvasGraphics.renderGraphics(this,this._cachedSprite.buffer.context),this._cachedSprite.alpha=this.alpha},d.Graphics.prototype.destroyCachedSprite=function(){this._cachedSprite.texture.destroy(!0),this._cachedSprite=null},d.Graphics.POLY=0,d.Graphics.RECT=1,d.Graphics.CIRC=2,d.Graphics.ELIP=3,d.Strip=function(a,b,c){d.Sprite.call(this,a),this.width=b,this.height=c,this.texture=a,this.blendMode=d.blendModes.NORMAL;try{this.uvs=new Float32Array([0,1,1,1,1,0,0,1]),this.verticies=new Float32Array([0,0,0,0,0,0,0,0,0]),this.colors=new Float32Array([1,1,1,1]),this.indices=new Uint16Array([0,1,2,3])}catch(e){this.uvs=[0,1,1,1,1,0,0,1],this.verticies=[0,0,0,0,0,0,0,0,0],this.colors=[1,1,1,1],this.indices=[0,1,2,3]}a.baseTexture.hasLoaded?(this.width=this.texture.frame.width,this.height=this.texture.frame.height,this.updateFrame=!0):(this.onTextureUpdateBind=this.onTextureUpdate.bind(this),this.texture.addEventListener("update",this.onTextureUpdateBind)),this.renderable=!0},d.Strip.prototype=Object.create(d.Sprite.prototype),d.Strip.prototype.constructor=d.Strip,d.Strip.prototype.onTextureUpdate=function(){this.updateFrame=!0},d.Rope=function(a,b){d.Strip.call(this,a),this.points=b;try{this.verticies=new Float32Array(4*b.length),this.uvs=new Float32Array(4*b.length),this.colors=new Float32Array(2*b.length),this.indices=new Uint16Array(2*b.length)}catch(c){this.verticies=new Array(4*b.length),this.uvs=new Array(4*b.length),this.colors=new Array(2*b.length),this.indices=new Array(2*b.length)}this.refresh()},d.Rope.prototype=Object.create(d.Strip.prototype),d.Rope.prototype.constructor=d.Rope,d.Rope.prototype.refresh=function(){var a=this.points;if(!(a.length<1)){var b=this.uvs,c=a[0],d=this.indices,e=this.colors;this.count-=.2,b[0]=0,b[1]=1,b[2]=0,b[3]=1,e[0]=1,e[1]=1,d[0]=0,d[1]=1;for(var f,g,h,i=a.length,j=1;i>j;j++)f=a[j],g=4*j,h=j/(i-1),j%2?(b[g]=h,b[g+1]=0,b[g+2]=h,b[g+3]=1):(b[g]=h,b[g+1]=0,b[g+2]=h,b[g+3]=1),g=2*j,e[g]=1,e[g+1]=1,g=2*j,d[g]=g,d[g+1]=g+1,c=f}},d.Rope.prototype.updateTransform=function(){var a=this.points;if(!(a.length<1)){var b,c=a[0],e={x:0,y:0};this.count-=.2;var f=this.verticies;f[0]=c.x+e.x,f[1]=c.y+e.y,f[2]=c.x-e.x,f[3]=c.y-e.y;for(var g,h,i,j,k,l=a.length,m=1;l>m;m++)g=a[m],h=4*m,b=m<a.length-1?a[m+1]:g,e.y=-(b.x-c.x),e.x=b.y-c.y,i=10*(1-m/(l-1)),i>1&&(i=1),j=Math.sqrt(e.x*e.x+e.y*e.y),k=this.texture.height/2,e.x/=j,e.y/=j,e.x*=k,e.y*=k,f[h]=g.x+e.x,f[h+1]=g.y+e.y,f[h+2]=g.x-e.x,f[h+3]=g.y-e.y,c=g;d.DisplayObjectContainer.prototype.updateTransform.call(this)}},d.Rope.prototype.setTexture=function(a){this.texture=a,this.updateFrame=!0},d.TilingSprite=function(a,b,c){d.Sprite.call(this,a),this.width=b||100,this.height=c||100,this.tileScale=new d.Point(1,1),this.tileScaleOffset=new d.Point(1,1),this.tilePosition=new d.Point(0,0),this.renderable=!0,this.tint=16777215,this.blendMode=d.blendModes.NORMAL},d.TilingSprite.prototype=Object.create(d.Sprite.prototype),d.TilingSprite.prototype.constructor=d.TilingSprite,Object.defineProperty(d.TilingSprite.prototype,"width",{get:function(){return this._width},set:function(a){this._width=a}}),Object.defineProperty(d.TilingSprite.prototype,"height",{get:function(){return this._height},set:function(a){this._height=a}}),d.TilingSprite.prototype.onTextureUpdate=function(){this.updateFrame=!0},d.TilingSprite.prototype.setTexture=function(a){this.texture!==a&&(this.texture=a,this.refreshTexture=!0,this.cachedTint=16777215)},d.TilingSprite.prototype._renderWebGL=function(a){if(this.visible!==!1&&0!==this.alpha){var b,c;for(this.mask&&(a.spriteBatch.stop(),a.maskManager.pushMask(this.mask,a),a.spriteBatch.start()),this.filters&&(a.spriteBatch.flush(),a.filterManager.pushFilter(this._filterBlock)),!this.tilingTexture||this.refreshTexture?(this.generateTilingTexture(!0),this.tilingTexture&&this.tilingTexture.needsUpdate&&(d.updateWebGLTexture(this.tilingTexture.baseTexture,a.gl),this.tilingTexture.needsUpdate=!1)):a.spriteBatch.renderTilingSprite(this),b=0,c=this.children.length;c>b;b++)this.children[b]._renderWebGL(a);a.spriteBatch.stop(),this.filters&&a.filterManager.popFilter(),this.mask&&a.maskManager.popMask(a),a.spriteBatch.start()}},d.TilingSprite.prototype._renderCanvas=function(a){if(this.visible!==!1&&0!==this.alpha){var b=a.context;this._mask&&a.maskManager.pushMask(this._mask,b),b.globalAlpha=this.worldAlpha;var c=this.worldTransform;if(b.setTransform(c.a,c.c,c.b,c.d,c.tx,c.ty),!this.__tilePattern||this.refreshTexture){if(this.generateTilingTexture(!1),!this.tilingTexture)return;this.__tilePattern=b.createPattern(this.tilingTexture.baseTexture.source,"repeat")}this.blendMode!==a.currentBlendMode&&(a.currentBlendMode=this.blendMode,b.globalCompositeOperation=d.blendModesCanvas[a.currentBlendMode]),b.beginPath();var e=this.tilePosition,f=this.tileScale;e.x%=this.tilingTexture.baseTexture.width,e.y%=this.tilingTexture.baseTexture.height,b.scale(f.x,f.y),b.translate(e.x,e.y),b.fillStyle=this.__tilePattern,b.fillRect(-e.x+this.anchor.x*-this._width,-e.y+this.anchor.y*-this._height,this._width/f.x,this._height/f.y),b.scale(1/f.x,1/f.y),b.translate(-e.x,-e.y),b.closePath(),this._mask&&a.maskManager.popMask(a.context)}},d.TilingSprite.prototype.getBounds=function(){var a=this._width,b=this._height,c=a*(1-this.anchor.x),d=a*-this.anchor.x,e=b*(1-this.anchor.y),f=b*-this.anchor.y,g=this.worldTransform,h=g.a,i=g.c,j=g.b,k=g.d,l=g.tx,m=g.ty,n=h*d+j*f+l,o=k*f+i*d+m,p=h*c+j*f+l,q=k*f+i*c+m,r=h*c+j*e+l,s=k*e+i*c+m,t=h*d+j*e+l,u=k*e+i*d+m,v=-1/0,w=-1/0,x=1/0,y=1/0;x=x>n?n:x,x=x>p?p:x,x=x>r?r:x,x=x>t?t:x,y=y>o?o:y,y=y>q?q:y,y=y>s?s:y,y=y>u?u:y,v=n>v?n:v,v=p>v?p:v,v=r>v?r:v,v=t>v?t:v,w=o>w?o:w,w=q>w?q:w,w=s>w?s:w,w=u>w?u:w;var z=this._bounds;return z.x=x,z.width=v-x,z.y=y,z.height=w-y,this._currentBounds=z,z},d.TilingSprite.prototype.generateTilingTexture=function(a){var b=this.texture;if(b.baseTexture.hasLoaded){var c,e,f=b.baseTexture,g=b.frame,h=g.width!==f.width||g.height!==f.height,i=!1;if(a?(c=d.getNextPowerOfTwo(g.width),e=d.getNextPowerOfTwo(g.height),g.width!==c&&g.height!==e&&(i=!0)):h&&(c=g.width,e=g.height,i=!0),i){var j;this.tilingTexture&&this.tilingTexture.isTiling?(j=this.tilingTexture.canvasBuffer,j.resize(c,e),this.tilingTexture.baseTexture.width=c,this.tilingTexture.baseTexture.height=e,this.tilingTexture.needsUpdate=!0):(j=new d.CanvasBuffer(c,e),this.tilingTexture=d.Texture.fromCanvas(j.canvas),this.tilingTexture.canvasBuffer=j,this.tilingTexture.isTiling=!0),j.context.drawImage(b.baseTexture.source,g.x,g.y,g.width,g.height,0,0,c,e),this.tileScaleOffset.x=g.width/c,this.tileScaleOffset.y=g.height/e}else this.tilingTexture&&this.tilingTexture.isTiling&&this.tilingTexture.destroy(!0),this.tileScaleOffset.x=1,this.tileScaleOffset.y=1,this.tilingTexture=b;this.refreshTexture=!1,this.tilingTexture.baseTexture._powerOf2=!0}};var i={};i.BoneData=function(a,b){this.name=a,this.parent=b},i.BoneData.prototype={length:0,x:0,y:0,rotation:0,scaleX:1,scaleY:1},i.SlotData=function(a,b){this.name=a,this.boneData=b},i.SlotData.prototype={r:1,g:1,b:1,a:1,attachmentName:null},i.Bone=function(a,b){this.data=a,this.parent=b,this.setToSetupPose()},i.Bone.yDown=!1,i.Bone.prototype={x:0,y:0,rotation:0,scaleX:1,scaleY:1,m00:0,m01:0,worldX:0,m10:0,m11:0,worldY:0,worldRotation:0,worldScaleX:1,worldScaleY:1,updateWorldTransform:function(a,b){var c=this.parent;null!=c?(this.worldX=this.x*c.m00+this.y*c.m01+c.worldX,this.worldY=this.x*c.m10+this.y*c.m11+c.worldY,this.worldScaleX=c.worldScaleX*this.scaleX,this.worldScaleY=c.worldScaleY*this.scaleY,this.worldRotation=c.worldRotation+this.rotation):(this.worldX=this.x,this.worldY=this.y,this.worldScaleX=this.scaleX,this.worldScaleY=this.scaleY,this.worldRotation=this.rotation);var d=this.worldRotation*Math.PI/180,e=Math.cos(d),f=Math.sin(d);this.m00=e*this.worldScaleX,this.m10=f*this.worldScaleX,this.m01=-f*this.worldScaleY,this.m11=e*this.worldScaleY,a&&(this.m00=-this.m00,this.m01=-this.m01),b&&(this.m10=-this.m10,this.m11=-this.m11),i.Bone.yDown&&(this.m10=-this.m10,this.m11=-this.m11)},setToSetupPose:function(){var a=this.data;this.x=a.x,this.y=a.y,this.rotation=a.rotation,this.scaleX=a.scaleX,this.scaleY=a.scaleY}},i.Slot=function(a,b,c){this.data=a,this.skeleton=b,this.bone=c,this.setToSetupPose()},i.Slot.prototype={r:1,g:1,b:1,a:1,_attachmentTime:0,attachment:null,setAttachment:function(a){this.attachment=a,this._attachmentTime=this.skeleton.time},setAttachmentTime:function(a){this._attachmentTime=this.skeleton.time-a},getAttachmentTime:function(){return this.skeleton.time-this._attachmentTime},setToSetupPose:function(){var a=this.data;this.r=a.r,this.g=a.g,this.b=a.b,this.a=a.a;for(var b=this.skeleton.data.slots,c=0,d=b.length;d>c;c++)if(b[c]==a){this.setAttachment(a.attachmentName?this.skeleton.getAttachmentBySlotIndex(c,a.attachmentName):null);break}}},i.Skin=function(a){this.name=a,this.attachments={}},i.Skin.prototype={addAttachment:function(a,b,c){this.attachments[a+":"+b]=c},getAttachment:function(a,b){return this.attachments[a+":"+b]},_attachAll:function(a,b){for(var c in b.attachments){var d=c.indexOf(":"),e=parseInt(c.substring(0,d),10),f=c.substring(d+1),g=a.slots[e];if(g.attachment&&g.attachment.name==f){var h=this.getAttachment(e,f);h&&g.setAttachment(h)}}}},i.Animation=function(a,b,c){this.name=a,this.timelines=b,this.duration=c},i.Animation.prototype={apply:function(a,b,c){c&&this.duration&&(b%=this.duration);for(var d=this.timelines,e=0,f=d.length;f>e;e++)d[e].apply(a,b,1)},mix:function(a,b,c,d){c&&this.duration&&(b%=this.duration);for(var e=this.timelines,f=0,g=e.length;g>f;f++)e[f].apply(a,b,d)}},i.binarySearch=function(a,b,c){var d=0,e=Math.floor(a.length/c)-2;if(!e)return c;for(var f=e>>>1;;){if(a[(f+1)*c]<=b?d=f+1:e=f,d==e)return(d+1)*c;f=d+e>>>1}},i.linearSearch=function(a,b,c){for(var d=0,e=a.length-c;e>=d;d+=c)if(a[d]>b)return d;return-1},i.Curves=function(a){this.curves=[],this.curves.length=6*(a-1)},i.Curves.prototype={setLinear:function(a){this.curves[6*a]=0},setStepped:function(a){this.curves[6*a]=-1},setCurve:function(a,b,c,d,e){var f=.1,g=f*f,h=g*f,i=3*f,j=3*g,k=6*g,l=6*h,m=2*-b+d,n=2*-c+e,o=3*(b-d)+1,p=3*(c-e)+1,q=6*a,r=this.curves;r[q]=b*i+m*j+o*h,r[q+1]=c*i+n*j+p*h,r[q+2]=m*k+o*l,r[q+3]=n*k+p*l,r[q+4]=o*l,r[q+5]=p*l},getCurvePercent:function(a,b){b=0>b?0:b>1?1:b;var c=6*a,d=this.curves,e=d[c];if(!e)return b;if(-1==e)return 0;for(var f=d[c+1],g=d[c+2],h=d[c+3],i=d[c+4],j=d[c+5],k=e,l=f,m=8;;){if(k>=b){var n=k-e,o=l-f;return o+(l-o)*(b-n)/(k-n)}if(!m)break;m--,e+=g,f+=h,g+=i,h+=j,k+=e,l+=f}return l+(1-l)*(b-k)/(1-k)}},i.RotateTimeline=function(a){this.curves=new i.Curves(a),this.frames=[],this.frames.length=2*a},i.RotateTimeline.prototype={boneIndex:0,getFrameCount:function(){return this.frames.length/2},setFrame:function(a,b,c){a*=2,this.frames[a]=b,this.frames[a+1]=c},apply:function(a,b,c){var d,e=this.frames;if(!(b<e[0])){var f=a.bones[this.boneIndex];if(b>=e[e.length-2]){for(d=f.data.rotation+e[e.length-1]-f.rotation;d>180;)d-=360;for(;-180>d;)d+=360;return f.rotation+=d*c,void 0}var g=i.binarySearch(e,b,2),h=e[g-1],j=e[g],k=1-(b-j)/(e[g-2]-j);for(k=this.curves.getCurvePercent(g/2-1,k),d=e[g+1]-h;d>180;)d-=360;for(;-180>d;)d+=360;for(d=f.data.rotation+(h+d*k)-f.rotation;d>180;)d-=360;for(;-180>d;)d+=360;f.rotation+=d*c}}},i.TranslateTimeline=function(a){this.curves=new i.Curves(a),this.frames=[],this.frames.length=3*a},i.TranslateTimeline.prototype={boneIndex:0,getFrameCount:function(){return this.frames.length/3},setFrame:function(a,b,c,d){a*=3,this.frames[a]=b,this.frames[a+1]=c,this.frames[a+2]=d},apply:function(a,b,c){var d=this.frames;if(!(b<d[0])){var e=a.bones[this.boneIndex];if(b>=d[d.length-3])return e.x+=(e.data.x+d[d.length-2]-e.x)*c,e.y+=(e.data.y+d[d.length-1]-e.y)*c,void 0;var f=i.binarySearch(d,b,3),g=d[f-2],h=d[f-1],j=d[f],k=1-(b-j)/(d[f+-3]-j);k=this.curves.getCurvePercent(f/3-1,k),e.x+=(e.data.x+g+(d[f+1]-g)*k-e.x)*c,e.y+=(e.data.y+h+(d[f+2]-h)*k-e.y)*c}}},i.ScaleTimeline=function(a){this.curves=new i.Curves(a),this.frames=[],this.frames.length=3*a},i.ScaleTimeline.prototype={boneIndex:0,getFrameCount:function(){return this.frames.length/3},setFrame:function(a,b,c,d){a*=3,this.frames[a]=b,this.frames[a+1]=c,this.frames[a+2]=d},apply:function(a,b,c){var d=this.frames;if(!(b<d[0])){var e=a.bones[this.boneIndex];if(b>=d[d.length-3])return e.scaleX+=(e.data.scaleX-1+d[d.length-2]-e.scaleX)*c,e.scaleY+=(e.data.scaleY-1+d[d.length-1]-e.scaleY)*c,void 0;var f=i.binarySearch(d,b,3),g=d[f-2],h=d[f-1],j=d[f],k=1-(b-j)/(d[f+-3]-j);k=this.curves.getCurvePercent(f/3-1,k),e.scaleX+=(e.data.scaleX-1+g+(d[f+1]-g)*k-e.scaleX)*c,e.scaleY+=(e.data.scaleY-1+h+(d[f+2]-h)*k-e.scaleY)*c}}},i.ColorTimeline=function(a){this.curves=new i.Curves(a),this.frames=[],this.frames.length=5*a},i.ColorTimeline.prototype={slotIndex:0,getFrameCount:function(){return this.frames.length/2},setFrame:function(c,d){c*=5,this.frames[c]=d,this.frames[c+1]=r,this.frames[c+2]=g,this.frames[c+3]=b,this.frames[c+4]=a},apply:function(a,b,c){var d=this.frames;if(!(b<d[0])){var e=a.slots[this.slotIndex];if(b>=d[d.length-5]){var f=d.length-1;return e.r=d[f-3],e.g=d[f-2],e.b=d[f-1],e.a=d[f],void 0}var g=i.binarySearch(d,b,5),h=d[g-4],j=d[g-3],k=d[g-2],l=d[g-1],m=d[g],n=1-(b-m)/(d[g-5]-m);n=this.curves.getCurvePercent(g/5-1,n);var o=h+(d[g+1]-h)*n,p=j+(d[g+2]-j)*n,q=k+(d[g+3]-k)*n,r=l+(d[g+4]-l)*n;1>c?(e.r+=(o-e.r)*c,e.g+=(p-e.g)*c,e.b+=(q-e.b)*c,e.a+=(r-e.a)*c):(e.r=o,e.g=p,e.b=q,e.a=r)}}},i.AttachmentTimeline=function(a){this.curves=new i.Curves(a),this.frames=[],this.frames.length=a,this.attachmentNames=[],this.attachmentNames.length=a},i.AttachmentTimeline.prototype={slotIndex:0,getFrameCount:function(){return this.frames.length},setFrame:function(a,b,c){this.frames[a]=b,this.attachmentNames[a]=c},apply:function(a,b){var c=this.frames;if(!(b<c[0])){var d;d=b>=c[c.length-1]?c.length-1:i.binarySearch(c,b,1)-1;var e=this.attachmentNames[d];a.slots[this.slotIndex].setAttachment(e?a.getAttachmentBySlotIndex(this.slotIndex,e):null)}}},i.SkeletonData=function(){this.bones=[],this.slots=[],this.skins=[],this.animations=[]},i.SkeletonData.prototype={defaultSkin:null,findBone:function(a){for(var b=this.bones,c=0,d=b.length;d>c;c++)if(b[c].name==a)return b[c];return null},findBoneIndex:function(a){for(var b=this.bones,c=0,d=b.length;d>c;c++)if(b[c].name==a)return c;return-1},findSlot:function(a){for(var b=this.slots,c=0,d=b.length;d>c;c++)if(b[c].name==a)return slot[c];return null},findSlotIndex:function(a){for(var b=this.slots,c=0,d=b.length;d>c;c++)if(b[c].name==a)return c;return-1},findSkin:function(a){for(var b=this.skins,c=0,d=b.length;d>c;c++)if(b[c].name==a)return b[c];return null},findAnimation:function(a){for(var b=this.animations,c=0,d=b.length;d>c;c++)if(b[c].name==a)return b[c];return null}},i.Skeleton=function(a){this.data=a,this.bones=[];for(var b=0,c=a.bones.length;c>b;b++){var d=a.bones[b],e=d.parent?this.bones[a.bones.indexOf(d.parent)]:null;this.bones.push(new i.Bone(d,e))}for(this.slots=[],this.drawOrder=[],b=0,c=a.slots.length;c>b;b++){var f=a.slots[b],g=this.bones[a.bones.indexOf(f.boneData)],h=new i.Slot(f,this,g);this.slots.push(h),this.drawOrder.push(h)}},i.Skeleton.prototype={x:0,y:0,skin:null,r:1,g:1,b:1,a:1,time:0,flipX:!1,flipY:!1,updateWorldTransform:function(){for(var a=this.flipX,b=this.flipY,c=this.bones,d=0,e=c.length;e>d;d++)c[d].updateWorldTransform(a,b)},setToSetupPose:function(){this.setBonesToSetupPose(),this.setSlotsToSetupPose()},setBonesToSetupPose:function(){for(var a=this.bones,b=0,c=a.length;c>b;b++)a[b].setToSetupPose()},setSlotsToSetupPose:function(){for(var a=this.slots,b=0,c=a.length;c>b;b++)a[b].setToSetupPose(b)},getRootBone:function(){return this.bones.length?this.bones[0]:null},findBone:function(a){for(var b=this.bones,c=0,d=b.length;d>c;c++)if(b[c].data.name==a)return b[c];return null},findBoneIndex:function(a){for(var b=this.bones,c=0,d=b.length;d>c;c++)if(b[c].data.name==a)return c;return-1},findSlot:function(a){for(var b=this.slots,c=0,d=b.length;d>c;c++)if(b[c].data.name==a)return b[c];return null},findSlotIndex:function(a){for(var b=this.slots,c=0,d=b.length;d>c;c++)if(b[c].data.name==a)return c;return-1},setSkinByName:function(a){var b=this.data.findSkin(a);if(!b)throw"Skin not found: "+a;this.setSkin(b)},setSkin:function(a){this.skin&&a&&a._attachAll(this,this.skin),this.skin=a},getAttachmentBySlotName:function(a,b){return this.getAttachmentBySlotIndex(this.data.findSlotIndex(a),b)},getAttachmentBySlotIndex:function(a,b){if(this.skin){var c=this.skin.getAttachment(a,b);if(c)return c}return this.data.defaultSkin?this.data.defaultSkin.getAttachment(a,b):null},setAttachment:function(a,b){for(var c=this.slots,d=0,e=c.size;e>d;d++){var f=c[d];if(f.data.name==a){var g=null;if(b&&(g=this.getAttachment(d,b),null==g))throw"Attachment not found: "+b+", for slot: "+a;return f.setAttachment(g),void 0}}throw"Slot not found: "+a},update:function(a){time+=a}},i.AttachmentType={region:0},i.RegionAttachment=function(){this.offset=[],this.offset.length=8,this.uvs=[],this.uvs.length=8},i.RegionAttachment.prototype={x:0,y:0,rotation:0,scaleX:1,scaleY:1,width:0,height:0,rendererObject:null,regionOffsetX:0,regionOffsetY:0,regionWidth:0,regionHeight:0,regionOriginalWidth:0,regionOriginalHeight:0,setUVs:function(a,b,c,d,e){var f=this.uvs;e?(f[2]=a,f[3]=d,f[4]=a,f[5]=b,f[6]=c,f[7]=b,f[0]=c,f[1]=d):(f[0]=a,f[1]=d,f[2]=a,f[3]=b,f[4]=c,f[5]=b,f[6]=c,f[7]=d)},updateOffset:function(){var a=this.width/this.regionOriginalWidth*this.scaleX,b=this.height/this.regionOriginalHeight*this.scaleY,c=-this.width/2*this.scaleX+this.regionOffsetX*a,d=-this.height/2*this.scaleY+this.regionOffsetY*b,e=c+this.regionWidth*a,f=d+this.regionHeight*b,g=this.rotation*Math.PI/180,h=Math.cos(g),i=Math.sin(g),j=c*h+this.x,k=c*i,l=d*h+this.y,m=d*i,n=e*h+this.x,o=e*i,p=f*h+this.y,q=f*i,r=this.offset;r[0]=j-m,r[1]=l+k,r[2]=j-q,r[3]=p+k,r[4]=n-q,r[5]=p+o,r[6]=n-m,r[7]=l+o},computeVertices:function(a,b,c,d){a+=c.worldX,b+=c.worldY;var e=c.m00,f=c.m01,g=c.m10,h=c.m11,i=this.offset;d[0]=i[0]*e+i[1]*f+a,d[1]=i[0]*g+i[1]*h+b,d[2]=i[2]*e+i[3]*f+a,d[3]=i[2]*g+i[3]*h+b,d[4]=i[4]*e+i[5]*f+a,d[5]=i[4]*g+i[5]*h+b,d[6]=i[6]*e+i[7]*f+a,d[7]=i[6]*g+i[7]*h+b}},i.AnimationStateData=function(a){this.skeletonData=a,this.animationToMixTime={}},i.AnimationStateData.prototype={defaultMix:0,setMixByName:function(a,b,c){var d=this.skeletonData.findAnimation(a);if(!d)throw"Animation not found: "+a;var e=this.skeletonData.findAnimation(b);if(!e)throw"Animation not found: "+b;this.setMix(d,e,c)},setMix:function(a,b,c){this.animationToMixTime[a.name+":"+b.name]=c},getMix:function(a,b){var c=this.animationToMixTime[a.name+":"+b.name];return c?c:this.defaultMix}},i.AnimationState=function(a){this.data=a,this.queue=[]},i.AnimationState.prototype={current:null,previous:null,currentTime:0,previousTime:0,currentLoop:!1,previousLoop:!1,mixTime:0,mixDuration:0,update:function(a){if(this.currentTime+=a,this.previousTime+=a,this.mixTime+=a,this.queue.length>0){var b=this.queue[0];this.currentTime>=b.delay&&(this._setAnimation(b.animation,b.loop),this.queue.shift())}},apply:function(a){if(this.current)if(this.previous){this.previous.apply(a,this.previousTime,this.previousLoop);var b=this.mixTime/this.mixDuration;b>=1&&(b=1,this.previous=null),this.current.mix(a,this.currentTime,this.currentLoop,b)}else this.current.apply(a,this.currentTime,this.currentLoop)},clearAnimation:function(){this.previous=null,this.current=null,this.queue.length=0},_setAnimation:function(a,b){this.previous=null,a&&this.current&&(this.mixDuration=this.data.getMix(this.current,a),this.mixDuration>0&&(this.mixTime=0,this.previous=this.current,this.previousTime=this.currentTime,this.previousLoop=this.currentLoop)),this.current=a,this.currentLoop=b,this.currentTime=0},setAnimationByName:function(a,b){var c=this.data.skeletonData.findAnimation(a);if(!c)throw"Animation not found: "+a;this.setAnimation(c,b)},setAnimation:function(a,b){this.queue.length=0,this._setAnimation(a,b)},addAnimationByName:function(a,b,c){var d=this.data.skeletonData.findAnimation(a);if(!d)throw"Animation not found: "+a;this.addAnimation(d,b,c)},addAnimation:function(a,b,c){var d={};if(d.animation=a,d.loop=b,!c||0>=c){var e=this.queue.length?this.queue[this.queue.length-1].animation:this.current;c=null!=e?e.duration-this.data.getMix(e,a)+(c||0):0}d.delay=c,this.queue.push(d)},isComplete:function(){return!this.current||this.currentTime>=this.current.duration}},i.SkeletonJson=function(a){this.attachmentLoader=a},i.SkeletonJson.prototype={scale:1,readSkeletonData:function(a){for(var b,c=new i.SkeletonData,d=a.bones,e=0,f=d.length;f>e;e++){var g=d[e],h=null;if(g.parent&&(h=c.findBone(g.parent),!h))throw"Parent bone not found: "+g.parent;b=new i.BoneData(g.name,h),b.length=(g.length||0)*this.scale,b.x=(g.x||0)*this.scale,b.y=(g.y||0)*this.scale,b.rotation=g.rotation||0,b.scaleX=g.scaleX||1,b.scaleY=g.scaleY||1,c.bones.push(b)}var j=a.slots;for(e=0,f=j.length;f>e;e++){var k=j[e];if(b=c.findBone(k.bone),!b)throw"Slot bone not found: "+k.bone;var l=new i.SlotData(k.name,b),m=k.color;m&&(l.r=i.SkeletonJson.toColor(m,0),l.g=i.SkeletonJson.toColor(m,1),l.b=i.SkeletonJson.toColor(m,2),l.a=i.SkeletonJson.toColor(m,3)),l.attachmentName=k.attachment,c.slots.push(l)}var n=a.skins;for(var o in n)if(n.hasOwnProperty(o)){var p=n[o],q=new i.Skin(o);for(var r in p)if(p.hasOwnProperty(r)){var s=c.findSlotIndex(r),t=p[r];for(var u in t)if(t.hasOwnProperty(u)){var v=this.readAttachment(q,u,t[u]);null!=v&&q.addAttachment(s,u,v)}}c.skins.push(q),"default"==q.name&&(c.defaultSkin=q)}var w=a.animations;for(var x in w)w.hasOwnProperty(x)&&this.readAnimation(x,w[x],c);return c},readAttachment:function(a,b,c){b=c.name||b;var d=i.AttachmentType[c.type||"region"];if(d==i.AttachmentType.region){var e=new i.RegionAttachment;return e.x=(c.x||0)*this.scale,e.y=(c.y||0)*this.scale,e.scaleX=c.scaleX||1,e.scaleY=c.scaleY||1,e.rotation=c.rotation||0,e.width=(c.width||32)*this.scale,e.height=(c.height||32)*this.scale,e.updateOffset(),e.rendererObject={},e.rendererObject.name=b,e.rendererObject.scale={},e.rendererObject.scale.x=e.scaleX,e.rendererObject.scale.y=e.scaleY,e.rendererObject.rotation=-e.rotation*Math.PI/180,e}throw"Unknown attachment type: "+d},readAnimation:function(a,b,c){var d,e,f,g,h,j,k,l=[],m=0,n=b.bones;for(var o in n)if(n.hasOwnProperty(o)){var p=c.findBoneIndex(o);if(-1==p)throw"Bone not found: "+o;var q=n[o];for(f in q)if(q.hasOwnProperty(f))if(h=q[f],"rotate"==f){for(e=new i.RotateTimeline(h.length),e.boneIndex=p,d=0,j=0,k=h.length;k>j;j++)g=h[j],e.setFrame(d,g.time,g.angle),i.SkeletonJson.readCurve(e,d,g),d++;l.push(e),m=Math.max(m,e.frames[2*e.getFrameCount()-2])}else{if("translate"!=f&&"scale"!=f)throw"Invalid timeline type for a bone: "+f+" ("+o+")";var r=1;for("scale"==f?e=new i.ScaleTimeline(h.length):(e=new i.TranslateTimeline(h.length),r=this.scale),e.boneIndex=p,d=0,j=0,k=h.length;k>j;j++){g=h[j];var s=(g.x||0)*r,t=(g.y||0)*r;e.setFrame(d,g.time,s,t),i.SkeletonJson.readCurve(e,d,g),d++}l.push(e),m=Math.max(m,e.frames[3*e.getFrameCount()-3])}}var u=b.slots;for(var v in u)if(u.hasOwnProperty(v)){var w=u[v],x=c.findSlotIndex(v);for(f in w)if(w.hasOwnProperty(f))if(h=w[f],"color"==f){for(e=new i.ColorTimeline(h.length),e.slotIndex=x,d=0,j=0,k=h.length;k>j;j++){g=h[j];var y=g.color,z=i.SkeletonJson.toColor(y,0),A=i.SkeletonJson.toColor(y,1),B=i.SkeletonJson.toColor(y,2),C=i.SkeletonJson.toColor(y,3);e.setFrame(d,g.time,z,A,B,C),i.SkeletonJson.readCurve(e,d,g),d++}l.push(e),m=Math.max(m,e.frames[5*e.getFrameCount()-5])}else{if("attachment"!=f)throw"Invalid timeline type for a slot: "+f+" ("+v+")";for(e=new i.AttachmentTimeline(h.length),e.slotIndex=x,d=0,j=0,k=h.length;k>j;j++)g=h[j],e.setFrame(d++,g.time,g.name);l.push(e),m=Math.max(m,e.frames[e.getFrameCount()-1])}}c.animations.push(new i.Animation(a,l,m))}},i.SkeletonJson.readCurve=function(a,b,c){var d=c.curve;d&&("stepped"==d?a.curves.setStepped(b):d instanceof Array&&a.curves.setCurve(b,d[0],d[1],d[2],d[3]))},i.SkeletonJson.toColor=function(a,b){if(8!=a.length)throw"Color hexidecimal length must be 8, recieved: "+a;return parseInt(a.substring(2*b,2),16)/255},i.Atlas=function(a,b){this.textureLoader=b,this.pages=[],this.regions=[];var c=new i.AtlasReader(a),d=[];d.length=4;for(var e=null;;){var f=c.readLine();if(null==f)break;if(f=c.trim(f),f.length)if(e){var g=new i.AtlasRegion;g.name=f,g.page=e,g.rotate="true"==c.readValue(),c.readTuple(d);var h=parseInt(d[0],10),j=parseInt(d[1],10);c.readTuple(d);var k=parseInt(d[0],10),l=parseInt(d[1],10);g.u=h/e.width,g.v=j/e.height,g.rotate?(g.u2=(h+l)/e.width,g.v2=(j+k)/e.height):(g.u2=(h+k)/e.width,g.v2=(j+l)/e.height),g.x=h,g.y=j,g.width=Math.abs(k),g.height=Math.abs(l),4==c.readTuple(d)&&(g.splits=[parseInt(d[0],10),parseInt(d[1],10),parseInt(d[2],10),parseInt(d[3],10)],4==c.readTuple(d)&&(g.pads=[parseInt(d[0],10),parseInt(d[1],10),parseInt(d[2],10),parseInt(d[3],10)],c.readTuple(d))),g.originalWidth=parseInt(d[0],10),g.originalHeight=parseInt(d[1],10),c.readTuple(d),g.offsetX=parseInt(d[0],10),g.offsetY=parseInt(d[1],10),g.index=parseInt(c.readValue(),10),this.regions.push(g)}else{e=new i.AtlasPage,e.name=f,e.format=i.Atlas.Format[c.readValue()],c.readTuple(d),e.minFilter=i.Atlas.TextureFilter[d[0]],e.magFilter=i.Atlas.TextureFilter[d[1]];var m=c.readValue();e.uWrap=i.Atlas.TextureWrap.clampToEdge,e.vWrap=i.Atlas.TextureWrap.clampToEdge,"x"==m?e.uWrap=i.Atlas.TextureWrap.repeat:"y"==m?e.vWrap=i.Atlas.TextureWrap.repeat:"xy"==m&&(e.uWrap=e.vWrap=i.Atlas.TextureWrap.repeat),b.load(e,f),this.pages.push(e)}else e=null}},i.Atlas.prototype={findRegion:function(a){for(var b=this.regions,c=0,d=b.length;d>c;c++)if(b[c].name==a)return b[c];return null},dispose:function(){for(var a=this.pages,b=0,c=a.length;c>b;b++)this.textureLoader.unload(a[b].rendererObject)},updateUVs:function(a){for(var b=this.regions,c=0,d=b.length;d>c;c++){var e=b[c];e.page==a&&(e.u=e.x/a.width,e.v=e.y/a.height,e.rotate?(e.u2=(e.x+e.height)/a.width,e.v2=(e.y+e.width)/a.height):(e.u2=(e.x+e.width)/a.width,e.v2=(e.y+e.height)/a.height))}}},i.Atlas.Format={alpha:0,intensity:1,luminanceAlpha:2,rgb565:3,rgba4444:4,rgb888:5,rgba8888:6},i.Atlas.TextureFilter={nearest:0,linear:1,mipMap:2,mipMapNearestNearest:3,mipMapLinearNearest:4,mipMapNearestLinear:5,mipMapLinearLinear:6},i.Atlas.TextureWrap={mirroredRepeat:0,clampToEdge:1,repeat:2},i.AtlasPage=function(){},i.AtlasPage.prototype={name:null,format:null,minFilter:null,magFilter:null,uWrap:null,vWrap:null,rendererObject:null,width:0,height:0},i.AtlasRegion=function(){},i.AtlasRegion.prototype={page:null,name:null,x:0,y:0,width:0,height:0,u:0,v:0,u2:0,v2:0,offsetX:0,offsetY:0,originalWidth:0,originalHeight:0,index:0,rotate:!1,splits:null,pads:null},i.AtlasReader=function(a){this.lines=a.split(/\r\n|\r|\n/)},i.AtlasReader.prototype={index:0,trim:function(a){return a.replace(/^\s+|\s+$/g,"")},readLine:function(){return this.index>=this.lines.length?null:this.lines[this.index++]},readValue:function(){var a=this.readLine(),b=a.indexOf(":");if(-1==b)throw"Invalid line: "+a;return this.trim(a.substring(b+1))},readTuple:function(a){var b=this.readLine(),c=b.indexOf(":");if(-1==c)throw"Invalid line: "+b;for(var d=0,e=c+1;3>d;d++){var f=b.indexOf(",",e);if(-1==f){if(!d)throw"Invalid line: "+b;break}a[d]=this.trim(b.substr(e,f-e)),e=f+1}return a[d]=this.trim(b.substring(e)),d+1}},i.AtlasAttachmentLoader=function(a){this.atlas=a},i.AtlasAttachmentLoader.prototype={newAttachment:function(a,b,c){switch(b){case i.AttachmentType.region:var d=this.atlas.findRegion(c);if(!d)throw"Region not found in atlas: "+c+" ("+b+")";var e=new i.RegionAttachment(c);return e.rendererObject=d,e.setUVs(d.u,d.v,d.u2,d.v2,d.rotate),e.regionOffsetX=d.offsetX,e.regionOffsetY=d.offsetY,e.regionWidth=d.width,e.regionHeight=d.height,e.regionOriginalWidth=d.originalWidth,e.regionOriginalHeight=d.originalHeight,e}throw"Unknown attachment type: "+b}},i.Bone.yDown=!0,d.AnimCache={},d.Spine=function(a){if(d.DisplayObjectContainer.call(this),this.spineData=d.AnimCache[a],!this.spineData)throw new Error("Spine data must be preloaded using PIXI.SpineLoader or PIXI.AssetLoader: "+a);this.skeleton=new i.Skeleton(this.spineData),this.skeleton.updateWorldTransform(),this.stateData=new i.AnimationStateData(this.spineData),this.state=new i.AnimationState(this.stateData),this.slotContainers=[];for(var b=0,c=this.skeleton.drawOrder.length;c>b;b++){var e=this.skeleton.drawOrder[b],f=e.attachment,g=new d.DisplayObjectContainer;if(this.slotContainers.push(g),this.addChild(g),f instanceof i.RegionAttachment){var h=f.rendererObject.name,j=this.createSprite(e,f.rendererObject);e.currentSprite=j,e.currentSpriteName=h,g.addChild(j)}}},d.Spine.prototype=Object.create(d.DisplayObjectContainer.prototype),d.Spine.prototype.constructor=d.Spine,d.Spine.prototype.updateTransform=function(){this.lastTime=this.lastTime||Date.now();var a=.001*(Date.now()-this.lastTime);this.lastTime=Date.now(),this.state.update(a),this.state.apply(this.skeleton),this.skeleton.updateWorldTransform();for(var b=this.skeleton.drawOrder,c=0,e=b.length;e>c;c++){var f=b[c],g=f.attachment,h=this.slotContainers[c];if(g instanceof i.RegionAttachment){if(g.rendererObject&&(!f.currentSpriteName||f.currentSpriteName!=g.name)){var j=g.rendererObject.name;if(void 0!==f.currentSprite&&(f.currentSprite.visible=!1),f.sprites=f.sprites||{},void 0!==f.sprites[j])f.sprites[j].visible=!0;else{var k=this.createSprite(f,g.rendererObject);h.addChild(k)}f.currentSprite=f.sprites[j],f.currentSpriteName=j}h.visible=!0;var l=f.bone;h.position.x=l.worldX+g.x*l.m00+g.y*l.m01,h.position.y=l.worldY+g.x*l.m10+g.y*l.m11,h.scale.x=l.worldScaleX,h.scale.y=l.worldScaleY,h.rotation=-(f.bone.worldRotation*Math.PI/180)}else h.visible=!1}d.DisplayObjectContainer.prototype.updateTransform.call(this)},d.Spine.prototype.createSprite=function(a,b){var c=d.TextureCache[b.name]?b.name:b.name+".png",e=new d.Sprite(d.Texture.fromFrame(c));return e.scale=b.scale,e.rotation=b.rotation,e.anchor.x=e.anchor.y=.5,a.sprites=a.sprites||{},a.sprites[b.name]=e,e},d.BaseTextureCache={},d.texturesToUpdate=[],d.texturesToDestroy=[],d.BaseTextureCacheIdGenerator=0,d.BaseTexture=function(a,b){if(d.EventTarget.call(this),this.width=100,this.height=100,this.scaleMode=b||d.scaleModes.DEFAULT,this.hasLoaded=!1,this.source=a,this.id=d.BaseTextureCacheIdGenerator++,this._glTextures=[],a){if((this.source.complete||this.source.getContext)&&this.source.width&&this.source.height)this.hasLoaded=!0,this.width=this.source.width,this.height=this.source.height,d.texturesToUpdate.push(this);else{var c=this;this.source.onload=function(){c.hasLoaded=!0,c.width=c.source.width,c.height=c.source.height,d.texturesToUpdate.push(c),c.dispatchEvent({type:"loaded",content:c})}}this.imageUrl=null,this._powerOf2=!1}},d.BaseTexture.prototype.constructor=d.BaseTexture,d.BaseTexture.prototype.destroy=function(){this.imageUrl&&(delete d.BaseTextureCache[this.imageUrl],this.imageUrl=null,this.source.src=null),this.source=null,d.texturesToDestroy.push(this)},d.BaseTexture.prototype.updateSourceImage=function(a){this.hasLoaded=!1,this.source.src=null,this.source.src=a},d.BaseTexture.fromImage=function(a,b,c){var e=d.BaseTextureCache[a];if(void 0===b&&-1===a.indexOf("data:")&&(b=!0),!e){var f=new Image;b&&(f.crossOrigin=""),f.src=a,e=new d.BaseTexture(f,c),e.imageUrl=a,d.BaseTextureCache[a]=e
}return e},d.BaseTexture.fromCanvas=function(a,b){a._pixiId||(a._pixiId="canvas_"+d.TextureCacheIdGenerator++);var c=d.BaseTextureCache[a._pixiId];return c||(c=new d.BaseTexture(a,b),d.BaseTextureCache[a._pixiId]=c),c},d.TextureCache={},d.FrameCache={},d.TextureCacheIdGenerator=0,d.Texture=function(a,b){if(d.EventTarget.call(this),b||(this.noFrame=!0,b=new d.Rectangle(0,0,1,1)),a instanceof d.Texture&&(a=a.baseTexture),this.baseTexture=a,this.frame=b,this.trim=null,this.scope=this,this._uvs=null,a.hasLoaded)this.noFrame&&(b=new d.Rectangle(0,0,a.width,a.height)),this.setFrame(b);else{var c=this;a.addEventListener("loaded",function(){c.onBaseTextureLoaded()})}},d.Texture.prototype.constructor=d.Texture,d.Texture.prototype.onBaseTextureLoaded=function(){var a=this.baseTexture;a.removeEventListener("loaded",this.onLoaded),this.noFrame&&(this.frame=new d.Rectangle(0,0,a.width,a.height)),this.setFrame(this.frame),this.scope.dispatchEvent({type:"update",content:this})},d.Texture.prototype.destroy=function(a){a&&this.baseTexture.destroy()},d.Texture.prototype.setFrame=function(a){if(this.frame=a,this.width=a.width,this.height=a.height,a.x+a.width>this.baseTexture.width||a.y+a.height>this.baseTexture.height)throw new Error("Texture Error: frame does not fit inside the base Texture dimensions "+this);this.updateFrame=!0,d.Texture.frameUpdates.push(this)},d.Texture.prototype._updateWebGLuvs=function(){this._uvs||(this._uvs=new d.TextureUvs);var a=this.frame,b=this.baseTexture.width,c=this.baseTexture.height;this._uvs.x0=a.x/b,this._uvs.y0=a.y/c,this._uvs.x1=(a.x+a.width)/b,this._uvs.y1=a.y/c,this._uvs.x2=(a.x+a.width)/b,this._uvs.y2=(a.y+a.height)/c,this._uvs.x3=a.x/b,this._uvs.y3=(a.y+a.height)/c},d.Texture.fromImage=function(a,b,c){var e=d.TextureCache[a];return e||(e=new d.Texture(d.BaseTexture.fromImage(a,b,c)),d.TextureCache[a]=e),e},d.Texture.fromFrame=function(a){var b=d.TextureCache[a];if(!b)throw new Error('The frameId "'+a+'" does not exist in the texture cache ');return b},d.Texture.fromCanvas=function(a,b){var c=d.BaseTexture.fromCanvas(a,b);return new d.Texture(c)},d.Texture.addTextureToCache=function(a,b){d.TextureCache[b]=a},d.Texture.removeTextureFromCache=function(a){var b=d.TextureCache[a];return delete d.TextureCache[a],delete d.BaseTextureCache[a],b},d.Texture.frameUpdates=[],d.TextureUvs=function(){this.x0=0,this.y0=0,this.x1=0,this.y1=0,this.x2=0,this.y2=0,this.x3=0,this.y4=0},d.RenderTexture=function(a,b,c,e){if(d.EventTarget.call(this),this.width=a||100,this.height=b||100,this.frame=new d.Rectangle(0,0,this.width,this.height),this.baseTexture=new d.BaseTexture,this.baseTexture.width=this.width,this.baseTexture.height=this.height,this.baseTexture._glTextures=[],this.baseTexture.scaleMode=e||d.scaleModes.DEFAULT,this.baseTexture.hasLoaded=!0,this.renderer=c||d.defaultRenderer,this.renderer.type===d.WEBGL_RENDERER){var f=this.renderer.gl;this.textureBuffer=new d.FilterTexture(f,this.width,this.height,this.baseTexture.scaleMode),this.baseTexture._glTextures[f.id]=this.textureBuffer.texture,this.render=this.renderWebGL,this.projection=new d.Point(this.width/2,-this.height/2)}else this.render=this.renderCanvas,this.textureBuffer=new d.CanvasBuffer(this.width,this.height),this.baseTexture.source=this.textureBuffer.canvas;d.Texture.frameUpdates.push(this)},d.RenderTexture.prototype=Object.create(d.Texture.prototype),d.RenderTexture.prototype.constructor=d.RenderTexture,d.RenderTexture.prototype.resize=function(a,b){if(this.width=a,this.height=b,this.frame.width=this.width,this.frame.height=this.height,this.renderer.type===d.WEBGL_RENDERER){this.projection.x=this.width/2,this.projection.y=-this.height/2;var c=this.renderer.gl;c.bindTexture(c.TEXTURE_2D,this.baseTexture._glTextures[c.id]),c.texImage2D(c.TEXTURE_2D,0,c.RGBA,this.width,this.height,0,c.RGBA,c.UNSIGNED_BYTE,null)}else this.textureBuffer.resize(this.width,this.height);d.Texture.frameUpdates.push(this)},d.RenderTexture.prototype.renderWebGL=function(a,b,c){var e=this.renderer.gl;e.colorMask(!0,!0,!0,!0),e.viewport(0,0,this.width,this.height),e.bindFramebuffer(e.FRAMEBUFFER,this.textureBuffer.frameBuffer),c&&this.textureBuffer.clear();var f=a.children,g=a.worldTransform;a.worldTransform=d.RenderTexture.tempMatrix,a.worldTransform.d=-1,a.worldTransform.ty=-2*this.projection.y,b&&(a.worldTransform.tx=b.x,a.worldTransform.ty-=b.y);for(var h=0,i=f.length;i>h;h++)f[h].updateTransform();d.WebGLRenderer.updateTextures(),this.renderer.renderDisplayObject(a,this.projection,this.textureBuffer.frameBuffer),a.worldTransform=g},d.RenderTexture.prototype.renderCanvas=function(a,b,c){var e=a.children,f=a.worldTransform;a.worldTransform=d.RenderTexture.tempMatrix,b&&(a.worldTransform.tx=b.x,a.worldTransform.ty=b.y);for(var g=0,h=e.length;h>g;g++)e[g].updateTransform();c&&this.textureBuffer.clear();var i=this.textureBuffer.context;this.renderer.renderDisplayObject(a,i),i.setTransform(1,0,0,1,0,0),a.worldTransform=f},d.RenderTexture.tempMatrix=new d.Matrix,d.AssetLoader=function(a,b){d.EventTarget.call(this),this.assetURLs=a,this.crossorigin=b,this.loadersByType={jpg:d.ImageLoader,jpeg:d.ImageLoader,png:d.ImageLoader,gif:d.ImageLoader,json:d.JsonLoader,atlas:d.AtlasLoader,anim:d.SpineLoader,xml:d.BitmapFontLoader,fnt:d.BitmapFontLoader}},d.AssetLoader.prototype.constructor=d.AssetLoader,d.AssetLoader.prototype._getDataType=function(a){var b="data:",c=a.slice(0,b.length).toLowerCase();if(c===b){var d=a.slice(b.length),e=d.indexOf(",");if(-1===e)return null;var f=d.slice(0,e).split(";")[0];return f&&"text/plain"!==f.toLowerCase()?f.split("/").pop().toLowerCase():"txt"}return null},d.AssetLoader.prototype.load=function(){function a(a){b.onAssetLoaded(a.content)}var b=this;this.loadCount=this.assetURLs.length;for(var c=0;c<this.assetURLs.length;c++){var d=this.assetURLs[c],e=this._getDataType(d);e||(e=d.split("?").shift().split(".").pop().toLowerCase());var f=this.loadersByType[e];if(!f)throw new Error(e+" is an unsupported file type");var g=new f(d,this.crossorigin);g.addEventListener("loaded",a),g.load()}},d.AssetLoader.prototype.onAssetLoaded=function(a){this.loadCount--,this.dispatchEvent({type:"onProgress",content:this,loader:a}),this.onProgress&&this.onProgress(a),this.loadCount||(this.dispatchEvent({type:"onComplete",content:this}),this.onComplete&&this.onComplete())},d.JsonLoader=function(a,b){d.EventTarget.call(this),this.url=a,this.crossorigin=b,this.baseUrl=a.replace(/[^\/]*$/,""),this.loaded=!1},d.JsonLoader.prototype.constructor=d.JsonLoader,d.JsonLoader.prototype.load=function(){var a=this;window.XDomainRequest?(this.ajaxRequest=new window.XDomainRequest,this.ajaxRequest.timeout=3e3,this.ajaxRequest.onerror=function(){a.onError()},this.ajaxRequest.ontimeout=function(){a.onError()},this.ajaxRequest.onprogress=function(){}):this.ajaxRequest=window.XMLHttpRequest?new window.XMLHttpRequest:new window.ActiveXObject("Microsoft.XMLHTTP"),this.ajaxRequest.onload=function(){a.onJSONLoaded()},this.ajaxRequest.open("GET",this.url,!0),this.ajaxRequest.send()},d.JsonLoader.prototype.onJSONLoaded=function(){if(!this.ajaxRequest.responseText)return this.onError(),void 0;if(this.json=JSON.parse(this.ajaxRequest.responseText),this.json.frames){var a=this,b=this.baseUrl+this.json.meta.image,c=new d.ImageLoader(b,this.crossorigin),e=this.json.frames;this.texture=c.texture.baseTexture,c.addEventListener("loaded",function(){a.onLoaded()});for(var f in e){var g=e[f].frame;if(g&&(d.TextureCache[f]=new d.Texture(this.texture,{x:g.x,y:g.y,width:g.w,height:g.h}),e[f].trimmed)){var h=d.TextureCache[f],j=e[f].sourceSize,k=e[f].spriteSourceSize;h.trim=new d.Rectangle(k.x,k.y,j.w,j.h)}}c.load()}else if(this.json.bones){var l=new i.SkeletonJson,m=l.readSkeletonData(this.json);d.AnimCache[this.url]=m,this.onLoaded()}else this.onLoaded()},d.JsonLoader.prototype.onLoaded=function(){this.loaded=!0,this.dispatchEvent({type:"loaded",content:this})},d.JsonLoader.prototype.onError=function(){this.dispatchEvent({type:"error",content:this})},d.AtlasLoader=function(a,b){d.EventTarget.call(this),this.url=a,this.baseUrl=a.replace(/[^\/]*$/,""),this.crossorigin=b,this.loaded=!1},d.AtlasLoader.constructor=d.AtlasLoader,d.AtlasLoader.prototype.load=function(){this.ajaxRequest=new d.AjaxRequest,this.ajaxRequest.onreadystatechange=this.onAtlasLoaded.bind(this),this.ajaxRequest.open("GET",this.url,!0),this.ajaxRequest.overrideMimeType&&this.ajaxRequest.overrideMimeType("application/json"),this.ajaxRequest.send(null)},d.AtlasLoader.prototype.onAtlasLoaded=function(){if(4===this.ajaxRequest.readyState)if(200===this.ajaxRequest.status||-1===window.location.href.indexOf("http")){this.atlas={meta:{image:[]},frames:[]};var a=this.ajaxRequest.responseText.split(/\r?\n/),b=-3,c=0,e=null,f=!1,g=0,h=0,i=this.onLoaded.bind(this);for(g=0;g<a.length;g++)if(a[g]=a[g].replace(/^\s+|\s+$/g,""),""===a[g]&&(f=g+1),a[g].length>0){if(f===g)this.atlas.meta.image.push(a[g]),c=this.atlas.meta.image.length-1,this.atlas.frames.push({}),b=-3;else if(b>0)if(b%7===1)null!=e&&(this.atlas.frames[c][e.name]=e),e={name:a[g],frame:{}};else{var j=a[g].split(" ");if(b%7===3)e.frame.x=Number(j[1].replace(",","")),e.frame.y=Number(j[2]);else if(b%7===4)e.frame.w=Number(j[1].replace(",","")),e.frame.h=Number(j[2]);else if(b%7===5){var k={x:0,y:0,w:Number(j[1].replace(",","")),h:Number(j[2])};k.w>e.frame.w||k.h>e.frame.h?(e.trimmed=!0,e.realSize=k):e.trimmed=!1}}b++}if(null!=e&&(this.atlas.frames[c][e.name]=e),this.atlas.meta.image.length>0){for(this.images=[],h=0;h<this.atlas.meta.image.length;h++){var l=this.baseUrl+this.atlas.meta.image[h],m=this.atlas.frames[h];this.images.push(new d.ImageLoader(l,this.crossorigin));for(g in m){var n=m[g].frame;n&&(d.TextureCache[g]=new d.Texture(this.images[h].texture.baseTexture,{x:n.x,y:n.y,width:n.w,height:n.h}),m[g].trimmed&&(d.TextureCache[g].realSize=m[g].realSize,d.TextureCache[g].trim.x=0,d.TextureCache[g].trim.y=0))}}for(this.currentImageId=0,h=0;h<this.images.length;h++)this.images[h].addEventListener("loaded",i);this.images[this.currentImageId].load()}else this.onLoaded()}else this.onError()},d.AtlasLoader.prototype.onLoaded=function(){this.images.length-1>this.currentImageId?(this.currentImageId++,this.images[this.currentImageId].load()):(this.loaded=!0,this.dispatchEvent({type:"loaded",content:this}))},d.AtlasLoader.prototype.onError=function(){this.dispatchEvent({type:"error",content:this})},d.SpriteSheetLoader=function(a,b){d.EventTarget.call(this),this.url=a,this.crossorigin=b,this.baseUrl=a.replace(/[^\/]*$/,""),this.texture=null,this.frames={}},d.SpriteSheetLoader.prototype.constructor=d.SpriteSheetLoader,d.SpriteSheetLoader.prototype.load=function(){var a=this,b=new d.JsonLoader(this.url,this.crossorigin);b.addEventListener("loaded",function(b){a.json=b.content.json,a.onLoaded()}),b.load()},d.SpriteSheetLoader.prototype.onLoaded=function(){this.dispatchEvent({type:"loaded",content:this})},d.ImageLoader=function(a,b){d.EventTarget.call(this),this.texture=d.Texture.fromImage(a,b),this.frames=[]},d.ImageLoader.prototype.constructor=d.ImageLoader,d.ImageLoader.prototype.load=function(){if(this.texture.baseTexture.hasLoaded)this.onLoaded();else{var a=this;this.texture.baseTexture.addEventListener("loaded",function(){a.onLoaded()})}},d.ImageLoader.prototype.onLoaded=function(){this.dispatchEvent({type:"loaded",content:this})},d.ImageLoader.prototype.loadFramedSpriteSheet=function(a,b,c){this.frames=[];for(var e=Math.floor(this.texture.width/a),f=Math.floor(this.texture.height/b),g=0,h=0;f>h;h++)for(var i=0;e>i;i++,g++){var j=new d.Texture(this.texture,{x:i*a,y:h*b,width:a,height:b});this.frames.push(j),c&&(d.TextureCache[c+"-"+g]=j)}if(this.texture.baseTexture.hasLoaded)this.onLoaded();else{var k=this;this.texture.baseTexture.addEventListener("loaded",function(){k.onLoaded()})}},d.BitmapFontLoader=function(a,b){d.EventTarget.call(this),this.url=a,this.crossorigin=b,this.baseUrl=a.replace(/[^\/]*$/,""),this.texture=null},d.BitmapFontLoader.prototype.constructor=d.BitmapFontLoader,d.BitmapFontLoader.prototype.load=function(){this.ajaxRequest=new d.AjaxRequest;var a=this;this.ajaxRequest.onreadystatechange=function(){a.onXMLLoaded()},this.ajaxRequest.open("GET",this.url,!0),this.ajaxRequest.overrideMimeType&&this.ajaxRequest.overrideMimeType("application/xml"),this.ajaxRequest.send(null)},d.BitmapFontLoader.prototype.onXMLLoaded=function(){if(4===this.ajaxRequest.readyState&&(200===this.ajaxRequest.status||-1===window.location.protocol.indexOf("http"))){var a=this.ajaxRequest.responseXML;if(!a||/MSIE 9/i.test(navigator.userAgent)||navigator.isCocoonJS)if("function"==typeof window.DOMParser){var b=new DOMParser;a=b.parseFromString(this.ajaxRequest.responseText,"text/xml")}else{var c=document.createElement("div");c.innerHTML=this.ajaxRequest.responseText,a=c}var e=this.baseUrl+a.getElementsByTagName("page")[0].getAttribute("file"),f=new d.ImageLoader(e,this.crossorigin);this.texture=f.texture.baseTexture;var g={},h=a.getElementsByTagName("info")[0],i=a.getElementsByTagName("common")[0];g.font=h.getAttribute("face"),g.size=parseInt(h.getAttribute("size"),10),g.lineHeight=parseInt(i.getAttribute("lineHeight"),10),g.chars={};for(var j=a.getElementsByTagName("char"),k=0;k<j.length;k++){var l=parseInt(j[k].getAttribute("id"),10),m=new d.Rectangle(parseInt(j[k].getAttribute("x"),10),parseInt(j[k].getAttribute("y"),10),parseInt(j[k].getAttribute("width"),10),parseInt(j[k].getAttribute("height"),10));g.chars[l]={xOffset:parseInt(j[k].getAttribute("xoffset"),10),yOffset:parseInt(j[k].getAttribute("yoffset"),10),xAdvance:parseInt(j[k].getAttribute("xadvance"),10),kerning:{},texture:d.TextureCache[l]=new d.Texture(this.texture,m)}}var n=a.getElementsByTagName("kerning");for(k=0;k<n.length;k++){var o=parseInt(n[k].getAttribute("first"),10),p=parseInt(n[k].getAttribute("second"),10),q=parseInt(n[k].getAttribute("amount"),10);g.chars[p].kerning[o]=q}d.BitmapText.fonts[g.font]=g;var r=this;f.addEventListener("loaded",function(){r.onLoaded()}),f.load()}},d.BitmapFontLoader.prototype.onLoaded=function(){this.dispatchEvent({type:"loaded",content:this})},d.SpineLoader=function(a,b){d.EventTarget.call(this),this.url=a,this.crossorigin=b,this.loaded=!1},d.SpineLoader.prototype.constructor=d.SpineLoader,d.SpineLoader.prototype.load=function(){var a=this,b=new d.JsonLoader(this.url,this.crossorigin);b.addEventListener("loaded",function(b){a.json=b.content.json,a.onLoaded()}),b.load()},d.SpineLoader.prototype.onLoaded=function(){this.loaded=!0,this.dispatchEvent({type:"loaded",content:this})},d.AbstractFilter=function(a,b){this.passes=[this],this.shaders=[],this.dirty=!0,this.padding=0,this.uniforms=b||{},this.fragmentSrc=a||[]},d.AlphaMaskFilter=function(a){d.AbstractFilter.call(this),this.passes=[this],a.baseTexture._powerOf2=!0,this.uniforms={mask:{type:"sampler2D",value:a},mapDimensions:{type:"2f",value:{x:1,y:5112}},dimensions:{type:"4fv",value:[0,0,0,0]}},a.baseTexture.hasLoaded?(this.uniforms.mask.value.x=a.width,this.uniforms.mask.value.y=a.height):(this.boundLoadedFunction=this.onTextureLoaded.bind(this),a.baseTexture.on("loaded",this.boundLoadedFunction)),this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform sampler2D mask;","uniform sampler2D uSampler;","uniform vec2 offset;","uniform vec4 dimensions;","uniform vec2 mapDimensions;","void main(void) {","   vec2 mapCords = vTextureCoord.xy;","   mapCords += (dimensions.zw + offset)/ dimensions.xy ;","   mapCords.y *= -1.0;","   mapCords.y += 1.0;","   mapCords *= dimensions.xy / mapDimensions;","   vec4 original =  texture2D(uSampler, vTextureCoord);","   float maskAlpha =  texture2D(mask, mapCords).r;","   original *= maskAlpha;","   gl_FragColor =  original;","}"]},d.AlphaMaskFilter.prototype=Object.create(d.AbstractFilter.prototype),d.AlphaMaskFilter.prototype.constructor=d.AlphaMaskFilter,d.AlphaMaskFilter.prototype.onTextureLoaded=function(){this.uniforms.mapDimensions.value.x=this.uniforms.mask.value.width,this.uniforms.mapDimensions.value.y=this.uniforms.mask.value.height,this.uniforms.mask.value.baseTexture.off("loaded",this.boundLoadedFunction)},Object.defineProperty(d.AlphaMaskFilter.prototype,"map",{get:function(){return this.uniforms.mask.value},set:function(a){this.uniforms.mask.value=a}}),d.ColorMatrixFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={matrix:{type:"mat4",value:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform float invert;","uniform mat4 matrix;","uniform sampler2D uSampler;","void main(void) {","   gl_FragColor = texture2D(uSampler, vTextureCoord) * matrix;","}"]},d.ColorMatrixFilter.prototype=Object.create(d.AbstractFilter.prototype),d.ColorMatrixFilter.prototype.constructor=d.ColorMatrixFilter,Object.defineProperty(d.ColorMatrixFilter.prototype,"matrix",{get:function(){return this.uniforms.matrix.value},set:function(a){this.uniforms.matrix.value=a}}),d.GrayFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={gray:{type:"1f",value:1}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform sampler2D uSampler;","uniform float gray;","void main(void) {","   gl_FragColor = texture2D(uSampler, vTextureCoord);","   gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.2126*gl_FragColor.r + 0.7152*gl_FragColor.g + 0.0722*gl_FragColor.b), gray);","}"]},d.GrayFilter.prototype=Object.create(d.AbstractFilter.prototype),d.GrayFilter.prototype.constructor=d.GrayFilter,Object.defineProperty(d.GrayFilter.prototype,"gray",{get:function(){return this.uniforms.gray.value},set:function(a){this.uniforms.gray.value=a}}),d.DisplacementFilter=function(a){d.AbstractFilter.call(this),this.passes=[this],a.baseTexture._powerOf2=!0,this.uniforms={displacementMap:{type:"sampler2D",value:a},scale:{type:"2f",value:{x:30,y:30}},offset:{type:"2f",value:{x:0,y:0}},mapDimensions:{type:"2f",value:{x:1,y:5112}},dimensions:{type:"4fv",value:[0,0,0,0]}},a.baseTexture.hasLoaded?(this.uniforms.mapDimensions.value.x=a.width,this.uniforms.mapDimensions.value.y=a.height):(this.boundLoadedFunction=this.onTextureLoaded.bind(this),a.baseTexture.on("loaded",this.boundLoadedFunction)),this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform sampler2D displacementMap;","uniform sampler2D uSampler;","uniform vec2 scale;","uniform vec2 offset;","uniform vec4 dimensions;","uniform vec2 mapDimensions;","void main(void) {","   vec2 mapCords = vTextureCoord.xy;","   mapCords += (dimensions.zw + offset)/ dimensions.xy ;","   mapCords.y *= -1.0;","   mapCords.y += 1.0;","   vec2 matSample = texture2D(displacementMap, mapCords).xy;","   matSample -= 0.5;","   matSample *= scale;","   matSample /= mapDimensions;","   gl_FragColor = texture2D(uSampler, vec2(vTextureCoord.x + matSample.x, vTextureCoord.y + matSample.y));","   gl_FragColor.rgb = mix( gl_FragColor.rgb, gl_FragColor.rgb, 1.0);","   vec2 cord = vTextureCoord;","}"]},d.DisplacementFilter.prototype=Object.create(d.AbstractFilter.prototype),d.DisplacementFilter.prototype.constructor=d.DisplacementFilter,d.DisplacementFilter.prototype.onTextureLoaded=function(){this.uniforms.mapDimensions.value.x=this.uniforms.displacementMap.value.width,this.uniforms.mapDimensions.value.y=this.uniforms.displacementMap.value.height,this.uniforms.displacementMap.value.baseTexture.off("loaded",this.boundLoadedFunction)},Object.defineProperty(d.DisplacementFilter.prototype,"map",{get:function(){return this.uniforms.displacementMap.value},set:function(a){this.uniforms.displacementMap.value=a}}),Object.defineProperty(d.DisplacementFilter.prototype,"scale",{get:function(){return this.uniforms.scale.value},set:function(a){this.uniforms.scale.value=a}}),Object.defineProperty(d.DisplacementFilter.prototype,"offset",{get:function(){return this.uniforms.offset.value},set:function(a){this.uniforms.offset.value=a}}),d.PixelateFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={invert:{type:"1f",value:0},dimensions:{type:"4fv",value:new Float32Array([1e4,100,10,10])},pixelSize:{type:"2f",value:{x:10,y:10}}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform vec2 testDim;","uniform vec4 dimensions;","uniform vec2 pixelSize;","uniform sampler2D uSampler;","void main(void) {","   vec2 coord = vTextureCoord;","   vec2 size = dimensions.xy/pixelSize;","   vec2 color = floor( ( vTextureCoord * size ) ) / size + pixelSize/dimensions.xy * 0.5;","   gl_FragColor = texture2D(uSampler, color);","}"]},d.PixelateFilter.prototype=Object.create(d.AbstractFilter.prototype),d.PixelateFilter.prototype.constructor=d.PixelateFilter,Object.defineProperty(d.PixelateFilter.prototype,"size",{get:function(){return this.uniforms.pixelSize.value},set:function(a){this.dirty=!0,this.uniforms.pixelSize.value=a}}),d.BlurXFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={blur:{type:"1f",value:1/512}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform float blur;","uniform sampler2D uSampler;","void main(void) {","   vec4 sum = vec4(0.0);","   sum += texture2D(uSampler, vec2(vTextureCoord.x - 4.0*blur, vTextureCoord.y)) * 0.05;","   sum += texture2D(uSampler, vec2(vTextureCoord.x - 3.0*blur, vTextureCoord.y)) * 0.09;","   sum += texture2D(uSampler, vec2(vTextureCoord.x - 2.0*blur, vTextureCoord.y)) * 0.12;","   sum += texture2D(uSampler, vec2(vTextureCoord.x - blur, vTextureCoord.y)) * 0.15;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y)) * 0.16;","   sum += texture2D(uSampler, vec2(vTextureCoord.x + blur, vTextureCoord.y)) * 0.15;","   sum += texture2D(uSampler, vec2(vTextureCoord.x + 2.0*blur, vTextureCoord.y)) * 0.12;","   sum += texture2D(uSampler, vec2(vTextureCoord.x + 3.0*blur, vTextureCoord.y)) * 0.09;","   sum += texture2D(uSampler, vec2(vTextureCoord.x + 4.0*blur, vTextureCoord.y)) * 0.05;","   gl_FragColor = sum;","}"]},d.BlurXFilter.prototype=Object.create(d.AbstractFilter.prototype),d.BlurXFilter.prototype.constructor=d.BlurXFilter,Object.defineProperty(d.BlurXFilter.prototype,"blur",{get:function(){return this.uniforms.blur.value/(1/7e3)},set:function(a){this.dirty=!0,this.uniforms.blur.value=1/7e3*a}}),d.BlurYFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={blur:{type:"1f",value:1/512}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform float blur;","uniform sampler2D uSampler;","void main(void) {","   vec4 sum = vec4(0.0);","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y - 4.0*blur)) * 0.05;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y - 3.0*blur)) * 0.09;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y - 2.0*blur)) * 0.12;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y - blur)) * 0.15;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y)) * 0.16;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y + blur)) * 0.15;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y + 2.0*blur)) * 0.12;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y + 3.0*blur)) * 0.09;","   sum += texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y + 4.0*blur)) * 0.05;","   gl_FragColor = sum;","}"]},d.BlurYFilter.prototype=Object.create(d.AbstractFilter.prototype),d.BlurYFilter.prototype.constructor=d.BlurYFilter,Object.defineProperty(d.BlurYFilter.prototype,"blur",{get:function(){return this.uniforms.blur.value/(1/7e3)},set:function(a){this.uniforms.blur.value=1/7e3*a}}),d.BlurFilter=function(){this.blurXFilter=new d.BlurXFilter,this.blurYFilter=new d.BlurYFilter,this.passes=[this.blurXFilter,this.blurYFilter]},Object.defineProperty(d.BlurFilter.prototype,"blur",{get:function(){return this.blurXFilter.blur},set:function(a){this.blurXFilter.blur=this.blurYFilter.blur=a}}),Object.defineProperty(d.BlurFilter.prototype,"blurX",{get:function(){return this.blurXFilter.blur},set:function(a){this.blurXFilter.blur=a}}),Object.defineProperty(d.BlurFilter.prototype,"blurY",{get:function(){return this.blurYFilter.blur},set:function(a){this.blurYFilter.blur=a}}),d.InvertFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={invert:{type:"1f",value:1}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform float invert;","uniform sampler2D uSampler;","void main(void) {","   gl_FragColor = texture2D(uSampler, vTextureCoord);","   gl_FragColor.rgb = mix( (vec3(1)-gl_FragColor.rgb) * gl_FragColor.a, gl_FragColor.rgb, 1.0 - invert);","}"]},d.InvertFilter.prototype=Object.create(d.AbstractFilter.prototype),d.InvertFilter.prototype.constructor=d.InvertFilter,Object.defineProperty(d.InvertFilter.prototype,"invert",{get:function(){return this.uniforms.invert.value},set:function(a){this.uniforms.invert.value=a}}),d.SepiaFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={sepia:{type:"1f",value:1}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform float sepia;","uniform sampler2D uSampler;","const mat3 sepiaMatrix = mat3(0.3588, 0.7044, 0.1368, 0.2990, 0.5870, 0.1140, 0.2392, 0.4696, 0.0912);","void main(void) {","   gl_FragColor = texture2D(uSampler, vTextureCoord);","   gl_FragColor.rgb = mix( gl_FragColor.rgb, gl_FragColor.rgb * sepiaMatrix, sepia);","}"]},d.SepiaFilter.prototype=Object.create(d.AbstractFilter.prototype),d.SepiaFilter.prototype.constructor=d.SepiaFilter,Object.defineProperty(d.SepiaFilter.prototype,"sepia",{get:function(){return this.uniforms.sepia.value},set:function(a){this.uniforms.sepia.value=a}}),d.TwistFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={radius:{type:"1f",value:.5},angle:{type:"1f",value:5},offset:{type:"2f",value:{x:.5,y:.5}}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform vec4 dimensions;","uniform sampler2D uSampler;","uniform float radius;","uniform float angle;","uniform vec2 offset;","void main(void) {","   vec2 coord = vTextureCoord - offset;","   float distance = length(coord);","   if (distance < radius) {","       float ratio = (radius - distance) / radius;","       float angleMod = ratio * ratio * angle;","       float s = sin(angleMod);","       float c = cos(angleMod);","       coord = vec2(coord.x * c - coord.y * s, coord.x * s + coord.y * c);","   }","   gl_FragColor = texture2D(uSampler, coord+offset);","}"]},d.TwistFilter.prototype=Object.create(d.AbstractFilter.prototype),d.TwistFilter.prototype.constructor=d.TwistFilter,Object.defineProperty(d.TwistFilter.prototype,"offset",{get:function(){return this.uniforms.offset.value},set:function(a){this.dirty=!0,this.uniforms.offset.value=a}}),Object.defineProperty(d.TwistFilter.prototype,"radius",{get:function(){return this.uniforms.radius.value},set:function(a){this.dirty=!0,this.uniforms.radius.value=a}}),Object.defineProperty(d.TwistFilter.prototype,"angle",{get:function(){return this.uniforms.angle.value},set:function(a){this.dirty=!0,this.uniforms.angle.value=a}}),d.ColorStepFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={step:{type:"1f",value:5}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform sampler2D uSampler;","uniform float step;","void main(void) {","   vec4 color = texture2D(uSampler, vTextureCoord);","   color = floor(color * step) / step;","   gl_FragColor = color;","}"]},d.ColorStepFilter.prototype=Object.create(d.AbstractFilter.prototype),d.ColorStepFilter.prototype.constructor=d.ColorStepFilter,Object.defineProperty(d.ColorStepFilter.prototype,"step",{get:function(){return this.uniforms.step.value},set:function(a){this.uniforms.step.value=a}}),d.DotScreenFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={scale:{type:"1f",value:1},angle:{type:"1f",value:5},dimensions:{type:"4fv",value:[0,0,0,0]}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform vec4 dimensions;","uniform sampler2D uSampler;","uniform float angle;","uniform float scale;","float pattern() {","   float s = sin(angle), c = cos(angle);","   vec2 tex = vTextureCoord * dimensions.xy;","   vec2 point = vec2(","       c * tex.x - s * tex.y,","       s * tex.x + c * tex.y","   ) * scale;","   return (sin(point.x) * sin(point.y)) * 4.0;","}","void main() {","   vec4 color = texture2D(uSampler, vTextureCoord);","   float average = (color.r + color.g + color.b) / 3.0;","   gl_FragColor = vec4(vec3(average * 10.0 - 5.0 + pattern()), color.a);","}"]},d.DotScreenFilter.prototype=Object.create(d.AbstractFilter.prototype),d.DotScreenFilter.prototype.constructor=d.DotScreenFilter,Object.defineProperty(d.DotScreenFilter.prototype,"scale",{get:function(){return this.uniforms.scale.value},set:function(a){this.dirty=!0,this.uniforms.scale.value=a}}),Object.defineProperty(d.DotScreenFilter.prototype,"angle",{get:function(){return this.uniforms.angle.value},set:function(a){this.dirty=!0,this.uniforms.angle.value=a}}),d.CrossHatchFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={blur:{type:"1f",value:1/512}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform float blur;","uniform sampler2D uSampler;","void main(void) {","    float lum = length(texture2D(uSampler, vTextureCoord.xy).rgb);","    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);","    if (lum < 1.00) {","        if (mod(gl_FragCoord.x + gl_FragCoord.y, 10.0) == 0.0) {","            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);","        }","    }","    if (lum < 0.75) {","        if (mod(gl_FragCoord.x - gl_FragCoord.y, 10.0) == 0.0) {","            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);","        }","    }","    if (lum < 0.50) {","        if (mod(gl_FragCoord.x + gl_FragCoord.y - 5.0, 10.0) == 0.0) {","            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);","        }","    }","    if (lum < 0.3) {","        if (mod(gl_FragCoord.x - gl_FragCoord.y - 5.0, 10.0) == 0.0) {","            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);","        }","    }","}"]},d.CrossHatchFilter.prototype=Object.create(d.AbstractFilter.prototype),d.CrossHatchFilter.prototype.constructor=d.BlurYFilter,Object.defineProperty(d.CrossHatchFilter.prototype,"blur",{get:function(){return this.uniforms.blur.value/(1/7e3)},set:function(a){this.uniforms.blur.value=1/7e3*a}}),d.RGBSplitFilter=function(){d.AbstractFilter.call(this),this.passes=[this],this.uniforms={red:{type:"2f",value:{x:20,y:20}},green:{type:"2f",value:{x:-20,y:20}},blue:{type:"2f",value:{x:20,y:-20}},dimensions:{type:"4fv",value:[0,0,0,0]}},this.fragmentSrc=["precision mediump float;","varying vec2 vTextureCoord;","varying vec4 vColor;","uniform vec2 red;","uniform vec2 green;","uniform vec2 blue;","uniform vec4 dimensions;","uniform sampler2D uSampler;","void main(void) {","   gl_FragColor.r = texture2D(uSampler, vTextureCoord + red/dimensions.xy).r;","   gl_FragColor.g = texture2D(uSampler, vTextureCoord + green/dimensions.xy).g;","   gl_FragColor.b = texture2D(uSampler, vTextureCoord + blue/dimensions.xy).b;","   gl_FragColor.a = texture2D(uSampler, vTextureCoord).a;","}"]},d.RGBSplitFilter.prototype=Object.create(d.AbstractFilter.prototype),d.RGBSplitFilter.prototype.constructor=d.RGBSplitFilter,Object.defineProperty(d.RGBSplitFilter.prototype,"angle",{get:function(){return this.uniforms.blur.value/(1/7e3)},set:function(a){this.uniforms.blur.value=1/7e3*a}}),"undefined"!=typeof exports?("undefined"!=typeof module&&module.exports&&(exports=module.exports=d),exports.PIXI=d):"undefined"!=typeof define&&define.amd?define(d):c.PIXI=d
}).call(this);
},{}],4:[function(require,module,exports){
var Actor, HasPlugins, HasSignals, Repeater, Tween, Tweenable, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __slice = [].slice,
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

cg = require('cg');

Tween = require('Tween');

HasSignals = require('util/HasSignals');

HasPlugins = require('util/HasPlugins');

Tweenable = require('Tweenable');

Repeater = (function() {
  function Repeater() {}

  return Repeater;

})();


/**
An `Actor` is an active entity within your game.

@class cg.Actor
@extends cg.gfx.DisplayObjectContainer
@uses cg.util.HasSignals

@constructor
@param [properties] {Object}
A set of name/value pairs that will be copied into the resulting `Actor` object.

@param [properties.controls] {ControlMap|String}
When a `String` is provided, it is converted to `cg.input.controls[properties.controls]` for convenience.
 */

Actor = (function(_super) {
  __extends(Actor, _super);

  Actor.mixin(HasSignals);

  Actor.mixin(HasPlugins);

  Actor.plugin(Tweenable);

  Actor.prototype.onMixin = function() {
    return Actor.__defineProperties.call(this);
  };

  Actor.prototype.__applyProperties = function(properties) {
    var k, v;
    if (properties == null) {
      properties = {};
    }
    if (this.__classes == null) {
      this.__classes = [];
    }
    for (k in properties) {
      if (!__hasProp.call(properties, k)) continue;
      v = properties[k];
      this[k] = v;
    }
    return this.className != null ? this.className : this.className = '';
  };

  function Actor(properties) {
    var tex;
    if (properties == null) {
      properties = {};
    }
    this.__defineProperties();
    this.defineProperty('__internalID', {
      value: cg.getNextID()
    });
    tex = properties.texture || this.texture;
    this.texture = tex;
    Actor.__super__.constructor.call(this, this.texture);
    delete properties.texture;
    this.__applyProperties(properties);
    if (this.anim && this.texture !== this.anim.texture) {
      this.texture = this.anim.texture;
    }
    this.__plugins_preInit();
    if (typeof this.init === "function") {
      this.init();
    }
    this.__plugins_init();
  }

  Actor.prototype.valueOf = function() {
    return this.__internalID;
  };


  /**
  Set the value of a property on this actor.
  
  @method set
  @param [property, value] {String, <Any>} Two arguments: property name and value you wish to change.
  @param [values] {Object} One argument: key-value hash of all properties you wish to set.
  @chainable
   */

  Actor.prototype.set = function() {
    var args, key, val, values;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (args.length === 1) {
      values = args[0];
    } else {
      values = {};
      values[args[0]] = args[1];
    }
    for (key in values) {
      if (!__hasProp.call(values, key)) continue;
      val = values[key];
      this[key] = val;
    }
    return this;
  };


  /**
  Reset a potentially-destroyed actor, optionally re-initializing some properties.
  
  Often used in conjunction with [`Pool::spawn`](cg.util.HasPooling.Pool.html#method_spawn).
  
  @method reset
  @param [properties] {Object} A set of properties/values to be applied to the actor.
  @chainable
   */

  Actor.prototype._reset = function(properties) {
    if (properties == null) {
      properties = {};
    }
    this._destroyed = false;
    this.__applyProperties(properties);
    this.__plugins_preReset();
    if (typeof this.reset === "function") {
      this.reset();
    }
    this.__plugins_reset();
    return this;
  };

  Actor.prototype.__getId = function() {
    return this.__id;
  };

  Actor.prototype.__setId = function(val) {
    return this.__id = cg._setActorByID(this, val);
  };

  Actor.prototype.__getControls = function() {
    return this.__controls;
  };

  Actor.prototype.__setControls = function(val) {
    var _ref, _ref1;
    if ((_ref = this.__controls) != null) {
      if (typeof _ref.removeListener === "function") {
        _ref.removeListener(this);
      }
    }
    this.__controls = val;
    return (_ref1 = this.__controls) != null ? typeof _ref1.addListener === "function" ? _ref1.addListener(this) : void 0 : void 0;
  };

  Actor.prototype.__getClassName = function() {
    var _ref, _ref1;
    return (_ref = (_ref1 = this.__classes) != null ? _ref1.join(' ') : void 0) != null ? _ref : '';
  };

  Actor.prototype.__setClassName = function(val) {
    var className, __classes, _i, _j, _len, _ref, _results;
    if (this.__classes == null) {
      this.__classes = [];
    }
    if (val == null) {
      val = '';
    }
    __classes = val.split(' ');
    _ref = this.__classes;
    for (_i = _ref.length - 1; _i >= 0; _i += -1) {
      className = _ref[_i];
      if (__indexOf.call(__classes, className) >= 0) {
        continue;
      }
      this.removeClass(className);
    }
    _results = [];
    for (_j = 0, _len = __classes.length; _j < _len; _j++) {
      className = __classes[_j];
      if (__indexOf.call(this.__classes, className) >= 0) {
        continue;
      }
      _results.push(this.addClass(className));
    }
    return _results;
  };

  Actor.prototype.__getPaused = function() {
    return !!this.__paused;
  };

  Actor.prototype.__setPaused = function(value) {
    if (this.__paused === value) {
      return;
    }
    if (value) {
      this.broadcast('pause');
    } else {
      this.broadcast('resume');
    }
    return this.__paused = value;
  };

  Actor.prototype.__getWidth = function() {
    if (this.texture === cg.gfx.Sprite.DUMMY_TEXTURE) {
      return this._width;
    } else {
      return this.scale.x * this.texture.frame.width;
    }
  };

  Actor.prototype.__setWidth = function(value) {
    if (this.texture !== cg.gfx.Sprite.DUMMY_TEXTURE) {
      this.scale.x = value / this.texture.frame.width;
    }
    return this._width = value;
  };

  Actor.prototype.__getHeight = function() {
    if (this.texture === cg.gfx.Sprite.DUMMY_TEXTURE) {
      return this._height;
    } else {
      return this.scale.y * this.texture.frame.height;
    }
  };

  Actor.prototype.__setHeight = function(value) {
    if (this.texture !== cg.gfx.Sprite.DUMMY_TEXTURE) {
      this.scale.y = value / this.texture.frame.height;
    }
    return this._height = value;
  };

  Actor.prototype.__defineProperties = function() {

    /**
    A unique identifier for this actor; this can later be used to retrieve
    the actor with [`cg('#<id>')`](Game.html#method_default).
    
    @property id
    @type {String}
    @example
        actor.id = 'player'
        console.assert(actor === cg('#player')); // true
     */
    var _className, _controls, _id, _paused;
    _id = this.id;
    this.defineProperty('id', {
      get: this.__getId,
      set: this.__setId
    });
    if (_id != null) {
      this.id = _id;
    }

    /**
    A set of input controls that this actor shall listen to.
    
    Changing this property to a valid `ControlMap` will automatically register
    this actor with [`this.controls.addListener(this)`](cg.input.ControlMap.html#method_addListener), meaning that any
    action events that occur in the `ControlMap` will be redirected to this actor so
    that they may be captured with [`on`](#method_on).
    
    @example
        this.controls = new ControlMap({jump: 'space'}); // Spacebar triggers the jump event
        this.on('jump', this.jump);
    @property controls
    @type {ControlMap}
     */
    _controls = this.controls;
    this.defineProperty('controls', {
      get: this.__getControls,
      set: this.__setControls
    });
    if (_controls != null) {
      this.controls = _controls;
    }

    /**
    A string that represents what class(es) this actor belongs to, if any.
    
    This string may represent more than one class by separating classes with spaces.
    
    Updating this property automatically adds and removes this actor from
    the appropriate class groups in `cg.classes` for convenient access.
    
    See also:
    
      - [`addClass`](#method_addClass)
      - [`removeClass`](#method_removeClass)
      - [`hasClass`](#method_hasClass)
    
    @example
        this.className = 'fruit produce';
    
        if (cg.classes.fruit.contains(this)) {
          cg.log('Delicious fruit!');
        }
    
        if (cg.classes.produce.contains(this)) {
          cg.log('Fresh produce!');
        }
    
        // Result:
        // > Delicious fruit!
        // > Fresh produce!
    
    @property className
    @type {String}
     */
    _className = this.className;
    this.defineProperty('className', {
      get: this.__getClassName,
      set: this.__setClassName
    });
    if (_className != null) {
      this.className = _className;
    }

    /**
    If `true`, [`_update`](#method__update) will not be executed during the main loop.
    
    Furthermore, any event listeners added to this actor with [`on`](#method_on) will be
    suppressed whenever `paused` is set to `true`.
    
    See also:
    
      * [`pause`](#method_pause)
      * [`resume`](#method_resume)
      * [`event:pause`](#event_pause)
      * [`event:resume`](#event_resume)
    @property paused {Boolean}
     */
    _paused = this.paused;
    this.defineProperty('paused', {
      get: this.__getPaused,
      set: this.__setPaused
    });
    if (_paused != null) {
      this.paused = _paused;
    }
    this.defineProperty('width', {
      get: this.__getWidth,
      set: this.__setWidth
    });
    return this.defineProperty('height', {
      get: this.__getHeight,
      set: this.__setHeight
    });
  };

  Actor.__defineProperties = function() {

    /**
    The horizontal position relative to `this.parent`.
    
    @property x
    @type {Number}
     */

    /**
    The vertical position relative to `this.parent`.
    
    @property y
    @type {Number}
     */

    /**
    Like [`paused`](#property_paused) but recursively factors in parent's paused status as well.
    
    `paused` could still be true, but if the parent is paused, this actor will not `_update()`.
    
    @property worldPaused
    @type {Boolean}
    @readonly
     */
    this.defineProperty('worldPaused', {
      get: function() {
        var _ref;
        return this.paused || !!((_ref = this.parent) != null ? _ref.worldPaused : void 0);
      }
    });

    /**
    Shorthand for `this.controls.actions`.
    
    @property actions
    @type {Object}
    @readonly
     */
    return this.defineProperty('actions', {
      get: function() {
        var _ref;
        return (_ref = this.controls) != null ? _ref.actions : void 0;
      }
    });
  };

  Actor.__defineProperties();


  /**
  Associate a new class name with this actor.
  
  Whitespace is removed. To add multiple classes, make multiple calls to [`addClass`](#method_addClass),
   or set [`className`](#property_className) directly.
  
  Empty class names are ignored.
  
  `this` will be added to the appropriate class group of `cg.classes`.
  
  [`className`](#property_className) will automatically be updated to reflect the addition of this class.
  
  @example
      this.addClass('fruit');
      this.addClass('produce');
  
      if (cg.classes.fruit.contains(this)) {
        cg.log('Delicious fruit!');
      }
  
      if (cg.classes.produce.contains(this)) {
        cg.log('Fresh produce!');
      }
  
      cg.log('this.className: "' + this.className + '"');
  
      // Result:
      // > Delicious fruit!
      // > Fresh produce!
      // > this.className = "fruit produce" // NOTE: Order of names may vary.
  
  @method addClass
  @param newClass {String} The name of the class to associate with this actor.
  @chainable
   */

  Actor.prototype.addClass = function(newClass) {
    newClass = newClass.replace(/\s/g, '').replace(/#/g, '');
    if (newClass.length === 0) {
      return this;
    }
    this.__classes.push(newClass);
    cg._addActorToClassGroup(this, newClass);
    return this;
  };


  /**
  Remove association of a class name from this actor.
  
  Empty class names are ignored.
  
  `this` will be removed from the appropriate class group of `cg.classes`.
  
  [`className`](#property_className) will automatically be updated to reflect the removal of this class.
  
  @example
      this.className = 'fruit produce';
      this.removeClass('fruit');
      this.removeClass('produce');
  
      if (cg.classes.fruit.contains(this)) {
        cg.log('Delicious fruit!');
      } else {
        cg.log('Not fruit!');
      }
  
      if (cg.classes.produce.contains(this)) {
        cg.log('Fresh produce!');
      } else {
        cg.log('Not produce!');
      }
  
      cg.log('this.className: "' + this.className + '"');
  
      // Result:
      // > Not fruit!
      // > Not produce!
      // > this.className: ""
  
  @method removeClass
  @param className {String} The name of the class to no longer associate with this actor.
  @chainable
   */

  Actor.prototype.removeClass = function(className) {
    var idx;
    idx = this.__classes.indexOf(className);
    if (idx < 0) {
      return this;
    }
    this.__classes.splice(idx, 1);
    cg._removeActorFromClassGroup(this, className);
    return this;
  };


  /**
  Query whether this actor is associated with a given class name.
  
  @method hasClass
  @param className {String} The name of the class to query.
  @return {Boolean} `true` if this actor is associated with `className`; `false` otherwise.
   */

  Actor.prototype.hasClass = function(className) {
    return this.__classes.indexOf(className) >= 0;
  };

  Actor.prototype.__hideOrShow = function(arg, params, cb, cbx) {
    var k, v, _ref;
    params.duration = 0;
    if (typeof arg === 'number') {
      params.duration = arg;
    } else if (typeof arg === 'object') {
      for (k in arg) {
        if (!__hasProp.call(arg, k)) continue;
        v = arg[k];
        params[k] = v;
      }
    }
    params.immediate = false;
    if ((_ref = this.__hideShowTween) != null) {
      _ref.stop();
    }
    this.__hideShowTween = new Tween(this, params);
    this.__hideShowTween.start().then(cb).then(cbx);
    return this.__hideShowTween;
  };

  Actor.prototype.__hide = function() {
    return this.visible = false;
  };


  /**
  Hide this actor, with an optional "fade out" animation.
  
  @example
      // Immediately hide the actor.
      this.hide();
  
  @example
      // Fade the actor out for 500 ms and then hide it.
      this.hide(500);
  
  @example
      // After the actor is hidden, execute a function.
      this.hide(500).then(function() {
        cg.log('I have finished fading out!');
      });
  
  @example
      // Hide the actor using a custom tween animation.
      var tweenParams = {
        values: {
          scaleX: 0 // "Squeeze" the actor horizontally
        },
        duration: 250
      };
  
      this.hide(tweenParams);
  
  @method hide
  @param [duration|params] {Number(milliseconds)|Object}
  One of the following:
  
    1. `duration`: The number of milliseconds for the "fade out" animation to take before hiding the actor.
    2. `params`: An object whose properties will be used to create a `Tween` that will execute before finally hiding this actor.
  @param [callback] {Function} A callback to execute once the "fade out" animation completes.
  
  See also:
  
    * [`show`](#method_show)
    * [`tween`](#method_tween)
  
  @return {Promise} A promise that will be resolved once this actor is completely hidden.
   */

  Actor.prototype.hide = function(arg, cb) {
    var params;
    params = {
      values: {
        alpha: 0
      }
    };
    return this.__hideOrShow(arg, params, this.__hide, cb);
  };

  Actor.prototype.__show = function() {};


  /**
  Show (unhide) this actor, with an optional "fade in" animation.
  
  @example
      // Immediately show the actor.
      this.show();
  
  @example
      // Show the actor, then fade it in for 500 ms.
      this.show(500);
  
  @example
      // After the actor fades in, execute a function.
      this.show(500).then(function() {
        cg.log('I have finished fading in!');
      });
  
  @example
      // Show the actor using a custom tween animation.
      var tweenParams = {
        values: {
          scaleX: 1 // "Open" the actor horizontally
        },
        duration: 250
      };
  
      this.scaleX = 0;
      this.show(tweenParams);
  
  @method show
  @param [duration|params] {Number(milliseconds)|Object}
  One of the following:
  1. `duration`: The number of milliseconds for the "fade in" animation to take after showing the actor.
  2. `params`: An object whose properties will be used to create a `Tween` that will execute after showing this actor.
  
  @return {Promise} A promise that will be resolved once the "fade in" animation completes.
  
  See also:
  
    * [`hide`](#method_hide)
    * [`tween`](#method_tween)
   */

  Actor.prototype.show = function(arg, cb) {
    var params;
    this.visible = true;
    params = {
      values: {
        alpha: 1
      }
    };
    return this.__hideOrShow(arg, params, this.__show, cb);
  };


  /**
  Prevent [`_update`](#method__update) from being called.
  
  Also suppresses any event listeners that bound with [`on`](#method_on).
  
  @method pause
  @chainable
   */


  /**
  Fired *immediately* when [`pause`](#method_pause) is called.
  
  @event pause
   */

  Actor.prototype.pause = function() {
    this.paused = true;
    return this;
  };


  /**
  Allow [`_update`](#method__update) to be called.
  
  @method resume
  @chainable
   */


  /**
  Fired *immediately* when [`resume`](#method_resume) is called.
  
  @event resume
   */

  Actor.prototype.resume = function() {
    this.paused = false;
    return this;
  };


  /**
  Remove this actor from the game.
  
  `_update()` will never be executed after `destroy()` is called.
  
  This `Actor` is finally removed from the game's display list at the end of the game's `_update` cycle.
  @method destroy
  @chainable
   */


  /**
  Fired *immediately* when `this.destroy()` is called.
  
  @event destroy
   */

  Actor.prototype.destroy = function() {
    var c, _i, _len, _ref;
    if (this._destroyed) {
      return;
    }
    this.__plugins_preDispose();
    this.emit('destroy', this);
    this.broadcast('__destroy__', this);
    this._destroyed = true;
    this.visible = false;
    cg._dispose(this);
    this.className = '';
    this.id = '';
    _ref = this.children;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      c = _ref[_i];
      if (c != null) {
        if (typeof c.destroy === "function") {
          c.destroy();
        }
      }
    }
    return this;
  };

  Actor.prototype._dispose = function() {
    var _ref, _ref1;
    this._disposeListeners();
    if ((_ref = this.controls) != null) {
      if (typeof _ref.removeListener === "function") {
        _ref.removeListener(this);
      }
    }
    if ((_ref1 = this.parent) != null) {
      if (typeof _ref1.removeChild === "function") {
        _ref1.removeChild(this);
      }
    }
    this.__plugins_dispose();
    return typeof this.dispose === "function" ? this.dispose() : void 0;
  };


  /**
  Called once every update-cycle of the game, unless the [`paused`](#property_paused) is `true`.
  
  Any [`children`](#property_children) that aren't paused get updated here, therefore it is essential
  to call `super` in any `_update` methods that are inherited from this one.
  
  **Important Note**: Since paused children are not updated, neither are any of *their* children, whether
  the children themselves are paused or not.
  @protected
  @method _update
   */


  /**
  Fired *immediately* before `_update` is called.
  @event update
   */

  Actor.prototype._update = function() {
    var c, _i, _len, _ref;
    this.__plugins_preUpdate();
    _ref = this.children;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      c = _ref[_i];
      if (c.paused || c._destroyed) {
        continue;
      }
      if (typeof c.emit === "function") {
        c.emit('update');
      }
      if (typeof c._update === "function") {
        c._update();
      }
    }
    if (this.anim != null) {
      this.anim.update();
      this.texture = this.anim.texture;
    }
    if (typeof this.update === "function") {
      this.update();
    }
    this.__plugins_update();
  };

  Actor.prototype._draw = function() {
    var c, _i, _len, _ref;
    if (typeof this.draw === "function") {
      this.draw();
    }
    this.__plugins_draw();
    _ref = this.children;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      c = _ref[_i];
      if (c.paused || c._destroyed) {
        continue;
      }
      if (typeof c.emit === "function") {
        c.emit('draw');
      }
      if (typeof c._draw === "function") {
        c._draw();
      }
    }
  };

  Actor.prototype.__blinkOn = function() {
    var _ref;
    this.visible = true;
    if ((_ref = this.__blinkDelay) != null) {
      _ref.stop();
    }
    return this.__blinkDelay = this.delay(this.__blinkOnDuration, this.__blinkOff);
  };

  Actor.prototype.__blinkOff = function() {
    var _ref;
    this.visible = false;
    if ((_ref = this.__blinkDelay) != null) {
      _ref.stop();
    }
    return this.__blinkDelay = this.delay(this.__blinkOffDuration, this.__blinkOn);
  };

  Actor.prototype.__blinkStop = function() {
    var _ref;
    if ((_ref = this.__blinkDelay) != null) {
      _ref.stop();
    }
    return this.visible = true;
  };


  /**
  Cause this actor to blink on and off by periodically toggling `this.visible`.
  
  To cancel blinking, pass a "falsy" value (i.e. `false`, `0`).
  
  @method blink
  @param [onDuration=500] {Number(milliseconds)} The duration to blink "on"
  @param [offDuration=onDuration] {Number(milliseconds)} The duration to blink "off"
   */

  Actor.prototype.blink = function(__blinkOnDuration, __blinkOffDuration, lifetime) {
    this.__blinkOnDuration = __blinkOnDuration != null ? __blinkOnDuration : 500;
    this.__blinkOffDuration = __blinkOffDuration != null ? __blinkOffDuration : this.__blinkOnDuration;
    if (!this.__blinkOnDuration) {
      this.__blinkStop();
      return this;
    }
    if (this.visible) {
      this.__blinkOff();
    } else {
      this.__blinkOn();
    }
    if (typeof lifetime === 'number') {
      this.delay(lifetime, this.__blinkStop);
    }
    return this;
  };

  Actor.prototype.__animateStop = function() {
    var tween, _i, _len, _ref, _ref1;
    if ((_ref = this.__animateTween) != null) {
      _ref.stop();
    }
    if (this.__animateTweens != null) {
      _ref1 = this.__animateTweens;
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        tween = _ref1[_i];
        tween.stop();
      }
    }
    return delete this.__animateTweens;
  };


  /**
  TODOC
  
  @method animate
  @example
       * Pulse on and off...
      this.animate(
        ['alpha', 0],
        ['alpha', 1]
      )
   */

  Actor.prototype.animate = function() {
    var argList, argLists, cb, count, previousTween, tween, _fn, _i;
    argLists = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (arguments[0] === false) {
      this.__animateStop();
      return this;
    }
    previousTween = null;
    this.__animateTweens = [];
    _fn = function(previousTween) {
      return tween.on('complete', function() {
        if (previousTween != null) {
          return this.__animateTween = previousTween.start();
        }
      });
    };
    for (_i = argLists.length - 1; _i >= 0; _i += -1) {
      argList = argLists[_i];
      if ((typeof cb === "undefined" || cb === null) && (typeof argList === 'function')) {
        cb = argList;
        continue;
      }
      if ((typeof count === "undefined" || count === null) && (typeof argList === 'number')) {
        count = argList;
        continue;
      }
      if (cg.util.isArray(argList)) {
        tween = (function(func, args, ctor) {
          ctor.prototype = func.prototype;
          var child = new ctor, result = func.apply(child, args);
          return Object(result) === result ? result : child;
        })(Tween, [this].concat(__slice.call(argList)), function(){});
      } else {
        tween = new Tween(this, argList);
      }
      tween.stop();
      this.__animateTweens.unshift(tween);
      _fn(previousTween);
      previousTween = tween;
    }
    this.__animateTweens[this.__animateTweens.length - 1].on('complete', function() {
      if (cb != null) {
        cb.call(this);
      }
      if ((count == null) || --count > 0) {
        return this.__animateTween = tween.start();
      }
    });
    this.__animateTween = tween != null ? tween.start() : void 0;
    return this;
  };


  /**
  Invoke a function on this actor after a specified duration.
  
  To cancel the callback function, call `stop()` on the returned `Tween` object.
  
  @example
      t = this.delay(1000, function() {
        cg.log("One second has passed!");
      }).then(function() {
        cg.log("Two")
      });
  
      t.stop(); // This will cancel the delay.
  @method delay
  @param time {Number(milliseconds)} The time to wait before invoking `func`.
  @param func {Function} The function to call; the value of `this` inside the body of the function will be this `Actor` instance.
  @return {cg.Tween} The `Tween` object that controls this delay.
   */


  /*
  TODO: make it easy to chain tweens and delays and other self-functions
  eg:
  
      this.delay(100).tween({
        values: { alpha: 0 },
        duration: 100
      }).delay(100).then(function() {
        cg.log('all done!'); // Called after 300ms (delay(100), tween(100), delay(100))
      });
   */

  Actor.prototype.delay = function(time, func) {
    var t;
    t = this.tween({
      duration: time,
      immediate: false
    });
    t.start().then(func);
    return t;
  };


  /**
  Repeatedly invoke a function on this actor at a fixed interval.
  
  @method repeat
  @param time {Number(milliseconds)} The period between each invocation of `func`.
  @param func {Function} The function to call; the value of `this` inside the body of the function will be this `Actor` instance.
  @param [count] {Number} If specified, the number of times for `func` to be invoked.
  @return {Repeater} A reference to the repeater; pass to [`cancelRepeat`](#method_cancelRepeat) to stop repeating.
   */

  Actor.prototype.repeat = function() {
    var count, func, ref, time, _i;
    time = arguments[0], count = 4 <= arguments.length ? __slice.call(arguments, 1, _i = arguments.length - 2) : (_i = 1, []), func = arguments[_i++], ref = arguments[_i++];
    count = count[0];
    if (ref == null) {
      ref = new Repeater;
    }
    ref.hook = this.delay(time, function() {
      if ((func.call(this) !== false) && ((count == null) || count-- > 0)) {
        return this.repeat(time, count, func, ref);
      }
    });
    return ref;
  };

  Actor.prototype.cancelRepeat = function(ref) {
    var _ref;
    if (ref != null) {
      if ((_ref = ref.hook) != null) {
        if (typeof _ref.stop === "function") {
          _ref.stop();
        }
      }
    }
  };


  /**
  Calculate a vector going from this actor to some other point.
  
  @method vecTo
  @param other {Object} something that has `x` and `y` properties, like an actor or a vector.
   */

  Actor.prototype.vecTo = function(other) {
    return cg.math.Vector2.prototype.sub.call(other, this);
  };


  /**
  Shorthand for `this.vecTo(cg.input.mouse)`.
  
  @method vecToMouse
   */

  Actor.prototype.vecToMouse = function() {
    return this.vecTo(cg.input.mouse);
  };

  Actor.prototype.hitTest = function(gx, gy) {
    var a00, a01, a02, a10, a11, a12, height, id, width, worldTransform, x, x1, y, y1, _ref, _ref1, _ref2, _ref3, _ref4, _ref5;
    if (!this.worldVisible) {
      return false;
    }
    gx *= cg.stage.scaleX;
    gy *= cg.stage.scaleY;
    worldTransform = this.worldTransform;
    a00 = worldTransform.a;
    a01 = worldTransform.b;
    a02 = worldTransform.tx;
    a10 = worldTransform.c;
    a11 = worldTransform.d;
    a12 = worldTransform.ty;
    id = 1 / (a00 * a11 + a01 * -a10);
    x = a11 * id * gx + -a01 * id * gy + (a12 * a01 - a02 * a11) * id;
    y = a00 * id * gy + -a10 * id * gx + (-a12 * a00 + a02 * a10) * id;
    if (this.hitArea && this.hitArea.contains) {
      if (this.hitArea.contains(x, y)) {
        return true;
      }
      return false;
    }
    width = (_ref = (_ref1 = this.width / this.scaleX) != null ? _ref1 : (_ref2 = this.texture) != null ? _ref2.frame.width : void 0) != null ? _ref : 0;
    height = (_ref3 = (_ref4 = this.height / this.scaleY) != null ? _ref4 : (_ref5 = this.texture) != null ? _ref5.frame.height : void 0) != null ? _ref3 : 0;
    x1 = -width * this.anchor.x;
    y1 = void 0;
    if (x > x1 && x < x1 + width) {
      y1 = -height * this.anchor.y;
      if (y > y1 && y < y1 + height) {
        return true;
      }
    }
    return false;
  };

  return Actor;

})(cg.gfx.Sprite);

module.exports = Actor;


},{"Tween":13,"Tweenable":14,"cg":15,"util/HasPlugins":70,"util/HasSignals":72}],5:[function(require,module,exports){
var Animation, HasSignals, Module, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

HasSignals = require('util/HasSignals');


/**
A series of textures that can be displayed one frame at a time.

@class cg.Animation
@extends cg.Module
@uses cg.util.HasSignals

@constructor
@param frames {Array(String|Texture|Array[2](String|Texture,Number))}
An array of frames.

Each frame can be represented either by a single `Texture`, or by a two-element array containing a `Texture`
and a number representing how long the frame's duration is, respectively.

`String` values will be interpretted as asset names -- i.e., the string `'bullet'` becomes `cg.assets.textures.bullet`.

If no explicit duration is specified for a frame, it is shown for the default specified `frameLength`.
@param [frameLength=10] {Number(milliseconds)} Default duration for each frame.
@param [looping=true] {Boolean} Whether the animation should repeat endlessly.

@example
    // Create a 5-frame, looping animation with 30ms between each frame.
    // 'f0' is shorthand for cg.assets.textures.f0
    var anim = new Animation(['f0', 'f1', 'f2', 'f3', 'f4'], 30);

@example
    // Create a non-looping animation with a mixture of custom and default frame lengths:
    var anim = new Animation([
      ['f0', 60], // Display for 60ms (override)
      'f1',       // Display for 30ms (supplied default)
      'f2',       // Display for 30ms (supplied default)
      'f3',       // Display for 30ms (supplied default)
      ['f4', 100] // Display for 100ms (override)
    ], 30, false);
 */

Animation = (function(_super) {
  __extends(Animation, _super);

  Animation.mixin(HasSignals);

  Object.defineProperty(Animation.prototype, 'looping', {
    get: function() {
      return this.__looping;
    },
    set: function(val) {
      this.__looping = val;
      if (val) {
        return this.update = this.__looping_update;
      } else {
        return this.update = this.__oneshot_update;
      }
    }
  });

  function Animation(frames, frameLength, looping) {
    var frame, i, _i, _len, _ref;
    this.frames = frames;
    this.frameLength = frameLength != null ? frameLength : 10;
    this.looping = looping != null ? looping : true;
    _ref = this.frames;
    for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
      frame = _ref[i];
      if (typeof frame === 'string') {
        this.frames[i] = cg.assets.textures[frame];
      } else if (cg.util.isArray(frame)) {
        if (typeof frame[0] === 'string') {
          frame[0] = cg.assets.textures[frame[0]];
        }
      } else if (!frame instanceof cg.Texture) {
        throw new Error('Animation: Invalid frame type for frame #' + i);
      }
    }
    this.rewind();
  }


  /**
  Retrieve the `Texture` associated with a given frame index.
  
  @method getFrame
  @param index {Number} The index into this animation's frame list.
  @return {cg.Texture} The texture for the frame at the specified frame number.
  
  `null` is returned when `index` is out of range.
   */

  Animation.prototype.getFrame = function(index) {
    if (index >= this.frames.length) {
      return null;
    }
    return this.frames[index][0] || this.frames[index];
  };


  /**
  Reset the animation's current frame to the beginning.
  
  This will set the current frame back to 0, but will not resume
  playing if it is paused.
  
  Calling this method will always trigger a [`newFrame`](#event_newFrame) event.
  
  @method rewind
  @chainable
   */

  Animation.prototype.rewind = function() {
    this.done = false;
    this.frameNum = 0;
    this.nextFrame = this.frames[this.frameNum][1] || this.frameLength;
    this.texture = this.frames[this.frameNum][0] || this.frames[this.frameNum];
    this.emit('newFrame', this.texture);
    return this;
  };


  /**
  Halt the playback of this `Animation`.
  
  @method pause
  @chainable
   */

  Animation.prototype.pause = function() {
    this.paused = true;
    return this;
  };


  /**
  Continue the playback of this `Animation`.
  
  This will not reset the animation to the beginning if it has completed; use `rewind` instead.
  @method resume
  @chainable
   */

  Animation.prototype.resume = function() {
    this.paused = false;
    return this;
  };


  /**
  Fired *immediately after* this `Animation`'s frame number goes from the last back to `0`.
  @event end
   */


  /**
  Fired whenever this `Animation`'s current frame number changes (even if the previous frame is identical).
  @event newFrame
  @param texture {Texture} The new current texture of this animation.
   */


  /**
  Tick the timer of this `Animation` forward.
  
  If paused, or completed and not looping, this does nothing.
  Otherwise, it will advance the internal timer of the animation by `cg.dt`.
  
  This is used internally by [`Actor`s with the `anim`](cg.Actor.html#property_anim) property set.
  
  @method update
  @protected
   */

  Animation.prototype.__looping_update = function() {
    if (this.paused) {
      return;
    }
    this.nextFrame -= cg.dt;
    if (this.nextFrame > 0) {
      return;
    }
    this.frameNum = (this.frameNum + 1) % this.frames.length;
    this.texture = this.frames[this.frameNum][0] || this.frames[this.frameNum];
    this.nextFrame += this.frames[this.frameNum][1] || this.frameLength;
    this.emit('newFrame', this.texture);
    if (this.frameNum === 0) {
      return this.emit('end');
    }
  };

  Animation.prototype.__oneshot_update = function() {
    if (this.done || this.paused) {
      return;
    }
    this.nextFrame -= cg.dt;
    if (this.nextFrame > 0) {
      return;
    }
    this.frameNum = this.frameNum + 1;
    if (this.frameNum >= this.frames.length) {
      this.done = true;
      return this.emit('end');
    } else {
      this.texture = this.frames[this.frameNum][0] || this.frames[this.frameNum];
      this.nextFrame += this.frames[this.frameNum][1] || this.frameLength;
      return this.emit('newFrame', this.texture);
    }
  };

  return Animation;

})(Module);

module.exports = Animation;


},{"Module":9,"cg":15,"util/HasSignals":72}],6:[function(require,module,exports){
var AssetManager, BitmapFont, Deferred, Module, Music, Promises, Scene, Sound, TileSheet, async, cg, __NOOP__,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

async = require('util/async');

cg = require('cg');

Module = require('Module');

Scene = require('Scene');

Promises = require('util/Promises');

Sound = require('sound/Sound');

Music = require('sound/Music');

TileSheet = require('TileSheet');

BitmapFont = require('text/BitmapFont');

Deferred = Promises.Deferred;

__NOOP__ = function() {};


/**
A central place to load assets (textures, sounds, music, JSON, etc.)

@class cg.AssetManager
@extends cg.Module
 */

AssetManager = (function(_super) {
  __extends(AssetManager, _super);

  AssetManager.textureTypes = ['jpeg', 'jpg', 'png', 'gif'];

  AssetManager._textureCache = {};

  function AssetManager() {
    this.music = {};
    this.sounds = {};
    this.textures = {};
    this.sheets = {};
    this.json = {};
    this.text = {};
    this.fonts = {};
  }


  /**
  Load a `Texture` from an image file.
  
  @method loadTexture
  @param path {String} The path (URL) of the texture file to load.
  @return {Promise} A promise that will resolve a `Texture` once it finishes loading, or reject if it fails to load.
  @example
      cg.assets.loadTexture('assets/bacon.png').then(function (texture) {
        cg.log('Delicious bacon!');
        cg.log('Bacon width: ' + texture.width);
        cg.log('Bacon height: ' + texture.height);
      }, function () {
        cg.error('Failed to load delicious bacon.');
      });
   */

  AssetManager.prototype.loadTexture = function(path) {
    throw new Error('Unimplemented AssetManager::loadTexture was called; this method must be overridden in your AssetManager implementation.');
  };


  /**
  Load and parse JSON from a file.
  
  @method loadJSON
  @param path {String} The path (URL) of the json file to load.
  @return {Promise} A promise that will resolve a parsed object literal once the file finishes loading, or reject if it fails to load.
  @example
      cg.assets.loadJSON('assets/preferences.json').then(function (preferences) {
        cg.backgroundColor = preferences.backgroundColor;
      }, function () {
        cg.error('Failed to load preferences file!');
      });
   */

  AssetManager.prototype.loadJSON = function(path) {
    throw new Error('Unimplemented AssetManager::loadJSON was called; this method must be overridden in your AssetManager implementation.');
  };


  /**
  Load a `Texture` and chop it up into a fixed-size `TileSheet`
  *or* [Texture Packer](http://www.codeandweb.com/texturepacker) atlas in JSON format.
  
  @method loadSpritesheet
  @param path {String} Tye path (URL) of either an image file, or texture atlas file.
  
  If `tileW` and `tileH` are specified, this value will be assumed to be an image, otherwise
  it is assumed to be a texture atlas file.
  
  @param [tileW] {Number}
  @param [tileH] {Number}
  @return {Promise} A promise that resolves one of two things:
    1. If only `path` is specified, a plain javascript object that maps texture file paths to `Texture` objects (eg. `textures['assets/bacon.jpg']`)
    2. If `tileW` and `tileH` are specified, a `TileSheet` made of a `Texture` loaded from `path`, with tiles of size `tileW`x`tileH`
   */

  AssetManager.prototype.loadSpritesheet = function(path, tileW, tileH) {
    var deferred, textures;
    deferred = new Deferred(this);
    textures = {};
    if ((typeof tileW === 'number') && (typeof tileH === 'number')) {
      this.loadTexture(path).then((function(_this) {
        return function(texture) {
          return deferred.resolve(TileSheet.create(texture, tileW, tileH));
        };
      })(this), (function(_this) {
        return function(error) {
          return deferred.reject(error);
        };
      })(this));
    } else {
      this.loadJSON(path).then((function(_this) {
        return function(json) {
          var texturePath;
          texturePath = json.meta.image;
          return _this.loadTexture(texturePath).then(function(baseTexture) {
            var frame, frameData, name, rect;
            frameData = json.frames;
            for (name in frameData) {
              rect = frameData[name].frame;
              if (!rect) {
                continue;
              }
              frame = {
                x: rect.x,
                y: rect.y,
                width: rect.w,
                height: rect.h
              };
              textures[name] = AssetManager._textureCache[name] = new cg.Texture(baseTexture, frame);
              if (!frameData[name].trimmed) {
                continue;
              }
              textures[name].realSize = frameData[name].spriteSourceSize;
              textures[name].trim.x = 0;
            }
            return deferred.resolve(textures);
          });
        };
      })(this), (function(_this) {
        return function(error) {
          return deferred.reject(error);
        };
      })(this));
    }
    return deferred.promise;
  };


  /**
  Load a `BitmapFont` from a texture path.
  
  @method loadBitmapFont
  @param path {String} The path (URL) of the font's texture file.
  @param [spacing] {Number} Passed to the [`BitmapFont`](BitmapFont.html) constructor.
  @param [lineHeight] {Number} Passed to the [`BitmapFont`](BitmapFont.html) constructor.
   */

  AssetManager.prototype.loadBitmapFont = function(path, spacing, lineHeight) {
    var deferred;
    deferred = new Deferred(this);
    this.loadTexture(path).then((function(_this) {
      return function(texture) {
        return deferred.resolve(new BitmapFont(texture, spacing, lineHeight));
      };
    })(this), (function(_this) {
      return function(error) {
        return deferred.reject(error);
      };
    })(this));
    return deferred.promise;
  };


  /**
  Load a `Sound` file.
  
  @method loadSound
  @param paths {String|Array<String>} The path(s) (URL[s]) to attempt to load the sound from.
  
  The paths will be attempted to load in the order of the array, if an array is specified.
  
  @param numChannels {Number} The value to set the sound's [`numChannels`](cg.sound.Sound.html#property_numChannels) property to.
   */

  AssetManager.prototype.loadSound = function(paths, numChannels) {
    throw new Error('Unimplemented AssetManager::loadSound was called; this method must be overridden in your AssetManager implementation.');
  };


  /**
  Load a `Music` file.
  
  @method loadSound
  @param paths {String|Array<String>} The path(s) (URL[s]) to attempt to load the sound from.
  
  The paths will be attempted to load in the order of the array, if an array is specified.
   */

  AssetManager.prototype.loadMusic = function(paths) {
    throw new Error('Unimplemented AssetManager::loadMusic was called; this method must be overridden in your AssetManager implementation.');
  };


  /**
  Pre-load all assets (textures, sounds, music, text, etc) from a pack of assets.
  
  @method preload
  @param pack {Object} Container of asset definitions.
  
  @param [pack.textures] {Object}
  Example:
      textures: {
        bullet: 'assets/bullet.png',
        ship: 'assets/ship.png'
      }
  
  @param [pack.sheets] {Object}
  Example:
      sheets: {
        tileset: ['assets/tileset.png', 20, 20],
        packedTextures: 'assets/packedTextures.json'
      }
  
  @param [pack.sounds] {Object}
  Example:
      sounds: {
        shoot: ['assets/pew.ogg', 'assets/pew.mp3', 'assets/pew.m4a'],
        boom: ['assets/boom.ogg', 'assets/boom.mp3', 'assets/boom.m4a']
      }
  
  @param [pack.music] {Object}
  Example:
      music: {
        menu: ['assets/menu.ogg', 'assets/menu.mp3', 'assets/menu.m4a'],
        battle: ['assets/battle.ogg', 'assets/battle.mp3', 'assets/battle.m4a']
      }
  
  @param handlers {Object}
  @param handlers.error {Function}
  Callback that excutes if an asset fails to load.
  
  Callback Arguments:
  
  - `src` (`String`) -- the path of the asset that failed to load.
  
  Example:
      var errorCallback = function (src) {
        cg.error(src + ' failed to load!');
      };
  
  @param handlers.progress {Function}
  Callback that executes whenever a single asset from the pack is loaded.
  
  Callback Arguments:
  
  - `src` (`String`) -- the path of the asset that failed to load.
  - `asset` (`Texture|Sound|Music|String`) -- the final loaded version of the asset.
  - `loaded` (`Number`) -- the number of assets that have been loaded, including the one that triggered this callback.
  - `count` (`Number`) -- the total number of assets in the pack.
  
  Example:
      var progressCallback = function (src, asset, loaded, asset_count) {
        cg.log('Loaded asset "' + src + '"');
        cg.log('Loaded ' + loaded + ' out of ' + count + ' assets.');
      };
  
  @param handlers.complete {Function}
  Callback that executes whenever a single asset from the pack is loaded.
  
  Callback Arguments:
  
  None.
  
  Example:
      var completeCallback = function () {
        cg.log('Preloading complete!');
      };
  
  @param [concurrency=1] {Number} The number of files to load simultaneously.
  
  @example
      var assets = {
        textures: {
          bullet: 'assets/bullet.png',
          ship: 'assets/ship.png'
        },
        sounds: {
          shoot: ['assets/pew.ogg', 'assets/pew.mp3', 'assets/pew.m4a'],
          boom: ['assets/boom.ogg', 'assets/boom.mp3', 'assets/boom.m4a']
        },
        music: {
          menu: ['assets/menu.ogg', 'assets/menu.mp3', 'assets/menu.m4a'],
          battle: ['assets/battle.ogg', 'assets/battle.mp3', 'assets/battle.m4a']
        },
        json: {
          level1: 'assets/level1.json',
          level2: 'assets/level2.json',
          enemyTypes: 'assets/enemyTypes.json'
        },
        sheets: {
          tileset: ['assets/tileset.png', 20, 20]
        }
      };
  
      var callbacks = {
        error: function (src) {
          cg.error('Failed to load ' + src);
        },
        progress: function (src, asset, loaded, asset_count) {
          cg.log('Loaded asset "' + src + '"');
          cg.log('Loaded ' + loaded + ' out of ' + count + ' assets.');
        },
        complete: function () {
          cg.log('Preloading complete!');
        }
      };
  
      cg.assets.preload(assets, callbacks);
   */

  AssetManager.prototype.preload = function(pack, handlers, concurrency) {
    var asset_count, assets, data, font_count, getSoundData, json_count, loadFont, loadGfx, loadJSON, loadMusic, loadSfx, loadSpritesheet, loadText, loaded, music_count, name, path, sheet_count, sound_count, text_count, texture_count;
    if (concurrency == null) {
      concurrency = 1;
    }
    music_count = cg.util.sizeOf(pack.music);
    sound_count = cg.util.sizeOf(pack.sounds);
    sheet_count = cg.util.sizeOf(pack.sheets);
    texture_count = cg.util.sizeOf(pack.textures);
    font_count = cg.util.sizeOf(pack.fonts);
    text_count = cg.util.sizeOf(pack.text);
    json_count = cg.util.sizeOf(pack.json);
    asset_count = texture_count + sound_count + music_count + sheet_count;
    loaded = 0;
    cg.log('Pre-loading assets...');
    assets = [];
    getSoundData = (function(_this) {
      return function(asset) {
        var data;
        data = {};
        switch (typeof asset.data) {
          case 'string':
            data.paths = asset.data;
            break;
          case 'object':
            if (asset.data.paths != null) {
              data.paths = asset.data.paths;
            } else {
              data.paths = asset.data;
            }
        }
        if (typeof data.paths === 'string') {
          data.paths = data.paths;
        }
        if (typeof asset.data.numChannels === 'number') {
          data.numChannels = asset.data.numChannels;
        }
        if (typeof asset.data.volume === 'number') {
          data.volume = asset.data.volume;
        } else {
          data.volume = 1;
        }
        return data;
      };
    })(this);
    assets.push.apply(assets, (function() {
      var _ref, _results;
      _ref = pack.music;
      _results = [];
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        data = _ref[name];
        _results.push({
          name: name,
          data: data,
          type: 'music'
        });
      }
      return _results;
    })());
    loadMusic = (function(_this) {
      return function(asset, cb) {
        var done;
        done = function(music) {
          _this.music[asset.name] = music;
          ++loaded;
          handlers.progress(music.path, music, loaded, asset_count);
          return cb();
        };
        data = getSoundData(asset);
        return _this.loadMusic(data.paths, data.volume).then(function(music) {
          return done(music);
        }, function(err) {
          var music;
          music = {};
          music.play = __NOOP__;
          music.stop = __NOOP__;
          music.path = 'DUMMY(' + data.paths + ')';
          handlers.error(data.paths);
          return done(music);
        });
      };
    })(this);
    assets.push.apply(assets, (function() {
      var _ref, _results;
      _ref = pack.sounds;
      _results = [];
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        data = _ref[name];
        _results.push({
          name: name,
          data: data,
          type: 'sound'
        });
      }
      return _results;
    })());
    loadSfx = (function(_this) {
      return function(asset, cb) {
        var done;
        done = function(sound) {
          _this.sounds[asset.name] = sound;
          ++loaded;
          handlers.progress(sound.path, sound, loaded, asset_count);
          return cb();
        };
        data = getSoundData(asset);
        return _this.loadSound(data.paths, data.volume, data.numChannels).then(function(sound) {
          return done(sound);
        }, function(err) {
          var sound;
          sound = {};
          sound.play = __NOOP__;
          sound.stop = __NOOP__;
          sound.path = 'DUMMY(' + data.paths + ')';
          handlers.error(data.paths);
          return done(sound);
        });
      };
    })(this);
    assets.push.apply(assets, (function() {
      var _ref, _results;
      _ref = pack.sheets;
      _results = [];
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        data = _ref[name];
        _results.push({
          name: name,
          data: data,
          type: 'sheet'
        });
      }
      return _results;
    })());
    loadSpritesheet = (function(_this) {
      return function(asset, cb) {
        var done, path, tileH, tileW, _ref;
        done = function(sheet) {
          _this.sheets[asset.name] = sheet;
          ++loaded;
          handlers.progress(asset.data, sheet, loaded, asset_count);
          return cb();
        };
        if (cg.util.isArray(asset.data)) {
          _ref = asset.data, path = _ref[0], tileW = _ref[1], tileH = _ref[2];
        } else {
          path = asset.data;
        }
        return _this.loadSpritesheet(path, tileW, tileH).then(function(sheet) {
          return done(sheet);
        }, function(sheet) {
          handlers.error(path);
          return cb(sheet);
        });
      };
    })(this);
    assets.push.apply(assets, (function() {
      var _ref, _results;
      _ref = pack.textures;
      _results = [];
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        path = _ref[name];
        _results.push({
          name: name,
          path: path,
          type: 'texture'
        });
      }
      return _results;
    })());
    loadGfx = (function(_this) {
      return function(asset, cb) {
        var done;
        done = function(texture) {
          _this.textures[asset.name] = texture;
          ++loaded;
          handlers.progress(texture.path, texture, loaded, asset_count);
          return cb();
        };
        return _this.loadTexture(asset.path).then(function(texture) {
          return done(texture);
        }, function(texture) {
          handlers.error(asset.path);
          return cb(texture);
        });
      };
    })(this);
    assets.push.apply(assets, (function() {
      var _ref, _results;
      _ref = pack.fonts;
      _results = [];
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        path = _ref[name];
        _results.push({
          name: name,
          path: path,
          type: 'font'
        });
      }
      return _results;
    })());
    loadFont = (function(_this) {
      return function(asset, cb) {
        var done;
        done = function(font) {
          _this.fonts[asset.name] = font;
          ++loaded;
          handlers.progress(font.path, font, loaded, asset_count);
          return cb();
        };
        return _this.loadBitmapFont(asset.path).then(function(font) {
          return done(font);
        }, function(font) {
          handlers.error(asset.path);
          return cb(font);
        });
      };
    })(this);
    assets.push.apply(assets, (function() {
      var _ref, _results;
      _ref = pack.text;
      _results = [];
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        path = _ref[name];
        _results.push({
          name: name,
          path: path,
          type: 'text'
        });
      }
      return _results;
    })());
    loadText = (function(_this) {
      return function(asset, cb) {
        var done;
        done = function(text) {
          _this.text[asset.name] = text;
          ++loaded;
          handlers.progress(asset.path, text, loaded, asset_count);
          return cb();
        };
        return _this.loadText(asset.path).then(function(text) {
          return done(text);
        }, function(text) {
          handlers.error(asset.path);
          return cb(text);
        });
      };
    })(this);
    assets.push.apply(assets, (function() {
      var _ref, _results;
      _ref = pack.json;
      _results = [];
      for (name in _ref) {
        if (!__hasProp.call(_ref, name)) continue;
        path = _ref[name];
        _results.push({
          name: name,
          path: path,
          type: 'json'
        });
      }
      return _results;
    })());
    loadJSON = (function(_this) {
      return function(asset, cb) {
        var done;
        done = function(json) {
          _this.json[asset.name] = json;
          ++loaded;
          handlers.progress(asset.path, json, loaded, asset_count);
          return cb();
        };
        return _this.loadJSON(asset.path).then(function(json) {
          return done(json);
        }, function(json) {
          handlers.error(asset.path);
          return cb(json);
        });
      };
    })(this);
    return async.eachLimit(assets, concurrency, (function(_this) {
      return function(asset, cb) {
        var _ref, _ref1, _ref2;
        cg.log("loading " + asset.type + " " + ((_ref = (_ref1 = asset.path) != null ? _ref1 : (_ref2 = asset.data) != null ? _ref2.paths : void 0) != null ? _ref : asset.data));
        switch (asset.type) {
          case 'sheet':
            return loadSpritesheet(asset, cb);
          case 'texture':
            return loadGfx(asset, cb);
          case 'text':
            return loadText(asset, cb);
          case 'json':
            return loadJSON(asset, cb);
          case 'font':
            return loadFont(asset, cb);
          case 'sound':
            return loadSfx(asset, cb);
          case 'music':
            return loadMusic(asset, cb);
          default:
            return cb('AssetManager: Unexpected asset type: ' + asset.type);
        }
      };
    })(this), (function(_this) {
      return function(asset) {
        if (asset) {
          return handlers.error(asset.path);
        } else {
          return handlers.complete(_this);
        }
      };
    })(this));
  };

  return AssetManager;

})(Module);

module.exports = AssetManager;


},{"Module":9,"Scene":10,"TileSheet":12,"cg":15,"sound/Music":59,"sound/Sound":60,"text/BitmapFont":62,"util/Promises":73,"util/async":76}],7:[function(require,module,exports){
var Camera, cg;

cg = require('cg');


/**
TODOC

@class cg.Camera
 */

Camera = (function() {
  function Camera() {}

  return Camera;

})();

module.exports = Camera;


},{"cg":15}],8:[function(require,module,exports){
var Actor, Group, HasSignals, Module, Tween, cg, chainableMethodNames, chainables, delay, each, groupMethods, hide, makeChainable, map, name, show, tween, __add, __remove, _i, _len,
  __slice = [].slice,
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
  __hasProp = {}.hasOwnProperty;

cg = require('cg');

Module = require('Module');

Tween = require('Tween');

HasSignals = require('util/HasSignals');

Actor = require('Actor');


/**
TODOC

@class cg.Group
 */

chainableMethodNames = ['pause', 'resume', 'destroy', 'on', 'once', 'off', 'emit', 'halt'];

makeChainable = function(name) {
  return function() {
    var idx, _ref;
    idx = this.length;
    while (idx--) {
      (_ref = this[idx])[name].apply(_ref, arguments);
    }
    return this;
  };
};

chainables = {};

for (_i = 0, _len = chainableMethodNames.length; _i < _len; _i++) {
  name = chainableMethodNames[_i];
  chainables[name] = makeChainable(name);
}


/**
@method each
 */

each = function() {
  var args, func, i, obj, _j, _k;
  func = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
  if (typeof func === 'string') {
    for (i = _j = this.length - 1; _j >= 0; i = _j += -1) {
      obj = this[i];
      obj[func].apply(obj, args);
    }
  } else {
    for (i = _k = this.length - 1; _k >= 0; i = _k += -1) {
      obj = this[i];
      func.call(obj, i, obj);
    }
  }
  return this;
};


/**
@method map
 */

map = function() {
  var args, func, obj;
  func = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
  if (typeof func === 'string') {
    return (function() {
      var _j, _results;
      _results = [];
      for (_j = this.length - 1; _j >= 0; _j += -1) {
        obj = this[_j];
        _results.push(obj[func].apply(obj, args));
      }
      return _results;
    }).call(this);
  } else {
    return (function() {
      var _j, _results;
      _results = [];
      for (_j = this.length - 1; _j >= 0; _j += -1) {
        obj = this[_j];
        _results.push(func.call(obj, i, obj));
      }
      return _results;
    }).call(this);
  }
};


/**
@method tween
 */

tween = function(props) {
  return new Tween(this, props);
};


/**
@method delay
 */

delay = function(time, func) {
  var t;
  t = new Tween(this, {
    duration: time,
    immediate: false
  });
  t.start().then(func);
  return t;
};


/**
@method hide
 */

hide = function(arg, cb) {
  var params;
  params = {
    values: {
      alpha: 0
    }
  };
  return Actor.prototype.__hideOrShow.call(this, arg, params, function() {
    return this.set('visible', false);
  }, cb);
};


/**
@method show
 */

show = function(arg, cb) {
  var params;
  this.set('visible', true);
  params = {
    values: {
      alpha: 1
    }
  };
  return Actor.prototype.__hideOrShow.call(this, arg, params, null, cb);
};

__add = function(group, subgroup, actor) {
  return group.add(actor);
};

__remove = function(group, subgroup, actor) {
  var sg, _j, _len1, _ref;
  _ref = group.__subGroups;
  for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
    sg = _ref[_j];
    if (sg !== subgroup) {
      if (__indexOf.call(subgroup, actor) >= 0) {
        return;
      }
    }
  }
  return group.remove(actor);
};

groupMethods = {

  /**
  @method set
   */
  set: function() {
    var actor, args, i, key, val, values, _j, _len1;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (args.length === 1) {
      values = args[0];
    } else {
      values = {};
      values[args[0]] = args[1];
    }
    for (i = _j = 0, _len1 = this.length; _j < _len1; i = ++_j) {
      actor = this[i];
      for (key in values) {
        if (!__hasProp.call(values, key)) continue;
        val = values[key];
        if (typeof val === 'function') {
          actor[key] = val.call(actor, i, actor);
        } else {
          actor[key] = val;
        }
      }
    }
    return this;
  },

  /**
  @method add
   */
  add: function(val) {
    var tail, tval;
    tail = this.length - 1;
    while (tail >= 0) {
      tval = this[tail];
      if (val > tval) {
        break;
      }
      if (val === tval) {
        return this;
      }
      --tail;
    }
    this.splice(tail + 1, 0, val);
    this._groupSignals.emit('add', this, val);
    return this;
  },

  /**
  @method addAll
   */
  addAll: function(array) {
    var actor, _j, _len1;
    for (_j = 0, _len1 = array.length; _j < _len1; _j++) {
      actor = array[_j];
      this.add(actor);
    }
    return this;
  },

  /**
  @method addGroup
   */
  addGroup: function(group) {
    if (__indexOf.call(this.__subGroups, group) >= 0) {
      return;
    }
    this.__subGroups.push(group);
    this.addAll(group);
    this._groupSignals.on(group._groupSignals, 'add', this.__add);
    this._groupSignals.on(group._groupSignals, 'remove', this.__remove);
    this._groupSignals.emit('addGroup', group);
    return this;
  },

  /**
  @method remove
   */
  remove: function(actor) {
    var position;
    position = this.indexOf(actor);
    if (position < 0) {
      return this;
    }
    this.splice(position, 1);
    this._groupSignals.emit('remove', this, actor);
    return this;
  },

  /**
  @method removeGroup
   */
  removeGroup: function(group) {
    var actor, groupIdx, _j, _len1;
    groupIdx = this.__subGroups.indexOf(group);
    if (groupIdx < 0) {
      return;
    }
    this.__subGroups.splice(groupIdx, 1);
    for (_j = 0, _len1 = group.length; _j < _len1; _j++) {
      actor = group[_j];
      this.remove(actor);
    }
    this._groupSignals.off(group._groupSignals, 'add', this.__add);
    this._groupSignals.off(group._groupSignals, 'remove', this.__remove);
    this._groupSignals.emit('removeGroup', group);
    return this;
  },

  /**
  @method contains
   */
  contains: function(actor) {
    return this.indexOf(actor) >= 0;
  },

  /**
  Create a new group containing only members that belong to both groups.
  @method intersect
   */
  intersect: function(other) {
    var actor, g, _j, _len1;
    g = Group.create();
    for (_j = 0, _len1 = other.length; _j < _len1; _j++) {
      actor = other[_j];
      if (this.contains(actor)) {
        g.add(actor);
      }
    }
    return g;
  },

  /**
  @method dispose
   */
  dispose: function() {
    var actor, _j, _len1;
    for (_j = 0, _len1 = this.length; _j < _len1; _j++) {
      actor = this[_j];
      this._groupSignals.emit('remove', this, actor);
    }
    this._groupSignals.emit('__destroy__');
    return this.length = 0;
  }
};

Group = {
  create: function() {
    var arg, args, g, method, _j, _len1;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    g = [];
    g._groupSignals = Object.create(HasSignals);
    g._isGroup = true;
    g.__subGroups = [];
    g.each = each;
    g.map = map;
    g.tween = tween;
    g.hide = hide;
    g.show = show;
    g.__add = __add.bind(g, g);
    g.__remove = __remove.bind(g, g);
    for (name in chainables) {
      if (!__hasProp.call(chainables, name)) continue;
      method = chainables[name];
      g[name] = method;
    }
    for (name in groupMethods) {
      if (!__hasProp.call(groupMethods, name)) continue;
      method = groupMethods[name];
      g[name] = method;
    }
    for (_j = 0, _len1 = args.length; _j < _len1; _j++) {
      arg = args[_j];
      if (!cg.util.isArray(arg)) {
        g.add(arg);
      } else {
        if (arg._isGroup) {
          g.addGroup(arg);
        } else {
          g.addAll(arg);
        }
      }
    }
    return g;
  }
};

Group.empty = Group.create();

module.exports = Group;


},{"Actor":4,"Module":9,"Tween":13,"cg":15,"util/HasSignals":72}],9:[function(require,module,exports){
var Module,
    moduleKeywords,
    inherit;

inherit = function inherit(child, parent) {
  for (var key in parent) {
    if (Object.hasOwnProperty.call(parent, key)) child[key] = parent[key];
  }

  function ctor() {
    this.constructor = child;
  }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
  child.__super__ = parent.prototype;
  return child;
};

moduleKeywords = ['onMixinStatic', 'onMixin', 'constructor'];

/**
* TODOC
*
* @class cg.Module
*/
Module = (function() {

  function Module() {}
  
  Module.moduleize = function (obj) {
    obj.__mixinStatic = Module.__mixinStatic;
    obj.mixinStatic = Module.mixinStatic;
    obj.__mixin = Module.__mixin;
    obj.mixin = Module.mixin;
    obj.mixin(Module.prototype);
    obj.mixinStatic(Module);
    return obj;
  };

  Module.__mixinStatic = function(obj) {
    var key;

    for (key in obj) {
      if (moduleKeywords.indexOf(key) >= 0) continue;
      this[key] = obj[key];
    }

    if (obj.onMixinStatic != null) {
      obj.onMixinStatic.call(this);
    }
    return this;
  };

  Module.mixinStatic = function () {
    var i;
    for (i=0; i<arguments.length; ++i) {
      this.__mixinStatic(arguments[i]);
    }
  }

  Module.__mixin = function(obj) {
    var key;

    for (key in obj) {
      if (moduleKeywords.indexOf(key) >= 0) continue;
      this.prototype[key] = obj[key];
    }

    if (obj.onMixin != null) {
      obj.onMixin.call(this);
    }
    return this;
  };

  Module.mixin = function () {
    var i;
    for (i=0; i<arguments.length; ++i) {
      this.__mixin(arguments[i]);
    }
  }

  Module.prototype.__mixin = function(obj) {
    var key;

    for (key in obj) {
      if (moduleKeywords.indexOf(key) >= 0) continue;
      this[key] = obj[key];
    }

    if (obj.onMixin != null) {
      obj.onMixin.call(this);
    }
    return this;
  };

  Module.prototype.mixin = function () {
    var i;
    for (i=0; i<arguments.length; ++i) {
      this.__mixin(arguments[i]);
    }
  }

  Module.defineProperty = function () {
    var args = [],
        i;

    args.push(this.prototype);
    args.push.apply(args, arguments);

    Object.defineProperty.apply(Object, args);
  }

  Module.prototype.defineProperty = function () {
    var args = [],
        i;

    args.push(this);
    args.push.apply(args, arguments);

    Object.defineProperty.apply(Object, args);
  }

  Module.extend = function(name, props) {
    var child, key, parent, val, __wrapped__;
    parent = this;
    __wrapped__ = function(superFunc, func) {
      return function() {
        var ret, prevSuper;
        prevSuper = this._super;
        this._super = superFunc;
        ret = func.apply(this, arguments);
        this._super = prevSuper;
        return ret;
      };
    };

    // Sometimes, you just gotta get your hands dirty:
    if (!props.hasOwnProperty('constructor')) {
      child = (new Function('inherit', 'parent',
        "var "+name+" = function "+name+" () {\n" +
        "  var ref = "+name+".__super__.constructor.apply(this, arguments);\n" +
        "  return ref;\n" +
        "};\n" +
        "\n" +
        "inherit("+name+", parent);\n" +
        "return "+name+";"
      ))(inherit, parent);
    } else {
      child = (new Function('inherit', 'parent', 'ctor',
        "var "+name+" = function "+name+" () {\n" +
        "  this._super = "+name+".__super__.constructor;\n" +
        "  var ref = ctor.apply(this, arguments);\n" +
        "  delete this._super;\n" +
        "  return ref;\n" +
        "};\n" +
        "\n" +
        "inherit("+name+", parent);\n" +
        "return "+name+";"
      ))(inherit, parent, props.constructor);
    }

    for (key in props) {
      if (!props.hasOwnProperty(key)) continue;
      val = props[key];
      if ((typeof val === 'function') && (typeof parent.prototype[key] === 'function')) {
        child.prototype[key] = __wrapped__(parent.prototype[key], val);
      } else {
        child.prototype[key] = val;
      }
    }
    return child;
  };

  return Module;
})();

module.exports = Module;

},{}],10:[function(require,module,exports){
var Actor, Camera, Scene, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Actor = require('Actor');

Camera = require('Camera');


/**
TODOC

A scene is meant to be a stand-alone interactivity zone of a game.
A scene has its own independent tween system to allow for
 independent sets of controls for different menus/minigames/etc.

@class cg.Scene
 */

Scene = (function(_super) {
  __extends(Scene, _super);

  Object.defineProperty(Scene.prototype, 'isScene', {
    value: true,
    writable: false
  });

  function Scene() {
    Scene.__super__.constructor.apply(this, arguments);
    if (this.paused == null) {
      this.paused = false;
    }
    this.currentTime = 0;
  }

  Scene.prototype.__preload = function(assets) {
    if (this.assets == null) {
      this.preloaded = true;
      this.preloadComplete();
      return;
    }
    this.preloaded = false;
    this.pause();
    return cg.assets.preload(this.assets, {
      error: (function(_this) {
        return function() {
          return _this.preloadError.apply(_this, arguments);
        };
      })(this),
      progress: (function(_this) {
        return function() {
          return _this.preloadProgress.apply(_this, arguments);
        };
      })(this),
      complete: (function(_this) {
        return function() {
          _this.preloaded = true;
          _this.resume();
          return _this.preloadComplete();
        };
      })(this)
    });
  };

  Scene.prototype.preload = function() {
    if (typeof this.assets !== 'string') {
      return this.__preload(this.assets);
    } else {
      return cg.assets.loadJSON(this.assets).then((function(_this) {
        return function(assets) {
          _this.assets = assets;
          return _this.__preload(_this.assets);
        };
      })(this), (function(_this) {
        return function(err) {
          throw new Error('Failed to load asset pack JSON: "' + _this.assets + '": ' + err.message);
        };
      })(this));
    }
  };

  Scene.prototype.preloadError = function(src) {
    return cg.error('Failed to load asset ' + src);
  };

  Scene.prototype.preloadProgress = function(src, data, loaded, count) {
    return cg.log('Loaded ' + src);
  };

  Scene.prototype.preloadComplete = function() {};

  Scene.prototype._update = function() {
    Scene.__super__._update.apply(this, arguments);
    return this.currentTime += cg.dt;
  };

  return Scene;

})(Actor);

module.exports = Scene;


},{"Actor":4,"Camera":7,"cg":15}],11:[function(require,module,exports){
var Actor, Text, cg, example,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Actor = require('Actor');

example = function() {
  var text;
  return text = this.addChild(new cg.Text('Hello, world!', {
    font: 'chunky',
    align: 'center',
    x: cg.width / 2,
    y: cg.height / 2
  }));
};


/**
TODOC

@class cg.Text
@extends cg.Actor
 */

Text = (function(_super) {
  __extends(Text, _super);

  Text.defaults = {
    font: '10pt sans-serif',
    color: 'white',
    align: 'left'
  };

  Text.defineProperty('string', {
    get: function() {
      return this.__string;
    },
    set: function(val) {
      var _ref;
      if (val === this.__string) {
        return;
      }
      this.__string = (_ref = val != null ? val.toString() : void 0) != null ? _ref : '';
      if (this.__textItem instanceof cg.text.BitmapText) {
        this.__textItem.string = this.__string;
      } else {
        this.__textItem.text = this.__string;
      }
      return this.__textItem.updateText();
    }
  });

  Text.defineProperty('font', {
    get: function() {
      return this.__font;
    },
    set: function(val) {
      var font;
      if (!(typeof val === 'string')) {
        if (!val instanceof cg.text.BitmapFont) {
          throw new Error('Expected cg.text.BitmapFont or String for font.');
        }
        this.__font = val;
      } else {
        font = cg.assets.fonts[val];
        if (font == null) {
          this.__font = val;
        } else {
          this.__font = font;
        }
      }
      if (this.__textItem__) {
        return this.__buildTextItem();
      }
    }
  });

  Text.defineProperty('align', {
    get: function() {
      return this.__align;
    },
    set: function(val) {
      if (val === this.__align) {
        return;
      }
      this.__align = val;
      return this.__updateAlignment();
    }
  });

  Text.defineProperty('color', {
    get: function() {
      return this.__color;
    },
    set: function(val) {
      this.__color = val;
      if (this.__textItem__ == null) {
        return;
      }
      if (this.__textItem instanceof cg.text.BitmapText) {
        return;
      }
      this.__textItem.style.fill = this.__color;
      return this.__textItem.updateText();
    }
  });

  Text.defineProperty('width', {
    get: function() {
      var _ref;
      return (_ref = this.__width) != null ? _ref : this.__textItem.width;
    },
    set: function(val) {
      this.__width = val;
      if (this.__textItem instanceof cg.text.BitmapText) {

      } else {
        this.__textItem.style.wordWrap = this.__width != null;
        this.__textItem.style.wordWrapWidth = this.__width;
        return this.__textItem.updateText();
      }
    }
  });

  Text.defineProperty('height', {
    get: function() {
      return this.__textItem.height;
    }
  });

  Text.defineProperty('left', {
    get: function() {
      return this.x + this.__textItem.left;
    },
    set: function(val) {
      return this.x = val - this.__textItem.left;
    }
  });

  Text.defineProperty('right', {
    get: function() {
      return this.x + this.__textItem.right;
    },
    set: function(val) {
      return this.x = val - this.__textItem.right;
    }
  });

  Text.defineProperty('top', {
    get: function() {
      return this.y + this.__textItem.top;
    },
    set: function(val) {
      return this.y = val - this.__textItem.top;
    }
  });

  Text.defineProperty('bottom', {
    get: function() {
      return this.y + this.__textItem.bottom;
    },
    set: function(val) {
      return this.y = val - this.__textItem.bottom;
    }
  });

  Text.prototype.__buildTextItem = function() {
    var string, _ref, _ref1, _ref2;
    string = (_ref = this.string) != null ? _ref : '';
    if (this.__textItem__ != null) {
      this.removeChild(this.__textItem__);
    }
    if (this.font instanceof cg.text.BitmapFont) {
      this.__textItem__ = this.addChild(new cg.text.BitmapText(this.font, string));
    } else {
      this.__textItem__ = this.addChild(new cg.text.PixiText(string, {
        font: (_ref1 = this.font) != null ? _ref1 : Text.defaults.font,
        fill: (_ref2 = this.color) != null ? _ref2 : Text.defaults.color
      }));
    }
    return this.__updateAlignment();
  };

  Text.defineProperty('__textItem', {
    get: function() {
      if (!this.__textItem__) {
        this.__buildTextItem();
      }
      return this.__textItem__;
    }
  });

  Text.prototype.__updateAlignment = function() {
    if (this.__textItem__ == null) {
      return;
    }
    if (this.__textItem instanceof cg.text.BitmapText) {
      this.__textItem.alignment = this.align;
      return this.__textItem.updateText();
    } else {
      switch (this.align) {
        case 'center':
          return this.__textItem.anchorX = 0.5;
        case 'right':
          return this.__textItem.anchorX = 1;
        default:
          return this.__textItem.anchorX = 0;
      }
    }
  };

  function Text(string, params) {
    var k, v, _ref;
    if (params == null) {
      params = {};
    }
    _ref = Text.defaults;
    for (k in _ref) {
      if (!__hasProp.call(_ref, k)) continue;
      v = _ref[k];
      if (params[k] == null) {
        params[k] = v;
      }
    }
    if (this.font == null) {
      this.font = params.font;
    }
    Text.__super__.constructor.call(this, params);
    this.string = string;
  }

  return Text;

})(Actor);

module.exports = Text;


},{"Actor":4,"cg":15}],12:[function(require,module,exports){
var Animation, TileSheet, cg;

cg = require('cg');

Animation = require('Animation');


/**
Array of `Texture`s created from a single `Texture`, split up into fixed-sized pieces

You **must** use [`cg.TileSheet.create`](#method_create) to create a new `TileSheet`; 
calling `new TileSheet` will throw an exception.

@class cg.TileSheet
 */

TileSheet = (function() {
  function TileSheet() {
    throw new Error('Use cg.TileSheet.create(...) to create a new TileSheet.');
  }


  /**
  Create a new `TileSheet` array.
  
  @static
  @method create
  @param texture {cg.Texture} The texture to chop up into smaller texture tiles.
  @param tileW {Number} The width of a single texture tile.
  @param tileH {Number} The height of a single texture tile.
  @return {cg.TileSheet}
   */

  TileSheet.create = function(texture, tileW, tileH) {
    var bt, fh, fw, fx, fy, ox, oy, textures;
    if (!(tileW > 0 && tileH > 0)) {
      throw new Error('TileSheet tile width and height must be positive, non-zero values');
    }
    if (typeof texture === 'string') {
      texture = cg.assets.textures[texture];
    }
    if (!texture.baseTexture) {
      throw new Error('Invalid Texture passed to TileSheet.create');
    }
    textures = [];
    ox = 0;
    fx = texture.frame.x;
    fy = texture.frame.y;
    fw = texture.frame.width;
    fh = texture.frame.height;
    bt = texture.baseTexture;
    oy = 0;
    while (true) {
      if (oy >= fh) {
        break;
      }
      ox = 0;
      while (true) {
        if (ox >= fw) {
          break;
        }
        textures.push(new cg.Texture(bt, new cg.gfx.Rectangle(fx + ox, fy + oy, tileW, tileH)));
        ox += tileW;
      }
      oy += tileH;
    }

    /**
    Create an [`Animation`](cg.Animation.html) from a sequence of tile numbers.
    
    @method anim
    @param frameIndexes {Number|Array(Number|Array[2](Number))}
    An array of frames, represented by integer indexes of this `TileSheet`.
    
    The format of this parameter is identical to the first parameter to the [`Animation` constructor](cg.Animation.html),
    except any integer values are treated as index values into this `TileSheet` array.
    
    For instance, the sequence `[0, 1, 2]` will become `[sheet[0], sheet[1], sheet[2]]`, where `sheet` is the `TileSheet`
    that `anim` was called on.
    
    Any non-integer frame values will be passed as-is to the [`Animation` constructor](cg.Animation.html), allowing
    you to mix explicit texture names or `Texture` values as frames along with integer values.
    
    @param [frameLength=32] {Number(milliseconds)} Default duration for each frame.
    @param [looping=true] {Boolean} Whether the animation should repeat endlessly.
    
    @return {cg.Animation} The desired `Animation` sequence.
     */
    textures.anim = function(frameIndexes, frameLength, looping) {
      var frame, frames, _i, _len;
      if (frameLength == null) {
        frameLength = 32;
      }
      if (looping == null) {
        looping = true;
      }
      if (typeof frameIndexes === 'number') {
        frameIndexes = [frameIndexes];
      }
      frames = [];
      for (_i = 0, _len = frameIndexes.length; _i < _len; _i++) {
        frame = frameIndexes[_i];
        if ((typeof frame) === 'number') {
          frames.push(textures[frame]);
        } else if ((typeof frames[1]) === 'number') {
          frames.push([textures[frame[0]], frame[1]]);
        } else {
          frames.push(frame);
        }
      }
      return new Animation(frames, frameLength, looping);
    };
    Object.defineProperty(textures, 'isTileSheet', {
      value: true,
      writable: false,
      configurable: true
    });
    return textures;
  };

  return TileSheet;

})();

module.exports = TileSheet;


},{"Animation":5,"cg":15}],13:[function(require,module,exports){
var HasSignals, Module, Promises, Tween, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

HasSignals = require('util/HasSignals');

Promises = require('util/Promises');


/**
"Ease" an object's numeric property (or number of properties) from one value to another.
@class cg.Tween
@extends cg.Module
@uses cg.util.HasSignals
@uses Promise

@constructor
@param object {Object|Array} The object(s) whose properties will be tweened.
@param [params] {Object} Parameters that define how the `Tween` should behave (see below).
@param [params.values] {Object}
A key-value pair of the final values to be applied to `object`.

Any `object[key]` that is anything but a number or function will be ignored.

Properties can either be simple numeric values, or accessor functions in the following style:

```javascript
obj.value(100); // set value to 100
obj.value();    // returns 100
```

Any property may also be assigned a function instead of a numerical value:

```javascript
// Tween object1.x to 50, object2.x to 100, and object3.x to 150
new Tween([object1, object2, object3], {
  values: {
    x: function (index, object) {
      // This function is called once for each object this Tween affects
      //  as soon as `start()` is called. Subsequent calls to `start()`
      //  *will* call this function again for each object.

      // The value of `this` is the current object being iterated over.

      // The first argument passed is the index into the array corresponding to the object.
      // The second argument is the object.

      // If only a single object was passed, index is always 0.

      // Your function *must* return a numerical value:
      return index * 50;
    }
  }
});
```
@param [params.duration=`Tween.defaults.duration=500`] {Number(milliseconds)|Function} The span of time over which `object`'s `value`s should be tweened.
@param [params.easeFunc=`Tween.defaults.easeFunc='quad.inout'`] {String|Function} TODOC
@param [params.delay=0] {Number(milliseconds)|Function} The amount of time after `start` is called before the tween should begin.
@param [params.relative=false] {Boolean} Whether `values` should represent a delta to be added to `object`'s current values, rather than the absolute final values.
@param [params.tweener=cg] {Tweenable} The `Tweenable` to be used to drive this `Tween`.
@param [params.immediate=true] {Boolean} If true, `this.start()` will be called immediately.
@param [params.context] {Object} If specified, this will be the value of `this` inside the body of promises returned by calling [`then`](#method_then).
 */

Tween = (function(_super) {
  __extends(Tween, _super);

  Tween.mixin(HasSignals);

  Tween.__easeFuncs = {};

  Tween.defaults = {
    duration: 500,
    easeFunc: 'quad.inout'
  };


  /**
  Globally add a custom ease function that can be utilized by referring to a name (string) when
  setting the `easeFunc` parameter to the `Tween` constructor.
  
  @static
  @method addEaseFunc
  @param name {String}
  @param func {Function}
   */

  Tween.addEaseFunc = function(name, func) {
    if (this.__easeFuncs[name] != null) {
      cg.warn('Tween.addEaseFunc: overwriting existing "' + name + '" function.');
    }
    return this.__easeFuncs[name] = func;
  };

  function Tween(_objects, property, value, duration, easeFunc, delay) {
    var params, values;
    this._objects = _objects;
    this._eventObjects = this._objects;
    if (!cg.util.isArray(this._objects)) {
      this._objects = [this._objects];
    }
    if (typeof property === 'object') {
      params = property;
    } else {
      values = {};
      values[property] = value;
      params = {
        values: values,
        duration: duration,
        easeFunc: easeFunc,
        delay: delay
      };
    }
    this.setParams(params);
  }

  Tween.prototype.__clearParams = function() {
    var paramName, _i, _len, _ref, _results;
    _ref = ['values', 'duration', 'easeFunc', 'delay', 'relative', 'tweener', 'immediate'];
    _results = [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      paramName = _ref[_i];
      _results.push(delete this[paramName]);
    }
    return _results;
  };

  Tween.prototype.setParams = function(params) {
    var easeFuncName, f, name;
    this.__clearParams();
    this.values = params.values, this.duration = params.duration, this.easeFunc = params.easeFunc, this.delay = params.delay, this.relative = params.relative, this.tweener = params.tweener, this.immediate = params.immediate;
    if (this.values == null) {
      this.values = {};
    }
    if (this.duration == null) {
      this.duration = Tween.defaults.duration;
    }
    if (this.easeFunc == null) {
      this.easeFunc = Tween.defaults.easeFunc;
    }
    if (typeof this.easeFunc === 'string') {
      easeFuncName = this.easeFunc;
      this.easeFunc = Tween.__easeFuncs[easeFuncName];
      if (this.easeFunc == null) {
        this.easeFunc = Tween.Quad.InOut;
        cg.warn('Tween: unknown ease function: ' + easeFuncName('; available ease function names are:'));
        cg.warn(((function() {
          var _ref, _results;
          _ref = Tween.__easeFuncs;
          _results = [];
          for (name in _ref) {
            if (!__hasProp.call(_ref, name)) continue;
            f = _ref[name];
            _results.push('  ' + name);
          }
          return _results;
        })()).join('\n'));
      }
    }
    if (this.delay == null) {
      this.delay = 0;
    }
    if (this.relative == null) {
      this.relative = false;
    }
    if (this.tweener == null) {
      this.tweener = cg;
    }
    if (this.immediate == null) {
      this.immediate = true;
    }
    this.active = false;
    if (this.immediate) {
      return this.start();
    }
  };


  /**
  Begin tweening `object`'s `values`.
  
  @method start
  @chainable
   */


  /**
  Fired *immediately* when `this.start()` is called.
  @event start(object)
  @param object {Object} `object` before its values have started tweening
   */

  Tween.prototype.start = function() {
    var i, n, name, obj, relative, split, value, _i, _j, _len, _len1, _name, _obj, _ref, _ref1, _ref2;
    this._deferred = new Promises.Deferred(this._eventObjects);

    /**
    TODOC
    @method then
     */
    this.then = this._deferred.promise.then;
    this.emit('start', this._eventObjects);
    this.active = true;
    this.removed = false;
    this.tweener._addTween(this);
    this.time = 0;
    this._initialValues = [];
    this._finalValues = [];
    this._done = [];
    this._durations = [];
    this._totalDone = 0;
    if (typeof this.delay === 'function') {
      this._delays = (function() {
        var _i, _len, _ref, _results;
        _ref = this._objects;
        _results = [];
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          obj = _ref[i];
          _results.push(this.delay.call(obj, i, obj));
        }
        return _results;
      }).call(this);
    }
    if (typeof this.duration === 'function') {
      this._durations = (function() {
        var _i, _len, _ref, _results;
        _ref = this._objects;
        _results = [];
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          obj = _ref[i];
          _results.push(this.duration.call(obj, i, obj));
        }
        return _results;
      }).call(this);
    }
    _ref = this._objects;
    for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
      obj = _ref[i];
      if (obj == null) {
        continue;
      }
      this._initialValues[i] = {};
      this._finalValues[i] = {};
      this._done[i] = false;
      _ref1 = this.values;
      for (name in _ref1) {
        if (!__hasProp.call(_ref1, name)) continue;
        value = _ref1[name];
        _obj = obj;
        split = name.split('.');
        for (n = _j = 0, _len1 = split.length; _j < _len1; n = ++_j) {
          _name = split[n];
          if (n !== split.length - 1) {
            _obj = _obj[_name];
          }
        }
        if (!((_ref2 = typeof _obj[_name]) === 'number' || _ref2 === 'function')) {
          cg.warn("Tween: Property named \"" + _name + "\" of " + _obj + " is of an unsupported type: \"" + (typeof _obj[_name]) + "\"; ignoring it!");
          cg.warn("typeof obj: " + (typeof _obj));
          continue;
        }
        if (typeof value === 'function') {
          value = value.call(_obj, i, _obj);
        }
        if (typeof value !== 'string') {
          relative = false;
        } else {
          value = value.trim();
          relative = true;
          value = parseFloat(value);
        }
        if (typeof _obj[_name] === 'function') {
          this._initialValues[i][name] = _obj[_name]();
        } else {
          this._initialValues[i][name] = _obj[_name];
        }
        if (relative || this.relative) {
          this._finalValues[i][name] = this._initialValues[i][name] + value;
        } else {
          this._finalValues[i][name] = value;
        }
      }
    }
    return this;
  };


  /**
  Stop tweening `object`'s `values`.
  @method stop
  @chainable
   */

  Tween.prototype.stop = function() {
    this.emit('removed');
    this.removed = true;
    this.active = false;
    return this;
  };


  /**
  Called by this `Tween`'s associated `Tweenable` each tick.
  
  @method update
  @protected
  @return `true` if this tween has completed
   */


  /**
  Fired each tick *immediately after* `object`'s `values` have been updated.
  
  @event update(object)
  @param object {Object} `object` after having its values updated for one tick
   */

  Tween.prototype.update = function() {
    var amount, delay, delta, duration, i, initial, n, name, obj, split, target, val, _i, _j, _len, _len1, _name, _obj, _ref, _ref1, _ref2, _ref3, _ref4, _ref5;
    if (this.removed) {
      return true;
    }
    this.time += cg.dt;
    _ref = this._objects;
    for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
      obj = _ref[i];
      if (this._done[i]) {
        continue;
      }
      if (obj == null) {
        this._done[i] = true;
        ++this._totalDone;
        continue;
      }
      delay = (_ref1 = (_ref2 = this._delays) != null ? _ref2[i] : void 0) != null ? _ref1 : this.delay;
      duration = (_ref3 = (_ref4 = this._durations) != null ? _ref4[i] : void 0) != null ? _ref3 : this.duration;
      if (this.time < delay) {
        continue;
      }
      delta = cg.math.clamp((this.time - delay) / duration, 0, 1);
      amount = this.easeFunc(delta);
      if (delta >= 1) {
        this._done[i] = true;
        ++this._totalDone;
      }
      _ref5 = this._initialValues[i];
      for (name in _ref5) {
        if (!__hasProp.call(_ref5, name)) continue;
        initial = _ref5[name];
        _obj = obj;
        split = name.split('.');
        for (n = _j = 0, _len1 = split.length; _j < _len1; n = ++_j) {
          _name = split[n];
          if (n !== split.length - 1) {
            _obj = _obj[_name];
          }
        }
        target = this._finalValues[i][name];
        val = initial + (target - initial) * amount;
        if (typeof _obj[_name] === 'function') {
          _obj[_name](val);
        } else {
          _obj[_name] = val;
        }
      }
    }
    this.emit('update', this._eventObjects);
    if (this._totalDone >= this._objects.length) {
      this.active = false;
      return true;
    }
    return false;
  };

  Tween.prototype._complete = function() {
    if (this.removed) {
      return;
    }
    this.emit('complete', this._eventObjects);
    this._deferred.resolve(this._eventObjects);
    return this.stop();
  };


  /**
  Linear `easeFunc`.
  
  @static
  @property Linear
   */

  Tween.Linear = function(k) {
    return k;
  };

  Tween.Quake = {
    In: function(k) {
      if (k === 1) {
        return 1;
      }
      return k + cg.rand.normal() * k;
    },
    Out: function(k) {
      if (k === 1) {
        return 1;
      }
      return k + cg.rand.normal() * (1 - k);
    },
    InOut: function(k) {
      if (k < 0.5) {
        return Tween.Quake.In(k * 2) * 0.5;
      } else {
        return Tween.Quake.Out(k * 2 - 1) * 0.5 + 0.5;
      }
    }
  };

  Tween.Elastic = {

    /**
    [Elastic-In](http://easings.net/#easeInElastic) `easeFunc`
    
    @static
    @property Elastic.In
     */
    In: function(k) {
      var a, p, s;
      s = void 0;
      a = 0.1;
      p = 0.4;
      if (k === 0) {
        return 0;
      }
      if (k === 1) {
        return 1;
      }
      if (!a || a < 1) {
        a = 1;
        s = p / 4;
      } else {
        s = p * Math.asin(1 / a) / (2 * Math.PI);
      }
      return -(a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
    },

    /**
    [Elastic-Out](http://easings.net/#easeOutElastic) `easeFunc`
    
    @static
    @property Elastic.Out
     */
    Out: function(k) {
      var a, p, s;
      s = void 0;
      a = 0.1;
      p = 0.4;
      if (k === 0) {
        return 0;
      }
      if (k === 1) {
        return 1;
      }
      if (!a || a < 1) {
        a = 1;
        s = p / 4;
      } else {
        s = p * Math.asin(1 / a) / (2 * Math.PI);
      }
      return a * Math.pow(2, -10 * k) * Math.sin((k - s) * (2 * Math.PI) / p) + 1;
    },

    /**
    [Elastic-In-Out](http://easings.net/#easeInOutElastic) `easeFunc`
    
    @static
    @property Elastic.InOut
     */
    InOut: function(k) {
      var a, p, s;
      s = void 0;
      a = 0.1;
      p = 0.4;
      if (k === 0) {
        return 0;
      }
      if (k === 1) {
        return 1;
      }
      if (!a || a < 1) {
        a = 1;
        s = p / 4;
      } else {
        s = p * Math.asin(1 / a) / (2 * Math.PI);
      }
      if ((k *= 2) < 1) {
        return -0.5 * (a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
      }
      return a * Math.pow(2, -10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p) * 0.5 + 1;
    }
  };

  Tween.Quad = {

    /**
    [Quad-In](http://easings.net/#easeInQuad) `easeFunc`
    
    @static
    @property Quad.In
     */
    In: function(k) {
      return k * k;
    },

    /**
    [Quad-Out](http://easings.net/#easeOutQuad) `easeFunc`
    
    @static
    @property Quad.Out
     */
    Out: function(k) {
      return k * (2 - k);
    },

    /**
    [Quad-InOut](http://easings.net/#easeInOutQuad) `easeFunc`
    
    @static
    @property Quad.InOut
     */
    InOut: function(k) {
      if ((k *= 2) < 1) {
        return 0.5 * k * k;
      }
      return -0.5 * (--k * (k - 2) - 1);
    }
  };

  Tween.Back = {

    /**
    [Back-In](http://easings.net/#easeInBack) `easeFunc`
    
    @static
    @property Back.In
     */
    In: function(k) {
      var s;
      s = 1.70158;
      return k * k * ((s + 1) * k - s);
    },

    /**
    [Back-Out](http://easings.net/#easeOutBack) `easeFunc`
    
    @static
    @property Back.Out
     */
    Out: function(k) {
      var s;
      s = 1.70158;
      return --k * k * ((s + 1) * k + s) + 1;
    },

    /**
    [Back-InOut](http://easings.net/#easeInOutBack) `easeFunc`
    
    @static
    @property Back.InOut
     */
    InOut: function(k) {
      var s;
      s = 1.70158 * 1.525;
      if ((k *= 2) < 1) {
        return 0.5 * (k * k * ((s + 1) * k - s));
      }
      return 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2);
    }
  };

  Tween.Bounce = {

    /**
    [Bounce-In](http://easings.net/#easeInBounce) `easeFunc`
    
    @static
    @property Bounce.In
     */
    In: function(k) {
      return 1 - Tween.Bounce.Out(1 - k);
    },

    /**
    [Bounce-Out](http://easings.net/#easeOutBounce) `easeFunc`
    
    @static
    @property Bounce.Out
     */
    Out: function(k) {
      if (k < (1 / 2.75)) {
        return 7.5625 * k * k;
      } else if (k < (2 / 2.75)) {
        return 7.5625 * (k -= 1.5 / 2.75) * k + 0.75;
      } else if (k < (2.5 / 2.75)) {
        return 7.5625 * (k -= 2.25 / 2.75) * k + 0.9375;
      } else {
        return 7.5625 * (k -= 2.625 / 2.75) * k + 0.984375;
      }
    },

    /**
    [Bounce-InOut](http://easings.net/#easeInOutBounce) `easeFunc`
    
    @static
    @property Bounce.InOut
     */
    InOut: function(k) {
      if (k < 0.5) {
        return Tween.Bounce.In(k * 2) * 0.5;
      } else {
        return Tween.Bounce.Out(k * 2 - 1) * 0.5 + 0.5;
      }
    }
  };

  return Tween;

})(Module);

Tween.addEaseFunc('linear', Tween.Linear);

Tween.addEaseFunc('back.in', Tween.Back.In);

Tween.addEaseFunc('back.out', Tween.Back.Out);

Tween.addEaseFunc('back.inout', Tween.Back.InOut);

Tween.addEaseFunc('bounce.in', Tween.Bounce.In);

Tween.addEaseFunc('bounce.out', Tween.Bounce.Out);

Tween.addEaseFunc('bounce.inout', Tween.Bounce.InOut);

Tween.addEaseFunc('elastic.in', Tween.Elastic.In);

Tween.addEaseFunc('elastic.out', Tween.Elastic.Out);

Tween.addEaseFunc('elastic.inout', Tween.Elastic.Out);

Tween.addEaseFunc('quad.in', Tween.Quad.In);

Tween.addEaseFunc('quad.out', Tween.Quad.Out);

Tween.addEaseFunc('quad.inout', Tween.Quad.InOut);

Tween.addEaseFunc('quake', Tween.Quake.InOut);

Tween.addEaseFunc('quake.in', Tween.Quake.In);

Tween.addEaseFunc('quake.out', Tween.Quake.Out);

Tween.addEaseFunc('quake.inout', Tween.Quake.InOut);

module.exports = Tween;


},{"Module":9,"cg":15,"util/HasSignals":72,"util/Promises":73}],14:[function(require,module,exports){
var Tween, Tweenable,
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
  __slice = [].slice;

Tween = require('Tween');


/**
TODOC
@class Tweenable
 */

Tweenable = {
  mixin: {

    /**
    Add a `Tween` to begin tweening.
    
    @private
    @method _addTween
     */
    _addTween: function(tween) {
      if (!(__indexOf.call(this.__tweens, tween) >= 0)) {
        return this.__tweens.push(tween);
      }
    },

    /**
    "Ease" this object's numeric property (or number of properties) from one value to another.
    
    @method tween
    @param [params] {Object} Parameters that define how the `Tween` should behave (see below).
    @param [params.values] {Object} A key-value pair of the final values to be applied to this object.
    @param [params.duration=500] {Number(milliseconds)} The span of time over which this object's `value`s should be tweened.
    @param [params.easeFunc=`Tween.Quadratic.InOut`] {Function}
    @param [params.delay=0] {Number(milliseconds)} The amount of time after `start` is called before the tween should begin.
    @param [params.relative=false] {Boolean} Whether `values` should represent a delta to be added to this object's current values, rather than the absolute final values.
    @param [params.tweener=this] {Tweenable} The `Tweenable` to be used to drive this `Tween`.
    @param [params.immediate=true] {Boolean} If true, `start()` will be called immediately on the resulting `Tween`.
    @return {Promise} A promise that will be resolved when this tween completes, or rejected when `stop()` is called.
     */
    tween: function() {
      var args, delay, duration, easeFunc, obj, params, property, value, values, _ref;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      if (typeof args[0] === 'string') {
        obj = this;
        property = args[0], value = args[1], duration = args[2], easeFunc = args[3], delay = args[4];
      } else if (typeof args[0] === 'object') {
        if (typeof args[1] === 'string') {
          _ref = args.slice(1), obj = _ref[0], property = _ref[1], value = _ref[2], duration = _ref[3], easeFunc = _ref[4], delay = _ref[5];
        } else if (typeof args[1] === 'object') {
          obj = args[0], params = args[1];
        } else {
          obj = this;
          params = args[0];
        }
      }
      if (params == null) {
        values = {};
        values[property] = value;
        params = {
          values: values,
          duration: duration,
          easeFunc: easeFunc,
          delay: delay
        };
      }
      if (params.tweener == null) {
        params.tweener = this;
      }
      return new Tween(obj, params);
    }
  },
  preInit: function() {
    this.__tweens = [];
    return this.__completedTweens = [];
  },
  update: function() {
    var idx, tween, _i, _j, _len, _len1, _ref, _ref1;
    _ref = this.__completedTweens;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      tween = _ref[_i];
      idx = this.__tweens.indexOf(tween);
      if (idx >= 0) {
        this.__tweens.splice(idx, 1);
      }
      tween._complete();
    }
    this.__completedTweens = [];
    _ref1 = this.__tweens;
    for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
      tween = _ref1[_j];
      if (tween.update()) {
        this.__completedTweens.push(tween);
      }
    }
  }
};

module.exports = Tweenable;


},{"Tween":13}],15:[function(require,module,exports){
(function (global){
var Core, HasPlugins, HasSignals, Module, NOOP, cg, gfx, util,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Module = require('Module');

util = require('util/index');

HasSignals = require('util/HasSignals');

HasPlugins = require('util/HasPlugins');

gfx = require('pixi-enhanced');

Object.defineProperty(gfx.scaleModes, 'DEFAULT', {
  get: function() {
    return cg.textureFilter;
  },
  set: function(val) {
    return cg.textureFilter = val;
  }
});


/**
Reference to this game's [`cg.AssetManager`](cg.AssetManager.html) instance.

@class cg.assets
 */


/**
Reference to this game's [`cg.ui.UIManager`](cg.ui.UIManager.html) instance.

@class cg.ui
 */

NOOP = function() {};


/**
The global `cg.Core` instance.

@class cg.Core
 */

Core = (function(_super) {
  __extends(Core, _super);

  Core.prototype.Module = Module;

  Core.prototype.Core = Core;

  Core.prototype.gfx = gfx;

  Core.mixin(HasSignals);

  Core.mixin(HasPlugins);

  Core.prototype.util = util;

  Core.prototype.setLogLevel = function(lvl) {
    var i, levels, n, name, _results;
    levels = ['info', 'debug', 'warn', 'error'];
    if (lvl === 'verbose') {
      i = 0;
    } else {
      i = levels.indexOf(lvl);
    }
    n = 0;
    while (n < i) {
      name = levels[i];
      if (name === 'debug') {
        name = 'log';
      }
      cg[name] = NOOP;
      ++n;
    }
    _results = [];
    while (i < levels.length) {
      name = levels[i];
      if (name === 'debug') {
        name = 'log';
      }
      cg[name] = console[name].bind(console);
      _results.push(++i);
    }
    return _results;
  };

  Core.prototype.__defineProperties = function() {

    /**
    Hex-formatted RGB value (eg 0xFF0000 is red); setting this will automatically change
    the color used to clear the screen after each frame rendered.
    
    @property backgroundColor
    @type Number
     */
    Object.defineProperty(this, 'backgroundColor', {
      get: function() {
        return this.__backgroundColor;
      },
      set: function(val) {
        var _ref;
        if (val === this.__backgroundColor) {
          return;
        }
        if ((_ref = this.stageRoot) != null) {
          _ref.setBackgroundColor(val);
        }
        return this.__backgroundColor = val;
      }
    });

    /**
    A hint about how the display region of the game should behave, as well as how textures should be filtered.
    
    There are five valid values:
    
    * `'aspect'` - compute [`scale`](#property_scale) to fit inside the display area while maintaining an aspect ratio of [`width`](#property_width):[`height`](#property_height).
    * `'pixel'` - like `'aspect'`, but use a framebuffer of [`width`](#property_width)x[`height`](#property_height) if [`scale`](#property_scale) is not `1`.
    * `'pixelPerfect'` - like `'pixel'`, but when scaling the framebuffer, use the largest whole-digit scale factor that fits (eg. 1x, 2x, 3x...).
    * `'fill'` - fill the entire display area ([`width`](#property_width) and [`height`](#property_height) are computed based on [the dimensions of the display container](#method_getDeviceWidth()), and [`scale`](#property_scale)).
    * `'fillPixel'` - like `'fill'`, but use a framebuffer if [`scale`](#property_scale) is not `1`.
    
    If `'pixel'`, `'pixelPerfect'`, or `'fillPixel'` is specified, [`textureFilter`](#property_textureFilter)
    and [`resizeFilter`](#property_resizeFilter) will be set to `'nearest'`, unless explicitly specified.
    
    @property displayMode
    @type String
    @default 'aspect'
     */
    Object.defineProperty(this, 'displayMode', {
      get: function() {
        return this.__displayMode;
      },
      set: function(val) {
        if (this.__displayMode === val) {
          return;
        }
        this.__displayMode = val;
        if (val === 'pixel' || val === 'pixelPerfect' || val === 'fillPixel') {
          this.__defaultFilter = 'nearest';
          this.__defaultRoundPixels = true;
        } else {
          this.__defaultFilter = 'linear';
          this.__defaultRoundPixels = false;
        }
        this.__needsTextureUpdates = true;
        return this.__needsTriggerResize = true;
      }
    });

    /**
    The default way textures should be rendered when scaled, stretched, or rotated.
    
    One of two valid values:
    
    * `'linear'` - Smooth out textures.
    * `'nearest'` - Preserve "pixellyness" of textures.
    
    Any textures that don't explicitly set a [`filterMode`](cg.Texture.html#property_filterMode) will inherit this value.
    
    Changing this value will automatically update all applicable textures before the next frame is rendered.
    
    **Default**: `'nearest'` if [`displayMode`](#property_displayMode) is `'pixel'`, `'pixelPerfect'`, or `'fillPixel'`; `'linear'` otherwise
    
    @property textureFilter
    @type String
     */
    Object.defineProperty(this, 'textureFilter', {
      get: function() {
        var _ref;
        return (_ref = this.__textureFilter) != null ? _ref : this.__defaultFilter;
      },
      set: function(val) {
        if (this.__textureFilter === val) {
          return;
        }
        this.__textureFilter = val;
        this.__needsTextureUpdates = true;
        return this.__needsTriggerResize = true;
      }
    });

    /**
    The [`filterMode`](cg.BaseTexture.html#property_filterMode) used on the framebuffer; ignored unless [`displayMode`](#property_displayMode) is `'pixel'` or `'pixelPerfect'`.
    
    One of two valid values:
    
    * `'linear'` - Smooth out the stretched framebuffer
    * `'nearest'` - Preserve "pixellyness" of the framebuffer
    
    @property resizeFilter
    @type String
    @default 'nearest'
     */
    Object.defineProperty(this, 'resizeFilter', {
      get: function() {
        var _ref;
        return (_ref = this.__resizeFilter) != null ? _ref : 'nearest';
      },
      set: function(val) {
        if (this.__resizeFilter === val) {
          return;
        }
        this.__resizeFilter = val;
        return this.__needsTriggerResize = true;
      }
    });

    /**
    The virtual width of this game's display area, in game-units (or pixels at 1x scale).
    
    @property width
    @type number
    @default 400
     */
    Object.defineProperty(this, 'width', {
      get: function() {
        return this.__width;
      },
      set: function(val) {
        if (this.__width === val) {
          return;
        }
        this.__width = val;
        return this.__needsTriggerResize = true;
      }
    });

    /**
    The virtual height of this game's display area, in game-units (or pixels at 1x scale).
    
    @property height
    @type number
    @default 240
     */
    Object.defineProperty(this, 'height', {
      get: function() {
        return this.__height;
      },
      set: function(val) {
        if (this.__height === val) {
          return;
        }
        this.__height = val;
        return this.__needsTriggerResize = true;
      }
    });

    /**
    The ratio of the display's actual size in pixels to its virtual size.
    
    @property scale
    @type number
     */
    Object.defineProperty(this, 'scale', {
      get: function() {
        return this.__scale;
      },
      set: function(val) {
        if (this.__scale === val) {
          return;
        }
        this.__scale = val;
        return this.__needsTriggerResize = true;
      }
    });

    /**
    Shorthand for `cg.assets.music`
    @property music
     */
    Object.defineProperty(this, 'music', {
      get: function() {
        return this.assets.music;
      }
    });

    /**
    Shorthand for `cg.assets.sounds`
    @property sounds
     */
    Object.defineProperty(this, 'sounds', {
      get: function() {
        return this.assets.sounds;
      }
    });

    /**
    Shorthand for `cg.assets.textures`
    @property textures
     */
    Object.defineProperty(this, 'textures', {
      get: function() {
        return this.assets.textures;
      }
    });

    /**
    Shorthand for `cg.assets.sheets`
    @property sheets
     */
    Object.defineProperty(this, 'sheets', {
      get: function() {
        return this.assets.sheets;
      }
    });

    /**
    Shorthand for `cg.assets.json`
    @property json
     */
    return Object.defineProperty(this, 'json', {
      get: function() {
        return this.assets.json;
      }
    });
  };

  Core.prototype._newRenderer = function() {
    throw new Error('_newRenderer: unimplemented!');
  };

  function Core() {
    this.classes = {};
    this.__byID = {};
    this.__nextID = 1;
  }

  Core.create = function() {
    var instance, k, ret, v;
    instance = (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(this, arguments, function(){});
    ret = instance["default"].bind(instance);
    for (k in instance) {
      v = instance[k];
      ret[k] = v;
    }
    instance.__defineProperties.apply(ret);
    return ret;
  };

  Core.prototype["default"] = function(query) {
    var classGroup, className, final, group, groups, _i, _j, _len, _len1, _ref;
    if (query == null) {
      query = '';
    }
    query = query.trim();
    if (query[0] === '#') {
      return this.getActorByID(query.substr(1));
    }
    groups = [];
    _ref = query.split(' ');
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      className = _ref[_i];
      className = className.trim();
      if (className.length === 0) {
        continue;
      }
      classGroup = this.classes[className];
      if (classGroup != null) {
        groups.push(classGroup);
      }
    }
    if (groups.length === 1) {
      return groups[0];
    }
    final = cg.Group.create();
    for (_j = 0, _len1 = groups.length; _j < _len1; _j++) {
      group = groups[_j];
      final.addAll(group);
    }
    return final;
  };

  Core.prototype._setActorByID = function(actor, id) {
    if (!id) {
      delete this.__byID[actor.id];
      return id;
    }
    if (this.__byID[id]) {
      cg.warn('Actor with id ' + id + ' already exists; ignoring.');
      return null;
    }
    this.__byID[id] = actor;
    return id;
  };

  Core.prototype.getActorByID = function(id) {
    return this.__byID[id];
  };

  Core.prototype.getNextID = function() {
    return this.__nextID++;
  };

  Core.prototype.init = function(params) {
    var dtex, filterProp, k, stg, v, _i, _len, _ref, _ref1;
    if (params == null) {
      params = {};
    }
    this.__plugins_preInit();

    /**
    Emitted when the user attempts to close the game.
    
    TODOC
    @event quitAttempt
     */
    this.on('quitAttempt', (function(_this) {
      return function() {
        return _this.quit();
      };
    })(this));

    /**
    Emitted when the game gains input focus.
    @event focus
     */
    this.on('focus', (function(_this) {
      return function() {
        _this.__lastCall = Date.now();
        _this._focused = true;
      };
    })(this));

    /**
    Emitted when the game loses input focus.
    @event blur
     */
    this.on('blur', (function(_this) {
      return function() {
        _this.__lastCall = Date.now();
        _this._focused = false;
      };
    })(this));

    /**
    Emitted when the game's visibility changes.
    
    TODOC (What exactly does this mean in various circumstances?)
    @event
     */
    this.on('visibilityChange', (function(_this) {
      return function(visible) {
        _this.__lastCall = Date.now();
        return _this._visible = visible;
      };
    })(this));
    for (k in params) {
      if (!__hasProp.call(params, k)) continue;
      v = params[k];
      this[k] = v;
    }
    this.rand = cg.math.Random.create(Date.now());
    this.renderer = this._newRenderer(this.width, this.height, this.textureFilter);
    dtex = cg.gfx.Sprite.prototype.__defaultTexture = new cg.RenderTexture(10, 10);
    gfx = new cg.gfx.Graphics;
    stg = new cg.gfx.Stage(0xFF00FF);
    stg.addChild(gfx);
    gfx.clear();
    gfx.beginFill(0xFF00FF);
    gfx.drawRect(0, 0, 10, 10);
    gfx.endFill();
    dtex.render(stg);
    this.stageRoot = new cg.gfx.Stage;
    this.stageRoot.setBackgroundColor(this.backgroundColor);
    this.stage = this.stageRoot.addChild(new cg.Actor);
    if (this.backgroundColor == null) {
      this.backgroundColor = 0x000000;
    }
    this._disposed = [];
    if (this.displayMode == null) {
      this.displayMode = 'aspect';
    }
    _ref = ['textureFilter', 'resizeFilter'];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      filterProp = _ref[_i];
      if ((_ref1 = !this[filterProp]) === 'linear' || _ref1 === 'nearest') {
        cg.warn('Unexpected filter mode: ' + this[filterProp] + '. Defaulting to "linear"');
        this[filterProp] = 'linear';
      }
    }
    if (this.fps == null) {
      this.fps = 60;
    }
    if (this.timeScale == null) {
      this.timeScale = 1;
    }
    this.dt = 1000 / this.fps;
    this.dt_seconds = this.dt / 1000;
    this._focused = true;
    this._visible = true;
    this.currentTime = 0;
    this.__accum = this.dt;
    this.assets = new cg.AssetManager;
    this._triggerResize(true);
    return this.__plugins_init();
  };

  Core.prototype.mainLoop = function() {
    var count, d, delta, dh, dw, now, start, stop;
    dw = this.getDeviceWidth();
    dh = this.getDeviceHeight();
    if ((dw !== this._dwCache) || (dh !== this._dhCache) || this.__needsTriggerResize) {
      this._dwCache = dw;
      this._dhCache = dh;
      this._triggerResize();
      this.resized = true;
    } else {
      this.resized = false;
    }
    if (!this._focused) {
      return;
    }
    now = Date.now();
    if (this.__lastCall == null) {
      this.__lastCall = now;
    }
    delta = now - this.__lastCall;
    count = 0;
    this.__lastCall = now;
    start = Date.now();
    this.__accum = Math.min(this.dt * 10, this.__accum + delta);
    if (this.profiling) {
      console.profile('update');
    }
    while ((this.__accum >= this.dt / this.timeScale) && count < 20) {
      ++count;
      this.update();
      this.__accum -= this.dt / this.timeScale;
    }
    if (this.profiling) {
      console.profileEnd();
    }
    if (!this._visible) {
      return;
    }
    if (this.profiling) {
      console.profile('draw');
    }
    this.draw((1 - this.__accum / this.dt / this.timeScale) / 1000);
    if (this.profiling) {
      console.profileEnd();
    }
    stop = Date.now();
    return d = stop - start;
  };

  Core.prototype._triggerResize = function(forceResize) {
    var dh, displayAR, dw, frameBuffer, frameBufferSprite, gameAR, newScale, prevHeight, prevScale, prevWidth, _ref;
    if (forceResize == null) {
      forceResize = true;
    }
    this.__needsTriggerResize = false;
    prevScale = this.scale;
    prevWidth = this.width;
    prevHeight = this.height;
    switch (this.displayMode) {
      case 'fill':
      case 'fillPixel':
        if (this.scale == null) {
          this.scale = 1;
        }
        this.width = Math.floor(this.getDeviceWidth() / this.scale);
        this.height = Math.floor(this.getDeviceHeight() / this.scale);
        break;
      default:
        if (this.width == null) {
          this.width = 400;
        }
        if (this.height == null) {
          this.height = 240;
        }
        dw = this.getDeviceWidth();
        dh = this.getDeviceHeight();
        displayAR = dw / dh;
        gameAR = this.width / this.height;
        if (gameAR > displayAR) {
          newScale = dw / this.width;
        } else {
          newScale = dh / this.height;
        }
        if (this.displayMode === 'pixelPerfect') {
          newScale = Math.max(1, Math.floor(newScale));
        }
        this.scale = newScale;
    }
    if (!(((_ref = this.displayMode) === 'pixel' || _ref === 'pixelPerfect' || _ref === 'fillPixel') && this.scale !== 1)) {
      if (this.frameBufferStage != null) {
        if (this.frameBufferStage.children.length > 0) {
          this.frameBufferStage.removeChildren();
        }
        delete this.frameBufferStage;
        this.stageRoot.addChild(this.stage);
      }
      this.stage.scale.x = this.stage.scale.y = this.scale;
      this.__render = (function(_this) {
        return function() {
          return _this.renderer.render(_this.stageRoot);
        };
      })(this);
    } else {
      this.stage.scale.x = this.stage.scale.y = 1;
      frameBuffer = new cg.RenderTexture(this.width, this.height, this.renderer, this.resizeFilter);
      frameBufferSprite = new cg.gfx.Sprite(frameBuffer);
      this.frameBufferStage = new cg.gfx.Stage;
      this.frameBufferStage.addChild(frameBufferSprite);
      frameBufferSprite.width = this.width;
      frameBufferSprite.height = this.height;
      frameBufferSprite.scale.x = this.scale;
      frameBufferSprite.scale.y = this.scale;
      this.__render = (function(_this) {
        return function() {
          var child, _i, _len, _ref1, _results;
          if (_this.frameBufferStage.backgroundColor !== _this.stageRoot.backgroundColor) {
            _this.frameBufferStage.setBackgroundColor(_this.stageRoot.backgroundColor);
          }
          frameBuffer.render(_this.stage, {
            x: 0,
            y: 0
          }, true);
          _this.renderer.render(_this.frameBufferStage);
          _ref1 = _this.stageRoot.children;
          _results = [];
          for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            child = _ref1[_i];
            _results.push(child.updateTransform());
          }
          return _results;
        };
      })(this);
    }
    if (!this._needsResize) {
      this._needsResize = prevScale !== this.scale || prevWidth !== this.width || prevHeight !== this.height;
    }
    if ((this.renderer != null) && this._needsResize || forceResize) {
      this.renderer.resize(this.getRendererWidth(), this.getRendererHeight(), this._needsResize = false);
      return this.emit('resize', this);
    }
  };

  Core.prototype.draw = function(t) {
    var d, start, stop, _i, _len, _ref;
    start = Date.now();
    if (this.__needsTextureUpdates) {
      _ref = this.gfx._textures;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        t = _ref[_i];
        if ((t._scaleMode != null) || (t.source == null)) {
          continue;
        }
        this.gfx.__combo__texturesToUpdate.push(t);
      }
      this.__needsTextureUpdates = false;
    }
    this.stage._draw();
    this.__render();
    stop = Date.now();
    return d = stop - start;
  };

  Core.prototype.getDeviceWidth = function() {
    throw new Error('Called unimplemented version of getDeviceWidth');
  };

  Core.prototype.getDeviceHeight = function() {
    throw new Error('Called unimplemented version of getDeviceHeight');
  };

  Core.prototype.maximizeWindow = function() {
    return cg.warn('maximizeWindow not available on this device');
  };

  Core.prototype.minimizeWindow = function() {
    return cg.warn('minimizeWindow not available on this device');
  };

  Core.prototype.restoreWindow = function() {
    return cg.warn('restoreWindow not available on this device');
  };

  Core.prototype.resizeWindow = function(width, height) {
    return cg.warn('resizeWindow not available on this device');
  };

  Core.prototype.quit = function() {};

  Core.prototype._dispose = function(obj) {
    return this._disposed.push(obj);
  };

  Core.prototype._addActorToClassGroup = function(actor, cls) {
    var _base;
    if (actor._destroyed) {
      return;
    }
    if ((_base = this.classes)[cls] == null) {
      _base[cls] = cg.Group.create();
    }
    return this.classes[cls].add(actor);
  };

  Core.prototype._removeActorFromClassGroup = function(actor, cls) {
    if (!this.classes[cls]) {
      return;
    }
    this.classes[cls].remove(actor);
    if (this.classes[cls].length === 0) {
      return delete this.classes[cls];
    }
  };


  /**
  Recursively updates all non-paused children.
  
  After updating, disposes any children that have been [`destroy`](cg.Actor.html#method_destroy)ed.
  
  @method update
   */

  Core.prototype.update = function() {
    var obj, _i, _len, _ref;
    this.__plugins_preUpdate();
    this.currentTime += cg.dt;
    this.stage._update();
    _ref = this._disposed;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      obj = _ref[_i];
      obj._dispose();
      if (obj.id != null) {
        delete this.__byID[obj.id];
      }
    }
    this._disposed = [];
    this.__plugins_update();
  };


  /**
  TODOC
  
  @method delay
  @return {cg.Tween} The newly-created tween.
   */

  Core.prototype.delay = function(time, func) {
    var t;
    t = new cg.Tween(this, {
      duration: time,
      immediate: false
    });
    t.start().then(func);
    return t;
  };

  return Core;

})(Module);

cg = Core.create();

if (typeof global !== "undefined" && global !== null) {
  global.cg = cg;
}

if (typeof window !== "undefined" && window !== null) {
  window.cg = cg;
}

cg.setLogLevel('verbose');

module.exports = cg;


}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"Module":9,"pixi-enhanced":48,"util/HasPlugins":70,"util/HasSignals":72,"util/index":77}],16:[function(require,module,exports){
var Module, UserDataManager,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Module = require('Module');


/**
Store and retrieve data (eg. save game info, preferences, etc).

@class cg.data.UserDataManager
@constructor
@param namespace {String}
A unique name for data associated with this `UserDataManager`.
 */

UserDataManager = (function(_super) {
  __extends(UserDataManager, _super);

  function UserDataManager(namespace) {
    this.namespace = namespace;
    if (this.namespace == null) {
      throw new Error('Namespace parameter is required for creating a new UserDataManager');
    }
  }


  /**
  Retrieve data associated with a given key. The type of the data is preserved from when it was set.
  
  @method get
  @param key {String}
  The identifier for the data you wish to retrieve.
  @return {Promise}
  A Promise that resolves with the value associated with the given key.
  If the value doesn't exist, `undefined` is resolved successfully; the promise
  is only rejected with an error if there is some internal problem accessing
  user data.
  
  @example
  data.get('color', function (err, color) {
    cg.log('Color: ' + color);
  });
  
  @example
  data.get('preferences', function (err, prefs) {
    if (err) {
      cg.error('Unexpected error when loading preferences: ' + err);
      return;
    }
    cg.log(prefs.difficulty);                    // "Hurt Me Plenty!"
    cg.log('Hello, ' + prefs.player_name + '.'); // "Hello, Clarice."
  });
   */

  UserDataManager.prototype.get = function(key, cb) {
    throw new Error('You must be override UserDataManager::get; do not call `super` within your implementation.');
  };


  /**
  Store some data with a given key name.
  
  @method set
  @param key {String}
  A unique identifier with which you will later retrieve the data.
  
  @param value {Number|String|Object}
  The data to associate with the specified key.
  **NOTE**: If specifying an `Object`, it will be serialized as JSON before storage; it must therefore not contain any circular references.
  
  @example
  data.set('color', 'red');
  
  @example
  var prefs = {
    difficulty: 'Hurt Me Plenty!',
    player_name: 'Clarice'
  };
  
  data.set('preferences', prefs, function (err) {
    if (err) {
      cg.error('Unexpected error when saving preferences: ' + err);
    }
  });
   */

  UserDataManager.prototype.set = function(key, value, cb) {
    throw new Error('You must be override UserDataManager::set; do not call `super` within your implementation.');
  };

  return UserDataManager;

})(Module);

module.exports = UserDataManager;


},{"Module":9}],17:[function(require,module,exports){
var LoadingScreen, Scene, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Scene = require('Scene');


/**
@class cg.extras.LoadingScreen
@constructor
@param [properties]
A set of name/value pairs that will be copied into the resulting `LoadingScreen` object, as with [`cg.Actor`](cg.Actor.html)

@param [properties.barHeight=20]
Height in virtual pixels of the loading bar.

@param [properties.padding=4]
Amount of padding inside the loading bar's container; this essentially forms a border around the progress bar.

@param [properties.bgColor=0x000000]
The color of the loading bar's background.

@param [properties.bgColor=0xFFF]
The color of the loading bar's progress bar.
 */

LoadingScreen = (function(_super) {
  __extends(LoadingScreen, _super);

  function LoadingScreen() {
    return LoadingScreen.__super__.constructor.apply(this, arguments);
  }

  LoadingScreen.prototype.init = function() {
    this.bar = this.addChild(new cg.gfx.Graphics);
    if (this.alpha == null) {
      this.alpha = 1;
    }
    if (this.barHeight == null) {
      this.barHeight = 20;
    }
    if (this.padding == null) {
      this.padding = 4;
    }
    if (this.bgColor == null) {
      this.bgColor = 0x000000;
    }
    if (this.fgColor == null) {
      this.fgColor = 0xFFFFFF;
    }
    return this.begin();
  };


  /**
  Set the progress bar back to zero and start the loading animation.
  
  @method begin
   */

  LoadingScreen.prototype.begin = function() {
    this.progress = 0;
    return this.alpha = 1;
  };


  /**
  Animate the progress of this loading screen to a given percentage.
  
  @method setProgress
  @param val
  A number between 0 and 1 that represents the percentage of loading that has been completed.
   */

  LoadingScreen.prototype.setProgress = function(val) {
    var _ref;
    if (this.progress > val) {
      return;
    }
    if ((_ref = this._progressTween) != null) {
      _ref.stop();
    }
    return this._progressTween = this.tween({
      duration: 2000,
      easeFunc: 'linear',
      values: {
        progress: Math.min(val, 1.0)
      }
    });
  };


  /**
  Finish the loading animation.
  
  @method complete
  @return {Promise}
  A promise that resolves itself once the completion animation has finished.
  
  @example
      loadingScreen.complete().then(function () {
        loadingScreen.destroy();
        titleScreen.show();
      });
   */

  LoadingScreen.prototype.complete = function() {
    var _ref;
    if ((_ref = this._progressTween) != null) {
      _ref.stop();
    }
    return this.tween({
      duration: 100,
      easeFunc: 'linear',
      values: {
        progress: 1
      }
    }).then(function() {
      return this.hide(100).then(function() {
        return this.emit('complete');
      });
    });
  };

  LoadingScreen.prototype.update = function() {
    this.bar.clear();
    this.bar.beginFill(this.bgColor);
    this.bar.drawRect(this.padding, cg.height / 2 - this.barHeight / 2 - this.padding / 2, cg.width - 2 * this.padding, this.barHeight + this.padding);
    this.bar.endFill();
    this.bar.beginFill(this.fgColor);
    this.bar.drawRect(this.padding * 1.5, cg.height / 2 - this.barHeight / 2, this.progress * (cg.width - 2 * this.padding * 1.5), this.barHeight);
    this.bar.endFill();
    return this.bar.alpha = this.alpha;
  };

  return LoadingScreen;

})(Scene);

module.exports = LoadingScreen;


},{"Scene":10,"cg":15}],18:[function(require,module,exports){
var Interactive, PauseScreen, Scene, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Scene = require('Scene');

Interactive = require('plugins/ui/Interactive');


/**
@class cg.extras.PauseScreen
@constructor
 */

PauseScreen = (function(_super) {
  __extends(PauseScreen, _super);

  function PauseScreen() {
    return PauseScreen.__super__.constructor.apply(this, arguments);
  }

  PauseScreen.plugin(Interactive);

  PauseScreen.prototype.init = function() {
    this.bg = this.addChild(new cg.gfx.Graphics);
    this.play = this.addChild(new cg.gfx.Graphics);
    this.render();

    /**
    Fired whenever the screen is dismissed by the user in some way.
    
    @event dismiss
     */
    this.on('tap', function() {
      this.hide();
      return this.emit('dismiss');
    });
    this.on('mouseOver', function() {
      return this.play.alpha = 1;
    });
    this.on('mouseOut', function() {
      return this.play.alpha = 0.5;
    });
    return this.on(cg, 'resize', this.render);
  };

  PauseScreen.prototype.render = function() {
    var h, w;
    this.width = cg.width;
    this.height = cg.height;
    this.bg.clear();
    this.bg.beginFill(0, 0.8);
    this.bg.drawRect(0, 0, this.width, this.height);
    this.bg.endFill();
    h = this.height * 0.25;
    w = Math.min(this.width * 0.25, h);
    this.play.clear();
    this.play.beginFill(0xFFFFFF, 0.9);
    this.play.moveTo(0, 0);
    this.play.lineTo(w, h / 2);
    this.play.lineTo(0, h);
    this.play.endFill();
    this.play.x = this.width / 2 - w / 2;
    this.play.y = this.height / 2 - h / 2;
    return this.play.alpha = 0.5;
  };

  return PauseScreen;

})(Scene);

module.exports = PauseScreen;


},{"Scene":10,"cg":15,"plugins/ui/Interactive":56}],19:[function(require,module,exports){
var Scene, SplashScreen, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Scene = require('Scene');

SplashScreen = (function(_super) {
  __extends(SplashScreen, _super);

  function SplashScreen() {
    SplashScreen.__super__.constructor.apply(this, arguments);
    this.hide();
    if (this.displayTime == null) {
      this.displayTime = 2000;
    }
  }

  SplashScreen.prototype.splashIn = function() {
    this.show();
    this.once(cg.input, 'any', this.splashOut);
    return this._hideDelay = this.delay(this.displayTime, this.splashOut);
  };

  SplashScreen.prototype.splashOut = function() {
    var _ref, _ref1;
    if ((_ref = this._hideDelay) != null) {
      _ref.stop();
    }
    if ((_ref1 = this._hideTween) != null) {
      _ref1.stop();
    }
    return this._hideTween = this.hide(250, function() {
      return this.emit('done');
    });
  };

  return SplashScreen;

})(Scene);

SplashScreen.Simple = (function(_super) {
  __extends(Simple, _super);

  function Simple(logoTexture) {
    this.logoTexture = logoTexture;
    Simple.__super__.constructor.apply(this, arguments);
    this.logo = this.addChild(new cg.Actor({
      texture: this.logoTexture,
      anchorX: 0.5,
      anchorY: 0.5
    }));
    this.hide();
  }

  Simple.prototype.splashIn = function() {
    var ar, gameAR, height, scale, width, _ref, _ref1, _ref2;
    Simple.__super__.splashIn.apply(this, arguments);
    this.logo.x = cg.width / 2;
    this.logo.y = cg.height / 2;
    if ((_ref = this.widthTween) != null) {
      _ref.stop();
    }
    if ((_ref1 = this.heightTween) != null) {
      _ref1.stop();
    }
    _ref2 = this.logo, width = _ref2.width, height = _ref2.height;
    gameAR = cg.width / cg.height;
    ar = width / height;
    if (ar > gameAR) {
      scale = cg.width / width;
    } else {
      scale = cg.height / height;
    }
    this.logo.width = this.logo.height = 0;
    this.widthTween = this.logo.tween({
      values: {
        width: width * scale
      },
      easeFunc: 'elastic.out'
    });
    return this.heightTween = this.logo.tween({
      delay: 50,
      values: {
        height: height * scale
      },
      easeFunc: 'elastic.out'
    });
  };

  return Simple;

})(SplashScreen);

module.exports = SplashScreen;


},{"Scene":10,"cg":15}],20:[function(require,module,exports){
var LoadingScreen, PauseScreen, SplashScreen;

SplashScreen = require('extras/SplashScreen');

LoadingScreen = require('extras/LoadingScreen');

PauseScreen = require('extras/PauseScreen');

module.exports = {
  SplashScreen: SplashScreen,
  LoadingScreen: LoadingScreen,
  PauseScreen: PauseScreen
};


},{"extras/LoadingScreen":17,"extras/PauseScreen":18,"extras/SplashScreen":19}],21:[function(require,module,exports){
var LocalStorageUserDataManager, Promises, UserDataManager,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

UserDataManager = require('data/UserDataManager');

Promises = require('util/Promises');

LocalStorageUserDataManager = (function(_super) {
  __extends(LocalStorageUserDataManager, _super);

  function LocalStorageUserDataManager() {
    return LocalStorageUserDataManager.__super__.constructor.apply(this, arguments);
  }

  LocalStorageUserDataManager.prototype.get = function(key, cb) {
    var deferred, e;
    deferred = new Promises.Deferred;
    if (typeof cb === 'function') {
      deferred.promise.then(cb.bind(null, void 0), cb);
    }
    try {
      deferred.resolve(JSON.parse(localStorage.getItem(this.namespace + '$' + key)));
    } catch (_error) {
      e = _error;
      deferred.reject(e);
    }
    return deferred.promise;
  };

  LocalStorageUserDataManager.prototype.set = function(key, value, cb) {
    var deferred, e;
    deferred = new Promises.Deferred;
    if (typeof cb === 'function') {
      deferred.promise.then(cb.bind(null, void 0), cb);
    }
    try {
      localStorage.setItem(this.namespace + '$' + key, JSON.stringify(value));
      deferred.resolve(value);
    } catch (_error) {
      e = _error;
      deferred.reject(e);
    }
    return deferred.promise;
  };

  return LocalStorageUserDataManager;

})(UserDataManager);

module.exports = LocalStorageUserDataManager;


},{"data/UserDataManager":16,"util/Promises":73}],22:[function(require,module,exports){
var AssetManager, Deferred, Promises, WebAssetManager, WebMusic, WebSound, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

cg = require('cg');

AssetManager = require('AssetManager');

WebSound = require('implementations/web/WebSound');

WebMusic = require('implementations/web/WebMusic');

Promises = require('util/Promises');

Deferred = Promises.Deferred;

WebAssetManager = (function(_super) {
  __extends(WebAssetManager, _super);

  function WebAssetManager() {
    return WebAssetManager.__super__.constructor.apply(this, arguments);
  }

  WebAssetManager.prototype.loadJSON = function(path) {
    var ajaxRequest, deferred;
    deferred = new Deferred(this);
    ajaxRequest = new XMLHttpRequest;
    ajaxRequest.onreadystatechange = function() {
      var e, json;
      if (ajaxRequest.readyState === 4) {
        if (!(ajaxRequest.status === 200 || window.location.href.indexOf('http') === -1)) {
          return deferred.reject("Failed to load file " + path);
        } else {
          try {
            json = JSON.parse(ajaxRequest.responseText);
            return deferred.resolve(json);
          } catch (_error) {
            e = _error;
            return deferred.reject("Failed to parse file " + path + ":\n" + e.name + ": " + e.message);
          }
        }
      }
    };
    ajaxRequest.open('GET', path, true);
    if (ajaxRequest.overrideMimeType) {
      ajaxRequest.overrideMimeType('application/json');
    }
    ajaxRequest.send(null);
    return deferred.promise;
  };

  WebAssetManager.prototype.loadTexture = function(path) {
    var deferred, fileType, texture;
    deferred = new Deferred(this);
    fileType = path.split(".").pop().split('?')[0].toLowerCase();
    if (path in AssetManager._textureCache) {
      deferred.resolve(AssetManager._textureCache[path]);
    }
    if (__indexOf.call(AssetManager.textureTypes, fileType) >= 0) {
      texture = cg.gfx.Texture.fromImage(path);
      texture.path = path;
      AssetManager._textureCache[path] = texture;
      if (texture.baseTexture.hasLoaded) {
        deferred.resolve(texture);
      } else {
        texture.baseTexture.on('loaded', (function(_this) {
          return function(event) {
            return deferred.resolve(texture);
          };
        })(this));
        texture.baseTexture.on('error', (function(_this) {
          return function(event) {
            texture.error = event;
            return deferred.reject(texture);
          };
        })(this));
      }
      return deferred.promise;
    }
    if (texture == null) {
      texture = {};
    }
    cg.error(texture.error = path + ' is an unsupported file type.');
    deferred.reject(texture);
    return deferred.promise;
  };

  WebAssetManager.prototype.loadSound = function(paths, volume, numChannels) {
    var snd;
    snd = new WebSound(paths, volume, numChannels);
    return snd.load();
  };

  WebAssetManager.prototype.loadMusic = function(paths, volume) {
    var snd;
    snd = new WebMusic(paths, volume);
    return snd.load();
  };

  return WebAssetManager;

})(AssetManager);

module.exports = WebAssetManager;


},{"AssetManager":6,"cg":15,"implementations/web/WebMusic":24,"implementations/web/WebSound":25,"util/Promises":73}],23:[function(require,module,exports){

/*
combo.js - Copyright 2012-2013 Louis Acresti - All Rights Reserved
 */
var InputManager, WebInputManager, addMouseWheelHandler, cg, elementPosition, getNumericStyleProperty, setupKeys,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

cg = require('cg');

InputManager = require('input/InputManager');

setupKeys = function() {
  cg.__keys = {
    'backspace': 8,
    'tab': 9,
    'enter': 13,
    'return': 13,
    'shift': 16,
    'lshift': 16,
    'rshift': 16,
    'ctrl': 17,
    'lctrl': 17,
    'rctrl': 17,
    'alt': 18,
    'lalt': 18,
    'altr': 18,
    'pause': 19,
    'capslock': 20,
    'esc': 27,
    'space': 32,
    'pageup': 33,
    'pagedown': 34,
    'end': 35,
    'home': 36,
    'left': 37,
    'up': 38,
    'right': 39,
    'down': 40,
    'insert': 45,
    'delete': 46,
    '0': 48,
    '1': 49,
    '2': 50,
    '3': 51,
    '4': 52,
    '5': 53,
    '6': 54,
    '7': 55,
    '8': 56,
    '9': 57,
    'a': 65,
    'b': 66,
    'c': 67,
    'd': 68,
    'e': 69,
    'f': 70,
    'g': 71,
    'h': 72,
    'i': 73,
    'j': 74,
    'k': 75,
    'l': 76,
    'm': 77,
    'n': 78,
    'o': 79,
    'p': 80,
    'q': 81,
    'r': 82,
    's': 83,
    't': 84,
    'u': 85,
    'v': 86,
    'w': 87,
    'x': 88,
    'y': 89,
    'z': 90,
    'kp_0': 96,
    'kp_1': 97,
    'kp_2': 98,
    'kp_3': 99,
    'kp_4': 100,
    'kp_5': 101,
    'kp_6': 102,
    'kp_7': 103,
    'kp_8': 104,
    'kp_9': 105,
    'kp_multiply': 106,
    'kp_plus': 107,
    'kp_minus': 109,
    'kp_decimal': 110,
    'kp_divide': 111,
    'f1': 112,
    'f2': 113,
    'f3': 114,
    'f4': 115,
    'f5': 116,
    'f6': 117,
    'f7': 118,
    'f8': 119,
    'f9': 120,
    'f10': 121,
    'f11': 122,
    'f12': 123,
    'equal': 187,
    '=': 187,
    'comma': 188,
    ',': 188,
    'minus': 189,
    '-': 189,
    'period': 190,
    '.': 190
  };
  return InputManager._generateKeyNameMap();
};

addMouseWheelHandler = (function() {
  return function(element, callback) {
    var binding, handler, lowestDelta, lowestDeltaXY, toBind, _i, _results;
    handler = function(event) {
      var absDelta, absDeltaXY, args, delta, deltaX, deltaY, fn, lowestDelta, lowestDeltaXY;
      if (event == null) {
        event = window.event;
      }
      args = [].slice.call(arguments, 1);
      delta = 0;
      deltaX = 0;
      deltaY = 0;
      absDelta = 0;
      absDeltaXY = 0;
      fn = void 0;
      if (event.wheelDelta) {
        delta = event.wheelDelta;
      }
      if (event.detail) {
        delta = event.detail * -1;
      }
      if (event.deltaY) {
        deltaY = event.deltaY * -1;
        delta = deltaY;
      }
      if (event.deltaX) {
        deltaX = event.deltaX;
        delta = deltaX * -1;
      }
      if (event.wheelDeltaY !== undefined) {
        deltaY = event.wheelDeltaY;
      }
      if (event.wheelDeltaX !== undefined) {
        deltaX = event.wheelDeltaX * -1;
      }
      absDelta = Math.abs(delta);
      if (!lowestDelta || absDelta < lowestDelta) {
        lowestDelta = absDelta;
      }
      absDeltaXY = Math.max(Math.abs(deltaY), Math.abs(deltaX));
      if (!lowestDeltaXY || absDeltaXY < lowestDeltaXY) {
        lowestDeltaXY = absDeltaXY;
      }
      fn = (delta > 0 ? 'floor' : 'ceil');
      delta = Math[fn](delta / lowestDelta);
      deltaX = Math[fn](deltaX / lowestDeltaXY);
      deltaY = Math[fn](deltaY / lowestDeltaXY);
      args.unshift(event, delta, deltaX, deltaY);
      return callback.apply(null, args);
    };
    toBind = ('onwheel' in document || document.documentMode >= 9 ? ['wheel'] : ['mousewheel', 'DomMouseScroll', 'MozMousePixelScroll']);
    lowestDelta = void 0;
    lowestDeltaXY = void 0;
    _results = [];
    for (_i = toBind.length - 1; _i >= 0; _i += -1) {
      binding = toBind[_i];
      _results.push(element.addEventListener(binding, handler, false));
    }
    return _results;
  };
})();

getNumericStyleProperty = function(element, prop) {
  var style;
  style = getComputedStyle(element, null);
  return parseInt(style.getPropertyValue(prop), 10);
};

elementPosition = function(e) {
  var borderLeft, borderTop, inner, paddingLeft, paddingTop, x, y;
  x = 0;
  y = 0;
  inner = true;
  while (true) {
    x += e.offsetLeft;
    y += e.offsetTop;
    borderTop = getNumericStyleProperty(e, 'border-top-width');
    borderLeft = getNumericStyleProperty(e, 'border-left-width');
    y += borderTop;
    x += borderLeft;
    if (inner) {
      paddingTop = getNumericStyleProperty(e, 'padding-top');
      paddingLeft = getNumericStyleProperty(e, 'padding-left');
      y += paddingTop;
      x += paddingLeft;
    }
    inner = false;
    if (!(e = e.offsetParent)) {
      break;
    }
  }
  return {
    x: x,
    y: y
  };
};

WebInputManager = (function(_super) {
  __extends(WebInputManager, _super);

  WebInputManager.__initialized = false;

  WebInputManager.__initialize = function() {
    var container, preventDefaultKeys, touchStop, touchesById;
    if (this.__initialized) {
      return;
    }
    this.__initialized = true;
    setupKeys();
    preventDefaultKeys = [cg.__keys['tab'], cg.__keys['backspace']];
    container = cg.container;
    window.addEventListener('keydown', function(e) {
      var _ref, _ref1;
      if ((_ref = document.activeElement.tagName) === 'INPUT') {
        return;
      }
      if (_ref1 = e.keyCode, __indexOf.call(preventDefaultKeys, _ref1) >= 0) {
        e.preventDefault();
      }
      cg.input._triggerKeyDown(e.keyCode);
      return true;
    });
    window.addEventListener('keyup', function(e) {
      var _ref, _ref1;
      if ((_ref = document.activeElement.tagName) === 'INPUT') {
        return;
      }
      if (_ref1 = e.keyCode, __indexOf.call(preventDefaultKeys, _ref1) >= 0) {
        e.preventDefault();
      }
      cg.input._triggerKeyUp(e.keyCode);
      return true;
    });
    window.addEventListener('keypress', function(e) {
      cg.input.emit('keyPress', e.charCode);
      return true;
    });
    touchesById = {};
    container.oncontextmenu = function() {
      return false;
    };
    window.addEventListener('mousemove', function(e) {
      return cg.input._triggerMouseMove(e.pageX, e.pageY);
    });
    container.addEventListener('mousedown', function(e) {
      return cg.input._triggerMouseDown(e.which);
    });
    window.addEventListener('mouseup', function(e) {
      return cg.input._triggerMouseUp(e.which);
    });
    container.addEventListener('touchstart', function(e) {
      var num, touch, _i, _len, _ref, _results;
      e.preventDefault();
      _ref = e.touches;
      _results = [];
      for (num = _i = 0, _len = _ref.length; _i < _len; num = ++_i) {
        touch = _ref[num];
        if (__indexOf.call(e.changedTouches, touch) >= 0) {
          touchesById[touch.identifier] = t;
          _results.push(cg.input._triggerTouchDown(touch.pageX, touch.pageY, num));
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    });
    container.addEventListener('touchmove', function(e) {
      var num, touch, _i, _len, _ref, _results;
      e.preventDefault();
      _ref = e.touches;
      _results = [];
      for (num = _i = 0, _len = _ref.length; _i < _len; num = ++_i) {
        touch = _ref[num];
        if (__indexOf.call(e.changedTouches, touch) >= 0) {
          _results.push(cg.input._triggerTouchDrag(touch.pageX, touch.pageY, num));
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    });
    addMouseWheelHandler(container, function(e, delta, deltaX, deltaY) {
      return cg.input.emit('mouseWheel', {
        dx: deltaX,
        dy: deltaY
      });
    });
    touchStop = function(e) {
      var num, touch, _i, _len, _ref, _results;
      _ref = e.touches;
      _results = [];
      for (num = _i = 0, _len = _ref.length; _i < _len; num = ++_i) {
        touch = _ref[num];
        if (__indexOf.call(e.changedTouches, touch) >= 0) {
          _results.push(cg.input._triggerTouchUp(touch.pageX, touch.pageY, num));
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    };
    container.addEventListener('touchend', touchStop);
    return container.addEventListener('touchcancel', touchStop);
  };

  WebInputManager.prototype._transformDeviceCoordinates = function(pageX, pageY) {
    var h, p, view, w, x, y;
    view = cg.renderer.view;
    w = getNumericStyleProperty(view, 'width');
    h = getNumericStyleProperty(view, 'height');
    p = elementPosition(view);
    x = ((pageX - p.x) / w) * cg.width;
    y = ((pageY - p.y) / h) * cg.height;
    return [x, y];
  };

  function WebInputManager() {
    WebInputManager.__initialize();
    WebInputManager.__super__.constructor.apply(this, arguments);
  }

  return WebInputManager;

})(InputManager);

module.exports = WebInputManager;


},{"cg":15,"input/InputManager":30}],24:[function(require,module,exports){
var Music, WebMusic, WebSound, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Music = require('sound/Music');

WebSound = require('implementations/web/WebSound');

WebMusic = (function(_super) {
  __extends(WebMusic, _super);

  function WebMusic() {
    return WebMusic.__super__.constructor.apply(this, arguments);
  }

  WebMusic.mixin(WebSound.prototype);

  return WebMusic;

})(Music);

module.exports = WebMusic;


},{"cg":15,"implementations/web/WebSound":25,"sound/Music":59}],25:[function(require,module,exports){
var Howl, Promises, Sound, WebSound, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Sound = require('sound/Sound');

Promises = require('util/Promises');

Howl = require('howler/howler').Howl;

WebSound = (function(_super) {
  __extends(WebSound, _super);

  function WebSound() {
    return WebSound.__super__.constructor.apply(this, arguments);
  }

  WebSound.prototype.load = function() {
    var deferred;
    WebSound.__super__.load.apply(this, arguments);
    deferred = new Promises.Deferred;
    if (this.__loaded) {
      deferred.resolve(this);
    } else {
      this.__sound = new Howl({
        urls: this.paths,
        volume: this.volume,
        onload: (function(_this) {
          return function() {
            _this.__loaded = true;
            return deferred.resolve(_this);
          };
        })(this),
        onend: (function(_this) {
          return function() {
            if (!_this.looping) {
              return _this.__playing = false;
            }
          };
        })(this),
        onloaderror: (function(_this) {
          return function() {
            return deferred.reject(new Error(_this));
          };
        })(this)
      });
    }
    return deferred.promise;
  };

  WebSound.prototype._setVolume = function(volume, idx) {
    var _ref;
    WebSound.__super__._setVolume.apply(this, arguments);
    if ((_ref = this.__sound) != null) {
      _ref.volume(volume);
    }
  };

  WebSound.prototype._setLooping = function(looping) {
    var _ref;
    WebSound.__super__._setLooping.apply(this, arguments);
    if ((_ref = this.__sound) != null) {
      _ref.loop(looping);
    }
  };

  WebSound.prototype._play = function(volume, looping) {
    var _ref;
    if (!this.__loaded) {
      cg.warn((_ref = 'Sound: Could not play ' + this.path) != null ? _ref : this.paths + '; not yet loaded.');
      return;
    }
    this.__sound.stop().play();
  };

  WebSound.prototype._pause = function() {
    var _ref;
    if (this.__playing) {
      this.__resumable = true;
    }
    if ((_ref = this.__sound) != null) {
      _ref.pause();
    }
  };

  WebSound.prototype._resume = function() {
    var _ref;
    if (this.__resumable) {
      this.__resumable = false;
      if ((_ref = this.__sound) != null) {
        _ref.play();
      }
    }
  };

  WebSound.prototype._stop = function() {
    var _ref;
    this.__resumable = false;
    if ((_ref = this.__sound) != null) {
      _ref.stop();
    }
  };

  return WebSound;

})(Sound);

module.exports = WebSound;


},{"cg":15,"howler/howler":2,"sound/Sound":60,"util/Promises":73}],26:[function(require,module,exports){
var LocalStorageUserDataManager, UIManager, WebAssetManager, WebInputManager, WebMusic, WebSound,
  __hasProp = {}.hasOwnProperty;

LocalStorageUserDataManager = require('implementations/web/LocalStorageUserDataManager');

WebAssetManager = require('implementations/web/WebAssetManager');

WebInputManager = require('implementations/web/WebInputManager');

WebMusic = require('implementations/web/WebMusic');

WebSound = require('implementations/web/WebSound');

UIManager = require('plugins/ui/UIManager');

module.exports = function(cg) {
  var change, hidden, lastTime, onchange, vendor, vis, _i, _len, _ref;
  if (!((typeof window !== "undefined" && window !== null) && (typeof document !== "undefined" && document !== null))) {
    throw new Error('`window` and/or `document` arent defined; are you in a browser(like) environment?');
  }
  onchange = function(evt) {
    var body;
    if (cg == null) {
      return;
    }
    body = document.body;
    evt = evt || window.event;
    if (evt.type === 'focus' || evt.type === 'focusin') {
      return cg.emit('visibilityChange', true);
    } else if (evt.type === 'blur' || evt.type === 'focusout') {
      return cg.emit('visibilityChange', false);
    } else {
      if (this.hidden) {
        return cg.emit('visibilityChange', false);
      } else {
        return cg.emit('visibilityChange', true);
      }
    }
  };
  hidden = void 0;
  change = void 0;
  vis = {
    hidden: 'visibilitychange',
    mozHidden: 'mozvisibilitychange',
    webkitHidden: 'webkitvisibilitychange',
    msHidden: 'msvisibilitychange',
    oHidden: 'ovisibilitychange'
  };
  for (hidden in vis) {
    if (!__hasProp.call(vis, hidden)) continue;
    if (hidden in document) {
      change = vis[hidden];
      break;
    }
  }
  if (change) {
    document.addEventListener(change, onchange);
  } else if (document.onfocusin !== void 0) {
    document.onfocusin = document.onfocusout = onchange;
  }

  /*
  A polyfill for requestAnimationFrame
  MIT license
  http://paulirish.com/2011/requestanimationframe-for-smart-animating/
  http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
  
  requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel
  
  @method requestAnimationFrame
   */
  _ref = ['ms', 'moz', 'webkit', 'o'];
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    vendor = _ref[_i];
    if (window.requestAnimationFrame) {
      break;
    }
    window.requestAnimationFrame = window[vendor + 'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendor + 'CancelAnimationFrame'] || window[vendor + 'CancelRequestAnimationFrame'];
  }
  if (!window.requestAnimationFrame) {
    lastTime = 0;
    window.requestAnimationFrame = function(callback, element) {
      var currTime, id, timeToCall;
      currTime = new Date().getTime();
      timeToCall = Math.max(0, 16 - (currTime - lastTime));
      id = window.setTimeout(function() {
        return callback(currTime + timeToCall);
      }, timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };
  }

  /*
  A polyfill for cancelAnimationFrame
  
  @method cancelAnimationFrame
   */
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function(id) {
      return clearTimeout(id);
    };
  }
  window.requestAnimFrame = window.requestAnimationFrame;
  cg.AssetManager = WebAssetManager;
  cg.sound.Sound = WebSound;
  cg.sound.Music = WebMusic;
  cg.env = {
    getParameterByName: function(name) {
      var regex, results;
      name = name.replace(/[\[]/, '\\\[').replace(/[\]]/, '\\\]');
      regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
      results = regex.exec(location.search);
      if (results === null) {
        return null;
      } else {
        return decodeURIComponent(results[1].replace(/\+/g, ' '));
      }
    }
  };
  cg.mainLoop = function() {
    cg.Core.prototype.mainLoop.apply(this, arguments);
    return window.requestAnimationFrame.call(null, (function(_this) {
      return function() {
        return _this.mainLoop();
      };
    })(this));
  };
  cg._triggerResize = function() {
    var newView, oldView, _ref1, _ref2;
    oldView = (_ref1 = this.renderer) != null ? _ref1.view : void 0;
    cg.Core.prototype._triggerResize.apply(this, arguments);
    newView = (_ref2 = this.renderer) != null ? _ref2.view : void 0;
    if ((oldView != null) && (oldView !== newView)) {
      this.container.removeChild(oldView);
    }
    if (newView != null) {
      return this.container.appendChild(newView);
    }
  };
  cg.getDeviceWidth = function() {
    return this.container.clientWidth;
  };
  cg.getDeviceHeight = function() {
    return this.container.clientHeight;
  };
  cg.getRendererWidth = function() {
    return this.width * this.scale;
  };
  cg.getRendererHeight = function() {
    return this.height * this.scale;
  };
  cg.getViewportWidth = function() {
    return this.width * this.scale;
  };
  cg.getViewportHeight = function() {
    return this.height * this.scale;
  };
  cg.getViewportOffsetX = function() {
    return 0;
  };
  cg.getViewportOffsetY = function() {
    return 0;
  };
  cg._newRenderer = function(width, height, textureFilter) {
    var antialias;
    antialias = textureFilter === 'linear';
    if (this.forceWebGL) {
      return new cg.gfx.WebGLRenderer(width, height, null, false, false);
    } else if (this.forceCanvas) {
      return new cg.gfx.CanvasRenderer(width, height, null, false, false);
    } else {
      return cg.gfx.autoDetectRenderer(width, height, null, false, false);
    }
  };
  return cg.init = function(props) {
    var container, _ref1;
    container = (_ref1 = props.container) != null ? _ref1 : 'combo-game';
    if (typeof container === 'string') {
      this.container = document.getElementById(container);
    } else {
      this.container = container;
    }
    this.input = new WebInputManager;
    delete props.container;
    cg.Core.prototype.init.apply(this, arguments);
    this.data = new LocalStorageUserDataManager(this.name);
    window.addEventListener('focus', (function(_this) {
      return function() {
        return _this.emit('focus', _this);
      };
    })(this), false);
    window.addEventListener('blur', (function(_this) {
      return function() {
        return _this.emit('blur', _this);
      };
    })(this), false);
    return this.mainLoop();
  };
};


},{"implementations/web/LocalStorageUserDataManager":21,"implementations/web/WebAssetManager":22,"implementations/web/WebInputManager":23,"implementations/web/WebMusic":24,"implementations/web/WebSound":25,"plugins/ui/UIManager":58}],27:[function(require,module,exports){
var Actor, Animation, Group, Module, Scene, SoundManager, Text, TileSheet, Tween, Tweenable, cg, combo, extras, implement, includes, math, menus, text, tile,
  __hasProp = {}.hasOwnProperty;

implement = require('implementations/web/index');

cg = require('cg');

Actor = require('Actor');

Animation = require('Animation');

Group = require('Group');

Module = require('Module');

Scene = require('Scene');

Text = require('Text');

TileSheet = require('TileSheet');

Tween = require('Tween');

Tweenable = require('Tweenable');

SoundManager = require('sound/SoundManager');

extras = require('extras/index');

math = require('math/index');

menus = require('menus/index');

text = require('text/index');

tile = require('tile/index');

includes = {
  Actor: Actor,
  Animation: Animation,
  Group: Group,
  Module: Module,
  Scene: Scene,
  Text: Text,
  TileSheet: TileSheet,
  Tween: Tween,
  Tweenable: Tweenable,
  BaseTexture: cg.gfx.BaseTexture,
  Texture: cg.gfx.Texture,
  RenderTexture: cg.gfx.RenderTexture,
  extras: extras,
  math: math,
  menus: menus,
  text: text,
  tile: tile
};

combo = {
  __initialized: false,
  init: function() {
    var module, moduleName;
    if (combo.__initialized) {
      return;
    }
    combo.__initialized = true;
    if (typeof Function.prototype.bind !== 'function') {
      Function.prototype.bind = (function() {
        var slice;
        slice = Array.prototype.slice;
        return function(thisArg) {
          var F, bound, boundArgs, target;
          bound = function() {
            var args;
            args = boundArgs.concat(slice.call(arguments));
            return target.apply((this instanceof bound ? this : thisArg), args);
          };
          target = this;
          boundArgs = slice.call(arguments, 1);
          if (typeof target !== 'function') {
            throw new TypeError();
          }
          bound.prototype = (F = function(proto) {
            proto && (F.prototype = proto);
            if (!(this instanceof F)) {
              return new F;
            }
          })(target.prototype);
          return bound;
        };
      })();
    }
    for (moduleName in includes) {
      if (!__hasProp.call(includes, moduleName)) continue;
      module = includes[moduleName];
      cg[moduleName] = module;
    }
    cg.plugin(Tweenable);
    cg.sound = new SoundManager;
    implement(cg);
    return cg.log(combo.VERSION_NAME + ' initialized');
  }
};

Object.defineProperty(combo, 'VERSION', {
  get: function() {
    return '0.0.1';
  }
});

Object.defineProperty(combo, 'VERSION_NAME', {
  get: function() {
    return 'Combo ' + combo.VERSION + ': "There Will Be Bugs"';
  }
});

combo.init();

module.exports = combo;


},{"Actor":4,"Animation":5,"Group":8,"Module":9,"Scene":10,"Text":11,"TileSheet":12,"Tween":13,"Tweenable":14,"cg":15,"extras/index":20,"implementations/web/index":26,"math/index":36,"menus/index":41,"sound/SoundManager":61,"text/index":64,"tile/index":68}],28:[function(require,module,exports){
var Axis, HasSignals, Module, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

HasSignals = require('util/HasSignals');

Axis = (function(_super) {
  __extends(Axis, _super);

  function Axis() {
    return Axis.__super__.constructor.apply(this, arguments);
  }

  Axis.mixin(HasSignals);

  Object.defineProperty(Axis.prototype, 'value', {
    get: function() {
      return this.__value;
    },
    set: function(val) {
      var delta;
      val = cg.math.clamp(val, -1, 1);
      delta = val - this.__value;
      if (delta !== 0) {
        this.__value = val;
        return this.emit('change', val, delta);
      }
    }
  });

  return Axis;

})(Module);

module.exports = Axis;


},{"Module":9,"cg":15,"util/HasSignals":72}],29:[function(require,module,exports){
var Axis, ControlMap, HasSignals, InputManager, Module, MultiTrigger, Touch, Trigger, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
  __slice = [].slice;

cg = require('cg');

Module = require('Module');

Touch = require('input/Touch');

Trigger = require('input/Trigger');

Axis = require('input/Axis');

MultiTrigger = require('input/MultiTrigger');

HasSignals = require('util/HasSignals');

InputManager = require('input/InputManager');


/**
A mapping of (keyboard keys)[TODOC] to action names; meant to decouple input configurations from game logic.

@class cg.input.ControlMap
@uses cg.util.HasSignals
@constructor
@param [namespace] {String}
Set the value of [`namespace`](#property_namespace).

If specified, these controls will be accessible as `cg.input.controls[namespace]`.
Otherwise, a random UUID will be assigned to [`namespace`](#property_namespace).

@param [map] {Object} Key-value set of control data.

Key names represent the name of the action.
The values are either a string or `Array` of strings representing [keyboard keys](TODOC).

See also: [`actions`](#property_actions)

@example
    var shipControls = new cg.input.ControlMap({
      shoot: 'space',
      thrust: ['up', 'w'],
      brake: ['down', 's'],
      turnLeft: ['left', 'a'],
      turnRight: ['right', 'd']
    });

@example
    var shipControls = new cg.input.ControlMap('ship', {
      shoot: 'space',
      thrust: ['up', 'w'],
      brake: ['down', 's'],
      turnLeft: ['left', 'a'],
      turnRight: ['right', 'd']
    });

    assert(cg.input.controls.ship == shipControls); // true

@example
    // load control mappings from user data: (see `UserDataManager`)
    var myControls = new cg.input.ControlMap(cg.data.getSync('controls'));
 */

ControlMap = (function(_super) {
  __extends(ControlMap, _super);

  ControlMap.mixin(HasSignals);

  function ControlMap(namespace, map) {
    var k, keys, name, _i, _len;
    if (typeof namespace !== 'string') {
      map = namespace;
      namespace = cg.rand.uuid();
    }
    this.paused = false;

    /**
    A unique identifier for this ControlMap.
    
    This is used by [`cg.input`](cg.input.html) to 
    
    @property namespace
    @type String
    @default A random UUID.
     */
    Object.defineProperty(this, 'namespace', {
      value: namespace
    });
    cg.input.map(this.namespace, this);
    this.actions = {};
    this.axes = {};
    this._triggersByKeycode = {};
    this.listeners = [this];
    if (map != null) {
      for (name in map) {
        if (!__hasProp.call(map, name)) continue;
        keys = map[name];
        if (!cg.util.isArray(keys)) {
          keys = [keys];
        }
        for (_i = 0, _len = keys.length; _i < _len; _i++) {
          k = keys[_i];
          if ((typeof k === 'string') && __indexOf.call(k, '/') >= 0) {
            this.mapAxisKeys.apply(this, [name].concat(__slice.call(k.split('/'))));
          } else {
            this.mapKey(name, k);
          }
        }
      }
    }
  }


  /**
  `true` if action events are being suppressed, `false` otherwise.
  
  @property paused {Boolean}
   */

  Object.defineProperty(ControlMap.prototype, 'paused', {
    get: function() {
      return this.__paused;
    },
    set: function(value) {
      if (this.__paused !== value) {
        this.__paused = value;
        if (this.__paused) {
          return this._releaseAll();
        }
      }
    }
  });


  /**
  Suppress action events from being emitted from this `ControlMap`.
  
  See also:
  
    * [`paused`](#property_paused)
  
  @method pause
   */

  ControlMap.prototype.pause = function() {
    this.paused = true;
  };


  /**
  Allow action events to be emitted from this `ControlMap`.
  
  See also:
  
    * [`paused`](#property_paused)
  
  @method pause
   */

  ControlMap.prototype.resume = function() {
    this.paused = false;
  };


  /**
  Register an object that `HasSignals` to capture events emitted from this `ControlMap`.
  
  All of the following event types will be forwarded:
  
    * [`<action>:hit`](#event_<action>:hit)
    * [`<action>`](#event_<action>)
    * [`<action>:release`](#event_<action>:release)
    * [`!<action>`](#event_!<action>)
  
  **NOTE**: This method is called automatically when modifying the [`Actor::controls`](cg.Actor.html#property_controls) property.
  
  @method addListener
  @param listener {HasSignals}
  The object you wish to forward all action events from this `ControlMap` to.
  
  Typically an `Actor`, but anything that uses `HasSignals` will work.
  
  @example
      var controls = new cg.input.ControlMap({shoot: 'space'});
  
      controls.addListener(spaceShip);
  
      // Now, all `shoot` events will be forwarded to `spaceShip` whenever
      //  the space bar is hit, allowing it to handle them directly without
      //  referring to this `ControlMap`:
      spaceShip.on('shoot', function () {
        this.shootBullet();
      });
   */

  ControlMap.prototype.addListener = function(listener) {
    var idx;
    idx = this.listeners.indexOf(listener);
    if (idx >= 0) {
      cg.warn("ControlMap: Listener (" + listener + ") was already in our list of listeners; not adding it.");
      return;
    }
    return this.listeners.push(listener);
  };


  /**
  Un-register an object that `HasSignals` from capturing events emitted from this `ControlMap`.
  
  **NOTE**: This method is called automatically when modifying the [`Actor::controls`](cg.Actor.html#property_controls) property.
  
  @method removeListener
  @param listener {HasSignals}
  The object you wish to *stop* forwarding all action events from this `ControlMap` to.
  
  Typically an `Actor`, but anything that uses `HasSignals` will work.
   */

  ControlMap.prototype.removeListener = function(listener) {
    var idx;
    idx = this.listeners.indexOf(listener);
    if (idx < 0) {
      cg.warn("ControlMap: Listener (" + listener + ") was not in our list of listeners.");
      return;
    }
    return this.listeners.splice(idx, 1);
  };


  /**
  Associate a named action with a generic `Trigger`.
  
  Multiple calls to `map` with the same `name` parameter will
  not overwrite previously-mapped triggers; multiple triggers can
  be associated with a single action.
  
  @method map
  @param name {String} The name of the action event.
  @param trigger {Trigger} The trigger whose `hit` and `release` events correspond with the named action.
   */

  ControlMap.prototype.map = function(name, trigger) {
    var _base;
    if ((_base = this.actions)[name] == null) {
      _base[name] = new MultiTrigger;
    }
    return this.actions[name].addTrigger(trigger);
  };


  /**
  Stop associating a named action with a specific `Trigger`, or all of its associated triggers.
  
  @method unmap
  @param name {String} The name of the action event.
  @param [trigger] {Trigger}
  
  @example
      // Completely disable the "shoot" action:
      controlMap.unmap('shoot');
  
  @example
      // Remove a specific trigger from the "shoot" action's list of triggers:
      controlMap.unmap('shoot', someTrigger);
   */

  ControlMap.prototype.unmap = function(name, trigger) {
    var action;
    action = this.actions[name];
    if (action == null) {
      cg.warn('ControlMap.unmap: No action named "' + name('"; aborting.'));
      return;
    }
    if (trigger != null) {
      return action.removeTrigger(trigger);
    } else {
      return delete this.actions[name];
    }
  };


  /**
  Associate a named action with a (keyboard key)[TODOC] or set of [keyboard keys](TODOC).
  
  Multiple calls to `mapKey` with the same `name` parameter will
  not overwrite previously-mapped keys; multiple keys can
  be associated with a single action.
  
  A single key may also be mapped to multiple actions.
  
  @method map
  @param name {String} The name of the action event.
  @param keyCodeNames {String|Array} The key name(s) to associate with the given action name.
  @return {cg.input.Trigger} the new trigger associated with the given key name(s)
  @example
      this.mapKey('shoot', 'space');
  
  @example
      this.mapKey('thruster', ['up', 'w']);
   */

  ControlMap.prototype.mapKey = function(name, keyCodeNames) {
    var keyCode, keyCodeName, keyCodeSet, trigger, _base, _i, _j, _len, _len1;
    if (!cg.util.isArray(keyCodeNames)) {
      keyCodeNames = [keyCodeNames];
    }
    trigger = new Trigger;
    trigger.name = name;
    this.map(name, trigger);
    for (_i = 0, _len = keyCodeNames.length; _i < _len; _i++) {
      keyCodeName = keyCodeNames[_i];
      keyCodeSet = cg.__keys[keyCodeName];
      if (!keyCodeSet) {
        cg.warn("ControlMap::mapKey: Unknown key name: '" + keyCodeName + "'; ignoring.");
        continue;
      }
      if (!cg.util.isArray(keyCodeSet)) {
        keyCodeSet = [keyCodeSet];
      }
      for (_j = 0, _len1 = keyCodeSet.length; _j < _len1; _j++) {
        keyCode = keyCodeSet[_j];
        if ((_base = this._triggersByKeycode)[keyCode] == null) {
          _base[keyCode] = [];
        }
        this._triggersByKeycode[keyCode].push(trigger);
      }
    }
    return trigger;
  };


  /**
  Stop associating a (keyboard key)[TODOC] or set of [keyboard keys](TODOC) with a named action.
  
  @method unmapKey
  @param name
  @param keyCodeNames {String|Array} The key name(s) to associate with the given action name.
  @example
      this.unmapKey('shoot', 'space');
  
  @example
      this.unmapKey('thruster', ['up', 'w']);
   */

  ControlMap.prototype.unmapKey = function(name, keyCodeNames) {
    var idx, keyCode, keyCodeName, keyCodeSet, trigger, triggers, _i, _j, _k, _len, _len1;
    if (!cg.util.isArray(keyCodeNames)) {
      keyCodeNames = [keyCodeNames];
    }
    for (_i = 0, _len = keyCodeNames.length; _i < _len; _i++) {
      keyCodeName = keyCodeNames[_i];
      keyCodeSet = cg.__keys[keyCodeName];
      if (!keyCodeSet) {
        cg.warn("ControlMap::unmapKey: Unknown key name: '" + keyCodeName + "'; ignoring.");
        continue;
      }
      if (!cg.util.isArray(keyCodeSet)) {
        keyCodeSet = [keyCodeSet];
      }
      for (_j = 0, _len1 = keyCodeSet.length; _j < _len1; _j++) {
        keyCode = keyCodeSet[_j];
        triggers = this._triggersByKeycode[keyCode];
        if (triggers == null) {
          continue;
        }
        for (idx = _k = triggers.length - 1; _k >= 0; idx = _k += -1) {
          trigger = triggers[idx];
          if (trigger.name === name) {
            triggers.splice(idx, 1);
          }
        }
      }
    }
  };


  /**
  TODOC
  
  @method mapAxisKeys
  @param name {String} the name of the axis to create (or to associate more keys with if it already exists)
  @param low {String} the key associated with the negative direction of the axis
  @param high {String} the key associated with the positive direction of the axis
  @return {cg.input.Axis} the axis associated with the given name
   */

  ControlMap.prototype.mapAxisKeys = function(name, low, high) {
    var axis, highTrigger, lowTrigger;
    if (this.axes[name]) {
      axis = this.axes[name];
    } else {
      axis = this.axes[name] = new Axis;
      axis.name = name;
      this.on(axis, 'change', function(val, delta) {
        var l, _i, _len, _ref, _results;
        _ref = this.listeners;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          l = _ref[_i];
          _results.push(l.emit(axis.name, val, delta));
        }
        return _results;
      });
    }
    lowTrigger = this.mapKey('axis:' + name + ':low', low);
    highTrigger = this.mapKey('axis:' + name + ':high', high);
    lowTrigger.on('hit', function() {
      return axis.value = -1;
    });
    lowTrigger.on('release', function() {
      return axis.value = highTrigger.held() ? 1 : 0;
    });
    highTrigger.on('hit', function() {
      return axis.value = 1;
    });
    highTrigger.on('release', function() {
      return axis.value = lowTrigger.held() ? -1 : 0;
    });
    return axis;
  };

  ControlMap.prototype.unmapAxisKeys = function(name, low, high) {
    var highTriggerName, lowTriggerName;
    lowTriggerName = 'axis:' + name + ':low';
    highTriggerName = 'axis:' + name + ':high';
    this.unmapKey(lowTriggerName, low);
    this.unmapKey(highTriggerName, high);
    if ((this._triggersByKeycode[lowTriggerName] != null) || (this._triggersByKeycode[highTriggerName] != null)) {
      return;
    }
    return delete this.axes[name];
  };

  ControlMap.prototype._releaseAll = function() {
    var keyName, name, trigger, triggers, _ref, _ref1, _results;
    _ref = this.actions;
    for (name in _ref) {
      trigger = _ref[name];
      trigger.release();
    }
    _ref1 = this.keys;
    _results = [];
    for (keyName in _ref1) {
      triggers = _ref1[keyName];
      _results.push((function() {
        var _i, _len, _results1;
        _results1 = [];
        for (_i = 0, _len = triggers.length; _i < _len; _i++) {
          trigger = triggers[_i];
          _results1.push(trigger.release());
        }
        return _results1;
      })());
    }
    return _results;
  };


  /**
  Emitted whenever a trigger or key associated with <action> emits a [`hit`](Trigger#event_hit) event.
  See also: [`<action>`](#event_<action>)
  
  @event <action>:hit
  
  @example
      var controls = new cg.input.ControlMap({shoot: 'space'});
      
      controls.on('shoot:hit', function () {
        cg.log('Shooting!');
      });
   */


  /**
  Shorthand event synonymous with [`<action>:hit`](#event_<action>:hit).
  
  @event <action>
  
  @example
      var controls = new cg.input.ControlMap({shoot: 'space'});
      
      controls.on('shoot', function () {
        cg.log('Shooting!');
      });
   */

  ControlMap.prototype._triggerKeyDown = function(keyCode) {
    var l, t, triggers, _i, _j, _len, _len1, _ref;
    if (this.paused) {
      return;
    }
    triggers = this._triggersByKeycode[keyCode];
    if (!triggers) {
      return false;
    }
    for (_i = 0, _len = triggers.length; _i < _len; _i++) {
      t = triggers[_i];
      if (t.trigger()) {
        _ref = this.listeners;
        for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
          l = _ref[_j];
          l.emit("" + t.name + ":hit");
          l.emit(t.name);
        }
      }
    }
    return true;
  };


  /**
  Emitted whenever a trigger or key associated with <action> emits a [`release`](Trigger#event_release) event.
  
  See also:
  
    * [`!<action>`](#event_!<action>)
  
  @event <action>:release
  
  @example
      var controls = new cg.input.ControlMap({shoot: 'space'});
      
      controls.on('shoot:release', function () {
        cg.log('No longer shooting!');
      });
   */


  /**
  Shorthand event synonymous with [`<action>:release`](#event_<action>:release).
  
  @event !<action>
  
  @example
      var controls = new cg.input.ControlMap({shoot: 'space'});
      
      controls.on('!shoot', function () {
        cg.log('No longer shooting!');
      });
   */

  ControlMap.prototype._triggerKeyUp = function(keyCode) {
    var l, t, triggers, _i, _j, _len, _len1, _ref;
    if (this.paused) {
      return;
    }
    triggers = this._triggersByKeycode[keyCode];
    if (!triggers) {
      return false;
    }
    for (_i = 0, _len = triggers.length; _i < _len; _i++) {
      t = triggers[_i];
      if (t.release()) {
        _ref = this.listeners;
        for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
          l = _ref[_j];
          l.emit("" + t.name + ":release");
          l.emit("!" + t.name);
        }
      }
    }
    return true;
  };

  return ControlMap;

})(Module);

module.exports = ControlMap;


},{"Module":9,"cg":15,"input/Axis":28,"input/InputManager":30,"input/MultiTrigger":31,"input/Touch":32,"input/Trigger":33,"util/HasSignals":72}],30:[function(require,module,exports){
var Axis, ControlMap, HasSignals, InputManager, Module, MultiTrigger, Touch, Trigger, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

HasSignals = require('util/HasSignals');

Axis = require('input/Axis');

ControlMap = require('input/ControlMap');

Touch = require('input/Touch');

MultiTrigger = require('input/MultiTrigger');

Trigger = require('input/Trigger');


/**
The dispatcher/tracker of input events.

@class cg.input.InputManager
@extends cg.Module
@uses cg.util.HasSignals
 */

InputManager = (function(_super) {
  __extends(InputManager, _super);

  InputManager.mixin(HasSignals);


  /*
  A reference to the [`Axis`](cg.input.Axis.html) class.
  @property Axis
   */

  InputManager.prototype.Axis = Axis;


  /*
  A reference to the [`ControlMap`](cg.input.ControlMap.html) class.
  @property ControlMap
   */

  InputManager.prototype.ControlMap = ControlMap;


  /*
  A reference to the [`Touch`](cg.input.Touch.html) class.
  @property Touch
   */

  InputManager.prototype.Touch = Touch;


  /*
  A reference to the [`InputManager`](cg.input.InputManager.html) class.
  @property InputManager
   */

  InputManager.prototype.InputManager = InputManager;


  /*
  A reference to the [`MultiTrigger`](cg.input.MultiTrigger.html) class.
  @property MultiTrigger
   */

  InputManager.prototype.MultiTrigger = MultiTrigger;


  /*
  A reference to the [`Trigger`](cg.input.Trigger.html) class.
  @property Trigger
   */

  InputManager.prototype.Trigger = Trigger;

  InputManager._generateKeyNameMap = function() {
    var code, codes, name, _ref, _results;
    cg.__keyNames = {};
    _ref = cg.__keys;
    _results = [];
    for (name in _ref) {
      if (!__hasProp.call(_ref, name)) continue;
      codes = _ref[name];
      if (!cg.util.isArray(codes)) {
        codes = [codes];
      }
      _results.push((function() {
        var _base, _i, _len, _results1;
        _results1 = [];
        for (_i = 0, _len = codes.length; _i < _len; _i++) {
          code = codes[_i];
          if ((_base = cg.__keyNames)[code] == null) {
            _base[code] = [];
          }
          _results1.push(cg.__keyNames[code].push(name));
        }
        return _results1;
      })());
    }
    return _results;
  };

  function InputManager() {
    var i, name, _ref;
    this.mouse = new Touch;
    this.touches = (function() {
      var _i, _results;
      _results = [];
      for (i = _i = 0; _i <= 10; i = ++_i) {
        _results.push(new Touch(i));
      }
      return _results;
    })();
    this.touch = this.touches[0];
    this.lmb = new Touch;
    this.mmb = new Touch;
    this.rmb = new Touch;
    this.any = new Trigger;
    this.key = {};
    _ref = cg.__keys;
    for (name in _ref) {
      if (!__hasProp.call(_ref, name)) continue;
      this.key[name] = new Trigger;
    }
    this.controls = {};
  }


  /**
  Register a control map to a specified name; this is required for the `ControlMap` to become active, since
  the `InputManager` is what forwards raw input events to the map.
  
  @method map
  @protected
  @param namespace {String} A unique identifier for the control map to add.
  @param map {Object|cg.input.ControlMap} The control map object to add.
  @return {cg.input.ControlMap} The map that was added.
   */

  InputManager.prototype.map = function(namespace, map) {
    if (!(map instanceof ControlMap)) {
      map = new ControlMap(map);
    }
    if (this.controls[namespace] != null) {
      throw new Error("InputManager: A ControlMap with namespace \"" + map.namespace + "\" already exists; remove it with _removeControlMap before replacing it.");
    }
    this.controls[namespace] = map;
    return map;
  };


  /**
  Un-register a `ControlMap` by name or value.
  
  @method _removeControlMap
  @param map {String|cg.input.ControlMap}
  
  @example
      // Remove an existing ControlMap by its object value:
      cg.input._removeControlMap(shipControls); // shipControls is an existing ControlMap object.
  
  @example
      // Remove a ControlMap by its namespace:
      cg.input._removeControlMap('ship'); // `cg.input.controls.ship` is now `undefined`
   */

  InputManager.prototype._removeControlMap = function(map) {
    var namespace, toDelete, _i, _len, _map, _ref;
    if (typeof map === 'string') {
      toDelete = [map];
    } else {
      toDelete = [];
      _ref = this.controls;
      for (namespace in _ref) {
        if (!__hasProp.call(_ref, namespace)) continue;
        _map = _ref[namespace];
        if (_map === map) {
          toDelete.add(namespace);
        }
      }
    }
    for (_i = 0, _len = toDelete.length; _i < _len; _i++) {
      namespace = toDelete[_i];
      delete this.controls[namespace];
    }
  };


  /**
  Emitted whenever a key's state goes from not-pressed, to pressed.
  
  @event keyDown
  @param keyName {String}
  @example
      cg.input.on('keyDown', function (keyName) {
        if (keyName == 'space') {
          cg.log('Space bar was hit!');
        }
      });
   */


  /**
  Emitted whenever a key's state goes from not-pressed, to pressed.
  
  @event keyDown:<keyName>
  @example
      cg.input.on('keyDown:space', function () {
        cg.log('Space bar was hit!');
      });
   */


  /**
  Emitted whenever a key is pressed, a mouse button is clicked, or a touch event begins.
  
  @event any
  @example
      cg.input.on('any', function () {
        splashScreen.hide();
      });
   */

  InputManager.prototype._triggerKeyDown = function(keyCode) {
    var keyNames, map, name, ns, _i, _len, _ref, _results;
    keyNames = cg.__keyNames[keyCode];
    if (keyNames != null) {
      for (_i = 0, _len = keyNames.length; _i < _len; _i++) {
        name = keyNames[_i];
        if (this.key[name].trigger()) {
          this.emit('keyDown', name);
          this.emit('keyDown:' + name);
        }
      }
    }
    this.any.trigger();
    this.emit('any');
    this.emit('anyDown');
    _ref = this.controls;
    _results = [];
    for (ns in _ref) {
      if (!__hasProp.call(_ref, ns)) continue;
      map = _ref[ns];
      _results.push(map._triggerKeyDown(keyCode));
    }
    return _results;
  };


  /**
  Emitted whenever a key's state goes from pressed, to not-pressed.
  
  @event keyUp
  @param keyName {String}
  @example
      cg.input.on('keyUp', function (keyName) {
        if (keyName == 'space') {
          cg.log('Space bar was released!');
        }
      });
   */


  /**
  Emitted whenever a key's state goes from pressed, to not-pressed.
  
  @event keyUp:<keyName>
  @example
      cg.input.on('keyUp:space', function () {
        cg.log('Space bar was released!');
      });
   */

  InputManager.prototype._triggerKeyUp = function(keyCode) {
    var keyNames, map, name, ns, _i, _len, _ref, _results;
    keyNames = cg.__keyNames[keyCode];
    if (keyNames != null) {
      for (_i = 0, _len = keyNames.length; _i < _len; _i++) {
        name = keyNames[_i];
        if (this.key[name].release()) {
          this.emit('keyUp', name);
          this.emit('keyUp:' + name);
        }
      }
    }
    this.any.release();
    this.emit('anyUp');
    this.emit('!any');
    _ref = this.controls;
    _results = [];
    for (ns in _ref) {
      if (!__hasProp.call(_ref, ns)) continue;
      map = _ref[ns];
      _results.push(map._triggerKeyUp(keyCode));
    }
    return _results;
  };

  InputManager.prototype._triggerKeyPress = function(charCode) {
    return this.emit('keyPress', charCode);
  };


  /**
  Emitted whenever a new indicator appears on the touch surface, or mouse button gets pressed.
  
  @event touchDown
  @param gesturer {Touch} The touch or mouse gesturer.
  @example
      cg.input.on('touchDown', function (gesturer) {
        cg.log('touchDown at (' + gesturer.x + ', ' + gesturer.y + ')!');
      });
   */

  InputManager.prototype._triggerTouchDown = function(screenX, screenY, num) {
    var t, x, y, _ref;
    _ref = this._transformDeviceCoordinates(screenX, screenY), x = _ref[0], y = _ref[1];
    t = this.touches[num];
    t.moveTo(x, y);
    t.trigger();
    if (num === 0) {
      this.touch.moveTo(x, y);
      this.touch.trigger();
    }
    this.any.trigger();
    this.emit('any');
    this.emit('anyDown');
    return this.emit('touchDown', t);
  };


  /**
  Emitted whenever an indicator is dragged on the touch surface, or the mouse moves with any buttons held.
  
  @event touchDrag
  @param gesturer {Touch} The touch or mouse gesturer.
  @example
      cg.input.on('touchDrag', function (gesturer) {
        cg.log('touchDrag motion: (' + gesturer.dx + ', ' + gesturer.dy + ')!');
      });
   */

  InputManager.prototype._triggerTouchDrag = function(screenX, screenY, num) {
    var t, x, y, _ref;
    _ref = this._transformDeviceCoordinates(screenX, screenY), x = _ref[0], y = _ref[1];
    t = this.touches[num];
    t.moveTo(x, y);
    if (num === 0) {
      this.touch.moveTo(x, y);
    }
    return this.emit('touchDrag', t);
  };


  /**
  Emitted whenever an indicator is removed from the touch surface, or mouse button gets released.
  
  @event touchUp
  @param gesturer {Touch} The touch or mouse gesturer.
  @example
      cg.input.on('touchUp', function (gesturer) {
        cg.log('touchUp at (' + gesturer.x + ', ' + gesturer.y + ')!');
      });
   */

  InputManager.prototype._triggerTouchUp = function(screenX, screenY, num) {
    var t;
    t = this.touches[num];
    t.x = t.y = void 0;
    t.release();
    if (num === 0) {
      this.touch.x = this.touch.y = void 0;
      this.touch.release();
    }
    this.emit('touchUp', t);
    this.any.release();
    this.emit('anyUp');
    return this.emit('!any');
  };


  /**
  Emitted whenever a mouse button is pressed.
  
  **NOTE**: A [`touchDown`](#event_touchDown) event will *also* be emitted with the generic gesturer `cg.input.touch` when the
  left mouse button (but not for right or middle) is pressed.
  
  @event mouseDown
  @param which {Number} an integer representing which mouse button was pressed.
  One of the following:
  
    * 1: Left Mouse Button
    * 2: Middle Mouse Button
    * 3: Right Mouse Button
   */

  InputManager.prototype._triggerMouseDown = function(which) {
    switch (which) {
      case 1:
        this.mouse.trigger();
        this.lmb.trigger();
        this.touch.trigger();
        this.emit('touchDown', this.touch);
        break;
      case 2:
        this.mmb.trigger();
        break;
      case 3:
        this.rmb.trigger();
        break;
      default:
        cg.warn("InputManager: Unexpected mouse button number: " + which + "; ignoring.");
        return;
    }
    this.any.trigger();
    this.emit('any');
    this.emit('anyDown');
    return this.emit('mouseDown', which);
  };


  /**
  Emitted whenever a mouse moves.
  
  **NOTE**: A [`touchDrag`](#event_touchDown) event will *also* be emitted with the generic gesturer `cg.input.touch` when the
  left mouse button (but not for right or middle) is held.
  
  @event mouseDown
  @param {Touch} a reference to a gesturer representing the mouse that moved
   */

  InputManager.prototype._triggerMouseMove = function(screenX, screenY) {
    var mapping, x, y, _i, _len, _ref, _ref1;
    _ref = this._transformDeviceCoordinates(screenX, screenY), x = _ref[0], y = _ref[1];
    _ref1 = [this.touch, this.lmb, this.mmb, this.rmb];
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      mapping = _ref1[_i];
      mapping.moveTo(x, y);
    }
    if (this.touch.held()) {
      this.emit('touchDrag', this.touch);
    }
    this.mouse.moveTo(x, y);
    this.emit('mouseMove', this.mouse);
  };


  /**
  Emitted whenever a mouse button is released.
  
  **NOTE**: A [`touchUp`](#event_touchUp) event will *also* be emitted with the generic gesturer `cg.input.touch` when the
  left mouse button (but not for right or middle) is released.
  
  @event mouseDown
  @param which {Number} an integer representing which mouse button was released.
  One of the following:
  
    * 1: Left Mouse Button
    * 2: Middle Mouse Button
    * 3: Right Mouse Button
   */

  InputManager.prototype._triggerMouseUp = function(which) {
    this.any.release();
    switch (which) {
      case 1:
        this.mouse.release();
        this.lmb.release();
        this.touch.release();
        this.emit('touchUp', this.touch);
        break;
      case 2:
        this.mmb.release();
        break;
      case 3:
        this.rmb.release();
    }
    this.emit('mouseUp', which);
    this.any.release();
    this.emit('anyUp');
    return this.emit('!any');
  };

  return InputManager;

})(Module);

module.exports = InputManager;


},{"Module":9,"cg":15,"input/Axis":28,"input/ControlMap":29,"input/MultiTrigger":31,"input/Touch":32,"input/Trigger":33,"util/HasSignals":72}],31:[function(require,module,exports){
var MultiTrigger, Trigger,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Trigger = require('input/Trigger');


/**
A special trigger that can be triggered by any number of other triggers.

(Yo dawg...)

@class cg.input.MultiTrigger
@extends cg.input.Trigger
 */

MultiTrigger = (function(_super) {
  __extends(MultiTrigger, _super);

  function MultiTrigger() {
    this.triggers = [];
    MultiTrigger.__super__.constructor.apply(this, arguments);
  }


  /**
  Add a trigger to the list of triggers that cause this to trigger.
  
  @method addTrigger
  @param trigger {Trigger}
   */

  MultiTrigger.prototype.addTrigger = function(trigger) {
    var _release, _trigger;
    _trigger = trigger.trigger;
    trigger.trigger = (function(_this) {
      return function() {
        _trigger.call(trigger);
        return _this.trigger();
      };
    })(this);
    _release = trigger.release;
    trigger.release = (function(_this) {
      return function() {
        _release.call(trigger);
        return _this.release();
      };
    })(this);
    return this.triggers.push(trigger);
  };


  /**
  Remove a trigger from the list of triggers that cause this to trigger.
  
  @method removeTrigger
  @param trigger {Trigger}
   */

  MultiTrigger.prototype.removeTrigger = function(trigger) {
    var idx;
    idx = this.triggers.indexOf(trigger);
    if (idx < 0) {
      cg.warn('MultiTrigger::removeTrigger: trigger to remove was not found in my list of triggers; aborting.');
      return;
    }
    return this.triggers.splice(idx, 1);
  };

  return MultiTrigger;

})(Trigger);

module.exports = MultiTrigger;


},{"input/Trigger":33}],32:[function(require,module,exports){

/*
combo.js - Copyright 2012-2013 Louis Acresti - All Rights Reserved
 */
var Touch, Trigger, Vector2,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Trigger = require('input/Trigger');

Vector2 = require('math/Vector2');


/**
A trigger with some extra properties; useful for representing things like fingers on touch screens, and mouse cursors.

@class cg.input.Touch
@extends cg.input.Trigger
@constructor
@param [number=-1] {Number}
A unique index (often representing a finger #) for this gesturer.
 */

Touch = (function(_super) {
  __extends(Touch, _super);

  Touch.mixin(Vector2.prototype);

  function Touch(number) {
    this.number = number != null ? number : -1;
    Touch.__super__.constructor.apply(this, arguments);

    /**
    The x-coordinate in virtual screen space of this gesturer's current location.
    
    **NOTE**: This value will be `undefined` if the touch indicator associated with this is not actively touching
    the touch surface. (This does not apply to gesturers that refer to mouse buttons.)
    @property x
    @type Number
     */
    this.x = NaN;

    /**
    The y-coordinate in virtual screen space of this gesturer's current location.
    
    **NOTE**: This value will be `undefined` if the touch indicator associated with this is not actively touching
    the touch surface. (This does not apply to gesturers that refer to mouse buttons.)
    @property y
    @type Number
     */
    this.y = NaN;
  }

  Touch.prototype.moveTo = function(x, y) {
    var oldX, oldY;
    oldX = this.x;
    oldY = this.y;
    this.x = x;
    this.y = y;

    /**
    The x-component of the distance this gesturer traveled in the last motion event caused by [`moveTo`](#method_moveTo).
    @property dx
    @type Number
     */
    this.dx = this.x - oldX;

    /**
    The y-component of the distance this gesturer traveled in the last motion event caused by [`moveTo`](#method_moveTo).
    @property dy
    @type Number
     */
    this.dy = this.y - oldY;

    /**
    Emitted whenever this gesturer moves.
    
    @event move
    @param gesturer
    A reference to this gesturer.
     */
    this.emit('move', this);
    if (this.held()) {

      /**
      Emitted whenever this gesturer moves while it is [`held()`](cg.input.Trigger.html#method_held).
      
      @event drag
      @param gesturer
      A reference to this gesturer.
       */
      return this.emit('drag', this);
    }
  };

  return Touch;

})(Trigger);

module.exports = Touch;


},{"input/Trigger":33,"math/Vector2":35}],33:[function(require,module,exports){
var HasSignals, Module, Trigger, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

HasSignals = require('util/HasSignals');


/**
A generic representation of something that can be "on" or "off", "pressed" or "released", etc.

@class cg.input.Trigger
@extends cg.Module
@uses cg.util.HasSignals
 */

Trigger = (function(_super) {
  __extends(Trigger, _super);

  Trigger.mixin(HasSignals);

  function Trigger() {
    this.lastPressedTime = -2;
    this.lastReleasedTime = -1;
  }


  /**
  Cause this trigger to be ... triggered.
  
  In other words, change its status to "on" or "pressed".
  
  @method trigger
  @return {Boolean} `true` if the trigger's status changed.
   */

  Trigger.prototype.trigger = function() {
    if (this.held()) {
      return false;
    }
    this.lastPressedTime = cg.currentTime;

    /**
    Emitted immediately when this trigger is [`triggered`](#method_trigger).
    
    @event hit
    @param trigger {Trigger} a reference to this `Trigger`
     */
    this.emit('hit', this);
    return true;
  };


  /**
  Cause this trigger to be released.
  
  In other words, change its status to "off" or "released".
  
  @method release
  @return {Boolean} `true` if the trigger's status changed.
   */

  Trigger.prototype.release = function() {
    if (!this.held()) {
      return false;
    }
    this.lastReleasedTime = cg.currentTime;
    this.emit('release', this);
    return true;
  };


  /**
  Poll whether this trigger was _just_ triggered.
  
  @method hit
  @return {Boolean} `true` if triggered this update-cycle.
   */

  Trigger.prototype.hit = function() {
    return (this.lastPressedTime >= 0) && (cg.currentTime - this.lastPressedTime === 0);
  };


  /**
  Poll whether this trigger is currently held-down.
  
  @method held
  @return {Boolean} `true` if held-down this update-cycle
   */

  Trigger.prototype.held = function() {
    return this.lastPressedTime > this.lastReleasedTime;
  };


  /**
  Poll whether this trigger if this trigger was _just_ released.
  
  @method released
  @return {Boolean} `true` if released this update-cycle
   */

  Trigger.prototype.released = function() {
    return this.lastReleasedTime >= 0 && (cg.currentTime - this.lastReleasedTime === 0);
  };


  /**
  Poll how long this trigger has been held down for.
  
  @method heldTime
  @return {Number(milliseconds)} the amount of time this trigger has been held down for
   */

  Trigger.prototype.heldTime = function() {
    if (!this.held()) {
      return 0;
    }
    return cg.currentTime - this.lastPressedTime;
  };

  return Trigger;

})(Module);

module.exports = Trigger;


},{"Module":9,"cg":15,"util/HasSignals":72}],34:[function(require,module,exports){
var Module, Random, hash, rnd,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __slice = [].slice;

Module = require('Module');

hash = function(data) {
  var h, i, n;
  h = void 0;
  i = void 0;
  n = void 0;
  n = 0xefc8249d;
  data = data.toString();
  i = 0;
  while (i < data.length) {
    n += data.charCodeAt(i);
    h = 0.02519603282416938 * n;
    n = h >>> 0;
    h -= n;
    h *= n;
    n = h >>> 0;
    h -= n;
    n += h * 0x100000000;
    i++;
  }
  return (n >>> 0) * 2.3283064365386963e-10;
};

rnd = function() {
  var t;
  t = 2091639 * this.s0 + this.c * 2.3283064365386963e-10;
  this.c = t | 0;
  this.s0 = this.s1;
  this.s1 = this.s2;
  this.s2 = t - this.c;
  return this.s2;
};


/**
A [pseudo-random number generator](http://en.wikipedia.org/wiki/Pseudorandom_number_generator) with convenient utility methods.

All `Random` instances are actually bound `Function` objects with instance methods attached to it (not unlike the `jQuery` object).

A global instance is always available as `cg.rand`.

**NOTE**: You must use [`cg.math.Random.create`](#method_create); `new Random` will not work.

@class cg.math.Random
 */

Random = (function(_super) {
  __extends(Random, _super);


  /**
  Create a new random number generator.
  
  @static
  @method create
  @param [...] arguments will be passed to an invocation of [`sow(...)`](#method_sow).
   */

  Random.create = function() {
    var k, rand, ret, v, _ref;
    rand = (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Random, arguments, function(){});
    ret = function() {
      var args;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      switch (args.length) {
        case 0:
          return rand.fract32();
        case 1:
          if (cg.util.isArray(args[0])) {
            return rand.pick(args[0]);
          }
          if (typeof args[0] === 'number') {
            return rand.range(0, args[0]);
          }
          break;
        default:
          return rand.range(args[0], args[1]);
      }
    };
    _ref = Random.prototype;
    for (k in _ref) {
      v = _ref[k];
      if (typeof v === 'function') {
        ret[k] = v.bind(rand);
      }
    }
    return ret;
  };


  /**
  If no arguments are passed, a random number in the range (0, 1) will be returned.
  
  @method (default)
  @param [arg0] {Number | Array}
  - If a single number is passed, a random number in the range (0, `number`) will be returned.
  - If an array is passed, [`pick`](#method_pick) will choose a single element and return it.
  
  @param [arg1] {Number}
  If supplied, a random number in the range (`arg0`, `arg1`) will be returned.
  
  @example
      var amount = cg.rand(); // Will be between 0 and 1.
  
  @example
      var amount = cg.rand(100); // Will be between 0 and 100.
  
  @example
      var amount = cg.rand(-100,100); // Will be between -100 and 100
  
  @example
      // One color name will be chosen and returned:
      var choice = cg.rand(['red', 'green', 'blue', 'purple', 'orange']);
   */

  function Random() {
    var args;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    this.sow.apply(this, args);
  }


  /**
  "Seed" the random sequence with any arbitrary data.
  
  @method sow
  @param [...] any number of arbitrary arguments will be used as seed data after being converted
  to strings with `toString`.
   */

  Random.prototype.sow = function() {
    var i, seed, seeds;
    i = void 0;
    seeds = void 0;
    seed = void 0;
    this.s0 = hash(' ');
    this.s1 = hash(this.s0);
    this.s2 = hash(this.s1);
    this.c = 1;
    seeds = Array.prototype.slice.call(arguments);
    i = 0;
    while (seed = seeds[i++]) {
      this.s0 -= hash(seed);
      this.s0 += ~~(this.s0 < 0);
      this.s1 -= hash(seed);
      this.s1 += ~~(this.s1 < 0);
      this.s2 -= hash(seed);
      this.s2 += ~~(this.s2 < 0);
    }
  };


  /**
  @method uint32
  @return a random integer between 0 and 2^32.
   */

  Random.prototype.uint32 = function() {
    return rnd.apply(this) * 0x100000000;
  };


  /**
  @method fract32
  @return a random real number between 0 and 1.
   */

  Random.prototype.fract32 = function() {
    return rnd.apply(this) + (rnd.apply(this) * 0x200000 | 0) * 1.1102230246251565e-16;
  };


  /**
  @method real
  @return a random real number between 0 and 2^32.
   */

  Random.prototype.real = function() {
    return this.uint32() + this.fract32();
  };


  /**
  @method int
  @return a random integer between min and max.
   */

  Random.prototype.i = function(min, max) {
    return Math.floor(this.range(min, max));
  };


  /**
  @method range
  @param min {Number}
  @param max {Number}
  @return random real number between min and max.
   */

  Random.prototype.range = function(min, max) {
    min = min || 0;
    max = max || 0;
    return this.fract32() * (max - min) + min;
  };


  /**
  @method normal
  @return a random real number between -1 and 1.
   */

  Random.prototype.normal = function() {
    return 1 - 2 * this.fract32();
  };

  Random.prototype.uuid = function() {
    var a, b;
    a = void 0;
    b = void 0;
    b = a = '';
    while (a++ < 36) {
      b += (~a % 5 | a * 3 & 4 ? (a ^ 15 ? 8 ^ this.fract32() * (a ^ 20 ? 16 : 4) : 4).toString(16) : '-');
    }
    return b;
  };

  Random.prototype.uuidObj = function() {
    var i, ret, segment, u, _i, _len, _ref;
    u = this.uuid();
    ret = new Uint32Array(4);
    _ref = u.split('-');
    for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
      segment = _ref[i];
      ret[i] = parseInt('0x' + segment);
    }
    return ret;
  };


  /**
  @method pick
  @param array {Array} an array of things to choose from
  @return a random member of `array`.
   */

  Random.prototype.pick = function(array) {
    return array[this.i(0, array.length)];
  };


  /**
  @method weightedPick
  @param array {Array} an array of things to choose from
  @return a random member of `array`, favoring the earlier entries.
   */

  Random.prototype.weightedPick = function(array) {
    return array[~~(Math.pow(this.fract32(), 2) * array.length)];
  };

  return Random;

})(Module);

module.exports = {
  create: Random.create
};


},{"Module":9}],35:[function(require,module,exports){

/**
A two-dimensional vector representation with utility methods.

@class cg.math.Vector2
@param [x=0] the horizontal component of the vector.
@param [y=0] the vertical component of the vector.
 */
var Vector2;

Vector2 = (function() {

  /**
  The horizontal component of this vector.
  
  @property x
  @type Number
   */

  /**
  The vertical component of this vector.
  
  @property y
  @type Number
   */
  function Vector2(x, y) {
    this.x = x != null ? x : 0;
    this.y = y != null ? y : 0;
  }


  /**
  @method clone
  @return {cg.math.Vector2} a copy of this vector.
   */

  Vector2.prototype.clone = function() {
    return new Vector2(this.x, this.y);
  };


  /**
  Set the values of this vector to those of another.
  
  @method set
  @param other {cg.math.Vector2}
  @chainable
   */

  Vector2.prototype.set = function(other) {
    this.x = other.x, this.y = other.y;
    return this;
  };


  /**
  Find the dot product of this vector with another.
  
  @method dot
  @param other {cg.math.Vector2} the other vector to perform the dot product with.
  @return {Number} the dot product of this vector with `other`.
   */

  Vector2.prototype.dot = function(other) {
    return this.x * other.x + this.y * other.y;
  };


  /**
  Get the square of the length of this vector (faster than [`len`](#method_len)
  since no `sqrt` is necessary).
  
  @method len2
  @return the square of the length of this vector.
   */

  Vector2.prototype.len2 = function() {
    return this.x * this.x + this.y * this.y;
  };


  /**
  Get the length of this vector.
  
  @method len
  @return the length of this vector.
   */

  Vector2.prototype.len = function() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  };


  /**
  Set the magnitude of this vector.
  
  @method mag
  @param amount {Number} the magnitude you wish this vector to aquire
  @chainable
   */

  Vector2.prototype.mag = function(amount) {
    this.$norm().$mul(amount);
    return this;
  };


  /**
  Determine the angle this vector is facing, in radians.
  
  0 radians starts at (1, 0) and goes clockwise according
  to Combo's coordinate system.
  
  @method angle
  @return {Number} the angle of the vector in radians
   */

  Vector2.prototype.angle = function() {
    return Math.atan2(this.y, this.x);
  };

  Vector2.prototype.angleTo = function(other) {
    return this.sub(other).angle();
  };


  /**
  TODOC
  @method rotate
  @param angle {Number[radians]}
  @chainable
   */

  Vector2.prototype.rotate = function(angle) {
    var cos, sin, x;
    cos = Math.cos(angle);
    sin = Math.sin(angle);
    x = this.x;
    this.x = x * cos - this.y * sin;
    this.y = x * sin + this.y * cos;
    return this;
  };


  /**
  Set the length of this vector to zero.
  
  Effectively the same as `this.x = this.y = 0`.
  
  @method zero
  @chainable
   */

  Vector2.prototype.zero = function() {
    this.x = this.y = 0;
    return this;
  };


  /**
  Compute the addition of this vector with another.
  
  @method add
  @param other {cg.math.Vector2} the other vector to add to this one.
  @return {cg.math.Vector2} a new vector representing the vector-sum of this and `other`.
   */

  Vector2.prototype.add = function(other) {
    return new Vector2(this.x + other.x, this.y + other.y);
  };


  /**
  Compute the subtraction of this vector with another.
  
  @method sub
  @param other {cg.math.Vector2} the other vector to subtract from this one.
  @return {cg.math.Vector2} a new vector representing the vector-difference of this and `other`.
   */

  Vector2.prototype.sub = function(other) {
    return new Vector2(this.x - other.x, this.y - other.y);
  };


  /**
  Compute the multiplication of this vector with a scalar.
  
  Effectively the same as `new Vector2(this.x * scalar, this.y * scalar)`.
  
  @method mul
  @param scalar {Number} the number to multiply this vector's components by.
  @return {cg.math.Vector2} a new vector representing the result of the multiplication.
   */

  Vector2.prototype.mul = function(scalar) {
    return new Vector2(this.x * scalar, this.y * scalar);
  };


  /**
  Compute the division of this vector with a scalar.
  
  Effectively the same as `new Vector2(this.x / scalar, this.y / scalar)`.
  
  @method div
  @param scalar {Number} the number to divide this vector's components by.
  @return {cg.math.Vector2} a new vector representing the result of the division.
   */

  Vector2.prototype.div = function(scalar) {
    return new Vector2(this.x / scalar, this.y / scalar);
  };


  /**
  Ensures this vector's length/magnitude isn't larger than a specified scalar.
  
  @method limit
  @param amount {Number} the maximum length/magnitude to allow this vector to have
   */

  Vector2.prototype.limit = function(amount) {
    if (this.len() > amount) {
      this.$norm().$mul(amount);
    }
    return this;
  };


  /**
  Compute a normalized version of this vector.
  
  @method norm
  @return {cg.math.Vector2} A new normalized version of this vector.
   */

  Vector2.prototype.norm = function() {
    var len;
    len = this.len();
    if (len === 0) {
      return new Vector2;
    }
    return new Vector2(this.x / len, this.y / len);
  };


  /**
  Point this vector in a random direction with a given length.
  
  @method randomize
  @param [len=1] {Number} the new length of this vector.
  @chainable
   */

  Vector2.prototype.randomize = function(len) {
    var ang;
    if (len == null) {
      len = 1;
    }
    ang = 2 * Math.random() * Math.PI;
    this.x = len * Math.cos(ang);
    this.y = len * Math.sin(ang);
    return this;
  };


  /**
  Add a vector to this vector, modifying this vector "in-place".
  
  @method $add
  @param other {cg.math.Vector2} the other vector to add to this one.
  @chainable
   */

  Vector2.prototype.$add = function(other) {
    this.x += other.x;
    this.y += other.y;
    return this;
  };


  /**
  Subtract a vector from this vector, modifying this vector "in-place".
  
  @method $sub
  @param other {cg.math.Vector2} the other vector to subtract from this one.
  @chainable
   */

  Vector2.prototype.$sub = function(other) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  };


  /**
  Multiply this vector by a scalar, modifying this vector "in-place".
  
  Effectively the same as `this.x *= scalar; this.y *= scalar`.
  
  @method $mul
  @param scalar {Number} the number to multiply this vector's components by.
  @chainable
   */

  Vector2.prototype.$mul = function(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  };


  /**
  Divide this vector by a scalar, modifying this vector "in-place".
  
  Effectively the same as `this.x /= scalar; this.y /= scalar`.
  
  @method $div
  @param scalar {Number} the number to divide this vector's components by.
  @chainable
   */

  Vector2.prototype.$div = function(scalar) {
    this.x /= scalar;
    this.y /= scalar;
    return this;
  };


  /**
  Normalize this vector "in-place".
  
  @method $norm
  @chainable
   */

  Vector2.prototype.$norm = function() {
    var len;
    len = this.len();
    if (len === 0) {
      return this;
    }
    this.x /= len;
    this.y /= len;
    return this;
  };

  Vector2.NORTH = (new Vector2(0, -1)).$norm();

  Vector2.SOUTH = (new Vector2(0, 1)).$norm();

  Vector2.EAST = (new Vector2(1, 0)).$norm();

  Vector2.WEST = (new Vector2(-1, 0)).$norm();

  Vector2.NORTHEAST = (new Vector2(1, -1)).$norm();

  Vector2.NORTHWEST = (new Vector2(-1, -1)).$norm();

  Vector2.SOUTHEAST = (new Vector2(1, 1)).$norm();

  Vector2.SOUTHWEST = (new Vector2(-1, 1)).$norm();

  return Vector2;

})();

module.exports = Vector2;


},{}],36:[function(require,module,exports){
var Random, Vector2;

Vector2 = require('math/Vector2');

Random = require('math/Random');

module.exports = {
  Vector2: Vector2,
  Random: Random,
  clamp: function(n, min, max) {
    return Math.min(max, Math.max(n || 0, min));
  },
  mod: function(num, n) {
    return ((num % n) + n) % n;
  },
  wrap: function(num, min, max) {
    return (cg.math.mod(num - min, max - min)) + min;
  },
  minAngle: function(ang) {
    return Math.atan2(Math.sin(ang), Math.cos(ang));
  },
  angleDiff: function(a, b) {
    return module.exports.minAngle(a - b);
  }
};


},{"math/Random":34,"math/Vector2":35}],37:[function(require,module,exports){
var Menu, MenuItem, Scene, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Scene = require('Scene');

MenuItem = require('menus/MenuItem');


/**
TODOC

@class cg.menus.Menu
@extends cg.Scene
 */

Menu = (function(_super) {
  __extends(Menu, _super);

  function Menu() {
    Menu.__super__.constructor.apply(this, arguments);
    if (this.controls == null) {
      this.controls = cg.input.controls.menus;
    }
    this.on('up', function() {
      return this.selectItem(this.selected.above);
    });
    this.on('down', function() {
      return this.selectItem(this.selected.below);
    });
    this.on('left', function() {
      return this.selectItem(this.selected.left);
    });
    this.on('right', function() {
      return this.selectItem(this.selected.right);
    });
    this.on('select', function() {
      return this.selected.select();
    });
  }

  Menu.prototype.selectItem = function(item) {
    var _ref;
    if (item == null) {
      return;
    }
    if ((_ref = this.selected) != null) {
      _ref.blur();
    }
    this.selected = item;
    return item.focus();
  };

  return Menu;

})(Scene);

module.exports = Menu;


},{"Scene":10,"cg":15,"menus/MenuItem":38}],38:[function(require,module,exports){
var Actor, MenuItem, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Actor = require('Actor');


/**
TODOC

@class cg.menus.MenuItem
@extends cg.Actor
 */

MenuItem = (function(_super) {
  __extends(MenuItem, _super);

  function MenuItem() {
    MenuItem.__super__.constructor.apply(this, arguments);
    if (this.focused == null) {
      this.focused = false;
    }
  }

  MenuItem.prototype.focus = function() {
    this.emit('focus');
    return this.focused = true;
  };

  MenuItem.prototype.blur = function() {
    this.emit('blur');
    return this.focused = false;
  };

  MenuItem.prototype.select = function() {
    return this.emit('select');
  };

  return MenuItem;

})(Actor);

module.exports = MenuItem;


},{"Actor":4,"cg":15}],39:[function(require,module,exports){
var BitmapText, MenuItem, TextMenuItem, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

MenuItem = require('menus/MenuItem');

BitmapText = require('text/BitmapText');


/**
TODOC

@class cg.menus.TextMenuItem
@extends MenuItem
 */

TextMenuItem = (function(_super) {
  __extends(TextMenuItem, _super);

  function TextMenuItem(font, string, params) {
    this.font = font;
    this.string = string != null ? string : '';
    TextMenuItem.__super__.constructor.call(this, params);
    if (this.blurAlpha == null) {
      this.blurAlpha = 0.5;
    }
    if (this.focusAlpha == null) {
      this.focusAlpha = 1;
    }
    this.alpha = this.blurAlpha;
    this.textString = this.addChild(new BitmapText(this.font, this.string, {
      alignment: this.alignment,
      spacing: this.spacing
    }));
  }

  TextMenuItem.prototype.focus = function() {
    TextMenuItem.__super__.focus.apply(this, arguments);
    return this.alpha = this.focusAlpha;
  };

  TextMenuItem.prototype.blur = function() {
    TextMenuItem.__super__.blur.apply(this, arguments);
    return this.alpha = this.blurAlpha;
  };

  TextMenuItem.prototype.updateText = function() {
    this.textString.string = this.string;
    return this.textString.updateText();
  };

  return TextMenuItem;

})(MenuItem);

module.exports = TextMenuItem;


},{"cg":15,"menus/MenuItem":38,"text/BitmapText":63}],40:[function(require,module,exports){
var Menu, TextMenuItem, VerticalMenu, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Menu = require('menus/Menu');

TextMenuItem = require('menus/TextMenuItem');


/**
TODOC

@class cg.menus.VerticalMenu
@extends Menu
 */

VerticalMenu = (function(_super) {
  __extends(VerticalMenu, _super);

  function VerticalMenu() {
    var i, item, itemHeight, itemNames, k, name, num, top, _i, _items, _len, _ref;
    VerticalMenu.__super__.constructor.apply(this, arguments);
    if (this.spacing == null) {
      this.spacing = 1;
    }
    if (this.items == null) {
      this.items = [];
    }
    _items = this.items;
    itemNames = [];
    this.items = {};
    if (this.alignment == null) {
      this.alignment = 'center';
    }
    if (this.lineHeight == null) {
      this.lineHeight = this.font.lineHeight;
    }
    itemHeight = (this.lineHeight * this.font.charHeight) + this.spacing;
    this.anchor = {};
    if (this.alignment === 'center') {
      this.anchor.x = this.anchor.y = 0.5;
    }
    this.height = itemHeight * _items.length - this.spacing;
    top = -this.height / 2 + itemHeight / 2;
    for (num = _i = 0, _len = _items.length; _i < _len; num = ++_i) {
      item = _items[num];
      name = '_UNDEFINED_';
      switch (typeof item) {
        case 'string':
          if (this.font == null) {
            throw new Error('No font specified.');
          }
          name = item;
          this.items[name] = this.addChild(new TextMenuItem(this.font, item, {
            alignment: this.alignment,
            spacing: this.spacing,
            y: top + num * itemHeight
          }), 'items');
          break;
        case 'object':
          name = item.name;
          item = item.item;
          item.y = top + num * itemHeight;
          this.items[name] = this.addChild(item, 'items');
          break;
        default:
          throw new Error('Unexpected menu item type: ' + typeof item);
      }
      itemNames.push(name);
    }
    i = 0;
    _ref = this.items;
    for (k in _ref) {
      if (!__hasProp.call(_ref, k)) continue;
      item = _ref[k];
      if (i === 0) {
        this.selectItem(item);
      }
      item.above = this.items[itemNames[cg.math.mod(i - 1, itemNames.length)]];
      item.below = this.items[itemNames[cg.math.mod(i + 1, itemNames.length)]];
      ++i;
    }
  }

  return VerticalMenu;

})(Menu);

module.exports = VerticalMenu;


},{"cg":15,"menus/Menu":37,"menus/TextMenuItem":39}],41:[function(require,module,exports){
var Menu, MenuItem, TextMenuItem, VerticalMenu;

Menu = require('menus/Menu');

MenuItem = require('menus/MenuItem');

TextMenuItem = require('menus/TextMenuItem');

VerticalMenu = require('menus/VerticalMenu');

module.exports = {
  Menu: Menu,
  MenuItem: MenuItem,
  TextMenuItem: TextMenuItem,
  VerticalMenu: VerticalMenu,
  defaultControlMap: {
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
    select: ['enter', 'space'],
    back: 'esc'
  },
  init: function(defaultControls) {
    if (defaultControls == null) {
      defaultControls = index.defaultControlMap;
    }
    return cg.input.map('menus', defaultControls);
  }
};


},{"menus/Menu":37,"menus/MenuItem":38,"menus/TextMenuItem":39,"menus/VerticalMenu":40}],42:[function(require,module,exports){
var __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

module.exports = function(gfx) {
  var BaseTexture;
  BaseTexture = gfx.BaseTexture;
  return gfx.BaseTexture = (function(_super) {
    __extends(BaseTexture, _super);

    function BaseTexture() {
      BaseTexture.__super__.constructor.apply(this, arguments);
      if (gfx._textures == null) {
        gfx._textures = [];
      }
      gfx._textures.push(this);
    }

    Object.defineProperty(BaseTexture.prototype, 'scaleMode', {
      get: function() {
        var _ref;
        return (_ref = this._scaleMode) != null ? _ref : gfx.scaleModes.DEFAULT;
      },
      set: function(val) {
        if (val !== this.scaleMode) {
          this._scaleMode = val;
          if (this.source != null) {
            return gfx.__combo__texturesToUpdate.push(this);
          }
        }
      }
    });

    BaseTexture.prototype.beginRead = function() {
      if (this._ctx == null) {
        this.createCanvas(this.source);
      }
      return this._imageData != null ? this._imageData : this._imageData = this._ctx.getImageData(0, 0, this._ctx.canvas.width, this._ctx.canvas.height);
    };

    BaseTexture.prototype.getPixel = function(x, y) {
      var idx;
      idx = (x + y * this._imageData.width) * 4;
      return {
        r: this._imageData.data[idx + 0],
        g: this._imageData.data[idx + 1],
        b: this._imageData.data[idx + 2],
        a: this._imageData.data[idx + 3]
      };
    };

    BaseTexture.prototype.setPixel = function(x, y, rgba) {
      var idx;
      idx = (x + y * this._imageData.width) * 4;
      this._imageData.data[idx + 0] = rgba.r;
      this._imageData.data[idx + 1] = rgba.g;
      this._imageData.data[idx + 2] = rgba.b;
      return this._imageData.data[idx + 3] = rgba.a;
    };

    BaseTexture.prototype.endRead = function() {
      this._ctx.putImageData(this._imageData, 0, 0);
      return gfx.texturesToUpdate.push(this);
    };

    BaseTexture.prototype.createCanvas = function(loadedImage) {
      if (typeof loadedImage.getContext !== 'function') {
        this.source = document.createElement('canvas');
        this.source.width = loadedImage.width;
        this.source.height = loadedImage.height;
      }
      this._ctx = this.source.getContext('2d');
      this._ctx.drawImage(loadedImage, 0, 0);
      this.beginRead();
      return this.endRead();
    };

    return BaseTexture;

  })(BaseTexture);
};


},{}],43:[function(require,module,exports){
var Module;

Module = require('Module');

module.exports = function(gfx) {
  Module.moduleize(gfx.DisplayObject);
  gfx.DisplayObject.prototype.updateTransformNormal = function() {
    var a00, a01, a02, a10, a11, a12, b00, b01, b10, b11, offsetX, offsetY, parentTransform, px, py, scale, worldTransform;
    if (this.rotation !== this.rotationCache) {
      this.rotationCache = this.rotation;
      this._sr = Math.sin(this.rotation);
      this._cr = Math.cos(this.rotation);
    }
    parentTransform = this.parent.worldTransform;
    worldTransform = this.worldTransform;
    scale = {
      x: 1,
      y: 1
    };
    if (this.flipX) {
      scale.x = -this.scale.x;
      offsetX = this.width * (1 - 2 * this.anchor.x);
    } else {
      scale.x = this.scale.x;
      offsetX = 0;
    }
    if (this.flipY) {
      scale.y = -this.scale.y;
      offsetY = this.height * (1 - 2 * this.anchor.y);
    } else {
      scale.y = this.scale.y;
      offsetY = 0;
    }
    px = this.pivot.x;
    py = this.pivot.y;
    a00 = this._cr * scale.x;
    a01 = -this._sr * scale.y;
    a10 = this._sr * scale.x;
    a11 = this._cr * scale.y;
    a02 = this.position.x - a00 * px - py * a01 + offsetX;
    a12 = this.position.y - a11 * py - px * a10 + offsetY;
    b00 = parentTransform.a;
    b01 = parentTransform.b;
    b10 = parentTransform.c;
    b11 = parentTransform.d;
    worldTransform.a = b00 * a00 + b01 * a10;
    worldTransform.b = b00 * a01 + b01 * a11;
    worldTransform.tx = b00 * a02 + b01 * a12 + parentTransform.tx;
    worldTransform.c = b10 * a00 + b11 * a10;
    worldTransform.d = b10 * a01 + b11 * a11;
    worldTransform.ty = b10 * a02 + b11 * a12 + parentTransform.ty;
    this.worldAlpha = this.alpha * this.parent.worldAlpha;
  };
  gfx.DisplayObject.prototype.updateTransform = gfx.DisplayObject.prototype.updateTransformNormal;
  gfx.DisplayObject.prototype.getChildIndex = function() {
    var _ref;
    return (_ref = this.parent) != null ? _ref.children.indexOf(typeof this !== "undefined" && this !== null ? this : NaN) : void 0;
  };
  gfx.DisplayObject.prototype.getTreeDepth = function() {
    if (this.parent == null) {
      return 0;
    }
    return 1 + this.parent.getTreeDepth();
  };
  gfx.DisplayObject.prototype.isAbove = function(other) {
    var a, b, depth, otherDepth;
    a = this;
    b = other;
    otherDepth = other.getTreeDepth();
    depth = this.getTreeDepth();
    while (true) {
      if (a.parent === b) {
        return true;
      }
      if (b.parent === a) {
        return false;
      }
      if ((a.parent === b.parent) || (a.parent == null) || (b.parent == null)) {
        break;
      }
      if (depth > otherDepth) {
        a = a.parent;
        depth -= 1;
      } else if (otherDepth > depth) {
        b = b.parent;
        otherDepth -= 1;
      } else {
        a = a.parent;
        b = b.parent;
      }
    }
    return a.getChildIndex() > b.getChildIndex();
  };
  gfx.DisplayObject.defineProperty('anchorX', {
    get: function() {
      return this.anchor.x;
    },
    set: function(val) {
      return this.anchor.x = val;
    }
  });
  gfx.DisplayObject.defineProperty('anchorY', {
    get: function() {
      return this.anchor.y;
    },
    set: function(val) {
      return this.anchor.y = val;
    }
  });
  gfx.DisplayObject.defineProperty('pivotX', {
    get: function() {
      return this.pivot.x;
    },
    set: function(val) {
      return this.pivot.x = val;
    }
  });
  gfx.DisplayObject.defineProperty('pivotY', {
    get: function() {
      return this.pivot.y;
    },
    set: function(val) {
      return this.pivot.y = val;
    }
  });
  gfx.DisplayObject.defineProperty('scaleX', {
    get: function() {
      return this.scale.x;
    },
    set: function(val) {
      return this.scale.x = val;
    }
  });
  gfx.DisplayObject.defineProperty('scaleY', {
    get: function() {
      return this.scale.y;
    },
    set: function(val) {
      return this.scale.y = val;
    }
  });
  gfx.DisplayObject.defineProperty('worldX', {
    get: function() {
      return this.worldTransform.tx / cg.stage.scale.x;
    },
    set: function(val) {
      var _ref, _ref1;
      return this.position.x = val - ((_ref = (_ref1 = this.parent) != null ? _ref1.worldX : void 0) != null ? _ref : 0);
    }
  });
  gfx.DisplayObject.defineProperty('worldY', {
    get: function() {
      return this.worldTransform.ty / cg.stage.scale.y;
    },
    set: function(val) {
      var _ref, _ref1;
      return this.position.y = val - ((_ref = (_ref1 = this.parent) != null ? _ref1.worldY : void 0) != null ? _ref : 0);
    }
  });
  gfx.DisplayObject.defineProperty('left', {
    get: function() {
      var ax, left, w;
      left = this.x - this.pivot.x;
      if (((w = this.width) != null) && ((ax = this.anchorX) != null)) {
        left -= ax * w;
      }
      return left;
    },
    set: function(val) {
      var ax, w;
      if (((w = this.width) != null) && ((ax = this.anchorX) != null)) {
        return this.x = val + this.pivot.x + w * ax;
      } else {
        return this.x = val + this.pivot.x;
      }
    }
  });
  gfx.DisplayObject.defineProperty('right', {
    get: function() {
      var w;
      if ((w = this.width)) {
        return this.left + w;
      } else {
        return this.left;
      }
    },
    set: function(val) {
      var w;
      if ((w = this.width)) {
        return this.left = val - w;
      } else {
        return this.left = val;
      }
    }
  });
  gfx.DisplayObject.defineProperty('top', {
    get: function() {
      var ay, h, top;
      top = this.y - this.pivot.y;
      if (((h = this.height) != null) && ((ay = this.anchorY) != null)) {
        top -= ay * h;
      }
      return top;
    },
    set: function(val) {
      var ay, h;
      if (((h = this.height) != null) && ((ay = this.anchorY) != null)) {
        return this.y = val + this.pivot.y + h * ay;
      } else {
        return this.y = val + this.pivot.y;
      }
    }
  });
  return gfx.DisplayObject.defineProperty('bottom', {
    get: function() {
      var h;
      if ((h = this.height)) {
        return this.top + h;
      } else {
        return this.top;
      }
    },
    set: function(val) {
      var h;
      if ((h = this.height)) {
        return this.top = val - h;
      } else {
        return this.top = val;
      }
    }
  });
};


},{"Module":9}],44:[function(require,module,exports){
var Module;

Module = require('Module');

module.exports = function(gfx) {
  var addChild, addChildAt;
  Module.moduleize(gfx.DisplayObjectContainer);
  addChild = gfx.DisplayObjectContainer.prototype.addChild;
  gfx.DisplayObjectContainer.prototype.addChild = function(child) {
    addChild.apply(this, arguments);
    return child;
  };
  addChildAt = gfx.DisplayObjectContainer.prototype.addChildAt;
  return gfx.DisplayObjectContainer.prototype.addChildAt = function(child) {
    addChildAt.apply(this, arguments);
    return child;
  };
};


},{"Module":9}],45:[function(require,module,exports){
var Module;

Module = require('Module');

module.exports = function(gfx) {
  Module.moduleize(gfx.Sprite);
  gfx.Sprite.DUMMY_TEXTURE = {
    frame: {
      width: 1,
      height: 1
    },
    baseTexture: {
      hasLoaded: true
    }
  };
  gfx.Sprite.prototype._texture = gfx.Sprite.DUMMY_TEXTURE;

  /**
  The texture used by this `Sprite`.
  
  @property texture
   */
  gfx.Sprite.defineProperty('texture', {
    get: function() {
      var _ref;
      return (_ref = this._texture) != null ? _ref : this.__defaultTexture;
    },
    set: function(texture) {
      var _ref;
      if ((texture == null) || texture === gfx.Sprite.DUMMY_TEXTURE) {
        this._texture = gfx.Sprite.DUMMY_TEXTURE;
        this._renderCanvas = gfx.DisplayObjectContainer.prototype._renderCanvas;
        this._renderWebGL = gfx.DisplayObjectContainer.prototype._renderWebGL;
        return;
      }
      if ((typeof texture === 'string') && (((_ref = cg.assets) != null ? _ref.textures : void 0) != null)) {
        texture = cg.assets.textures[texture];
      }
      this._texture = texture != null ? texture : this.__defaultTexture;
      delete this._renderCanvas;
      delete this._renderWebGL;
      return this._updateFrame = true;
    }
  });
  gfx.Sprite.defineProperty('flipX', {
    get: function() {
      return !!this._flipX;
    },
    set: function(val) {
      return this._flipX = val;
    }
  });
  return gfx.Sprite.defineProperty('flipY', {
    get: function() {
      return !!this._flipY;
    },
    set: function(val) {
      return this._flipY = val;
    }
  });
};


},{"Module":9}],46:[function(require,module,exports){
module.exports = function(gfx) {
  gfx.Texture.prototype.beginRead = function() {
    var _ref;
    return (_ref = this.baseTexture).beginRead.apply(_ref, arguments);
  };
  gfx.Texture.prototype.getPixel = function(x, y) {
    var _ref;
    return (_ref = this.baseTexture).getPixel.apply(_ref, arguments);
  };
  gfx.Texture.prototype.setPixel = function(x, y, rgba) {
    var _ref;
    return (_ref = this.baseTexture).setPixel.apply(_ref, arguments);
  };
  gfx.Texture.prototype.endRead = function() {
    var _ref;
    return (_ref = this.baseTexture).endRead.apply(_ref, arguments);
  };
  return gfx.Texture.prototype.createCanvas = function(loadedImage) {
    var _ref;
    return (_ref = this.baseTexture).createCanvas.apply(_ref, arguments);
  };
};


},{}],47:[function(require,module,exports){
module.exports = function(gfx) {
  var updateTexturesSuper;
  if (gfx.__combo__texturesToUpdate == null) {
    gfx.__combo__texturesToUpdate = [];
  }
  updateTexturesSuper = gfx.WebGLRenderer.updateTextures;
  return gfx.WebGLRenderer.updateTextures = function() {
    var tex, _i, _len, _ref;
    updateTexturesSuper.apply(this, arguments);
    _ref = gfx.__combo__texturesToUpdate;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      tex = _ref[_i];
      gfx.updateWebGLTexture(tex, gfx.defaultRenderer.renderSession.gl);
    }
    return gfx.__combo__texturesToUpdate.length = 0;
  };
};


},{}],48:[function(require,module,exports){
var gfx;

gfx = require('pixi.js');

require('pixi-enhanced/DisplayObject')(gfx);

require('pixi-enhanced/DisplayObjectContainer')(gfx);

require('pixi-enhanced/Sprite')(gfx);

require('pixi-enhanced/BaseTexture')(gfx);

require('pixi-enhanced/Texture')(gfx);

require('pixi-enhanced/WebGLRenderer')(gfx);

gfx.scaleModes = {
  LINEAR: 'linear',
  NEAREST: 'nearest'
};

module.exports = gfx;


},{"pixi-enhanced/BaseTexture":42,"pixi-enhanced/DisplayObject":43,"pixi-enhanced/DisplayObjectContainer":44,"pixi-enhanced/Sprite":45,"pixi-enhanced/Texture":46,"pixi-enhanced/WebGLRenderer":47,"pixi.js":3}],49:[function(require,module,exports){
var Body, HasSignals, Module, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

HasSignals = require('util/HasSignals');


/**
TODOC
@class cg.physics.Body
@extends cg.Module
@constructor
@param actor {Actor} The actor associated with this body.
@param [props] {Object} Optional starting values of this body's properties (only those listed below will be applied)
@param [props.shape=new_AABB] {Shape} The shape associated with this body.
@param [props.bounce=0.5] {Number} The starting value of [`bounce`](#property_bounce).
@param [props.bounds=0.5] {Number} The starting value of [`bounds`](#property_density).
@param [props.density=0.5] {Number} The starting value of [`density`](#property_density).
@param [props.gravityScale=1.0] {Number} The starting value of [`gravityScale`](#property_density).
 */

Body = (function(_super) {
  __extends(Body, _super);

  Body.mixin(HasSignals);

  function Body(actor, _arg) {
    var ox, oy;
    this.actor = actor;
    this.shape = _arg.shape, this.density = _arg.density, this.bounce = _arg.bounce, this.gravityScale = _arg.gravityScale, this.bounds = _arg.bounds;
    this.v = new cg.math.Vector2;
    this.f = new cg.math.Vector2;
    this.offset = new cg.math.Vector2;
    ox = 0;
    oy = 0;
    Object.defineProperty(this.offset, 'x', {
      get: function() {
        return ox;
      },
      set: (function(_this) {
        return function(val) {
          var x;
          x = _this.actor.x;
          ox = val;
          return _this.actor.x = x;
        };
      })(this)
    });
    Object.defineProperty(this.offset, 'y', {
      get: function() {
        return oy;
      },
      set: (function(_this) {
        return function(val) {
          var y;
          y = _this.actor.y;
          oy = val;
          return _this.actor.y = y;
        };
      })(this)
    });
    if (this.shape == null) {
      this.shape = new cg.physics.shapes.AABB;
    }
    if (this.bounded == null) {
      this.bounded = true;
    }
    if (this.bounce == null) {
      this.bounce = 0.5;
    }
    if (this.density == null) {
      this.density = 0.5;
    }
    if (this.gravityScale == null) {
      this.gravityScale = 1;
    }
    if (this.sFriction == null) {
      this.sFriction = 0.6;
    }
    if (this.dFriction == null) {
      this.dFriction = 0.4;
    }
    this._updateMass();
  }

  Body.prototype._updateMass = function() {
    var m;
    this.shape._areaDirty = false;
    m = this.shape.area * this.density;
    if (m === 0) {
      return this.__inverseMass = 0;
    } else {
      return this.__inverseMass = 1 / m;
    }
  };


  /**
  The horizontal position of this body; synonymous with `this.shape.x`.
  @property x
  @type Number
   */

  Object.defineProperty(Body.prototype, 'x', {
    get: function() {
      return this.shape.x;
    },
    set: function(val) {
      this.actor.worldX = val - this.offset.x;
      return this.shape.x = val;
    }
  });


  /**
  The vertical position of this body; synonymous with `this.shape.y`.
  @property y
  @type Number
   */

  Object.defineProperty(Body.prototype, 'y', {
    get: function() {
      return this.shape.y;
    },
    set: function(val) {
      this.actor.worldY = val - this.offset.y;
      return this.shape.y = val;
    }
  });


  /**
  A virtual property representing the left-most point on this body's shape.
  
  Setting its value will move the shape horizontally so that its left-most point is equal to the value specified.
  @property left
  @type Number
   */

  Object.defineProperty(Body.prototype, 'left', {
    get: function() {
      return this.shape.left;
    },
    set: function(val) {
      return this.shape.left = val;
    }
  });


  /**
  A virtual property representing the right-most point on this body's shape.
  
  Setting its value will move the shape horizontally so that its right-most point is equal to the value specified.
  @property right
  @type Number
   */

  Object.defineProperty(Body.prototype, 'right', {
    get: function() {
      return this.shape.right;
    },
    set: function(val) {
      return this.shape.right = val;
    }
  });


  /**
  A virtual property representing the top-most point on this body's shape.
  
  Setting its value will move the shape vertically so that its top-most point is equal to the value specified.
  @property top
  @type Number
   */

  Object.defineProperty(Body.prototype, 'top', {
    get: function() {
      return this.shape.top;
    },
    set: function(val) {
      return this.shape.top = val;
    }
  });


  /**
  A virtual property representing the bottom-most point on this body's shape.
  
  Setting its value will move the shape vertically so that its bottom-most point is equal to the value specified.
  @property bottom
  @type Number
   */

  Object.defineProperty(Body.prototype, 'bottom', {
    get: function() {
      return this.shape.bottom;
    },
    set: function(val) {
      return this.shape.bottom = val;
    }
  });


  /**
  The width of this body's shape.
  @property width
  @type Number
   */

  Object.defineProperty(Body.prototype, 'width', {
    get: function() {
      return this.shape.width;
    },
    set: function(val) {
      return this.shape.width = val;
    }
  });


  /**
  The height of this body's shape.
  @property height
  @type Number
   */

  Object.defineProperty(Body.prototype, 'height', {
    get: function() {
      return this.shape.height;
    },
    set: function(val) {
      return this.shape.height = val;
    }
  });


  /**
  The mass of this object.
  
  Changing this property affects [`density`](#property_density) and [`inverseMass`](#property_inverseMass).
  @property mass
  @type Number
   */

  Object.defineProperty(Body.prototype, 'mass', {
    get: function() {
      if (this.inverseMass === 0) {
        return 0;
      }
      return 1 / this.inverseMass;
    },
    set: function(val) {
      this.density = val / this.shape.area;
      return this._updateMass();
    }
  });


  /**
  The inverse mass of this object.
  
  Changing this property affects [`density`](#property_density) and [`mass`](#property_mass).
  @property inverseMass
  @type Number
   */

  Object.defineProperty(Body.prototype, 'inverseMass', {
    get: function() {
      if (this.shape._areaDirty) {
        this._updateMass();
      }
      return this.__inverseMass;
    },
    set: function(val) {
      if (val === 0) {
        this.density = 0;
      } else {
        this.density = (1 / val) / this.shape.area;
      }
      return this._updateMass();
    }
  });


  /**
  The mass of this object.
  
  Changing this property affects [`density`](#property_density) and [`inverseMass`](#property_inverseMass).
  @property mass
  @type Number
   */

  Object.defineProperty(Body.prototype, 'density', {
    get: function() {
      return this.__density;
    },
    set: function(val) {
      this.__density = val;
      return this._updateMass();
    }
  });


  /**
  The static coefficient for this body's friction.
  @property sFriction
  @type Number
   */

  Object.defineProperty(Body.prototype, 'sFriction', {
    get: function() {
      return this.__sFriction;
    },
    set: function(val) {
      this.__sFriction2 = val * val;
      return this.__sFriction = val;
    }
  });


  /**
  The square of this body's static coefficient of friction.
  @property sFriction2
  @type Number
   */

  Object.defineProperty(Body.prototype, 'sFriction2', {
    get: function() {
      return this.__sFriction2;
    },
    set: function(val) {
      this.__sFriction2 = val;
      return this.__sFriction = Math.sqrt(val);
    }
  });


  /**
  The dynamic coefficient for this body's friction.
  @property dFriction
  @type Number
   */

  Object.defineProperty(Body.prototype, 'dFriction', {
    get: function() {
      return this.__dFriction;
    },
    set: function(val) {
      this.__dFriction2 = val * val;
      return this.__dFriction = val;
    }
  });


  /**
  The square of this body's dynamic coefficient of friction.
  @property dFriction2
  @type Number
   */

  Object.defineProperty(Body.prototype, 'dFriction2', {
    get: function() {
      return this.__dFriction2;
    },
    set: function(val) {
      this.__dFriction2 = val;
      return this.__dFriction = Math.sqrt(val);
    }
  });


  /**
  Simple friction coefficient. When read, its value is the same as [`dFriction`](#property_dFriction).
  
  Setting this value automatically sets [`dFriction`](#property_dFriction) to the value specified, and [`sFriction`](#property_sFriction) 25% higher, capped at 0.95.
  
  If you need finer control of friction, set [`dFriction`](#property_dFriction) and [`sFriction`](#property_sFriction) separately.
  
  @property friction
  @type Number
   */

  Object.defineProperty(Body.prototype, 'friction', {
    get: function() {
      return this.dFriction;
    },
    set: function(val) {
      this.dFriction = val;
      return this.sFriction = Math.min(0.95, val * 1.25);
    }
  });


  /**
  Update this body's position based on various forces and its current velocity.
  
  **NOTE:** This method is invoked by the [`PhysicsManager`](cg.physics.PhysicsManager.html) for any bodies that have been added
  with
  @method update
  @param dt {Number[seconds]} the amount of time that passed since the last update.
   */

  Body.prototype.update = function(dt) {
    var f, v, _ref;
    if (this.actor.worldPaused) {
      return;
    }
    v = this.v;
    f = this.f;
    v.$add(cg.physics.gravity.mul(this.gravityScale));
    v.$add(f.$mul(this.inverseMass * dt));
    this.x += v.x * dt;
    this.y += v.y * dt;
    f.zero();
    if (this.bounded) {
      return this.collideWithBounds((_ref = this.bounds) != null ? _ref : cg.physics.bounds);
    }
  };


  /*
  TODO: This needs to work similarly to the other collide/intersect methods.
   */

  Body.prototype.collideWithBounds = function(bounds) {
    var spot;
    if (bounds.left !== false && this.left < bounds.left) {
      this.left = bounds.left;
      this.v.x *= -this.bounce;
      spot = new cg.math.Vector2(this.left, this.shape.center.y);
      this.emit('collision', spot);
      this.emit('collision:left', spot);
    } else if (bounds.right !== false && this.right > bounds.right) {
      this.right = bounds.right;
      this.v.x *= -this.bounce;
      spot = new cg.math.Vector2(this.right, this.shape.center.y);
      this.emit('collision', spot);
      this.emit('collision:right', spot);
    }
    if (bounds.top !== false && this.top < bounds.top) {
      this.top = bounds.top;
      this.v.y *= -this.bounce;
      spot = new cg.math.Vector2(this.shape.center.x, this.top);
      this.emit('collision', spot);
      return this.emit('collision:top', spot);
    } else if (bounds.bottom !== false && this.bottom > bounds.bottom) {
      this.bottom = bounds.bottom;
      this.v.y *= -this.bounce;
      spot = new cg.math.Vector2(this.shape.center.x, this.bottom);
      this.emit('collision', spot);
      return this.emit('collision:bottom', spot);
    }
  };

  return Body;

})(Module);

module.exports = Body;


},{"Module":9,"cg":15,"util/HasSignals":72}],50:[function(require,module,exports){

/**
A description of how two [shapes](cg.physics.shapes.Shape.html) intersect.

@class cg.physics.Intersection
@constructor
@param object1 {Shape} The first intersecting shape.
@param object2 {Shape} The second intersecting shape.
@param normal {Vector2} The direction to "push" the objects out of each other with a minimal distance
@param penetration {Number} The total distance the shapes would need to move along `normal` for them to no longer intersect.
 */
var Intersection;

Intersection = (function() {

  /**
  The first intersecting shape.
  @property object1
  @type {Shape}
   */

  /**
  The second intersecting shape.
  @property object2
  @type {Shape}
   */

  /**
  The direction to "push" the objects out of each other with a minimal distance.
  @property normal
  @type Vector2
   */

  /**
  The total distance the shapes would need to move along `normal` for them to no longer intersect.
  @property penetration
  @type Number
   */
  function Intersection(object1, object2, normal, penetration) {
    this.object1 = object1;
    this.object2 = object2;
    this.normal = normal;
    this.penetration = penetration;
  }

  return Intersection;

})();

module.exports = Intersection;


},{}],51:[function(require,module,exports){
var Physical, cg;

cg = require('cg');

Physical = {
  mixin: {
    __getPhysical: function() {
      return !!this.__physical;
    },
    __setPhysical: function(val) {
      if (val === !!this.__physical) {
        return;
      }
      this.__physical = val;
      if (val) {
        return cg.physics.addBody(this.body);
      } else {
        return cg.physics.removeBody(this.body);
      }
    },
    __getX: function() {
      return this.body.x - this.body.offset.x;
    },
    __setX: function(val) {
      return this.body.x = val + this.body.offset.x;
    },
    __getY: function() {
      return this.body.y - this.body.offset.y;
    },
    __setY: function(val) {
      return this.body.y = val + this.body.offset.y;
    },
    __getShape: function() {
      return this.body.shape;
    },
    __setShape: function(val) {
      return this.body.shape = val;
    },
    __touches: function(other) {
      return this.body.shape.intersects(other.body.shape);
    },

    /*
    Test whether this object touches another object.
    
    This is effectively shorthand for `this.body.shape.intersects(other.body.shape)`.
    
    @method touches
    @param other {Actor|Array<Actor>|Group} The object(s) to test whether this object is touching or not.
    @return {Actor|null} the first `Actor` that a touch was detected on, if any; `null` if none are touching.
     */
    touches: function(others) {
      var other, _i, _len;
      if (!cg.util.isArray(others)) {
        if (others !== this && this.__touches(others)) {
          return others;
        }
      } else {
        for (_i = 0, _len = others.length; _i < _len; _i++) {
          other = others[_i];
          if (other !== this && this.__touches(other)) {
            return other;
          }
        }
        return false;
      }
    },

    /*
    Get the `Intersection` of this object with another, if any exists.
    
    @method intersects
    @param other {Actor} The object to test whether this object is touching or not.
    @return {cg.physics.Intersection} The intersection data of these two objects; `null` if they do not intersect.
     */
    intersects: function(other) {
      var intersection, intersects;
      intersection = new cg.physics.Intersection;
      intersects = this.body.shape.intersects(other.body.shape, intersection);
      if (intersects) {
        return intersection;
      } else {
        return null;
      }
    }
  },
  preInit: function() {
    var _height, _physical, _ref, _ref1, _ref2, _ref3, _ref4, _shape, _width, _x, _y;
    _x = (_ref = this.x) != null ? _ref : 0;
    _y = (_ref1 = this.y) != null ? _ref1 : 0;
    _physical = (_ref2 = this.physical) != null ? _ref2 : true;
    _width = (_ref3 = this.width) != null ? _ref3 : 10;
    _height = (_ref4 = this.height) != null ? _ref4 : 10;
    this.shape || (this.shape = new cg.physics.shapes.AABB(_x, _y, _width, _height));
    _shape = this.shape;
    this.body || (this.body = new cg.physics.Body(this, {
      shape: this.shape
    }));

    /**
    Shorthand for `this.body.shape`.
    
    @property shape
    @type {cg.physics.shapes.Shape}
     */
    Object.defineProperty(this, 'shape', {
      get: this.__getShape,
      set: this.__setShape,
      enumerable: true
    });
    this.shape = _shape;

    /**
    The horizontal position relative to `this.parent`.
    
    **Note**: Updating this property will update `this.body.x`, and vice-versa.
    @property x
    @type {Number}
     */
    Object.defineProperty(this, 'x', {
      get: this.__getX,
      set: this.__setX,
      enumerable: true
    });
    this.x = _x;

    /**
    The vertical position relative to `this.parent`.
    
    **Note**: Updating this property will update `this.body.y`, and vice-versa.
    @property y
    @type {Number}
     */
    Object.defineProperty(this, 'y', {
      get: this.__getY,
      set: this.__setY,
      enumerable: true
    });
    this.y = _y;

    /**
    Whether or not this actor
     */
    Object.defineProperty(this, 'physical', {
      get: this.__getPhysical,
      set: this.__setPhysical,
      enumerable: true
    });
    return this.physical = _physical;
  },
  reset: function() {
    if (this.physical && (!this.body._active)) {
      cg.physics.addBody(this.body);
      return this.body.v.zero();
    }
  },
  dispose: function() {
    return cg.physics.removeBody(this.body);
  }
};

module.exports = Physical;


},{"cg":15}],52:[function(require,module,exports){
var Physics, PhysicsManager;

PhysicsManager = require('plugins/physics/PhysicsManager');


/**
A game-wide plugin that provides a [PhysicsManager](cg.physics.PhysicsManager.html) instance to be used by
 [Physical](cg.physics.Physical.html) objects.

@class cg.physics.Physics
 */

Physics = {
  init: function() {

    /**
    Reference to this game's [`cg.physics.PhysicsManager`](cg.physics.PhysicsManager.html) instance.
    
    @property physics
     */
    this.physics = PhysicsManager._instance;
    if ((this.width != null) && (this.height != null)) {
      this.physics.bounds.left = 0;
      this.physics.bounds.right = this.width;
      this.physics.bounds.top = 0;
      return this.physics.bounds.bottom = this.height;
    }
  },
  preUpdate: function() {
    return this.physics.update();
  }
};

module.exports = Physics;


},{"plugins/physics/PhysicsManager":53}],53:[function(require,module,exports){
var AABB, Body, DebugVisuals, Intersection, Module, Physical, PhysicsManager, Shape, Vector2, cg, func, intersection, name, relativeVelocity, _ref,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

Vector2 = require('math/Vector2');

Body = require('plugins/physics/Body');

Intersection = require('plugins/physics/Intersection');

Physical = require('plugins/physics/Physical');

Shape = require('plugins/physics/shapes/Shape');

AABB = require('plugins/physics/shapes/AABB');

DebugVisuals = (function(_super) {
  __extends(DebugVisuals, _super);

  function DebugVisuals(manager) {
    this.manager = manager;
    DebugVisuals.__super__.constructor.call(this, {});
    this.gfx = this.addChild(new cg.gfx.Graphics);
  }

  DebugVisuals.prototype.update = function() {
    var body, _i, _len, _ref;
    this.gfx.clear();
    this.gfx.lineStyle(1, 0x00FF00, 0.8);
    this.gfx.beginFill(0, 0);
    _ref = this.manager.bodies;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      body = _ref[_i];
      this.gfx.drawRect(body.x, body.y, body.width, body.height);
    }
    return this.gfx.endFill();
  };

  return DebugVisuals;

})(cg.Actor);

intersection = new Intersection(null, null, new Vector2, 0);

relativeVelocity = new Vector2;


/**
Manages the updating/collisions of an arbitrary collection of [bodies](cg.physics.Body.html).

@class cg.physics.PhysicsManager
@extends cg.Module
@constructor
 */

PhysicsManager = (function(_super) {
  __extends(PhysicsManager, _super);

  PhysicsManager.prototype.Body = Body;

  PhysicsManager.prototype.Intersection = Intersection;

  PhysicsManager.prototype.PhysicsManager = PhysicsManager;

  PhysicsManager.prototype.Shape = Shape;

  PhysicsManager.prototype.Physical = Physical;

  PhysicsManager._instance = new PhysicsManager;

  PhysicsManager.prototype.intersectFuncs = [];

  PhysicsManager.prototype.collideFuncs = [];

  PhysicsManager.prototype.containsFuncs = [];

  PhysicsManager.prototype.__nextShapeID = 0;

  PhysicsManager.prototype.__shapeIDs = {};

  PhysicsManager.prototype.__shapeNames = [];

  PhysicsManager.prototype.correctionPercent = 0.6;

  PhysicsManager.prototype.correctionSlop = 0.05;

  PhysicsManager.prototype.enableDebugVisuals = function() {
    if (this.__debugVisuals == null) {
      this.__debugVisuals = cg.stage.addChild(new DebugVisuals(this));
    }
    return this.__debugVisuals.resume().show();
  };

  PhysicsManager.prototype.disableDebugVisuals = function() {
    var _ref;
    return (_ref = this.__debugVisuals) != null ? _ref.pause().hide() : void 0;
  };

  PhysicsManager.prototype.toggleDebugVisuals = function() {
    if ((this.__debugVisuals == null) || this.__debugVisuals.paused) {
      return this.enableDebugVisuals();
    } else {
      return this.disableDebugVisuals();
    }
  };


  /**
  Register a new shape type with the manager and retrieve a unique ID for it.
  
  This will make the shape class accessible as `cg.physics.shapes[name]`.
  @method registerPhysicsShape
  @param name {String} A unique identifier for the type of shape you wish to retrieve an ID for.
  @param shapeClass A reference to the shape class being registered.
   */

  PhysicsManager.prototype.registerPhysicsShape = function(name, shapeClass) {
    if (this.__shapeIDs[name] != null) {
      cg.warn("PhysicsManager::registerPhysicsShape: Shape with name " + name + " already exists; NOT overwriting!");
    } else {
      this.__shapeIDs[name] = this.__nextShapeID++;
      this.__shapeNames[this.__shapeIDs[name]] = name;
    }
    if (this.shapes == null) {
      this.shapes = {};
    }
    this.shapes[name] = shapeClass;
    return this.__shapeIDs[name];
  };


  /**
  Retrieve a shape name from a given shape ID (generated with [`registerPhysicsShape`](#method_registerPhysicsShape)).
  
  @method getShapeNameforID
  @param shapeID {Number} The ID to resolve as a shape name.
  @return {String} The name associated with `shapeID`.
   */

  PhysicsManager.prototype.getShapeNameForID = function(shapeID) {
    var _ref;
    return (_ref = this.__shapeNames[shapeID]) != null ? _ref : '__UNKNOWN__';
  };

  PhysicsManager.prototype.registerIntersectHandler = function(shapeA, shapeB, handler) {
    var _base;
    if ((_base = this.intersectFuncs)[shapeA] == null) {
      _base[shapeA] = [];
    }
    if (this.intersectFuncs[shapeA][shapeB] != null) {
      cg.warn("PhysicsManager: Overwriting existing collision handler for '" + (this.getShapeNameForID(shapeA)) + "' vs '" + (this.getShapeNameForID(shapeB)) + "'!");
    }
    return this.intersectFuncs[shapeA][shapeB] = handler;
  };

  PhysicsManager.prototype.registerCollideHandler = function(shapeA, shapeB, handler) {
    var _base;
    if ((_base = this.collideFuncs)[shapeA] == null) {
      _base[shapeA] = [];
    }
    if (this.collideFuncs[shapeA][shapeB] != null) {
      cg.warn("PhysicsManager: Overwriting existing collision handler for '" + (this.getShapeNameForID(shapeA)) + "' vs '" + (this.getShapeNameForID(shapeB)) + "'!");
    }
    return this.collideFuncs[shapeA][shapeB] = handler;
  };

  function PhysicsManager() {
    this.gravity = new Vector2(0, 10);
    this.bounds = {
      left: false,
      right: false,
      top: false,
      bottom: false
    };
    this.bodies = [];
  }


  /**
  Add a body to this manager's list of bodies to update and test collisions for.
  @method addBody
  @param body {cg.physics.Body} The body to add to this manager.
  @return {cg.physics.Body} The body that was added.
   */

  PhysicsManager.prototype.addBody = function(body) {
    this.bodies.push(body);
    body._active = true;
    return body;
  };


  /**
  Remove a body from this manager's list of bodies to update and test collisions for.
  @method removeBody
  @param body {cg.physics.Body} The body to remove from this manager.
  @return {cg.physics.Body} The body that was removed.
   */

  PhysicsManager.prototype.removeBody = function(body) {
    var idx;
    idx = this.bodies.indexOf(body);
    if (idx < 0) {
      return;
    }
    this.bodies.splice(idx, 1);
    body._active = false;
    return body;
  };


  /**
  Update all bodies that were added with [`addBody`](#method_addBody).
  
  Bodies that are associated with paused actors will not be updated.
  
  @method update
   */

  PhysicsManager.prototype.update = function() {
    var body, dts, _i, _len, _ref;
    dts = cg.dt_seconds;
    _ref = this.bodies;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      body = _ref[_i];
      if (!body.actor.worldPaused) {
        body.update(dts);
      }
    }
  };


  /**
  Resolve the appropriate function to compute the intersection between two shape types.
  @method getIntersectionFunctionFor
  @param type1 {Number} The ID of the first shape type.
  @param type2 {Number} The ID of the second shape type.
  @return {Function} The intersection function associated with the two shape types; `null` if no appropriate function exists.
   */

  PhysicsManager.prototype.getIntersectionFunctionFor = function(type1, type2) {
    var intersect, _ref;
    intersect = (_ref = this.intersectFuncs[type1]) != null ? _ref[type2] : void 0;
    if (intersect == null) {
      cg.warn("No intersection test function for '" + (PhysicsManager.getShapeNameForID(this.type)) + "' vs '" + (PhysicsManager.getShapeNameForID(other.type)) + "'!");
      return null;
    }
    return intersect;
  };


  /**
  Resolve the appropriate function to compute the collision between two bodies.
  @method getCollisionFunctionFor
  @param type1 {Number} The ID of the first body's shape type.
  @param type2 {Number} The ID of the second body's shape type.
  @return {Function} The intersection function associated with the two bodies' shape types; `null` if no appropriate function exists.
   */

  PhysicsManager.prototype.getCollisionFunctionFor = function(type1, type2) {
    var collide, _ref;
    collide = (_ref = this.collideFuncs[type1]) != null ? _ref[type2] : void 0;
    if (collide == null) {
      cg.warn("No collision test function for '" + (PhysicsManager.getShapeNameForID(this.type)) + "' vs '" + (PhysicsManager.getShapeNameForID(other.type)) + "'!");
      return null;
    }
    return collide;
  };


  /**
  Determine if two bodies are intersecting, and if they are, compute and apply the appropriate collision response, which should
  lead the bodies to bounce off one another.
  @method collide
  @param a {Shape} The first body.
  @param b {Shape} The second body.
  @return {Boolean} `true` if a collision occured, `false` otherwise.
   */

  PhysicsManager.prototype.collide = function(a, b) {
    var aInvMass, bInvMass, correction, dynFriction, frictionImpulse, impulse, j, jt, mu, restitution, speedAlongNormal, tangent, totInvMass, _base;
    if (a.mass === 0 && b.mass === 0) {
      return false;
    }
    relativeVelocity.zero();
    speedAlongNormal = typeof (_base = this.getCollisionFunctionFor(a.shape.type, b.shape.type)) === "function" ? _base(a, b, intersection, relativeVelocity) : void 0;
    if (!speedAlongNormal) {
      return;
    }
    aInvMass = a.inverseMass;
    bInvMass = b.inverseMass;
    totInvMass = aInvMass + bInvMass;
    if (intersection.penetration > this.correctionSlop) {
      correction = intersection.normal.mul((intersection.penetration / totInvMass) * this.correctionPercent);
      a.x -= aInvMass * correction.x;
      a.y -= aInvMass * correction.y;
      b.x += bInvMass * correction.x;
      b.y += bInvMass * correction.y;
    }
    if (!(speedAlongNormal < 0)) {
      return false;
    }
    restitution = Math.min(a.bounce, b.bounce);
    j = -(1 + restitution) * speedAlongNormal;
    j /= totInvMass;
    impulse = intersection.normal.mul(j);
    a.v.$sub(impulse.mul(aInvMass));
    b.v.$add(impulse.mul(bInvMass));
    tangent = relativeVelocity.sub(intersection.normal.mul(relativeVelocity.dot(intersection.normal)));
    tangent.$norm();
    jt = -relativeVelocity.dot(tangent);
    jt /= totInvMass;
    mu = Math.sqrt(a.sFriction2 + b.sFriction2);
    if (Math.abs(jt) < j * mu) {
      frictionImpulse = tangent.mul(jt);
    } else {
      dynFriction = Math.sqrt(a.dFriction2 + b.dFriction2);
      frictionImpulse = tangent.mul(-1 * j * dynFriction);
    }
    a.v.$sub(frictionImpulse.mul(aInvMass));
    b.v.$add(frictionImpulse.mul(bInvMass));
    return impulse;
  };

  return PhysicsManager;

})(Module);

_ref = PhysicsManager.prototype;
for (name in _ref) {
  if (!__hasProp.call(_ref, name)) continue;
  func = _ref[name];
  if (typeof func !== 'function') {
    continue;
  }
  PhysicsManager[name] = (function(func) {
    return function() {
      return func.apply(this._instance, arguments);
    };
  })(func);
}

AABB.prototype.type = PhysicsManager._instance.registerPhysicsShape('AABB', AABB);

PhysicsManager._instance.registerIntersectHandler(AABB.prototype.type, AABB.prototype.type, AABB.IntersectAABB);

PhysicsManager._instance.registerCollideHandler(AABB.prototype.type, AABB.prototype.type, AABB.CollideAABB);

module.exports = PhysicsManager;


},{"Module":9,"cg":15,"math/Vector2":35,"plugins/physics/Body":49,"plugins/physics/Intersection":50,"plugins/physics/Physical":51,"plugins/physics/shapes/AABB":54,"plugins/physics/shapes/Shape":55}],54:[function(require,module,exports){
var AABB, Shape,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Shape = require('plugins/physics/shapes/Shape');


/**
An axis-aligned (non-rotating) bounding box shape.

@class cg.physics.shapes.AABB
@extends cg.physics.shapes.Shape
@constructor
@param [x=0] The horizontal position of the box.
@param [y=0] The vertical position of the box.
@param [width=10] The horizontal size of the box.
@param [height=10] The vertical size of the box.
 */

AABB = (function(_super) {
  var axes, intersects, normalizeOverX, normalizeOverY;

  __extends(AABB, _super);

  function AABB(x, y, width, height) {
    if (x == null) {
      x = 0;
    }
    if (y == null) {
      y = 0;
    }
    if (width == null) {
      width = 10;
    }
    if (height == null) {
      height = 10;
    }
    this.min = new cg.math.Vector2(x, y);
    this.max = new cg.math.Vector2(x + width, y + height);
  }


  /**
  The horizontal position of the box.
  @property x
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'x', {
    get: function() {
      return this.min.x;
    },
    set: function(val) {
      var w;
      w = this.width;
      this.min.x = val;
      return this.max.x = val + w;
    }
  });


  /**
  The vertical position of the box.
  @property y
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'y', {
    get: function() {
      return this.min.y;
    },
    set: function(val) {
      var h;
      h = this.height;
      this.min.y = val;
      return this.max.y = val + h;
    }
  });


  /**
  The width of the box.
  @property width
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'width', {
    get: function() {
      return this.max.x - this.min.x;
    },
    set: function(val) {
      this.max.x = this.min.x + val;
      return this._areaDirty = true;
    }
  });


  /**
  The height of the box.
  @property height
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'height', {
    get: function() {
      return this.max.y - this.min.y;
    },
    set: function(val) {
      this.max.y = this.min.y + val;
      return this._areaDirty = true;
    }
  });


  /**
  A virtual property representing the left-most point on this shape.
  
  Setting its value will move the shape horizontally so that its left-most point is equal to the value specified.
  @property left
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'left', {
    get: function() {
      return this.min.x;
    },
    set: function(val) {
      var w;
      w = this.width;
      this.min.x = val;
      return this.max.x = val + w;
    }
  });


  /**
  A virtual property representing the right-most point on this shape.
  
  Setting its value will move the shape horizontally so that its right-most point is equal to the value specified.
  @property right
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'right', {
    get: function() {
      return this.max.x;
    },
    set: function(val) {
      var w;
      w = this.width;
      this.max.x = val;
      return this.min.x = val - w;
    }
  });


  /**
  A virtual property representing the top-most point on this shape.
  
  Setting its value will move the shape vertically so that its top-most point is equal to the value specified.
  @property top
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'top', {
    get: function() {
      return this.min.y;
    },
    set: function(val) {
      var h;
      h = this.height;
      this.min.y = val;
      return this.max.y = val + h;
    }
  });


  /**
  A virtual property representing the bottom-most point on this shape.
  
  Setting its value will move the shape vertically so that its bottom-most point is equal to the value specified.
  @property bottom
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'bottom', {
    get: function() {
      return this.max.y;
    },
    set: function(val) {
      var h;
      h = this.height;
      this.max.y = val;
      return this.min.y = val - h;
    }
  });


  /**
  A virtual, **read-only** property representing the total area of this shape.
  
  @property area
  @type Number
   */

  Object.defineProperty(AABB.prototype, 'area', {
    get: function() {
      return this.width * this.height;
    }
  });


  /**
  A virtual, **read-only** representation of the center-point of this shape.
  
  @property center
  @type cg.math.Vector2
   */

  Object.defineProperty(AABB.prototype, 'center', {
    get: function() {
      return new cg.math.Vector2(this.x + this.width / 2, this.y + this.height / 2);
    }
  });

  intersects = function(a, b) {
    return a.bottom >= b.top && a.top <= b.bottom && a.right >= b.left && a.left <= b.right;
  };

  axes = function(a, b) {
    var aToB;
    aToB = b.center.sub(a.center);
    return {
      aToB: aToB,
      dx: (a.width / 2) + (b.width / 2) - Math.abs(aToB.x),
      dy: (a.height / 2) + (b.height / 2) - Math.abs(aToB.y)
    };
  };

  normalizeOverX = function(normal, dist) {
    normal.y = 0;
    normal.x = dist < 0 ? -1 : 1;
  };

  normalizeOverY = function(normal, dist) {
    normal.x = 0;
    normal.y = dist < 0 ? -1 : 1;
  };

  AABB.IntersectAABB = function(a, b, intersection) {
    var aToB, dx, dy, _ref;
    if (intersection == null) {
      return intersects(a, b);
    }
    if (!intersects(a, b)) {
      return false;
    }
    _ref = axes(a, b), aToB = _ref.aToB, dx = _ref.dx, dy = _ref.dy;
    if (dx < dy) {
      intersection.penetration = dx;
      normalizeOverX(intersection.normal, aToB.x);
    } else {
      intersection.penetration = dy;
      normalizeOverY(intersection.normal, aToB.y);
    }
    return true;
  };

  AABB.CollideAABB = function(a, b, intersection, relativeVelocity) {
    var aToB, dx, dy, speedAlongNormal, _ref;
    if (!intersects(a.shape, b.shape, intersection)) {
      return false;
    }
    _ref = axes(a.shape, b.shape), aToB = _ref.aToB, dx = _ref.dx, dy = _ref.dy;
    if (dx < dy) {
      normalizeOverX(intersection.normal, aToB.x);
      speedAlongNormal = relativeVelocity.set(b.v.sub(a.v)).dot(intersection.normal);
      intersection.penetration = dx;
    } else {
      normalizeOverY(intersection.normal, aToB.y);
      speedAlongNormal = relativeVelocity.set(b.v.sub(a.v)).dot(intersection.normal);
      intersection.penetration = dy;
    }
    return speedAlongNormal;
  };

  return AABB;

})(Shape);

module.exports = AABB;


},{"plugins/physics/shapes/Shape":55}],55:[function(require,module,exports){
var Module, Shape,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Module = require('Module');


/**
The abstract base class for all shapes available in Combo's simple physics system.

@class cg.physics.shapes.Shape
 */

Shape = (function(_super) {
  __extends(Shape, _super);

  function Shape() {
    return Shape.__super__.constructor.apply(this, arguments);
  }


  /**
  Check if this shape intersects with another.
  
  @method intersects
  @param other {Shape} the other shape to check for intersection against.
  @param intersection {Intersection} the intersection object to store intersection data in if an intersection occurs.
  @return {Boolean} `true` if the shapes intersect, `false` otherwise.
   */

  Shape.prototype.intersects = function(other, intersection) {
    var intersects;
    intersects = cg.physics.getIntersectionFunctionFor(this.type, other.type);
    if (intersects == null) {
      return false;
    }
    return intersects(this, other, intersection);
  };

  return Shape;

})(Module);

module.exports = Shape;


},{"Module":9}],56:[function(require,module,exports){
var Interactive, cg;

cg = require('cg');


/**
An actor plugin that is used in conjunction with `plugins.ui`
@class plugins.ui.Interactive
 */

Interactive = {
  mixin: {
    __getInteractive: function() {
      return !!this.__interactive;
    },
    __setInteractive: function(val) {
      if (val === !!this.__interactive) {
        return;
      }
      this.__interactive = !!val;
      if (val) {
        return cg.ui.registerActor(this);
      } else {
        return cg.ui.unregisterActor(this);
      }
    }
  },
  init: function() {
    var _interactive;
    _interactive = true;

    /**
    Whether or not this actor is interactive with mouse/touch
    @property interactive
    @type {Boolean}
     */
    Object.defineProperty(this, 'interactive', {
      get: this.__getInteractive,
      set: this.__setInteractive,
      enumerable: true
    });
    return this.interactive = _interactive;
  }
};

module.exports = Interactive;


},{"cg":15}],57:[function(require,module,exports){
var UI, UIManager;

UIManager = require('plugins/ui/UIManager');


/**
A game-wide plugin that provides a [UIManager](cg.ui.UIManager.html) instance to be used by 
 [Interactive](cg.ui.Interactive.html) objects.

@class plugins.ui
 */

UI = {
  init: function() {

    /**
    Reference to this game's [`cg.ui.UIManager`](cg.ui.UIManager.html) instance.
    
    @property ui
     */
    return this.ui = new UIManager();
  },
  preUpdate: function() {
    return this.ui.update();
  }
};

module.exports = UI;


},{"plugins/ui/UIManager":58}],58:[function(require,module,exports){
var HasSignals, Interactive, Module, UIManager, cg, touchDrag, unregister,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

HasSignals = require('util/HasSignals');

Interactive = require('plugins/ui/Interactive');

touchDrag = function(touch) {
  var dx, dy;
  if (!this.__ui_dragStarted) {
    this.__ui_dragStarted = true;

    /**
    Emitted whenever this actor begins being dragged by a touch instance.
    
    @event drag
    @param touch {Touch} The touch instance that is doing the dragging.
     */
    this.emit('dragStart', touch);
  }
  dx = touch.dx, dy = touch.dy;
  if (this.draggable) {
    this.x += dx;
    this.y += dy;
    this.dragging = true;

    /**
    Emitted whenever this actor's position changes from being dragged by a touch instance.
    
    @event drag
    @param touch {Touch} The touch instance that is doing the dragging.
     */
    return this.emit('drag', touch);
  }
};

unregister = function(actor) {
  return cg.ui.unregisterActor(actor);
};


/**
Control the dispatching of touch/mouse events on actors in your game.

**NOTE**: All events listed under this class actually apply to actors added with [`registerActor`](#method_registerActor).

@class plugins.ui.UIManager
@extends cg.Module
 */

UIManager = (function(_super) {
  __extends(UIManager, _super);

  UIManager.mixin(HasSignals);

  UIManager.prototype.UIManager = UIManager;

  UIManager.prototype.Interactive = Interactive;

  function UIManager() {
    this.__actors = [];
    this.on(cg.input, 'touchDown', function(touch) {
      var actor, hoveredObject, mouseOver, released, stopDragging, touchX, touchY, _i, _len, _ref;
      stopDragging = function() {
        this.dragging = false;
        this.off(touch, 'drag', touchDrag);
        if (this.__ui_dragStarted) {
          this.__ui_dragStarted = false;

          /**
          Emitted whenever this actor stops being dragged by a touch instance.
          
          @event dragStop
          @param touch {Touch} The touch instance that was doing the dragging.
           */
          return this.emit('dragStop', touch);
        }
      };
      released = function() {

        /**
        Emitted whenever a touch that started inside an actor is released.
        
        @event touchUp
        @param touch {Touch} The touch instance that was released.
         */
        this.emit('touchUp', touch);
        if (!this.hitTest(touch.x, touch.y)) {

          /**
          Emitted whenever a touch that *started* inside an actor is released *outside* the actor.
          
          @event touchUpOutside
          @param touch {Touch} The touch instance that was released.
           */
          return this.emit('touchUpOutside', touch);
        } else {

          /**
          Emitted whenever a touch that started inside an actor is released inside the actor.
          
          @event touchUpInside
          @param touch {Touch} The touch instance that was released.
           */
          this.emit('touchUpInside', touch);

          /**
          Emitted whenever a touch that started inside an actor is released inside the actor.
          
          @event tap
          @param touch {Touch} The touch instance that was released.
           */
          return this.emit('tap', touch);
        }
      };
      mouseOver = function() {
        return this.emit('mouseOver');
      };
      touchX = touch.x;
      touchY = touch.y;
      hoveredObject = null;
      _ref = this.__actors;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        actor = _ref[_i];
        if (!(actor.worldVisible && (!(hoveredObject != null ? hoveredObject.isAbove(actor) : void 0)) && actor.hitTest(touchX, touchY))) {
          continue;
        }
        hoveredObject = actor;
      }
      if (hoveredObject == null) {
        return;
      }

      /**
      Emitted whenever a touch starts inside an actor.
      
      @event touchDown
      @param touch {Touch} The touch instance that just started.
       */
      hoveredObject.emit('touchDown', touch);
      hoveredObject.once(touch, 'release', released);
      if (hoveredObject.draggable) {
        hoveredObject.on(touch, 'drag', touchDrag);
        return hoveredObject.once(touch, 'release', stopDragging);
      }
    });
    this.on(cg.input, 'touchDrag', function(touch) {
      var actor, hoveredObject, touchX, touchY, _i, _len, _ref;
      touchX = touch.x;
      touchY = touch.y;
      hoveredObject = null;
      _ref = this.__actors;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        actor = _ref[_i];
        if (!(actor.worldVisible && (!(hoveredObject != null ? hoveredObject.isAbove(actor) : void 0)) && actor.hitTest(touchX, touchY))) {
          continue;
        }
        hoveredObject = actor;
      }
      if (hoveredObject == null) {
        return;
      }

      /**
      Emitted whenever a dragging touch goes over an actor.
      
      @event dragOver
      @param touch {Touch} The touch instance that is dragging.
       */
      return hoveredObject.emit('dragOver', touch);
    });
    this.on(cg.input, 'mouseMove', function(mouse) {
      var actor, hoveredObject, mouseX, mouseY, _i, _len, _ref;
      hoveredObject = null;
      mouseX = mouse.x;
      mouseY = mouse.y;
      _ref = this.__actors;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        actor = _ref[_i];
        if (actor.worldVisible && (!(hoveredObject != null ? hoveredObject.isAbove(actor) : void 0)) && actor.hitTest(mouseX, mouseY)) {
          if (hoveredObject != null ? hoveredObject.__ui_mouseOver : void 0) {
            hoveredObject.__ui_mouseOver = false;

            /**
            Emitted whenever the mouse leaves the area of an actor.
            
            @event mouseOut
            @param mouse {Touch} The mouse that is no longer hovering over the actor.
             */
            hoveredObject.emit('mouseOut', mouse);
          }
          hoveredObject = actor;
        } else if (actor.__ui_mouseOver) {
          actor.__ui_mouseOver = false;
          actor.emit('mouseOut', mouse);
        }
      }
      if (hoveredObject == null) {
        return;
      }
      mouse.__ui_hoveredObject = hoveredObject;
      if (!hoveredObject.__ui_mouseOver) {
        hoveredObject.__ui_mouseOver = true;

        /**
        Emitted whenever the mouse enters the area of an actor.
        
        @event mouseOver
        @param mouse {Touch} The mouse that is now hovering over the actor.
         */
        hoveredObject.emit('mouseOver', mouse);
      }
      return hoveredObject.emit('mouseMove', mouse);
    });
  }

  UIManager.prototype.update = function() {
    return cg.input.emit('mouseMove', cg.input.mouse);
  };


  /**
  Enable UI events for a specified actor.
  
  @method registerActor
  @param actor {Actor} The actor to enable UI events for.
   */

  UIManager.prototype.registerActor = function(actor) {
    if (actor.__ui_registered) {
      return;
    }
    this.__actors.push(actor);
    actor.__ui_registered = true;
    return this.once(actor, '__destroy__', unregister);
  };


  /**
  Disable UI events for a specified actor.
  
  @method registerActor
  @param actor {Actor} The actor to disable UI events for.
   */

  UIManager.prototype.unregisterActor = function(actor) {
    var idx;
    this.off(actor, '__destroy__', unregister);
    if (!actor.__ui_registered) {
      return;
    }
    idx = this.__actors.indexOf(actor);
    if (idx < 0) {
      return;
    }
    this.__actors.splice(idx, 1);
    return delete actor.__ui_registered;
  };

  return UIManager;

})(Module);

module.exports = UIManager;


},{"Module":9,"cg":15,"plugins/ui/Interactive":56,"util/HasSignals":72}],59:[function(require,module,exports){
var Music, Sound, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Sound = require('sound/Sound');


/**
A long sound that typically will only play one at a time.

Ideal for -- you guessed it -- background music.

@class cg.sound.Music
@extends cg.Module
@constructor
@param paths {String|Array<String>} A path or list of paths to attempt to load.
@param [volume=0.8] {Number} Value between 0 and 1 representing how loudly the music should play.
 */

Music = (function(_super) {
  __extends(Music, _super);

  function Music() {
    return Music.__super__.constructor.apply(this, arguments);
  }

  return Music;

})(Sound);

module.exports = Music;


},{"cg":15,"sound/Sound":60}],60:[function(require,module,exports){
var Module, Sound, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');


/**
A (relatively) short sound that is capable of being played multiple times simultaneously; a sound effect.

@class cg.sound.Sound
@extends cg.Module
@constructor
@param paths {String|Array<String>} A path or list of paths to attempt to load.
@param [volume=0.8] {Number} Value between 0 and 1 representing how loudly the sound should play.
@param [numChannels=4] {Number} Sets the value of [`numChannels`](#property_numChannels))
 */

Sound = (function(_super) {
  __extends(Sound, _super);

  Sound.prototype.__setupBindings = function() {
    this.onSfxVolumeChangeBinding = this.manager.on('sfxVolumeChange', (function(_this) {
      return function() {
        return _this._setVolume(_this._getVolume());
      };
    })(this));
    this.onSfxStopBinding = this.manager.on('sfxStop', (function(_this) {
      return function() {
        return _this.stop();
      };
    })(this));
    this.onSfxStopBinding = this.manager.on('sfxPause', (function(_this) {
      return function() {
        return _this.pause();
      };
    })(this));
    return this.onSfxStopBinding = this.manager.on('sfxResume', (function(_this) {
      return function() {
        return _this.resume();
      };
    })(this));
  };

  function Sound(paths, volume, numChannels, manager) {
    var format, path;
    this.paths = paths;
    if (numChannels == null) {
      numChannels = cg.sound.defaultSfxChannelCount;
    }
    this.manager = manager != null ? manager : cg.sound;
    if ((typeof this.paths) === 'string') {
      if (this.paths.length > 0 && (this.paths[this.paths.length - 1] === '*')) {
        path = this.paths.substr(0, this.paths.length - 1);
        this.paths = (function() {
          var _i, _len, _ref, _results;
          _ref = cg.sound.formats;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            format = _ref[_i];
            _results.push(path + format);
          }
          return _results;
        })();
      } else {
        this.paths = [this.paths];
      }
    }
    this.volume = volume;
    this.__setupBindings();

    /**
    The number of instances of this sound that may be played simultaneously. Originally set in the constructor; cannot be altered.
    @property numChannels
    @type Number
    @final
     */
    Object.defineProperty(this, 'numChannels', {
      value: numChannels
    });
  }


  /**
  Value between 0 and 1 representing how loudly the sound is playing/will play.
  @property volume
  @type Number
   */

  Object.defineProperty(Sound.prototype, 'volume', {
    get: function() {
      return this._getVolume();
    },
    set: function(val) {
      return this._setVolume(val);
    }
  });


  /**
  `true` if the sound will repeat indefinitely while playing, `false` otherwise.
  
  @property looping
  @type Boolean
   */

  Object.defineProperty(Sound.prototype, 'looping', {
    get: function() {
      return this._getLooping();
    },
    set: function(val) {
      return this._setLooping(val);
    }
  });


  /**
  Specify the current volume of the sound.
  
  @protected
  @method _setVolume
  @param volume {Number} Value between 0 and 1 representing how loudly to play the sound.
  @chainable
   */

  Sound.prototype._setVolume = function(__volume) {
    this.__volume = __volume;
    return this;
  };


  /**
  Retrieve the current volume of the sound.
  
  @protected
  @method _getVolume
  @return {Number} Value between 0 and 1 representing how loudly the sound is playing/will play.
   */

  Sound.prototype._getVolume = function() {
    return this.__volume;
  };


  /**
  Specify whether this should repeat after it finishes playing.
  
  @protected
  @method _setLooping
  @param looping {Boolean} `true` if you wish for the sound to repeat indefinitely while playing, `false` otherwise.
  @chainable
   */

  Sound.prototype._setLooping = function(__looping) {
    this.__looping = __looping;
    return this;
  };


  /**
  Retrieve whether this should repeat after it finishes playing.
  
  @protected
  @method _getLooping
  @return {Boolean} `true` if the sound will repeat indefinitely while playing, `false` otherwise.
   */

  Sound.prototype._getLooping = function() {
    return this.__looping;
  };


  /**
  Calculate the final volume the sound will be played at; this is the same as multiplying
  this sound's volume (or the parameter passed in) by its manager's [`sfxVolume`](cg.sound.SoundManager.html#property_sfxVolume)
  
  @method getEffectiveVolume
  @param [volume=this.volume] {Number} Value between 0 and 1 representing how loudly to play the sound.
   */

  Sound.prototype.getEffectiveVolume = function(volume) {
    if (volume == null) {
      volume = this.__volume;
    }
    return cg.math.clamp(this.manager.sfxVolume * volume, 0, 1);
  };


  /**
  Attempt to load this sound from the specified [`paths`](#property_paths).
  
  @method load
  @return {Promise} A promise that resolves once loading finishes, and rejects if the loading fails.
   */

  Sound.prototype.load = function() {};

  Sound.prototype._play = function() {
    throw new Error('Unimplemented version of Sound::_play!');
  };

  Sound.prototype._pause = function() {
    throw new Error('Unimplemented version of Sound::_pause!');
  };

  Sound.prototype._resume = function() {
    throw new Error('Unimplemented version of Sound::_resume!');
  };

  Sound.prototype._stop = function() {
    throw new Error('Unimplemented version of Sound::_stop!');
  };


  /**
  The channel number that was used the last time [`play`](#method_play) or [`loop`](#method_loop) was invoked.
  
  @property channel
  @type Number
   */

  Object.defineProperty(Sound.prototype, 'channel', {
    get: function() {
      return this.__channel;
    }
  });


  /**
  Play the sound.
  
  If all channels are busy, the least-recently-active channel will be interrupted, otherwise
  the first available is used.
  
  **NOTE:** Unlike [`Music::play`](cg.sound.Music.html#method_play), if `Sound::play` is called before a `Sound` is loaded, it will simply
  fail to play, and print a warning.
  
  @method play
  @param [volume=[`this.volume`](#property_volume)] {Number} Value between 0 and 1 representing how loudly to play the sound.
  @param [looping] {Boolean} `true` if you wish for the sound to repeat indefinitely while playing, `false` otherwise.
  @chainable
   */

  Sound.prototype.play = function(volume, looping) {
    if (volume == null) {
      volume = this.volume;
    }
    if (looping == null) {
      looping = this.looping;
    }
    this.__playing = true;
    this.volume = volume;
    this.looping = looping;
    this.__channel = this._play(volume, looping);
    return this;
  };

  Sound.prototype.pause = function() {
    this._pause();
    return this;
  };

  Sound.prototype.resume = function() {
    this._resume();
    return this;
  };


  /**
  Convenience method; like calling [`play`](#method_play) with the `looping` parameter set to true.
  @method loop
  @param [volume] {Number} Value between 0 and 1 representing how loudly to play the sound.
  @chainable
   */

  Sound.prototype.loop = function(volume) {
    if (volume == null) {
      volume = this.volume;
    }
    this.play(volume, true);
    return this;
  };


  /**
  Stop playback of this sound.
  
  @method stop
  @param [channel] {Number}
  The channel number to stop; if unspecified, playback on all channels will be stopped.
  @chainable
   */

  Sound.prototype.stop = function(channel) {
    this.cancelFade();
    this.__playing = false;
    this._stop(channel);
    return this;
  };


  /**
  Slide the volume (of all channels) to a specified level.
  
  @method fadeTo
  @param level {Number} The value to slide [`volume`](#property_volume) to.
  @param [duration=2000] {Number(milliseconds)} The length of time the slide will take.
  @param [easeFunc='quad.in'|'quad.out'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`volume`](#property_volume)
  
  By default, if `level` is greater than [`volume`](#property_volume), 'quaratic.in' is used,
  otherwise 'quad.out' is used.
  @return {Promise} A promise that resolves as soon as the slide completes.
   */

  Sound.prototype.fadeTo = function(level, duration, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (!this.__playing) {
      this.play();
    }
    if (easeFunc == null) {
      easeFunc = level > this.volume ? 'quad.in' : 'quad.out';
    }
    this.cancelFade();
    return this.__fade = cg.tween(this, {
      values: {
        volume: level
      },
      duration: duration,
      easeFunc: easeFunc
    });
  };


  /**
  Slide the volume level (of all channels) down to a given level.
  
  If the `level` argument is zero, playback will automatically stop once the slide completes.
  
  @method fadeOut
  @param [duration=2000] {Number(milliseconds)} The length of time it should take to fade out before stopping.
  @param [level=0] {Number} The value to slide [`volume`](#property_volume) down to from its current level.
  @param [easeFunc='quad.out'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`volume`](#property_volume)
  @return {Promise} A promise that resolves as soon as the slide completes.
   */

  Sound.prototype.fadeOut = function(duration, level, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (level == null) {
      level = 0;
    }
    if (easeFunc == null) {
      easeFunc = 'quad.out';
    }
    this.cancelFade();
    this.__fade = cg.tween(this, {
      values: {
        volume: level
      },
      duration: duration,
      easeFunc: easeFunc
    });
    return this.__fade.then((function(_this) {
      return function() {
        if (_this.volume === 0) {
          return _this.stop();
        }
      };
    })(this));
  };


  /**
  Slide the volume level (of all channels) up to a given level.
  
  @method fadeIn
  @param [duration=2000] {Number(milliseconds)} The length of time it should take to fade out before stopping.
  @param [level=0.8] {Number} The value to slide [`volume`](#property_volume) up to from zero.
  @param [easeFunc='quad.in'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`volume`](#property_volume)
  @return {Promise} A promise that resolves as soon as the fade in completes.
   */

  Sound.prototype.fadeIn = function(duration, level, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (level == null) {
      level = 0.8;
    }
    if (easeFunc == null) {
      easeFunc = 'quad.in';
    }
    this.cancelFade();
    return this.__fade = cg.tween(this, {
      values: {
        volume: level
      },
      duration: duration,
      easeFunc: easeFunc
    });
  };


  /**
  Cancel the active fade, if any. [`volume`](#property_volume) will *not* be reset to what it was
  prior to the fade.
  
  @method cancelFade
  @chainable
   */

  Sound.prototype.cancelFade = function() {
    var _ref;
    if ((_ref = this.__fade) != null) {
      _ref.stop();
    }
    return this;
  };

  return Sound;

})(Module);

module.exports = Sound;


},{"Module":9,"cg":15}],61:[function(require,module,exports){
var HasSignals, Module, SoundManager, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Module = require('Module');

HasSignals = require('util/HasSignals');


/**
Control playback of all music and sound effects.

@class cg.sound.SoundManager
@extends cg.Module
 */

SoundManager = (function(_super) {
  __extends(SoundManager, _super);

  SoundManager.mixin(HasSignals);

  SoundManager.prototype.formats = ['ogg', 'mp3', 'm4a', 'wav'];

  function SoundManager() {
    this.defaultSfxChannelCount = 4;
    this.sfxVolume = 1;
    this.musicVolume = 1;
  }


  /**
  Emitted whenever [`musicVolume`](#property_musicVolume) changes.
  
  @event musicVolumeChange
  @param level {Number} The new value of `musicVolume`
   */


  /**
  Volume multiplier applied to all music playback.
  
  @property musicVolume
  @type Number
  @default 1.0
   */

  Object.defineProperty(SoundManager.prototype, 'musicVolume', {
    get: function() {
      return this._musicVolume;
    },
    set: function(level) {
      this._musicVolume = level;
      return this.emit('musicVolumeChange', level);
    }
  });


  /**
  Emitted whenever [`sfxVolume`](#property_sfxVolume) changes.
  
  @event sfxVolumeChange
  @param level {Number} The new value of `sfxVolume`
   */


  /**
  Volume multiplier applied to all sound effect playback.
  
  @property sfxVolume
  @type Number
  @default 1.0
   */

  Object.defineProperty(SoundManager.prototype, 'sfxVolume', {
    get: function() {
      return this._sfxVolume;
    },
    set: function(level) {
      this._sfxVolume = level;
      return this.emit('sfxVolumeChange', level);
    }
  });


  /**
  Pause playback of all music.
  
  @method pauseAllMusic
  @chainable
   */

  SoundManager.prototype.pauseAllMusic = function() {
    this.emit('musicPause', this);
    return this;
  };


  /**
  Pause playback of all sound effects.
  
  @method pauseAllSfx
  @chainable
   */

  SoundManager.prototype.pauseAllSfx = function() {
    this.emit('sfxPause', this);
    return this;
  };


  /**
  Pause playback of all music and sound effects.
  
  @method pauseAll
  @chainable
   */

  SoundManager.prototype.pauseAll = function() {
    this.pauseAllSfx();
    this.pauseAllMusic();
    return this;
  };


  /**
  Resume playback of all music.
  
  @method resumeAllMusic
  @chainable
   */

  SoundManager.prototype.resumeAllMusic = function() {
    this.emit('musicResume', this);
    return this;
  };


  /**
  Resume playback of all sound effects.
  
  @method resumeAllSfx
  @chainable
   */

  SoundManager.prototype.resumeAllSfx = function() {
    this.emit('sfxResume', this);
    return this;
  };


  /**
  Resume playback of all music and sound effects.
  
  @method resumeAll
  @chainable
   */

  SoundManager.prototype.resumeAll = function() {
    this.resumeAllSfx();
    this.resumeAllMusic();
    return this;
  };


  /**
  Stop playback of all music.
  
  @method stopAllMusic
  @chainable
   */

  SoundManager.prototype.stopAllMusic = function() {
    this.emit('musicStop', this);
    return this;
  };


  /**
  Stop playback of all sound effects.
  
  @method stopAllSfx
  @chainable
   */

  SoundManager.prototype.stopAllSfx = function() {
    this.emit('sfxStop', this);
    return this;
  };


  /**
  Stop playback of all music and sound effects.
  
  @method stopAll
  @chainable
   */

  SoundManager.prototype.stopAll = function() {
    this.stopAllSfx();
    this.stopAllMusic();
    return this;
  };


  /**
  Slide [`sfxVolume`](#property_sfxVolume) to a specified level.
  
  @method fadeSfxTo
  @param level {Number} The value to slide [`sfxVolume`](#property_sfxVolume) to.
  @param [duration=2000] {Number(milliseconds)} The length of time the slide will take.
  @param [easeFunc='quad.in'|'quad.out'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`sfxVolume`](#property_sfxVolume)
  
  By default, if `level` is greater than [`sfxVolume`](#property_sfxVolume), 'quad.in' is used,
  otherwise 'quad.out' is used.
  @return {Promise} A promise that resolves as soon as the slide completes.
   */

  SoundManager.prototype.fadeSfxTo = function(level, duration, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (easeFunc == null) {
      easeFunc = level > this.sfxVolume ? 'quad.in' : 'quad.out';
    }
    return cg.tween(this, {
      values: {
        sfxVolume: level
      },
      duration: duration,
      easeFunc: easeFunc
    });
  };


  /**
  Slide the [`sfxVolume`](#property_sfxVolume) level down to a given level.
  
  If the `level` argument is zero, all sound effects playing will be stopped.
  
  @method fadeSfxOut
  @param [duration=2000] {Number(milliseconds)} The length of time it should take to fade out before stopping.
  @param [level=0] {Number} The value to slide [`sfxVolume`](#property_sfxVolume) down to from its current level.
  @param [easeFunc='quad.out'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`sfxVolume`](#property_volume)
  @return {Promise} A promise that resolves as soon as the slide completes.
   */

  SoundManager.prototype.fadeSfxOut = function(duration, level, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (level == null) {
      level = 0;
    }
    if (easeFunc == null) {
      easeFunc = 'quad.out';
    }
    return cg.tween(this, {
      values: {
        sfxVolume: level
      },
      duration: duration,
      easeFunc: easeFunc
    }).then((function(_this) {
      return function() {
        if (_this.sfxVolume === 0) {
          return _this.stopAllSfx();
        }
      };
    })(this));
  };


  /**
  Set [`sfxVolume`](#property_sfxVolume) to zero then slide it up to a given level.
  
  @method fadeSfxIn
  @param [duration=2000] {Number(milliseconds)} The length of time it should take to fade out before stopping.
  @param [level=0.8] {Number} The value to slide [`sfxVolume`](#property_sfxVolume) up to from zero.
  @param [easeFunc='quad.in'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`sfxVolume`](#property_sfxVolume)
  @return {Promise} A promise that resolves as soon as the fade in completes.
   */

  SoundManager.prototype.fadeSfxIn = function(duration, level, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (level == null) {
      level = 0.8;
    }
    if (easeFunc == null) {
      easeFunc = 'quad.in';
    }
    this.sfxVolume = 0;
    return cg.tween(this, {
      values: {
        volume: level
      },
      duration: duration,
      easeFunc: easeFunc
    });
  };


  /**
  Slide [`musicVolume`](#property_musicVolume) to a specified level.
  
  @method fadeMusicTo
  @param level {Number} The value to slide [`musicVolume`](#property_musicVolume) to.
  @param [duration=2000] {Number(milliseconds)} The length of time the slide will take.
  @param [easeFunc='quad.in'|'quad.out'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`musicVolume`](#property_musicVolume)
  
  By default, if `level` is greater than [`musicVolume`](#property_musicVolume), 'quad.in' is used,
  otherwise 'quad.out' is used.
  @return {Promise} A promise that resolves as soon as the slide completes.
   */

  SoundManager.prototype.fadeMusicTo = function(level, duration, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (easeFunc == null) {
      easeFunc = level > this.musicVolume ? 'quad.in' : 'quad.out';
    }
    return cg.tween(this, {
      values: {
        musicVolume: level
      },
      duration: duration,
      easeFunc: easeFunc
    });
  };


  /**
  Slide [`musicVolume`](#property_musicVolume) level down to a given level.
  
  If the `level` argument is zero, all sound effects playing will be stopped.
  
  @method fadeMusicOut
  @param [duration=2000] {Number(milliseconds)} The length of time it should take to fade out before stopping.
  @param [level=0] {Number} The value to slide [`musicVolume`](#property_musicVolume) down to from its current level.
  @param [easeFunc='quad.out'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`musicVolume`](#property_volume)
  @return {Promise} A promise that resolves as soon as the slide completes.
   */

  SoundManager.prototype.fadeMusicOut = function(duration, level, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (level == null) {
      level = 0;
    }
    if (easeFunc == null) {
      easeFunc = 'quad.out';
    }
    return cg.tween(this, {
      values: {
        musicVolume: level
      },
      duration: duration,
      easeFunc: easeFunc
    }).then((function(_this) {
      return function() {
        if (_this.musicVolume === 0) {
          return _this.stopAllSfx();
        }
      };
    })(this));
  };


  /**
  Set [`musicVolume`](#property_musicVolume) to zero then slide it up to a given level.
  
  @method fadeMusicIn
  @param [duration=2000] {Number(milliseconds)} The length of time it should take to fade out before stopping.
  @param [level=0.8] {Number} The value to slide [`musicVolume`](#property_musicVolume) up to from zero.
  @param [easeFunc='quad.in'] {String|Function} The ease function to use with
  the [`Tween`](cg.Tween.html) that alters [`musicVolume`](#property_musicVolume)
  @return {Promise} A promise that resolves as soon as the fade in completes.
   */

  SoundManager.prototype.fadeMusicIn = function(duration, level, easeFunc) {
    if (duration == null) {
      duration = 2000;
    }
    if (level == null) {
      level = 0.8;
    }
    if (easeFunc == null) {
      easeFunc = 'quad.in';
    }
    this.musicVolume = 0;
    return cg.tween(this, {
      values: {
        musicVolume: level
      },
      duration: duration,
      easeFunc: easeFunc
    });
  };

  return SoundManager;

})(Module);

module.exports = SoundManager;


},{"Module":9,"cg":15,"util/HasSignals":72}],62:[function(require,module,exports){
var BitmapFont, cg;

cg = require('cg');


/**
**NOTE**: This API is expected to change dramatically or even be replaced; use at your own risk!
@class cg.text.BitmapFont
 */

BitmapFont = (function() {
  function BitmapFont(texture, spacing, lineHeight, startChar) {
    var alpha, char, charHeight, charWidth, pixel, texHeight, texWidth, x, y;
    this.texture = texture;
    this.spacing = spacing != null ? spacing : 1.0;
    this.lineHeight = lineHeight != null ? lineHeight : 1.0;
    if (startChar == null) {
      startChar = ' ';
    }
    if (typeof this.texture === 'string') {
      this.texture = cg.assets.textures[this.texture];
    }
    texWidth = this.texture.width;
    texHeight = this.texture.height;
    this.textures = {};
    x = 0;
    y = texHeight - 1;
    char = startChar;
    charWidth = 0;
    this.charHeight = charHeight = texHeight - 1;
    this.texture.beginRead();
    while (x < texWidth) {
      pixel = this.texture.getPixel(x, y);
      alpha = pixel != null ? pixel.a : void 0;
      pixel.a = 0;
      this.texture.setPixel(x, y, pixel);
      if (alpha == null) {
        throw new Error('Unexpected issue loading BitmapFont; could not retrieve pixel at (' + x + ', ' + y + ')');
      }
      ++charWidth;
      ++x;
      if (alpha <= 0) {
        this.textures[char] = new cg.gfx.Texture(this.texture.baseTexture, new cg.gfx.Rectangle(x - charWidth, 0, charWidth, charHeight));
        charWidth = 0;
        char = String.fromCharCode(char.charCodeAt(0) + 1);
      }
    }
    this.texture.endRead();
  }

  BitmapFont.prototype.widthOf = function(str, spacing) {
    var ch, i, width, _ref, _ref1;
    if (spacing == null) {
      spacing = this.spacing;
    }
    width = 0;
    i = 0;
    while (i < str.length) {
      ch = str[i];
      width += (((_ref = this.textures[ch]) != null ? (_ref1 = _ref.frame) != null ? _ref1.width : void 0 : void 0) || 0) * spacing;
      ++i;
    }
    return width;
  };

  return BitmapFont;

})();

module.exports = BitmapFont;


},{"cg":15}],63:[function(require,module,exports){

/*
combo.js - Copyright 2012-2013 Louis Acresti - All Rights Reserved
 */
var Actor, BitmapFont, BitmapText, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

BitmapFont = require('text/BitmapFont');

Actor = require('Actor');


/**
**NOTE**: This API is expected to change dramatically or even be replaced; use at your own risk!

@class cg.text.BitmapText
@extends cg.Actor
 */

BitmapText = (function(_super) {
  __extends(BitmapText, _super);

  function BitmapText(font, string, params) {
    this.font = font;
    this.string = string != null ? string : '';
    BitmapText.__super__.constructor.call(this, params);
    if (this.lineHeight == null) {
      this.lineHeight = this.font.lineHeight;
    }
    if (this.spacing == null) {
      this.spacing = this.font.spacing;
    }
    this.width = 0;
    this.height = 0;
    this.updateText();
  }

  BitmapText.prototype.updateText = function() {
    var ch, charSprite, i, left, lines, str, th, top, tw, width, widths, _i, _j, _len, _len1, _results;
    if (this.children.length > 0) {
      this.removeChildren();
    }
    th = this.font.charHeight * this.lineHeight;
    lines = this.string.split('\n');
    this.height = th * lines.length;
    widths = [];
    for (_i = 0, _len = lines.length; _i < _len; _i++) {
      str = lines[_i];
      width = this.font.widthOf(str, this.spacing);
      this.width = Math.max(this.width, width);
      widths.push(width);
    }
    switch (this.alignment) {
      case 'center':
        this.pivotX = this.width / 2;
        this.pivotY = this.height / 2;
        break;
      case 'left':
        this.pivotX = 0;
        this.pivotY = 0;
        break;
      case 'right':
        this.pivotX = this.width;
        this.pivotY = 0;
    }
    top = 0;
    _results = [];
    for (i = _j = 0, _len1 = lines.length; _j < _len1; i = ++_j) {
      str = lines[i];
      width = widths[i];
      if (this.alignment === 'center') {
        left = (this.width - width) / 2;
      } else {
        left = 0;
      }
      i = 0;
      while (i < str.length) {
        ch = str[i];
        tw = this.font.widthOf(ch);
        if (tw > 0) {
          charSprite = this.addChild(new cg.gfx.Sprite(this.font.textures[ch]));
          charSprite.x = left;
          charSprite.y = top;
        }
        left += tw * this.spacing;
        ++i;
      }
      _results.push(top += th);
    }
    return _results;
  };

  return BitmapText;

})(Actor);

module.exports = BitmapText;


},{"Actor":4,"cg":15,"text/BitmapFont":62}],64:[function(require,module,exports){
var BitmapFont, BitmapText, cg;

cg = require('cg');

BitmapFont = require('text/BitmapFont');

BitmapText = require('text/BitmapText');

module.exports = {
  PixiText: cg.gfx.Text,
  BitmapFont: BitmapFont,
  BitmapText: BitmapText
};


},{"cg":15,"text/BitmapFont":62,"text/BitmapText":63}],65:[function(require,module,exports){

/*
combo.js - Copyright 2012-2013 Louis Acresti - All Rights Reserved
 */
var BitwiseTileMap, NEIGHBOR, TileMap, TileSheet,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

TileSheet = require('TileSheet');

TileMap = require('tile/TileMap');

NEIGHBOR = {
  TOP: 1,
  RIGHT: 2,
  BOTTOM: 4,
  LEFT: 8
};


/**
A special [`TileMap`](cg.tile.TileMap.html) that automatically chooses appropriate tile images based on the tiles around it.

The sheet that gets used with this must follow the rules outlined here:
http://www.saltgames.com/2010/a-bitwise-method-for-applying-tilemaps/

@class cg.tile.BitwiseTileMap
@extends cg.tile.TileMap
 */

BitwiseTileMap = (function(_super) {
  __extends(BitwiseTileMap, _super);

  function BitwiseTileMap() {
    BitwiseTileMap.__super__.constructor.apply(this, arguments);
    this._bitwiseMap = new Array(this.mapWidth * this.mapHeight, 0);
  }

  BitwiseTileMap.prototype._totFor = function(x, y) {
    var bottom, left, right, top, tot;
    if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight || (!this._bitwiseMap[y * this.mapWidth + x])) {
      return -1;
    }
    if (y > 0) {
      top = this._bitwiseMap[(y - 1) * this.mapWidth + x];
    }
    if (x < this.mapWidth - 1) {
      right = this._bitwiseMap[y * this.mapWidth + x + 1];
    }
    if (y < this.mapHeight - 1) {
      bottom = this._bitwiseMap[(y + 1) * this.mapWidth + x];
    }
    if (x > 0) {
      left = this._bitwiseMap[y * this.mapWidth + x - 1];
    }
    tot = 0;
    if (top) {
      tot += NEIGHBOR.TOP;
    }
    if (right) {
      tot += NEIGHBOR.RIGHT;
    }
    if (bottom) {
      tot += NEIGHBOR.BOTTOM;
    }
    if (left) {
      tot += NEIGHBOR.LEFT;
    }
    return tot;
  };


  /**
  Build a 2D array representing the current map.
  
  @method getMapData
  @return {2D Array of Booleans} A 2D array containing booleans; `true` values are solid tiles, others are not solid.
   */

  BitwiseTileMap.prototype.getMapData = function() {
    var col, data, x, y;
    data = new Array(this.mapWidth);
    x = 0;
    while (x < this.mapWidth) {
      col = new Array(this.mapHeight);
      y = 0;
      while (y < this.mapHeight) {
        col[y] = this._bitwiseMap[y * this.mapWidth + x] ? 1 : 0;
        ++y;
      }
      data[x] = col;
      ++x;
    }
    return data;
  };


  /**
  Mark the tile at a specified coordinate as "solid".
  
  A "solid" tile is just the opposite of an empty space.
  
  @method setSolid
  @param x {Number} The x coordinate into the tile map.
  @param y {Number} The y coordinate into the tile map.
  @param solid {Boolean} `true` if you want the tile to be solid.
   */

  BitwiseTileMap.prototype.setSolid = function(x, y, solid) {
    if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight) {
      return;
    }
    if (!!solid === !!this._bitwiseMap[y * this.mapWidth + x]) {
      return;
    }
    this._bitwiseMap[y * this.mapWidth + x] = solid;
    if (y > 0) {
      this.set(x, y - 1, this._totFor(x, y - 1));
    }
    if (x < this.mapWidth - 1) {
      this.set(x + 1, y, this._totFor(x + 1, y));
    }
    if (y < this.mapHeight - 1) {
      this.set(x, y + 1, this._totFor(x, y + 1));
    }
    if (x > 0) {
      this.set(x - 1, y, this._totFor(x - 1, y));
    }
    return this.set(x, y, this._totFor(x, y));
  };

  return BitwiseTileMap;

})(TileMap);

module.exports = BitwiseTileMap;


},{"TileSheet":12,"tile/TileMap":67}],66:[function(require,module,exports){
var Bottom, EPSILON, HasHotspots, Hotspot, Left, Right, Top, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

EPSILON = 0.001;


/**
TODOC

@class cg.tile.HasHotspots
 */

HasHotspots = (function() {
  function HasHotspots() {}

  HasHotspots.prototype.init = function() {
    this.grounded = false;
    return this.hotspots = {};
  };

  HasHotspots.prototype.update = function(dt) {
    var dist, hs, k, map, _i, _len, _ref, _ref1;
    _ref = this.collisionMaps;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      map = _ref[_i];
      _ref1 = this.hotspots;
      for (k in _ref1) {
        if (!__hasProp.call(_ref1, k)) continue;
        hs = _ref1[k];
        dist = hs.update(map);
        if (hs.solid) {
          if (dist != null) {
            hs.handleCollision(dist);
          }
        }
      }
    }
  };

  return HasHotspots;

})();


/**
TODOC

@class cg.tile.Hotspot
 */

Hotspot = (function() {
  function Hotspot(actor, offset) {
    this.actor = actor;
    this.offset = offset;
  }

  Hotspot.prototype.update = function() {
    return this.didCollide = false;
  };

  return Hotspot;

})();


/**
TODOC

@class cg.tile.Hotspot.Top
 */

Top = (function(_super) {
  __extends(Top, _super);

  function Top(actor, offset, solid) {
    var o;
    this.actor = actor;
    this.offset = offset;
    this.solid = solid != null ? solid : true;
    Top.__super__.constructor.apply(this, arguments);
    o = this.offset;
    this.offset = {
      x: o.x - this.actor.anchorX * this.actor.width,
      y: o.y - this.actor.anchorY * this.actor.height
    };
  }

  Top.prototype.update = function(map) {
    var pos, tileBottom, tileX, tileY, _ref;
    Top.__super__.update.apply(this, arguments);
    pos = {
      x: this.actor.x + this.offset.x,
      y: this.actor.y + this.offset.y
    };
    _ref = map.tileCoordsAt(pos.x, pos.y), tileX = _ref.x, tileY = _ref.y;
    if (map.get(tileX, tileY) != null) {
      tileBottom = (tileY + 1) * map.tileHeight;
      if (map.bottomEdge(tileX, tileY) && (tileBottom - pos.y) <= (map.tileHeight / 2)) {
        this.didCollide = true;
        if (this.actor.v.y > 0) {
          return;
        }
        return tileBottom - pos.y;
      }
    }
  };

  Top.prototype.handleCollision = function(dy) {
    var pos;
    pos = {
      x: this.actor.x + this.offset.x,
      y: this.actor.y + this.offset.y
    };
    pos.y += dy;
    this.actor.y = pos.y - this.offset.y + EPSILON;
    return this.actor.v.y *= -this.actor.bounce;
  };

  return Top;

})(Hotspot);


/**
TODOC

@class cg.tile.Hotspot.Bottom
 */

Bottom = (function(_super) {
  __extends(Bottom, _super);

  function Bottom(actor, offset, solid) {
    var o;
    this.actor = actor;
    this.offset = offset;
    this.solid = solid != null ? solid : true;
    Bottom.__super__.constructor.apply(this, arguments);
    o = this.offset;
    this.offset = {
      x: o.x - this.actor.anchorX * this.actor.width,
      y: o.y - this.actor.anchorY * this.actor.height
    };
  }

  Bottom.prototype.update = function(map) {
    var pos, tileTop, tileX, tileY, _ref;
    Bottom.__super__.update.apply(this, arguments);
    pos = {
      x: this.actor.x + this.offset.x,
      y: this.actor.y + this.offset.y
    };
    _ref = map.tileCoordsAt(pos.x, pos.y), tileX = _ref.x, tileY = _ref.y;
    if (map.get(tileX, tileY) != null) {
      tileTop = tileY * map.tileHeight;
      if (map.topEdge(tileX, tileY) && (pos.y - tileTop) <= (map.tileHeight / 2)) {
        this.didCollide = true;
        if (this.actor.v.y < 0) {
          return;
        }
        return tileTop - pos.y;
      }
    }
  };

  Bottom.prototype.handleCollision = function(dy) {
    var pos;
    pos = {
      x: this.actor.x + this.offset.x,
      y: this.actor.y + this.offset.y
    };
    pos.y += dy;
    if (this.actor.v.y > 0) {
      this.actor.y = pos.y - this.offset.y + EPSILON;
      return this.actor.v.y *= -this.actor.bounce;
    }
  };

  return Bottom;

})(Hotspot);


/**
TODOC

@class cg.tile.Hotspot.Left
 */

Left = (function(_super) {
  __extends(Left, _super);

  function Left(actor, offset, solid) {
    var o;
    this.actor = actor;
    this.offset = offset;
    this.solid = solid != null ? solid : true;
    Left.__super__.constructor.apply(this, arguments);
    o = this.offset;
    this.offset = {
      x: o.x - this.actor.anchorX * this.actor.width,
      y: o.y - this.actor.anchorY * this.actor.height
    };
  }

  Left.prototype.update = function(map) {
    var pos, tileRight, tileX, tileY, _ref;
    Left.__super__.update.apply(this, arguments);
    pos = {
      x: this.actor.x + this.offset.x,
      y: this.actor.y + this.offset.y
    };
    _ref = map.tileCoordsAt(pos.x, pos.y), tileX = _ref.x, tileY = _ref.y;
    if (map.get(tileX, tileY) != null) {
      tileRight = (tileX + 1) * map.tileWidth;
      if (map.rightEdge(tileX, tileY) && (tileRight - pos.x) <= (map.tileWidth / 2)) {
        this.didCollide = true;
        if (this.actor.v.x > 0) {
          return;
        }
        return tileRight - pos.x;
      }
    }
  };

  Left.prototype.handleCollision = function(dx) {
    var pos;
    pos = {
      x: this.actor.x + this.offset.x,
      y: this.actor.y + this.offset.y
    };
    pos.x += dx;
    this.actor.x = pos.x - this.offset.x + EPSILON;
    return this.actor.v.x *= -this.actor.bounce;
  };

  return Left;

})(Hotspot);


/**
TODOC

@class cg.tile.Hotspot.Right
 */

Right = (function(_super) {
  __extends(Right, _super);

  function Right(actor, offset, solid) {
    var o;
    this.actor = actor;
    this.offset = offset;
    this.solid = solid != null ? solid : true;
    Right.__super__.constructor.apply(this, arguments);
    o = this.offset;
    this.offset = {
      x: o.x - this.actor.anchorX * this.actor.width,
      y: o.y - this.actor.anchorY * this.actor.height
    };
  }

  Right.prototype.update = function(map) {
    var pos, tileLeft, tileX, tileY, _ref;
    Right.__super__.update.apply(this, arguments);
    pos = {
      x: this.actor.x + this.offset.x,
      y: this.actor.y + this.offset.y
    };
    _ref = map.tileCoordsAt(pos.x, pos.y), tileX = _ref.x, tileY = _ref.y;
    if (map.get(tileX, tileY) != null) {
      tileLeft = tileX * map.tileWidth;
      if (map.leftEdge(tileX, tileY) && (pos.x - tileLeft) <= (map.tileWidth / 2)) {
        this.didCollide = true;
        if (this.actor.v.x < 0) {
          return;
        }
        return tileLeft - pos.x;
      }
    }
  };

  Right.prototype.handleCollision = function(dx) {
    var pos;
    pos = {
      x: this.actor.x + this.offset.x,
      y: this.actor.y + this.offset.y
    };
    pos.x += dx;
    this.actor.x = pos.x - this.offset.x + EPSILON;
    return this.actor.v.x *= -this.actor.bounce;
  };

  return Right;

})(Hotspot);

Hotspot.Left = Left;

Hotspot.Right = Right;

Hotspot.Bottom = Bottom;

Hotspot.Top = Top;

Hotspot.HasHotspots = HasHotspots;

module.exports = Hotspot;


},{"cg":15}],67:[function(require,module,exports){

/*
combo.js - Copyright 2012-2013 Louis Acresti - All Rights Reserved
 */
var Actor, TileMap, TileSheet, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Actor = require('Actor');

TileSheet = require('TileSheet');


/**
Fixed-size grid of square textures in the fashion of oldschool console games.

@class cg.tile.TileMap
@extends cg.Actor

@constructor

@example
    // Create a 100x100 TileMap that uses a 20x20 grid-based tilesheet named "tiles"
    var map = new TileMap({
      mapWidth: 100,
      mapHeight: 100,
      tileWidth: 20,
      tileHeight: 20,
      texture: 'tiles' Shorthand for cg.assets.textures.tiles
    });

@param [properties] {Object} This object is passed to the inherited `Actor` constructor.

Any additional name/value pairs in `properties` will be copied into the resulting `TileMap` object.
@param [properties.mapWidth=32] {Number} The number of tiles this map spans horizontally.
@param [properties.mapHeight=32] {Number} The number of tiles this map spans vertically.
@param [properties.tileWidth=16] {Number} The width of each tile (in pixels).
@param [properties.tileHeight=16] {Number} The height of each tile (in pixels).
@param [properties.sheets]* {String|Texture|TileSheet | Array(String|Texture|TileSheet)}
Any `Texture` supplied is converted to a `TileSheet` with a grid size that matches this map.

You may also supply pre-existing `TileSheet`s as well, in which case no new `TileSheet` is created.

The resulting array of `TileSheet`s is stored as `this.sheets`.
 */

TileMap = (function(_super) {
  __extends(TileMap, _super);

  TileMap.prototype._createSheetFor = function(prop) {
    var sheet, _ref;
    if (typeof prop === 'object' && prop instanceof TileSheet) {
      sheet = prop;
    } else if ((_ref = cg.assets.sheets[prop]) != null ? _ref.isTileSheet : void 0) {
      sheet = cg.assets.sheets[prop];
    } else {
      sheet = TileSheet.create(prop, this.tileWidth, this.tileHeight);
    }
    return sheet;
  };

  function TileMap() {
    var i, sheet, _i, _len, _ref;
    TileMap.__super__.constructor.apply(this, arguments);
    if (this.mapWidth == null) {
      this.mapWidth = 32;
    }
    if (this.mapHeight == null) {
      this.mapHeight = 32;
    }
    if (this.tileWidth == null) {
      this.tileWidth = 16;
    }
    if (this.tileHeight == null) {
      this.tileHeight = 16;
    }
    if (this.sheets == null) {
      this.sheets = [];
    }
    if (!cg.util.isArray(this.sheets)) {
      this.sheets = [this.sheets];
    }
    _ref = this.sheets;
    for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
      sheet = _ref[i];
      this.sheets[i] = this._createSheetFor(sheet);
    }
    this._map = new Array(this.mapWidth * this.mapHeight);
    this._resizeDisplayMap(cg.width, cg.height);
  }

  TileMap.prototype._resizeDisplayMap = function(scrWidth, srcHeight) {
    var sheetNum, t, tex, tile, tileNum, x, y, _ref;
    this.displayMap = [];
    this.displayMap.width = Math.min(this.mapWidth, Math.ceil(scrWidth / this.tileWidth) + 1);
    this.displayMap.height = Math.min(this.mapHeight, Math.ceil(srcHeight / this.tileHeight) + 1);
    if (this.displayContainer != null) {
      this.removeChild(this.displayContainer);
    }
    this.displayContainer = new Actor;
    y = 0;
    while (y < this.displayMap.height) {
      x = 0;
      while (x < this.displayMap.width) {
        tile = new cg.pixi.Sprite(this.sheets[0][0]);
        tex = null;
        t = this.get(x, y);
        if (t != null) {
          sheetNum = t[0], tileNum = t[1];
          tex = (_ref = this.sheets[sheetNum]) != null ? _ref[tileNum] : void 0;
        }
        if (tex == null) {
          tile.visible = false;
        } else {
          tile.texture = tex;
          tile.visible = true;
        }
        tile.x = x * this.tileWidth;
        tile.y = y * this.tileHeight;
        this.displayContainer.addChild(tile);
        this.displayMap[y * this.displayMap.width + x] = tile;
        ++x;
      }
      ++y;
    }
    return this.addChild(this.displayContainer);
  };


  /**
  Replace one of this map's `TileSheet`s.
  
  @method setSheet
  @param sheet {String|Texture|TileSheet}
  The new sheet.
  
  If a `String` or `Texture` is supplied, it is converted to a `TileSheet` with a grid size that matches this map.
  @param number=0 {Number} The index into `this.sheets` to replace.
  @return The `TileSheet` that was replaced, if any.
  
  @example
      // Typical use case; changing to a new world
      map.setSheet('world_02_tiles');
  
  @example
      // Using multiple sheets at once:
      var map = new TileMap({
        mapWidth: 100,
        mapHeight: 100,
        tileWidth: 20,
        tileHeight: 20,
        texture: ['lightTiles', 'darkTiles']
      });
  
      generateMap(map); // Some method that populates our map with tiles
      
      var lightSheet = map.sheets[0];
      var darkSheet  = map.sheets[1];
  
      map.setSheet(map.sheets[1], 0);
      map.setSheet(lightSheet, 1);
   */

  TileMap.prototype.setSheet = function(sheet, number) {
    var oldSheet;
    if (number == null) {
      number = 0;
    }
    sheet = this._createSheetFor(sheet);
    oldSheet = this.sheets[number];
    this.sheets[number] = sheet;
    this._resizeDisplayMap(cg.width, cg.height);
    return oldSheet;
  };


  /**
  Add a new `TileSheet` to `this.sheets`
  
  @method addSheet
  @param sheet {String|Texture|TileSheet}
  The sheet to add.
  
  If a `String` or `Texture` is supplied, it is converted to a `TileSheet` with a grid size that matches this map.
  
  @return The sheet that was added.
  
  @example
      var map = new TileMap({
        mapWidth: 100,
        mapHeight: 100,
        tileWidth: 20,
        tileHeight: 20,
        texture: ['tiles', 'moreTiles']
      });
  
      cg.log(map.sheets.length); // "2"
  
      map.addSheet('evenMoreTiles');
  
      cg.log(map.sheets.length); // "3"
   */

  TileMap.prototype.addSheet = function(sheet) {
    sheet = this._createSheetFor(sheet);
    this.sheets.push(sheet);
    return sheet;
  };


  /**
  Set the tile index at a given grid coordinate.
  
  @method set
  @param x {Number} Integer x-coordinate into this map (ignored when x < 0 or x >= `this.mapWidth`)
  @param y {Number} Integer y-coordinate into this map (ignored when y < 0 or y >= `this.mapHeight`)
  @param tileNumber {Number} The integer index into the `TileSheet` that represents this tile.
  @param [sheetNumber=0] {Number} The integer index into `this.sheets` that represents the `TileSheet` associated with this tile.
   */

  TileMap.prototype.set = function(x, y, tileNumber, sheetNum) {
    var val;
    if (sheetNum == null) {
      sheetNum = 0;
    }
    if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight) {
      return;
    }
    if (sheetNum < 0 || tileNumber < 0) {
      val = null;
    } else {
      val = [sheetNum, tileNumber];
    }
    this._map[y * this.mapWidth + x] = val;
    if (!this.dirty) {
      return this.dirty = true;
    }
  };


  /**
  Get the tile index and sheet number at a given grid coordinate.
  
  @method get
  @param x {Number} Integer x-coordinate into this map 
  @param y {Number} Integer y-coordinate into this map
  @return {Array}
  A two-element `Array` that contains first the sheet number, then the tile number of the tile at the
  specified coordinate.
  
      var sheetNumber, tileNumber, tileData;
      tileData = this.get(0,0);
  
      sheetNumber = tileData[0];
      tileNumber = tileData[1];
  
  `undefined` when the coordinate is outside the bounds of this map.
   */

  TileMap.prototype.get = function(x, y) {
    if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight) {
      return void 0;
    }
    return this._map[y * this.mapWidth + x];
  };


  /**
  Get the sprite used to display the tile at a specified coordinate.
  
  @protected
  @method getTileSprite
  @param x {Number} Integer x-coordinate into this map
  @param y {Number} Integer y-coordinate into this map
  @return {cg.gfx.Sprite}
  The sprite used to display the tile at the specified coordinate.
  
  `null` when the tile at the specified coordinate is not in the visible bounds
  of this tile map.
   */

  TileMap.prototype.getTileSprite = function(x, y) {
    var dx, dy, map;
    dx = x - this.startx;
    dy = y - this.starty;
    map = this.displayMap;
    if (!(dx >= 0 && dy >= 0 && dx < map.width && dy < map.height)) {
      return null;
    }
    return map[dy * map.width + dx];
  };


  /**
  Get the coordinates of the tile that contains a given screen coordinate.
  
  **NOTE**: This 
  
  @method tileCoordsAt
  @param x {Number} x-component of the screen coordinate
  @param y {Number} y-component of the screen coordinate
   */

  TileMap.prototype.tileCoordsAt = function(x, y) {
    return {
      x: Math.floor((x - this.x) / this.tileWidth),
      y: Math.floor((y - this.y) / this.tileHeight)
    };
  };

  TileMap.prototype.update = function() {
    var dx, dy, endx, endy, prevEndx, prevEndy, prevStartx, prevStarty, renderer, sheetNum, startx, starty, t, tex, tile, tileNum, x, y, _ref;
    if (cg.resized) {
      renderer = cg.renderer;
      this._resizeDisplayMap(cg.width, cg.height);
    }
    TileMap.__super__.update.apply(this, arguments);
    prevStartx = this.startx;
    prevStarty = this.starty;
    prevEndx = this.endx;
    prevEndy = this.endy;
    startx = Math.max(0, Math.floor(this.x / this.tileWidth));
    starty = Math.max(0, Math.floor(this.y / this.tileHeight));
    endx = startx + this.displayMap.width;
    endy = starty + this.displayMap.height;
    if (!(this.dirty || (prevStartx !== startx) || (prevStarty !== starty) || (prevEndx !== endx) || (prevEndy !== endy))) {
      return;
    }
    x = startx;
    dx = 0;
    while (x < endx) {
      y = starty;
      dy = 0;
      while (y < endy) {
        tile = this.displayMap[dy * this.displayMap.width + dx];
        if (tile != null) {
          tex = null;
          t = this.get(x, y);
          if (t != null) {
            sheetNum = t[0], tileNum = t[1];
            tex = (_ref = this.sheets[sheetNum]) != null ? _ref[tileNum] : void 0;
          }
          if (tex == null) {
            tile.visible = false;
          } else {
            tile.texture = tex;
            tile.visible = true;
          }
        }
        ++y;
        ++dy;
      }
      ++x;
      ++dx;
    }
    this.displayContainer.x = startx * this.tileWidth;
    this.displayContainer.y = starty * this.tileHeight;
    this.startx = startx;
    this.starty = starty;
    this.endx = endx;
    this.endy = endy;
    return this.dirty = false;
  };


  /**
  @protected
  @method topEdge
  @param x {Number} integer x-component of a tile coordinate
  @param y {Number} integer x-component of a tile coordinate
  @return {Boolean} `true` if the top of the tile isn't directly adjacent to another tile
   */

  TileMap.prototype.topEdge = function(x, y) {
    return this.get(x, y - 1) == null;
  };


  /**
  @protected
  @method leftEdge
  @param x {Number} integer x-component of a tile coordinate
  @param y {Number} integer x-component of a tile coordinate
  @return {Boolean} `true` if the left of the tile isn't directly adjacent to another tile
   */

  TileMap.prototype.leftEdge = function(x, y) {
    return this.get(x - 1, y) == null;
  };


  /**
  @protected
  @method bottomEdge
  @param x {Number} integer x-component of a tile coordinate
  @param y {Number} integer x-component of a tile coordinate
  @return {Boolean} `true` if the bottom of the tile isn't directly adjacent to another tile
   */

  TileMap.prototype.bottomEdge = function(x, y) {
    return this.get(x, y + 1) == null;
  };


  /**
  @protected
  @method rightEdge
  @param x {Number} integer x-component of a tile coordinate
  @param y {Number} integer x-component of a tile coordinate
  @return {Boolean} `true` if the right of the tile isn't directly adjacent to another tile
   */

  TileMap.prototype.rightEdge = function(x, y) {
    return this.get(x + 1, y) == null;
  };

  return TileMap;

})(Actor);

module.exports = TileMap;


},{"Actor":4,"TileSheet":12,"cg":15}],68:[function(require,module,exports){
var BitwiseTileMap, Hotspot, TileMap;

BitwiseTileMap = require('tile/BitwiseTileMap');

Hotspot = require('tile/Hotspot');

TileMap = require('tile/TileMap');

module.exports = {
  BitwiseTileMap: BitwiseTileMap,
  Hotspot: Hotspot,
  TileMap: TileMap
};


},{"tile/BitwiseTileMap":65,"tile/Hotspot":66,"tile/TileMap":67}],69:[function(require,module,exports){
var DeferredProxy,
  __slice = [].slice;

DeferredProxy = (function() {
  function DeferredProxy() {}

  DeferredProxy.create = function(obj, promise) {
    var enqueue, func, proxy, queue, val;
    proxy = {};
    queue = [];
    enqueue = function() {
      var args, func;
      func = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      queue.push([func, args]);
      return proxy;
    };
    for (func in obj) {
      val = obj[func];
      if (typeof val === 'function') {
        proxy[func] = enqueue.bind(null, func);
      }
    }
    promise = promise.then(function() {
      var job, _i, _len;
      for (_i = 0, _len = queue.length; _i < _len; _i++) {
        job = queue[_i];
        obj[job[0]](job[1]);
      }
    });
    proxy.then = function() {
      promise = promise.then.apply(promise, arguments);
      return proxy;
    };
    return proxy;
  };

  return DeferredProxy;

})();

module.exports = DeferredProxy;


},{}],70:[function(require,module,exports){

/*
Plugin example concept:

HasFavoriteNumber =
  preInit: (klass) ->
     * Add a property called "favoriteNumber" to our object.
    @favoriteNumber = 42
    ++klass.favoriteNumberCount
    cg.log 'There are ' + klass.favoriteNumberCount + ' objects that have a favorite number.'

  mixin:
    sayHello: -> cg.log 'HELLO; MY FAVORITE NUMBER IS ' + @favoriteNumber + '!'

  mixinStatic:
    onMixinStatic: ->
      @favoriteNumberCount = 0
 */
var ENSURE_RAN_WHEN_PLUGGING_IN, HasPlugins, NOOP, NOOPFor, TRACK_NOOP, buildMethodListInvoker, invokers, methodBaseName, methodListNameFor, methodName, methodNames, methodRanName, methodRanNameFor, name, _i, _j, _len, _len1,
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
  __slice = [].slice;

methodBaseName = function(methodName) {
  return '__plugins_' + methodName;
};

methodListNameFor = function(methodName) {
  return methodBaseName(methodName) + '_callbacks';
};

methodRanNameFor = function(methodName) {
  return methodBaseName(methodName) + '_ran';
};

methodNames = ['preInit', 'init', 'preReset', 'reset', 'preUpdate', 'update', 'draw', 'preDispose', 'dispose'];

ENSURE_RAN_WHEN_PLUGGING_IN = ['preInit', 'init'];

TRACK_NOOP = {};

for (_i = 0, _len = ENSURE_RAN_WHEN_PLUGGING_IN.length; _i < _len; _i++) {
  methodName = ENSURE_RAN_WHEN_PLUGGING_IN[_i];
  methodRanName = methodRanNameFor(methodName);
  TRACK_NOOP[methodName] = function() {
    return this[methodRanName] = true;
  };
}

NOOP = function() {};

NOOPFor = function(methodName) {
  if (__indexOf.call(ENSURE_RAN_WHEN_PLUGGING_IN, methodName) >= 0) {
    return TRACK_NOOP[methodName];
  } else {
    return NOOP;
  }
};

buildMethodListInvoker = function(methodName) {
  var methodListName;
  methodListName = methodListNameFor(methodName);
  if (__indexOf.call(ENSURE_RAN_WHEN_PLUGGING_IN, methodName) >= 0) {
    methodRanName = methodRanNameFor(methodName);
    return function() {
      var method, _j, _len1, _ref;
      _ref = this[methodListName];
      for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
        method = _ref[_j];
        method.call(this);
      }
      this[methodRanName] = true;
    };
  } else {
    return function() {
      var method, _j, _len1, _ref;
      _ref = this[methodListName];
      for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
        method = _ref[_j];
        method.call(this);
      }
    };
  }
};

invokers = {};

for (_j = 0, _len1 = methodNames.length; _j < _len1; _j++) {
  name = methodNames[_j];
  invokers[name] = buildMethodListInvoker(name);
}

HasPlugins = {
  plugin: function() {
    var methodListName, plugin, _k, _l, _len2, _len3, _len4, _len5, _m, _n, _plugins, _ref;
    _plugins = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    for (_k = 0, _len2 = _plugins.length; _k < _len2; _k++) {
      plugin = _plugins[_k];
      if (plugin.mixin != null) {
        this.mixin(plugin.mixin);
      }
      for (_l = 0, _len3 = methodNames.length; _l < _len3; _l++) {
        methodName = methodNames[_l];
        if (plugin[methodName] == null) {
          continue;
        }
        methodListName = methodListNameFor(methodName);
        this[methodListName] = ((_ref = this[methodListName]) != null ? _ref.slice() : void 0) || [];
        this[methodListName].push(plugin[methodName]);
        this[methodBaseName(methodName)] = invokers[methodName];
      }
    }
    for (_m = 0, _len4 = ENSURE_RAN_WHEN_PLUGGING_IN.length; _m < _len4; _m++) {
      methodName = ENSURE_RAN_WHEN_PLUGGING_IN[_m];
      if (this[methodRanNameFor(methodName)]) {
        for (_n = 0, _len5 = _plugins.length; _n < _len5; _n++) {
          plugin = _plugins[_n];
          if (plugin[methodName] != null) {
            plugin[methodName].call(this);
          }
        }
      }
    }
  },
  onMixin: function() {
    var _k, _len2;
    for (_k = 0, _len2 = methodNames.length; _k < _len2; _k++) {
      methodName = methodNames[_k];
      this.prototype[methodBaseName(methodName)] = NOOPFor(methodName);
    }
    return this.mixinStatic({
      plugin: function() {
        var methodListName, plugin, _l, _len3, _len4, _m, _plugins, _ref;
        _plugins = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        for (_l = 0, _len3 = _plugins.length; _l < _len3; _l++) {
          plugin = _plugins[_l];
          if (plugin.mixin != null) {
            this.mixin(plugin.mixin);
          }
          if (plugin.mixinStatic != null) {
            this.mixinStatic(plugin.mixinStatic);
          }
          for (_m = 0, _len4 = methodNames.length; _m < _len4; _m++) {
            methodName = methodNames[_m];
            if (plugin[methodName] == null) {
              continue;
            }
            methodListName = methodListNameFor(methodName);
            this.prototype[methodListName] = ((_ref = this.prototype[methodListName]) != null ? _ref.slice() : void 0) || [];
            this.prototype[methodListName].push(plugin[methodName]);
            this.prototype[methodBaseName(methodName)] = invokers[methodName];
          }
        }
      }
    });
  }
};

module.exports = HasPlugins;


},{}],71:[function(require,module,exports){

/**
A pool of actors; useful for reducing periodic garbage collector hiccups when many actors are being created and destroyed
at a high rate.

@class cg.util.HasPooling.Pool
@constructor
@param ctor {Actor Constructor} The class reference/constructor of the actor class whose instances are to be spawned from this pool.
 */
var HasPooling, Pool;

Pool = (function() {
  function Pool(ctor) {
    this.ctor = ctor;
    this.__objects = [];
    this.__marker = 0;
    this.__size = 0;
  }


  /**
  Create a new instance of our class.
  
  @method spawn
  @param [arguments...] Arguments are passed *as-is* to the actor's [`reset`](cg.Actor.html#method_reset) method.
   */

  Pool.prototype.spawn = function() {
    var obj;
    if (this.__marker >= this.__size) {
      this.__expand(Math.max(2, this.__size * 2));
    }
    obj = this.__objects[this.__marker++];
    obj._poolIndex = this.__marker - 1;
    obj.visible = true;
    obj._reset.apply(obj, arguments);
    return obj;
  };

  Pool.prototype.__expand = function(newSize) {
    var i;
    i = 0;
    while (i < newSize - this.__size) {
      this.__objects.push(new this.ctor);
      ++i;
    }
    return this.__size = newSize;
  };

  Pool.prototype._destroy = function(obj) {
    var end, endIndex;
    --this.__marker;
    end = this.__objects[this.__marker];
    endIndex = end._poolIndex;
    this.__objects[this.__marker] = obj;
    this.__objects[obj._poolIndex] = end;
    end._poolIndex = obj._poolIndex;
    return obj._poolIndex = endIndex;
  };

  return Pool;

})();


/**
**plugin**

Add [pooling](TODOC guide:pooling) capabilities to an actor class.

@static
@class cg.util.HasPooling
 */

HasPooling = {
  mixin: {
    _leavePool: function() {
      return this._pool._destroy(this);
    },
    onMixin: function() {

      /**
      The pool that this class may spawn new/recycled actor instances from.
      
      @static
      @property pool
      @type cg.util.HasPooling.Pool
       */
      this.pool = new Pool(this);
      return this.prototype._pool = this.pool;
    }
  },
  dispose: function() {
    if (this._poolIndex != null) {
      return this._leavePool();
    }
  }
};

module.exports = HasPooling;


},{}],72:[function(require,module,exports){
var HasSignals, Signal, __wrap,
  __slice = [].slice;

Signal = require('util/Signal');

__wrap = function(listener, funcName, listenerData, listeners) {
  if (funcName === 'addOnce') {
    return function() {
      if (!this.worldPaused) {
        listener.apply(this, arguments);
        return listeners.splice(listeners.indexOf(listenerData), 1);
      }
    };
  } else {
    return function() {
      if (!this.worldPaused) {
        return listener.apply(this, arguments);
      }
    };
  }
};


/**
**mixin**

Add event listening/emitting to any class.

@static
@class cg.util.HasSignals
 */

HasSignals = {
  __signal: function(name, create) {
    var signal, _base, _ref;
    if (create == null) {
      create = false;
    }
    if (!create) {
      signal = (_ref = this.__signals) != null ? _ref[name] : void 0;
    } else {
      if (this.__signals == null) {
        this.__signals = {};
      }
      if ((_base = this.__signals)[name] == null) {
        _base[name] = new Signal;
      }
      signal = this.__signals[name];
    }
    return signal;
  },
  __on: function(signaler, name, listener, funcName) {
    var err, listenerData, _listener;
    listenerData = [0, 0, 0, 0];
    if (this.__listeners == null) {
      this.__listeners = [];
    }
    if (!(typeof listener === 'function')) {
      err = new Error("on/once expected a function for the listener, but got '" + (typeof listener) + "'; aborting!");
      cg.warn(err.stack);
      return;
    }
    _listener = __wrap(listener, funcName, listenerData, this.__listeners);
    if ((signaler == null) || signaler === this) {
      signaler = this;
    }
    listenerData[0] = signaler;
    listenerData[1] = name;
    listenerData[2] = _listener;
    listenerData[3] = listener;
    this.__listeners.push(listenerData);
    return signaler.__signal(name, true)[funcName](_listener, this);
  },

  /**
  Listen for a named event and execute a function when it is emitted.
  
  @method on
  @param [signaler=this] {cg.util.HasSignals}
  The object that emits the event we wish to listen for.
  
  If *not* specified, we only listen for events emitted on this `HasSignals` object.
  
  @param name {String}
  The name of the event to listen for, or a comma-separated string of multiple event names.
  
  
  @param callback {Function}
  A function that executes whenever the event is emitted, **unless `this.paused` is `true`**.
  
  Callback Context (value of `this`):
  Inside the `callback`, the value of `this` is the value of the object that `on` was
  executed with.
  
  Example:
  
  ```javascript
  signalerAAA.on(signalerBBB, 'event', function () {
    assert(this === signalerAAA); // => true
  });
  
  signalerBBB.on('event', function () {
    assert(this === signalerBBB); // => true
  });
  
  signalerBBB.emit('event');
  ```
  
  Callback Arguments:
  The arguments in the function are derived from the arguments passed to the `signaler`'s `emit`
  call that triggered the event.
  
  @example
      listener.on(signaler, 'alert', function (msg) {
        cg.warn('Danger, Will Robinson: ' + msg);
      });
  
      signaler.emit('alert', 'This message will be logged!');
  
      // If a listener is paused, its event callbacks will not fire.
      listener.paused = true;
      signaler.emit('alert', 'This message will NOT be logged!');
  @example
      announcer.on(player, 'kill', function (enemyType, weapon) {
        cg.log('Player killed ' + enemyType + ' with ' + weapon + '.');
      });
  
      scoreBook.on(player, 'kill', function (enemyType) {
        switch(enemyType) {
        case 'rat':
          this.score += 100;
          break;
        case 'goblin':
          this.score += 200;
          break;
        case 'warlock':
          this.score += 1000;
          break;
        }
      });
  
      player.emit('kill', 'rat', 'chainsaw');
  
      // Result:
      // logged => "Player killed rat with chainsaw."
      // scoreBook.score == 200
  @example
      logger.on(service, 'log,warn,error', function (msg) {
        cg.log(msg);
      });
  
      service.emit('log', 'How are you gentlemen');
      service.emit('warn', 'Someone set us up the bomb');
      service.emit('error', 'All your base... eh, you know the drill.');
  
      // Result:
      // logged => "How are you gentlemen"
      // logged => "Someone set us up the bomb"
      // logged => "All your base... eh, you know the drill."
   */
  on: function() {
    var listener, name, signaler, _i, _j, _len, _name, _ref, _ref1;
    signaler = 3 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 2) : (_i = 0, []), name = arguments[_i++], listener = arguments[_i++];
    _ref = name.split(',');
    for (_j = 0, _len = _ref.length; _j < _len; _j++) {
      _name = _ref[_j];
      _name = _name.trim();
      if (_name.length === 0) {
        continue;
      }
      this.__on((_ref1 = signaler[0]) != null ? _ref1 : this, _name, listener, 'add');
    }
    return this;
  },
  once: function() {
    var listener, name, signaler, _i, _j, _len, _name, _ref, _ref1;
    signaler = 3 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 2) : (_i = 0, []), name = arguments[_i++], listener = arguments[_i++];
    _ref = name.split(',');
    for (_j = 0, _len = _ref.length; _j < _len; _j++) {
      _name = _ref[_j];
      _name = _name.trim();
      if (_name.length === 0) {
        continue;
      }
      this.__on((_ref1 = signaler[0]) != null ? _ref1 : this, _name, listener, 'addOnce');
    }
    return this;
  },
  off: function() {
    var args, i, listener, name, signal, signaler, wrapped, _i, _j, _k, _l, _len, _n, _name, _ref, _ref1, _ref2, _ref3, _ref4, _s;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (args.length === 1) {
      signaler = this;
      name = args[0];
    } else if (args.length === 2) {
      if (typeof args[0] === 'string') {
        signaler = this;
        name = args[0];
        listener = args[1];
      } else {
        signaler = args[0];
        name = args[1];
      }
    } else {
      signaler = args[0];
      name = args[1];
      listener = args[2];
    }
    _ref = name.split(',');
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      _name = _ref[_i];
      _name = _name.trim();
      if (_name.length === 0) {
        continue;
      }
      signal = signaler.__signal(_name);
      if (signal == null) {
        continue;
      }
      if (listener != null) {
        _ref1 = this.__listeners;
        for (i = _j = _ref1.length - 1; _j >= 0; i = _j += -1) {
          _ref2 = _ref1[i], _s = _ref2[0], _n = _ref2[1], wrapped = _ref2[2], _l = _ref2[3];
          if (!((_s === signaler) && (_n === _name) && (_l === listener))) {
            continue;
          }
          signal.remove(wrapped, this);
          this.__listeners.splice(i, 1);
        }
      } else {
        _ref3 = this.__listeners;
        for (i = _k = _ref3.length - 1; _k >= 0; i = _k += -1) {
          _ref4 = _ref3[i], _s = _ref4[0], _n = _ref4[1], wrapped = _ref4[2];
          if (!((_s === signaler) && (_n === _name))) {
            continue;
          }
          signal.remove(wrapped, this);
          this.__listeners.splice(i, 1);
        }
      }
    }
    return this;
  },
  halt: function(name) {
    var _ref;
    if ((_ref = this.__signal(name)) != null) {
      _ref.halt();
    }
    return this;
  },
  emit: function() {
    var args, name, _ref;
    name = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    if ((_ref = this.__signal(name)) != null) {
      _ref.dispatch.apply(_ref, args);
    }
    return this;
  },
  broadcast: function() {
    var args, child, name, _i, _len, _ref;
    name = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    this.emit.apply(this, [name].concat(__slice.call(args)));
    if (this.children == null) {
      return this;
    }
    _ref = this.children;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      child = _ref[_i];
      if (typeof child.broadcast === "function") {
        child.broadcast.apply(child, [name].concat(__slice.call(args)));
      }
    }
    return this;
  },
  _disposeListeners: function() {
    var listener, name, signaler, wrappedListener, _i, _ref, _ref1;
    if (this.__listeners == null) {
      return;
    }
    _ref = this.__listeners;
    for (_i = _ref.length - 1; _i >= 0; _i += -1) {
      _ref1 = _ref[_i], signaler = _ref1[0], name = _ref1[1], wrappedListener = _ref1[2], listener = _ref1[3];
      this.off(signaler, name, listener);
    }
  }
};

module.exports = HasSignals;


},{"util/Signal":74}],73:[function(require,module,exports){
(function (process){
var Deferred, Module, Promise, Resolver, isFunction, nextTick,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Module = require('Module');

nextTick = (typeof process !== "undefined" && process !== null ? process.nextTick : void 0) != null ? process.nextTick : typeof setImmediate !== "undefined" && setImmediate !== null ? setImmediate : function(task) {
  return setTimeout(task, 0);
};

isFunction = function(value) {
  return typeof value === 'function';
};

Resolver = (function() {
  function Resolver(onResolved, onRejected, context) {
    var complete, completeRejected, completeResolved, completed, completionAction, completionValue, pendingResolvers, process, processed, propagate, schedule;
    this.context = context;
    this.promise = new Promise(this);
    pendingResolvers = [];
    processed = false;
    completed = false;
    completionValue = null;
    completionAction = null;
    if (!isFunction(onRejected)) {
      onRejected = function(error) {
        throw error;
      };
    }
    propagate = function() {
      var pendingResolver, _i, _len;
      for (_i = 0, _len = pendingResolvers.length; _i < _len; _i++) {
        pendingResolver = pendingResolvers[_i];
        pendingResolver[completionAction](completionValue);
      }
      pendingResolvers = [];
    };
    schedule = function(pendingResolver) {
      pendingResolvers.push(pendingResolver);
      if (completed) {
        propagate();
      }
    };
    complete = function(action, value) {
      onResolved = onRejected = null;
      completionAction = action;
      completionValue = value;
      completed = true;
      propagate();
    };
    completeResolved = function(result) {
      complete('resolve', result);
    };
    completeRejected = function(reason) {
      complete('reject', reason);
    };
    process = (function(_this) {
      return function(callback, value) {
        var error, stack;
        processed = true;
        try {
          if (isFunction(callback)) {
            value = callback.call(_this.context, value);
          }
          if (value && isFunction(value.then)) {
            value.then(completeResolved, completeRejected, _this.context);
          } else {
            completeResolved(value);
          }
        } catch (_error) {
          error = _error;
          stack = error.stack;
          console.error(stack);
          completeRejected(error);
        }
      };
    })(this);
    this.resolve = function(result) {
      if (!processed) {
        process(onResolved, result);
      }
    };
    this.reject = function(error) {
      if (!processed) {
        process(onRejected, error);
      }
    };
    this.then = (function(_this) {
      return function(onResolved, onRejected) {
        var pendingResolver;
        if (isFunction(onResolved) || isFunction(onRejected)) {
          pendingResolver = new Resolver(onResolved, onRejected, _this.context);
          nextTick(function() {
            return schedule(pendingResolver);
          });
          return pendingResolver.promise;
        }
        return _this.promise;
      };
    })(this);
  }

  return Resolver;

})();

Promise = (function() {
  function Promise(resolver) {
    this.then = function(onFulfilled, onRejected) {
      return resolver.then(onFulfilled, onRejected);
    };
  }

  return Promise;

})();

Deferred = (function(_super) {
  __extends(Deferred, _super);

  function Deferred(context) {
    var resolver;
    resolver = new Resolver(null, null, context);
    this.promise = resolver.promise;
    this.resolve = function(result) {
      return resolver.resolve(result);
    };
    this.reject = function(error) {
      return resolver.reject(error);
    };
  }

  return Deferred;

})(Module);

module.exports = {
  Deferred: Deferred,
  defer: function() {
    return (function(func, args, ctor) {
      ctor.prototype = func.prototype;
      var child = new ctor, result = func.apply(child, args);
      return Object(result) === result ? result : child;
    })(Deferred, arguments, function(){});
  }
};


}).call(this,require("FWaASH"))
},{"FWaASH":1,"Module":9}],74:[function(require,module,exports){

/*
Signal & SignalBinding adapted from https://raw.github.com/millermedeiros/js-signals/
 */
var Signal, SignalBinding, validateListener,
  __slice = [].slice;

SignalBinding = require('util/SignalBinding');

validateListener = function(listener, fnName) {
  if (typeof listener !== "function") {
    throw new Error("listener is a required param of {fn}() and should be a Function.".replace("{fn}", fnName));
  }
};


/*
Custom event broadcaster
<br />- inspired by Robert Penner's AS3 Signals.
@name cg.util.Signal
@author Miller Medeiros
@constructor
 */

Signal = (function() {
  function Signal(name) {
    this.name = name;

    /*
    @type Array.<SignalBinding>
    @private
     */
    this._bindings = [];
    this._prevParams = null;
    this.dispatch = (function(_this) {
      return function() {
        return Signal.prototype.dispatch.apply(_this, arguments);
      };
    })(this);
  }


  /*
  If Signal should keep record of previously dispatched parameters and
  automatically execute listener during `add()`/`addOnce()` if Signal was
  already dispatched before.
  @type boolean
   */

  Signal.prototype.memorize = false;


  /*
  @type boolean
  @private
   */

  Signal.prototype._shouldPropagate = true;


  /*
  If Signal is active and should broadcast events.
  <p><strong>IMPORTANT:</strong> Setting this property during a dispatch will only affect the next dispatch, if you want to stop the propagation of a signal use `halt()` instead.</p>
  @type boolean
   */

  Signal.prototype.active = true;


  /*
  @param {Function} listener
  @param {boolean} isOnce
  @param {Object} [listenerContext]
  @param {Number} [priority]
  @return {SignalBinding}
  @private
   */

  Signal.prototype._registerListener = function(listener, isOnce, listenerContext, priority) {
    var binding, prevIndex;
    prevIndex = this._indexOfListener(listener, listenerContext);
    binding = void 0;
    if (prevIndex !== -1) {
      binding = this._bindings[prevIndex];
      if (binding.isOnce() !== isOnce) {
        throw new Error("You cannot add" + (isOnce ? "" : "Once") + "() then add" + (!isOnce ? "" : "Once") + "() the same listener without removing the relationship first.");
      }
    } else {
      binding = new SignalBinding(this, listener, isOnce, listenerContext, priority);
      this._addBinding(binding);
    }
    if (this.memorize && this._prevParams) {
      binding.execute(this._prevParams);
    }
    return binding;
  };


  /*
  @param {SignalBinding} binding
  @private
   */

  Signal.prototype._addBinding = function(binding) {
    var n;
    n = this._bindings.length;
    while (true) {
      --n;
      if (!(this._bindings[n] && binding._priority <= this._bindings[n]._priority)) {
        break;
      }
    }
    return this._bindings.splice(n + 1, 0, binding);
  };


  /*
  @param {Function} listener
  @return {number}
  @private
   */

  Signal.prototype._indexOfListener = function(listener, context) {
    var cur, n;
    n = this._bindings.length;
    cur = void 0;
    while (n--) {
      cur = this._bindings[n];
      if (cur._listener === listener && cur.context === context) {
        return n;
      }
    }
    return -1;
  };


  /*
  Check if listener was attached to Signal.
  @param {Function} listener
  @param {Object} [context]
  @return {boolean} if Signal has the specified listener.
   */

  Signal.prototype.has = function(listener, context) {
    return this._indexOfListener(listener, context) !== -1;
  };


  /*
  Add a listener to the signal.
  @param {Function} listener Signal handler function.
  @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
  @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
  @return {SignalBinding} An Object representing the binding between the Signal and listener.
   */

  Signal.prototype.add = function(listener, listenerContext, priority) {
    validateListener(listener, "add");
    return this._registerListener(listener, false, listenerContext, priority);
  };


  /*
  Add listener to the signal that should be removed after first execution (will be executed only once).
  @param {Function} listener Signal handler function.
  @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
  @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
  @return {SignalBinding} An Object representing the binding between the Signal and listener.
   */

  Signal.prototype.addOnce = function(listener, listenerContext, priority) {
    validateListener(listener, "addOnce");
    return this._registerListener(listener, true, listenerContext, priority);
  };


  /*
  Remove a single listener from the dispatch queue.
  @param {Function} listener Handler function that should be removed.
  @param {Object} [context] Execution context (since you can add the same handler multiple times if executing in a different context).
  @return {Function} Listener handler function.
   */

  Signal.prototype.remove = function(listener, context) {
    var i;
    validateListener(listener, "remove");
    i = this._indexOfListener(listener, context);
    if (i !== -1) {
      this._bindings[i]._destroy();
      this._bindings.splice(i, 1);
    }
    return listener;
  };


  /*
  Remove all listeners from the Signal.
   */

  Signal.prototype.removeAll = function() {
    var n;
    n = this._bindings.length;
    while (n--) {
      this._bindings[n]._destroy();
    }
    return this._bindings.length = 0;
  };


  /*
  @return {number} Number of listeners attached to the Signal.
   */

  Signal.prototype.getNumListeners = function() {
    return this._bindings.length;
  };


  /*
  Stop propagation of the event, blocking the dispatch to next listeners on the queue.
  <p><strong>IMPORTANT:</strong> should be called only during signal dispatch, calling it before/after dispatch won't affect signal broadcast.</p>
  @see Signal.prototype.disable
   */

  Signal.prototype.halt = function() {
    return this._shouldPropagate = false;
  };


  /*
  Dispatch/Broadcast Signal to all listeners added to the queue.
  @param {...*} [params] Parameters that should be passed to each handler.
   */

  Signal.prototype.dispatch = function() {
    var bindings, n, params, _results;
    params = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if (!this.active) {
      return;
    }
    n = this._bindings.length;
    bindings = void 0;
    if (this.memorize) {
      this._prevParams = params;
    }
    if (!n) {
      return;
    }
    bindings = this._bindings.slice();
    this._shouldPropagate = true;
    _results = [];
    while (true) {
      n--;
      if (!(bindings[n] && this._shouldPropagate && bindings[n].execute(params) !== false)) {
        break;
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };


  /*
  Forget memorized arguments.
  @see Signal.memorize
   */

  Signal.prototype.forget = function() {
    return this._prevParams = null;
  };


  /*
  Remove all bindings from signal and destroy any reference to external objects (destroy Signal object).
  <p><strong>IMPORTANT:</strong> calling any method on the signal instance after calling dispose will throw errors.</p>
   */

  Signal.prototype.dispose = function() {
    this.removeAll();
    delete this._bindings;
    return delete this._prevParams;
  };


  /*
  @return {string} String representation of the object.
   */

  Signal.prototype.toString = function() {
    return "[Signal active:" + this.active + " numListeners:" + this.getNumListeners() + "]";
  };

  return Signal;

})();

module.exports = Signal;


},{"util/SignalBinding":75}],75:[function(require,module,exports){

/*
Signal & SignalBinding adapted from https://raw.github.com/millermedeiros/js-signals/
 */

/*
Object that represents a binding between a Signal and a listener function.
<br />- <strong>This is an internal constructor and shouldn't be called by regular users.</strong>
<br />- inspired by Joa Ebert AS3 SignalBinding and Robert Penner's Slot classes.
@author Miller Medeiros
@constructor
@internal
@name SignalBinding
@param {Signal} signal Reference to Signal object that listener is currently bound to.
@param {Function} listener Handler function bound to the signal.
@param {boolean} isOnce If binding should be executed just once.
@param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
@param {Number} [priority] The priority level of the event listener. (default = 0).
 */
var SignalBinding;

SignalBinding = (function() {
  function SignalBinding(signal, listener, isOnce, listenerContext, priority) {

    /*
    Handler function bound to the signal.
    @type Function
    @private
     */
    this._listener = listener;

    /*
    If binding should be executed just once.
    @type boolean
    @private
     */
    this._isOnce = isOnce;

    /*
    Context on which listener will be executed (object that should represent the `this` variable inside listener function).
    @memberOf SignalBinding.prototype
    @name context
    @type Object|undefined|null
     */
    this.context = listenerContext;

    /*
    Reference to Signal object that listener is currently bound to.
    @type Signal
    @private
     */
    this._signal = signal;

    /*
    Listener priority
    @type Number
    @private
     */
    this._priority = priority || 0;
  }


  /*
  If binding is active and should be executed.
  @type boolean
   */

  SignalBinding.prototype.active = true;


  /*
  Default parameters passed to listener during `Signal.dispatch` and `SignalBinding.execute`. (curried parameters)
  @type Array|null
   */

  SignalBinding.prototype.params = null;


  /*
  Call listener passing arbitrary parameters.
  <p>If binding was added using `Signal.addOnce()` it will be automatically removed from signal dispatch queue, this method is used internally for the signal dispatch.</p>
  @param {Array} [paramsArr] Array of parameters that should be passed to the listener
  @return {*} Value returned by the listener.
   */

  SignalBinding.prototype.execute = function(paramsArr) {
    var handlerReturn, params;
    handlerReturn = void 0;
    params = void 0;
    if (this.active && !!this._listener) {
      params = (this.params ? this.params.concat(paramsArr) : paramsArr);
      handlerReturn = this._listener.apply(this.context, params);
      if (this._isOnce) {
        this.detach();
      }
    }
    return handlerReturn;
  };


  /*
  Detach binding from signal.
  - alias to: mySignal.remove(myBinding.getListener());
  @return {Function|null} Handler function bound to the signal or `null` if binding was previously detached.
   */

  SignalBinding.prototype.detach = function() {
    if (this.isBound()) {
      return this._signal.remove(this._listener, this.context);
    } else {
      return null;
    }
  };


  /*
  @return {Boolean} `true` if binding is still bound to the signal and have a listener.
   */

  SignalBinding.prototype.isBound = function() {
    return !!this._signal && !!this._listener;
  };


  /*
  @return {boolean} If SignalBinding will only be executed once.
   */

  SignalBinding.prototype.isOnce = function() {
    return this._isOnce;
  };


  /*
  @return {Function} Handler function bound to the signal.
   */

  SignalBinding.prototype.getListener = function() {
    return this._listener;
  };


  /*
  @return {Signal} Signal that listener is currently bound to.
   */

  SignalBinding.prototype.getSignal = function() {
    return this._signal;
  };


  /*
  Delete instance properties
  @private
   */

  SignalBinding.prototype._destroy = function() {
    delete this._signal;
    delete this._listener;
    return delete this.context;
  };


  /*
  @return {string} String representation of the object.
   */

  SignalBinding.prototype.toString = function() {
    return "[SignalBinding isOnce:" + this._isOnce + ", isBound:" + this.isBound() + ", active:" + this.active + "]";
  };

  return SignalBinding;

})();

module.exports = SignalBinding;


},{}],76:[function(require,module,exports){
(function (process){
/*
Copyright (c) 2010 Caolan McMahon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*global setImmediate: false, setTimeout: false, console: false */
(function () {

    var async = {};

    // global on the server, window in the browser
    var root, previous_async;

    root = this;
    if (root != null) {
      previous_async = root.async;
    }

    async.noConflict = function () {
        root.async = previous_async;
        return async;
    };

    function only_once(fn) {
        var called = false;
        return function() {
            if (called) throw new Error("Callback was already called.");
            called = true;
            fn.apply(root, arguments);
        }
    }

    //// cross-browser compatiblity functions ////

    var _each = function (arr, iterator) {
        if (arr.forEach) {
            return arr.forEach(iterator);
        }
        for (var i = 0; i < arr.length; i += 1) {
            iterator(arr[i], i, arr);
        }
    };

    var _map = function (arr, iterator) {
        if (arr.map) {
            return arr.map(iterator);
        }
        var results = [];
        _each(arr, function (x, i, a) {
            results.push(iterator(x, i, a));
        });
        return results;
    };

    var _reduce = function (arr, iterator, memo) {
        if (arr.reduce) {
            return arr.reduce(iterator, memo);
        }
        _each(arr, function (x, i, a) {
            memo = iterator(memo, x, i, a);
        });
        return memo;
    };

    var _keys = function (obj) {
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                keys.push(k);
            }
        }
        return keys;
    };

    //// exported async module functions ////

    //// nextTick implementation with browser-compatible fallback ////
    if (typeof process === 'undefined' || !(process.nextTick)) {
        if (typeof setImmediate === 'function') {
            async.nextTick = function (fn) {
                // not a direct alias for IE10 compatibility
                setImmediate(fn);
            };
            async.setImmediate = async.nextTick;
        }
        else {
            async.nextTick = function (fn) {
                setTimeout(fn, 0);
            };
            async.setImmediate = async.nextTick;
        }
    }
    else {
        async.nextTick = process.nextTick;
        if (typeof setImmediate !== 'undefined') {
            async.setImmediate = setImmediate;
        }
        else {
            async.setImmediate = async.nextTick;
        }
    }

    async.each = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        _each(arr, function (x) {
            iterator(x, only_once(function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback(null);
                    }
                }
            }));
        });
    };
    async.forEach = async.each;

    async.eachSeries = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        var iterate = function () {
            iterator(arr[completed], function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback(null);
                    }
                    else {
                        iterate();
                    }
                }
            });
        };
        iterate();
    };
    async.forEachSeries = async.eachSeries;

    async.eachLimit = function (arr, limit, iterator, callback) {
        var fn = _eachLimit(limit);
        fn.apply(null, [arr, iterator, callback]);
    };
    async.forEachLimit = async.eachLimit;

    var _eachLimit = function (limit) {

        return function (arr, iterator, callback) {
            callback = callback || function () {};
            if (!arr.length || limit <= 0) {
                return callback();
            }
            var completed = 0;
            var started = 0;
            var running = 0;

            (function replenish () {
                if (completed >= arr.length) {
                    return callback();
                }

                while (running < limit && started < arr.length) {
                    started += 1;
                    running += 1;
                    iterator(arr[started - 1], function (err) {
                        if (err) {
                            callback(err);
                            callback = function () {};
                        }
                        else {
                            completed += 1;
                            running -= 1;
                            if (completed >= arr.length) {
                                callback();
                            }
                            else {
                                replenish();
                            }
                        }
                    });
                }
            })();
        };
    };


    var doParallel = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.each].concat(args));
        };
    };
    var doParallelLimit = function(limit, fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [_eachLimit(limit)].concat(args));
        };
    };
    var doSeries = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.eachSeries].concat(args));
        };
    };


    var _asyncMap = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (err, v) {
                results[x.index] = v;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    };
    async.map = doParallel(_asyncMap);
    async.mapSeries = doSeries(_asyncMap);
    async.mapLimit = function (arr, limit, iterator, callback) {
        return _mapLimit(limit)(arr, iterator, callback);
    };

    var _mapLimit = function(limit) {
        return doParallelLimit(limit, _asyncMap);
    };

    // reduce only has a series version, as doing reduce in parallel won't
    // work in many situations.
    async.reduce = function (arr, memo, iterator, callback) {
        async.eachSeries(arr, function (x, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    };
    // inject alias
    async.inject = async.reduce;
    // foldl alias
    async.foldl = async.reduce;

    async.reduceRight = function (arr, memo, iterator, callback) {
        var reversed = _map(arr, function (x) {
            return x;
        }).reverse();
        async.reduce(reversed, memo, iterator, callback);
    };
    // foldr alias
    async.foldr = async.reduceRight;

    var _filter = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.filter = doParallel(_filter);
    async.filterSeries = doSeries(_filter);
    // select alias
    async.select = async.filter;
    async.selectSeries = async.filterSeries;

    var _reject = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (!v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.reject = doParallel(_reject);
    async.rejectSeries = doSeries(_reject);

    var _detect = function (eachfn, arr, iterator, main_callback) {
        eachfn(arr, function (x, callback) {
            iterator(x, function (result) {
                if (result) {
                    main_callback(x);
                    main_callback = function () {};
                }
                else {
                    callback();
                }
            });
        }, function (err) {
            main_callback();
        });
    };
    async.detect = doParallel(_detect);
    async.detectSeries = doSeries(_detect);

    async.some = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (v) {
                    main_callback(true);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(false);
        });
    };
    // any alias
    async.any = async.some;

    async.every = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (!v) {
                    main_callback(false);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(true);
        });
    };
    // all alias
    async.all = async.every;

    async.sortBy = function (arr, iterator, callback) {
        async.map(arr, function (x, callback) {
            iterator(x, function (err, criteria) {
                if (err) {
                    callback(err);
                }
                else {
                    callback(null, {value: x, criteria: criteria});
                }
            });
        }, function (err, results) {
            if (err) {
                return callback(err);
            }
            else {
                var fn = function (left, right) {
                    var a = left.criteria, b = right.criteria;
                    return a < b ? -1 : a > b ? 1 : 0;
                };
                callback(null, _map(results.sort(fn), function (x) {
                    return x.value;
                }));
            }
        });
    };

    async.auto = function (tasks, callback) {
        callback = callback || function () {};
        var keys = _keys(tasks);
        if (!keys.length) {
            return callback(null);
        }

        var results = {};

        var listeners = [];
        var addListener = function (fn) {
            listeners.unshift(fn);
        };
        var removeListener = function (fn) {
            for (var i = 0; i < listeners.length; i += 1) {
                if (listeners[i] === fn) {
                    listeners.splice(i, 1);
                    return;
                }
            }
        };
        var taskComplete = function () {
            _each(listeners.slice(0), function (fn) {
                fn();
            });
        };

        addListener(function () {
            if (_keys(results).length === keys.length) {
                callback(null, results);
                callback = function () {};
            }
        });

        _each(keys, function (k) {
            var task = (tasks[k] instanceof Function) ? [tasks[k]]: tasks[k];
            var taskCallback = function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                if (err) {
                    var safeResults = {};
                    _each(_keys(results), function(rkey) {
                        safeResults[rkey] = results[rkey];
                    });
                    safeResults[k] = args;
                    callback(err, safeResults);
                    // stop subsequent errors hitting callback multiple times
                    callback = function () {};
                }
                else {
                    results[k] = args;
                    async.setImmediate(taskComplete);
                }
            };
            var requires = task.slice(0, Math.abs(task.length - 1)) || [];
            var ready = function () {
                return _reduce(requires, function (a, x) {
                    return (a && results.hasOwnProperty(x));
                }, true) && !results.hasOwnProperty(k);
            };
            if (ready()) {
                task[task.length - 1](taskCallback, results);
            }
            else {
                var listener = function () {
                    if (ready()) {
                        removeListener(listener);
                        task[task.length - 1](taskCallback, results);
                    }
                };
                addListener(listener);
            }
        });
    };

    async.waterfall = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor !== Array) {
          var err = new Error('First argument to waterfall must be an array of functions');
          return callback(err);
        }
        if (!tasks.length) {
            return callback();
        }
        var wrapIterator = function (iterator) {
            return function (err) {
                if (err) {
                    callback.apply(null, arguments);
                    callback = function () {};
                }
                else {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var next = iterator.next();
                    if (next) {
                        args.push(wrapIterator(next));
                    }
                    else {
                        args.push(callback);
                    }
                    async.setImmediate(function () {
                        iterator.apply(null, args);
                    });
                }
            };
        };
        wrapIterator(async.iterator(tasks))();
    };

    var _parallel = function(eachfn, tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            eachfn.map(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            eachfn.each(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.parallel = function (tasks, callback) {
        _parallel({ map: async.map, each: async.each }, tasks, callback);
    };

    async.parallelLimit = function(tasks, limit, callback) {
        _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
    };

    async.series = function (tasks, callback) {
        callback = callback || function () {};
        if (tasks.constructor === Array) {
            async.mapSeries(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            async.eachSeries(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.iterator = function (tasks) {
        var makeCallback = function (index) {
            var fn = function () {
                if (tasks.length) {
                    tasks[index].apply(null, arguments);
                }
                return fn.next();
            };
            fn.next = function () {
                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
            };
            return fn;
        };
        return makeCallback(0);
    };

    async.apply = function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function () {
            return fn.apply(
                null, args.concat(Array.prototype.slice.call(arguments))
            );
        };
    };

    var _concat = function (eachfn, arr, fn, callback) {
        var r = [];
        eachfn(arr, function (x, cb) {
            fn(x, function (err, y) {
                r = r.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, r);
        });
    };
    async.concat = doParallel(_concat);
    async.concatSeries = doSeries(_concat);

    async.whilst = function (test, iterator, callback) {
        if (test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.whilst(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doWhilst = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            if (test()) {
                async.doWhilst(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.until = function (test, iterator, callback) {
        if (!test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.until(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doUntil = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            if (!test()) {
                async.doUntil(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.queue = function (worker, concurrency) {
        if (concurrency === undefined) {
            concurrency = 1;
        }
        function _insert(q, data, pos, callback) {
          if(data.constructor !== Array) {
              data = [data];
          }
          _each(data, function(task) {
              var item = {
                  data: task,
                  callback: typeof callback === 'function' ? callback : null
              };

              if (pos) {
                q.tasks.unshift(item);
              } else {
                q.tasks.push(item);
              }

              if (q.saturated && q.tasks.length === concurrency) {
                  q.saturated();
              }
              async.setImmediate(q.process);
          });
        }

        var workers = 0;
        var q = {
            tasks: [],
            concurrency: concurrency,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
              _insert(q, data, false, callback);
            },
            unshift: function (data, callback) {
              _insert(q, data, true, callback);
            },
            process: function () {
                if (workers < q.concurrency && q.tasks.length) {
                    var task = q.tasks.shift();
                    if (q.empty && q.tasks.length === 0) {
                        q.empty();
                    }
                    workers += 1;
                    var next = function () {
                        workers -= 1;
                        if (task.callback) {
                            task.callback.apply(task, arguments);
                        }
                        if (q.drain && q.tasks.length + workers === 0) {
                            q.drain();
                        }
                        q.process();
                    };
                    var cb = only_once(next);
                    worker(task.data, cb);
                }
            },
            length: function () {
                return q.tasks.length;
            },
            running: function () {
                return workers;
            }
        };
        return q;
    };

    async.cargo = function (worker, payload) {
        var working     = false,
            tasks       = [];

        var cargo = {
            tasks: tasks,
            payload: payload,
            saturated: null,
            empty: null,
            drain: null,
            push: function (data, callback) {
                if(data.constructor !== Array) {
                    data = [data];
                }
                _each(data, function(task) {
                    tasks.push({
                        data: task,
                        callback: typeof callback === 'function' ? callback : null
                    });
                    if (cargo.saturated && tasks.length === payload) {
                        cargo.saturated();
                    }
                });
                async.setImmediate(cargo.process);
            },
            process: function process() {
                if (working) return;
                if (tasks.length === 0) {
                    if(cargo.drain) cargo.drain();
                    return;
                }

                var ts = typeof payload === 'number'
                            ? tasks.splice(0, payload)
                            : tasks.splice(0);

                var ds = _map(ts, function (task) {
                    return task.data;
                });

                if(cargo.empty) cargo.empty();
                working = true;
                worker(ds, function () {
                    working = false;

                    var args = arguments;
                    _each(ts, function (data) {
                        if (data.callback) {
                            data.callback.apply(null, args);
                        }
                    });

                    process();
                });
            },
            length: function () {
                return tasks.length;
            },
            running: function () {
                return working;
            }
        };
        return cargo;
    };

    var _console_fn = function (name) {
        return function (fn) {
            var args = Array.prototype.slice.call(arguments, 1);
            fn.apply(null, args.concat([function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _each(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            }]));
        };
    };
    async.log = _console_fn('log');
    async.dir = _console_fn('dir');
    /*async.info = _console_fn('info');
    async.warn = _console_fn('warn');
    async.error = _console_fn('error');*/

    async.memoize = function (fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || function (x) {
            return x;
        };
        var memoized = function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            var key = hasher.apply(null, args);
            if (key in memo) {
                callback.apply(null, memo[key]);
            }
            else if (key in queues) {
                queues[key].push(callback);
            }
            else {
                queues[key] = [callback];
                fn.apply(null, args.concat([function () {
                    memo[key] = arguments;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                      q[i].apply(null, arguments);
                    }
                }]));
            }
        };
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    };

    async.unmemoize = function (fn) {
      return function () {
        return (fn.unmemoized || fn).apply(null, arguments);
      };
    };

    async.times = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.map(counter, iterator, callback);
    };

    async.timesSeries = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.mapSeries(counter, iterator, callback);
    };

    async.compose = function (/* functions... */) {
        var fns = Array.prototype.reverse.call(arguments);
        return function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            async.reduce(fns, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([function () {
                    var err = arguments[0];
                    var nextargs = Array.prototype.slice.call(arguments, 1);
                    cb(err, nextargs);
                }]))
            },
            function (err, results) {
                callback.apply(that, [err].concat(results));
            });
        };
    };

    var _applyEach = function (eachfn, fns /*args...*/) {
        var go = function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            return eachfn(fns, function (fn, cb) {
                fn.apply(that, args.concat([cb]));
            },
            callback);
        };
        if (arguments.length > 2) {
            var args = Array.prototype.slice.call(arguments, 2);
            return go.apply(this, args);
        }
        else {
            return go;
        }
    };
    async.applyEach = doParallel(_applyEach);
    async.applyEachSeries = doSeries(_applyEach);

    async.forever = function (fn, callback) {
        function next(err) {
            if (err) {
                if (callback) {
                    return callback(err);
                }
                throw err;
            }
            fn(next);
        }
        next();
    };

    // AMD / RequireJS
    if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return async;
        });
    }
    // Node.js
    else if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
    }
    // included directly via <script> tag
    else {
        root.async = async;
    }

}());
}).call(this,require("FWaASH"))
},{"FWaASH":1}],77:[function(require,module,exports){
var DeferredProxy, HasPooling, HasSignals, Promises, Signal, SignalBinding, name, util, _fn, _i, _len, _ref,
  __hasProp = {}.hasOwnProperty;

DeferredProxy = require('util/DeferredProxy');

HasPooling = require('util/HasPooling');

HasSignals = require('util/HasSignals');

Promises = require('util/Promises');

Signal = require('util/Signal');

SignalBinding = require('util/SignalBinding');

util = {
  sizeOf: function(obj) {
    var k, s, v;
    s = 0;
    for (k in obj) {
      if (!__hasProp.call(obj, k)) continue;
      v = obj[k];
      ++s;
    }
    return s;
  },
  isArray: function(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  },
  arrayRemove: function(arr, from, to) {
    var rest;
    rest = arr.slice((to || from) + 1 || arr.length);
    arr.length = (from < 0 ? arr.length + from : from);
    return arr.push.apply(arr, rest);
  },
  rgba: function(str) {
    var split;
    if (str[0] === '#') {
      if (str.length === 4) {
        str = "#" + str[1] + str[1] + str[2] + str[2] + str[3] + str[3];
      }
      return [parseInt(str.slice(1, 3), 16) / 255 || 0, parseInt(str.slice(3, 5), 16) / 255 || 0, parseInt(str.slice(5, 7), 16) / 255 || 0, 1.0];
    }
    if (str.slice(0, 3) === 'rgb') {
      split = str.slice(str.indexOf('(') + 1, +(str.indexOf(')') - 1) + 1 || 9e9).split(',');
      return [parseInt(split[0]) / 255 || 0, parseInt(split[1]) / 255 || 0, parseInt(split[2]) / 255 || 0, parseInt(split[3]) || 1];
    }
    return [0, 0, 0, 1];
  },
  isNaN: function(obj) {
    return util.isNumber(obj) && obj !== +obj;
  },

  /*
  Converts a hex color number to an [R, G, B] array
  
  @method HEXtoRGB
  @param hex {Number}
   */
  hexToRGB: function(hex) {
    return [(hex >> 16 & 0xFF) / 255, (hex >> 8 & 0xFF) / 255, (hex & 0xFF) / 255];
  },
  Float32Array: typeof Float32Array !== "undefined" && Float32Array !== null ? Float32Array : Array,
  Uint16Array: typeof Uint16Array !== "undefined" && Uint16Array !== null ? Uint16Array : Array,
  DeferredProxy: DeferredProxy,
  HasPooling: HasPooling,
  HasSignals: HasSignals,
  Promises: Promises,
  Signal: Signal,
  SignalBinding: SignalBinding
};

_ref = ['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'];
_fn = function(name) {
  return util['is' + name] = function(obj) {
    return toString.call(obj) === '[object ' + name + ']';
  };
};
for (_i = 0, _len = _ref.length; _i < _len; _i++) {
  name = _ref[_i];
  _fn(name);
}

module.exports = util;


},{"util/DeferredProxy":69,"util/HasPooling":71,"util/HasSignals":72,"util/Promises":73,"util/Signal":74,"util/SignalBinding":75}],78:[function(require,module,exports){
var Bullet, Flash, Physical, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Physical = require('plugins/physics/Physical');

Flash = require('Flash');

Bullet = (function(_super) {
  __extends(Bullet, _super);

  function Bullet() {
    return Bullet.__super__.constructor.apply(this, arguments);
  }

  Bullet.plugin(Physical, cg.util.HasPooling);

  Bullet.prototype.reset = function() {
    this.addClass('bullet');
    this.strength = 1;
    this.texture = 'bullet_basic';
    this.anchor.x = this.anchor.y = 0.5;
    this.body.width = this.width;
    this.body.height = this.height;
    this.body.offset.x = -this.width / 2;
    this.body.offset.y = -this.height / 2;
    return this.once(this.body, 'collision', function(spot) {
      cg.sounds.wallHit.play(cg.rand(0.1, 0.3));
      cg('#game').addChild(Flash.pool.spawn({
        x: spot.x,
        y: spot.y
      }));
      return this.destroy();
    });
  };

  return Bullet;

})(cg.Actor);

module.exports = Bullet;


},{"Flash":82,"cg":15,"plugins/physics/Physical":51}],79:[function(require,module,exports){
var Enemy, Explosion, Eye, MAX_LIFE, Physical, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Physical = require('plugins/physics/Physical');

Eye = require('Eye');

Explosion = require('Explosion');

MAX_LIFE = 10;

Enemy = (function(_super) {
  __extends(Enemy, _super);

  function Enemy() {
    return Enemy.__super__.constructor.apply(this, arguments);
  }

  Enemy.plugin(Physical, cg.util.HasPooling);

  Enemy.prototype.reset = function() {
    var rand;
    this.addClass('enemy');
    this.texture = 'enemy_basic';
    this.anchor.x = 0.5;
    this.anchor.y = 1;
    this.body.width = 16;
    this.body.height = 16;
    this.body.offset.x = -this.body.width / 2;
    this.body.offset.y = -this.body.height - 2;
    this.body.bounce = 1;
    this.life = 3;
    this.speed = 100;
    this.scale.x = this.scale.y = 0;
    this.tween({
      duration: 750,
      values: {
        'scale.y': 1
      },
      easeFunc: 'elastic.out'
    });
    cg.sounds.spawn.play(cg.rand(0.3, 0.5));
    this.leftEye = this.addChild(Eye.pool.spawn({
      x: 4,
      y: -12
    }));
    this.rightEye = this.addChild(Eye.pool.spawn({
      x: this.width - 4,
      y: -12
    }));
    this.scale.x = 1;
    rand = function() {
      return cg.rand(100, 250);
    };
    return this.t = 0;
  };

  Enemy.prototype.update = function() {
    var bullet, hit, impulse, other, playerPos, targetVelocity, _i, _len, _ref;
    this.t += cg.dt_seconds;
    this.speed = (100 + 40 * Math.cos(this.t * 3)) * Math.max(0, Math.sin(this.t * 16));
    targetVelocity = this.vecTo(cg('#player')).mag(this.speed);
    this.body.v.$add(targetVelocity.sub(this.body.v).$mul(0.2));
    _ref = cg('enemy');
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      other = _ref[_i];
      if (other === this) {
        continue;
      }
      impulse = cg.physics.collide(this.body, other.body);
      if (!hit && impulse && impulse.len2() > 10000 * 10000) {
        hit = true;
      }
    }
    if (hit) {
      this.leftEye.wince();
      this.rightEye.wince();
    }
    if (bullet = this.touches(cg('bullet'))) {
      this.hit(bullet);
    }
    playerPos = new cg.math.Vector2(cg('#player').worldX, cg('#player').worldY);
    this.leftEye.lookAt(playerPos);
    return this.rightEye.lookAt(playerPos);
  };

  Enemy.prototype.hit = function(bullet) {
    this.body.v.$add(bullet.body.v.mul(0.8));
    cg.sounds.wallHit.play(cg.rand(0.3, 0.5));
    bullet.destroy();
    return this.damage(bullet.strength);
  };

  Enemy.prototype.damage = function(amount) {
    this.life = cg.math.clamp(this.life - amount, 0, MAX_LIFE);
    this.leftEye.wince().ball.rotation = cg.rand(-Math.PI, Math.PI);
    this.rightEye.wince().ball.rotation = cg.rand(-Math.PI, Math.PI);
    this.scale.x = this.scale.y = 2 * amount;
    this.rotation = cg.rand(-0.25, 0.25);
    return this.tween({
      duration: 150,
      values: {
        'scale.x': 1,
        'scale.y': 1,
        'rotation': 0
      }
    }).then(function() {
      if (this.life <= 0) {
        cg.sounds.hit.play();
        cg('#game').addChild(Explosion.pool.spawn({
          x: this.x,
          y: this.y - this.height / 2
        }));
        return this.destroy();
      }
    });
  };

  return Enemy;

})(cg.Actor);

module.exports = Enemy;


},{"Explosion":80,"Eye":81,"cg":15,"plugins/physics/Physical":51}],80:[function(require,module,exports){
var Explosion, Physical, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Physical = require('plugins/physics/Physical');

Explosion = (function(_super) {
  __extends(Explosion, _super);

  function Explosion() {
    return Explosion.__super__.constructor.apply(this, arguments);
  }

  Explosion.plugin(Physical, cg.util.HasPooling);

  Explosion.prototype.reset = function() {
    cg('#game').shake.randomize(20);
    this.addClass('explosion');
    this.texture = null;
    this.width = this.height = 30;
    this.anchor.x = this.anchor.y = 0.5;
    this.scale.x = this.scale.y = cg.rand(1, 2);
    this.anim = cg.sheets.flash.anim([0, 1], cg.dt * 2, false);
    this.on(this.anim, 'end', function() {
      return this.destroy();
    });
    this.radius = 60;
    this.body.width = this.body.height = this.radius * 2;
    this.body.offset.x = this.body.offset.y = -this.body.width / 2;
    this.body.bounded = false;
    this.strength = 1;
    return this.exploded = false;
  };

  Explosion.prototype.update = function() {
    var e, r2, strength, to, _i, _ref;
    if (this.exploded) {
      return;
    }
    r2 = this.radius * this.radius;
    _ref = cg('enemy');
    for (_i = _ref.length - 1; _i >= 0; _i += -1) {
      e = _ref[_i];
      if (this.touches(e)) {
        to = this.vecTo(e);
        strength = (r2 - to.len2()) / r2;
        strength *= strength;
        if (!(strength > 0)) {
          continue;
        }
        e.body.v.$add(to.mag(strength * 700).limit(700));
        e.damage(this.strength);
      }
    }
    return this.exploded = true;
  };

  return Explosion;

})(cg.Actor);

module.exports = Explosion;


},{"cg":15,"plugins/physics/Physical":51}],81:[function(require,module,exports){
var Eye, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Eye = (function(_super) {
  __extends(Eye, _super);

  function Eye() {
    return Eye.__super__.constructor.apply(this, arguments);
  }

  Eye.plugin(cg.util.HasPooling);

  Eye.prototype.reset = function() {
    this.ball = this.addChild(new cg.Actor({
      texture: 'eye',
      anchor: {
        x: 0.5,
        y: 0.5
      },
      rotation: cg.rand(-Math.PI, Math.PI)
    }));
    this.rotationVelocity = 0;
    return this.targetRotation = 0;
  };

  Eye.prototype.lookAt = function(otherWorldPos) {
    var worldPos;
    worldPos = new cg.math.Vector2(this.worldX, this.worldY);
    return this.targetRotation = otherWorldPos.sub(worldPos).angle();
  };

  Eye.prototype.wince = function(scale) {
    if (scale == null) {
      scale = 0.1;
    }
    this.tween('scale.y', scale, 25).then(function() {
      return this.tween('scale.y', 1, 250);
    });
    return this;
  };

  Eye.prototype.update = function() {
    var targetRotationVelocity;
    targetRotationVelocity = cg.math.minAngle(this.targetRotation - this.ball.rotation);
    this.rotationVelocity += (targetRotationVelocity - this.rotationVelocity) * 0.1;
    return this.ball.rotation += this.rotationVelocity;
  };

  return Eye;

})(cg.Actor);

module.exports = Eye;


},{"cg":15}],82:[function(require,module,exports){
var Flash, Physical, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Physical = require('plugins/physics/Physical');

Flash = (function(_super) {
  __extends(Flash, _super);

  function Flash() {
    return Flash.__super__.constructor.apply(this, arguments);
  }

  Flash.plugin(Physical, cg.util.HasPooling);

  Flash.prototype.init = function() {
    return this.anim = cg.sheets.flash.anim([0, 1], cg.dt * 2, false);
  };

  Flash.prototype.reset = function() {
    this.texture = null;
    this.anchor.x = this.anchor.y = 0.5;
    this.anim.rewind();
    return this.once(this.anim, 'end', function() {
      return this.destroy();
    });
  };

  return Flash;

})(cg.Actor);

module.exports = Flash;


},{"cg":15,"plugins/physics/Physical":51}],83:[function(require,module,exports){
var Enemy, Game, Player, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Player = require('Player');

Enemy = require('Enemy');

Game = (function(_super) {
  __extends(Game, _super);

  function Game() {
    return Game.__super__.constructor.apply(this, arguments);
  }

  Game.prototype.init = function() {
    this.bg = this.addChild(new cg.Actor({
      texture: 'bg'
    }));
    this.player = this.addChild(new Player({
      id: 'player',
      x: cg.width / 2,
      y: cg.height / 2
    }));
    this.repeat((function() {
      return cg.rand(100, 1500);
    }), function() {
      return this.addChild(Enemy.pool.spawn({
        x: cg.rand(cg.width),
        y: cg.rand(cg.height)
      }));
    });
    return this.shake = new cg.math.Vector2;
  };

  Game.prototype.update = function() {
    this.shake.limit(10).$mul(0.8);
    this.x = cg.rand(-this.shake.x, this.shake.x);
    return this.y = cg.rand(-this.shake.y, this.shake.y);
  };

  return Game;

})(cg.Scene);

module.exports = Game;


},{"Enemy":79,"Player":85,"cg":15}],84:[function(require,module,exports){
var Game, Juicer, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Game = require('Game');

Juicer = (function(_super) {
  __extends(Juicer, _super);

  function Juicer() {
    return Juicer.__super__.constructor.apply(this, arguments);
  }

  Juicer.prototype.init = function() {
    cg.physics.gravity.zero();
    cg.input.map('player', {
      horiz: ['a/d', 'left/right'],
      vert: ['w/s', 'up/down']
    });
    this.newGame();
    this.on(cg.input, 'keyDown:0', function() {
      return cg.physics.toggleDebugVisuals();
    });
    return this.on(cg.input, 'keyDown:enter', function() {
      return this.newGame();
    });
  };

  Juicer.prototype.newGame = function() {
    var _ref;
    if ((_ref = this.game) != null) {
      _ref.destroy();
    }
    return this.game = this.addChild(new Game({
      id: 'game'
    }));
  };

  return Juicer;

})(cg.Scene);

module.exports = Juicer;


},{"Game":83,"cg":15}],85:[function(require,module,exports){
var Bullet, Eye, Physical, Player, cg,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

cg = require('cg');

Physical = require('plugins/physics/Physical');

Bullet = require('Bullet');

Eye = require('Eye');

Player = (function(_super) {
  __extends(Player, _super);

  function Player() {
    return Player.__super__.constructor.apply(this, arguments);
  }

  Player.plugin(Physical);

  Player.prototype.init = function() {
    this.addClass('player');
    this.texture = 'player_basic';
    this.anchor.x = this.anchor.y = 0.5;
    this.body.bounce = 0;
    this.body.width = this.width;
    this.body.height = this.height;
    this.body.offset.x = -this.width / 2;
    this.body.offset.y = -this.height / 2;
    this.controls = cg.input.controls.player;
    this.speed = 100;
    this.direction = new cg.math.Vector2;
    this.on('horiz', function(val) {
      return this.direction.x = val;
    });
    this.on('vert', function(val) {
      return this.direction.y = val;
    });
    this.on(cg.input, 'mouseDown', function() {
      return this.shooting = true;
    });
    this.on(cg.input, 'mouseUp', function() {
      return this.shooting = false;
    });
    this.repeat(100, function() {
      if (this.shooting) {
        return this.shoot();
      }
    });
    this.jitter = 50;
    this.eyes = this.addChild(new cg.Actor);
    this.leftEye = this.eyes.addChild(Eye.pool.spawn({
      x: -4,
      y: -2
    }));
    this.rightEye = this.eyes.addChild(Eye.pool.spawn({
      x: 4,
      y: -2
    }));
    this.zRotation = 0;
    this.zRotationVelocity = 0;
    this.mask = this.addChild(new cg.gfx.Graphics);
    this.mask.beginFill();
    this.mask.drawCircle(0, 0, 9.5);
    return this.mask.endFill();
  };

  Player.prototype.shoot = function() {
    var jitter, shot;
    cg.sounds.shot.play(cg.rand(0.15, 0.4));
    shot = cg('#game').addChild(Bullet.pool.spawn({
      x: this.x,
      y: this.y
    }));
    this.leftEye.wince(0.5).ball.rotation = cg.rand(-Math.PI, Math.PI);
    this.rightEye.wince(0.5).ball.rotation = cg.rand(-Math.PI, Math.PI);
    jitter = new cg.math.Vector2(cg.rand(-this.jitter, this.jitter), cg.rand(-this.jitter, this.jitter));
    shot.body.v = this.vecToMouse().mag(500).add(jitter);
    shot.rotation = shot.body.v.angle();
    this.body.v.$sub(shot.body.v.mul(0.15));
    return cg('#game').shake.$add(shot.body.v.norm().$mul(4));
  };

  Player.prototype.update = function() {
    var targetVelocity;
    targetVelocity = this.direction.norm().$mul(this.speed);
    this.body.v.$add(targetVelocity.sub(this.body.v).$mul(0.2));
    this.zRotation += (cg.math.minAngle((-this.vecToMouse().angle() - Math.PI * 1.5) - this.zRotation)) * 0.1;
    this.zRotation = cg.math.minAngle(this.zRotation);
    this.eyes.x = (this.zRotation / Math.PI) * 20;
    this.leftEye.lookAt(cg.input.mouse);
    return this.rightEye.lookAt(cg.input.mouse);
  };

  return Player;

})(cg.Actor);

module.exports = Player;


},{"Bullet":78,"Eye":81,"cg":15,"plugins/physics/Physical":51}],86:[function(require,module,exports){
module.exports={
  "textures": {
    "logo": "assets/logo.png",
    "player_basic": "assets/player_basic.png",
    "enemy_basic": "assets/enemy_basic.png",
    "bullet_basic": "assets/bullet_basic.png",
    "bg": "assets/bg.png",
    "eye": "assets/eye.png",
    "smoke": "assets/smoke.png"
  },
  "sheets": {
    "flash": ["assets/flash.png", 30, 30]
  },
  "fonts": {
  },
  "sounds": {
    "shot": "assets/shot.*",
    "hit": "assets/hit.*",
    "wallHit": "assets/wallHit.*",
    "spawn": "assets/spawn.*"
  },
  "music": {
  },
  "json": {
  }
}

},{}],87:[function(require,module,exports){
var Juicer, Physics, UI, assets, cg;

cg = require('cg');

require('index');

UI = require('plugins/ui/UI');

Physics = require('plugins/physics/Physics');

Juicer = require('Juicer');

assets = require('assets.json');

module.exports = function() {
  var loadingScreen;
  cg.plugin(UI);
  cg.plugin(Physics);
  cg.init({
    name: 'Juicer',
    width: 360,
    height: 360,
    backgroundColor: 0xaaaaaa,
    displayMode: 'pixel'
  });
  loadingScreen = cg.stage.addChild(new cg.extras.LoadingScreen);
  loadingScreen.begin();
  cg.assets.preload(assets, {
    error: function(src) {
      return cg.error('Failed to load asset ' + src);
    },
    progress: function(src, data, loaded, count) {
      cg.log("Loaded '" + src + "'");
      return loadingScreen.setProgress(loaded / count);
    },
    complete: function() {
      return loadingScreen.complete().then(function() {
        var pause;
        loadingScreen.destroy();
        cg.stage.addChild(new Juicer({
          id: 'main'
        }));
        cg.stage.addChild(new cg.extras.PauseScreen({
          id: 'pauseScreen'
        }));
        cg('#pauseScreen').hide();
        pause = function() {
          cg.sound.pauseAll();
          cg('#main').pause();
          return cg('#pauseScreen').show();
        };
        cg.on('blur', pause);
        cg('#pauseScreen').on('dismiss', function() {
          cg('#main').resume();
          return cg.sound.resumeAll();
        });
        return pause();
      });
    }
  });
  document.getElementById('pleasewait').style.display = 'none';
  return document.getElementById('combo-game').style.display = 'inherit';
};

module.exports();


},{"Juicer":84,"assets.json":86,"cg":15,"index":27,"plugins/physics/Physics":52,"plugins/ui/UI":57}]},{},[87])


//# sourceMappingURL=main-built.js.map