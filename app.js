const DB='mosaic_ipad_local_v1', STORE='photos', META='meta';
let db, sourceBlob=null, sourceName='', assignments=[], photos=[], busy=false, previewBusy=false, previewReady=false;
const PHOTO_PAGE_SIZE=100;let photoPage=0,selectedPhotoIds=new Set(),photoGridUrls=[];
const $=id=>document.getElementById(id);
function openDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{let d=r.result;d.createObjectStore(STORE,{keyPath:'id'});d.createObjectStore(META,{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function allPhotos(){return new Promise((res,rej)=>{let r=tx(STORE).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function putPhoto(p){return new Promise((res,rej)=>{let r=tx(STORE,'readwrite').put(p);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function putPhotos(items){return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite'),st=t.objectStore(STORE);for(const p of items)st.put(p);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('写真データの保存に失敗しました。'));});}
function clearStore(){return new Promise((res,rej)=>{let r=tx(STORE,'readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function deletePhoto(id){return new Promise((res,rej)=>{let r=tx(STORE,'readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function getPhoto(id){return new Promise((res,rej)=>{let r=tx(STORE).get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});}
function allPhotoIds(){return new Promise((res,rej)=>{let r=tx(STORE).getAllKeys();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function metaDelete(key){return new Promise((res,rej)=>{let r=tx(META,'readwrite').delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function metaPut(key,value){return new Promise((res,rej)=>{let r=tx(META,'readwrite').put({key,value});r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function metaGet(key){return new Promise(res=>{let r=tx(META).get(key);r.onsuccess=()=>res(r.result?.value);r.onerror=()=>res(null);});}
function showTab(name){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('hidden',x.id!==name));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));if(name==='photos'){renderPhotos();refreshStats();}if(name==='output')updateDims();if(name==='quality')initCropPreview();}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
async function refreshStats(){photos=await allPhotos();$('count').textContent=photos.length.toLocaleString();$('placed').textContent=assignments.length.toLocaleString();$('outputStatus').textContent=assignments.length?`${assignments.length.toLocaleString()}マスに配置済み`:'配置データがありません。';}
function blobURL(blob){return URL.createObjectURL(blob)}
async function renderPhotos(){
 photos=await allPhotos();photoGridUrls.forEach(URL.revokeObjectURL);photoGridUrls=[];
 const total=Math.max(1,Math.ceil(photos.length/PHOTO_PAGE_SIZE));photoPage=Math.min(photoPage,total-1);
 const sel=$('photoPage');if(sel){const old=String(photoPage);sel.innerHTML='';for(let i=0;i<total;i++){const from=i*PHOTO_PAGE_SIZE+1,to=Math.min(photos.length,(i+1)*PHOTO_PAGE_SIZE),o=document.createElement('option');o.value=i;o.textContent=`${i+1}ページ目（${from}〜${to}）`;sel.append(o);}sel.value=String(photoPage);}
 const from=photoPage*PHOTO_PAGE_SIZE,to=Math.min(photos.length,from+PHOTO_PAGE_SIZE),grid=$('photoGrid');grid.innerHTML='';
 for(const p of photos.slice(from,to)){
  const card=document.createElement('div');card.className='photo-card';const img=document.createElement('img');img.src=blobURL(p.thumb||p.blob);photoGridUrls.push(img.src);img.alt=p.name;img.title=p.name;
  const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selectedPhotoIds.has(p.id);check.onchange=()=>{if(check.checked)selectedPhotoIds.add(p.id);else selectedPhotoIds.delete(p.id);updatePhotoSelectionCount();};const name=document.createElement('span');name.textContent=p.name;name.title=p.name;label.append(check,name);card.append(img,label);grid.append(card);
 }
 $('photoPageInfo').textContent=`${photos.length?from+1:0}〜${to} / ${photos.length.toLocaleString()}枚`;
 $('importStatus').textContent=`登録：${photos.length.toLocaleString()}枚（${total}ページ・1ページ${PHOTO_PAGE_SIZE}枚）`;
 updatePhotoSelectionCount();
}
function updatePhotoSelectionCount(){const b=$('deleteSelectedPhotos');if(b)b.textContent=`選択した写真を削除（${selectedPhotoIds.size}）`;}
$('photoPage').onchange=async e=>{photoPage=+e.target.value||0;await renderPhotos();};
$('selectPhotoPage').onclick=async()=>{const from=photoPage*PHOTO_PAGE_SIZE,to=Math.min(photos.length,from+PHOTO_PAGE_SIZE);for(const p of photos.slice(from,to))selectedPhotoIds.add(p.id);await renderPhotos();};
$('clearPhotoSelection').onclick=async()=>{selectedPhotoIds.clear();await renderPhotos();};
$('deleteSelectedPhotos').onclick=async()=>{
 if(!selectedPhotoIds.size){alert('削除する写真を選択してください。');return;}
 const ids=[...selectedPhotoIds],assignedSet=new Set(assignments),assignedCount=ids.filter(id=>assignedSet.has(id)).length;
 const warning=assignedCount?`\n\nこの中に配置済み写真が${assignedCount}枚含まれています。削除すると現在の配置データとプレビューをリセットし、再配置が必要になります。`:'';
 if(!confirm(`選択した${ids.length}枚の写真を削除しますか？${warning}`))return;
 for(let i=0;i<ids.length;i++){await deletePhoto(ids[i]);if(i%50===0)await new Promise(r=>setTimeout(r,0));}
 if(assignedCount){assignments=[];previewReady=false;await metaPut('assignments',[]);await metaDelete('qualityReport');$('previewStatus').textContent='写真を削除したため配置データをリセットしました。再配置してください。';}
 ids.forEach(id=>selectedPhotoIds.delete(id));await renderPhotos();await refreshStats();
 $('importStatus').textContent=`${ids.length}枚を削除しました。${assignedCount?'配置データをリセットしました。':'既存の配置データは維持されています。'}`;
};
function setProgress(id,n){$(id).style.width=Math.max(0,Math.min(100,n))+'%'}
// Store only a resized JPEG derivative. Original image bytes are never written to IndexedDB.
const PHOTO_MAX_EDGE=1024,PHOTO_JPEG_QUALITY=.88,THUMB_MAX_EDGE=180;
function canvasToJpeg(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG画像を作成できませんでした。')),'image/jpeg',quality));}
async function optimizeImageBlob(input){
 let bmp;
 try{
  bmp=await createImageBitmap(input);
  const scale=Math.min(1,PHOTO_MAX_EDGE/Math.max(bmp.width,bmp.height));
  const width=Math.max(1,Math.round(bmp.width*scale)),height=Math.max(1,Math.round(bmp.height*scale));
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d',{alpha:false});if(!ctx)throw new Error('画像処理用Canvasを作成できません。');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(bmp,0,0,width,height);
  const blob=await canvasToJpeg(c,PHOTO_JPEG_QUALITY);
  const ts=Math.min(1,THUMB_MAX_EDGE/Math.max(bmp.width,bmp.height)),tw=Math.max(1,Math.round(bmp.width*ts)),th=Math.max(1,Math.round(bmp.height*ts));
  const tc=document.createElement('canvas');tc.width=tw;tc.height=th;const tctx=tc.getContext('2d',{alpha:false});
  tctx.fillStyle='#fff';tctx.fillRect(0,0,tw,th);tctx.drawImage(bmp,0,0,tw,th);
  const thumb=await canvasToJpeg(tc,.78);
  return {blob,thumb,width,height,sourceWidth:bmp.width,sourceHeight:bmp.height};
 }finally{if(bmp)bmp.close();}
}
async function addFiles(files){
 if(busy)return;busy=true;let good=0,skip=0,saved=0,original=0;let start=(await allPhotos()).length;
 try{
  for(let i=0;i<files.length;i++){
   const f=files[i];
   if(!f.type.startsWith('image/'))skip++;
   else try{
    const z=await optimizeImageBlob(f),id=crypto.randomUUID();
    await putPhoto({id,name:f.name,blob:z.blob,thumb:z.thumb,width:z.width,height:z.height,optimized:true,originalBytes:f.size,savedBytes:z.blob.size+z.thumb.size});
    good++;original+=f.size;saved+=z.blob.size+z.thumb.size;
   }catch(err){skip++;}
   setProgress('importProgress',(i+1)/Math.max(1,files.length)*100);
   $('importStatus').textContent=`最適化して取り込み中 ${i+1}/${files.length}｜成功 ${good}枚｜保存 ${(saved/1048576).toFixed(1)}MB`;
   if(i%4===0)await new Promise(r=>setTimeout(r,0));
  }
 }finally{busy=false;}
 await renderPhotos();await refreshStats();
 const rate=original?Math.max(0,100-(saved/original*100)):0;
 $('importStatus').textContent=`追加 ${good}枚／スキップ ${skip}枚｜保存 ${(saved/1048576).toFixed(1)}MB（元データ比 約${rate.toFixed(0)}%削減）｜合計 ${(start+good).toLocaleString()}枚`;
}

// One-time, resumable migration for full-resolution photos imported by v5/v6.1.
async function migrateExistingPhotos(){
 const migrationVersion=await metaGet('photoOptimizationVersion');if(migrationVersion>=2)return;
 const ids=await allPhotoIds();if(!ids.length){await metaPut('photoOptimizationVersion',2);return;}
 busy=true;let checked=0,done=0,failed=0,oldBytes=0,newBytes=0;$('count').textContent=ids.length.toLocaleString();
 try{
  $('importStatus').textContent=`既存写真を確認・最適化しています 0/${ids.length}枚。画面を閉じずにお待ちください。`;
  for(const id of ids){
   const p=await getPhoto(id);
   if(p&&(!p.optimized||!(p.blob instanceof Blob)||p.blob.type!=='image/jpeg'||Math.max(p.width||0,p.height||0)>PHOTO_MAX_EDGE)){
    try{
     oldBytes+=p.blob?.size||0;const z=await optimizeImageBlob(p.blob);
     await putPhoto({...p,blob:z.blob,thumb:z.thumb,width:z.width,height:z.height,optimized:true,originalBytes:p.originalBytes||p.blob?.size||0,savedBytes:z.blob.size+z.thumb.size});
     newBytes+=z.blob.size+z.thumb.size;done++;
    }catch(err){failed++;console.warn('写真の最適化をスキップ:',p.name,err);}
   }
   checked++;setProgress('importProgress',checked/ids.length*100);
   if(checked%5===0||checked===ids.length){$('importStatus').textContent=`既存写真を確認・最適化しています ${checked}/${ids.length}枚｜変換 ${done}枚｜保存 ${(newBytes/1048576).toFixed(1)}MB`;await new Promise(r=>setTimeout(r,0));}
  }
 }finally{busy=false;}
 if(failed===0)await metaPut('photoOptimizationVersion',2);
 if(failed){$('importStatus').textContent=`既存写真の最適化：${done}枚変換／${failed}枚失敗。失敗分は元データのまま残し、次回起動時に再試行します。`;}
 else if(done){const rate=oldBytes?Math.max(0,100-newBytes/oldBytes*100):0;$('importStatus').textContent=`既存写真の最適化が完了しました：${done}枚｜保存 ${(newBytes/1048576).toFixed(1)}MB（元データ比 約${rate.toFixed(0)}%削減）`;}
 else $('importStatus').textContent='登録済み写真はすべて最適化済みです。';
}

$('filesInput').onchange=e=>addFiles([...e.target.files]);
async function readZipEntries(buf){const dv=new DataView(buf),u8=new Uint8Array(buf);let eocd=-1;for(let i=u8.length-22;i>=Math.max(0,u8.length-65558);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}}if(eocd<0)throw Error('ZIPの形式を読み取れません');let count=dv.getUint16(eocd+10,true),off=dv.getUint32(eocd+16,true),out=[];for(let n=0;n<count;n++){if(dv.getUint32(off,true)!==0x02014b50)break;let method=dv.getUint16(off+10,true),cs=dv.getUint32(off+20,true),nl=dv.getUint16(off+28,true),el=dv.getUint16(off+30,true),cl=dv.getUint16(off+32,true),lo=dv.getUint32(off+42,true);let name=new TextDecoder().decode(u8.slice(off+46,off+46+nl));if(!name.endsWith('/')){let lnl=dv.getUint16(lo+26,true),lel=dv.getUint16(lo+28,true),dataStart=lo+30+lnl+lel,comp=u8.slice(dataStart,dataStart+cs);let data;if(method===0)data=comp;else if(method===8){if(!('DecompressionStream'in window))throw Error('このSafariではZIP展開に対応していません。ファイルから画像を選択してください。');let ds=new DecompressionStream('deflate-raw');data=new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer());}else{data=null;}if(data)out.push(new File([data],name.split('/').pop(),{type:mime(name)}));}off+=46+nl+el+cl;}return out;}
function mime(n){let e=n.toLowerCase().split('.').pop();return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',avif:'image/avif'})[e]||'application/octet-stream';}
$('zipInput').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{$('importStatus').textContent='ZIPを展開しています…';let files=await readZipEntries(await f.arrayBuffer());await addFiles(files);}catch(err){alert(err.message||String(err));}e.target.value='';};
$('clearPhotos').onclick=async()=>{if(confirm('登録した写真をすべて削除しますか？配置データも消去されます。')){await clearStore();selectedPhotoIds.clear();photoPage=0;assignments=[];previewReady=false;await metaPut('assignments',[]);await metaDelete('qualityReport');await renderPhotos();await refreshStats();}};
$('sourceInput').onchange=async e=>{let f=e.target.files[0];if(!f)return;sourceBlob=f;sourceName=f.name;$('sourceStatus').textContent=`原画：${f.name}`;let bmp=await createImageBitmap(f);let c=$('preview'),ctx=c.getContext('2d');let scale=Math.min(c.width/bmp.width,c.height/bmp.height);let w=bmp.width*scale,h=bmp.height*scale;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bmp,(c.width-w)/2,(c.height-h)/2,w,h);bmp.close();await metaPut('source',{blob:f,name:f.name});};
async function getSource(){if(sourceBlob)return sourceBlob;let x=await metaGet('source');if(x){sourceBlob=x.blob;sourceName=x.name;return sourceBlob;}return null;}
function rgbToLab(rgb){
 const [r0,g0,b0]=rgb.map(v=>{v=v/255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)});
 const x=(0.4124564*r0+0.3575761*g0+0.1804375*b0)/0.95047;
 const y=(0.2126729*r0+0.7151522*g0+0.0721750*b0);
 const z=(0.0193339*r0+0.1191920*g0+0.9503041*b0)/1.08883;
 const f=t=>t>Math.pow(6/29,3)?Math.cbrt(t):t/(3*Math.pow(6/29,2))+4/29;
 const fx=f(x),fy=f(y),fz=f(z);return [116*fy-16,500*(fx-fy),200*(fy-fz)];
}
function tileCropRect(w,h,aspect){let a=w/h;if(a>aspect){let nw=h*aspect;return [(w-nw)/2,0,nw,h];}let nh=w/aspect;return [0,(h-nh)/2,w,nh];}
const PHOTO_FEATURE_VERSION=3;
async function imageFeatures(blob,aspect){
 const bmp=await createImageBitmap(blob);
 try{
  const [sx,sy,sw,sh]=tileCropRect(bmp.width,bmp.height,aspect);
  const c=document.createElement('canvas');c.width=8;c.height=8;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bmp,sx,sy,sw,sh,0,0,8,8);
  const d=ctx.getImageData(0,0,8,8).data;let r=0,g=0,b=0,lum=0,lum2=0;const cells=[];
  for(let cy=0;cy<4;cy++)for(let cx=0;cx<4;cx++){
   let cr=0,cg=0,cb=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const k=(((cy*2+yy)*8)+(cx*2+xx))*4;cr+=d[k];cg+=d[k+1];cb+=d[k+2];}
   cells.push(rgbToLab([cr/4,cg/4,cb/4]));
  }
  for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];const l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];lum+=l;lum2+=l*l;}
  const n=64,mean=lum/n;
  return {lab:rgbToLab([r/n,g/n,b/n]),std:Math.sqrt(Math.max(0,lum2/n-mean*mean)),cells};
 }finally{bmp.close();}
}
async function getPhotoFeature(p,aspect){
 if(p.featureVersion===PHOTO_FEATURE_VERSION&&Math.abs((p.featureAspect||0)-aspect)<1e-6&&p.feature)return p.feature;
 const feature=await imageFeatures(p.blob,aspect);
 p.feature=feature;p.featureVersion=PHOTO_FEATURE_VERSION;p.featureAspect=aspect;
 return feature;
}

function yieldUI(){return new Promise(r=>setTimeout(r,0));}
$('makeMosaic').onclick=async()=>{
 if(busy)return;let src=await getSource();photos=await allPhotos();
 let cols=+$('cols').value,rows=+$('rows').value,N=cols*rows;
 let tileW=+$('tileW').value||38.1,tileH=+$('tileH').value||26.7,aspect=tileW/tileH;
 if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1||cols>120||rows>120){alert('列数・行数は1～120の整数で指定してください。');return;}
 if(!(tileW>0&&tileH>0)){alert('タイル寸法は0より大きい数値にしてください。');return;}
 if(!src){alert('先に元画像を選択してください');return;}
 if(photos.length<N){alert(`写真が不足しています。${N}枚必要ですが、現在${photos.length}枚です。`);return;}
 busy=true;$('makeMosaic').disabled=true;$('makeStatus').textContent='原画をタイル単位で解析しています…';setProgress('makeProgress',0);
 try{
  const source=await createImageBitmap(src),physicalRatio=(cols*tileW)/(rows*tileH),crop=tileCropRect(source.width,source.height,physicalRatio);
  const tc=document.createElement('canvas');tc.width=cols*8;tc.height=rows*8;
  const tctx=tc.getContext('2d',{willReadFrequently:true});
  tctx.drawImage(source,crop[0],crop[1],crop[2],crop[3],0,0,tc.width,tc.height);source.close();
  const td=tctx.getImageData(0,0,tc.width,tc.height).data;
  const targetLab=new Array(N),targetStd=new Float32Array(N),targetCells=new Array(N),lum=new Float32Array(N);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
   let sr=0,sg=0,sb=0,sl=0,sl2=0;
   for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){
    const k=(((r*8+yy)*tc.width)+(c*8+xx))*4,R=td[k],G=td[k+1],B=td[k+2],L=.2126*R+.7152*G+.0722*B;
    sr+=R;sg+=G;sb+=B;sl+=L;sl2+=L*L;
   }
   const i=r*cols+c,m=sl/64;targetLab[i]=rgbToLab([sr/64,sg/64,sb/64]);targetStd[i]=Math.sqrt(Math.max(0,sl2/64-m*m));lum[i]=m;
   const sub=[];for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){let ar=0,ag=0,ab=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const k=(((r*8+sy*2+dy)*tc.width)+(c*8+sx*2+dx))*4;ar+=td[k];ag+=td[k+1];ab+=td[k+2];}sub.push(rgbToLab([ar/4,ag/4,ab/4]));}targetCells[i]=sub;
  }
  let maxEdge=1;const edgeStrength=new Float32Array(N);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
   const i=r*cols+c,gx=((c<cols-1?lum[i+1]:lum[i])-(c>0?lum[i-1]:lum[i]))*.5,gy=((r<rows-1?lum[i+cols]:lum[i])-(r>0?lum[i-cols]:lum[i]))*.5;
   edgeStrength[i]=Math.hypot(gx,gy);if(edgeStrength[i]>maxEdge)maxEdge=edgeStrength[i];
  }
  const sortedEdges=Array.from(edgeStrength).sort((a,b)=>a-b),scale=Math.max(1,sortedEdges[Math.floor(.9*(N-1))]||1);
  for(let i=0;i<N;i++)edgeStrength[i]=Math.min(1,edgeStrength[i]/scale);
  const photoFeat=new Array(photos.length),featureUpdates=[];
  for(let i=0;i<photos.length;i++){
   const cached=photos[i].featureVersion===PHOTO_FEATURE_VERSION&&Math.abs((photos[i].featureAspect||0)-aspect)<1e-6&&!!photos[i].feature;
   const f=await getPhotoFeature(photos[i],aspect);photoFeat[i]=f;
   if(!cached)featureUpdates.push(photos[i]);
   if(featureUpdates.length>=50){await putPhotos(featureUpdates.splice(0));}
   if(i%20===0){setProgress('makeProgress',i/photos.length*20);$('makeStatus').textContent=`写真の特徴を解析・保存中 ${i+1}/${photos.length}`;await yieldUI();}
  }
  if(featureUpdates.length)await putPhotos(featureUpdates);
  const unary=(cell,ph)=>{
   const t=targetLab[cell],ew=1.3+.85*edgeStrength[cell],dl=(t[0]-ph.lab[0])*ew,da=(t[1]-ph.lab[1])*.68,db=(t[2]-ph.lab[2])*.68,ds=targetStd[cell]-ph.std;
   let spatial=0;const a=targetCells[cell],b=ph.cells||[];for(let k=0;k<Math.min(a.length,b.length);k++){const x=a[k][0]-b[k][0],y=(a[k][1]-b[k][1])*.55,z=(a[k][2]-b[k][2])*.55;spatial+=x*x+y*y+z*z;}spatial/=Math.max(1,Math.min(a.length,b.length));
   return dl*dl+da*da+db*db+ds*ds*.035+spatial*.42;
  };
  // Scarcity-aware initialization: reserve distinctive photos for cells that have few close alternatives.
  const priority=new Array(N);
  for(let i=0;i<N;i++){
   let best=Infinity,second=Infinity;
   for(let j=0;j<photos.length;j++){const cost=unary(i,photoFeat[j]);if(cost<best){second=best;best=cost;}else if(cost<second)second=cost;}
   priority[i]={i,regret:second-best};
   if(i%30===0){setProgress('makeProgress',20+i/N*15);$('makeStatus').textContent=`配置候補の希少度を分析中 ${i+1}/${N}`;await yieldUI();}
  }
  priority.sort((a,b)=>b.regret-a.regret||a.i-b.i);
  const used=new Uint8Array(photos.length),result=new Int32Array(N);
  for(let n=0;n<N;n++){
   const i=priority[n].i;let best=-1,bd=Infinity;
   for(let j=0;j<photos.length;j++){if(used[j])continue;const cost=unary(i,photoFeat[j]);if(cost<bd){bd=cost;best=j;}}
   if(best<0)throw Error('写真の割り当てに失敗しました。');
   result[i]=best;used[best]=1;
   if(n%12===0){setProgress('makeProgress',35+n/N*30);$('makeStatus').textContent=`写真を重複なしで割り当て中 ${n+1}/${N}`;await yieldUI();}
  }
  // Refine local and global swaps against both tile fit and neighboring color transitions.
  const neighbors=Array.from({length:N},(_,i)=>{let a=[],r=Math.floor(i/cols),c=i%cols;if(c>0)a.push(i-1);if(c+1<cols)a.push(i+1);if(r>0)a.push(i-cols);if(r+1<rows)a.push(i+cols);return a;});
  const photoTrans=photoFeat.map(x=>[x.lab[0],x.lab[1]*.38,x.lab[2]*.38]);
  const edgeCost=(a,b)=>{const d0=targetLab[a][0]-targetLab[b][0],d1=(targetLab[a][1]-targetLab[b][1])*.38,d2=(targetLab[a][2]-targetLab[b][2])*.38,strength=Math.hypot(d0,d1,d2),w=.30+.70*Math.min(strength/24,1),pa=photoTrans[result[a]],pb=photoTrans[result[b]],x=d0-(pa[0]-pb[0]),y=d1-(pa[1]-pb[1]),z=d2-(pa[2]-pb[2]);return (x*x+y*y+z*z)*w;};
  const attempts=Math.min(30000,Math.max(9000,N*10));let seed=20261105;
  const rand=max=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%max;};
  for(let step=0;step<attempts;step++){
   const a=rand(N);let b;if(step%3!==0){const ns=neighbors[a];b=ns[rand(ns.length)];}else{b=rand(N-1);if(b>=a)b++;}
   const pa=result[a],pb=result[b],fa=photoFeat[pa],fb=photoFeat[pb];
   let delta=unary(a,fb)+unary(b,fa)-unary(a,fa)-unary(b,fb);
   const affected=new Set([...neighbors[a],...neighbors[b]]);affected.add(a);affected.add(b);let before=0,after=0;
   for(const x of affected)for(const y of neighbors[x])if(x<y&&(x===a||x===b||y===a||y===b)){
    before+=edgeCost(x,y);const ix=x===a?pb:x===b?pa:result[x],iy=y===a?pb:y===b?pa:result[y],p1=photoTrans[ix],p2=photoTrans[iy];
    const d0=targetLab[x][0]-targetLab[y][0],d1=(targetLab[x][1]-targetLab[y][1])*.38,d2=(targetLab[x][2]-targetLab[y][2])*.38,strength=Math.hypot(d0,d1,d2),w=.30+.70*Math.min(strength/24,1),xx=d0-(p1[0]-p2[0]),yy=d1-(p1[1]-p2[1]),zz=d2-(p1[2]-p2[2]);after+=(xx*xx+yy*yy+zz*zz)*w;
   }
   if(delta+.20*(after-before)<-1e-6){result[a]=pb;result[b]=pa;}
   if(step%1000===0){setProgress('makeProgress',65+step/attempts*35);$('makeStatus').textContent=`隣接関係と全体配置を調整中 ${step.toLocaleString()}/${attempts.toLocaleString()}`;await yieldUI();}
  }
  assignments=Array.from(result,i=>photos[i].id);previewReady=false;$('previewStatus').textContent='配置が更新されました。プレビューを作り直してください。';
  await metaPut('assignments',assignments);await metaPut('grid',{cols,rows,tileW,tileH,physicalRatio});$('makeStatus').textContent=`完了：${N.toLocaleString()}マスに重複なしで配置しました。Lab色差・明暗特徴（同一8×8基準）・輪郭・隣接関係を考慮しています。`;setProgress('makeProgress',100);await refreshStats();
 }catch(e){alert('配置中にエラーが発生しました：'+(e.message||String(e)));$('makeStatus').textContent='配置に失敗しました。';}
 busy=false;$('makeMosaic').disabled=false;
};

async function renderMosaicPreview(){
 if(previewBusy||busy){$('previewStatus').textContent='ほかの処理が終わってからプレビューを作成してください。';return;}
 if(!assignments.length){alert('先に写真を自動配置してください。');return;}
 previewBusy=true;previewReady=false;const btn=$('renderPreview');btn.disabled=true;
 try{
  photos=await allPhotos();const byId=new Map(photos.map(p=>[p.id,p]));const grid=await metaGet('grid')||{cols:60,rows:50};
  const cols=grid.cols||60,rows=grid.rows||50,N=cols*rows,tile=Math.max(4,Math.min(32,Number($('previewTileSize').value)||16)),tileH=tile*((grid.tileH||26.7)/(grid.tileW||38.1));
  const canvas=$('mosaicPreview'),ctx=canvas.getContext('2d');canvas.width=cols*tile;canvas.height=Math.max(1,Math.round(rows*tileH));ctx.fillStyle='#e2e8f0';ctx.fillRect(0,0,canvas.width,canvas.height);
  $('previewCount').textContent=`${assignments.length.toLocaleString()} / ${N.toLocaleString()} マス`;setProgress('previewProgress',0);let missing=0;
  for(let i=0;i<assignments.length;i++){
   const photo=byId.get(assignments[i]);if(!photo){missing++;continue;}let bmp=null;
   try{bmp=await createImageBitmap(photo.thumb||photo.blob);const [cx,cy,cw,ch]=tileCropRect(bmp.width,bmp.height,(grid.tileW||38.1)/(grid.tileH||26.7));ctx.drawImage(bmp,cx,cy,cw,ch,(i%cols)*tile,Math.floor(i/cols)*tileH,tile,tileH);}catch(e){missing++;}finally{if(bmp)bmp.close();}
   if(i%30===0){setProgress('previewProgress',(i+1)/assignments.length*100);$('previewStatus').textContent=`プレビュー作成中 ${i+1} / ${assignments.length} 枚`;await new Promise(r=>setTimeout(r,0));}
  }
  setProgress('previewProgress',100);previewReady=true;$('previewStatus').textContent=missing?`表示完了。ただし ${missing} 枚の画像を読み込めませんでした。`:`表示完了：${assignments.length.toLocaleString()}枚を配置順に表示しています。`;
 }catch(e){$('previewStatus').textContent='プレビューを作成できませんでした：'+(e.message||String(e));alert('プレビュー作成中にエラーが発生しました：'+(e.message||String(e)));}
 finally{previewBusy=false;btn.disabled=false;}
}

$('renderPreview').onclick=renderMosaicPreview;
$('previewTileSize').onchange=()=>{if(previewReady)renderMosaicPreview();};
$('savePreview').onclick=()=>{if(!previewReady){alert('先にプレビューを作成してください。');return;}$('mosaicPreview').toBlob(blob=>{if(blob)download(blob,'photo_mosaic_preview.png');else alert('PNG画像を作成できませんでした。');},'image/png');};

function updateDims(){let cols=+$('cols').value||60,rows=+$('rows').value||50,w=+$('tileW').value||38.1,h=+$('tileH').value||26.7,g=+$('gap').value||0,m=+$('margin').value||0;let W=cols*w+(cols-1)*g+2*m,H=rows*h+(rows-1)*g+2*m;$('dimensionText').textContent=`完成寸法（外周余白込み）：横 ${W.toFixed(1)}mm × 縦 ${H.toFixed(1)}mm`;}

function updateTileScaleDisplay(){const pct=Number($('tileScale').value),w=127*pct/100,h=89*pct/100;$('tileW').value=w.toFixed(2);$('tileH').value=h.toFixed(2);$('tileSizeText').textContent=`${pct}%：${w.toFixed(2)} × ${h.toFixed(2)} mm`;$('printSizeInfo').textContent=`${pct}%（${w.toFixed(2)} × ${h.toFixed(2)} mm）`;}
$('tileScale').addEventListener('change',async()=>{
 const pct=Number($('tileScale').value);if(!Number.isFinite(pct)||pct<5||pct>100){alert('L判比率は5〜100%で指定してください。');$('tileScale').value='30';}
 updateTileScaleDisplay();
 const g=await metaGet('grid');if(g){g.tileW=Number($('tileW').value);g.tileH=Number($('tileH').value);g.physicalRatio=g.tileW/g.tileH;await metaPut('grid',g);}
 updateDims();updatePrintSheetInfo();if(previewReady)await renderMosaicPreview();
});

$('updateDims').onclick=updateDims;
async function exportCsv(){photos=await allPhotos();let map=new Map(photos.map(p=>[p.id,p.name]));let grid=await metaGet('grid')||{cols:60,rows:50};let lines=['番号,行,列,写真ファイル名,写真ID'];assignments.forEach((id,i)=>lines.push(`${i+1},${Math.floor(i/grid.cols)+1},${i%grid.cols+1},\"${(map.get(id)||'').replaceAll('\"','\"\"')}\",${id}`));download(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),'photo_assignment.csv');}
function download(blob,name){let a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}
$('exportCsv').onclick=exportCsv;
$('exportProject').onclick=async()=>{photos=await allPhotos();let src=await metaGet('source'),grid=await metaGet('grid');let data={app:'フォトモザイク制作室',version:1,grid,assignments,sourceName:src?.name||'',createdAt:new Date().toISOString(),photoNames:photos.map(p=>({id:p.id,name:p.name}))};download(new Blob([JSON.stringify(data)],{type:'application/json'}),'mosaic_project_backup.json');alert('配置情報のバックアップを書き出しました。写真本体は含まれません。写真フォルダも別途保管してください。');};
$('projectInput').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let d=JSON.parse(await f.text());if(!Array.isArray(d.assignments))throw Error('配置情報がありません');assignments=d.assignments;await metaPut('assignments',assignments);if(d.grid)await metaPut('grid',d.grid);alert('配置情報を復元しました。対応する写真が端末に登録されている必要があります。');await refreshStats();}catch(err){alert('復元できません：'+err.message);}e.target.value='';};
$('printMap').onclick=async()=>{
 if(!assignments.length){alert('先に配置を作成してください');return;}
 const grid=await metaGet('grid')||{cols:60,rows:50},cols=grid.cols||60,rows=grid.rows||50;
 const win=window.open('','_blank');if(!win){alert('ポップアップを許可してください');return;}
 // 15×20 cells per A3 landscape sheet: 4 pages across × 3 pages down for 60×50.
 const blockCols=15,blockRows=20,pagesX=Math.ceil(cols/blockCols),pagesY=Math.ceil(rows/blockRows);
 let html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>写真番号付き配置図</title><style>@page{size:A3 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:sans-serif;margin:0;color:#111}.mapPage{width:100%;height:277mm;page-break-after:always;break-after:page;overflow:hidden}.mapPage:last-child{page-break-after:auto;break-after:auto}h1{font-size:14pt;margin:0 0 3mm}.sub{font-size:9pt;margin-bottom:3mm}.grid{display:grid;grid-template-columns:repeat(${blockCols},1fr);grid-auto-rows:10.5mm;gap:.7mm}.cell{border:.25mm solid #777;display:flex;flex-direction:column;justify-content:center;align-items:center;overflow:hidden}.cell b{font-size:10pt}.cell small{font-size:7pt;color:#444}@media screen{body{background:#ddd}.mapPage{background:white;width:420mm;margin:12px auto;padding:8mm;box-shadow:0 1px 8px #999}}</style></head><body>`;
 for(let by=0;by<pagesY;by++)for(let bx=0;bx<pagesX;bx++){
  html+=`<section class="mapPage"><h1>フォトモザイク配置図｜${cols}列 × ${rows}行</h1><div class="sub">区画 ${by+1}-${bx+1}／横方向 ${bx*blockCols+1}〜${Math.min(cols,(bx+1)*blockCols)}列・縦方向 ${by*blockRows+1}〜${Math.min(rows,(by+1)*blockRows)}行｜写真シートの通し番号と照合</div><div class="grid">`;
  for(let r=by*blockRows;r<Math.min(rows,(by+1)*blockRows);r++)for(let c=bx*blockCols;c<Math.min(cols,(bx+1)*blockCols);c++){const i=r*cols+c;if(i<assignments.length)html+=`<div class="cell"><b>${i+1}</b><small>${r+1}行・${c+1}列</small></div>`;else html+='<div class="cell"></div>';}
  html+='</div></section>';
 }
 html+=`<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`;
 win.document.open();win.document.write(html);win.document.close();
};


// v8: multi-axis quality diagnostics. Scores are heuristic, not a perceptual certification.
async function runQualityCheck(){
 if(busy||previewBusy){alert('ほかの処理が終わってから実行してください。');return;}
 if(!assignments.length){alert('先にモザイクを作成してください。');return;}
 const src=await getSource();if(!src){alert('原画が見つかりません。原画を再選択してください。');return;}
 const btn=$('runQuality');btn.disabled=true;busy=true;$('qualityResult').textContent='原画と配置写真を比較しています…';$('qualityMetrics').classList.add('hidden');$('qualityAdvice').textContent='';
 try{
  const grid=await metaGet('grid')||{cols:60,rows:50,tileW:38.1,tileH:26.7},cols=grid.cols||60,rows=grid.rows||50,N=cols*rows;
  if(assignments.length!==N)throw Error(`配置数が不足しています（${assignments.length}/${N}）。`);
  photos=await allPhotos();const byId=new Map(photos.map(p=>[p.id,p]));const missing=assignments.filter(id=>!byId.has(id)).length;if(missing)throw Error(`${missing}枚の写真データが見つかりません。写真を再登録してください。`);
  const aspect=(grid.tileW||38.1)/(grid.tileH||26.7),physicalRatio=(cols*(grid.tileW||38.1))/(rows*(grid.tileH||26.7));
  const source=await createImageBitmap(src),crop=tileCropRect(source.width,source.height,physicalRatio),c=document.createElement('canvas');c.width=cols*8;c.height=rows*8;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,crop[0],crop[1],crop[2],crop[3],0,0,c.width,c.height);source.close();
  const data=ctx.getImageData(0,0,c.width,c.height).data;let sumDelta=0,sumSpatial=0,sumDetail=0,sumTargetDetail=0,sumPhotoDetail=0,done=0;const featureUpdates=[],placedFeatures=new Array(N),targetMeans=new Array(N);
  for(let i=0;i<N;i++){
   const r=Math.floor(i/cols),col=i%cols;let sr=0,sg=0,sb=0,sl=0,sl2=0;const targetCells=[];
   for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){const k=(((r*8+yy)*c.width)+(col*8+xx))*4,R=data[k],G=data[k+1],B=data[k+2],L=.2126*R+.7152*G+.0722*B;sr+=R;sg+=G;sb+=B;sl+=L;sl2+=L*L;}
   for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){let ar=0,ag=0,ab=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const k=(((r*8+sy*2+dy)*c.width)+(col*8+sx*2+dx))*4;ar+=data[k];ag+=data[k+1];ab+=data[k+2];}targetCells.push(rgbToLab([ar/4,ag/4,ab/4]));}
   const meanL=sl/64,targetLab=rgbToLab([sr/64,sg/64,sb/64]),targetStd=Math.sqrt(Math.max(0,sl2/64-meanL*meanL)),p=byId.get(assignments[i]),cached=p.featureVersion===PHOTO_FEATURE_VERSION&&Math.abs((p.featureAspect||0)-aspect)<1e-6&&!!p.feature,feat=await getPhotoFeature(p,aspect),dL=targetLab[0]-feat.lab[0],da=targetLab[1]-feat.lab[1],dbb=targetLab[2]-feat.lab[2];
   if(!cached)featureUpdates.push(p);if(featureUpdates.length>=50)await putPhotos(featureUpdates.splice(0));
   let spatial=0;for(let k=0;k<16;k++){const a=targetCells[k],b=feat.cells[k],x=a[0]-b[0],y=(a[1]-b[1])*.55,z=(a[2]-b[2])*.55;spatial+=Math.sqrt(x*x+y*y+z*z);}spatial/=16;
   sumDelta+=Math.sqrt(dL*dL+da*da+dbb*dbb);sumSpatial+=spatial;sumDetail+=Math.abs(targetStd-feat.std);sumTargetDetail+=targetStd;sumPhotoDetail+=feat.std;placedFeatures[i]=feat;targetMeans[i]=[targetLab[0],targetLab[1]*.38,targetLab[2]*.38];done++;
   if(i%24===0){$('qualityResult').textContent=`比較中 ${i+1}/${N} 枚`;await yieldUI();}
  }
  if(featureUpdates.length)await putPhotos(featureUpdates);
  // Evaluate whether adjacent tiles preserve the direction and magnitude of the original image's color transitions.
  let edgeError=0,edgeCount=0;
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){
   const i=r*cols+col;for(const j of [col+1<cols?i+1:-1,r+1<rows?i+cols:-1])if(j>=0){const ta=targetMeans[i],tb=targetMeans[j],pa=placedFeatures[i].lab,pb=placedFeatures[j].lab;const tx=ta[0]-tb[0],ty=ta[1]-tb[1],tz=ta[2]-tb[2],px=(pa[0]-pb[0]),py=(pa[1]-pb[1])*.38,pz=(pa[2]-pb[2])*.38;edgeError+=Math.hypot(tx-px,ty-py,tz-pz);edgeCount++;}}
  const avgDelta=sumDelta/done,avgSpatial=sumSpatial/done,avgDetail=sumDetail/done,avgEdge=edgeError/Math.max(1,edgeCount),meanTarget=sumTargetDetail/done,meanPhoto=sumPhotoDetail/done;
  const score=Math.max(0,Math.min(100,100-avgDelta*.85-avgSpatial*.48-avgDetail*.20-avgEdge*.16));let grade,advice;
  if(avgDelta<13&&avgSpatial<17&&avgDetail<24&&avgEdge<15){grade='良好';advice='色・タイル内の色分布・隣接部分のつながりを比較的よく再現できています。全体プレビューを少し離れて見て、校舎の輪郭や桜の形も確認してください。';}
  else if(avgDelta<21&&avgSpatial<27&&avgDetail<38&&avgEdge<25){grade='標準';advice='全体像は再現できていますが、色やタイル内の分布、隣接部分に差が残っています。原画の重要部分が読み取れるか確認してください。';}
  else{grade='改善の余地あり';advice='色・局所的な色分布・隣接部分のいずれかに比較的大きな差があります。未使用写真がある場合は、写真の種類を増やして再配置すると改善する可能性があります。';}
  if(photos.length>done&&grade!=='良好')advice+=' 現在の未使用写真も含め、追加写真を登録した後に再配置して比較するのがおすすめです。';
  $('qualityResult').innerHTML=`<div class="quality-grade">${grade}</div><div>総合評価の目安：<b>${score.toFixed(1)} / 100</b></div><div class="small">平均色差 ΔE76：${avgDelta.toFixed(1)}｜4×4色分布差：${avgSpatial.toFixed(1)}｜明暗差：${avgDetail.toFixed(1)}｜隣接色変化差：${avgEdge.toFixed(1)}</div>`;
  $('qDelta').textContent=avgDelta.toFixed(1);$('qSpatial').textContent=avgSpatial.toFixed(1);$('qDetail').textContent=avgDetail.toFixed(1);$('qEdge').textContent=avgEdge.toFixed(1);$('qScore').textContent=score.toFixed(1)+' / 100';$('qualityMetrics').classList.remove('hidden');$('qualityAdvice').textContent=advice+`（原画側の明暗ばらつき平均 ${meanTarget.toFixed(1)}／写真側 ${meanPhoto.toFixed(1)}）`;
  await metaPut('qualityReport',{avgDelta,avgSpatial,avgDetail,avgEdge,score,grade,createdAt:new Date().toISOString(),photoCount:photos.length,placedCount:done});
 }catch(e){$('qualityResult').textContent='評価できませんでした：'+(e.message||String(e));}finally{busy=false;btn.disabled=false;}
}
$('runQuality').onclick=runQualityCheck;

(async()=>{try{db=await openDB();let s=await metaGet('source');if(s){sourceBlob=s.blob;sourceName=s.name;$('sourceStatus').textContent=`原画：${s.name}`;}assignments=await metaGet('assignments')||[];let g=await metaGet('grid');if(g){$('cols').value=g.cols;$('rows').value=g.rows;if(g.tileW)$('tileScale').value=String(Math.round(g.tileW/127*100));}updateTileScaleDisplay();updateDims();await migrateExistingPhotos();await refreshStats();await renderPhotos();}catch(e){console.error(e);alert('ローカル保存または写真の最適化を開始できません。Safariの通常モードで開き、空き容量を確認してください。');}})();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));


// v11: zero-gap tile printing, full-perimeter crop marks, and page/photo reprints.
function getPrintLayout(){
 const paper=$('printPaper').value,w=Number($('tileW').value),h=Number($('tileH').value),margin=Number($('printMargin').value);
 const gap=0,markLen=3,headerH=10;
 if(![w,h,margin].every(Number.isFinite)||w<=0||h<=0||margin<0)throw Error('写真寸法は正の数、ページ余白は0以上で指定してください。');
 const pageW=paper==='A3'?297:210,pageH=paper==='A3'?420:297,contentW=pageW-2*margin,contentH=pageH-2*margin;
 const cols=Math.floor((contentW-2*markLen)/w),rows=Math.floor((contentH-headerH-2*markLen)/h);
 if(cols<1||rows<1)throw Error('この写真サイズでは用紙に配置できません。L判比率を小さくするか、ページ余白を調整してください。');
 const gridW=cols*w,gridH=rows*h,gridX=(contentW-gridW)/2,gridY=headerH+markLen;
 return {paper,w,h,gap,margin,cols,rows,perPage:cols*rows,pageW,pageH,contentW,contentH,gridW,gridH,gridX,gridY,markLen,headerH};
}
function updatePrintSheetInfo(){
 try{const x=getPrintLayout(),n=assignments.length,pages=Math.ceil(n/x.perPage),batch=+$('printBatchSize').value||5,start=+$('printStartPage').value||1,end=Math.min(pages,start+batch-1),photoMode=$('printTargetMode')?.value==='photos';
  $('printSheetInfo').textContent=photoMode?`写真番号を指定して個別再印刷します。例：12,18,25-28。現在 ${n.toLocaleString()}枚。写真間隔0mm・境界線なし・外周全辺トンボあり。`:`${x.paper}縦／${x.cols}列 × ${x.rows}行＝1用紙${x.perPage}枚。全${pages.toLocaleString()}用紙。写真間隔0mm・境界線なし・外周全辺トンボあり。今回：${start}〜${Math.max(start,end)}用紙（最大${batch}用紙）。`;
  $('printStartPage').max=Math.max(1,pages);$('printPhotoNumbersWrap').classList.toggle('hidden',!photoMode);$('printStartPageWrap').classList.toggle('hidden',photoMode);$('printBatchSizeWrap').classList.toggle('hidden',photoMode);
 }catch(e){$('printSheetInfo').textContent=e.message;}
}
['printPaper','printMargin','printBatchSize','printStartPage','printOutputMode','printDuplexEdge','printBackLabel','printTargetMode'].forEach(id=>$(id)?.addEventListener('change',updatePrintSheetInfo));
function parsePhotoNumberList(raw,total){
 const out=[],seen=new Set();for(const token of String(raw||'').split(/[、,，\s]+/).filter(Boolean)){
  const m=token.match(/^(\d+)(?:-(\d+))?$/);if(!m)throw Error(`写真番号「${token}」の形式が正しくありません。例：12,18,25-28`);
  const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<a||b>total)throw Error(`写真番号は1〜${total}の範囲で指定してください。`);
  for(let n=a;n<=b;n++)if(!seen.has(n)){seen.add(n);out.push(n-1);}
 }
 if(!out.length)throw Error('再印刷する写真番号を入力してください。');return out;
}
$('printPhotoSheets').onclick=async()=>{
 if(busy||previewBusy){alert('ほかの処理が終わってから実行してください。');return;}
 if(!assignments.length){alert('先に写真を自動配置してください。');return;}
 let layout;try{layout=getPrintLayout();}catch(e){alert(e.message);return;}
 const photoMode=$('printTargetMode')?.value==='photos',mode=$('printOutputMode')?.value||'paired',edge=$('printDuplexEdge')?.value||'long',labelMode=$('printBackLabel')?.value||'both';
 const batch=+$('printBatchSize').value||5,startPage=+$('printStartPage').value||1;let pageItems=[],totalPages=0,endPage=0;
 try{
  if(photoMode){const ids=parsePhotoNumberList($('printPhotoNumbers').value,assignments.length);pageItems=ids.map(i=>[i]);totalPages=pageItems.length;endPage=totalPages;}
  else{totalPages=Math.ceil(assignments.length/layout.perPage);if(!Number.isInteger(startPage)||startPage<1||startPage>totalPages)throw Error(`開始ページは1〜${totalPages}の範囲で指定してください。`);endPage=Math.min(totalPages,startPage+batch-1);for(let pg=startPage-1;pg<endPage;pg++){const from=pg*layout.perPage;pageItems.push(Array.from({length:Math.min(layout.perPage,assignments.length-from)},(_,k)=>from+k));}}
 }catch(e){alert(e.message);return;}
 if(photoMode){layout={...layout,cols:1,rows:1,perPage:1,gridW:layout.w,gridH:layout.h,gridX:(layout.contentW-layout.w)/2,gridY:(layout.contentH-layout.h)/2};}
 const btn=$('printPhotoSheets');
 // Open synchronously from the tap so Safari does not block the print window after async reads.
 const win=window.open('','_blank');if(!win){alert('ポップアップを許可してから、もう一度実行してください。');return;}
 let urls=[];win.addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL),{once:true});btn.disabled=true;$('printSheetStatus').textContent='写真と番号データを準備しています…';
 try{
  photos=await allPhotos();const byId=new Map(photos.map(p=>[p.id,p]));
  const missing=assignments.filter(id=>!byId.has(id)).length;if(missing)throw Error(`${missing}枚の写真データが見つかりません。写真を再登録してください。`);
  const gridMeta=await metaGet('grid')||{cols:60,rows:50},gridCols=gridMeta.cols||60;
  const batchIndices=pageItems.flat(),batchPhotos=batchIndices.map(i=>byId.get(assignments[i]));
  const urlMap=new Map();if(mode!=='back')for(const ph of batchPhotos){if(!urlMap.has(ph.id)){const u=URL.createObjectURL(ph.blob);urls.push(u);urlMap.set(ph.id,u);}}
  const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pageHeight=layout.contentH;
  let html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>フォトモザイク再印刷</title><style>
   @page{size:${layout.paper} portrait;margin:${layout.margin}mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans JP",sans-serif;margin:0;color:#111}.page{position:relative;width:100%;height:${pageHeight}mm;page-break-after:always;break-after:page;overflow:hidden}.page:last-child{page-break-after:auto;break-after:auto}.head{position:absolute;left:0;top:0;width:100%;height:${layout.headerH}mm;font-size:9pt;display:flex;justify-content:space-between;align-items:flex-start}.grid{position:absolute;left:${layout.gridX}mm;top:${layout.gridY}mm;display:grid;grid-template-columns:repeat(${layout.cols},${layout.w}mm);grid-auto-rows:${layout.h}mm;gap:0;justify-content:start;align-content:start}.cell{width:${layout.w}mm;height:${layout.h}mm;overflow:hidden;display:flex;align-items:center;justify-content:center;border:0;margin:0;padding:0}.cell img{display:block;width:${layout.w}mm;height:${layout.h}mm;object-fit:cover;border:0;margin:0;padding:0}.backcell{border:0;flex-direction:column;gap:.7mm;text-align:center}.backnum{font-family:Arial,sans-serif;font-size:${Math.max(11,Math.min(14,layout.w*.36))}pt;font-weight:800;line-height:1.05}.backcoord{font-family:Arial,"Noto Sans JP",sans-serif;font-size:${Math.max(7,Math.min(9,layout.w*.22))}pt;line-height:1.1;color:#222}.blank{border:0}.cropMarks{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}.cropMarks line{stroke:#111;stroke-width:.25;vector-effect:non-scaling-stroke}@media screen{body{background:#e8edf4}.page{background:white;margin:12px auto;box-shadow:0 1px 8px #64748b55;width:${layout.contentW}mm;height:${layout.contentH}mm}.grid{justify-content:start}}
   </style></head><body>`;
  function pageHeader(pg,side){const label=photoMode?`写真番号 ${pageItems[pg][0]+1}`:`用紙 ${startPage+pg}/${totalPages}`;return `<div class="head"><b>フォトモザイク｜${side==='front'?'写真表面':'写真裏面・配置番号'}｜${layout.paper}｜${label}</b><span>${side==='front'?'写真のみ・番号なし':edge==='long'?'長辺とじ用':'短辺とじ用'}</span></div>`;}
  function cropMarkSvg(){
   const lines=[],x0=layout.gridX,y0=layout.gridY,x1=x0+layout.gridW,y1=y0+layout.gridH,L=layout.markLen;
   // Every vertical tile boundary, including the two outside edges, gets marks in the top and bottom margins.
   for(let c=0;c<=layout.cols;c++){const x=x0+c*layout.w;lines.push(`<line x1="${x}" y1="${y0-L}" x2="${x}" y2="${y0}"/><line x1="${x}" y1="${y1}" x2="${x}" y2="${y1+L}"/>`);}
   // Every horizontal tile boundary, including the two outside edges, gets marks in the left and right margins.
   for(let r=0;r<=layout.rows;r++){const y=y0+r*layout.h;lines.push(`<line x1="${x0-L}" y1="${y}" x2="${x0}" y2="${y}"/><line x1="${x1}" y1="${y}" x2="${x1+L}" y2="${y}"/>`);}
   return `<svg class="cropMarks" viewBox="0 0 ${layout.contentW} ${layout.contentH}" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>`;
  }
  function frontPage(pg){const indices=pageItems[pg];let out=`<section class="page">${cropMarkSvg()}${pageHeader(pg,'front')}<div class="grid">`;
   for(let k=0;k<layout.perPage;k++){const i=indices[k];if(i!==undefined){const ph=byId.get(assignments[i]);out+=`<div class="cell"><img src="${urlMap.get(ph.id)}" alt="${safe(ph.name)}"></div>`;}else out+='<div class="cell blank"></div>';}
   return out+'</div></section>';
  }
  function backPage(pg){const indices=pageItems[pg];let out=`<section class="page">${cropMarkSvg()}${pageHeader(pg,'back')}<div class="grid">`;
   for(let r=0;r<layout.rows;r++)for(let c=0;c<layout.cols;c++){
    let rr=r,cc=c;if(!photoMode&&edge==='long')cc=layout.cols-1-c;else if(!photoMode&&edge==='short')rr=layout.rows-1-r;
    const local=rr*layout.cols+cc,i=indices[local];
    if(i!==undefined){const row=Math.floor(i/gridCols)+1,col=(i%gridCols)+1,parts=[];if(labelMode!=='coord')parts.push(`<b class="backnum">${String(i+1).padStart(4,'0')}</b>`);if(labelMode!=='number')parts.push(`<small class="backcoord">${row}行・${col}列</small>`);out+=`<div class="cell backcell">${parts.join('')}</div>`;}else out+='<div class="cell blank"></div>';
   }
   return out+'</div></section>';
  }
  for(let pg=0;pg<pageItems.length;pg++){if(mode==='paired'){html+=frontPage(pg)+backPage(pg);}else if(mode==='front')html+=frontPage(pg);else html+=backPage(pg);}
  html+=`<script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.decode?i.decode().catch(()=>{}):new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),500));});<\/script></body></html>`;
  win.document.open();win.document.write(html);win.document.close();
  const sides=mode==='paired'?'表面・裏面を交互に出力':mode==='front'?'表面のみ':'裏面のみ';
  $('printSheetStatus').textContent=photoMode?`写真番号 ${batchIndices.map(i=>i+1).join(', ')} を個別再印刷するデータを準備しました。${sides}。`:`${startPage}〜${endPage}ページ／全${totalPages}ページから印刷データを準備しました。${sides}。`;
  if(!photoMode){$('printStartPage').value=Math.min(totalPages,endPage+1);updatePrintSheetInfo();}
 }catch(e){urls.forEach(URL.revokeObjectURL);win.close();$('printSheetStatus').textContent='印刷準備に失敗しました：'+e.message;alert('印刷準備に失敗しました：'+e.message);}
 finally{btn.disabled=false;}
};
// Crop preview: inspect the actual tile aspect ratio in small pages to avoid loading thousands at once.
let cropPreviewUrls=[];
async function renderCropPreview(){
 const grid=$('cropPreviewGrid');cropPreviewUrls.forEach(URL.revokeObjectURL);cropPreviewUrls=[];grid.innerHTML='';
 if(!assignments.length){$('cropPreviewInfo').textContent='配置データがありません。';$('cropPreviewStatus').textContent='先に自動配置してください。';return;}
 photos=await allPhotos();const byId=new Map(photos.map(p=>[p.id,p])),pageSize=100,total=Math.ceil(assignments.length/pageSize),page=Math.min(total-1,Math.max(0,+$('cropPreviewPage').value||0)),from=page*pageSize,to=Math.min(assignments.length,from+pageSize);
 const fragment=document.createDocumentFragment();let missing=0;
 for(let i=from;i<to;i++){
  const p=byId.get(assignments[i]);if(!p){missing++;continue;}
  const item=document.createElement('div');item.className='cropitem';const img=document.createElement('img');img.src=URL.createObjectURL(p.thumb||p.blob);cropPreviewUrls.push(img.src);img.alt='配置番号 '+(i+1);const label=document.createElement('small');label.textContent=`${i+1}｜${p.name}`;label.title=p.name;item.append(img,label);fragment.append(item);
 }
 grid.append(fragment);$('cropPreviewInfo').textContent=`${from+1}〜${to} / ${assignments.length}枚`;$('cropPreviewStatus').textContent=missing?`${missing}枚の写真データが見つかりません。`:'写真は実際のタイル比率で中央トリミング表示しています。';
}
$('cropPreviewPage').onchange=renderCropPreview;
async function initCropPreview(){const pageSize=100,total=Math.max(1,Math.ceil(assignments.length/pageSize)),sel=$('cropPreviewPage'),old=Math.min(total-1,Math.max(0,+sel.value||0));sel.innerHTML='';for(let i=0;i<total;i++){const from=i*pageSize+1,to=Math.min(assignments.length,(i+1)*pageSize),o=document.createElement('option');o.value=i;o.textContent=`${i+1}ページ目（${from}〜${to}）`;sel.append(o);}sel.value=String(old);await renderCropPreview();}
const oldShowTab=showTab;
showTab=function(name){oldShowTab(name);if(name==='output'){updatePrintSheetInfo();initCropPreview();}};
updatePrintSheetInfo();
