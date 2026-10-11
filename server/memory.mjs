import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readRebuild } from './rebuild-edits.mjs';

// ponytail: scan the single-user corpus; add a text index only if measured latency requires it.
export function memoryContext(store, options = {}) {
  const { q = '', experienceId = '', applicationId = '', evidenceId = '' } = options;
  for (const value of [q, experienceId, applicationId, evidenceId])
    if (typeof value !== 'string' || value.length > 500)
      throw Object.assign(new Error('记忆检索参数无效'), { status: 400 });
  if (!store.setting('workbenchDocument') && !existsSync(join(store.directory, 'rebuild-2026-10/dossier.json')))
    return { available: false, results: [], reason: '尚无个人记忆资料' };
  const d = readRebuild(store);
  const application = applicationId ? store.get('applications', applicationId) : null;
  if (applicationId && !application) throw Object.assign(new Error('岗位不存在'), { status: 404 });
  if (experienceId && !(d.experiences || []).some(e => e.id === experienceId))
    throw Object.assign(new Error('经历不存在'), { status: 404 });
  const memories = (d.memories || []).filter(m => !m.retiredAt);
  const projects = experienceId ? [experienceId] : application?.memoryExperienceIds || [];
  const terms = q.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  const rows = [];
  for (const m of memories) rows.push({ ...m, kind: m.kind || '记忆', route: `/#page=assets&asset=${m.kind === 'learning' ? 'learning' : m.experienceIds?.[0] || 'profile'}` });
  for (const e of d.experiences || []) {
    rows.push({ id: `experience:${e.id}`, title: e.title, kind: '经历当前事实', text: [e.subtitle, e.period, ...e.blocks.map(b => `${b.title}：${b.text}`)].join('\n'), experienceIds: [e.id], sources: [...new Set(e.blocks.flatMap(b => b.sources || []))], gaps: e.gaps, conflicts: (d.conflicts || []).filter(c => e.conflicts?.includes(c.id)), route: `/#page=assets&asset=${e.id}` });
  }
  for (const f of d.questionFamilies || []) rows.push({ id: `family:${f.id}`, title: f.title, kind: '跨场观察（非人格定论）', text: f.summary, evidence: f.items || [], route: '/#page=reviews' });
  const evidence = [];
  for (const r of d.fullReviews || []) for (const question of r.questions || []) {
    if (evidenceId === question.id) evidence.push({ sessionId: r.sessionId, ...question });
    if (q) {
      const experienceIds = [...new Set((r.groups || []).filter(g => g.questionIds?.includes(question.id)).map(g => g.experienceId).filter(Boolean))];
      rows.push({ id: question.id, title: `${r.sessionId} · ${question.time || ''} · ${question.group || ''}`, kind: '历史问答（不等于已确认事实）', text: `${question.question?.text || ''}\n${question.answer?.text || ''}\n诊断：${question.diagnosis || ''}\n更正：${question.correction || ''}`, experienceIds, route: `/#page=reviews&review=${r.sessionId}`, evidence: [{ sessionId: r.sessionId, questionIds: [question.id] }] });
    }
  }
  if (evidenceId && !evidence.length) throw Object.assign(new Error('问答证据不存在'), { status: 404 });
  const selected = rows.map(row => {
    const text = `${row.title} ${row.text} ${(row.experienceIds || []).join(' ')}`.toLocaleLowerCase();
    const hits = terms.filter(t => text.includes(t)).length;
    const linked = projects.some(p => row.experienceIds?.includes(p));
    return { ...row, score: hits * 10 + (linked ? 5 : 0) };
  }).filter(row => {
    if (experienceId && !row.experienceIds?.includes(experienceId)) return false;
    return terms.length ? row.score >= 10 : projects.length ? projects.some(p => row.experienceIds?.includes(p)) : row.kind !== '经历当前事实';
  }).sort((a,b) => b.score - a.score);
  return { available: true, revision: d.editRevision, profile: d.profile || [], personalContext: memories.filter(m => ['preference','understanding'].includes(m.kind)), application, experiences: (d.experiences || []).map(e => ({id:e.id,title:e.title,period:e.period})), total: selected.length, results: selected.slice(0,12), evidence, noMatch: terms.length > 0 && !selected.length ? '本次关键词未命中，不代表资料不存在。先换用经历名称、别名或查看经历目录，再向用户询问。' : undefined };
}
