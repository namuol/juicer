cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Interactive = require 'plugins/ui/Interactive'

class Enemy extends cg.Actor
  @plugin Physical, Interactive

  init: ->
    @addClass 'enemy'
    @texture = 'enemy_basic'
    @body.width = @width
    @body.height = @height

  update: ->
    @body.v.set(@vecTo(cg('#player'))).mag(50)

    if bullet = @touches cg('bullet')
      @hit(bullet)

  hit: (bullet) ->
    cg.sounds.hit.play()
    @destroy()
    bullet.destroy()

module.exports = Enemy
