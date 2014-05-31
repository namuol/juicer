cg = require 'cg'
Player = require 'Player'
Enemy = require 'Enemy'

class Game extends cg.Scene
  init: ->
    @bg = @addChild new cg.Actor
      texture: 'bg'

    @player = @addChild new Player
      id: 'player'
      x: cg.width/2
      y: cg.height/2

    @repeat (-> cg.rand(100, 1500)), ->
      @addChild Enemy.pool.spawn
        x: cg.rand cg.width
        y: cg.rand cg.height

    @shake = new cg.math.Vector2

  update: ->
    # Called once every frame.
    @shake.limit(10).$mul(0.8)
    @x = cg.rand -@shake.x, @shake.x
    @y = cg.rand -@shake.y, @shake.y

module.exports = Game
