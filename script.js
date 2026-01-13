// --- Bootstrap ---
const $ = id => document.getElementById(id);
let currentUser = null;

// TEST: Prove $ works!
console.log('Testing $ shortcut:', $('loginBtn'));
showOutput('If you see this text, $ is working!');

function showOutput(msg) {
  if(document.getElementById('output')) {
    document.getElementById('output').innerText = msg;
  }
}

// UI: show section
function showLoggedInUI(show) {
  $.loggedIn.style.display = show ? '' : 'none';
  $.loggedOut.style.display = show ? 'none' : '';
  if(show) $.currentName.textContent = currentUser.displayName || '';
}

// Utility to show output/status/messages
function showOutput(msg) {
  $.output.innerText = msg;
}

// --- Authentication ---
$.loginBtn.onclick = function () {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .catch(err => showOutput('Login failed: ' + err.message));
};

$.logoutBtn.onclick = function() {
  firebase.auth().signOut();
};

firebase.auth().onAuthStateChanged(async function(user) {
  currentUser = user;
  showLoggedInUI(!!currentUser);
  if(currentUser) showOutput('Ready.'), await loadContacts();
  else showOutput('Please log in!');
});

// --- Updated SOS Button with Contact Sharing ---
$.sosBtn.onclick = async function () {
  if (!currentUser) return showOutput('Log in first.');
  if (!navigator.geolocation) return showOutput('Geolocation not supported in this browser.');

  showOutput('Fetching emergency location...');

  navigator.geolocation.getCurrentPosition(async function(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const timestamp = new Date().toLocaleString();

    // 1. Log the SOS event to Firebase
    await db.collection('sosRecords').add({
      userUid: currentUser.uid,
      userName: currentUser.displayName,
      location: { lat, lng },
      time: Date.now()
    });

    // 2. Fetch your saved emergency contacts
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const contacts = doc.exists ? (doc.data().emergencyContacts || []) : [];

    if (contacts.length === 0) {
      showOutput('SOS logged, but no emergency contacts found to notify.');
      return;
    }

    // 3. Prepare the message for sharing
    const message = encodeURIComponent(
      `🚨 EMERGENCY SOS! I need help. \nMy Location: ${mapsUrl} \nSent at: ${timestamp}`
    );

    // 4. Send to the first contact via WhatsApp
    // Note: The phone number must include the country code (e.g., 919876543210)
    const primaryContact = contacts[0].phone; 
    const shareUrl = `https://wa.me/${primaryContact}?text=${message}`;

    showOutput('Location captured! Opening sharing app...');
    
    // Opens the WhatsApp sharing link in a new tab/app
    window.open(shareUrl, '_blank');

  }, (err) => {
    showOutput('Location error: ' + err.message);
  }, { enableHighAccuracy: true });
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









