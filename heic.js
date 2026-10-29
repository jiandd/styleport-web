
const enc=new TextEncoder(),dec=new TextDecoder('latin1');
const bytes=s=>enc.encode(s),cat=(...a)=>{let n=a.reduce((x,y)=>x+y.length,0),o=new Uint8Array(n),p=0;for(let x of a){o.set(x,p);p+=x.length}return o};
const fail=s=>{throw Error(s)};
function rd(d,p,n){if(n<0||n>8||p<0||p+n>d.length)fail("HEIC 数据截断");let v=0;for(let i=0;i<n;i++)v=v*256+d[p+i];if(!Number.isSafeInteger(v))fail("文件偏移超过 JavaScript 安全范围");return v}
function be(v,n){if(!Number.isSafeInteger(v)||v<0||n<0||n>8||(n<7&&v>=2**(8*n)))fail("数值无法写入 HEIC 字段");let a=new Uint8Array(n);for(let i=n-1;i>=0;i--){a[i]=v%256;v=Math.floor(v/256)}return a}
function boxes(d,s=0,e=d.length){if(s<0||e>d.length||s>e)fail("无效 HEIC box 范围");let a=[];while(s+8<=e){let n=rd(d,s,4),t=dec.decode(d.subarray(s+4,s+8)),h=8;if(n===1){n=rd(d,s+8,8);h=16}else if(n===0)n=e-s;if(n<h||s+n>e)fail("无效 "+t+" box");a.push({t,s,n,h,p:s+h,e:s+n});s+=n}if(s!==e)fail("HEIC box 尾部数据异常");return a}
const box=(t,p)=>cat(be(p.length+8,4),bytes(t),p),raw=(d,b)=>d.subarray(b.s,b.e);
const full=(d,b)=>({v:rd(d,b.p,1),f:rd(d,b.p+1,3),p:b.p+4});
function items(d,b){let {v,p}=full(d,b),count=rd(d,p,v===0?2:4);p+=v===0?2:4;return boxes(d,p,b.e).slice(0,count).filter(x=>x.t==='infe').map(x=>{let z=full(d,x),w=z.v===2?2:4;return {id:rd(d,z.p,w),type:dec.decode(d.subarray(z.p+w+2,z.p+w+6))}})}
function locations(d,b){let {v,f,p}=full(d,b),a=d[p++],z=d[p++],layout={v,f,os:a>>4,ls:a&15,bs:z>>4,ix:v===1||v===2?z&15:0},count=rd(d,p,v<2?2:4);p+=v<2?2:4;let out=[];for(let i=0;i<count;i++){let id=rd(d,p,v<2?2:4);p+=v<2?2:4;let cm=0;if(v===1||v===2){cm=rd(d,p,2)&15;p+=2}let ref=rd(d,p,2);p+=2;let base=rd(d,p,layout.bs);p+=layout.bs;let cnt=rd(d,p,2);p+=2;let ex=[];for(let j=0;j<cnt;j++){let ix=rd(d,p,layout.ix);p+=layout.ix;let off=rd(d,p,layout.os);p+=layout.os;let len=rd(d,p,layout.ls);p+=layout.ls;ex.push({ix,off,len})}out.push({id,cm,ref,base,ex})}return {layout,out}}
function locbox(a,l){let chunks=[new Uint8Array([l.v]),be(l.f,3),new Uint8Array([(l.os<<4)|l.ls,(l.bs<<4)|l.ix]),be(a.length,l.v<2?2:4)];for(let x of a){chunks.push(be(x.id,l.v<2?2:4));if(l.v===1||l.v===2)chunks.push(be(x.cm,2));chunks.push(be(x.ref,2),be(x.base,l.bs),be(x.ex.length,2));for(let y of x.ex){if(l.ix)chunks.push(be(y.ix,l.ix));chunks.push(be(y.off,l.os),be(y.len,l.ls))}}return box('iloc',cat(...chunks))}
function template(d){if(dec.decode(d.subarray(0,8))!=='SP3T0002')fail("模板版本不匹配");let p=8,n=rd(d,p,4);p+=4;let hv=d.subarray(p,p+n);p+=n;let count=rd(d,p,2);p+=2;let m=new Map();for(let i=0;i<count;i++){let id=rd(d,p,2),len=rd(d,p+2,4);p+=6;if(p+len>d.length)fail("模板损坏");m.set(id,d.subarray(p,p+len));p+=len}for(let id of [65,66,141])if(!m.has(id))fail("模板缺少数据 "+id);return {hv,m}}
const textureURI='tag:apple.com,2026:photo:metadata:texture_styles';
const uris=['semanticnosematte','semanticskinmattev2','semanticnonfaceskinmatte','semanticlipsmatte','semanticteethmattev2','semanticpersonmatte','semanticglassesmattev2','semanticeyebrowsmatte','semantictattoomatte','semantichandsmatte','semanticearsmatte','semanticfaceskinmatte'].map(x=>'tag:apple.com,2026:photo:aux:'+x);
const has=(d,s)=>{let q=bytes(s);outer:for(let i=0;i<=d.length-q.length;i++){if(d[i]!==q[0])continue;for(let j=1;j<q.length;j++)if(d[i+j]!==q[j])continue outer;return true}return false};
function infe(id,type,name,tail=new Uint8Array()){return box('infe',cat(new Uint8Array([2,0,0,1]),be(id,2),be(0,2),bytes(type),bytes(name),new Uint8Array([0]),tail))}
function refbox(type,from,to){return box(type,cat(be(from,2),be(to.length,2),...to.map(x=>be(x,2))))}
function convert(d,t){
 if(!has(d,'tag:apple.com,2023:photo:metadata:styles'))fail("照片不含可编辑的摄影风格 2 数据");
 if(has(d,textureURI))return {data:d,already:true};
 let top=boxes(d),meta=top.find(x=>x.t==='meta'),mdat=top.find(x=>x.t==='mdat');if(!meta||!mdat||meta.e>mdat.s)fail("不支持此 HEIC 的 meta/mdat 排列");
 let children=boxes(d,meta.p+4,meta.e),get=x=>children.find(y=>y.t===x);
 let pitm=get('pitm'),iinf=get('iinf'),iref=get('iref'),iprp=get('iprp'),iloc=get('iloc');if([pitm,iinf,iref,iprp,iloc].some(x=>!x))fail("缺少 HEIC 必需的项目结构");
 let it=items(d,iinf),next=Math.max(0,...it.map(x=>x.id))+1;if(next+24>65535)fail("项目 ID 超过 16 位");
 let mids=Array.from({length:12},(_,i)=>next+i*2),xids=mids.map(x=>x+1),tid=next+24;
 let pf=full(d,pitm),primary=rd(d,pf.p,pf.v===0?2:4),tone=it.find(x=>x.type==='tmap');if(!tone)fail("照片缺少 HDR tone-map 项目");
 let inf=full(d,iinf),width=inf.v===0?2:4,oldcount=rd(d,inf.p,width);
 let ichunks=[new Uint8Array([inf.v]),be(inf.f,3),be(oldcount+25,width),d.subarray(inf.p+width,iinf.e)];
 for(let i=0;i<12;i++)ichunks.push(infe(mids[i],'hvc1',''),infe(xids[i],'mime','',cat(bytes('application/rdf+xml'),new Uint8Array([0,0]))));
 ichunks.push(infe(tid,'uri ','metadata',cat(bytes(textureURI),new Uint8Array([0]))));let newIINF=box('iinf',cat(...ichunks));
 let pc=boxes(d,iprp.p,iprp.e),ipco=pc.find(x=>x.t==='ipco'),ipma=pc.find(x=>x.t==='ipma');if(!ipco||!ipma)fail("缺少 ipco/ipma");
 let props=boxes(d,ipco.p,ipco.e),mono=props.findIndex(x=>x.t==='pixi'&&x.n===14&&d[x.p+4]===1&&d[x.p+5]===8)+1,rot=props.findIndex(x=>x.t==='irot')+1;if(!mono||!rot)fail("照片缺少兼容的单色像素属性或方向属性");
 let ispe=props.length+1,aux=uris.map((_,i)=>ispe+1+i),hvcc=ispe+13;
 let newIPCO=box('ipco',cat(d.subarray(ipco.p,ipco.e),box('ispe',cat(be(0,4),be(768,4),be(576,4))),...uris.map(u=>box('auxC',cat(be(0,4),bytes(u),new Uint8Array([0])))),t.hv));
 let ip=full(d,ipma);if(ip.f&1)fail("暂不支持宽格式 ipma");let entries=rd(d,ip.p,4),ich=[new Uint8Array([ip.v]),be(ip.f,3),be(entries+12,4),d.subarray(ip.p+4,ipma.e)];
 for(let i=0;i<12;i++){let inds=[ispe,mono,aux[i],hvcc,rot];if(inds.some(x=>x>127))fail("ipma 属性索引超过 7 位");ich.push(be(mids[i],ip.v<1?2:4),new Uint8Array([5,...inds.map((x,j)=>x|(j>=2?128:0))]))}
 let newIPMA=box('ipma',cat(...ich));
 let newIPRP=box('iprp',cat(...pc.map(x=>x.t==='ipco'?newIPCO:x.t==='ipma'?newIPMA:raw(d,x))));
 let ir=full(d,iref);if(ir.v!==0)fail("不支持 32 位 iref");let refs=[new Uint8Array([ir.v]),be(ir.f,3),d.subarray(ir.p,iref.e)];
 for(let i=0;i<12;i++)refs.push(refbox('auxl',mids[i],[primary,tone.id]),refbox('cdsc',xids[i],[mids[i]]));
 refs.push(refbox('cdsc',tid,[primary,tone.id]));let newIREF=box('iref',cat(...refs));
 let added=[],newdata=[];for(let i=0;i<12;i++){for(let [id,buf] of [[mids[i],t.m.get(65)],[xids[i],t.m.get(66)]]){let off=added.reduce((n,x)=>n+x.length,0);added.push(buf);newdata.push({id,off,len:buf.length})}}
 let tex=t.m.get(141),off=added.reduce((n,x)=>n+x.length,0);added.push(tex);newdata.push({id:tid,off,len:tex.length});
 let {layout,out}=locations(d,iloc);
 let place=out.concat(newdata.map(x=>({id:x.id,cm:0,ref:0,base:0,ex:[{ix:0,off:0,len:x.len}]})));
 let rebuild=repl=>box('meta',cat(d.subarray(meta.p,meta.p+4),...children.map(x=>repl[x.t]||raw(d,x))));
 let repl={iinf:newIINF,iref:newIREF,iprp:newIPRP,iloc:locbox(place,layout)},placeholder=rebuild(repl),delta=placeholder.length-meta.n;
 if(delta<0)fail("元数据大小异常");
 let shifted=out.map(x=>({...x,base:x.cm===0&&x.base>0?x.base+delta:x.base,ex:x.cm===0&&x.base===0?x.ex.map(y=>({...y,off:y.off+delta})):x.ex}));
 let base=mdat.e+delta;
 shifted.push(...newdata.map(x=>({id:x.id,cm:0,ref:0,base:0,ex:[{ix:0,off:base+x.off,len:x.len}]})));
 repl.iloc=locbox(shifted,layout);let newMeta=rebuild(repl);if(newMeta.length-meta.n!==delta)fail("两次元数据大小不一致");
 let mdatPayload=cat(d.subarray(mdat.p,mdat.e),...added);
 let newMdat=mdat.h===16?cat(be(1,4),bytes('mdat'),be(mdatPayload.length+16,8),mdatPayload):box('mdat',mdatPayload);
 let result=cat(...top.map(x=>x.t==='meta'?newMeta:x.t==='mdat'?newMdat:raw(d,x)));
 if(!has(result,textureURI)||!has(result,uris.at(-1)))fail("输出文件校验失败");
 boxes(result);return {data:result,already:false};
}
export {convert,template,boxes};
