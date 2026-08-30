/* Games manifest (prompt 05). Mirrors the legacy Flask app exactly:
   - name/slug/description are verbatim from obs_app.py `available_games`.
   - icon/color are the per-slug choices in obs_templates/games/games_list.html.
   - css/scripts reproduce the <link>/<script> order in game_detail.html — order matters,
     each game's game.js depends on the files listed before it.
   - controls/className/globalName/pauseMethod capture the remaining per-slug Jinja
     branches from game_detail.html so game.html can stay data-driven.
   Game internals are unchanged, so asset paths stay absolute (/static/games/...) and the
   tree is copied to app/static/games/ — only app/ is published. */

export const GAMES = [
  {
    slug: 'tejas-thrust',
    name: 'AMCA Thrust',
    description: 'A kid-friendly fighter plane game where you pilot a blue plane and battle enemy aircraft!',
    icon: 'fa-fighter-jet',
    color: 'primary',
    // game_detail.html gives tejas-thrust no container/controls modifier class.
    className: '',
    css: [],
    scripts: [
      '/static/games/tejas_thrust/js/config.js',
      '/static/games/tejas_thrust/js/laser.js',
      '/static/games/tejas_thrust/js/cloud.js',
      '/static/games/tejas_thrust/js/plane.js',
      '/static/games/tejas_thrust/js/game.js',
    ],
    globalName: 'TejasThrust',
    pauseMethod: 'togglePause',
    // Legacy listened for a `gameOver` event for this game rather than polling.
    gameOverMode: 'event',
    controls: [
      { icon: 'fa-arrows-alt', text: 'Arrow Keys: Move' },
      { icon: 'fa-space-shuttle', text: 'Spacebar: Shoot' },
      { icon: 'fa-pause', text: 'P: Pause' },
    ],
  },
  {
    slug: 'tank-attack',
    name: 'Tank Attack',
    description: 'Control a blue dot and defend against enemy tanks! Collect power boosts to unleash devastating fireballs!',
    icon: 'fa-crosshairs',
    color: 'danger',
    className: 'tank-attack',
    css: [],
    scripts: [
      '/static/games/tank_attack/js/config.js',
      '/static/games/tank_attack/js/powerboost.js',
      '/static/games/tank_attack/js/tank.js',
      '/static/games/tank_attack/js/bluedot.js',
      '/static/games/tank_attack/js/game.js',
    ],
    globalName: 'TankAttack',
    // Legacy called game.pause() for tank-attack, not togglePause().
    pauseMethod: 'pause',
    gameOverMode: 'poll',
    controls: [
      { icon: 'fa-arrow-up', text: 'Up Arrow: Move Up' },
      { icon: 'fa-arrow-down', text: 'Down Arrow: Move Down' },
      { icon: 'fa-space-shuttle', text: 'Spacebar: Shoot Laser' },
      { icon: 'fa-fire', text: 'F Key: Shoot Fireball (when available)' },
      { icon: 'fa-pause', text: 'P: Pause' },
    ],
  },
  {
    slug: 'geodash',
    name: 'GeoDash',
    description: 'A geometry dash inspired game! Guide a dragon through obstacles by jumping at the right time!',
    icon: 'fa-dragon',
    color: 'success',
    className: 'geodash',
    css: ['/static/games/geodash/css/geodash.css'],
    scripts: [
      '/static/games/geodash/js/config.js',
      '/static/games/geodash/js/player.js',
      '/static/games/geodash/js/obstacle.js',
      '/static/games/geodash/js/game.js',
    ],
    globalName: 'GeoDash',
    pauseMethod: 'togglePause',
    gameOverMode: 'poll',
    controls: [
      { icon: 'fa-space-shuttle', text: 'Spacebar: Jump' },
      { icon: 'fa-hand-pointer', text: 'Touch: Jump (mobile)' },
      { icon: 'fa-pause', text: 'P: Pause' },
      { icon: 'fa-redo', text: 'R: Restart (when game over)' },
    ],
  },
  {
    slug: 'mmh',
    name: 'Zapper',
    description: 'Race your motorcycle down the highway! Dodge traffic and see how far you can go!',
    icon: 'fa-motorcycle',
    color: 'warning',
    className: 'mmh',
    css: ['/static/games/mmh/css/mmh.css'],
    scripts: [
      '/static/games/mmh/js/config.js',
      '/static/games/mmh/js/road.js',
      '/static/games/mmh/js/player.js',
      '/static/games/mmh/js/obstacle.js',
      '/static/games/mmh/js/game.js',
    ],
    globalName: 'MotorcycleMayhem',
    pauseMethod: 'togglePause',
    // DEVIATION (flagged): game_detail.html had no game-over branch for mmh, so a finished
    // race never re-showed the controls overlay. mmh exposes `gameOver` like geodash, so it
    // polls here too — legacy behaviour looks like an oversight, not a deliberate choice.
    gameOverMode: 'poll',
    controls: [
      // Legacy renders two separate <i> elements on this line.
      { icon: ['fa-arrow-left', 'fa-arrow-right'], text: 'Arrow Keys: Move Left/Right' },
      { icon: 'fa-rocket', text: 'Spacebar: Accelerate' },
      { icon: 'fa-hand-pointer', text: 'Touch: Move & Accelerate (mobile)' },
      { icon: 'fa-pause', text: 'P: Pause' },
      { icon: 'fa-redo', text: 'R: Restart (when game over)' },
    ],
  },
];

export function gameBySlug(slug) {
  return GAMES.find((g) => g.slug === slug) || null;
}
