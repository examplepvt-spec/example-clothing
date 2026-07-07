import { auth, db } from "./firebase.js";

import {
createUserWithEmailAndPassword,
signInWithEmailAndPassword,
signOut,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
doc,
setDoc,
getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// REGISTER
export async function register(name, email, password){

const userCredential =
await createUserWithEmailAndPassword(
auth,
email,
password
);

await setDoc(
doc(db,"customers",userCredential.user.uid),
{
name:name,
email:email,
createdAt:new Date().toISOString()
});

return userCredential.user;

}

// LOGIN
export async function login(email,password){

const userCredential =
await signInWithEmailAndPassword(
auth,
email,
password
);

return userCredential.user;

}

// LOGOUT
export async function logout(){

await signOut(auth);

}

// CURRENT USER
export function checkUser(callback){

onAuthStateChanged(auth,(user)=>{

callback(user);

});

}
export async function getProfile(uid){

const snap = await getDoc(doc(db,"customers",uid));

if(snap.exists()){
return snap.data();
}

return null;

}
