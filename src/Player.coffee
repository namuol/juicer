cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Bullet = require 'Bullet'
Eye = require 'Eye'
Flash = require 'Flash'

class Player extends cg.Actor
  @plugin Physical

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

    @eyes = @addChild new cg.Actor

    @leftEye = @eyes.addChild Eye.pool.spawn
      x: -4
      y: -2

    @rightEye = @eyes.addChild Eye.pool.spawn
      x: 4
      y: -2

    @zRotation = 0
    @zRotationVelocity = 0

    @mask = @addChild new cg.gfx.Graphics
    @mask.beginFill()
    @mask.drawCircle(0,0,9.5)
    @mask.endFill()

  shoot: ->
    cg.sounds.shot.play(cg.rand(0.15,0.4))
    shot = cg('#game').addChild Bullet.pool.spawn
      x: @x
      y: @y

    @leftEye.wince(0.5).ball.rotation = cg.rand -Math.PI, Math.PI
    @rightEye.wince(0.5).ball.rotation = cg.rand -Math.PI, Math.PI

    jitter = new cg.math.Vector2(cg.rand(-@jitter,@jitter), cg.rand(-@jitter,@jitter))
    shot.body.v = @vecToMouse().mag(500).add(jitter)
    shot.rotation = shot.body.v.angle()

    offset = shot.body.v.norm().mul(8)
    cg('#game').addChildAt Flash.pool.spawn(
      x: @x + offset.x
      y: @y + offset.y
      scale:
        x: 0.75
        y: 0.75
    ), @getChildIndex()

    @body.v.$sub(shot.body.v.mul(0.15))
    cg('#game').shake.$add(shot.body.v.norm().$mul(4))

  update: ->
    targetVelocity = @direction.norm().$mul(@speed)
    @body.v.$add(targetVelocity.sub(@body.v).$mul(0.2))
    @zRotation += (cg.math.minAngle (-@vecToMouse().angle()-Math.PI*1.5)-@zRotation) * 0.1
    @zRotation = cg.math.minAngle @zRotation
    @eyes.x = (@zRotation / Math.PI) * 20
    @leftEye.lookAt cg.input.mouse
    @rightEye.lookAt cg.input.mouse

module.exports = Player
