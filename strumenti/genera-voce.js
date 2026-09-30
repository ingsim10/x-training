// Registra le frasi della voce del circuito con la voce italiana di Windows ("Microsoft Elsa Desktop")
// e le salva in voce/*.mp3 + voce/indice.json, che circuito.html suona come i bip.
//
// Uso (sul PC di Simone, dalla cartella x-training):
//   node strumenti/genera-voce.js frasi.json [--tutto]
// frasi.json lo prepara F.R.I.D.A.Y sul server: allenamento.voce_da_registrare()
// (nomi degli esercizi, quantità, recuperi, giri). Rifà solo le frasi nuove; --tutto rifà tutto.
// Serve ffmpeg (winget install Gyan.FFmpeg); se non è nel PATH: variabile FFMPEG col percorso.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const QUI = path.join(__dirname, '..');
const VOCE = path.join(QUI, 'voce');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// uguali a circuito.html: una frase si ritrova dalla sua chiave
const chiave = t => String(t).toLowerCase().replace(/[.,:;!?"()]/g, ' ').replace(/\s+/g, ' ').trim();
function aParole(s) {
  const m = Math.floor(s / 60), r = s % 60;
  if (!m) return `${r} secondi`;
  const minuti = m === 1 ? '1 minuto' : `${m} minuti`;
  return r ? `${minuti} e ${r}` : minuti;
}
// come deve pronunciarle Elsa, quando la parola scritta la inganna (solo la voce, non la chiave)
const PRONUNCIA = [[/\bdead bug\b/i, 'ded bag'], [/\bbird dog\b/i, 'berd dog'], [/\bcm\b/i, 'centimetri']];

const argomenti = process.argv.slice(2);
const tutto = argomenti.includes('--tutto');
const sorgente = argomenti.find(a => !a.startsWith('--'));
if (!sorgente) { console.error('Uso: node strumenti/genera-voce.js frasi.json [--tutto]'); process.exit(1); }
const f = JSON.parse(fs.readFileSync(sorgente, 'utf8'));

const frasi = new Set(['Via', 'Prossimo', 'Finito, bravo', 'Riprendiamo', 'Ciao Simone, questa è la voce del circuito']);
for (const unita of ['Giro', 'Serie']) {
  for (let m = 2; m <= f.giri; m++) for (let n = 1; n <= m; n++) frasi.add(`${unita} ${n} di ${m}`);
}
f.recuperi.forEach(s => frasi.add('Recupero ' + aParole(s)));
f.nomi.forEach(x => frasi.add(x));
f.quanti.forEach(x => frasi.add(x));

fs.mkdirSync(VOCE, { recursive: true });
const indice = {};
const usati = new Map();
const da_fare = [];
for (const testo of frasi) {
  const k = chiave(testo);
  let nome = k.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'frase';
  if (usati.has(nome) && usati.get(nome) !== k) nome += '-' + usati.size;       // due chiavi, stesso nome di file
  usati.set(nome, k);
  const file = nome + '.mp3';
  indice[k] = file;
  if (tutto || !fs.existsSync(path.join(VOCE, file))) {
    const dire = PRONUNCIA.reduce((t, [cerca, metti]) => t.replace(cerca, metti), testo);
    da_fare.push({ dire, wav: path.join(os.tmpdir(), 'voce-circuito-' + nome + '.wav'), file });
  }
}

if (da_fare.length) {
  const lista = path.join(os.tmpdir(), 'voce-circuito-lista.json');
  fs.writeFileSync(lista, JSON.stringify(da_fare.map(({ dire, wav }) => ({ dire, wav }))), 'utf8');
  const script = path.join(os.tmpdir(), 'voce-circuito.ps1');
  fs.writeFileSync(script, [
    'param($lista)',
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "$s.SelectVoice('Microsoft Elsa Desktop')",
    '$s.Rate = 1',
    '$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)',
    'foreach ($x in (Get-Content -Raw -Encoding UTF8 $lista | ConvertFrom-Json)) {',
    '  $s.SetOutputToWaveFile($x.wav, $fmt)',
    '  $s.Speak($x.dire)',
    '}',
    '$s.SetOutputToNull()',
    '$s.Dispose()',
  ].join('\r\n'), 'utf8');
  const ps = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-lista', lista], { encoding: 'utf8' });
  if (ps.status !== 0) { console.error(ps.stderr || ps.stdout); process.exit(1); }

  // via il silenzio all'inizio e alla fine (le frasi si attaccano una all'altra), volume pieno, mp3 leggero
  const filtro = 'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse,'
    + 'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse,loudnorm=I=-14:TP=-1.5:LRA=11';
  for (const x of da_fare) {
    const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', x.wav, '-af', filtro, '-ar', '24000', '-ac', '1',
      '-b:a', '48k', path.join(VOCE, x.file)], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(x.file, r.stderr || r.error); process.exit(1); }
    fs.unlinkSync(x.wav);
  }
}

const ordinato = Object.fromEntries(Object.entries(indice).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(path.join(VOCE, 'indice.json'), JSON.stringify(ordinato, null, 1) + '\n', 'utf8');
const peso = fs.readdirSync(VOCE).filter(x => x.endsWith('.mp3')).reduce((t, x) => t + fs.statSync(path.join(VOCE, x)).size, 0);
console.log(`${frasi.size} frasi, ${da_fare.length} registrate adesso, voce/ = ${Math.round(peso / 1024)} KB`);
