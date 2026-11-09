// Draws assets/activity.svg — the orange dot version of the GitHub contribution graph.
// Runs in GitHub Actions every day. No packages needed (Node 20+).
//   GH_TOKEN=... GH_USER=Ziadk7474 node scripts/activity.mjs
//   node scripts/activity.mjs --local days.json   (array of {date, count})
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fonts = JSON.parse(readFileSync(join(here, 'fonts.json'), 'utf8'));

const C = { bg: '#0A0A0B', line: '#212124', line2: '#2C2C30', white: '#FFFFFF', soft: '#D9D9DE', muted: '#8E8E96', dim: '#5C5C63', or: '#FF6B1A', or2: '#FF9A57' };
const LEVEL = [
  { r: 2.1, fill: '#26262A' },
  { r: 3.1, fill: '#6B2E0E' },
  { r: 4.0, fill: '#B5470B' },
  { r: 4.9, fill: C.or },
  { r: 5.6, fill: C.or2 },
];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function fromGitHub(user, token) {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    totalContributions weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-activity' },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  const j = await res.json();
  if (!res.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  const cal = j.data.user.contributionsCollection.contributionCalendar;
  return cal.weeks.flatMap(w => w.contributionDays.map(d => ({ date: d.date, count: d.contributionCount })));
}

function fromLocal(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const map = new Map(raw.map(d => [d.date, d.count]));
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today); start.setUTCDate(start.getUTCDate() - 364);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back to Sunday
  const days = [];
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    days.push({ date: k, count: map.get(k) || 0 });
  }
  return days;
}

function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1, current = 0;
  if (days[i] && days[i].count === 0) i--; // today may still be empty
  while (i >= 0 && days[i].count > 0) { current++; i--; }
  return { current, longest };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = (x, y, s, cls, size, fill, anchor = '', ls = '') =>
  `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${ls !== '' ? ` letter-spacing="${ls}"` : ''}>${esc(s)}</text>`;

function render(days) {
  const W = 840, H = 300;
  const total = days.reduce((a, d) => a + d.count, 0);
  const { current, longest } = streaks(days);
  const best = days.reduce((a, d) => (d.count > a.count ? d : a), { count: 0, date: '' });
  const last30 = days.slice(-30).reduce((a, d) => a + d.count, 0);
  const active = days.filter(d => d.count > 0).length;

  // levels from quartiles of non-zero days
  const nz = days.filter(d => d.count > 0).map(d => d.count).sort((a, b) => a - b);
  const q = p => nz.length ? nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] : 1;
  const cuts = [q(0.25), q(0.5), q(0.8)];
  const level = c => (c === 0 ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);

  // weeks: columns start on Sunday
  const weeks = [];
  for (const d of days) {
    const wd = new Date(d.date + 'T00:00:00Z').getUTCDay();
    if (wd === 0 || !weeks.length) weeks.push([]);
    weeks[weeks.length - 1][wd] = d;
  }
  const cols = weeks.length;
  const pitch = 14, gx = 64, gy = 148;
  const gridW = cols * pitch;
  const beamDur = 7;

  let css = `@font-face{font-family:SG;font-weight:700;src:url(data:font/woff2;base64,${fonts.SG700}) format('woff2')}
@font-face{font-family:JB;font-weight:400;src:url(data:font/woff2;base64,${fonts.JB400}) format('woff2')}
@font-face{font-family:JB;font-weight:600;src:url(data:font/woff2;base64,${fonts.JB600}) format('woff2')}
.d7{font-family:SG,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:700}
.m4{font-family:JB,ui-monospace,Menlo,Consolas,monospace;font-weight:400}
.m6{font-family:JB,ui-monospace,Menlo,Consolas,monospace;font-weight:600}
.col{opacity:.62;animation:wave ${beamDur}s linear infinite}
@keyframes wave{0%{opacity:1}6%{opacity:.62}100%{opacity:.62}}
.beam{animation:beam ${beamDur}s linear infinite}
@keyframes beam{from{transform:translateX(0)}to{transform:translateX(${gridW.toFixed(1)}px)}}
.hot{transform-box:fill-box;transform-origin:center;animation:hot 2.4s ease-in-out infinite}
@keyframes hot{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
.ping{transform-box:fill-box;transform-origin:center;animation:ping 1.8s ease-out infinite}
@keyframes ping{from{transform:scale(1);opacity:.8}to{transform:scale(3.2);opacity:0}}
.sw{animation:swp 10s linear infinite}@keyframes swp{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}`;

  const b = [];
  b.push(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="26" fill="${C.bg}" stroke="${C.line}"/>`);
  b.push(T(30, 44, 'CONTRIBUTIONS  ·  LAST 12 MONTHS', 'm6', 11, C.or, '', 1.2));
  b.push(T(28, 98, total.toLocaleString('en-US'), 'd7', 52, C.white, '', -2));
  const tw = String(total.toLocaleString('en-US')).length * 29;
  b.push(T(36 + tw, 98, `in ${active} active days`, 'm4', 12, C.muted));

  const tiles = [
    ['CURRENT STREAK', `${current} ${current === 1 ? 'day' : 'days'}`],
    ['LONGEST STREAK', `${longest} days`],
    ['BEST DAY', best.count ? `${best.count} on ${fmt(best.date)}` : '-'],
    ['LAST 30 DAYS', `${last30}`],
  ];
  let tx = W - 30;
  for (let i = tiles.length - 1; i >= 0; i--) {
    const [lab, val] = tiles[i];
    const w = Math.max(lab.length * 6.6, val.length * 9.2) + 22;
    tx -= w;
    b.push(`<rect x="${tx}" y="30" width="${w}" height="72" rx="14" fill="#111113" stroke="${C.line2}"/>`);
    b.push(T(tx + 11, 54, lab, 'm6', 9.5, C.muted, '', 0.6));
    b.push(T(tx + 11, 84, val, 'd7', 16, i === 0 ? C.or : C.white));
    tx -= 8;
  }

  // month labels
  let lastM = -1;
  weeks.forEach((w, ci) => {
    const first = w.find(Boolean);
    const m = new Date(first.date + 'T00:00:00Z').getUTCMonth();
    if (m !== lastM && ci < cols - 2) {
      b.push(T(gx + ci * pitch - 4, gy - 14, MON[m], 'm4', 10, C.muted));
      lastM = m;
    }
  });
  [['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([l, r]) => b.push(T(gx - 14, gy + r * pitch + 3.5, l, 'm4', 9.5, C.dim, 'end')));

  // beam
  b.push(`<defs><linearGradient id="bm" x1="0" x2="1"><stop offset="0" stop-color="${C.or}" stop-opacity="0"/><stop offset="1" stop-color="${C.or}" stop-opacity=".22"/></linearGradient>
<clipPath id="gc"><rect x="${gx - 10}" y="${gy - 10}" width="${gridW + 14}" height="${7 * pitch + 12}" rx="8"/></clipPath></defs>`);
  b.push(`<g clip-path="url(#gc)"><g class="beam"><rect x="${gx - 70}" y="${gy - 10}" width="60" height="${7 * pitch + 12}" fill="url(#bm)"/><rect x="${gx - 11}" y="${gy - 10}" width="1.5" height="${7 * pitch + 12}" fill="${C.or}" opacity=".7"/></g></g>`);

  // dots
  const lastDate = days[days.length - 1].date;
  weeks.forEach((w, ci) => {
    const delay = (ci / cols) * beamDur;
    let g = `<g class="col" style="animation-delay:${delay.toFixed(2)}s">`;
    for (let r = 0; r < 7; r++) {
      const d = w[r];
      if (!d) continue;
      const L = LEVEL[level(d.count)];
      const cx = (gx + ci * pitch + pitch / 2 - 6.8).toFixed(1), cy = (gy + r * pitch + 0.5).toFixed(1);
      const hot = level(d.count) === 4 ? ' class="hot"' : '';
      g += `<circle${hot} cx="${cx}" cy="${cy}" r="${L.r}" fill="${L.fill}"><title>${d.count} on ${d.date}</title></circle>`;
      if (d.date === lastDate) g += `<circle class="ping" cx="${cx}" cy="${cy}" r="4" stroke="${C.or}" stroke-width="1.5"/>`;
    }
    b.push(g + '</g>');
  });

  // legend + footer
  const ly = H - 32;
  b.push(T(30, ly + 4, 'less', 'm4', 10, C.dim));
  LEVEL.forEach((L, i) => b.push(`<circle cx="${66 + i * 15}" cy="${ly}" r="${L.r}" fill="${L.fill}"/>`));
  b.push(T(66 + 5 * 15 + 2, ly + 4, 'more', 'm4', 10, C.dim));
  b.push(T(W - 30, ly + 4, `updated ${fmt(lastDate, true)}  ·  redrawn daily by GitHub Actions`, 'm4', 10, C.dim, 'end'));
  b.push(`<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="26" pathLength="100" stroke="${C.or}" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="7 93" class="sw"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img"><title>${total} contributions in the last year</title><style>${css}</style>${b.join('')}</svg>`;
}

function fmt(iso, year = false) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ' ' + d.getUTCFullYear() : ''}`;
}

const args = process.argv.slice(2);
const days = args[0] === '--local'
  ? fromLocal(args[1])
  : await fromGitHub(process.env.GH_USER || 'Ziadk7474', process.env.GH_TOKEN);
mkdirSync(join(root, 'assets'), { recursive: true });
writeFileSync(join(root, 'assets', 'activity.svg'), render(days));
console.log(`activity.svg written: ${days.length} days, ${days.reduce((a, d) => a + d.count, 0)} contributions`);
