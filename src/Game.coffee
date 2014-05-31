cg = require 'cg'
Player = require 'Player'
Enemy = require 'Enemy'

class Game extends cg.Scene
  init: ->
    @player = @addChild new Player
      id: 'player'
      x: cg.width/2
      y: cg.height/2

    @repeat (-> cg.rand(100, 1500)), ->
      @addChild new Enemy
        x: cg.rand cg.width
        y: cg.rand cg.height

  update: ->
    # Called once every frame.

module.exports = Game
