import{r as t,_ as e,C as n,a,Q as i,F as r,R as o,g as s,c,S as u,T as l,U as d,V as f,W as p,X as m,Y as h}from"./firebase-vendor-474e35fa.js";const g="@firebase/installations",w="0.6.19",y=1e4,I=`w:${w}`,b="FIS_v2",v="https://firebaseinstallations.googleapis.com/v1",T=36e5,S=new i("installations","Installations",{"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."});function C(t){return t instanceof r&&t.code.includes("request-failed")}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function k({projectId:t}){return`${v}/projects/${t}/installations`}function $(t){return{token:t.token,requestStatus:2,expiresIn:(e=t.expiresIn,Number(e.replace("s","000"))),creationTime:Date.now()};var e}async function P(t,e){const n=(await e.json()).error;return S.create("request-failed",{requestName:t,serverCode:n.code,serverMessage:n.message,serverStatus:n.status})}function D({apiKey:t}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":t})}function A(t,{refreshToken:e}){const n=D(t);return n.append("Authorization",function(t){return`${b} ${t}`}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */(e)),n}async function F(t){const e=await t();return e.status>=500&&e.status<600?t():e}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
function j(t){return new Promise((e=>{setTimeout(e,t)}))}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const M=/^[cdef][\w-]{21}$/,q="";function x(){try{const t=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(t),t[0]=112+t[0]%16;const e=function(t){const e=(n=t,btoa(String.fromCharCode(...n)).replace(/\+/g,"-").replace(/\//g,"_"));var n;return e.substr(0,22)}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */(t);return M.test(e)?e:q}catch{return q}}function E(t){return`${t.appName}!${t.appId}`}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const z=new Map;function N(t,e){const n=E(t);_(n,e),function(t,e){const n=function(){!L&&"BroadcastChannel"in self&&(L=new BroadcastChannel("[Firebase] FID Change"),L.onmessage=t=>{_(t.data.key,t.data.fid)});return L}();n&&n.postMessage({key:t,fid:e});0===z.size&&L&&(L.close(),L=null)}(n,e)}function _(t,e){const n=z.get(t);if(n)for(const a of n)a(e)}let L=null;
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const K="firebase-installations-database",O=1,U="firebase-installations-store";let R=null;function B(){return R||(R=o(K,O,{upgrade:(t,e)=>{if(0===e)t.createObjectStore(U)}})),R}async function V(t,e){const n=E(t),a=(await B()).transaction(U,"readwrite"),i=a.objectStore(U),r=await i.get(n);return await i.put(e,n),await a.done,r&&r.fid===e.fid||N(t,e.fid),e}async function H(t){const e=E(t),n=(await B()).transaction(U,"readwrite");await n.objectStore(U).delete(e),await n.done}async function G(t,e){const n=E(t),a=(await B()).transaction(U,"readwrite"),i=a.objectStore(U),r=await i.get(n),o=e(r);return void 0===o?await i.delete(n):await i.put(o,n),await a.done,!o||r&&r.fid===o.fid||N(t,o.fid),o}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function W(t){let e;const n=await G(t.appConfig,(n=>{const a=function(t){const e=t||{fid:x(),registrationStatus:0};return X(e)}(n),i=function(t,e){if(0===e.registrationStatus){if(!navigator.onLine){return{installationEntry:e,registrationPromise:Promise.reject(S.create("app-offline"))}}const n={fid:e.fid,registrationStatus:1,registrationTime:Date.now()},a=async function(t,e){try{const n=await async function({appConfig:t,heartbeatServiceProvider:e},{fid:n}){const a=k(t),i=D(t),r=e.getImmediate({optional:!0});if(r){const t=await r.getHeartbeatsHeader();t&&i.append("x-firebase-client",t)}const o={fid:n,authVersion:b,appId:t.appId,sdkVersion:I},s={method:"POST",headers:i,body:JSON.stringify(o)},c=await F((()=>fetch(a,s)));if(c.ok){const t=await c.json();return{fid:t.fid||n,registrationStatus:2,refreshToken:t.refreshToken,authToken:$(t.authToken)}}throw await P("Create Installation",c)}(t,e);return V(t.appConfig,n)}catch(n){throw C(n)&&409===n.customData.serverCode?await H(t.appConfig):await V(t.appConfig,{fid:e.fid,registrationStatus:0}),n}}(t,n);return{installationEntry:n,registrationPromise:a}}return 1===e.registrationStatus?{installationEntry:e,registrationPromise:J(t)}:{installationEntry:e}}(t,a);return e=i.registrationPromise,i.installationEntry}));return n.fid===q?{installationEntry:await e}:{installationEntry:n,registrationPromise:e}}async function J(t){let e=await Q(t.appConfig);for(;1===e.registrationStatus;)await j(100),e=await Q(t.appConfig);if(0===e.registrationStatus){const{installationEntry:e,registrationPromise:n}=await W(t);return n||e}return e}function Q(t){return G(t,(t=>{if(!t)throw S.create("installation-not-found");return X(t)}))}function X(t){return 1===(e=t).registrationStatus&&e.registrationTime+y<Date.now()?{fid:t.fid,registrationStatus:0}:t;var e;
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */}async function Y({appConfig:t,heartbeatServiceProvider:e},n){const a=function(t,{fid:e}){return`${k(t)}/${e}/authTokens:generate`}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */(t,n),i=A(t,n),r=e.getImmediate({optional:!0});if(r){const t=await r.getHeartbeatsHeader();t&&i.append("x-firebase-client",t)}const o={installation:{sdkVersion:I,appId:t.appId}},s={method:"POST",headers:i,body:JSON.stringify(o)},c=await F((()=>fetch(a,s)));if(c.ok){return $(await c.json())}throw await P("Generate Auth Token",c)}async function Z(t,e=!1){let n;const a=await G(t.appConfig,(a=>{if(!et(a))throw S.create("not-registered");const i=a.authToken;if(!e&&function(t){return 2===t.requestStatus&&!function(t){const e=Date.now();return e<t.creationTime||t.creationTime+t.expiresIn<e+T}(t)}(i))return a;if(1===i.requestStatus)return n=async function(t,e){let n=await tt(t.appConfig);for(;1===n.authToken.requestStatus;)await j(100),n=await tt(t.appConfig);const a=n.authToken;return 0===a.requestStatus?Z(t,e):a}(t,e),a;{if(!navigator.onLine)throw S.create("app-offline");const e=function(t){const e={requestStatus:1,requestTime:Date.now()};return{...t,authToken:e}}(a);return n=async function(t,e){try{const n=await Y(t,e),a={...e,authToken:n};return await V(t.appConfig,a),n}catch(n){if(!C(n)||401!==n.customData.serverCode&&404!==n.customData.serverCode){const n={...e,authToken:{requestStatus:0}};await V(t.appConfig,n)}else await H(t.appConfig);throw n}}(t,e),e}}));return n?await n:a.authToken}function tt(t){return G(t,(t=>{if(!et(t))throw S.create("not-registered");const e=t.authToken;return 1===(n=e).requestStatus&&n.requestTime+y<Date.now()?{...t,authToken:{requestStatus:0}}:t;var n;
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */}))}function et(t){return void 0!==t&&2===t.registrationStatus}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
async function nt(t,e=!1){const n=t;await async function(t){const{registrationPromise:e}=await W(t);e&&await e}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */(n);return(await Z(n,e)).token}function at(t){return S.create("missing-app-config-values",{valueName:t})}
/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const it="installations",rt=t=>{const e=t.getProvider("app").getImmediate(),n=a(e,it).getImmediate();return{getId:()=>async function(t){const e=t,{installationEntry:n,registrationPromise:a}=await W(e);return a?a.catch(console.error):Z(e).catch(console.error),n.fid}(n),getToken:t=>nt(n,t)}};e(new n(it,(t=>{const e=t.getProvider("app").getImmediate(),n=function(t){if(!t||!t.options)throw at("App Configuration");if(!t.name)throw at("App Name");const e=["projectId","apiKey","appId"];for(const n of e)if(!t.options[n])throw at(n);return{appName:t.name,projectId:t.options.projectId,apiKey:t.options.apiKey,appId:t.options.appId}}(e);return{app:e,appConfig:n,heartbeatServiceProvider:a(e,"heartbeat"),_delete:()=>Promise.resolve()}}),"PUBLIC")),e(new n("installations-internal",rt,"PRIVATE")),t(g,w),t(g,w,"esm2020");
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const ot="analytics",st="firebase_id",ct="origin",ut=6e4,lt="https://firebase.googleapis.com/v1alpha/projects/-/apps/{app-id}/webConfig",dt="https://www.googletagmanager.com/gtag/js",ft=new m("@firebase/analytics"),pt=new i("analytics","Analytics",{"already-exists":"A Firebase Analytics instance with the appId {$id}  already exists. Only one Firebase Analytics instance can be created for each appId.","already-initialized":"initializeAnalytics() cannot be called again with different options than those it was initially called with. It can be called again with the same options to return the existing instance, or getAnalytics() can be used to get a reference to the already-initialized instance.","already-initialized-settings":"Firebase Analytics has already been initialized.settings() must be called before initializing any Analytics instanceor it will have no effect.","interop-component-reg-failed":"Firebase Analytics Interop Component failed to instantiate: {$reason}","invalid-analytics-context":"Firebase Analytics is not supported in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","indexeddb-unavailable":"IndexedDB unavailable or restricted in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","fetch-throttle":"The config fetch request timed out while in an exponential backoff state. Unix timestamp in milliseconds when fetch request throttling ends: {$throttleEndTimeMillis}.","config-fetch-failed":"Dynamic config fetch failed: [{$httpStatus}] {$responseMessage}","no-api-key":'The "apiKey" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid API key.',"no-app-id":'The "appId" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid app ID.',"no-client-id":'The "client_id" field is empty.',"invalid-gtag-resource":"Trusted Types detected an invalid gtag resource: {$gtagURL}."});
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
function mt(t){if(!t.startsWith(dt)){const e=pt.create("invalid-gtag-resource",{gtagURL:t});return ft.warn(e.message),""}return t}function ht(t){return Promise.all(t.map((t=>t.catch((t=>t)))))}function gt(t,e){const n=function(t,e){let n;return window.trustedTypes&&(n=window.trustedTypes.createPolicy(t,e)),n}("firebase-js-sdk-policy",{createScriptURL:mt}),a=document.createElement("script"),i=`${dt}?l=${t}&id=${e}`;a.src=n?n?.createScriptURL(i):i,a.async=!0,document.head.appendChild(a)}function wt(t,e,n,a){return async function(i,...r){try{if("event"===i){const[a,i]=r;await async function(t,e,n,a,i){try{let r=[];if(i&&i.send_to){let t=i.send_to;Array.isArray(t)||(t=[t]);const a=await ht(n);for(const n of t){const t=a.find((t=>t.measurementId===n)),i=t&&e[t.appId];if(!i){r=[];break}r.push(i)}}0===r.length&&(r=Object.values(e)),await Promise.all(r),t("event",a,i||{})}catch(r){ft.error(r)}}(t,e,n,a,i)}else if("config"===i){const[i,o]=r;await async function(t,e,n,a,i,r){const o=a[i];try{if(o)await e[o];else{const t=(await ht(n)).find((t=>t.measurementId===i));t&&await e[t.appId]}}catch(s){ft.error(s)}t("config",i,r)}(t,e,n,a,i,o)}else if("consent"===i){const[e,n]=r;t("consent",e,n)}else if("get"===i){const[e,n,a]=r;t("get",e,n,a)}else if("set"===i){const[e]=r;t("set",e)}else t(i,...r)}catch(o){ft.error(o)}}}
/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const yt=30;const It=new class{constructor(t={},e=1e3){this.throttleMetadata=t,this.intervalMillis=e}getThrottleMetadata(t){return this.throttleMetadata[t]}setThrottleMetadata(t,e){this.throttleMetadata[t]=e}deleteThrottleMetadata(t){delete this.throttleMetadata[t]}};function bt(t){return new Headers({Accept:"application/json","x-goog-api-key":t})}async function vt(t,e=It,n){const{appId:a,apiKey:i,measurementId:r}=t.options;if(!a)throw pt.create("no-app-id");if(!i){if(r)return{measurementId:r,appId:a};throw pt.create("no-api-key")}const o=e.getThrottleMetadata(a)||{backoffCount:0,throttleEndTimeMillis:Date.now()},s=new St;return setTimeout((async()=>{s.abort()}),void 0!==n?n:ut),Tt({appId:a,apiKey:i,measurementId:r},o,s,e)}async function Tt(t,{throttleEndTimeMillis:e,backoffCount:n},a,i=It){const{appId:o,measurementId:s}=t;try{await function(t,e){return new Promise(((n,a)=>{const i=Math.max(e-Date.now(),0),r=setTimeout(n,i);t.addEventListener((()=>{clearTimeout(r),a(pt.create("fetch-throttle",{throttleEndTimeMillis:e}))}))}))}(a,e)}catch(c){if(s)return ft.warn(`Timed out fetching this Firebase app's measurement ID from the server. Falling back to the measurement ID ${s} provided in the "measurementId" field in the local Firebase config. [${c?.message}]`),{appId:o,measurementId:s};throw c}try{const e=await async function(t){const{appId:e,apiKey:n}=t,a={method:"GET",headers:bt(n)},i=lt.replace("{app-id}",e),r=await fetch(i,a);if(200!==r.status&&304!==r.status){let t="";try{const e=await r.json();e.error?.message&&(t=e.error.message)}catch(o){}throw pt.create("config-fetch-failed",{httpStatus:r.status,responseMessage:t})}return r.json()}(t);return i.deleteThrottleMetadata(o),e}catch(c){const e=c;if(!function(t){if(!(t instanceof r&&t.customData))return!1;const e=Number(t.customData.httpStatus);return 429===e||500===e||503===e||504===e}(e)){if(i.deleteThrottleMetadata(o),s)return ft.warn(`Failed to fetch this Firebase app's measurement ID from the server. Falling back to the measurement ID ${s} provided in the "measurementId" field in the local Firebase config. [${e?.message}]`),{appId:o,measurementId:s};throw c}const u=503===Number(e?.customData?.httpStatus)?h(n,i.intervalMillis,yt):h(n,i.intervalMillis),l={throttleEndTimeMillis:Date.now()+u,backoffCount:n+1};return i.setThrottleMetadata(o,l),ft.debug(`Calling attemptFetch again in ${u} millis`),Tt(t,l,a,i)}}class St{constructor(){this.listeners=[]}addEventListener(t){this.listeners.push(t)}abort(){this.listeners.forEach((t=>t()))}}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Ct,kt;function $t(t){kt=t}function Pt(t){Ct=t}
/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Dt(t,e,n,a,i,r,o){const s=vt(t);s.then((e=>{n[e.measurementId]=e.appId,t.options.measurementId&&e.measurementId!==t.options.measurementId&&ft.warn(`The measurement ID in the local Firebase config (${t.options.measurementId}) does not match the measurement ID fetched from the server (${e.measurementId}). To ensure analytics events are always sent to the correct Analytics property, update the measurement ID field in the local config or remove it from the local config.`)})).catch((t=>ft.error(t))),e.push(s);const c=async function(){if(!f())return ft.warn(pt.create("indexeddb-unavailable",{errorInfo:"IndexedDB is not available in this environment."}).message),!1;try{await p()}catch(t){return ft.warn(pt.create("indexeddb-unavailable",{errorInfo:t?.toString()}).message),!1}return!0}().then((t=>t?a.getId():void 0)),[u,l]=await Promise.all([s,c]);(function(t){const e=window.document.getElementsByTagName("script");for(const n of Object.values(e))if(n.src&&n.src.includes(dt)&&n.src.includes(t))return n;return null})(r)||gt(r,u.measurementId),kt&&(i("consent","default",kt),$t(void 0)),i("js",new Date);const d=o?.config??{};return d[ct]="firebase",d.update=!0,null!=l&&(d[st]=l),i("config",u.measurementId,d),Ct&&(i("set",Ct),Pt(void 0)),u.measurementId}
/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class At{constructor(t){this.app=t}_delete(){return delete Ft[this.app.options.appId],Promise.resolve()}}let Ft={},jt=[];const Mt={};let qt,xt,Et="dataLayer",zt="gtag",Nt=!1;function _t(t){if(Nt)throw pt.create("already-initialized");t.dataLayerName&&(Et=t.dataLayerName),t.gtagName&&(zt=t.gtagName)}function Lt(t,e,n){!function(){const t=[];if(l()&&t.push("This is a browser extension environment."),d()||t.push("Cookies are not available."),t.length>0){const e=t.map(((t,e)=>`(${e+1}) ${t}`)).join(" "),n=pt.create("invalid-analytics-context",{errorInfo:e});ft.warn(n.message)}}();const a=t.options.appId;if(!a)throw pt.create("no-app-id");if(!t.options.apiKey){if(!t.options.measurementId)throw pt.create("no-api-key");ft.warn(`The "apiKey" field is empty in the local Firebase config. This is needed to fetch the latest measurement ID for this Firebase app. Falling back to the measurement ID ${t.options.measurementId} provided in the "measurementId" field in the local Firebase config.`)}if(null!=Ft[a])throw pt.create("already-exists",{id:a});if(!Nt){!function(t){let e=[];Array.isArray(window[t])?e=window[t]:window[t]=e}(Et);const{wrappedGtag:t,gtagCore:e}=function(t,e,n,a,i){let r=function(...t){window[a].push(arguments)};return window[i]&&"function"==typeof window[i]&&(r=window[i]),window[i]=wt(r,t,e,n),{gtagCore:r,wrappedGtag:window[i]}}(Ft,jt,Mt,Et,zt);xt=t,qt=e,Nt=!0}Ft[a]=Dt(t,jt,Mt,e,qt,Et,n);return new At(t)}function Kt(t=c()){t=s(t);const e=a(t,ot);return e.isInitialized()?e.getImmediate():Ot(t)}function Ot(t,e={}){const n=a(t,ot);if(n.isInitialized()){const t=n.getImmediate();if(u(e,n.getOptions()))return t;throw pt.create("already-initialized")}return n.initialize({options:e})}async function Ut(){if(l())return!1;if(!d())return!1;if(!f())return!1;try{return await p()}catch(t){return!1}}function Rt(t,e,n){t=s(t),async function(t,e,n,a){if(a&&a.global)return t("set",{screen_name:n}),Promise.resolve();t("config",await e,{update:!0,screen_name:n})}(xt,Ft[t.app.options.appId],e,n).catch((t=>ft.error(t)))}async function Bt(t){return t=s(t),async function(t,e){const n=await e;return new Promise(((e,a)=>{t("get",n,"client_id",(t=>{t||a(pt.create("no-client-id")),e(t)}))}))}(xt,Ft[t.app.options.appId])}function Vt(t,e,n){t=s(t),async function(t,e,n,a){if(a&&a.global)return t("set",{user_id:n}),Promise.resolve();t("config",await e,{update:!0,user_id:n})}(xt,Ft[t.app.options.appId],e,n).catch((t=>ft.error(t)))}function Ht(t,e,n){t=s(t),async function(t,e,n,a){if(a&&a.global){const e={};for(const t of Object.keys(n))e[`user_properties.${t}`]=n[t];return t("set",e),Promise.resolve()}t("config",await e,{update:!0,user_properties:n})}(xt,Ft[t.app.options.appId],e,n).catch((t=>ft.error(t)))}function Gt(t,e){t=s(t),async function(t,e){const n=await t;window[`ga-disable-${n}`]=!e}(Ft[t.app.options.appId],e).catch((t=>ft.error(t)))}function Wt(t){xt?xt("set",t):Pt(t)}function Jt(t,e,n,a){t=s(t),async function(t,e,n,a,i){if(i&&i.global)t("event",n,a);else{const i=await e;t("event",n,{...a,send_to:i})}}(xt,Ft[t.app.options.appId],e,n,a).catch((t=>ft.error(t)))}function Qt(t){xt?xt("consent","update",t):$t(t)}const Xt="@firebase/analytics",Yt="0.10.18";e(new n(ot,((t,{options:e})=>Lt(t.getProvider("app").getImmediate(),t.getProvider("installations-internal").getImmediate(),e)),"PUBLIC")),e(new n("analytics-internal",(function(t){try{const e=t.getProvider(ot).getImmediate();return{logEvent:(t,n,a)=>Jt(e,t,n,a)}}catch(e){throw pt.create("interop-component-reg-failed",{reason:e})}}),"PRIVATE")),t(Xt,Yt),t(Xt,Yt,"esm2020");export{Kt as getAnalytics,Bt as getGoogleAnalyticsClientId,Ot as initializeAnalytics,Ut as isSupported,Jt as logEvent,Gt as setAnalyticsCollectionEnabled,Qt as setConsent,Rt as setCurrentScreen,Wt as setDefaultEventParameters,Vt as setUserId,Ht as setUserProperties,_t as settings};
//# sourceMappingURL=index.esm-1b9174e2.js.map
