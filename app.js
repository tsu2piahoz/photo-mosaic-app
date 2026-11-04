const DB='mosaic_ipad_local_v1', STORE='photos', META='meta';
let db, sourceBlob=null, sourceName='', assignments=[], photos=[], busy=false, previewBusy=false, previewReady=false;
const $=id=>document.getElementById(id);
function openDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{let d=r.result;d.createObjectStore(STORE,{keyPath:'id'});d.createObjectStore(META,{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function allPhotos(){return new Promise((res,rej)=>{let r=tx(STORE).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function putPhoto(p){return new Promise((res,rej)=>{let r=tx(STORE,'readwrite').put(p);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function clearStore(){return new Promise((res,rej)=>{let r=tx(STORE,'readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function metaPut(key,value){return new Promise((res,rej)=>{let r=tx(META,'readwrite').put({key,value});r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function metaGet(key){return new Promise(res=>{let r=tx(META).get(key);r.onsuccess=()=>res(r.result?.value);r.onerror=()=>res(null);});}
function showTab(name){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('hidden',x.id!==name));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));if(name==='photos')renderPhotos();if(name==='home')refreshStats();if(name==='output')updateDims();}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
async function refreshStats(){photos=await allPhotos();$('count').textContent=photos.length.toLocaleString();$('placed').textContent=assignments.length.toLocaleString();$('outputStatus').textContent=assignments.length?`${assignments.length.toLocaleString()}マスに配置済み`:'配置データがありません。';}
function blobURL(blob){return URL.createObjectURL(blob)}
async function renderPhotos(){photos=await allPhotos();$('photoGrid').innerHTML='';photos.slice(0,240).forEach(p=>{let img=document.createElement('img');img.src=blobURL(p.thumb||p.blob);img.title=p.name;$('photoGrid').append(img);});$('importStatus').textContent=`登録：${photos.length.toLocaleString()}枚（一覧は先頭240枚を表示）`;}
function setProgress(id,n){$(id).style.width=Math.max(0,Math.min(100,n))+'%'}
async function addFiles(files){if(busy)return;busy=true;let good=0,skip=0;let start=(await allPhotos()).length;for(let i=0;i<files.length;i++){let f=files[i];if(!f.type.startsWith('image/')){skip++;continue;}try{let bmp=await createImageBitmap(f);let c=document.createElement('canvas');let scale=Math.min(1,180/Math.max(bmp.width,bmp.height));c.width=Math.max(1,Math.round(bmp.width*scale));c.height=Math.max(1,Math.round(bmp.height*scale));c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);let thumb=await new Promise(r=>c.toBlob(r,'image/jpeg',.78));await putPhoto({id:crypto.randomUUID(),name:f.name,blob:f,thumb,width:bmp.width,height:bmp.height});bmp.close();good++;}catch(e){skip++;}setProgress('importProgress',(i+1)/files.length*100);$('importStatus').textContent=`取り込み中 ${i+1}/${files.length}｜成功 ${good}枚`;if(i%20===0)await new Promise(r=>setTimeout(r,0));}
busy=false;await renderPhotos();await refreshStats();$('importStatus').textContent=`追加 ${good}枚／スキップ ${skip}枚｜合計 ${(start+good).toLocaleString()}枚`;}
$('filesInput').onchange=e=>addFiles([...e.target.files]);
async function readZipEntries(buf){const dv=new DataView(buf),u8=new Uint8Array(buf);let eocd=-1;for(let i=u8.length-22;i>=Math.max(0,u8.length-65558);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}}if(eocd<0)throw Error('ZIPの形式を読み取れません');let count=dv.getUint16(eocd+10,true),off=dv.getUint32(eocd+16,true),out=[];for(let n=0;n<count;n++){if(dv.getUint32(off,true)!==0x02014b50)break;let method=dv.getUint16(off+10,true),cs=dv.getUint32(off+20,true),nl=dv.getUint16(off+28,true),el=dv.getUint16(off+30,true),cl=dv.getUint16(off+32,true),lo=dv.getUint32(off+42,true);let name=new TextDecoder().decode(u8.slice(off+46,off+46+nl));if(!name.endsWith('/')){let lnl=dv.getUint16(lo+26,true),lel=dv.getUint16(lo+28,true),dataStart=lo+30+lnl+lel,comp=u8.slice(dataStart,dataStart+cs);let data;if(method===0)data=comp;else if(method===8){if(!('DecompressionStream'in window))throw Error('このSafariではZIP展開に対応していません。ファイルから画像を選択してください。');let ds=new DecompressionStream('deflate-raw');data=new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer());}else{data=null;}if(data)out.push(new File([data],name.split('/').pop(),{type:mime(name)}));}off+=46+nl+el+cl;}return out;}
function mime(n){let e=n.toLowerCase().split('.').pop();return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',avif:'image/avif'})[e]||'application/octet-stream';}
$('zipInput').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{$('importStatus').textContent='ZIPを展開しています…';let files=await readZipEntries(await f.arrayBuffer());await addFiles(files);}catch(err){alert(err.message||String(err));}e.target.value='';};
$('clearPhotos').onclick=async()=>{if(confirm('登録した写真をすべて削除しますか？配置データも消去されます。')){await clearStore();assignments=[];previewReady=false;await metaPut('assignments',[]);await renderPhotos();await refreshStats();}};
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
async function imageFeatures(blob,aspect){
 const bmp=await createImageBitmap(blob);const [sx,sy,sw,sh]=tileCropRect(bmp.width,bmp.height,aspect);
 const c=document.createElement('canvas');c.width=32;c.height=32;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bmp,sx,sy,sw,sh,0,0,32,32);bmp.close();
 const d=ctx.getImageData(0,0,32,32).data;let r=0,g=0,b=0,lum=0,lum2=0;
 for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];const l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];lum+=l;lum2+=l*l;}
 const n=1024,mean=lum/n;return {rgb:[r/n,g/n,b/n],lab:rgbToLab([r/n,g/n,b/n]),std:Math.sqrt(Math.max(0,lum2/n-mean*mean))};
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
 busy=true;$('makeMosaic').disabled=true;$('makeStatus').textContent='原画を実寸比率に合わせて解析しています…';setProgress('makeProgress',0);
 try{
  const source=await createImageBitmap(src),targets=new Array(N),targetLab=new Array(N),edgeStrength=new Float32Array(N);
  const physicalRatio=(cols*tileW)/(rows*tileH),sxsy=tileCropRect(source.width,source.height,physicalRatio);
  const tc=document.createElement('canvas');tc.width=cols;tc.height=rows;const tctx=tc.getContext('2d',{willReadFrequently:true});
  tctx.drawImage(source,sxsy[0],sxsy[1],sxsy[2],sxsy[3],0,0,cols,rows);
  const td=tctx.getImageData(0,0,cols,rows).data, lum=new Float32Array(N);
  for(let i=0;i<N;i++){const rgb=[td[i*4],td[i*4+1],td[i*4+2]];targets[i]=rgb;targetLab[i]=rgbToLab(rgb);lum[i]=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
  source.close();let maxEdge=1;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){let i=r*cols+c,gx=((c<cols-1?lum[i+1]:lum[i])-(c>0?lum[i-1]:lum[i]))*.5,gy=((r<rows-1?lum[i+cols]:lum[i])-(r>0?lum[i-cols]:lum[i]))*.5;edgeStrength[i]=Math.hypot(gx,gy);if(edgeStrength[i]>maxEdge)maxEdge=edgeStrength[i];}
  let sortedEdges=Array.from(edgeStrength).sort((a,b)=>a-b),scale=Math.max(1,sortedEdges[Math.floor(.9*(N-1))]||1);
  for(let i=0;i<N;i++)edgeStrength[i]=Math.min(1,edgeStrength[i]/scale);
  const photoFeat=new Array(photos.length);
  for(let i=0;i<photos.length;i++){photoFeat[i]=await imageFeatures(photos[i].thumb||photos[i].blob,aspect);if(i%20===0){setProgress('makeProgress',i/photos.length*25);$('makeStatus').textContent=`写真の特徴を解析中 ${i+1}/${photos.length}`;await yieldUI();}}
  const targetStd=new Float32Array(N);
  // Estimate source detail inside each physical tile (8x8 samples per tile).
  const dc=document.createElement('canvas');dc.width=cols*8;dc.height=rows*8;const dctx=dc.getContext('2d',{willReadFrequently:true});
  const src2=await createImageBitmap(src);dctx.drawImage(src2,sxsy[0],sxsy[1],sxsy[2],sxsy[3],0,0,cols*8,rows*8);src2.close();const dd=dctx.getImageData(0,0,dc.width,dc.height).data;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){let sum=0,sum2=0;for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){let k=(((r*8+yy)*dc.width)+(c*8+xx))*4,l=.2126*dd[k]+.7152*dd[k+1]+.0722*dd[k+2];sum+=l;sum2+=l*l;}let m=sum/64;targetStd[r*cols+c]=Math.sqrt(Math.max(0,sum2/64-m*m));}
  // Greedy one-to-one initialization using CIE Lab and edge-aware lightness.
  let used=new Uint8Array(photos.length),result=new Int32Array(N);
  for(let i=0;i<N;i++){let t=targetLab[i],best=-1,bd=Infinity,ew=1.3+.85*edgeStrength[i];for(let j=0;j<photos.length;j++){if(used[j])continue;let p=photoFeat[j].lab,dl=(t[0]-p[0])*ew,da=(t[1]-p[1])*.68,db=(t[2]-p[2])*.68,ds=targetStd[i]-photoFeat[j].std;let cost=dl*dl+da*da+db*db+ds*ds*.035;if(cost<bd){bd=cost;best=j;}}if(best<0)throw Error('写真の割り当てに失敗しました。');result[i]=best;used[best]=1;if(i%12===0){setProgress('makeProgress',25+i/N*40);$('makeStatus').textContent=`写真を割り当て中 ${i+1}/${N}`;await yieldUI();}}
  // Refine local and global swaps to improve adjacent Lab transitions.
  const neighbors=Array.from({length:N},(_,i)=>{let a=[],r=Math.floor(i/cols),c=i%cols;if(c>0)a.push(i-1);if(c+1<cols)a.push(i+1);if(r>0)a.push(i-cols);if(r+1<rows)a.push(i+cols);return a;});
  const edges=[];for(let i=0;i<N;i++)for(const j of neighbors[i])if(j>i){const a=targetLab[i],b=targetLab[j],delta=[a[0]-b[0],(a[1]-b[1])*.38,(a[2]-b[2])*.38],strength=Math.hypot(...delta),importance=.30+.70*Math.min(strength/24,1);edges.push([i,j,delta,importance]);}
  const photoTrans=photoFeat.map(x=>[x.lab[0],x.lab[1]*.38,x.lab[2]*.38]);
  const edgeCost=(e,arr)=>{let [a,b,d,w]=e,pa=photoTrans[arr[a]],pb=photoTrans[arr[b]],x=d[0]-(pa[0]-pb[0]),y=d[1]-(pa[1]-pb[1]),z=d[2]-(pa[2]-pb[2]);return (x*x+y*y+z*z)*w;};
  let seed=20261026;const rand=max=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%max;};
  const attempts=Math.min(12000,Math.max(4500,N*4));
  for(let step=0;step<attempts;step++){
   let a=rand(N),b;if(step%3!==0){let ns=neighbors[a];b=ns[rand(ns.length)];}else{b=rand(N-1);if(b>=a)b++;}
   let pa=result[a],pb=result[b],fa=photoFeat[pa],fb=photoFeat[pb],ta=targetLab[a],tb=targetLab[b];
   const unary=(cell,ph)=>{let t=targetLab[cell],ew=1.3+.85*edgeStrength[cell],dl=(t[0]-ph.lab[0])*ew,da=(t[1]-ph.lab[1])*.68,db=(t[2]-ph.lab[2])*.68,ds=targetStd[cell]-ph.std;return dl*dl+da*da+db*db+ds*ds*.035;};
   let delta=unary(a,fb)+unary(b,fa)-unary(a,fa)-unary(b,fb);
   const affected=new Set([...neighbors[a],...neighbors[b]]);affected.add(a);affected.add(b);let before=0,after=0;
   for(const x of affected)for(const y of neighbors[x])if(x<y&&(x===a||x===b||y===a||y===b)){let e=[x,y,[targetLab[x][0]-targetLab[y][0],(targetLab[x][1]-targetLab[y][1])*.38,(targetLab[x][2]-targetLab[y][2])*.38],.30+.70*Math.min(Math.hypot(targetLab[x][0]-targetLab[y][0],(targetLab[x][1]-targetLab[y][1])*.38,(targetLab[x][2]-targetLab[y][2])*.38)/24,1)];before+=edgeCost(e,result);let tmp=result[x];if(x===a)tmp=pb;else if(x===b)tmp=pa;let tmp2=result[y];if(y===a)tmp2=pb;else if(y===b)tmp2=pa;let p1=photoTrans[tmp],p2=photoTrans[tmp2],d=e[2],xx=d[0]-(p1[0]-p2[0]),yy=d[1]-(p1[1]-p2[1]),zz=d[2]-(p1[2]-p2[2]);after+=(xx*xx+yy*yy+zz*zz)*e[3];}
   if(delta+.20*(after-before)<-1e-6){result[a]=pb;result[b]=pa;}
   if(step%600===0){setProgress('makeProgress',65+step/attempts*35);$('makeStatus').textContent=`隣接関係を調整中 ${step.toLocaleString()}/${attempts.toLocaleString()}`;await yieldUI();}
  }
  assignments=Array.from(result,i=>photos[i].id);previewReady=false;$('previewStatus').textContent='配置が更新されました。プレビューを作り直してください。';
  await metaPut('assignments',assignments);await metaPut('grid',{cols,rows,tileW,tileH,physicalRatio});$('makeStatus').textContent=`完了：${N.toLocaleString()}マスに重複なしで配置しました。Lab色差・輪郭・隣接関係を考慮しています。`;setProgress('makeProgress',100);await refreshStats();
 }catch(e){alert('配置中にエラーが発生しました：'+(e.message||String(e)));$('makeStatus').textContent='配置に失敗しました。';}
 busy=false;$('makeMosaic').disabled=false;
};
async function renderMosaicPreview(){
 if(previewBusy)return;
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
$('updateDims').onclick=updateDims;
async function exportCsv(){photos=await allPhotos();let map=new Map(photos.map(p=>[p.id,p.name]));let grid=await metaGet('grid')||{cols:60,rows:50};let lines=['番号,行,列,写真ファイル名,写真ID'];assignments.forEach((id,i)=>lines.push(`${i+1},${Math.floor(i/grid.cols)+1},${i%grid.cols+1},\"${(map.get(id)||'').replaceAll('\"','\"\"')}\",${id}`));download(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),'photo_assignment.csv');}
function download(blob,name){let a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}
$('exportCsv').onclick=exportCsv;
$('exportProject').onclick=async()=>{photos=await allPhotos();let src=await metaGet('source'),grid=await metaGet('grid');let data={app:'フォトモザイク制作室',version:1,grid,assignments,sourceName:src?.name||'',createdAt:new Date().toISOString(),photoNames:photos.map(p=>({id:p.id,name:p.name}))};download(new Blob([JSON.stringify(data)],{type:'application/json'}),'mosaic_project_backup.json');alert('配置情報のバックアップを書き出しました。写真本体は含まれません。写真フォルダも別途保管してください。');};
$('projectInput').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let d=JSON.parse(await f.text());if(!Array.isArray(d.assignments))throw Error('配置情報がありません');assignments=d.assignments;await metaPut('assignments',assignments);if(d.grid)await metaPut('grid',d.grid);alert('配置情報を復元しました。対応する写真が端末に登録されている必要があります。');await refreshStats();}catch(err){alert('復元できません：'+err.message);}e.target.value='';};
$('printMap').onclick=async()=>{photos=await allPhotos();if(!assignments.length){alert('先に配置を作成してください');return;}let grid=await metaGet('grid')||{cols:60,rows:50},map=new Map(photos.map(p=>[p.id,p]));let win=window.open('','_blank');if(!win){alert('ポップアップを許可してください');return;}let cells=assignments.map((id,i)=>{let p=map.get(id);return `<div class=\"cell\"><b>${Math.floor(i/grid.cols)+1}-${i%grid.cols+1}</b><span>${(p?.name||'').replace(/[&<>\"']/g,'')}</span></div>`}).join('');win.document.write(`<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><title>番号付き配置図</title><style>@page{size:A3 landscape;margin:8mm}body{font-family:sans-serif;margin:0}h1{font-size:16px}.grid{display:grid;grid-template-columns:repeat(${grid.cols},1fr);gap:1px}.cell{border:.3px solid #777;min-width:0;height:10mm;overflow:hidden;font-size:5pt;display:flex;flex-direction:column;justify-content:center;align-items:center}.cell b{font-size:6pt}.cell span{max-width:100%;overflow:hidden;white-space:nowrap}@media print{button{display:none}}</style><h1>フォトモザイク配置図｜${grid.cols}列 × ${grid.rows}行</h1><div class=\"grid\">${cells}</div><script>window.onload=()=>setTimeout(()=>window.print(),500)<\\/script></html>`);win.document.close();};
(async()=>{try{db=await openDB();let s=await metaGet('source');if(s){sourceBlob=s.blob;sourceName=s.name;$('sourceStatus').textContent=`原画：${s.name}`;}assignments=await metaGet('assignments')||[];let g=await metaGet('grid');if(g){$('cols').value=g.cols;$('rows').value=g.rows;}await refreshStats();updateDims();}catch(e){alert('ローカル保存を開始できません。Safariのプライベートブラウズではなく通常モードで開いてください。');}})();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));


// v4: print physical photo sheets on A4/A3 paper.
function getPrintLayout(){
 const paper=$('printPaper').value,w=Number($('printTileW').value),h=Number($('printTileH').value),gap=Number($('printGap').value),margin=Number($('printMargin').value);
 if(![w,h,gap,margin].every(Number.isFinite)||w<=0||h<=0||gap<0||margin<0)throw Error('印刷寸法は正の数（間隔・余白は0以上）で入力してください。');
 // Portrait page dimensions in mm. Header reserves 10 mm.
 const pageW=paper==='A3'?297:210,pageH=paper==='A3'?420:297,usableW=pageW-2*margin,usableH=pageH-2*margin-10;
 const cols=Math.floor((usableW+gap)/(w+gap)),rows=Math.floor((usableH+gap)/(h+gap));
 if(cols<1||rows<1)throw Error('このタイル寸法では用紙に配置できません。余白や間隔を小さくしてください。');
 return {paper,w,h,gap,margin,cols,rows,perPage:cols*rows,pageW,pageH};
}
function updatePrintSheetInfo(){
 try{const x=getPrintLayout(),n=assignments.length,pages=Math.ceil(n/x.perPage);$('printSheetInfo').textContent=`${x.paper}縦／${x.cols}列 × ${x.rows}行＝1ページ${x.perPage}枚。配置${n.toLocaleString()}枚の場合、約${pages.toLocaleString()}ページです。写真は${x.w}×${x.h}mmで配置します。`;}
 catch(e){$('printSheetInfo').textContent=e.message;}
}
['printPaper','printTileW','printTileH','printGap','printMargin'].forEach(id=>$(id).addEventListener('change',updatePrintSheetInfo));
$('printPhotoSheets').onclick=async()=>{
 if(busy||previewBusy){alert('ほかの処理が終わってから実行してください。');return;}
 if(!assignments.length){alert('先に写真を自動配置してください。');return;}
 let layout;try{layout=getPrintLayout();}catch(e){alert(e.message);return;}
 const btn=$('printPhotoSheets');btn.disabled=true;$('printSheetStatus').textContent='写真データを準備しています…';
 try{
  photos=await allPhotos();const byId=new Map(photos.map(p=>[p.id,p]));
  const missing=assignments.filter(id=>!byId.has(id)).length;if(missing)throw Error(`${missing}枚の写真データが見つかりません。写真を再登録してください。`);
  const gridMeta=await metaGet('grid')||{cols:60,rows:50};const gridCols=gridMeta.cols||60;const pages=Math.ceil(assignments.length/layout.perPage),urls=[];
  // Create object URLs once; the print window uses them without embedding photo bytes in HTML.
  for(const p of photos)urls.push([p.id,URL.createObjectURL(p.blob)]);
  const urlMap=new Map(urls);const win=window.open('','_blank');
  if(!win){urls.forEach(x=>URL.revokeObjectURL(x[1]));throw Error('ポップアップを許可してから、もう一度実行してください。');}
  const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>フォトモザイク写真シート</title><style>
   @page{size:${layout.paper} portrait;margin:${layout.margin}mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans JP",sans-serif;margin:0;color:#111}.page{width:100%;height:${layout.pageH-2*layout.margin}mm;page-break-after:always;break-after:page;overflow:hidden}.page:last-child{page-break-after:auto;break-after:auto}.head{height:10mm;font-size:9pt;display:flex;justify-content:space-between;align-items:flex-start}.grid{display:grid;grid-template-columns:repeat(${layout.cols},${layout.w}mm);grid-auto-rows:${layout.h+3+layout.gap}mm;column-gap:${layout.gap}mm;row-gap:${layout.gap}mm;justify-content:center;align-content:start}.cell{width:${layout.w}mm;height:${layout.h+3}mm;overflow:hidden}.num{height:3mm;line-height:3mm;font-size:6pt;text-align:center;color:#111}.cell img{display:block;width:${layout.w}mm;height:${layout.h}mm;object-fit:cover;border:.15mm solid #777}.hint{font-size:7pt;color:#555}@media screen{body{background:#ddd}.page{background:white;margin:12px auto;padding:0;box-shadow:0 1px 8px #999;width:${layout.pageW-2*layout.margin}mm;min-height:${layout.pageH-2*layout.margin}mm;height:auto;padding-bottom:4mm}.grid{justify-content:center}}
   </style></head><body>`;
  for(let pg=0;pg<pages;pg++){
   const start=pg*layout.perPage,end=Math.min(assignments.length,start+layout.perPage);
   html+=`<section class="page"><div class="head"><b>フォトモザイク写真シート｜${layout.paper}｜${pg+1}/${pages}ページ</b><span class="hint">番号は配置図と対応／倍率100%で印刷</span></div><div class="grid">`;
   for(let i=start;i<end;i++){
    const id=assignments[i],p=byId.get(id),url=urlMap.get(id);
    html+=`<div class="cell"><div class="num">${i+1}（${Math.floor(i/gridCols)+1}-${i%gridCols+1}）</div><img src="${url}" alt="${safe(p.name)}"></div>`;
   }
   html+='</div></section>';
  }
  html+=`<script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.decode?i.decode().catch(()=>{}):new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),700));});window.addEventListener('afterprint',()=>{document.title='印刷完了：フォトモザイク写真シート';});<\/script></body></html>`;
  win.document.open();win.document.write(html);win.document.close();
  $('printSheetStatus').textContent=`印刷画面を準備しました。${pages}ページ／${assignments.length.toLocaleString()}枚。写真の読み込み完了後に印刷画面が開きます。`;
  // Keep URLs alive while the print tab is open; release when it closes is not observable cross-browser.
 }catch(e){$('printSheetStatus').textContent='印刷準備に失敗しました：'+e.message;alert('印刷準備に失敗しました：'+e.message);}
 finally{btn.disabled=false;}
};
