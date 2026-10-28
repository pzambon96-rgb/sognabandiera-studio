// Stessi controlli di test/modello3d_test.dart: node studio/test/calcoli.test.js
const assert = require('assert');
const path = require('path');
const Calcoli = require('../js/calcoli.js');
const dati = require(path.join(__dirname, '..', '..', 'modelli', 'tre-cavalletti.json'));
const c = Calcoli.crea(dati);

assert.strictEqual(c.passi().length, 20);
const gambe = c.pali().find((p) => p.nome.startsWith('Gamba'));
assert.deepStrictEqual([gambe.quantita, gambe.lunghezzaCm, gambe.diametroCm], [6, 530, 13]);
assert.strictEqual(c.pali().find((p) => p.nome.startsWith('Montante')).quantita, 2);
const leg = c.legature();
assert.strictEqual(leg.reduce((s, l) => s + l.quantita, 0), 42);
const inc = leg.find((l) => l.posizione === 'Incrocio basso delle gambe');
assert.deepStrictEqual([inc.tipo, inc.quantita, inc.cordinoLunghezzaM], ['Diagonale', 3, 4.5]);
assert.strictEqual(Calcoli.stimaCordino('parallela', 0.15, 0.126), 3.5);
const m = Object.fromEntries(c.misure().map((x) => [x.nome, x.valore]));
assert.ok(m['Altezza massima'].startsWith('≈ 9'));
assert.strictEqual(m['Lato'], '≈ 3,9 m');
assert.ok('Tirante' in m && 'Pali in totale' in m);
assert.ok(c.passi()[1].serve.includes('2 × Gamba del cavalletto a V'));
assert.ok(c.passi()[1].serve.includes('1 cordino (1 diagonale'));
assert.strictEqual(Calcoli.num1(2), '2'); assert.strictEqual(Calcoli.num1(2.5), '2,5'); assert.strictEqual(Calcoli.num1(2.25), '2,25');
console.log('calcoli: tutti i controlli superati');
console.log(c.misure()); console.log(c.passi()[1].serve);
