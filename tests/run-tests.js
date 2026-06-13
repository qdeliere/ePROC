#!/usr/bin/env node
/* ============================================================
 * DTSC e-PROC — suite de tests unitaires (Node, zero dep)
 * Usage : node tests/run-tests.js
 * Exit 1 si echec (CI-friendly).
 * ============================================================ */
'use strict';
const path = require('path');
const fs = require('fs');
const EPROC = require(path.join(__dirname, '..', 'core.js'));

let passed = 0, failed = 0;
const fails = [];
function assert(desc, cond) {
  if (cond) { passed++; console.log('  ✅', desc); }
  else { failed++; fails.push(desc); console.error('  ❌', desc); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
const KW = data.kw, MATRICE = data.matrice, MEMBERS = data.members, OFFERS = data.offers;

// 1. Utils
section('Utils');
assert('normStr: accents', EPROC.normStr('Deploiement') === 'deploiement');
assert('normStr: null -> ""', EPROC.normStr(null) === '');
assert('normStr: majuscules', EPROC.normStr('PMO Securite') === 'pmo securite');
assert('esc: <b> echappe', EPROC.esc('<b>') === '&lt;b&gt;');
assert('esc: quotes echappees', EPROC.esc('a"b\'c') === 'a&quot;b&#039;c');
assert('esc: null -> ""', EPROC.esc(null) === '');
assert('esc: ampersand', EPROC.esc('A&B') === 'A&amp;B');
assert('daysLeft: +7 jours', EPROC.daysLeft('2026-06-19', '2026-06-12') === 7);
assert('daysLeft: passe negatif', EPROC.daysLeft('2026-06-01', '2026-06-12') === -11);
assert('daysLeft: null -> null', EPROC.daysLeft(null) === null);
assert('daysLeft: invalide -> null', EPROC.daysLeft('pas-une-date') === null);
assert('fmtDl: null -> tiret', EPROC.fmtDl(null) === '—');
assert('proxify: domaine wsrv', EPROC.proxify('https://www.dtsc.be/x.jpg').startsWith('https://wsrv.nl/?url='));
assert('proxify: schema retire', EPROC.proxify('https://www.dtsc.be/x.jpg').includes(encodeURIComponent('www.dtsc.be/x.jpg')));
assert('proxify: data URL inchangee', EPROC.proxify('data:image/png;base64,AAA') === 'data:image/png;base64,AAA');
assert('proxify: vide -> ""', EPROC.proxify('') === '');
assert('proxify: dimensions', EPROC.proxify('https://www.dtsc.be/x.jpg', 88).includes('w=88'));

// 2. Scoring
section('Scoring');
const s1 = EPROC.scoreOffer({ title: 'Chef de projet PMO transformation', employer: 'SPF', description: 'migration coordination' }, KW);
const s2 = EPROC.scoreOffer({ title: 'Infirmier chirurgie', employer: 'CHU', description: 'medicament clinique' }, KW);
const s3 = EPROC.scoreOffer({ title: '', employer: '', description: '' }, KW);
assert('go: score >= 60', s1.score >= 60);
assert('go: verdict go', s1.verdict === 'go');
assert('no: score = 8', s2.score === 8);
assert('no: verdict no', s2.verdict === 'no');
assert('vide: score = 35 (base)', s3.score === 35);
assert('vide: verdict no', s3.verdict === 'no');
assert('plafond 95', EPROC.scoreOffer({ title: KW.go.join(' '), employer: '', description: '' }, KW).score <= 95);
assert('hrrail: go coherent', OFFERS.find(o => o.id === 'hrrail').verdict === 'go');

// 3. inferSkills
section('inferSkills');
const tFin = EPROC.inferSkills({ title: 'Aanstelling bedrijfsrevisor voor de controle en certificering van de jaarrekening' });
const tIso = EPROC.inferSkills({ title: 'Audit interne pour les normes ISO 9001 et ISO/IEC 17025' });
const tDev = EPROC.inferSkills({ title: 'Emarket 839 - Senior Java & Angular Developer' });
const tCoo = EPROC.inferSkills({ title: 'Consultant coordinateur - Migration IT' });
const tEmpty = EPROC.inferSkills({ title: '', description: '', employer: '' });
assert('revisor -> >=1 skill', tFin.length >= 1);
assert('revisor -> Revision financiere', tFin.some(s => /R.vision|Revisi/.test(s.t)));
assert('ISO -> certification/audit', tIso.some(s => /ISO|Audit/.test(s.t)));
assert('Java -> developpement', tDev.some(s => /D.veloppement/.test(s.t)));
assert('coord + migration detectes', tCoo.some(s => /Coordination/.test(s.t)) && tCoo.some(s => /Migration/.test(s.t)));
assert('jamais vide', tEmpty.length >= 1);
assert('objets {t, hard}', typeof tDev[0].t === 'string' && typeof tDev[0].hard === 'boolean');
assert('max 6 skills', EPROC.inferSkills({ title: 'chef de projet audit migration data architecture scrum securite cloud formation' }).length <= 6);

// 4. Matching membres
section('Matching membres');
const hrrail = OFFERS.find(o => o.id === 'hrrail');
const mm = EPROC.matchMembersToOffer(hrrail, MEMBERS);
assert('HR Rail: >=1 membre matche', mm.length >= 1);
assert('HR Rail: max 4 membres', mm.length <= 4);
assert('scores tries decroissants', mm.every((x, i) => i === 0 || x.score <= mm[i - 1].score));
assert('score membre <= 98', mm.every(x => x.score <= 98));
assert('regr: aucun kw "ai" ou "it" seul', MEMBERS.flatMap(m => m.kw).filter(k => k === 'ai' || k === 'it').length === 0);
const noMatch = EPROC.matchMembersToOffer({ title: 'zzz xxx yyy', employer: '', description: '', skills: [], tags: [] }, MEMBERS);
assert('offre sans rapport -> 0 membre', noMatch.length === 0);
assert('Ludovic VL (kw vide) jamais matche', !mm.some(x => x.member.id === 'ludovic-van-laethem'));
// Seniorite
const julieMatch = mm.find(x => x.member.id === 'julie-destexhe');
if (julieMatch) {
  assert('Julie HR Rail: seniorityOk === false', julieMatch.seniorityOk === false);
  assert('Julie HR Rail: score < kwScore (penalite appliquee)', julieMatch.score < julieMatch.kwScore);
  assert('Julie HR Rail: score >= floor 50%', julieMatch.score >= Math.round(julieMatch.kwScore * 0.50));
}
const noSenOffer = { ...hrrail, seniorityRequired: undefined };
const mmNoSen = EPROC.matchMembersToOffer(noSenOffer, MEMBERS);
assert('sans seniorityRequired -> seniorityOk null', mmNoSen.every(x => x.seniorityOk === null));
const seniorMember = MEMBERS.find(m => m.xpYears != null && m.xpYears >= 10);
if (seniorMember) {
  const seniorMatch = mm.find(x => x.member.id === seniorMember.id);
  if (seniorMatch) assert('senior member (>=10 ans): seniorityOk === true', seniorMatch.seniorityOk === true);
}
assert('tous membres ont xpYears defini', MEMBERS.every(m => 'xpYears' in m));

// 5. Matrice / themes
section('Matrice');
assert('3 poles', MATRICE.poles.length === 3);
assert('>=9 themes', MATRICE.themes.length >= 9);
['lucid', 'spark', 'brain'].forEach(p => assert('pole ' + p + ' existe', !!MATRICE.poles.find(x => x.id === p)));
const hrThemes = EPROC.getThemesForOffer(hrrail, MATRICE);
assert('HR Rail -> >=1 theme', hrThemes.length >= 1);
assert('HR Rail -> max 4 themes', hrThemes.length <= 4);
assert('themes ont couleur pole', hrThemes.every(t => t.color && t.bg));

// 6. Filtre / recherche / tri
section('Filtre & tri');
assert('filtre active = go+maybe', EPROC.filterOffers(OFFERS, 'active').every(o => o.verdict !== 'no'));
assert('filtre all = tout', EPROC.filterOffers(OFFERS, 'all').length === OFFERS.length);
assert('filtre go', EPROC.filterOffers(OFFERS, 'go').every(o => o.verdict === 'go'));
assert('filtre no', EPROC.filterOffers(OFFERS, 'no').every(o => o.verdict === 'no'));
assert('recherche "forem" -> 1', EPROC.filterOffers(OFFERS, 'all', 'forem').length === 1);
assert('recherche accents-insensible', EPROC.filterOffers(OFFERS, 'all', 'sante').length >= 1);
assert('recherche sans resultat -> 0', EPROC.filterOffers(OFFERS, 'all', 'zzzzzzz').length === 0);
const byDl = EPROC.sortList(OFFERS, 'deadline', 'asc');
const dlVals = byDl.filter(o => o.deadline).map(o => new Date(o.deadline).getTime());
assert('tri deadline asc', dlVals.every((v, i) => i === 0 || v >= dlVals[i - 1]));
assert('tri deadline: null en dernier', byDl.slice(-2).every(o => !o.deadline) || byDl.filter(o => !o.deadline).length === 0);
const bySc = EPROC.sortList(OFFERS, 'score', 'desc');
assert('tri score desc', bySc.every((o, i) => i === 0 || (o.score || 0) <= (bySc[i - 1].score || 0)));
const firstIdBefore = OFFERS[0].id;
assert('sortList ne mute pas', EPROC.sortList(OFFERS, 'score', 'asc') !== OFFERS && OFFERS[0].id === firstIdBefore);

// 7. Validation data.json
section('Validation data.json');
const v = EPROC.validateData(data);
if (!v.ok) console.error('  Erreurs:', v.errors);
assert('data.json valide', v.ok);
assert('meta.lastSync present', !!data.meta.lastSync && !isNaN(new Date(data.meta.lastSync)));
assert('10 membres', MEMBERS.length === 10);
assert('>=1 offre', OFFERS.length >= 1);
assert('toutes les offres ont des skills', OFFERS.every(o => o.skills && o.skills.length > 0));
assert('workspaceId = UUID', OFFERS.every(o => /^[0-9a-f-]{36}$/.test(o.workspaceId)));
assert('4 membres avec photo', MEMBERS.filter(m => m.photo).length === 4);
assert('photos = dtsc.be', MEMBERS.filter(m => m.photo).every(m => m.photo.startsWith('https://www.dtsc.be/')));
assert('validateData: rejette null', !EPROC.validateData(null).ok);
assert('validateData: rejette offre sans verdict', !EPROC.validateData({ ...data, offers: [{ ...OFFERS[0], verdict: 'oops' }] }).ok);
assert('validateData: rejette deadline non-ISO', !EPROC.validateData({ ...data, offers: [{ ...OFFERS[0], deadline: '12/07/2026' }] }).ok);

// 8. Integrite fichiers (anti-troncature)
// Ces tests bloquent le push si un fichier a ete tronque sur le mount Linux.
section('Integrite fichiers');
(function checkFileIntegrity() {
  const coreJs = fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8');
  assert('core.js: se termine par });', /\}\)\;\s*$/.test(coreJs.trim()));
  assert('core.js: syntaxe valide', (() => { try { new Function(coreJs); return true; } catch(e) { return false; } })());
  assert('core.js: pas de double renderOfferRow', (coreJs.match(/function renderOfferRow/g) || []).length === 1);
  assert('core.js: pas de double matchMembersToOffer', (coreJs.match(/function matchMembersToOffer/g) || []).length === 1);
  assert('core.js: exporte renderOfferRow', coreJs.includes('renderOfferRow,'));

  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert('index.html: se termine par </html>', /\<\/html\>\s*$/.test(indexHtml.trim()));
  const scriptOpen = (indexHtml.match(/<script/g) || []).length;
  const scriptClose = (indexHtml.match(/<\/script>/g) || []).length;
  assert('index.html: balises <script> equilibrees (' + scriptOpen + '/' + scriptClose + ')', scriptOpen === scriptClose);
  assert('index.html: contient function init(', indexHtml.includes('function init('));
  assert('index.html: contient function renderOffers(', indexHtml.includes('function renderOffers('));
  assert('index.html: contient runBrowserTests', indexHtml.includes('runBrowserTests'));

  const testsJs = fs.readFileSync(path.join(__dirname, 'run-tests.js'), 'utf8');
  assert('run-tests.js: contient Suite verte', testsJs.includes('Suite verte'));
  assert('run-tests.js: contient process.exit(1)', testsJs.includes('process.exit(1)'));
})();

// 9. Rendu (smoke, chaines pures)
section('Rendu');
const ctx = { matrice: MATRICE, members: MEMBERS, now: '2026-06-12' };
for (const o of OFFERS) {
  const html = EPROC.renderOfferRow(o, ctx);
  assert('row ' + o.id + ': contient employeur', html.includes(EPROC.esc(o.employer)));
  assert('row ' + o.id + ': pas de "undefined"', !html.includes('undefined'));
  assert('row ' + o.id + ': <tr> equilibre', (html.match(/<tr/g) || []).length === (html.match(/<\/tr>/g) || []).length);
  assert('row ' + o.id + ': 7 colonnes', (html.match(/<td/g) || []).length === 7);
}
const dlCell = EPROC.renderDeadlineCell({ deadline: '2026-06-15' }, '2026-06-12');
assert('deadline 3j -> urgent', dlCell.includes('urgent'));
const dlCellOk = EPROC.renderDeadlineCell({ deadline: '2026-09-01' }, '2026-06-12');
assert('deadline lointaine -> ok', dlCellOk.includes('"dl-days ok"') || dlCellOk.includes('dl-days ok'));
assert('deadline null -> tiret', EPROC.renderDeadlineCell({ deadline: null }).includes('—'));
const evil = { ...OFFERS[0], title: '<script>alert(1)</script>', employer: '<img onerror=x>', description: 'a"b' };
const evilHtml = EPROC.renderOfferRow(evil, ctx);
assert('XSS: <script> echappe', !evilHtml.includes('<script>alert'));
assert('XSS: <img onerror> echappe', !evilHtml.includes('<img onerror'));

// Resume
console.log('\n════════════════════════════');
console.log('📊 ' + passed + '/' + (passed + failed) + ' tests passes');
if (failed > 0) {
  console.error('❌ Echecs :');
  fails.forEach(f => console.error('   - ' + f));
  process.exit(1);
} else {
  console.log('✅ Suite verte');
}
