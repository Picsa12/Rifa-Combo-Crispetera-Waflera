/*
  Rifa Crispetera 00-99
  Configura SUPABASE_URL y SUPABASE_ANON_KEY en config.js.
  Nunca incluyas una service_role key en el navegador.
*/
const CONFIG = window.RIFA_CONFIG || {};
const hasConfig = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const supabaseClient = hasConfig
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("es-CO", {style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(value || 0));
// Precios del combo: 1 puesto = $10.000; cada pareja de puestos = $16.000.
const PRICE_ONE=10000,PRICE_TWO=16000,RAFFLE_NAME="Rifa combo de Crispetera + Waflera";
const ticketsTotal=(n)=>Math.floor(n/2)*PRICE_TWO+(n%2)*PRICE_ONE;
const dateLabel = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"}) : "Por definir";
let settings = {title:"Rifa de la Crispetera",prize:"Crispetera",draw_date:"2026-11-14",price:5000};
let numberRows = Array.from({length:100},(_,n)=>({number:n,status:"available"}));
let selected = new Set();
let publicPeople = [];
let adminRequests = [];
let currentUser = null;
let refreshChannel = null;

let toastTimer=null;
function toast(message,ms=3200){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),ms)}
let isSubmitting=false; // evita envíos duplicados y que el modal se cierre mientras se procesa
const SUCCESS_MESSAGE="Registration successful! Your selected numbers have been reserved and are pending payment approval.";
function showDialog(id){$(id).showModal()}
function closeDialog(id){if(id==="registration-modal"&&isSubmitting)return;$(id).close()}
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog(b.dataset.close)));
$("admin-open").addEventListener("click",()=>showDialog("admin-modal"));

function updateHeader(){
  $("hero-price").textContent=money(PRICE_ONE)+" COP";
  $("hero-price-2").textContent=money(PRICE_TWO)+" COP";
  $("stat-price").textContent=money(PRICE_TWO);
  $("pricing-note").textContent=`1 puesto: ${money(PRICE_ONE)} · 2 puestos: ${money(PRICE_TWO)}. Si eliges más, cada pareja cuesta ${money(PRICE_TWO)}.`;
  $("hero-date").textContent=dateLabel(settings.draw_date);
  document.title=`${RAFFLE_NAME} | 00–99`;
}
function renderGrid(){
  const grid=$("number-grid");grid.innerHTML="";
  numberRows.forEach(row=>{
    const n=Number(row.number),btn=document.createElement("button");
    btn.type="button";btn.className=`number ${row.status}`;
    btn.textContent=String(n).padStart(2,"0");
    btn.setAttribute("aria-label",`Número ${String(n).padStart(2,"0")}: ${row.status}`);
    if(row.status==="available"){
      if(selected.has(n))btn.classList.add("selected");
      btn.addEventListener("click",()=>{selected.has(n)?selected.delete(n):selected.add(n);renderGrid();updateSelection()});
    } else {
      btn.addEventListener("click",()=>showNumberDetail(n));
    }
    grid.appendChild(btn);
  });
  const counts=numberRows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
  $("available-count").textContent=counts.available||0;
  $("pending-count").textContent=counts.pending||0;
  $("confirmed-count").textContent=counts.confirmed||0;
}
function updateSelection(){
  const nums=[...selected].sort((a,b)=>a-b);
  $("selection-summary").textContent=nums.length?nums.map(n=>String(n).padStart(2,"0")).join(", "):"Ningún número seleccionado";
  $("register-open").disabled=!nums.length;
}
$("register-open").addEventListener("click",()=>{
  const nums=[...selected].sort((a,b)=>a-b);
  $("modal-numbers").textContent=nums.map(n=>String(n).padStart(2,"0")).join(", ");
  $("registration-total").textContent=money(ticketsTotal(nums.length));
  $("registration-message").textContent="";
  showDialog("registration-modal");
});

async function loadPublicData(){
  if(!supabaseClient){renderGrid();updateSelection();return}
  const [{data:config,error:e1},{data:rows,error:e2},{data:people,error:e3}]=await Promise.all([
    supabaseClient.from("raffle_settings").select("title,prize,draw_date,price").eq("id",1).maybeSingle(),
    supabaseClient.from("raffle_numbers").select("number,status").order("number"),
    supabaseClient.rpc("public_participant_summary")
  ]);
  if(e1)console.warn(e1); if(e2)console.error(e2); if(e3)console.error(e3);
  if(config)settings=config;
  if(rows?.length)numberRows=rows;
  if(people)publicPeople=people;
  // Actualizar sólo lo que sigue disponible; la selección local se descarta si otro usuario la tomó.
  const statusMap=new Map(numberRows.map(r=>[Number(r.number),r.status]));
  [...selected].forEach(n=>{if(statusMap.get(n)!=="available")selected.delete(n)});
  updateHeader();renderGrid();updateSelection();
  if($("registration-modal").open)syncRegistrationModal();
}
async function showNumberDetail(number){
  const row=numberRows.find(r=>Number(r.number)===number);
  const person=publicPeople.find(p=>(p.numbers||[]).map(Number).includes(number));
  const statusText=row?.status==="pending"?"Pendiente de pago":"Confirmado";
  $("number-detail").innerHTML="";
  const title=document.createElement("div");title.className="detail-number";title.textContent=String(number).padStart(2,"0");$("number-detail").append(title);
  const add=(label,value)=>{const d=document.createElement("div");d.className="detail-row";const a=document.createElement("span");a.textContent=label;const b=document.createElement("strong");b.textContent=value||"—";d.append(a,b);$("number-detail").append(d)};
  add("Estado",statusText);
  if(person){add("Participante",`${person.first_name} ${person.last_name}`);add("Otros números",(person.numbers||[]).map(n=>String(n).padStart(2,"0")).join(", "));add("Fecha de solicitud",new Date(person.created_at).toLocaleDateString("es-CO"));}
  else add("Información","La solicitud no tiene datos públicos disponibles.");
  showDialog("number-modal");
}

function syncRegistrationModal(){
  const nums=[...selected].sort((a,b)=>a-b);
  $("modal-numbers").textContent=nums.length?nums.map(n=>String(n).padStart(2,"0")).join(", "):"Ninguno";
  $("registration-total").textContent=money(ticketsTotal(nums.length));
}
$("registration-modal").addEventListener("cancel",(ev)=>{if(isSubmitting)ev.preventDefault()});

$("registration-form").addEventListener("submit",async(e)=>{
  e.preventDefault();
  if(isSubmitting)return;
  // e.currentTarget vale null después del primer await: se guarda antes.
  const formEl=e.currentTarget,msg=$("registration-message");
  if(!supabaseClient){msg.textContent="La página aún no está conectada a Supabase. Configura config.js.";return}
  const form=new FormData(formEl);
  const numbers=[...selected].sort((a,b)=>a-b);
  if(!numbers.length){msg.textContent="Selecciona al menos un número disponible.";return}
  const params={p_first_name:String(form.get("first_name")).trim(),p_last_name:String(form.get("last_name")).trim(),p_phone:String(form.get("phone")).trim(),p_numbers:numbers};

  const btn=formEl.querySelector('button[type="submit"]');
  isSubmitting=true;btn.disabled=true;btn.textContent="Enviando…";msg.textContent="";
  let error=null;
  try{({error}=await supabaseClient.rpc("create_raffle_request",params))}
  catch(err){error=err||new Error("Error de conexión")}
  finally{isSubmitting=false;btn.disabled=false;btn.textContent="Enviar solicitud"}

  if(error){
    const m=String(error.message||"");
    msg.textContent=/already|not available|unavailable|no disponible/i.test(m)
      ?"Uno o más números ya no están disponibles. Revisa tu selección actualizada e inténtalo de nuevo."
      :(m||"No se pudo completar el registro. Inténtalo de nuevo.");
    await loadPublicData(); // el modal permanece abierto con la selección vigente
    return;
  }

  // Éxito: marca los números como pendientes de inmediato y luego sincroniza con Supabase.
  numbers.forEach(n=>{const r=numberRows.find(x=>Number(x.number)===n);if(r)r.status="pending"});
  selected.clear();formEl.reset();msg.textContent="";
  closeDialog("registration-modal");
  renderGrid();updateSelection();
  toast(SUCCESS_MESSAGE,6500);
  await loadPublicData();
});

async function loginAdmin(email,password){
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error)throw error;currentUser=data.user;
  const {data:allowed,error:roleError}=await supabaseClient.rpc("is_raffle_admin");
  if(roleError||!allowed){await supabaseClient.auth.signOut();currentUser=null;throw new Error("Este usuario no tiene permisos de administrador.");}
  $("admin-login-view").hidden=true;$("admin-dashboard").hidden=false;
  await loadAdminData();
}
$("admin-login-form").addEventListener("submit",async(e)=>{
  e.preventDefault();if(!supabaseClient){$("login-message").textContent="Configura primero Supabase en config.js.";return}
  const f=new FormData(e.currentTarget);
  try{await loginAdmin(String(f.get("email")),String(f.get("password")));$("login-message").textContent="";}catch(err){$("login-message").textContent=err.message}
});
$("admin-logout").addEventListener("click",async()=>{await supabaseClient.auth.signOut();currentUser=null;$("admin-dashboard").hidden=true;$("admin-login-view").hidden=false;toast("Sesión cerrada")});
$("refresh-admin").addEventListener("click",loadAdminData);

async function loadAdminData(){
  if(!supabaseClient||!currentUser)return;
  const {data,error}=await supabaseClient.from("raffle_requests").select("id,first_name,last_name,phone,created_at,status,total_amount,raffle_request_numbers(number)").order("created_at",{ascending:false});
  if(error){toast("No fue posible cargar las solicitudes.");console.error(error);return}
  adminRequests=data||[];renderAdminRequests();
  const confirmedNumbers=adminRequests.filter(r=>r.status==="confirmed").reduce((s,r)=>s+(r.raffle_request_numbers?.length||0),0);
  const revenue=adminRequests.filter(r=>r.status==="confirmed").reduce((s,r)=>s+Number(r.total_amount||0),0);
  $("admin-pending-total").textContent=adminRequests.filter(r=>r.status==="pending").length;
  $("admin-confirmed-total").textContent=confirmedNumbers;
  $("admin-revenue").textContent=money(revenue);
  const {data:cfg}=await supabaseClient.from("raffle_settings").select("*").eq("id",1).maybeSingle();
  if(cfg){settings=cfg;updateHeader();const f=$("settings-form");f.elements.title.value=cfg.title;f.elements.prize.value=cfg.prize;f.elements.draw_date.value=cfg.draw_date;f.elements.price.value=cfg.price;}
}
function renderAdminRequests(){
  const pending=adminRequests.filter(r=>r.status==="pending"),history=adminRequests.filter(r=>r.status!=="pending");
  $("pending-list").innerHTML=pending.length?"":"<p class='muted'>No hay solicitudes pendientes.</p>";
  $("history-list").innerHTML=history.length?"":"<p class='muted'>Aún no hay historial.</p>";
  pending.forEach(r=>$("pending-list").append(makeRequestCard(r,true)));
  history.forEach(r=>$("history-list").append(makeRequestCard(r,false)));
}
function makeRequestCard(r,canAct){
  const card=document.createElement("article");card.className="request-card";
  const nums=(r.raffle_request_numbers||[]).map(x=>String(x.number).padStart(2,"0")).join(", ");
  const head=document.createElement("div");head.className="request-head";
  const info=document.createElement("div"),name=document.createElement("h4");name.textContent=`${r.first_name} ${r.last_name}`;
  const p1=document.createElement("p");p1.textContent=`Celular: ${r.phone}`;
  const p2=document.createElement("p");p2.textContent=`Números: ${nums}`;
  const p3=document.createElement("p");p3.textContent=`Registro: ${new Date(r.created_at).toLocaleString("es-CO")} · Total: ${money(r.total_amount)}`;
  info.append(name,p1,p2,p3);const badge=document.createElement("span");badge.className=`status-pill ${r.status}`;badge.textContent=r.status==="pending"?"Pendiente":r.status==="confirmed"?"Confirmado":"Rechazado";head.append(info,badge);card.append(head);
  if(canAct){
    const actions=document.createElement("div");actions.className="request-actions";
    const approve=document.createElement("button");approve.className="button button-success";approve.textContent="Aprobar pago y confirmar números";approve.addEventListener("click",()=>approveRequest(r.id));
    const reject=document.createElement("button");reject.className="button button-danger";reject.textContent="Rechazar y liberar números";reject.addEventListener("click",()=>rejectRequest(r.id));
    actions.append(approve,reject);card.append(actions);
  }
  return card;
}
async function approveRequest(id){
  if(!confirm("¿Confirmaste la recepción del pago? Se confirmarán todos los números de esta solicitud."))return;
  const {error}=await supabaseClient.rpc("approve_raffle_request",{p_request_id:id});
  if(error){toast(error.message);return}
  toast("Pago aprobado y números confirmados.");await loadAdminData();await loadPublicData();
}
async function rejectRequest(id){
  if(!confirm("¿Rechazar esta solicitud y liberar todos sus números?"))return;
  const {error}=await supabaseClient.rpc("reject_raffle_request",{p_request_id:id});
  if(error){toast(error.message);return}
  toast("Solicitud rechazada y números liberados.");await loadAdminData();await loadPublicData();
}
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t===tab));
  $("tab-requests").hidden=tab.dataset.tab!=="requests";$("tab-settings").hidden=tab.dataset.tab!=="settings";
}));
$("settings-form").addEventListener("submit",async(e)=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  const payload={p_title:String(f.get("title")).trim(),p_prize:String(f.get("prize")).trim(),p_draw_date:String(f.get("draw_date")),p_price:Number(f.get("price"))};
  const {error}=await supabaseClient.rpc("update_raffle_settings",payload);
  $("settings-message").textContent=error?error.message:"Configuración guardada.";
  if(!error)await loadPublicData();
});

async function start(){
  updateHeader();renderGrid();updateSelection();
  if(!hasConfig){toast("Falta conectar Supabase: revisa config.js.");return}
  await loadPublicData();
  // Suscripción a cambios para refrescar el cartón en los navegadores abiertos.
  refreshChannel=supabaseClient.channel("public-raffle-updates")
    .on("postgres_changes",{event:"*",schema:"public",table:"raffle_numbers"},()=>loadPublicData())
    .subscribe();
}
start();
