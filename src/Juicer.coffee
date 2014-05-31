cg = require 'cg'
Game = require 'Game'

class Juicer extends cg.Scene
  init: ->
    cg.physics.gravity.zero()

    cg.input.map 'player',
      horiz: ['a/d', 'left/right']
      vert: ['w/s', 'up/down']

    @newGame()

    @on cg.input, 'keyDown:0', ->
      cg.physics.toggleDebugVisuals()

    @on cg.input, 'keyDown:enter', ->
      @newGame()

  newGame: ->
    @game?.destroy()

    @game = @addChild new Game
      id: 'game'

module.exports = Juicer
