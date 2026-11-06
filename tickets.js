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
openDB().then(refresh).catch(e=>status('No se pudo abrir el historial local: '+e.message));
})();