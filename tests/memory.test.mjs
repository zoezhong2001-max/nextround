import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/store.mjs';
import {memoryContext} from '../server/memory.mjs';
import {editRebuild,readRebuild} from '../server/rebuild-edits.mjs';
test('记忆读取最新人工修正，原文不变，岗位关联明确，缺失不假装命中',()=>{
 const dir=mkdtempSync(join(tmpdir(),'memory-check-')), s=new Store(dir);
 try {
  assert.equal(memoryContext(s).available,false);
  s.setting('workbenchDocument',{profile:[],experiences:[{id:'project',title:'示例项目',period:'2026',blocks:[{title:'机制',text:'旧内容',sources:[]}],gaps:[]}],memories:[{id:'story',kind:'story',title:'用户教育',text:'项目判断',experienceIds:['project'],evidence:[{sessionId:'s',questionIds:['q']}]}],fullReviews:[{sessionId:'s',questions:[{id:'q',question:{text:'真实问题'},answer:{text:'真实答案'}}]}]});
  s.put('applications',{id:'job',memoryExperienceIds:['project']});
  const initial=readRebuild(s);
  editRebuild(s,{revision:initial.editRevision,ref:{kind:'memory',id:'story'},changes:{text:'修正后的判断'}});
  const c=memoryContext(s,{applicationId:'job'});
  assert.equal(c.results.find(x=>x.id==='story').text,'修正后的判断');
  assert.equal(memoryContext(s,{q:'修正'}).results[0].id,'story');
  assert.equal(memoryContext(s,{evidenceId:'q'}).evidence[0].answer.text,'真实答案');
  assert.throws(()=>memoryContext(s,{evidenceId:'missing'}),{status:404});
  assert.throws(()=>memoryContext(s,{experienceId:'missing'}),{status:404});
  assert.throws(()=>memoryContext(s,{q:[]}),{status:400});
  assert.ok(memoryContext(s,{q:'不存在的词'}).noMatch);
  assert.throws(()=>editRebuild(s,{revision:readRebuild(s).editRevision,ref:{kind:'memory',id:'story'},changes:{evidence:[]}}));
  const base=s.setting('workbenchDocument');base.memories[0].text='新的机器摘要';s.setting('workbenchDocument',base);
  assert.equal(memoryContext(s,{q:'修正'}).results[0].text,'修正后的判断');
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
