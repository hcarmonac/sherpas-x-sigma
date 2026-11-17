function drawRidges(context, width, height) {
  const ranges = [
    { color: '#202d51', skyline: [.62, .45, .51, .23, .37, .16, .31, .22, .47] },
    { color: '#26395f', skyline: [.79, .63, .72, .48, .60, .34, .43, .37, .58] },
    { color: '#2d4568', skyline: [.95, .77, .87, .68, .74, .55, .64, .52, .66] },
  ];
  for (const { color, skyline } of ranges) {
    context.beginPath();
    context.moveTo(0, height);
    skyline.forEach((y, index) => context.lineTo(width * index / (skyline.length - 1), y * height));
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = '#8798c735';
    context.lineWidth = 1;
    context.stroke();
  }
}

function drawContours(context, width, height) {
  const spread = Math.min(width, height);
  context.lineWidth = 1;
  context.strokeStyle = '#aebce442';
  for (const [cx, cy, rotation] of [[.24, .29, 0], [.84, .72, 2.5]]) {
    for (let ring = 1; ring <= 11; ring += 1) {
      context.beginPath();
      for (let n = 0; n < 64; n += 1) {
        const angle = n / 64 * Math.PI * 2;
        const radius = spread * ring / 15 *
          (1 + .17 * Math.sin(angle * 3 + rotation) + .08 * Math.cos(angle * 5 - rotation));
        const x = width * cx + Math.cos(angle) * radius * 1.32;
        const y = height * cy + Math.sin(angle) * radius * .82;
        if (n === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.stroke();
    }
  }
}

function pointOnLeg({ from, bend, to }, fraction) {
  const rest = 1 - fraction;
  return {
    x: rest ** 2 * from.x + 2 * rest * fraction * bend.x + fraction ** 2 * to.x,
    y: rest ** 2 * from.y + 2 * rest * fraction * bend.y + fraction ** 2 * to.y,
  };
}

function drawSegment(context, leg, fraction = 1) {
  const { from, bend } = leg;
  const rest = 1 - fraction;
  const end = pointOnLeg(leg, fraction);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.quadraticCurveTo(
    rest * from.x + fraction * bend.x,
    rest * from.y + fraction * bend.y,
    end.x,
    end.y,
  );
  context.stroke();
}

export function installTrailMap(board) {
  const canvas = board.querySelector('canvas');
  const context = canvas.getContext('2d');
  const yak = board.querySelector('.trail-traveler');
  let frame;
  let visited;
  let travelerPosition;

  function draw(animate = false) {
    cancelAnimationFrame(frame);
    const { clientWidth: width, clientHeight: height } = board;
    const stops = [...board.querySelectorAll('.trail-stop')];
    if (!width || !stops.length) return;

    const portrait = width < 510;
    board.classList.toggle('trail-map-portrait', portrait);
    const points = stops.map((stop, index) => {
      const distance = index / Math.max(1, stops.length - 1);
      const x = portrait ? (index % 2 === 0 ? 25 : 73) : 14 + 70 * distance;
      const y = portrait ? 72 - 53 * distance : 68 - 46 * distance + 14 * Math.sin(4 * Math.PI * distance);
      stop.style.setProperty('--stop-x', `${x}%`);
      stop.style.setProperty('--stop-y', `${y}%`);
      return { x: width * x / 100, y: height * y / 100 };
    });
    const start = { x: width * (portrait ? .035 : .07), y: height * (portrait ? .91 : .80) };
    const legs = points.map((to, index) => {
      const from = points[index - 1] ?? start;
      return { from, to, bend: { x: from.x + (to.x - from.x) * .7, y: from.y - 25 } };
    });
    const buttons = stops.map((stop) => stop.querySelector('button'));
    const destination = buttons.findIndex((button) => button.getAttribute('aria-current') === 'step');
    const origin = buttons.some((button) => button.dataset.stop === visited) ? travelerPosition : destination;
    visited = buttons[destination].dataset.stop;

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const traceDuration = motion && animate ? 550 : 0;
    const moveDuration = motion && origin !== destination ? 285 : 0;
    const began = performance.now();
    yak.hidden = false;

    function paint(now) {
      const elapsed = now - began;
      const progress = traceDuration ? Math.min(1, elapsed / traceDuration) : 1;
      context.clearRect(0, 0, width, height);
      context.setLineDash([]);
      drawRidges(context, width, height);
      drawContours(context, width, height);
      context.lineCap = 'round';

      for (const [index, leg] of legs.entries()) {
        context.lineWidth = 7;
        context.strokeStyle = '#0e1731';
        drawSegment(context, leg);
        context.lineWidth = 3;
        context.strokeStyle = index === destination ? '#efcb8f' : '#acb9df';
        context.setLineDash([3, 6]);
        drawSegment(context, leg);
        context.setLineDash([]);
        if (stops[index].classList.contains('done')) {
          context.lineWidth = 4;
          context.strokeStyle = '#81e0c5';
          const revealed = stops[index].classList.contains('earned') ? 1 - (1 - progress) ** 3 : 1;
          drawSegment(context, leg, revealed);
        }
      }

      context.beginPath();
      context.arc(start.x, start.y, 4, 0, Math.PI * 2);
      context.fillStyle = '#c4d1fc';
      context.fill();

      const arrival = moveDuration ? Math.min(1, elapsed / moveDuration) : 1;
      travelerPosition = origin + (destination - origin) * (1 - (1 - arrival) ** 3);
      const step = Math.floor(travelerPosition);
      const point = legs[step + 1]
        ? pointOnLeg(legs[step + 1], travelerPosition - step)
        : points[step];
      yak.style.transform = `translate(${point.x}px, ${point.y}px)`;

      if (progress < 1 || arrival < 1) frame = requestAnimationFrame(paint);
    }

    paint(began);
  }

  new ResizeObserver(() => draw()).observe(board);
  return draw;
}
