// Only ONE declaration at the very top!
let currentUser = null;

function showOutput(msg) {
  document.getElementById('output').innerText = msg;
}

// Set up event handlers only after HTML elements are loaded
document.getElementById('loginBtn').onclick = function () {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .catch(err => showOutput('Login failed: ' + err.message));
};

document.getElementById('logoutBtn').onclick = function() {
  firebase.auth().signOut();
};

// Listen for authentication state changes
firebase.auth().onAuthStateChanged(function(user) {
  currentUser = user;
  if (user) {
    document.getElementById('loggedIn').style.display = '';
    document.getElementById('loggedOut').style.display = 'none';
    document.getElementById('currentName').textContent = user.displayName || '';
    showOutput('Ready.');
  } else {
    document.getElementById('loggedIn').style.display = 'none';
    document.getElementById('loggedOut').style.display = '';
    showOutput('Please log in!');
  }
});

// --- SOS Button ---
$.sosBtn.onclick = async function () {
  if (!currentUser) return showOutput('Log in first.');
  if (!navigator.geolocation) return showOutput('Geolocation not supported in this browser.');

  showOutput('Getting your location...');
  navigator.geolocation.getCurrentPosition(async function(pos) {
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, time: Date.now() };
    // get contacts
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const contacts = doc.exists ? (doc.data().emergencyContacts || []) : [];
    await db.collection('sosRecords').add({
      userUid: currentUser.uid, userName: currentUser.displayName, location: loc, contacts: contacts, timestamp: Date.now()
    });
    let msg = `🚨 SOS sent!\nLocation: ${loc.lat}, ${loc.lng}\n`;
    msg += contacts.length ? `Notified contacts:\n${contacts.map(c=> `${c.name}: ${c.phone}`).join('\n')}` : '(No contacts found)';
    showOutput(msg);
  }, err => showOutput('Location error: ' + err.message));
};

// --- Emergency Contact Features ---
async function loadContacts() {
  if(!currentUser) return;
  const doc = await db.collection('users').doc(currentUser.uid).get();
  window.myContacts = doc.exists && doc.data().emergencyContacts ? doc.data().emergencyContacts : [];
}
$.contactsBtn.onclick = async function () {
  if (!currentUser) return showOutput('Log in first.');
  const name = prompt('Contact name?');
  const phone = prompt('Contact phone (with country code, e.g. +91)?');
  if (!name || !phone) return showOutput('Name & phone required.');
  const contact = { name, phone };
  await db.collection('users').doc(currentUser.uid).set(
    { emergencyContacts: firebase.firestore.FieldValue.arrayUnion(contact) }, { merge: true }
  );
  await loadContacts();
  showOutput('Added contact: ' + name);
};
$.listContactsBtn.onclick = async function() {
  if (!currentUser) return showOutput('Log in first.');
  await loadContacts();
  showOutput('Your contacts:\n' + (myContacts.length ? myContacts.map(c=>`${c.name} (${c.phone})`).join('\n') : '(No contacts added)'));
};

// --- Journey Features ---
$.logJourneyBtn.onclick = async function () {
  if (!currentUser) return showOutput('Log in first.');
  const vehiclePlate = prompt('Vehicle Number Plate:');
  const driverName = prompt('Driver Name:');
  const driverPhone = prompt('Driver Phone:');
  if (!vehiclePlate || !driverName || !driverPhone) return showOutput('All journey details required.');
  await db.collection('journeys').add({
    userUid: currentUser.uid, vehiclePlate, driverName, driverPhone, timestamp: Date.now()
  });
  showOutput('Journey logged: ' + vehiclePlate);
};
$.listJourneysBtn.onclick = async function() {
  if (!currentUser) return showOutput('Log in first.');
  const snaps = await db.collection('journeys').where('userUid', '==', currentUser.uid).orderBy('timestamp','desc').limit(10).get();
  if(snaps.empty) return showOutput('No journeys logged!');
  let out = 'Your recent journeys:\n';
  snaps.forEach(doc=>{
    let j = doc.data();
    out += `• ${j.vehiclePlate} | ${j.driverName} | 📞${j.driverPhone}\n`;
  });
  showOutput(out);
};

// --- SOS Records ---
$.listSOSBtn.onclick = async function() {
  if (!currentUser) return showOutput('Log in first.');
  const snaps = await db.collection('sosRecords').where('userUid', '==', currentUser.uid).orderBy('timestamp','desc').limit(10).get();
  if(snaps.empty) return showOutput('No SOS sent yet!');
  let out = 'Your SOS records:\n';
  snaps.forEach(doc=>{
    let s = doc.data();
    let d = new Date(s.timestamp).toLocaleString();
    out += `• ${d} at (${s.location.lat},${s.location.lng})\n`;
  });
  showOutput(out);
};

// --- Fake Call ---
$.fakeCallBtn.onclick = function() {
  // You can use your own audio file (put in /assets/), or online link:
  let audio = new Audio("https://cdn.pixabay.com/audio/2022/07/26/audio_124bfa41f7.mp3"); // Example ringtone
  audio.play();
  showOutput('Fake call: Pretend your phone is ringing!');
};

// --- Alarm Button ---
$.alarmBtn.onclick = function() {
  let audio = new Audio("https://cdn.pixabay.com/audio/2022/08/20/audio_12c7b0e7c9.mp3"); // Example loud alarm
  audio.play();
  showOutput('Alarm activated! Attention drawn.');
};

// --- Safe/Unsafe Places ---
function tagPlace(type) {
  if (!currentUser) return showOutput('Log in first.');
  if (!navigator.geolocation) return showOutput('Geolocation not supported.');
  navigator.geolocation.getCurrentPosition(async function(pos) {
    const tag = {
      userUid: currentUser.uid,
      type: type,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      time: Date.now()
    };
    await db.collection('places').add(tag);
    showOutput(`${type === 'safe' ? 'Safe' : 'Unsafe'} place tagged at ${tag.lat}, ${tag.lng}`);
  }, err => showOutput('Location error: ' + err.message));
}
$.tagSafeBtn.onclick = ()=> tagPlace('safe');
$.tagUnsafeBtn.onclick = ()=> tagPlace('unsafe');

$.viewSafePlacesBtn.onclick = async function() {
  if (!currentUser) return showOutput('Log in first.');
  let msg = 'Your tagged places:\n';
  const snaps = await db.collection('places').where('userUid','==',currentUser.uid).orderBy('time','desc').limit(10).get();
  if (snaps.empty) return showOutput('No places tagged yet!');
  snaps.forEach(doc=>{
    let p = doc.data();
    let t = new Date(p.time).toLocaleString();
    msg += `• [${p.type}] (${p.lat.toFixed(4)},${p.lng.toFixed(4)}) at ${t}\n`;
  });
  showOutput(msg);
};

// --- Ready! ---
window.onload = ()=>showLoggedInUI(false);