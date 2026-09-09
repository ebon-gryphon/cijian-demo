// Short-lived wave crests travelling away from either side of a pointer stroke.
// Drawing is idle when the water settles and never intercepts page interaction.
export function createCoverWater(canvas: HTMLCanvasElement, surface: HTMLElement) {
  const context = canvas.getContext('2d');
  if (!context) return { move(_x: number, _y: number) {}, tap(_x: number, _y: number) {}, leave() {}, dispose() {} };
  const ctx = context;
  type Wave = { x: number; y: number; angle: number; born: number; ring: boolean };
  let waves: Wave[] = [];
  let previous: { x: number; y: number } | null = null;
  let distanceSinceWave = 0;
  let frame: number | null = null;
  let width = 0;
  let height = 0;
  let disposed = false;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lifetime = 1800;

  function clear() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    waves = [];
    previous = null;
    distanceSinceWave = 0;
    ctx.clearRect(0, 0, width, height);
  }
  function resize() {
    width = surface.clientWidth;
    height = surface.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    clear();
  }
  function crest(wave: Wave, elapsed: number, offset: number) {
    const age = elapsed - offset;
    if (age < 0) return;
    const progress = age / lifetime;
    const envelope = Math.min(1, age / 120) * Math.pow(1 - progress, 1.7);
    const radius = 7 + age * (wave.ring ? 0.075 : 0.064);
    const arc = wave.ring ? [0, Math.PI * 2] : [Math.PI * 0.16, Math.PI * 0.84];
    ctx.save();
    ctx.translate(wave.x, wave.y);
    ctx.rotate(wave.angle);
    const sides = wave.ring ? [1] : [-1, 1];
    for (const side of sides) {
      ctx.save();
      ctx.scale(1, side);
      const dark = ctx.createLinearGradient(-radius, 0, radius, 0);
      dark.addColorStop(0, 'rgba(123, 104, 82, 0)');
      dark.addColorStop(0.3, `rgba(123, 104, 82, ${envelope * 0.31})`);
      dark.addColorStop(0.7, `rgba(123, 104, 82, ${envelope * 0.31})`);
      dark.addColorStop(1, 'rgba(123, 104, 82, 0)');
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.84, radius, 0, arc[0], arc[1]);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.15;
      ctx.stroke();
      // A neighbouring bright crest makes the line read as raised water.
      const shine = ctx.createLinearGradient(-radius, 0, radius, 0);
      shine.addColorStop(0, 'rgba(255, 253, 246, 0)');
      shine.addColorStop(0.35, `rgba(255, 253, 246, ${envelope * 0.9})`);
      shine.addColorStop(0.65, `rgba(255, 253, 246, ${envelope * 0.9})`);
      shine.addColorStop(1, 'rgba(255, 253, 246, 0)');
      ctx.beginPath();
      ctx.ellipse(0, 1.6, radius * 0.84, radius, 0, arc[0], arc[1]);
      ctx.strokeStyle = shine;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function draw(time: number) {
    frame = null;
    ctx.clearRect(0, 0, width, height);
    waves = waves.filter(wave => time - wave.born < lifetime);
    for (const wave of waves) {
      const elapsed = time - wave.born;
      crest(wave, elapsed, 0);
      crest(wave, elapsed, 190);
    }
    if (waves.length && !disposed && !document.hidden && !media.matches) frame = requestAnimationFrame(draw);
  }
  function start() {
    if (frame === null && !disposed && !document.hidden && !media.matches) frame = requestAnimationFrame(draw);
  }
  function move(x: number, y: number) {
    if (media.matches || document.hidden || disposed) return;
    if (!previous) { previous = { x, y }; return; }
    const dx = x - previous.x;
    const dy = y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return;
    const angle = Math.atan2(dy, dx);
    // Sample by travelled distance, so a slow stroke also leaves a continuous wake.
    const spacing = 24;
    let step = spacing - distanceSinceWave;
    const time = performance.now();
    let count = 0;
    for (; step <= distance && count < 12; step += spacing, count++) {
      const fraction = step / distance;
      waves.push({ x: previous.x + dx * fraction, y: previous.y + dy * fraction, angle, born: time, ring: false });
    }
    distanceSinceWave = (distanceSinceWave + distance) % spacing;
    previous = { x, y };
    waves = waves.slice(-48);
    start();
  }
  function tap(x: number, y: number) {
    if (media.matches || document.hidden || disposed) return;
    waves.push({ x, y, angle: 0, born: performance.now(), ring: true });
    waves = waves.slice(-48);
    start();
  }
  function leave() { previous = null; distanceSinceWave = 0; }
  function preferences() { if (media.matches) clear(); }
  function visibility() { if (document.hidden) clear(); }
  const observer = new ResizeObserver(resize);
  observer.observe(surface);
  resize();
  media.addEventListener('change', preferences);
  document.addEventListener('visibilitychange', visibility);
  return {
    move, tap, leave,
    dispose() {
      disposed = true;
      clear();
      observer.disconnect();
      media.removeEventListener('change', preferences);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
