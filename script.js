// --- Bootstrap ---
const $ = id => document.getElementById(id);


function showOutput(msg) {
  $('output').innerText = msg;
}

// --- Auth ---
$('loginBtn').onclick = function() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .catch(err => showOutput('Login failed: ' + err.message));
};
$('logoutBtn').onclick = function() {
  firebase.auth().signOut();
};
auth.onAuthStateChanged(async (user)=>{
  currentUser = user;
  if(user){
    $('loginBtn').style.display = "none";
    $('userPanel').style.display = "";
    $('userName').innerText = "Welcome, " + user.displayName;
    $("mainUI").style.display="";
    await loadGuardians();
    await showOnMap();
  } else{
    $('loginBtn').style.display = "";
    $('userPanel').style.display = "none";
    $("mainUI").style.display="none";
    showOutput("Please log in.");
  }
});

// ==== 3. SOS Feature with WhatsApp Alert ====
$('sosBtn').onclick = ()=>{
  if(!currentUser) return showOutput("Log in first.");
  if(!navigator.geolocation) return showOutput('Geolocation not supported.');
  showOutput("Grabbing location...");
  navigator.geolocation.getCurrentPosition(async pos=>{
    let lat = pos.coords.latitude, lng = pos.coords.longitude;
    await db.collection("sosRecords").add({
      user: currentUser.displayName,
      uid: currentUser.uid,
      lat, lng,
      time: Date.now()
    });
    showOutput("🆘 SOS Sent! Notifying guardians...");

    // WhatsApp alert to all guardians
    if(window.myGuardians && myGuardians.length){
      let msg = encodeURIComponent(`SOS! I need help. My location: https://maps.google.com/?q=${lat},${lng}`);
      myGuardians.forEach(g =>
        window.open(`https://wa.me/${g.phone.replace(/\D/g,"")}?text=${msg}`,'_blank')
      );
    } else {
      showOutput("No guardians to notify! SOS location saved.");
    }
  },err=>{
    showOutput("Unable to get location: "+err.message);
  });
};

// Add Guardian
$('addGuardianBtn').onclick = async ()=>{
  if(!currentUser) return showOutput("Log in first.");
  let name = prompt("Guardian name?");
  let phone = prompt("Guardian phone (country code, no plus, e.g. 919999999999):");
  if(!name || !phone) return showOutput("Name & phone required.");
  let g = {name, phone};
  await db.collection("users").doc(currentUser.uid).set({
    guardians: firebase.firestore.FieldValue.arrayUnion(g)
  },{merge:true});
  await loadGuardians();
  showOutput("Guardian added: " + name);
};

// List Guardians
window.myGuardians = [];
async function loadGuardians(){
  if(!currentUser) return;
  let d = await db.collection("users").doc(currentUser.uid).get();
  window.myGuardians = (d.exists && d.data().guardians) ? d.data().guardians : [];
}
$('listGuardiansBtn').onclick = async ()=>{
  await loadGuardians();
  if(myGuardians.length === 0) showOutput("No guardians yet. Add some!");
  else showOutput("Guardians:\n" + myGuardians.map(g=>`${g.name}: ${g.phone}`).join("\n"));
};
// ==== 5. Journey Log/History ====
$('logJourneyBtn').onclick = async ()=>{
  if(!currentUser) return showOutput("Log in first.");
  let plate = prompt("Vehicle Plate:");
  let driver = prompt("Driver Name:");
  let driverPhone = prompt("Driver Phone:");
  if(!plate || !driver || !driverPhone) return showOutput("All details required.");
  await db.collection("journeys").add({
    uid: currentUser.uid, plate, driver, driverPhone, time: Date.now()
  });
  showOutput("Journey logged for " + plate);
};
$('listJourneysBtn').onclick = async ()=>{
  if(!currentUser) return showOutput("Log in first.");
  let snaps = await db.collection("journeys")
    .where("uid","==",currentUser.uid)
    .orderBy("time","desc").limit(8).get();
  if(snaps.empty) return showOutput("No journeys found!");
  let msg = "Recent journeys:\n";
  snaps.forEach(d=>{
    let j = d.data(), t = new Date(j.time).toLocaleString();
    msg += `• (${t}) ${j.plate} - ${j.driver} (${j.driverPhone})\n`;
  });
  showOutput(msg);
};

// ==== 6. Map: Show Location + Markers for Safe/Unsafe Places ====
async function showOnMap(){
  if(!currentUser || !window.google) return;
  let mapDiv = $("map");
  let map = new google.maps.Map(mapDiv, {
    zoom: 13, center: {lat:28.6139, lng:77.2090}
  });
  // Set user current location
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      let myLatLng = {lat: pos.coords.latitude, lng: pos.coords.longitude};
      map.setCenter(myLatLng);
      new google.maps.Marker({position:myLatLng, map, label: 'Me'});
    });
  }
  // Show tagged places for this user
  let pl = await db.collection("places").where("uid","==",currentUser.uid).get();
  pl.forEach(doc=>{
    let d = doc.data();
    new google.maps.Marker({
      position: {lat: d.lat, lng: d.lng},
      map,
      label: d.type==='safe'? 'S':'U',
      icon: d.type==='safe'? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png':'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
    });
  });
}

// Tag safe
$('tagSafeBtn').onclick = () => tagPlace('safe');
$('tagUnsafeBtn').onclick = () => tagPlace('unsafe');
function tagPlace(type){
  if(!currentUser) return showOutput("Log in first.");
  if(!navigator.geolocation) return showOutput('Geolocation not supported.');
  navigator.geolocation.getCurrentPosition(async pos=>{
    let lat = pos.coords.latitude, lng = pos.coords.longitude;
    await db.collection("places").add({uid:currentUser.uid, type, lat, lng, time: Date.now()});
    showOutput(`${type==='safe'?'Safe':'Unsafe'} place tagged: (${lat.toFixed(4)},${lng.toFixed(4)})`);
    showOnMap();
  },err=>showOutput("Unable to tag: "+err.message));
}

// ==== 7. Fake Call & Alarm ====
$('fakeCallBtn').onclick = function() {
  let call = new Audio("https://cdn.pixabay.com/audio/2022/07/26/audio_124bfa41f7.mp3");
  call.play().then(()=>showOutput('Fake call ringing!'))
    .catch(err=>showOutput("Can't play sound: " + err));
};
$('alarmBtn').onclick = function() {
  let alarm = new Audio("https://cdn.pixabay.com/audio/2022/08/20/audio_12c7b0e7c9.mp3");
  alarm.play().then(()=>showOutput('Alarm sounding!'))
    .catch(err=>showOutput("Can't play sound: " + err));
};




