// --- Bootstrap ---
const $ = id => document.getElementById(id);
let currentUser = null;

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
firebase.auth().onAuthStateChanged(async function(user) {
  currentUser = user;
  if (user) {
    $('loggedIn').style.display = '';
    $('loggedOut').style.display = 'none';
    $('currentName').innerText = user.displayName || '';
    showOutput('Welcome, '+user.displayName+'!');
    await loadContacts();
  } else {
    $('loggedOut').style.display = '';
    $('loggedIn').style.display = 'none';
    showOutput('Please log in.');
  }
});

// --- SOS Emergency ---
$('sosBtn').onclick = async function () {
  if (!currentUser) return showOutput('Log in first.');
  if (!navigator.geolocation) return showOutput('Geolocation not supported.');
  showOutput('Fetching your location...');
  navigator.geolocation.getCurrentPosition(async function(pos) {
    const location = { lat: pos.coords.latitude, lng: pos.coords.longitude, time: Date.now() };
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const contacts = doc.exists ? (doc.data().emergencyContacts || []) : [];
    await db.collection('sosRecords').add({
      userUid: currentUser.uid, userName: currentUser.displayName,
      location, contacts, timestamp: Date.now()
    });
    let msg = `🆘 SOS sent! Location: ${location.lat}, ${location.lng}\n`;
    msg += contacts.length ? `Notified contacts:\n${contacts.map(c=>`${c.name} (${c.phone})`).join('\n')}` : '(No contacts found)';
    showOutput(msg);
  }, err => showOutput('Could not get location: '+err.message));
};

// --- Alarm ---
$('alarmBtn').onclick = function() {
  let alarm = new Audio("https://cdn.pixabay.com/audio/2022/08/20/audio_12c7b0e7c9.mp3");
  alarm.play();
  showOutput('Alarm activated!');
};

// --- Fake Call ---
$('fakeCallBtn').onclick = function() {
  let call = new Audio("https://cdn.pixabay.com/audio/2022/07/26/audio_124bfa41f7.mp3");
  call.play();
  showOutput('Fake call ringing!');
};

// --- Tag Place ---
function tagPlace(type) {
  if (!currentUser) return showOutput('Log in first.');
  if (!navigator.geolocation) return showOutput('Geolocation not supported.');
  navigator.geolocation.getCurrentPosition(async function(pos) {
    let tag = {
      userUid: currentUser.uid, type,
      lat: pos.coords.latitude, lng: pos.coords.longitude, time: Date.now()
    };
    await db.collection('places').add(tag);
    showOutput(`${type==='safe'?'Safe':'Unsafe'} place tagged at ${tag.lat}, ${tag.lng}`);
  }, err => showOutput('Could not get location: '+err.message));
}
$('tagSafeBtn').onclick = ()=> tagPlace('safe');
$('tagUnsafeBtn').onclick = ()=> tagPlace('unsafe');
$('viewSafePlacesBtn').onclick = async function(){
  if(!currentUser) return showOutput('Log in first.');
  let snaps = await db.collection('places').where('userUid','==',currentUser.uid).orderBy('time','desc').limit(10).get();
  if(snaps.empty) return showOutput('No places tagged yet!');
  let msg = 'Your tagged places:\n';
  snaps.forEach(doc=>{
    let p = doc.data();
    let t = new Date(p.time).toLocaleString();
    msg += `• [${p.type}] (${p.lat.toFixed(4)},${p.lng.toFixed(4)}) at ${t}\n`;
  });
  showOutput(msg);
};

// --- Contacts ---
async function loadContacts() {
  if(!currentUser) return;
  let doc = await db.collection('users').doc(currentUser.uid).get();
  window.myContacts = doc.exists && doc.data().emergencyContacts ? doc.data().emergencyContacts : [];
}
$('contactsBtn').onclick = async function(){
  if(!currentUser) return showOutput('Log in first.');
  let name = prompt('Contact name?');
  let phone = prompt('Contact phone (with country code)?');
  if(!name || !phone) return showOutput('Name & phone required.');
  const contact = {name, phone};
  await db.collection('users').doc(currentUser.uid).set(
    {emergencyContacts: firebase.firestore.FieldValue.arrayUnion(contact)},
    {merge:true}
  );
  await loadContacts();
  showOutput('Added: '+name);
};
$('listContactsBtn').onclick = async function(){
  if(!currentUser) return showOutput('Log in first.');
  await loadContacts();
  showOutput('Your contacts:\n' + (myContacts.length ? myContacts.map(c=>`${c.name} (${c.phone})`).join('\n') : 'None yet.'));
};

// --- Journey ---
$('logJourneyBtn').onclick = async function(){
  if(!currentUser) return showOutput('Log in first.');
  let plate = prompt('Vehicle Plate:');
  let driver = prompt('Driver Name:');
  let driverPhone = prompt('Driver Phone:');
  if(!plate || !driver || !driverPhone) return showOutput('All details required.');
  await db.collection('journeys').add({
    userUid: currentUser.uid, vehiclePlate: plate, driverName:driver, driverPhone, timestamp: Date.now()
  });
  showOutput('Journey logged: '+plate);
};
$('listJourneysBtn').onclick = async function(){
  if(!currentUser) return showOutput('Log in first.');
  let snaps = await db.collection('journeys').where('userUid','==',currentUser.uid).orderBy('timestamp','desc').limit(10).get();
  if(snaps.empty) return showOutput('No journeys logged!');
  let msg = 'Your journeys:\n';
  snaps.forEach(doc=>{
    let j = doc.data();
    msg += `• ${j.vehiclePlate} | ${j.driverName} | ${j.driverPhone}\n`;
  });
  showOutput(msg);
};

// --- SOS History ---
$('listSOSBtn').onclick = async function(){
  if(!currentUser) return showOutput('Log in first.');
  let snaps = await db.collection('sosRecords').where('userUid','==',currentUser.uid).orderBy('timestamp','desc').limit(10).get();
  if(snaps.empty) return showOutput('No SOS sent yet!');
  let msg = 'Your SOS records:\n';
  snaps.forEach(doc=>{
    let s = doc.data();
    let d = new Date(s.timestamp).toLocaleString();
    msg += `• ${d} (${s.location.lat},${s.location.lng})\n`;
  });
  showOutput(msg);
};
