// Quick check of the study engine: `npm run test:engine`
import { blocksFromPlainText, buildStudyPack } from '../shared/engine';
import { SAMPLE_NOTES, SAMPLE_TITLE } from '../shared/sample';

const t0 = performance.now();
const blocks = blocksFromPlainText(SAMPLE_NOTES);
const pack = buildStudyPack(blocks, { title: SAMPLE_TITLE });
const ms = Math.round(performance.now() - t0);

const verbose = process.argv.includes('-v');
console.log(`Built "${pack.title}" in ${ms}ms`, pack.stats);
console.log('\nBLOCKS:', blocks.map((b) => `${b.kind[0]}${b.level ?? ''}: ${b.text.slice(0, 60)}`).join('\n  '));
console.log('\nCHUNKS:');
for (const c of pack.chunks) {
  console.log(`  [${c.index}] ${c.title}  (${c.wordCount}w, importance ${c.importance})`);
  console.log(`      nutshell: ${c.nutshell}`);
  console.log(`      terms: ${c.keyTerms.join(', ')}`);
  if (verbose) c.keyPoints.forEach((p) => console.log(`      • ${p}`));
  if (verbose) c.prompts.forEach((p) => console.log(`      ? ${p}`));
}
console.log('\nKEY TERMS:', pack.keyTerms.slice(0, 25).map((t) => `${t.term}(${t.score.toFixed(1)})`).join(', '));
console.log('\nGLOSSARY:');
pack.glossary.forEach((d) => console.log(`  ${d.term} [s${d.strength}, c${d.chunk}] = ${d.definition}`));
console.log('\nLISTS:');
pack.lists.forEach((l) => console.log(`  ${l.category} (${l.ordered ? 'ordered' : 'unordered'}, c${l.chunk}): ${l.items.map((i) => i.label).join(' | ')}`));
console.log('\nMNEMONICS:');
pack.mnemonics.forEach((m) => console.log(`  ${m.category}: ${m.acronym} — ${m.acrostics[0]}`));
console.log('\nPALACE:', pack.palace.map((p) => p.cue).join(' → '));
console.log('\nCARDS:');
pack.cards.slice(0, verbose ? 999 : 14).forEach((c) => console.log(`  (${c.type}) ${c.front}  ⟶  ${c.back.replace(/\n/g, ' / ')}`));
console.log('\nQUIZ:');
pack.quiz.slice(0, verbose ? 999 : 12).forEach((q) => {
  if (q.type === 'mcq') console.log(`  MCQ ${q.prompt}\n     ${q.options.map((o, i) => (i === q.answer ? `[${o}]` : o)).join(' | ')}`);
  else if (q.type === 'tf') console.log(`  T/F (${q.answer}) ${q.prompt}`);
  else if (q.type === 'fill') console.log(`  FILL ${q.prompt}  = ${q.answer}`);
  else console.log(`  ORDER ${q.prompt}: ${q.items.join(' > ')}`);
});
console.log('\nOVERVIEW:', pack.overview.join(' '));
