(()=>{'use strict';
const food=document.getElementById('food');if(!food)return;
const card=document.createElement('div');card.className='card';card.id='smartTickets';
card.innerHTML=`
<h2>🧾 Tickets inteligentes</h2>
<p class="small">Fotografía o selecciona una imagen o PDF. El reconocimiento se realiza en este dispositivo; el archivo se descarta al terminar.</p>
<div class="grid"><button id="ticketCamera">📷 Hacer foto</button><button class="alt" id="ticketGallery">🖼️ Subir imagen o PDF</button></div>
<input id="ticketCameraInput" type="file" accept="image/*" capture="environment" hidden>
<input id="ticketGalleryInput" type="file" accept="image/*,.pdf,application/pdf" hidden>
<p id="ticketStatus" class="small" aria-live="polite">No hay ningún ticket pendiente.</p>
<div id="ticketReview" hidden>
<label>Establecimiento</label><input id="ticketStore" placeholder="Nombre del establecimiento">
<label>Fecha de compra</label><input id="ticketDate" type="date">
<label>Categoría del gasto</label><select id="ticketCategory"><option>Comida</option><option>Gasolina</option><option>Ocio</option><option>Otros</option><option>Tarjeta de crédito</option></select>
<label>Total del ticket (€)</label><input id="ticketTotal" inputmode="decimal" placeholder="0,00">
<h2 style="margin-top:16px">Productos reconocidos</h2>
<p class="small">Revisa los nombres, cantidades y precios. Puedes añadir o borrar líneas.</p>
<div id="ticketItems"></div>
<button class="alt" id="ticketAddItem" style="width:100%;margin:8px 0">＋ Añadir producto</button>
<label>Texto leído (por si necesitas consultarlo)</label><textarea id="ticketRaw" rows="5" style="height:100px"></textarea>
<button id="ticketSave" style="width:100%;margin-top:12px">Guardar ticket y gasto</button>
<button class="alt" id="ticketCancel" style="width:100%;margin-top:8px">Cancelar</button>
</div>
<div style="margin-top:14px"><h2>Últimos tickets</h2><div id="ticketHistory" class="small">Cargando historial…</div></div>`;
food.appendChild(card);
const $=id=>document.getElementById(id), DB='kiwibudget_tickets_v1';let db=null,worker=null,pending=null;
const money=v=>{let s=String(v??'').trim().replace(/[€\s]/g,'');if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(',','.');return Number(s)||0};
const euro=v=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(v||0);
function status(t){$('ticketStatus').textContent=t}
function openDB(){return new Promise((resolve,reject)=>{let q=indexedDB.open(DB,1);q.onupgradeneeded=()=>{let d=q.result;if(!d.objectStoreNames.contains('tickets'))d.createObjectStore('tickets',{keyPath:'id'})};q.onsuccess=()=>{db=q.result;resolve(db)};q.onerror=()=>reject(q.error)})}
function allTickets(){return new Promise((resolve,reject)=>{let q=db.transaction('tickets').objectStore('tickets').getAll();q.onsuccess=()=>resolve(q.result.sort((a,b)=>b.created-a.created));q.onerror=()=>reject(q.error)})}
function saveTicket(t){return new Promise((resolve,reject)=>{let q=db.transaction('tickets','readwrite').objectStore('tickets').put(t);q.onsuccess=()=>resolve();q.onerror=()=>reject(q.error)})}
function addItem(item={name:'',quantity:1,unit:'ud.',price:0}){let row=document.createElement('div');row.className='item';row.style.display='block';row.innerHTML=`<div class="grid"><div><label>Producto</label><input data-field="name" placeholder="Nombre" value=""></div><div><label>Precio (€)</label><input data-field="price" inputmode="decimal" placeholder="0,00"></div><div><label>Cantidad</label><input data-field="quantity" inputmode="decimal" value="1"></div><div><label>Unidad</label><select data-field="unit"><option>ud.</option><option>kg</option><option>g</option><option>litros</option><option>ml</option><option>paquete</option><option>servicio</option></select></div></div><button class="del" type="button">Eliminar línea</button>`;
row.querySelector('[data-field="name"]').value=item.name||'';row.querySelector('[data-field="price"]').value=String(item.price||'').replace('.',',');row.querySelector('[data-field="quantity"]').value=item.quantity||1;row.querySelector('[data-field="unit"]').value=item.unit||'ud.';row.querySelector('button').onclick=()=>row.remove();$('ticketItems').appendChild(row)}
function parseLines(text){
 const lines=text.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];
 const skip=/^(TOTAL|SUBTOTAL|BASE IMP|IVA|EFECTIVO|TARJETA|CAMBIO|GRACIAS|DESCUENTO|IMPORTE|PAGADO|VUELTO|FACTURA|TELÉFONO|TELEFONO|CANTIDAD|DESCRIPCIÓN|DESCRIPCION|CNT\.?|P\.? UNIT)/i;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(skip.test(line)||/^\d{1,2}\s?%\s+\d+[,.]\d{2}/.test(line)||/^\d{1,2}\s?%$/.test(line))continue;
  const weight=line.match(/^(?:(\d+)\s+)?(.+?)\s+(\d+[,.]\d{3})\s*(kg|g|l|ml)\s+(\d+[,.]\d{2})\s*€?\s*\/?\s*(?:\d+[,.]\d{2}\s*€?\s*\/\s*(?:kg|g|l|ml))?$/i);
  if(weight){out.push({name:weight[2].trim(),quantity:money(weight[3]),unit:weight[4].toLowerCase(),price:money(weight[5])});continue}
  const weightedNext=(lines[i+1]||'').match(/^(\d+[,.]\d{3})\s*(kg|g|l|ml)\s+(\d+[,.]\d{2})\s*€?\s*\/\s*(?:kg|g|l|ml)\s+(\d+[,.]\d{2})/i);
  if(weightedNext){
   const name=line.replace(/^\d+\s+/,'').trim();
   if(name&&!skip.test(name)){out.push({name,quantity:money(weightedNext[1]),unit:weightedNext[2].toLowerCase(),price:money(weightedNext[4])});i++;continue}
  }
  const m=line.match(/^(?:(\d+)\s+)?(.+?)\s+(-?\d+[,.]\d{2})\s*€?$/);
  if(!m)continue;
  const name=m[2].replace(/^[-*\d. ]+/,'').trim();
  if(name.length<2||skip.test(name))continue;
  out.push({name,quantity:m[1]?Number(m[1]):1,unit:'ud.',price:money(m[3])});
 }
 return out.slice(0,100);
}
async function loadOCR(){if(window.Tesseract)return window.Tesseract;status('Preparando el motor OCR local…');await new Promise((resolve,reject)=>{let s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('No se pudo descargar el motor OCR. Comprueba la conexión.'));document.head.appendChild(s)});return window.Tesseract}
async function loadPDF(){if(window.pdfjsLib)return window.pdfjsLib;status('Preparando lector PDF…');await new Promise((resolve,reject)=>{let s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';s.onload=resolve;s.onerror=()=>reject(Error('No se pudo cargar el lector PDF. Comprueba la conexión.'));document.head.appendChild(s)});window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';return window.pdfjsLib}
async function pdfText(file){
 const pdfjs=await loadPDF(),data=await file.arrayBuffer(),pdf=await pdfjs.getDocument({data,disableWorker:true}).promise;
 if(pdf.numPages>5)throw Error('El PDF tiene '+pdf.numPages+' páginas. De momento admite un máximo de 5 por ticket.');
 let pages=[];
 for(let n=1;n<=pdf.numPages;n++){
  status('Leyendo PDF… página '+n+' de '+pdf.numPages);
  const page=await pdf.getPage(n),content=await page.getTextContent();
  const items=content.items.filter(x=>x.str&&x.str.trim()).map(x=>({text:x.str.trim(),y:Math.round(x.transform[5])})).sort((a,b)=>b.y-a.y);
  let rows=[];
  for(const it of items){let row=rows.find(r=>Math.abs(r.y-it.y)<=3);if(!row){row={y:it.y,parts:[]};rows.push(row)}row.parts.push(it.text)}
  let text=rows.sort((a,b)=>b.y-a.y).map(r=>r.parts.join(' ')).join('\n');
  if(text.replace(/\s/g,'').length<25){
   const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvasContext:ctx,viewport}).promise;
   if(!worker){const T=await loadOCR();worker=await T.createWorker('spa',1,{logger:m=>{if(m.status==='recognizing text')status('Leyendo PDF… '+Math.round((m.progress||0)*100)+'%')}})}
   const result=await worker.recognize(canvas);text=result.data.text||'';
   canvas.width=canvas.height=1;
  }
  pages.push(text);
 }
 return pages.join('\n');
}
async function scan(file){
 if(!file)return;
 const isPDF=file.type==='application/pdf'||/\.pdf$/i.test(file.name||'');
 if(!isPDF&&!file.type.startsWith('image/')){status('Formato no compatible. Selecciona una imagen o un PDF.');return}
 pending=null;$('ticketReview').hidden=true;status('Preparando '+(isPDF?'PDF':'imagen')+'…');
 let url=isPDF?null:URL.createObjectURL(file);
 try{
  let text='';
  if(isPDF){text=await pdfText(file)}
  else{
   let T=await loadOCR();
   if(!worker)worker=await T.createWorker('spa',1,{logger:m=>{if(m.status==='recognizing text')status('Leyendo ticket… '+Math.round((m.progress||0)*100)+'%')}});
   status('Leyendo ticket en este dispositivo…');
   const result=await worker.recognize(url);text=result.data.text||'';
  }
  pending={date:new Date().toISOString().slice(0,10),store:'',category:'Comida',total:0,items:parseLines(text),raw:text};
  let lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  let totalLines=lines.filter(x=>/TOTAL/i.test(x));
  for(let l of totalLines.reverse()){let nums=[...l.matchAll(/(\d+[,.]\d{2})\s*€?/g)];if(nums.length){pending.total=money(nums[nums.length-1][1]);break}}
  let dateMatch=text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if(dateMatch){let y=dateMatch[3].length===2?'20'+dateMatch[3]:dateMatch[3];pending.date=y+'-'+String(dateMatch[2]).padStart(2,'0')+'-'+String(dateMatch[1]).padStart(2,'0')}
  pending.store=(lines.find(x=>/MERCADONA|CARREFOUR|LIDL|DIA|ALDI|EROSKI|CONSUM|COVIRAN|CORTE INGLÉS/i.test(x))||lines.find(x=>/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .,]+$/.test(x)&&x.length<45)||'').replace(/\s{2,}/g,' ').trim();
  $('ticketStore').value=pending.store;$('ticketDate').value=pending.date;$('ticketCategory').value='Comida';$('ticketTotal').value=pending.total?String(pending.total).replace('.',','):'';
  $('ticketRaw').value=text;$('ticketItems').innerHTML='';pending.items.forEach(addItem);if(!pending.items.length)addItem();
  $('ticketReview').hidden=false;status('Lectura terminada. Revisa los datos antes de guardar.');
 }catch(e){status('No se pudo leer el ticket: '+e.message+'. Puedes volver a intentarlo.')}
 finally{if(url)URL.revokeObjectURL(url);$('ticketCameraInput').value='';$('ticketGalleryInput').value=''}
}
function collectItems(){return [...$('ticketItems').children].map(r=>({name:r.querySelector('[data-field="name"]').value.trim(),price:money(r.querySelector('[data-field="price"]').value),quantity:money(r.querySelector('[data-field="quantity"]').value),unit:r.querySelector('[data-field="unit"]').value})).filter(x=>x.name)}
async function refresh(){let a=await allTickets();$('ticketHistory').innerHTML=a.length?a.slice(0,15).map(t=>'<div class="item"><span>'+esc(t.store||'Establecimiento')+' · '+esc(t.date)+'<br><span class="small">'+t.items.length+' productos</span></span><b>'+euro(t.total)+'</b></div>').join(''):'Todavía no hay tickets registrados.'}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('ticketCamera').onclick=()=>$('ticketCameraInput').click();$('ticketGallery').onclick=()=>$('ticketGalleryInput').click();$('ticketCameraInput').onchange=e=>scan(e.target.files[0]);$('ticketGalleryInput').onchange=e=>scan(e.target.files[0]);$('ticketAddItem').onclick=()=>addItem();$('ticketCancel').onclick=()=>{$('ticketReview').hidden=true;pending=null;status('Ticket descartado. La imagen no se ha conservado.')};
$('ticketSave').onclick=async()=>{let total=money($('ticketTotal').value),date=$('ticketDate').value,items=collectItems();if(!(total>0)){alert('Introduce el total del ticket.');return}if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){alert('Selecciona una fecha válida.');return}if(!items.length&&!confirm('No hay productos reconocidos. ¿Guardar solo el total del ticket?'))return;let ticket={id:'ticket_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),created:Date.now(),date,store:$('ticketStore').value.trim(),category:$('ticketCategory').value,total,items,raw:$('ticketRaw').value,expenseId:null};try{await saveTicket(ticket);window.dispatchEvent(new CustomEvent('kiwibudget:addTicketExpense',{detail:{cat:ticket.category,amount:ticket.total,date:ticket.date,ticketId:ticket.id}}));$('ticketReview').hidden=true;pending=null;status('Ticket guardado. La fotografía ya se ha descartado.');await refresh()}catch(e){status('No se pudo guardar el ticket: '+e.message)}};

const PRODUCT_SELECTION_KEY='kiwibudget_product_selection_v1';
function productKey(name,unit){return String(name||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()+'|'+String(unit||'ud.').toLowerCase()}
const PRODUCT_IMAGES_KEY='kiwibudget_product_images_v1';
function productImages(){try{return JSON.parse(localStorage.getItem(PRODUCT_IMAGES_KEY)||'{}')}catch(e){return{}}}
function saveProductImage(key,url){const all=productImages();all[key]=url;localStorage.setItem(PRODUCT_IMAGES_KEY,JSON.stringify(all))}
async function searchMercadonaImages(query){
 const url='https://7uzjk1dj0-dsn.algolia.net/1/indexes/products_prod_vlc1_es/query?x-algolia-application-id=7UZJKL1DJ0&x-algolia-api-key=9d8f2e39e90df472b4f2e559a116fe17';
 const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query, hitsPerPage:6})});
 if(!res.ok)throw Error('El catálogo no está disponible ahora mismo');
 const data=await res.json();return(data.hits||[]).filter(x=>x.thumbnail).map(x=>({name:x.display_name||x.name||query,image:x.thumbnail}));
}
function selectedProducts(){try{return JSON.parse(localStorage.getItem(PRODUCT_SELECTION_KEY)||'[]')}catch(e){return[]}}
function saveSelectedProducts(a){localStorage.setItem(PRODUCT_SELECTION_KEY,JSON.stringify(a))}
function dateValue(s){let d=new Date(String(s||'')+'T12:00:00');return Number.isNaN(d.getTime())?null:d}
async function renderProductForecast(){
 const host=document.getElementById('charts');if(!host||!db)return;
 let panel=document.getElementById('productForecast');
 if(!panel){panel=document.createElement('div');panel.className='card';panel.id='productForecast';panel.innerHTML='<h2>🛒 Mi cesta habitual</h2><p class="small">Selecciona los productos que quieres incluir en tu previsión mensual. Se utilizan los productos de los tickets guardados.</p><div id="productForecastList" class="small">Calculando compras…</div><div class="item" style="margin-top:12px"><span><b>Gasto mensual estimado</b><br><span class="small">Solo productos seleccionados con frecuencia calculable</span></span><b id="productForecastTotal">0,00 €</b></div><p class="small" id="productForecastNote">La estimación se basa en el intervalo medio entre compras y el coste medio por compra.</p>';const history=host.querySelector('#historyChart')?.parentElement;if(history)history.after(panel);else host.appendChild(panel)}
 const tickets=await allTickets(),groups=new Map();
 for(const ticket of tickets){
  const d=dateValue(ticket.date);if(!d)continue;
  const perTicket=new Map();
  for(const item of (ticket.items||[])){
   const name=String(item.name||'').trim(),price=Number(item.price)||0,qty=Number(item.quantity)||1,unit=item.unit||'ud.';
   if(!name||price<=0)continue;
   const key=productKey(name,unit),old=perTicket.get(key)||{name,unit,amount:0,quantity:0,dates:[]};
   old.amount+=price;old.quantity+=qty;perTicket.set(key,old);
  }
  for(const [key,item] of perTicket){if(!groups.has(key))groups.set(key,{key,name:item.name,unit:item.unit,purchases:[]});groups.get(key).purchases.push({date:d,amount:item.amount,quantity:item.quantity,store:ticket.store||''})}
 }
 const selected=new Set(selectedProducts()),products=[...groups.values()].map(p=>{
  p.purchases.sort((a,b)=>a.date-b.date);
  const dates=[...new Map(p.purchases.map(x=>[x.date.toISOString().slice(0,10),x])).values()];
  const gaps=[];for(let i=1;i<dates.length;i++)gaps.push((dates[i].date-dates[i-1].date)/86400000);
  const avgGap=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:0;
  const avgCost=dates.length?dates.reduce((a,b)=>a+b.amount,0)/dates.length:0;
  p.count=dates.length;p.avgGap=avgGap;p.avgCost=avgCost;p.monthly=avgGap>0?avgCost*30.4375/avgGap:null;
  p.last=dates.length?dates[dates.length-1].date:null;return p
 }).sort((a,b)=>(b.monthly||0)-(a.monthly||0)||a.name.localeCompare(b.name,'es'));
 const list=document.getElementById('productForecastList');
 if(!products.length){list.innerHTML='<div class="empty">Todavía no hay productos de tickets guardados. Escanea y guarda algunos tickets para crear tu cesta habitual.</div>';document.getElementById('productForecastTotal').textContent=euro(0);return}
 list.innerHTML=products.map(p=>{
  const checked=selected.has(p.key),freq=p.count<2?'Una compra registrada · faltan más compras':p.avgGap<1?'Aproximadamente a diario':'Cada '+Math.max(1,Math.round(p.avgGap))+' días de media';
  const estimate=p.monthly===null?'Aún no calculable':euro(p.monthly)+'/mes';
  const photo=productImages()[p.key]||'';
  return '<div class="item" style="display:flex;align-items:center;gap:10px"><input type="checkbox" data-product-key="'+esc(p.key)+'" '+(checked?'checked':'')+' style="width:20px;height:20px;flex:0 0 auto"><img src="'+esc(photo)+'" alt="" data-product-image="'+esc(p.key)+'" style="width:64px;height:64px;object-fit:contain;border-radius:8px;background:#f1f1f1;'+(photo?'':'display:none')+'"><span style="flex:1;min-width:0"><b>'+esc(p.name)+'</b><br><span class="small">'+p.count+' compras · '+freq+'</span><br><button type="button" data-image-search="'+esc(p.key)+'" data-image-name="'+esc(p.name)+'" class="alt" style="padding:5px 8px;margin-top:5px">Buscar/cambiar imagen</button><div id="image-results-'+esc(p.key)+'" class="small"></div></span><b style="white-space:nowrap">'+estimate+'</b></div>'
 }).join('');
 list.querySelectorAll('[data-image-search]').forEach(btn=>btn.addEventListener('click',async()=>{
  const key=btn.dataset.imageSearch,name=btn.dataset.imageName,box=document.getElementById('image-results-'+key);box.textContent='Buscando en el catálogo de Mercadona…';
  try{const hits=await searchMercadonaImages(name);if(!hits.length){box.textContent='No se encontraron imágenes. Puedes probar con un nombre más corto.';return}
   box.innerHTML=hits.map((h,i)=>'<button type="button" data-pick-image="'+i+'" style="display:inline-flex;align-items:center;gap:5px;margin:4px;padding:5px;border:1px solid #ccc;border-radius:8px;background:transparent"><img src="'+esc(h.image)+'" style="width:48px;height:48px;object-fit:contain"><span style="max-width:110px;white-space:normal">'+esc(h.name)+'</span></button>').join('');
   box.querySelectorAll('[data-pick-image]').forEach((b,i)=>b.addEventListener('click',()=>{saveProductImage(key,hits[i].image);const img=list.querySelector('[data-product-image="'+CSS.escape(key)+'"]');if(img){img.src=hits[i].image;img.style.display='block'}box.textContent='Imagen guardada.'}));
  }catch(e){box.textContent=e.message+'. Puedes intentarlo más tarde.'}
 }));
 list.querySelectorAll('[data-product-key]').forEach(el=>el.addEventListener('change',()=>{
  let now=new Set(selectedProducts());if(el.checked)now.add(el.dataset.productKey);else now.delete(el.dataset.productKey);saveSelectedProducts([...now]);updateProductTotal(products)
 }));
 updateProductTotal(products);
}
function updateProductTotal(products){
 const chosen=new Set(selectedProducts()),sum=products.filter(p=>chosen.has(p.key)&&p.monthly!==null).reduce((a,p)=>a+p.monthly,0),unknown=products.filter(p=>chosen.has(p.key)&&p.monthly===null).length;
 const out=document.getElementById('productForecastTotal');if(out)out.textContent=euro(sum);
 const note=document.getElementById('productForecastNote');if(note)note.textContent='Estimación orientativa a partir de '+products.filter(p=>chosen.has(p.key)&&p.monthly!==null).length+' productos seleccionados.'+(unknown?' '+unknown+' producto(s) seleccionado(s) aún necesitan al menos dos fechas de compra.':'')+' Los precios y la frecuencia pueden variar.';
}
document.querySelector('[data-tab="charts"]')?.addEventListener('click',()=>setTimeout(()=>renderProductForecast().catch(e=>{const x=document.getElementById('productForecastList');if(x)x.textContent='No se pudo calcular el historial de productos.'}),0));

openDB().then(async()=>{await refresh();await renderProductForecast()}).catch(e=>status('No se pudo abrir el historial local: '+e.message));
})();