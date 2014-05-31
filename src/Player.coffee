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
    @direction = new cg.math.Vector2

    @on 'horiz', (val) ->
      @direction.x = val

    @on 'vert', (val) ->
      @direction.y = val

    @on cg.input, 'mouseDown', ->
      @shoot()

  shoot: ->
    cg.sounds.shot.play(0.4)
    shot = cg('#game').addChild new Bullet
      x: @worldX
      y: @worldY

    shot.body.v = @vecToMouse().mag(500)

  update: ->
    targetVelocity = @direction.norm().mul(@speed)
    @body.v.$add(targetVelocity.sub(@body.v).mul(0.2))

module.exports = Player
