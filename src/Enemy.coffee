cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Eye = require 'Eye'

class Enemy extends cg.Actor
  @plugin Physical, cg.util.HasPooling

  reset: ->
    @addClass 'enemy'
    @texture = 'enemy_basic'

    @anchor.x = @anchor.y = 0.5

    @body.width = 16
    @body.height = 16
    @body.offset.x = -@body.width/2
    @body.offset.y = -@body.height/2
    @body.bounce = 1

    @life = 3
    @speed = 100

    @scale.x = @scale.y = 0
    @tween
      duration: 750
      values:
        'scale.x': 1
        'scale.y': 1
      easeFunc: 'elastic.out'

    cg.sounds.spawn.play(cg.rand(0.3,0.5))

    @leftEye = @addChild Eye.pool.spawn
      x: 4
      y: -2

    @rightEye = @addChild Eye.pool.spawn
      x: @width-4
      y: -2

    rand = -> cg.rand 100, 250
    # @animate ['speed', 0, rand, 'back.out'], ['speed', @speed, rand, 'quad.out']
    @t = 0

  update: ->
    @t += cg.dt_seconds
    @speed = (100 + 40*Math.cos(@t*3)) * Math.max 0, Math.sin @t*16
    targetVelocity = @vecTo(cg('#player')).mag(@speed)
    @body.v.$add(targetVelocity.sub(@body.v).$mul(0.2))

    for other in cg('enemy')
      cg.physics.collide @body, other.body  unless other is @

    if bullet = @touches cg('bullet')
      @hit(bullet)

    playerPos = new cg.math.Vector2 cg('#player').worldX, cg('#player').worldY
    @leftEye.lookAt playerPos
    @rightEye.lookAt playerPos

  hit: (bullet) ->
    @body.v.$add(bullet.body.v.mul(0.5))
    cg.sounds.wallHit.play(cg.rand(0.3,0.5))
    bullet.destroy()
    @life -= bullet.strength
    @leftEye.wince().ball.rotation = cg.rand -Math.PI, Math.PI
    @rightEye.wince().ball.rotation = cg.rand -Math.PI, Math.PI
    @scale.x = @scale.y = 2
    @rotation = cg.rand -0.25, 0.25
    @tween
      duration: 150
      values:
        'scale.x': 1
        'scale.y': 1
        'rotation': 0
    if @life <= 0
      cg.sounds.hit.play()
      @destroy()

module.exports = Enemy
