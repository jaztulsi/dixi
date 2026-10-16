// Dixi, the marble mascot (same renders as the website). UI only: it shows the voice state and its eyes
// follow the cursor. setPose('face' | 'neutral' | 'curious' | 'happy' | 'nod' | 'sleep').

const FACE = [463, 640]; // face sprite size; the render's painted eyes were removed so live ones can move
const EYES = [
  { cx: 0.338, cy: 0.473, rx: 0.0884, ry: 0.0802 },
  { cx: 0.7504, cy: 0.4132, rx: 0.0799, ry: 0.0802 },
];
const POSES = ['neutral', 'curious', 'happy', 'nod', 'sleep'];
const NS = 'http://www.w3.org/2000/svg';

export function mountMascot(root, { eyes = true } = {}) {
  root.classList.add('mascot');
  root.setAttribute('aria-hidden', 'true');
  const face = document.createElement('div');
  face.className = 'mascot-face';
  face.innerHTML = `<img src="assets/mascot-face.webp" alt="" draggable="false">`;
  const groups = [];
  if (eyes) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${FACE[0]} ${FACE[1]}`);
    for (const e of EYES) {
      const cx = e.cx * FACE[0], cy = e.cy * FACE[1], rx = e.rx * FACE[0] * 0.92, ry = e.ry * FACE[1] * 0.98;
      const blink = document.createElementNS(NS, 'g');
      blink.setAttribute('class', 'mascot-blink');
      blink.innerHTML = `<g class="eye"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" class="eye-ball"/>
        <g class="glint"><ellipse cx="${cx + rx * 0.22}" cy="${cy - ry * 0.38}" rx="${rx * 0.24}" ry="${ry * 0.22}"/>
        <circle cx="${cx - rx * 0.3}" cy="${cy + ry * 0.35}" r="${rx * 0.09}" opacity="0.85"/></g></g>`;
      svg.append(blink);
      groups.push({ eye: blink.querySelector('.eye'), glint: blink.querySelector('.glint'), rx, ry });
    }
    face.append(svg);
  }
  root.append(face);
  const poses = Object.fromEntries(POSES.map((p) => {
    const img = document.createElement('img');
    img.src = `assets/mascot-${p}.webp`;
    img.alt = '';
    img.draggable = false;
    img.className = 'mascot-pose';
    root.append(img);
    return [p, img];
  }));

  // Eyes travel ~30% of their radius toward the cursor; the glints lag (they're reflections).
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, lastMove = 0;
  const step = () => {
    x += (tx - x) * 0.18; y += (ty - y) * 0.18;
    for (const g of groups) {
      g.eye.setAttribute('transform', `translate(${x * g.rx * 0.3} ${y * g.ry * 0.3})`);
      g.glint.setAttribute('transform', `translate(${-x * g.rx * 0.1} ${-y * g.ry * 0.1})`);
    }
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
  };
  const look = (nx, ny) => { tx = nx; ty = ny; if (!raf) raf = requestAnimationFrame(step); };
  window.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    if (!r.width) return;
    lastMove = Date.now();
    look(Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 500)),
      Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.4)) / 400)));
  }, { passive: true });
  // Idle glances when nobody is moving the mouse (hands-free users mostly won't).
  setInterval(() => { if (Date.now() - lastMove > 2500 && root.offsetParent) look(Math.random() * 1.2 - 0.6, Math.random() * 0.8 - 0.4); }, 1900);

  let current = 'face';
  return {
    setPose(pose) {
      if (pose === current) return;
      current = pose;
      face.classList.toggle('on', pose === 'face');
      for (const [p, img] of Object.entries(poses)) img.classList.toggle('on', p === pose);
    },
    init() { face.classList.add('on'); },
  };
}
