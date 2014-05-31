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
      @shooting = true

    @on cg.input, 'mouseUp', ->
      @shooting = false

    @repeat 100, ->
      @shoot()  if @shooting

    @jitter = 50

  shoot: ->
    cg.sounds.shot.play(cg.rand(0.15,0.4))
    shot = cg('#game').addChild new Bullet
      x: @worldX + @height/2
      y: @worldY + @width/2

    jitter = new cg.math.Vector2(cg.rand(-@jitter,@jitter), cg.rand(-@jitter,@jitter))
    shot.body.v = @vecToMouse().mag(500).add(jitter)
    shot.rotation = shot.body.v.angle()
    @body.v.$sub(shot.body.v.mul(0.15))

  update: ->
    targetVelocity = @direction.norm().mul(@speed)
    @body.v.$add(targetVelocity.sub(@body.v).mul(0.2))

module.exports = Player
