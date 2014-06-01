cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Eye = require 'Eye'
Explosion = require 'Explosion'

MAX_LIFE = 10

class Enemy extends cg.Actor
  @plugin Physical, cg.util.HasPooling

  reset: ->
    @addClass 'enemy'
    @texture = 'enemy_basic'

    @anchor.x = 0.5
    @anchor.y = 1

    @body.width = 16
    @body.height = 16
    @body.offset.x = -@body.width/2
    @body.offset.y = -@body.height-2
    @body.bounce = 1

    @life = 3
    @speed = 100

    @scale.x = @scale.y = 0
    @tween
      duration: 750
      values:
        'scale.y': 1
      easeFunc: 'elastic.out'

    cg.sounds.spawn.play(cg.rand(0.3,0.5))

    @leftEye = @addChild Eye.pool.spawn
      x: 4
      y: -12

    @rightEye = @addChild Eye.pool.spawn
      x: @width-4
      y: -12
    @scale.x = 1

    rand = -> cg.rand 100, 250
    # @animate ['speed', 0, rand, 'back.out'], ['speed', @speed, rand, 'quad.out']
    @t = 0

  update: ->
    @t += cg.dt_seconds
    @speed = (100 + 40*Math.cos(@t*3)) * Math.max 0, Math.sin @t*16
    targetVelocity = @vecTo(cg('#player')).mag(@speed)
    @body.v.$add(targetVelocity.sub(@body.v).$mul(0.2))

    for other in cg('enemy')
      continue  if other is @
      impulse = cg.physics.collide @body, other.body
      if !hit and impulse and impulse.len2() > 10000*10000
        hit = true

    if hit
      @leftEye.wince()
      @rightEye.wince()

    if bullet = @touches cg('bullet')
      @hit(bullet)

    playerPos = new cg.math.Vector2 cg('#player').worldX, cg('#player').worldY
    @leftEye.lookAt playerPos
    @rightEye.lookAt playerPos

  hit: (bullet) ->
    @body.v.$add(bullet.body.v.mul(0.8))
    cg.sounds.wallHit.play(cg.rand(0.3,0.5))
    bullet.destroy()
    @damage bullet.strength

  damage: (amount) ->
    @life = cg.math.clamp @life-amount, 0,MAX_LIFE
    @leftEye.wince().ball.rotation = cg.rand -Math.PI, Math.PI
    @rightEye.wince().ball.rotation = cg.rand -Math.PI, Math.PI
    @scale.x = @scale.y = 2*amount
    @rotation = cg.rand -0.25, 0.25
    @tween
      duration: 150
      values:
        'scale.x': 1
        'scale.y': 1
        'rotation': 0
    .then ->
      if @life <= 0
        cg.sounds.hit.play()
        cg('#game').addChild Explosion.pool.spawn
          x: @x
          y: @y-@height/2
        @destroy()

module.exports = Enemy
