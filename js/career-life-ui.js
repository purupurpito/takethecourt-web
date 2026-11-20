/* MAKE THE CUT — js/career-life-ui.js (owner: carrera)
 * Pantallas de la «vida» de la Carrera (VB.CareerLifeUI), dentro del hub de career-ui.js:
 *  - Partido: tarjeta «Reto de la jornada» (con el duelo contra tu rival) y la decisión pendiente (botones con sus efectos).
 *  - Último partido: reto cumplido o no, seguidores, dinero, duelo y logros.
 *  - Pestaña «Fama»: Fama (seguidores, patrocinio, rival, decisiones) · Tienda (material, servicios y Vestuario) · Logros · Legado (premios,
 *    puntuación de leyenda, retirada y Salón de la Fama). En las dos Carreras (playa y pista); los textos de pabellón los da career-life.js.
 * Solo devuelve HTML; las acciones (data-act="lf-…") las atiende career-ui.js (onClick → VB.CareerLifeUI.act). Datos: career-life.js.
 * Tienda › Vestuario (sprint «personaliza», spec §7): cosméticos de VB.Look (js/look.js) con el dinero de la Carrera; solo estética.
 * Sin look.js el bloque no sale.
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  function Lf() { return VB.CareerLife; }
  function C() { return VB.Career; }
  var H = null, retArm = 0, note = '';
  function esc(s) { return H.esc(s); }
  function sp(a, k) { return H.sp(a, k); }
  function qph() { return !!(H && H.q && H.ph && H.ph()); }   // móvil: explicaciones detrás de «?» (career-ui qBtn)
  function eur(v) { return Lf().eur(v); }
  function num(v) { return Lf().num(v); }
  function isHall(c) { return !!(c && c.mode === 'hall'); }
  /** Pista: el nombre del puesto que llevas (Receptor, Colocador…), para el reto; '' en la playa. */
  function posName(c) { var H = C() && C().hall; if (!isHall(c) || !H || !H.ctrlRole || !H.POS) return ''; var p = H.POS[H.ctrlRole(c)]; return p ? p.name : ''; }
  function bar(p, col) { return '<span class="bar"><i style="width:' + Math.round(100 * Math.max(0, Math.min(1, p))) + '%' + (col ? ';background:' + col : '') + '"></i></span>'; }
  // SPLAT (etapa 2, 17-nov-2026; notes/splat.md): el reto de la jornada en papel dorado (el duelo, con el rótulo rojo); las
  // decisiones, manchas de colores que contrastan (career-ui splatify); cifras grandes en Titan One con contorno; logros en
  // pegatinas con su sello dorado al conseguirlos; premios individuales, sellos dorados. Prefijo Q (3 ids de :root más #career).
  var Q = ':root:not(#_):not(#_):not(#_) #career', KO = '1.5px 1.5px 0 var(--sp-ink),-1px -1px 0 var(--sp-ink),1px -1px 0 var(--sp-ink),-1px 1px 0 var(--sp-ink)';
  var STK = '0 0 0 2.5px var(--sp-ink),3px 4px 0 2.5px var(--sp-ink)';
  // Móvil (html.ph, 18-nov-2026; notes/splat.md §9): letra con los tokens del sistema (nada < 12 px, lectura ≥ 14, filas 15-17) y
  // objetivos de 44. Prefijo PQ = gana a Q. Sin .ph no cambia nada.
  var PQ = Q.replace(':root', ':root.ph');
  var PH_L = [
    PQ + ' .lf-big{font-size:var(--ph-hero)}',
    PQ + ' .lf-tier{font-size:var(--ph-label);letter-spacing:.04em}',
    PQ + ' .lf-ch b.goal{font-size:var(--ph-head)}',
    PQ + ' .lf-ev p.q{font-size:var(--ph-body)}',
    PQ + ' .lf-ev .acts button small{font-size:var(--ph-cap)}',
    PQ + ' .lf-item{gap:8px 12px;padding:12px 0;min-height:56px}',
    PQ + ' .lf-item b{font-size:var(--ph-row)}',
    PQ + ' .lf-item small{font-size:var(--ph-label)}',
    PQ + ' .lf-item button small{font-size:max(13px,var(--ph-cap))}',
    PQ + ' .lf-item .sp-btn{min-width:110px}',
    PQ + ' .lf-pips i{width:12px;height:12px}',
    PQ + ' .lf-stars{font-size:var(--ph-label)}',
    PQ + ' .lf-ach{grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:12px}',
    PQ + ' .lf-a{padding:10px 12px}',
    PQ + ' .lf-a b{font-size:var(--ph-row)}',
    PQ + ' .lf-a small{font-size:var(--ph-label)}',
    PQ + ' .lf-a em{font-size:var(--ph-cap)}',
    PQ + ' .lf-a .bar{height:10px}',
    PQ + ' .lf-aw b{font-size:var(--ph-row)}',
    PQ + ' .lf-aw small{font-size:var(--ph-label)}',
    PQ + ' .lf-bh{font-size:var(--ph-body)}'
  ];
  var SPLAT_L = [
    Q + ' .lf-big{font:400 clamp(28px,6vh,44px)/1 var(--sp-pop);color:var(--sp-gold);text-shadow:2.5px 0 0 var(--sp-ink),-2.5px 0 0 var(--sp-ink),0 2.5px 0 var(--sp-ink),0 -2.5px 0 var(--sp-ink),3px 4px 0 var(--sp-ink);transform:rotate(-2deg);transform-origin:0 60%;display:inline-block}',
    Q + ' .lf-tier{font:800 12px var(--sp-ui);letter-spacing:.14em;color:rgba(255,244,220,.72)}',
    Q + ' .lf-fm .bar,' + Q + ' .lf-a .bar,' + Q + ' .pbar .bar{background:rgba(8,5,20,.7);box-shadow:0 0 0 2px var(--sp-ink),inset 0 0 0 1.5px rgba(255,244,220,.2)}',
    Q + ' .lf-fm .bar i{background:linear-gradient(90deg,var(--sp-kit),var(--sp-gold))}',
    // reto: papel dorado con tinta; el rótulo, pegatina de tinta
    Q + ' .card.lf-ch{background:var(--sp-gold);color:var(--sp-ink);box-shadow:0 0 0 3px var(--sp-ink),inset 0 0 0 2px rgba(255,255,255,.35),5px 7px 0 var(--sp-ink)}',
    Q + ' .card.lf-ch>h3:first-child{background:var(--sp-ink);color:var(--sp-gold)}',
    Q + ' .card.lf-ch.lf-duel>h3:first-child{background:var(--sp-danger);color:#fff6e4}',
    Q + ' .card.lf-ch.lf-duel{background:linear-gradient(100deg,var(--sp-gold) 0 70%,#ffb43d 70%)}',
    Q + ' .lf-ch p,' + Q + ' .lf-ch .muted,' + Q + ' .lf-ch .lf-bh{color:var(--sp-ink)}',
    Q + ' .lf-ch .muted{opacity:.78}',
    Q + ' .lf-ch b.goal{font:400 clamp(18px,3.4vh,24px)/1.1 var(--sp-pop);color:var(--sp-ink);letter-spacing:.01em}',
    Q + ' .lf-ch .tag.y{background:var(--sp-cream)}',
    // decisiones: la pregunta legible y las manchas con su efecto (▲ ▼) en la línea pequeña
    Q + ' .lf-ev p.q{font:600 clamp(14px,2.2vh,16px)/1.35 var(--sp-ui);color:var(--sp-cream)}',
    Q + ' .lf-ev .sp-btn .lf-up,' + Q + ' .lf-ev .sp-btn .lf-dn{color:inherit}',
    Q + ' .lf-up{color:#8fe36e}',
    Q + ' .lf-dn{color:#ff8a98}',
    // filas (patrocinio, material, servicios, vestuario, celebración): separadas con trazo discontinuo
    Q + ' .lf-item{border-top:2px dashed rgba(255,244,220,.14);padding:9px 0}',
    Q + ' .lf-item b{font:400 15px/1.15 var(--sp-pop);letter-spacing:.01em}',
    Q + ' .lf-item small{color:rgba(255,244,220,.72);font:600 12.5px/1.3 var(--sp-ui)}',
    // el precio va dentro del botón (crema): tinta, no crema sobre crema; en gris si no llega el dinero
    Q + ' .lf-item button small,' + Q + ' .lf-item .sp-btn small{color:var(--sp-ink);opacity:1;text-shadow:none;display:block;font:600 12.5px/1.15 var(--sp-ui);text-transform:none;letter-spacing:0}',
    Q + ' .lf-item button[aria-disabled=true] small{opacity:.75}',
    Q + ' .lf-item .sp-btn{min-width:120px}',
    Q + ' .lf-pips i{background:rgba(255,244,220,.18);box-shadow:0 0 0 2px var(--sp-ink)}',
    Q + ' .lf-pips i.on{background:var(--sp-gold)}',
    Q + ' .lf-stars{color:var(--sp-gold)}',
    Q + ' .lf-bh{color:rgba(255,244,220,.9)}',
    // logros: pegatinas de formas distintas; conseguidos, con filo dorado y su sello
    Q + ' .lf-ach{gap:10px}',
    Q + ' .lf-a{position:relative;background:rgba(255,244,220,.07);border-radius:12px 16px 13px 18px/16px 12px 18px 13px;padding:9px 12px}',
    Q + ' .lf-a:nth-child(3n+2){border-radius:16px 12px 18px 13px/12px 16px 13px 18px;background:rgba(255,244,220,.1)}',
    Q + ' .lf-a.done{background:rgba(255,203,61,.13);box-shadow:inset 0 0 0 2.5px var(--sp-gold);padding-right:48px}',
    Q + ' .lf-a b{font:400 14px/1.15 var(--sp-pop);letter-spacing:.01em}',
    Q + ' .lf-a small{color:rgba(255,244,220,.75)}',
    Q + ' .lf-a em{color:var(--sp-gold)}',
    Q + ' .lf-a .bar i{background:var(--sp-gold)}',
    Q + ' .lf-st{position:absolute;right:8px;top:8px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--sp-gold);color:var(--sp-ink);font:400 16px/1 var(--sp-pop);font-style:normal;box-shadow:0 0 0 2.5px var(--sp-ink),inset 0 0 0 3px var(--sp-gold),inset 0 0 0 4.5px rgba(21,16,42,.4),2px 3px 0 2.5px var(--sp-ink);transform:rotate(-12deg)}',
    // premios individuales: sellos dorados en fila
    Q + ' .lf-aws{display:flex;flex-wrap:wrap;gap:12px 18px;margin:6px 0 2px}',
    Q + ' .lf-aw{display:flex;align-items:center;gap:10px;min-width:0}',
    Q + ' .lf-aw .lf-st{position:relative;right:auto;top:auto;flex:none;width:46px;height:46px;font-size:20px}',
    Q + ' .lf-aw:nth-child(even) .lf-st{transform:rotate(9deg)}',
    Q + ' .lf-aw b{display:block;font:400 15px/1.1 var(--sp-pop);color:var(--sp-cream)}',
    Q + ' .lf-aw small{display:block;font:600 12px var(--sp-ui);color:rgba(255,244,220,.72)}'
  ];
  var CSS = [
    '#career .lf-big{font:900 30px var(--display);letter-spacing:.02em;margin:0;line-height:1.05;color:#ffd23f;text-shadow:var(--ring1)}',
    '#career .lf-tier{font:800 13px var(--display);letter-spacing:.14em;text-transform:uppercase;color:#b9b0e6}',
    '#career .lf-ch{background:linear-gradient(135deg,rgba(255,210,63,.18),rgba(255,128,64,.12));box-shadow:0 0 0 2.5px var(--tk),4px 5px 0 var(--tk),inset 0 0 0 2px rgba(255,210,63,.55)}',
    '#career .lf-ch b.goal{display:block;font:900 21px var(--display);letter-spacing:.03em;text-transform:uppercase;margin:2px 0 6px}',
    '#career .lf-duel{background:linear-gradient(135deg,rgba(216,54,74,.28),rgba(123,63,209,.2))}',
    '#career .lf-ev p.q{font:600 15px var(--ui);margin:4px 0 8px}',
    '#career .lf-ev .acts button small{display:block;font:600 12px var(--ui);text-transform:none;letter-spacing:0;opacity:.9;margin-top:2px}',
    '#career .lf-up{color:#7ee2a8}#career .lf-dn{color:#ff8a8a}',
    '#career .lf-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;align-items:center;padding:8px 0;border-top:1px solid rgba(255,255,255,.08)}',
    '#career .lf-item:first-of-type{border-top:0}',
    '#career .lf-item b{font:800 15.5px var(--display);letter-spacing:.03em;text-transform:uppercase}',
    '#career .lf-item small{display:block;color:#b9b0e6;font:600 12.5px var(--ui)}',
    '#career .lf-item button{min-height:44px;min-width:120px}',
    '#career .lf-lock{opacity:.6}',
    '#career .lf-pips{display:inline-flex;gap:3px;vertical-align:-1px;margin-left:6px}#career .lf-pips i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.18);box-shadow:0 0 0 1.5px var(--tk)}#career .lf-pips i.on{background:#ffd23f}',
    '#career .lf-ach{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}',
    '#career .lf-a{padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.2)}#career .lf-a.done{background:rgba(47,143,90,.28);box-shadow:inset 0 0 0 2px #2f8f5a}',
    '#career .lf-a b{display:block;font:800 14px var(--display);letter-spacing:.04em;text-transform:uppercase}#career .lf-a small{display:block;color:#cfc8f2;font:600 12px var(--ui);margin:1px 0 5px}',
    '#career .lf-a .bar{display:block;height:8px;border-radius:5px;background:rgba(0,0,0,.4);overflow:hidden}#career .lf-a .bar i{display:block;height:100%;background:#ffd23f}',
    '#career .lf-a em{display:block;font:700 11.5px var(--ui);font-style:normal;color:#ffd23f;margin-top:4px}',
    '#career .lf-fm .bar{display:block;height:12px;border-radius:7px;background:rgba(0,0,0,.4);overflow:hidden;margin:6px 0 2px}#career .lf-fm .bar i{display:block;height:100%;background:linear-gradient(90deg,#ff8040,#ffd23f)}',
    // Tienda › Vestuario: estrellas de rareza (★ a ★★★★, las que faltan apagadas) junto al nombre
    // jefe del circuito (S3 C3): tarjeta normal; la pista en frase plana (var(--ui), minúscula de frase)
    '#career .lf-bh{font:600 14px var(--ui);margin:6px 0 4px;color:#e9e4ff}',
    '#career .lf-stars{margin-left:6px;font:700 13px var(--ui);letter-spacing:.06em;color:#ffd23f;white-space:nowrap}#career .lf-stars .off{color:rgba(255,255,255,.22)}'
  ].concat(SPLAT_L, PH_L).join('\n');
  function css() { if (document.getElementById('careerLifeCss')) return; var s = document.createElement('style'); s.id = 'careerLifeCss'; s.textContent = CSS; document.head.appendChild(s); }
  function arrow(h) { return h.map(function (x) { return '<span class="' + (x[1] ? 'lf-up' : 'lf-dn') + '">' + esc(x[0]) + ' ' + (x[1] ? '▲' : '▼') + '</span>'; }).join(' '); }

  // ---------------------------------------------------------------- pestaña Partido
  /** Tarjetas del reto y de la decisión pendiente (antes de los mensajes). */
  function matchCards(c, h0) {
    H = h0; css();
    var h = '', ch = Lf().challenge(c), ev = Lf().pendingEvent(c), l = c.life || {};
    if (ev) {
      h += '<div class="card lf-ev new"><h3>' + sp(['Decisión', esc(ev.title)], 'd') + '</h3><p class="q">' + esc(ev.text) + '</p><div class="acts">' +
        ev.opts.map(function (o, i) { return '<button data-act="lf-ans" data-i="' + i + '">' + esc(o.t) + (o.hint.length ? '<small>' + arrow(o.hint) + '</small>' : '') + '</button>'; }).join('') +
        '</div><p class="muted" style="margin:6px 0 0">Si juegas o simulas sin contestar, la oportunidad se pierde.</p></div>';
    }
    if (ch) {
      var rv = l.rival, bm = nextBoss(c);
      h += '<div class="card lf-ch' + (ch.duel ? ' lf-duel' : '') + '"><h3>' + (ch.duel ? sp(['Duelo', 'contra ' + esc(rv.name)], 'd') : posName(c) ? sp(['Reto de la jornada', esc(posName(c))], 'd') : 'Reto de la jornada') + '</h3><b class="goal">' + esc(ch.txt) + '</b><p>' +
        '<span class="tag y">+' + num(ch.fans) + ' seguidores</span><span class="tag y">+' + ch.xp + ' XP</span><span class="tag y">+' + eur(ch.money) + '</span>' + (ch.duel ? '<span class="tag r">Premio doble</span>' : '') + (bm ? '<span class="tag r">Jefe: ' + esc(bm.nick) + '</span>' : '') + '</p>' +
        (bm ? '<p class="lf-bh">' + sp([esc(bm.name) + ' «' + esc(bm.nick) + '»', esc(bm.hint)], 'v') + '</p>' : '') +
        '<p class="muted" style="margin:4px 0 0">' + sp([ch.duel ? 'Cara a cara ' + rv.w + '-' + rv.l : bm ? 'Cara a cara ' + bm.w + '-' + bm.l : '', 'Solo cuenta si juegas el partido', 'Retos cumplidos: ' + (l.chDone | 0)], 'v') + '</p></div>';
    }
    return h;
  }
  /** Jefe del circuito si el próximo partido es contra su club (playa); null si no. */
  function nextBoss(c) {
    var L = Lf(); if (!L || !L.bossFor || isHall(c)) return null;
    try { var n = C().next(c), b = n && n.rival ? L.bossFor(c, n.rival.id) : null; return b ? L.bossInfo(c, b) : null; } catch (e) { return null; }
  }
  /** Líneas extra de la tarjeta del último partido. */
  function lastExtra(c, s, h0) {
    H = h0; var x = s && s.life; if (!x) return '';
    var h = '<p>';
    if (x.ch) h += '<span class="tag ' + (x.ch.ok ? 'g' : 'r') + '">' + (x.ch.ok ? 'Reto cumplido' : 'Reto fallado') + ': ' + esc(x.ch.txt) + ' (' + esc(x.ch.prog) + ')</span>';
    if (x.fans) h += '<span class="tag ' + (x.fans > 0 ? 'y' : 'r') + '">' + (x.fans > 0 ? '+' : '−') + num(Math.abs(x.fans)) + ' seguidores</span>';
    if (x.money) h += '<span class="tag">' + (x.money > 0 ? '+' : '−') + eur(Math.abs(x.money)) + '</span>';
    if (x.duel) h += '<span class="tag ' + (x.duel.win ? 'g' : 'r') + '">' + (x.duel.win ? 'Duelo ganado' : 'Duelo perdido') + ' contra ' + esc(x.duel.name) + ' (' + x.duel.w + '-' + x.duel.l + ')</span>';
    if (x.boss) h += x.boss.first ? '<span class="tag g">Jefe tumbado: ' + esc(x.boss.nick) + '</span>' : '<span class="tag ' + (x.boss.win ? 'g' : 'r') + '">Jefe: ' + esc(x.boss.nick) + ' (' + x.boss.w + '-' + x.boss.l + ')</span>';
    if (x.chemUp) h += '<span class="tag g">▲ Química: ' + esc(x.chemUp.name) + '</span>';
    (x.ach || []).forEach(function (a) { h += '<span class="tag g">Logro: ' + esc(a) + '</span>'; });
    return h === '<p>' ? '' : h + '</p>';
  }

  // ---------------------------------------------------------------- pestaña Fama
  function render(c, sub, h0) {
    H = h0; css(); Lf().ensure(c);
    var out = sub === 'shop' ? shop(c) : sub === 'goals' ? goals(c) : sub === 'legacy' ? legacy(c) : fame(c);
    out += '<p class="note" role="status" aria-live="polite">' + esc(note) + '</p>'; note = '';
    return out;
  }
  function fame(c) {
    var f = Lf().fameInfo(c), l = c.life, h = '';
    h += '<div class="card lf-fm"><h3>Seguidores</h3><p class="lf-big">' + num(f.fans) + '</p><p class="lf-tier">' + esc(f.name) + '</p>' +
      (f.next ? bar(f.p) + '<p class="muted" style="margin:0">' + sp(['Siguiente: ' + esc(f.next), 'faltan ' + num(f.to - f.fans)], 'v') + '</p>' : '<p class="muted">Lo máximo. Tu nombre ya es historia del vóley.</p>') +
      '<p class="muted">' + sp([l.streak >= 2 ? 'Racha de ' + l.streak + ' victorias (más seguidores por partido)' : '', 'Mejor racha: ' + (l.best | 0), l.bestNota ? 'Mejor nota: ' + String(l.bestNota).replace('.', ',') : ''], 'v') + '</p>' +
      // ambiente de Carrera: tarjetas de la temporada y de la carrera, premios a la deportividad (career-life.js cardsOf)
      (l.cards && (l.cards.n | 0) > 0 ? '<p class="muted">' + sp(['Tarjetas esta temporada: ' + (l.cards.y | 0) + ' amarillas, ' + (l.cards.r | 0) + ' rojas',
        'En tu carrera: ' + ((l.cards.tot && l.cards.tot.y) | 0) + ' y ' + ((l.cards.tot && l.cards.tot.r) | 0), (l.cards.fair | 0) ? 'Premios a la deportividad: ' + (l.cards.fair | 0) : ''], 'v') + '</p>' : '') +
      (function () {
        var fx = 'Ganas seguidores con buenas notas, victorias, retos, títulos y premios. La fama trae patrocinadores y hace que los clubes te miren más (+' + String(Lf().offerBonus(c)).replace('.', ',') + ' de interés).';
        return qph() ? H.q('Seguidores', fx) : '<p class="muted">' + esc(fx) + '</p>';
      })() + '</div>';
    h += celebCard(c);
    // patrocinio
    h += '<div class="card"><h3>Patrocinio</h3>';
    if (l.sponsor) {
      var s = l.sponsor, g = Lf().sponsorProgress(c);
      h += '<p class="bigname" style="font-size:20px">' + esc(s.name) + '</p><p>' + sp([eur(s.pay) + ' por jornada', 'bonus ' + eur(s.goal.bonus)], 'v') + '</p>' +
        '<div class="pbar"><span>' + esc(s.goal.txt) + '</span>' + bar(g / s.goal.n) + '<b>' + Math.min(g, s.goal.n) + '/' + s.goal.n + '</b></div><p class="muted">El patrocinio dura hasta final de temporada.</p>';
    } else if (!l.spOffers.length) h += '<p class="muted">' + (f.i < 1 ? 'Nadie te patrocina todavía. Llega a «' + esc(Lf().tierName(1, c)) + '» (' + num(Lf().TIERS[1][0]) + ' seguidores) y empezarán a llamar.' : 'Sin patrocinador esta temporada. Al subir de escalón o en verano llegarán ofertas nuevas.') + '</p>';
    if (l.spOffers.length) {
      h += l.spOffers.map(function (o, i) {
        return '<div class="lf-item"><div><b>' + esc(o.name) + '</b><small>' + sp([eur(o.pay) + ' por jornada', 'bonus de ' + eur(o.goal.bonus) + ' si consigues ' + esc(o.goal.txt)], 'v') + '</small></div><button class="pri" data-act="lf-sp" data-i="' + i + '">Firmar</button></div>';
      }).join('') + '<div class="acts"><button data-act="lf-spno">Rechazar las dos</button></div>';
    }
    h += '</div>';
    // rival
    var rv = l.rival, rk = rv && C().club(c, rv.club);
    h += '<div class="card"><h3>Tu rival</h3>' + (rv && rk ? '<div class="row">' + '<div class="grow"><p class="bigname" style="font-size:20px">' + esc(rv.name) + ' <span class="muted">#' + rv.num + '</span></p><p class="muted" style="margin:2px 0 0">' +
      sp([esc(rk.name), 'Media ' + Lf().rivalOvr(c), 'Rival desde la temporada ' + rv.since], 'v') + '</p></div><div style="text-align:center"><p class="lf-big" style="font-size:26px">' + rv.w + '-' + rv.l + '</p><small class="muted">cara a cara</small></div></div>' +
      rivalStyleLine(c, rv) +
      '<p class="muted">Cada partido contra ' + esc(rk.name) + ' es un duelo: el reto vale el doble.</p>' : '<p class="muted">Aparecerá cuando juegues tu primera jornada en una liga.</p>') + '</div>';
    h += bossCard(c);
    // decisiones recientes
    if (l.log && l.log.length) h += '<div class="card"><h3>Tus decisiones</h3>' + l.log.slice(-6).reverse().map(function (x) { return '<p class="muted" style="margin:3px 0">' + sp(['T' + x.s, esc(x.t), '<b style="color:#fff">' + esc(x.o) + '</b>'], 'v') + '</p>'; }).join('') + '</div>';
    return h;
  }
  /** «Tu rival» (playa): su estilo de juego en el duelo y la pista para jugarle. */
  function rivalStyleLine(c, rv) {
    var S = Lf().BOSS_STYLES && rv && Lf().BOSS_STYLES[rv.style]; if (!S || isHall(c)) return '';
    return '<p class="lf-bh">' + sp(['Estilo: ' + esc(S.name), esc(S.hint)], 'v') + '</p>';
  }
  /** Fama: tarjeta «Jefe del circuito» (S3 C3; solo playa). */
  function bossCard(c) {
    var L = Lf(); if (!L.boss || isHall(c)) return '';
    var b = L.boss(c); if (!b) return '';
    var bi = L.bossInfo(c, b), k = C().club(c, b.club), o = 0;
    try { o = C().clubOvr(k) + (C().attrOf ? C().attrOf(c, k) | 0 : 0) + (L.BOSS_UP | 0); } catch (e) { o = 0; }
    var own = true; try { var it = L.bossItem ? L.bossItem(c, b.style) : null; own = it ? !!VB.Look.owned(it.id) : true; } catch (e) { own = true; }
    return '<div class="card lf-boss" data-nav><h3>Jefe del circuito</h3><div class="row"><div class="grow"><p class="bigname" style="font-size:20px">' + esc(bi.name) + ' «' + esc(bi.nick) + '»</p>' +
      '<p class="muted" style="margin:2px 0 0">' + sp([k ? esc(k.name) : '', o ? 'Media ' + o : '', esc(bi.styleName)], 'v') + '</p></div>' +
      '<div style="text-align:center"><p class="lf-big" style="font-size:26px">' + bi.w + '-' + bi.l + '</p><small class="muted">cara a cara</small></div></div>' +
      '<p class="lf-bh">' + esc(bi.hint) + '</p>' +
      '<p>' + (bi.beat ? '<span class="tag g">Derrotado en T' + bi.beat + '</span>' : '<span class="tag r">Sin derrotar</span>') +
      (!bi.beat && bi.item && !own ? '<span class="tag y">Si le ganas: ' + esc(bi.item) + '</span>' : '') + '</p>' +
      '<p class="muted" style="margin:4px 0 0">Cada partido contra ' + (k ? esc(k.name) : 'su club') + ' es partido de jefe. Solo cuenta la victoria jugada.</p></div>';
  }
  /** Celebración de firma (sprint 5, E2): «Ninguna» y una fila por celebración (Elegida / Elegir / bloqueada con su escalón). */
  function celebCard(c) {
    if (!Lf().celebs) return '';
    var L = Lf().celebs(c), cur = c.life && c.life.celeb || '', open = L.filter(function (x) { return x.open; }).length;
    function row(id, name, hint, on, lock) {
      return '<div class="lf-item"><div><b>' + esc(name) + '</b><small>' + esc(hint) + '</small></div>' +
        (on ? '<span class="tag g">Elegida</span>' : lock ? '<span class="tag lf-lock">Fama: ' + esc(lock) + '</span>' : '<button data-act="lf-celeb" data-id="' + esc(id) + '">Elegir</button>') + '</div>';
    }
    return '<div class="card" data-nav><h3>' + sp(['Celebración', open + ' de ' + L.length], 'd') + '</h3>' +
      '<p class="muted">Tu gesto en los puntos grandes: remates de los que levantan la grada y el punto que cierra un set.</p>' +
      row('', 'Ninguna', 'La reacción de siempre', !cur, '') +
      L.map(function (x) { return row(x.id, x.name, x.open ? 'Desbloqueada con «' + x.tierName + '»' : 'Se desbloquea con la fama', x.on, x.open ? '' : x.tierName); }).join('') + '</div>';
  }
  function shop(c) {
    var l = c.life, money = +c.money || 0, h = '';
    var sx = 'Cobras el sueldo, el patrocinio y los premios de los retos cada jornada. El material suma en tus partidos (como la química) y los servicios se pagan por jornada.';
    // (móvil: la explicación, detrás de «?» en la pegatina del título; el desplazamiento empieza con el material)
    h += '<div class="card"><h3>' + sp(['Ahorros', eur(money)], 'd') + '</h3>' + (qph() ? H.q('Ahorros', sx) : '<p class="muted">' + esc(sx) + '</p>') + '</div>';
    h += '<div class="card"><h3>Material</h3>' + Lf().GEAR_KEYS.map(function (id) {
      var G = Lf().GEAR[id], lv = l.gear[id] | 0, pr = Lf().gearPrice(c, id), pips = '';
      for (var i = 0; i < Lf().GEAR_MAX; i++) pips += '<i class="' + (i < lv ? 'on' : '') + '"></i>';
      return '<div class="lf-item"><div><b>' + esc(Lf().gearName(c, id)) + '<span class="lf-pips" aria-label="Nivel ' + lv + ' de 3">' + pips + '</span></b><small>' + esc(G.hint) + (lv ? ': +' + lv + ' en el partido' : '') + '</small></div>' +
        (lv >= Lf().GEAR_MAX ? '<span class="tag g">Al máximo</span>' : '<button data-act="lf-buy" data-id="' + id + '"' + (money < pr ? ' aria-disabled="true"' : '') + '>' + (lv ? 'Mejorar' : 'Comprar') + ' <small>' + eur(pr) + '</small></button>') + '</div>';
    }).join('') + '</div>';
    h += '<div class="card"><h3>Servicios</h3>' + Lf().SVC_KEYS.map(function (id) {
      var S = Lf().SVC[id], on = !!l.svc[id], cost = Lf().svcCost(c, id);
      return '<div class="lf-item"><div><b>' + esc(S.name) + (on ? ' <span class="tag g">Contratado</span>' : '') + '</b><small>' + sp([esc(S.hint), eur(cost) + ' por jornada'], 'v') + '</small></div>' +
        '<button data-act="lf-svc" data-id="' + id + '" aria-pressed="' + on + '">' + (on ? 'Cancelar' : 'Contratar') + '</button></div>';
    }).join('') + '<p class="muted">' + sp(['Gastado en la carrera: ' + eur(l.spent | 0), 'ganado fuera del sueldo: ' + eur(l.earned | 0)], 'v') + '</p></div>';
    h += lookCard(c, money);
    return h;
  }
  // nombre corto de cada ranura (las filas del Vestuario, ui.js), para la ayuda de cada objeto de la tienda
  var SLOT_N = { style: 'Peinado', hairTint: 'Color de pelo', hairFx: 'Efecto de pelo', head: 'Gorro', eyes: 'Gafas', ears: 'Pendientes', paint: 'Pintura', marks: 'Marcas', beard: 'Barba', neck: 'Cuello',
    under: 'Interior', band: 'Brazalete', armL: 'Manguito', armR: 'Manguito', elbows: 'Coderas', wristL: 'Muñeca', wristR: 'Muñeca', hands: 'Manos',
    legs: 'Mallas', knees: 'Rodilleras', socks: 'Calcetines', ankle: 'Tobillera', shoes: 'Zapatillas', color: 'Color' };
  /** Rareza 0-3 en estrellas (★ … ★★★★), con su lectura para el lector de pantalla. */
  function starsHTML(r) {
    var n = Math.max(0, Math.min(3, r | 0)) + 1, s = '';
    for (var i = 0; i < 4; i++) s += i < n ? '★' : '<span class="off">★</span>';
    return '<span class="lf-stars" role="img" aria-label="Rareza: ' + n + ' de 4">' + s + '</span>';
  }
  /** Tienda › Vestuario: cosméticos a la venta (VB.CareerLife.lookShop), por precio. Sin look.js, nada. */
  function lookCard(c, money) {
    var L = Lf(), list = L.lookShop ? L.lookShop(c) : [];
    if (!list.length) return '';
    var hallC = isHall(c), own = list.filter(function (x) { return x.owned; }).length, sl = c.life.spentLook | 0;
    return '<div class="card" data-nav><h3>' + sp(['Vestuario', own + ' de ' + list.length], 'd') + '</h3>' +
      '<p class="muted">Solo estética: no cambia cómo juegas. Lo que compras queda en tu vestuario para siempre, también en Partido rápido. Póntelo en Jugador › Vestuario.</p>' +
      list.map(function (x) {
        var other = x.venue === 'Y' && hallC ? 'solo en playa' : x.venue === 'P' && !hallC ? 'solo en pista' : '';
        return '<div class="lf-item"><div><b>' + esc(x.name) + starsHTML(x.rarity) + '</b><small>' + sp([esc(SLOT_N[x.slot] || ''), other ? esc(other) + ' (para Partido rápido)' : ''], 'v') + '</small></div>' +
          (x.owned ? '<span class="tag g">En tu vestuario</span>' : '<button data-act="lf-look" data-id="' + esc(x.id) + '"' + (money < x.price ? ' aria-disabled="true"' : '') + '>Comprar <small>' + eur(x.price) + '</small></button>') + '</div>';
      }).join('') + (sl ? '<p class="muted">Gastado en el vestuario: ' + eur(sl) + '</p>' : '') + '</div>';
  }
  function goals(c) {
    var a = Lf().achList(c), done = a.filter(function (x) { return x.done; }).length;
    a.sort(function (x, y) { return (x.done ? 1 : 0) - (y.done ? 1 : 0) || (y.v / y.n) - (x.v / x.n); });
    return '<div class="card"><h3>' + sp(['Logros', done + ' de ' + a.length], 'd') + '</h3><p class="muted">Cada logro da su premio una sola vez: puntos de mejora, seguidores o dinero.</p><div class="lf-ach">' +
      a.map(function (x) {
        var v = x.dec ? String(x.v).replace('.', ',') : num(x.v);
        return '<div class="lf-a' + (x.done ? ' done' : '') + '">' + (x.done ? '<i class="lf-st" role="img" aria-label="Conseguido">✓</i>' : '') + '<b>' + esc(x.name) + '</b><small>' + esc(x.d) + '</small>' + (x.done ? '' : bar(x.v / x.n) + '<small style="margin:3px 0 0">' + (x.pt ? esc(x.pt) : v + ' de ' + (x.dec ? String(x.n).replace('.', ',') : num(x.n))) + '</small>') + '<em>' + esc(x.reward) + '</em></div>';
      }).join('') + '</div></div>';
  }
  function legacy(c) {
    var l = c.life, sc = Lf().legacyScore(c), t = Lf().legacyTier(sc, c), age = c.player.age | 0, h = '';
    h += '<div class="card lf-fm"><h3>Legado</h3><p class="lf-big">' + sc + '</p><p class="lf-tier">' + esc(t.name) + '</p>' +
      (t.next ? bar((sc) / t.next[0]) + '<p class="muted" style="margin:0">' + sp(['Siguiente: ' + esc(t.next[1]), 'a ' + t.next[0] + ' puntos'], 'v') + '</p>' : '') +
      '<p class="muted">Suman los títulos (más cuanto más alta la categoría), los premios individuales, la fama, las victorias y los logros.</p></div>';
    h += '<div class="card"><h3>Premios individuales</h3>' + (l.awards.length ? '<div class="lf-aws">' + l.awards.slice().reverse().map(function (a) { return '<div class="lf-aw"><i class="lf-st" aria-hidden="true">★</i><span><b>' + esc(a.name) + '</b><small>' + sp(['T' + a.season, esc(a.club)], 'v') + '</small></span></div>'; }).join('') + '</div>'
      : '<p class="muted">Aún ninguno. Al final de cada temporada se entregan: MVP, máximo anotador, mejor sacador, muro del año, mejor defensa' + (isHall(c) ? ', mejor colocador' : '') + ' y revelación. Hay que jugar los partidos: simulando no te ve nadie.</p>') + '</div>';
    h += '<div class="card"><h3>' + sp(['Retirada', age + ' años'], 'd') + '</h3>';
    if (Lf().canRetire(c)) {
      var armed = retArm && performance.now() - retArm < 4000;
      h += '<p>Puedes colgar las rodilleras cuando quieras. Tu carrera pasará al Salón de la Fama de este dispositivo con ' + sc + ' puntos de legado, y podrás empezar otra con algo de fama heredada.</p>' +
        '<div class="acts"><button class="warn" data-act="lf-ret">' + (armed ? 'Pulsa otra vez para retirarte' : 'Retirarse') + '</button></div>';
    } else h += '<p class="muted">Podrás retirarte a partir de los ' + Lf().RETIRE_AGE + ' años. Desde los ' + Lf().DECLINE_AGE + ' el físico empieza a bajar cada verano.</p>';
    h += '</div>';
    var lg = Lf().legends();
    if (lg.length) h += '<div class="card"><h3>Salón de la Fama</h3><table><thead><tr><th class="l">Jugador</th><th>Legado</th><th class="hide-s">Títulos</th><th class="hide-s">Premios</th><th>Temp.</th></tr></thead><tbody>' +
      lg.slice(0, 10).map(function (r) { return '<tr><td class="club">' + esc(r.name) + ' <span class="muted">(' + esc(r.tier) + (r.mode === 'hall' ? ', pista' : '') + ')</span></td><td>' + r.score + '</td><td class="hide-s">' + r.titles + '</td><td class="hide-s">' + r.awards + '</td><td>' + r.seasons + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return h;
  }

  // ---------------------------------------------------------------- acciones (career-ui.js onClick)
  /** Devuelve: 'render' (repinta y deja el foco), 'retired' (la carrera se ha cerrado) o '' (no es mía). */
  function act(a, b) {
    var L = Lf(); if (!L) return '';
    switch (a) {
      case 'lf-ans': { var r = L.answer(+b.getAttribute('data-i')); note = r ? (r.length ? r.join(', ') + '.' : 'Hecho.') : ''; return 'render'; }
      case 'lf-sp': note = L.signSponsor(+b.getAttribute('data-i')) ? '¡Patrocinio firmado!' : ''; return 'render';
      case 'lf-spno': L.declineSponsors(); note = 'Ofertas rechazadas.'; return 'render';
      case 'lf-buy': { var c = C().get(), id = b.getAttribute('data-id'), p = c ? L.gearPrice(c, id) : 0, k = L.buyGear(id);
        note = k === 'ok' ? 'Comprado: ' + L.gearName(c, id) + '.' : k === 'money' ? 'No te llega: cuesta ' + eur(p) + '.' : k === 'max' ? 'Ya está al máximo.' : ''; return 'render'; }
      case 'lf-svc': { var c2 = C().get(), id2 = b.getAttribute('data-id'), k2 = L.toggleSvc(id2);
        note = k2 === 'on' ? 'Contratado: ' + L.SVC[id2].name + '.' : k2 === 'off' ? 'Cancelado: ' + L.SVC[id2].name + '.' : k2 === 'money' ? 'No te llega para la primera jornada (' + eur(L.svcCost(c2, id2)) + ').' : ''; return 'render'; }
      case 'lf-look': { var lid = b.getAttribute('data-id') || '', it = L.lookShop ? L.lookShop(C().get()).filter(function (x) { return x.id === lid; })[0] : null, k3 = L.buyLook ? L.buyLook(lid) : '';
        note = k3 === 'ok' ? 'Comprado: ' + (it ? it.name : lid) + '.' : k3 === 'money' ? 'No te llega: cuesta ' + eur(it ? it.price : 0) + '.' : k3 === 'owned' ? 'Ya está en tu vestuario.' : 'No se ha podido comprar.'; return 'render'; }
      case 'lf-celeb': { var cid = b.getAttribute('data-id') || ''; note = L.setCeleb && L.setCeleb(cid) ? (cid ? 'Celebración elegida.' : 'Sin celebración propia.') : 'Aún no la tienes.'; return 'render'; }
      case 'lf-ret':
        if (retArm && performance.now() - retArm < 4000) { retArm = 0; var rec = L.retire(); return rec ? 'retired' : 'render'; }
        retArm = performance.now(); return 'render';
    }
    return '';
  }
  function setNote(t) { note = t || ''; }

  VB.CareerLifeUI = { matchCards: matchCards, lastExtra: lastExtra, render: render, act: act, setNote: setNote,
    SUBS: [['fame', 'Fama'], ['shop', 'Tienda'], ['goals', 'Logros'], ['legacy', 'Legado']] };
})();
