import test from 'node:test';
import assert from 'node:assert/strict';
import { captionParts, validate } from './video.mjs';

const scene = {id:'1-01',chapter:'第一章',title:'提取字段',narration:'保留全部旁白。',input:'邮件',action:'提取',output:'表格',humanCheckpoint:'复核',audioPath:'audio.mp3',visualType:'extract',viewer:{headline:'字段提取',leftTitle:'邮件',rightTitle:'字段',inputText:'示例',result:'表格',checkpoint:'复核',items:['产品']}};
test('Chinese/English/punctuation and long text survive caption splitting exactly',()=>{
 for(const value of ['订单是 M/L，FOB Shanghai。数量 1000000！请复核。','中文English没有标点的超长字符串'.repeat(12),'abc\n第二行：继续；确认？']){
  const parts=captionParts(value);assert.equal(parts.join(''),value);assert.ok(parts.every(s=>Array.from(s).length<=28));
 }
});
test('Missing audio and duplicate identities fail before production',()=>{
 assert.throws(()=>validate({title:'示例',scenes:[{...scene,audioPath:''}]}),/audioPath/);
 assert.throws(()=>validate({title:'示例',scenes:[scene,scene]}),/duplicate/);
});
test('Production notes may exist off-screen, but cannot enter viewer text',()=>{
 assert.doesNotThrow(()=>validate({title:'示例',scenes:[{...scene,productionNote:'制作规则：输入到输出'}]}));
 assert.throws(()=>validate({title:'示例',scenes:[{...scene,viewer:{...scene.viewer,headline:'制作规则：输入到输出'}}]}),/production notes/);
});
test('Unsupported templates and overflowing item counts fail explicitly',()=>{
 assert.throws(()=>validate({title:'示例',scenes:[{...scene,visualType:'unknown'}]}),/visualType/);
 assert.throws(()=>validate({title:'示例',scenes:[{...scene,viewer:{...scene.viewer,items:Array(7).fill('内容')}}]}),/1–6/);
});
