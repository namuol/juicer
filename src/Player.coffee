cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Interactive = require 'plugins/ui/Interactive'
Bullet = require 'Bullet'

class Player extends cg.Actor
  @plugin Physical, Interactive

  init: ->
    @addClass 'player'
    @texture = 'player_basic'
    @body.bounce = 0
    @body.width = @width
    @body.height = @height

    @controls = cg.input.controls.player

    @speed = 100

    @on 'horiz', (val) ->
      @body.v.x = val * @speed

    @on 'vert', (val) ->
      @body.v.y = val * @speed

    @on cg.input, 'mouseDown', ->
      @shoot()

  shoot: ->
    shot = cg('#game').addChild new Bullet
      x: @worldX
      y: @worldY

    shot.body.v = @vecToMouse().mag(500)

  update: ->
    # Called once every frame.

module.exports = Player
