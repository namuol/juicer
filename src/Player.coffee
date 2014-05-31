cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Interactive = require 'plugins/ui/Interactive'
Bullet = require 'Bullet'
Eye = require 'Eye'

class Player extends cg.Actor
  @plugin Physical, Interactive

  init: ->
    @addClass 'player'
    @texture = 'player_basic'
    @anchor.x = @anchor.y = 0.5
    @body.bounce = 0
    @body.width = @width
    @body.height = @height
    @body.offset.x = -@width/2
    @body.offset.y = -@height/2

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

    @leftEye = @addChild new Eye
      x: -4
      y: -2

    @rightEye = @addChild new Eye
      x: 4
      y: -2

  shoot: ->
    cg.sounds.shot.play(cg.rand(0.15,0.4))
    shot = cg('#game').addChild new Bullet
      x: @x
      y: @y

    @leftEye.wince(0.5).ball.rotation = cg.rand -Math.PI, Math.PI
    @rightEye.wince(0.5).ball.rotation = cg.rand -Math.PI, Math.PI

    jitter = new cg.math.Vector2(cg.rand(-@jitter,@jitter), cg.rand(-@jitter,@jitter))
    shot.body.v = @vecToMouse().mag(500).add(jitter)
    shot.rotation = shot.body.v.angle()
    @body.v.$sub(shot.body.v.mul(0.15))
    cg('#game').shake.$add(shot.body.v.norm().mul(2))

  update: ->
    targetVelocity = @direction.norm().mul(@speed)
    @body.v.$add(targetVelocity.sub(@body.v).mul(0.2))
    # @flipX = @body.v.x < 0

    @leftEye.lookAt cg.input.mouse
    @rightEye.lookAt cg.input.mouse

module.exports = Player
