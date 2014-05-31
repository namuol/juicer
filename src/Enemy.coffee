cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Interactive = require 'plugins/ui/Interactive'

class Enemy extends cg.Actor
  @plugin Physical, Interactive

  init: ->
    @addClass 'enemy'
    @texture = 'enemy_basic'

    @anchor.x = @anchor.y = 0.5

    @body.width = @width
    @body.height = @height
    @body.offset.x = -@width/2
    @body.offset.y = -@height/2

    @life = 3

  update: ->
    @body.v.set(@vecTo(cg('#player'))).mag(50)

    for other in cg('enemy')
      cg.physics.collide @body, other.body  unless other is @

    if bullet = @touches cg('bullet')
      @hit(bullet)

  hit: (bullet) ->
    cg.sounds.wallHit.play(cg.rand(0.3,0.5))
    bullet.destroy()
    @life -= bullet.strength
    @scale.x = @scale.y = 1.5
    @tween 'scale.x', 1, 150
    @tween 'scale.y', 1, 150
    if @life <= 0
      cg.sounds.hit.play()
      @destroy()

module.exports = Enemy
