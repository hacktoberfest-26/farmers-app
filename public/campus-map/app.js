const $ = id => document.getElementById(id);
const CAMPUS = [45.5657,12.4379];
const map = L.map('map',{zoomControl:false}).setView(CAMPUS,17);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
L.control.scale({imperial:false}).addTo(map);
L.marker(CAMPUS,{icon:L.divIcon({className:'campus-pin',html:'↗ H-FARM Campus',iconAnchor:[70,20]})}).addTo(map).bindPopup('H-FARM Campus<br>Via Adriano Olivetti, 1<br><small>Approximate campus reference point</small>');
let currentAccuracy=0;
let watch=null, demoTimer=null, marker=null, ring=null, last=null, following=true, demo=false, installPrompt=null;
function banner(message){$('banner').textContent=message;$('banner').hidden=!message;}
function clearTracking(){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;clearInterval(demoTimer);demoTimer=null;}
function clearPosition(){if(marker)map.removeLayer(marker);if(ring)map.removeLayer(ring);marker=ring=last=null;$('accuracy').innerHTML='— <i>m</i>';$('updated').textContent='—';}
function stop(){parent.postMessage({type:"farmers-position",fix:null},location.origin);clearTracking();clearPosition();demo=false;$('mode').textContent='STOPPED';$('status').textContent='Location paused.';$('message').textContent='Your position has been cleared. Start again whenever you’re ready.';$('stop').hidden=true;$('locate').textContent='⌖  Use my location';banner('');}
function receive(position){parent.postMessage({type:'farmers-position',fix:{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,simulated:demo}},location.origin);const c=position.coords;currentAccuracy=c.accuracy;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy))return;last={lat:c.latitude,lng:c.longitude,time:position.timestamp};const point=[c.latitude,c.longitude];if(!ring){ring=L.circle(point,{radius:c.accuracy,color:'#287de7',weight:1,fillColor:'#287de7',fillOpacity:.12}).addTo(map);marker=L.marker(point,{icon:L.divIcon({className:'farmer-marker self',html:'<div class=farmer-pin><img src=../brand/farmer-giulia-saluta.svg alt=You><strong>You</strong></div>',iconSize:[70,80],iconAnchor:[35,65]})}).addTo(map);}else{ring.setLatLng(point).setRadius(c.accuracy);marker.setLatLng(point);}if(following)map.setView(point,Math.max(map.getZoom(),17));const distance=map.distance(point,CAMPUS);$('mode').textContent=demo?'SIMULATED':'LIVE GPS';$('status').textContent=demo?'A walk around campus.':distance>850?'You’re away from campus.':c.accuracy>80?'Finding a clearer signal…':'You’re near H-FARM.';$('message').textContent=demo?'Demo location only. Start live GPS to find your actual position.':distance>850?`${(distance/1000).toFixed(1)} km from the campus reference point. Tap H-FARM Campus to explore it.`:'The blue ring shows your location’s uncertainty. A smaller ring means a better fix.';$('accuracy').innerHTML=`±${Math.round(c.accuracy)} <i>m</i>`;$('stop').hidden=false;banner(demo?'DEMO WALK · Simulated position, not your real location.':c.accuracy>80?'Weak GPS accuracy. Try moving outdoors with a clear view of the sky.':'');updateAge();}
function updateAge(){if(!last)return;const age=Math.max(0,Math.floor((Date.now()-last.time)/1000));$('updated').textContent=age<2?'Just now':`${age}s ago`;if(age>30&&!demo){$('mode').textContent='STALE FIX';banner('Location is stale. Waiting for a fresh GPS fix…');}}
setInterval(updateAge,1000);
$('locate').onclick=()=>{clearTracking();clearPosition();demo=false;following=true;banner('');if(!window.isSecureContext||!navigator.geolocation){$('status').textContent='Location unavailable.';$('message').textContent='Open this app over HTTPS in a browser that supports location.';return;}$('status').textContent='Finding your position…';$('message').textContent='Allow precise location when your browser asks.';$('mode').textContent='CONNECTING';$('stop').hidden=false;watch=navigator.geolocation.watchPosition(receive,error=>{$('status').textContent=error.code===1?'Location permission is off.':'No fresh GPS signal.';$('message').textContent=error.code===1?'Allow location in your browser’s site settings, then try again. You can still explore the campus.':'Move outdoors and try again. Your device may need a moment to find a signal.';$('mode').textContent='NO SIGNAL';if(error.code===1){clearTracking();clearPosition();$('stop').hidden=true;}banner(last?'The displayed position is an older fix.':'Try the demo walk to explore without GPS.');},{enableHighAccuracy:true,maximumAge:0,timeout:20000});};
$('stop').onclick=stop;
$('demo').onclick=()=>{clearTracking();clearPosition();demo=true;following=true;let step=0;function tick(){const t=step++/16;receive({coords:{latitude:CAMPUS[0]+.0006*Math.sin(t),longitude:CAMPUS[1]+.0009*Math.cos(t),accuracy:7},timestamp:Date.now()});}tick();demoTimer=setInterval(tick,1400);};
map.on('dragstart',()=>{following=false;});
$('campus').onclick=()=>{following=false;map.setView(CAMPUS,17);};
$('follow').onclick=()=>{following=true;if(last)map.setView([last.lat,last.lng],18);else $('locate').click();};
$('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();
function network(){$('connection').textContent=navigator.onLine?'ONLINE MAP':'OFFLINE';if(!navigator.onLine)banner('You’re offline. The app is available; map tiles need an internet connection.');else if(!demo)banner('');}window.addEventListener('online',network);window.addEventListener('offline',network);network();
tiles.on('tileerror',()=>{if(!demo)banner('Some map tiles could not load. Check your internet connection.');});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else{document.querySelector('details').open=true;document.querySelector('details').scrollIntoView({behavior:'smooth'});}};

window.addEventListener('pagehide',clearTracking);

const peopleLayer=L.layerGroup().addTo(map);
let matchedPeople=[];
let mapMarkers=[];
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||!event.data)return;
 if(event.data.type==='farmers-people'&&Array.isArray(event.data.people)){
  matchedPeople=event.data.people.filter(p=>p.location&&Date.now()-p.location.updatedAt<120000);peopleLayer.clearLayers();mapMarkers=[];
  for(const person of matchedPeople){
   const p=person.location;if(!p||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude))continue;
   const bubble=document.createElement('div');bubble.className='farmer-pin';
   const img=document.createElement('img');img.src='../brand/farmer-marco.svg';img.alt='';bubble.append(img);
   const label=document.createElement('strong');label.textContent=person.name;bubble.append(label);
   const pin=L.marker([p.latitude,p.longitude],{icon:L.divIcon({className:'farmer-marker',html:bubble,iconSize:[70,80],iconAnchor:[35,65]})}).addTo(peopleLayer);
   mapMarkers.push({pin,updatedAt:p.updatedAt});
   const detail=document.createElement('div');detail.textContent=person.name+' · '+(p.simulated?'SIMULATED':'GPS')+' ±'+Math.round(p.accuracy)+' m';pin.bindPopup(detail);
  }
 }
 if(event.data.type==='farmers-focus'){
  const person=matchedPeople.find(p=>p.matchId===event.data.matchId);if(person){following=false;map.setView([person.location.latitude,person.location.longitude],18);}
 }
});
setInterval(()=>{if(last&&Date.now()-last.time<20000)parent.postMessage({type:'farmers-position',fix:{latitude:last.lat,longitude:last.lng,accuracy:currentAccuracy,simulated:demo}},location.origin);},10000);
parent.postMessage({type:'farmers-ready'},location.origin);

setInterval(()=>{for(const entry of mapMarkers){if(Date.now()-entry.updatedAt>=120000)peopleLayer.removeLayer(entry.pin);}matchedPeople=matchedPeople.filter(p=>Date.now()-p.location.updatedAt<120000);},5000);
