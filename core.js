/* ============================================================
 * DTSC e-PROC — core.js (logique pure, testable en Node)
 * Version publique lecture seule — aucune dépendance DOM/MCP.
 * Exporté en UMD : window.EPROC (navigateur) / module.exports (Node).
 * ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.EPROC = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Utils ──
  function normStr(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }
  function daysLeft(dl, now) {
    if (!dl) return null;
    const d = new Date(dl); if (isNaN(d.getTime())) return null;
    const t = now ? new Date(now) : new Date();
    t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function fmtDl(dl) { if (!dl) return '—'; const d = new Date(dl); if (isNaN(d.getTime())) return '—'; return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function fmtDate(s) { if (!s) return '—'; const d = new Date(s); if (isNaN(d.getTime())) return String(s); return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ── Photos : proxy wsrv.nl (bypass hotlink dtsc.be) ──
  function proxify(url, size) {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    size = size || 176;
    const clean = url.replace(/^https?:\/\//, '');
    return 'https://wsrv.nl/?url=' + encodeURIComponent(clean) +
      '&w=' + size + '&h=' + size + '&fit=cover&a=top&output=jpg&q=80';
  }

  // ── Compétences déterministes (jamais vide) ──
  const SKILL_RULES = [
    { re: /(chef de projet|project manager|gestion de projet|\bpmo\b|management de projet)/, t: 'Gestion de projet / PMO', hard: true },
    { re: /(programme|program manager|gestion de programme|portfolio|portefeuille de projet)/, t: 'Gestion de programme', hard: true },
    { re: /(coordinateur|coordination|coordinator)/, t: 'Coordination', hard: true },
    { re: /(business analyst|analyse fonctionnelle|analyse du besoin|business analysis)/, t: 'Business Analysis', hard: true },
    { re: /(architecture|togaf|urbanisation|enterprise architect)/, t: "Architecture d'entreprise", hard: true },
    { re: /(scrum|agile|product owner|kanban|\bsafe\b|sprint)/, t: 'Agile / Scrum', hard: true },
    { re: /(migration)/, t: 'Migration IT', hard: true },
    { re: /(developpe|developer|\bjava\b|angular|\.net|python|software|logiciel|programmation)/, t: 'Développement logiciel', hard: true },
    { re: /(business intelligence|power bi|reporting|tableau de bord|datawarehouse|\bdata\b)/, t: 'Data & BI', hard: true },
    { re: /(intelligence artificielle|machine learning|data scien)/, t: 'IA / Data Science', hard: true },
    { re: /(reviseur|revisor|bedrijfsrevisor|jaarrekening|comptes annuels|revision des comptes|commissaire aux comptes)/, t: 'Révision / Audit financier', hard: true },
    { re: /(iso 9001|iso\/iec|iso 17025|certification|accreditation|controle.*certif|certificering)/, t: 'Normes ISO / Certification', hard: true },
    { re: /(audit interne|\baudit\b)/, t: 'Audit', hard: true },
    { re: /(gestion des risques|risk management|gestionnaire de risque)/, t: 'Gestion des risques', hard: true },
    { re: /(change management|conduite du changement|transformation)/, t: 'Conduite du changement', hard: true },
    { re: /(securite|cybersecurite|cyber)/, t: 'Sécurité IT', hard: true },
    { re: /(cloud|azure|\baws\b|infrastructure|devops|reseau)/, t: 'Infrastructure / Cloud', hard: true },
    { re: /(ppm tool|outil ppm|portfolio management)/, t: 'Outils PPM', hard: true },
    { re: /(maintenance|exploitation|\bsupport\b)/, t: 'Maintenance / Support', hard: false },
    { re: /(formation|e-learning|training)/, t: 'Formation', hard: false },
    { re: /(marche public|procedure restreinte|appel d.offres|adjudication)/, t: 'Marchés publics', hard: false },
    { re: /(accompagnement|consultance|consultant|conseil)/, t: 'Consultance / accompagnement', hard: false },
    { re: /(deploiement|implementation|mise en place|mise en oeuvre|mise en œuvre)/, t: 'Déploiement / implémentation', hard: false },
    { re: /(ferroviaire|railway|infrabel|\bsncb\b)/, t: 'Secteur ferroviaire', hard: false },
  ];
  function inferSkills(offer) {
    const text = normStr([offer.title, offer.description, offer.employer, ...(offer.tags || [])].join(' '));
    const seen = new Set(); const out = [];
    for (const r of SKILL_RULES) {
      if (r.re.test(text) && !seen.has(r.t)) { seen.add(r.t); out.push({ t: r.t, hard: r.hard }); }
    }
    if (out.length === 0) {
      const t = (offer.title || '').trim();
      out.push({ t: t ? ('Expertise — ' + t.split(/[–:\-]/)[0].trim().slice(0, 40)) : 'Analyse du besoin', hard: false });
    }
    return out.slice(0, 6);
  }

  // ── Scoring ──
  function offerText(offer) {
    return normStr([offer.title, offer.employer, offer.description,
      ...(offer.skills || []).map(s => s.t || String(s)), ...(offer.tags || [])].join(' '));
  }
  function scoreOffer(offer, KW) {
    const text = offerText(offer);
    for (const kw of KW.no) { if (text.includes(normStr(kw))) return { score: 8, verdict: 'no' }; }
    let go = 0, maybe = 0;
    for (const kw of KW.go) { if (text.includes(normStr(kw))) go++; }
    for (const kw of KW.maybe) { if (text.includes(normStr(kw))) maybe++; }
    const score = Math.min(95, 35 + go * 10 + maybe * 4);
    return { score, verdict: score >= 60 ? 'go' : score >= 38 ? 'maybe' : 'no' };
  }

  // ── Matching membres ──
  function matchMembersToOffer(offer, members) {
    const text = offerText(offer);
    return (members || [])
      .map(m => { const matched = (m.kw || []).filter(kw => text.includes(normStr(kw))); return { member: m, matched, score: Math.min(98, matched.length * 15 + 38) }; })
      .filter(x => x.matched.length > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  }

  // ── Matrice : thèmes par offre ──
  function getThemesForOffer(offer, matrice) {
    const text = offerText(offer);
    return (matrice.themes || [])
      .filter(th => th.keywords.some(kw => text.includes(normStr(kw))))
      .slice(0, 4)
      .map(th => {
        const pole = (matrice.poles || []).find(p => p.id === th.pole) || {};
        return { id: th.id, label: th.label, pole: th.pole, color: pole.color, bg: pole.bg };
      });
  }

  // ── Filtre + recherche + tri ──
  function filterOffers(offers, filter, search) {
    let list = offers || [];
    if (filter === 'active') list = list.filter(o => o.verdict === 'go' || o.verdict === 'maybe');
    else if (filter && filter !== 'all') list = list.filter(o => o.verdict === filter);
    if (search) {
      const q = normStr(search);
      list = list.filter(o => normStr([o.employer, o.title, o.description,
        ...(o.skills || []).map(s => s.t || String(s)), ...(o.tags || [])].join(' ')).includes(q));
    }
    return list;
  }
  function sortList(list, col, dir) {
    const out = list.slice();
    if (col === 'deadline') {
      out.sort((a, b) => {
        const aD = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bD = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return dir === 'asc' ? aD - bD : bD - aD;
      });
    } else if (col === 'score') {
      out.sort((a, b) => dir === 'asc' ? (a.score || 0) - (b.score || 0) : (b.score || 0) - (a.score || 0));
    }
    return out;
  }

  // ── Validation data.json (utilisée par le site ET les tests) ──
  function validateData(data) {
    const errors = [];
    if (!data || typeof data !== 'object') return { ok: false, errors: ['data.json : objet attendu'] };
    if (!data.meta || !data.meta.lastSync) errors.push('meta.lastSync manquant');
    if (!data.matrice || !Array.isArray(data.matrice.poles) || data.matrice.poles.length !== 3) errors.push('matrice.poles : 3 pôles attendus');
    if (!data.matrice || !Array.isArray(data.matrice.themes) || data.matrice.themes.length < 9) errors.push('matrice.themes : ≥9 thèmes attendus');
    if (!data.kw || !Array.isArray(data.kw.go) || !Array.isArray(data.kw.maybe) || !Array.isArray(data.kw.no)) errors.push('kw.go/maybe/no manquants');
    if (!Array.isArray(data.members) || data.members.length < 1) errors.push('members : liste vide');
    else data.members.forEach((m, i) => {
      if (!m.id || !m.name) errors.push('members[' + i + '] : id/name manquant');
      if (!Array.isArray(m.kw)) errors.push('members[' + i + '] (' + (m.name || '?') + ') : kw doit être un tableau');
    });
    if (!Array.isArray(data.offers)) errors.push('offers : tableau attendu');
    else data.offers.forEach((o, i) => {
      const tag = 'offers[' + i + '] (' + (o.employer || o.id || '?') + ')';
      if (!o.id) errors.push(tag + ' : id manquant');
      if (!o.employer) errors.push(tag + ' : employer manquant');
      if (!o.title) errors.push(tag + ' : title manquant');
      if (typeof o.score !== 'number' || o.score < 0 || o.score > 100) errors.push(tag + ' : score 0-100 attendu');
      if (!['go', 'maybe', 'no'].includes(o.verdict)) errors.push(tag + ' : verdict go/maybe/no attendu');
      if (o.deadline !== null && o.deadline !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(o.deadline)) errors.push(tag + ' : deadline ISO YYYY-MM-DD ou null');
      if (!Array.isArray(o.skills) || o.skills.length === 0) errors.push(tag + ' : skills vide (inferSkills requis)');
    });
    return { ok: errors.length === 0, errors };
  }

  // ── Rendu (chaînes pures, pas de DOM) ──
  function renderDeadlineCell(offer, now) {
    const days = daysLeft(offer.deadline, now);
    if (days === null) return '<td><span style="color:var(--muted);font-size:12px">—</span></td>';
    const cls = days <= 7 ? 'urgent' : days <= 21 ? 'soon' : 'ok';
    const barColor = days <= 7 ? '#dc2626' : days <= 21 ? '#d97706' : '#16a34a';
    const chipStyle = days <= 7 ? 'background:#FEE2E2;color:#991B1B' : days <= 21 ? 'background:#FEF3C7;color:#92400E' : 'background:#DCFCE7;color:#166534';
    const pct = Math.max(0, Math.min(100, days > 0 ? (days / 60) * 100 : 0));
    return '<td><div class="dl-days ' + cls + '">' + days + 'j</div><div class="dl-bar"><div class="dl-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div><div class="dl-date">' + fmtDl(offer.deadline) + '</div><div class="dl-chip" style="' + chipStyle + '">' + (days <= 7 ? '🔴 Urgent' : days <= 21 ? '🟡 Bientôt' : '🟢 OK') + '</div></td>';
  }

  function renderMemberCard(item) {
    const m = item.member;
    const matchedNorm = new Set(item.matched.map(k => normStr(k)));
    const photoUrl = m.photo ? proxify(m.photo, 176) : null;
    const displaySkills = (m.cvSkills && m.cvSkills.length > 0)
      ? m.cvSkills.slice(0, 5).map(t => ({ t }))
      : (m.kw || []).slice(0, 4).map(k => ({ t: k }));
    const skillsHtml = displaySkills.map(s => {
      const sn = normStr(s.t || '');
      const isM = (m.kw || []).some(kw => matchedNorm.has(normStr(kw)) && sn.includes(normStr(kw)));
      return '<span class="ms-chip ' + (isM ? 'matched' : 'unmatched') + '">' + esc(s.t || String(s)) + '</span>';
    }).join('');
    const initial = m.name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
    const photoHtml = photoUrl
      ? '<img class="member-photo" src="' + esc(photoUrl) + '" alt="' + esc(m.name) + '" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
      : '';
    const initStyle = photoUrl ? 'display:none' : '';
    const cvDateHtml = m.cvDate
      ? '<div class="cv-date-line"><span>📄</span><span>CV · ' + esc(fmtDate(m.cvDate.slice(0, 10))) + '</span></div>'
      : '';
    return '<div class="member-card">'
      + '<div class="member-photo-wrap">' + photoHtml + '<div class="member-initial" style="' + initStyle + '">' + esc(initial) + '</div></div>'
      + '<div class="member-info">'
      + '<div class="member-name">' + esc(m.name) + '</div>'
      + '<div class="member-role">' + esc(m.role) + '</div>'
      + '<div class="member-skills-mini">' + skillsHtml + '</div>'
      + cvDateHtml
      + '</div>'
      + '<div class="member-score-col">'
      + '<div class="member-score-pct">' + item.score + '%</div>'
      + '<div class="member-bar"><div class="member-bar-fill" style="width:' + item.score + '%"></div></div>'
      + '</div></div>';
  }

  function renderOfferRow(offer, ctx) {
    ctx = ctx || {};
    const matrice = ctx.matrice || { poles: [], themes: [] };
    const members = ctx.members || [];
    const themes = getThemesForOffer(offer, matrice);
    const themeHtml = themes.map(t => '<span class="theme-chip chip-' + (t.pole || 'default') + '">' + esc(t.label) + '</span>').join('');
    const skillsHtml = (offer.skills || []).map(s => '<div class="skill-item"><div class="skill-dot ' + (s.hard ? 'hard' : 'soft') + '"></div><span>' + esc(s.t || String(s)) + '</span></div>').join('');
    const tagsHtml = (offer.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    const mm = matchMembersToOffer(offer, members);
    const membersHtml = mm.length ? mm.map(renderMemberCard).join('') : '<span style="color:var(--muted);font-size:12px">—</span>';
    const barColor = offer.score >= 60 ? '#16a34a' : offer.score >= 38 ? '#d97706' : '#dc2626';
    const vCls = offer.verdict === 'go' ? 'go' : offer.verdict === 'maybe' ? 'maybe' : 'no';
    const vLabel = offer.verdict === 'go' ? '✅ GO' : offer.verdict === 'maybe' ? '🤝 À étudier' : '🚫 Non';
    const wsUrl = 'https://www.publicprocurement.be/publication-workspaces/' + esc(offer.workspaceId) + '/general';
    return '<tr data-id="' + esc(offer.id) + '" data-verdict="' + esc(offer.verdict) + '">'
      + '<td><div class="emp-name">' + esc(offer.employer) + '</div><div class="emp-ref">' + esc(offer.reference) + '</div>'
      + (offer.sectorLabel ? '<span class="sector-badge" style="background:' + (offer.sectorBg || '#F1F5F9') + ';color:' + (offer.sectorColor || '#64748B') + '">' + esc(offer.sectorLabel) + '</span>' : '')
      + '<div class="emp-meta">'
      + (offer.budget && offer.budget !== 'N.D.' ? '<span>💶 ' + esc(offer.budget) + '</span>' : '')
      + (offer.duration && offer.duration !== 'N.D.' ? '<span>⏱️ ' + esc(offer.duration) + '</span>' : '')
      + (offer.location && offer.location !== 'N.D.' ? '<span>📍 ' + esc(offer.location) + '</span>' : '')
      + (offer.emailDate ? '<span>📧 ' + esc(fmtDate(offer.emailDate)) + '</span>' : '')
      + '</div></td>'
      + '<td><div class="offer-title">' + esc(offer.title) + '</div>'
      + (offer.description ? '<div class="offer-desc">' + esc(offer.description) + '</div>' : '')
      + (offer.note ? '<div class="offer-note">' + esc(offer.note) + '</div>' : '')
      + (tagsHtml ? '<div class="tags">' + tagsHtml + '</div>' : '')
      + '</td>'
      + '<td>' + (skillsHtml || '<span style="color:var(--muted);font-size:12px">—</span>')
      + (offer.skills && offer.skills.length ? '<div class="skill-legend"><span><span class="skill-dot hard" style="display:inline-block;vertical-align:middle;margin-right:3px"></span>Requis</span><span><span class="skill-dot soft" style="display:inline-block;vertical-align:middle;margin-right:3px"></span>Atout</span></div>' : '')
      + '</td>'
      + renderDeadlineCell(offer, ctx.now)
      + '<td><div class="dtsc-score" style="color:' + barColor + '">' + offer.score + '%</div>'
      + '<div class="dtsc-bar"><div class="dtsc-bar-fill" style="width:' + offer.score + '%;background:' + barColor + '"></div></div>'
      + (themeHtml ? '<div class="theme-chips">' + themeHtml + '</div>' : '')
      + '</td>'
      + '<td><div class="members-grid">' + membersHtml + '</div></td>'
      + '<td><div class="verdict-badge ' + vCls + '">' + vLabel + '</div>'
      + (offer.workspaceId ? '<a class="see-dossier" href="' + wsUrl + '" target="_blank" rel="noopener noreferrer">Voir le dossier →</a>' : '')
      + '</td></tr>';
  }

  return {
    normStr, esc, daysLeft, fmtDl, fmtDate, debounce, proxify,
    inferSkills, scoreOffer, matchMembersToOffer, getThemesForOffer,
    filterOffers, sortList, validateData,
    renderDeadlineCell, renderMemberCard, renderOfferRow,
  };
});
