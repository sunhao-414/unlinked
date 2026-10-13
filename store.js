export const SUBJECTS = ['数学', '英语', '政治', '408'];
export const MODULES = ['数据结构', '计算机组成原理', '操作系统', '计算机网络'];
export const label = value => value === '408' ? '计算机 408' : value;
const MB = 1024 * 1024;
// The path isolates installs hosted in different GitHub Pages repositories on one origin.
const DB_NAME = 'shiti-personal-v1:' + new URL('.', import.meta.url).pathname;
let opening;
export function openDatabase() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { for (const name of ['questions', 'materials', 'meta']) request.result.createObjectStore(name, {keyPath:'id'}); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
    request.onerror = () => { opening = null; reject(new Error('无法打开本机存储，请使用正常浏览模式，并允许网站保存数据。')); };
    request.onblocked = () => { opening = null; reject(new Error('请关闭其他拾题标签页，再重新打开。')); };
  });
  return opening;
}
function errorMessage(error) { return error?.name === 'QuotaExceededError' ? new Error('手机存储空间不足，本次操作未保存。请先导出备份并释放空间。') : error || new Error('本机数据保存失败，请重试。'); }
export async function transaction(names, mode, run) {
  const db = await openDatabase();
  return new Promise((resolve,reject) => { const tx = db.transaction(names, mode); let result;
    tx.oncomplete = () => resolve(result); tx.onabort = tx.onerror = () => reject(errorMessage(tx.error));
    try { result = run(tx); } catch (error) { tx.abort(); reject(error); }
  });
}
export async function all(name) { let request; await transaction([name], 'readonly', tx => { request = tx.objectStore(name).getAll(); }); return request.result; }
export async function get(name, id) { let request; await transaction([name], 'readonly', tx => { request = tx.objectStore(name).get(id); }); return request.result; }
export async function put(name, value) { await transaction([name], 'readwrite', tx => tx.objectStore(name).put(value)); }
export async function remove(name, id) { await transaction([name], 'readwrite', tx => tx.objectStore(name).delete(id)); }
export const uid = () => crypto.randomUUID();
export async function imageFile(file) {
  if (!file.size || file.size > 5 * MB) throw new Error('每张图片须大于 0 且不超过 5 MB。');
  const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
  let type = bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? 'image/jpeg' : bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71 ? 'image/png' : bytes[0]===82 && bytes[1]===73 && bytes[2]===70 && bytes[3]===70 && bytes[8]===87 && bytes[9]===69 && bytes[10]===66 && bytes[11]===80 ? 'image/webp' : null;
  if (!type) throw new Error('请选择 JPG、PNG 或 WebP 图片；HEIC 照片请先转换为 JPG。');
  const blob = new Blob([file], {type}), url = URL.createObjectURL(blob);
  try { const image = new Image(); image.src = url; await image.decode(); if (image.naturalWidth*image.naturalHeight > 24000000) throw new Error('图片超过 2400 万像素，请缩小后添加。'); }
  catch(error) { throw new Error(error.message.includes('2400') ? error.message : '图片无法读取，请重新选择完整的图片文件。'); }
  finally { URL.revokeObjectURL(url); }
  return {id:uid(),name:(file.name || '错题照片.jpg').slice(0,180),blob};
}
export async function materialFile(file) {
  if (!file.size || file.size > 50 * MB) throw new Error('学习资料单文件须大于 0 且不超过 50 MB。');
  const ext = file.name.split('.').pop().toLowerCase(), bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
  const types={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
  if (!types[ext]) throw new Error('支持 PDF、DOCX、PPTX、JPG 和 PNG。');
  if (['jpg','jpeg','png'].includes(ext)) { const result=await imageFile(file); if (result.blob.type!==types[ext]) throw new Error('图片扩展名与内容不一致。'); return result.blob; }
  if (ext==='pdf' && !(bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45)) throw new Error('这个文件不是有效 PDF。');
  if (['docx','pptx'].includes(ext) && !(bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4)) throw new Error('文件不是支持的 Office 文档格式。');
  // Office files are stored as opaque local attachments and never executed or unpacked.
  return new Blob([file],{type:types[ext]});
}
export function linksFrom(text) {
  const links=String(text || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (links.length>10) throw new Error('最多保存 10 个参考链接。');
  return links.map(link=> { let url; try { url=new URL(link); } catch { throw new Error('参考链接请填写完整的 http:// 或 https:// 地址。'); }
    if (!['http:','https:'].includes(url.protocol)||url.username||url.password||link.length>2048) throw new Error('参考链接仅支持不含账号密码的 HTTP / HTTPS 地址。'); return url.href; });
}
function text(value,max,required=false) { if (typeof value!=='string'||value.length>max||required&&!value.trim()) throw new Error('备份中的文字字段格式不正确。'); return value; }
function id(value) { if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error('备份记录编号无效。'); return value; }
function date(value) { if(typeof value!=='string'||!Number.isFinite(Date.parse(value))) throw new Error('备份记录时间无效。'); return new Date(value).toISOString(); }
function subject(value) { if (!SUBJECTS.includes(value)) throw new Error('备份科目不受支持。'); return value; }
function encode(blob) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('文件读取失败，未生成备份。'));reader.readAsDataURL(blob);}); }
function decode(data, max) {
  if(typeof data!=='string'||data.length>Math.ceil(max/3)*4+200) throw new Error('备份附件超过大小限制。');
  const match=/^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(data);
  if(!match||match[2].length%4) throw new Error('备份附件格式不正确。');
  let raw;try{raw=atob(match[2]);}catch{throw new Error('备份附件已损坏。');}
  if(!raw.length||raw.length>max) throw new Error('备份附件大小无效。');
  return new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:match[1]});
}
export async function exportBackup() {
  let qReq,mReq;
  await transaction(['questions','materials'],'readonly',tx=>{qReq=tx.objectStore('questions').getAll();mReq=tx.objectStore('materials').getAll();});
  const questions=qReq.result,materials=mReq.result;
  const bytes=questions.reduce((sum,q)=>sum+q.images.reduce((n,img)=>n+img.blob.size,0),0)+materials.reduce((n,m)=>n+m.blob.size,0);
  if(bytes>140*MB) throw new Error('附件总量超过 140 MB，手机整包备份可能内存不足。请先保存大资料原文件并移出本机资料库后重试。');
  const qOut=[]; for(const q of questions){const images=[];for(const img of q.images)images.push({id:img.id,name:img.name,data:await encode(img.blob)});qOut.push({...q,images});}
  const mOut=[];for(const m of materials){const {blob,...rest}=m;mOut.push({...rest,data:await encode(blob)});}
  const payload={format:'shiti-offline',version:1,exportedAt:new Date().toISOString(),questions:qOut,materials:mOut};
  return new Blob([JSON.stringify(payload)],{type:'application/json'});
}
export async function parseBackup(file) {
  if(file.size>200*MB)throw new Error('备份文件超过 200 MB，请使用较小的备份。');
  let data;try{data=JSON.parse(await file.text());}catch{throw new Error('不是有效的 JSON 备份文件。');}
  if(data?.format!=='shiti-offline'||data.version!==1||!Array.isArray(data.questions)||!Array.isArray(data.materials)||data.questions.length>5000||data.materials.length>1000)throw new Error('请选择拾题离线版导出的备份（版本 1）。');
  const questions=[],materials=[],seen=new Set();let total=0;
  for(const q of data.questions){
    if(!q||!Array.isArray(q.images)||q.images.length>6||!Array.isArray(q.links)||typeof q.mastered!=='boolean')throw new Error('备份错题结构无效。');
    const record={id:id(q.id),title:text(q.title,120,true),subject:subject(q.subject),chapter:text(q.chapter,100),content:text(q.content,20000),answer:text(q.answer,20000),notes:text(q.notes,20000),links:linksFrom(q.links.map(s=>text(s,2048)).join('\n')),mastered:q.mastered,createdAt:date(q.createdAt),updatedAt:date(q.updatedAt),images:[]};
    if(seen.has(record.id))throw new Error('备份中存在重复的错题编号。');seen.add(record.id);
    for(const img of q.images){const blob=decode(img.data,5*MB);const checked=await imageFile(new File([blob],text(img.name,180),{type:blob.type}));record.images.push({...checked,id:id(img.id)});total+=blob.size;}
    if(!record.content.trim()&&!record.images.length)throw new Error('错题不能同时缺少文字和图片。');
    questions.push(record);
  }
  seen.clear();for(const m of data.materials){
    const name=text(m.name,180,true),blob=decode(m.data,50*MB),checked=await materialFile(new File([blob],name,{type:blob.type}));
    const record={id:id(m.id),title:text(m.title,120,true),subject:subject(m.subject),name,blob:checked,createdAt:date(m.createdAt),updatedAt:date(m.updatedAt)};
    if(seen.has(record.id))throw new Error('备份中存在重复的资料编号。');seen.add(record.id);materials.push(record);total+=blob.size;
  }
  if(total>140*MB)throw new Error('备份中的附件总量超过 140 MB。');
  return {questions,materials};
}
export async function importBackup(data) {
  const counts={added:0,updated:0,skipped:0};
  // One transaction covers all records; failures leave the existing notebook intact.
  await transaction(['questions','materials'],'readwrite',tx=>{
    for(const name of ['questions','materials'])for(const record of data[name]){
      const store=tx.objectStore(name),request=store.get(record.id);
      request.onsuccess=()=>{const old=request.result;if(!old){store.add(record);counts.added++;}else if(Date.parse(record.updatedAt)>Date.parse(old.updatedAt)){store.put(record);counts.updated++;}else counts.skipped++;};
    }
  });
  return counts;
}
