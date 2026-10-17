import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { targetFor, checkBrowserStorage, viewportFor, retryableReadFailure, checkRuntime, checkMint, checkArtwork, receipt } from './final-browser-regression.mjs';
const freeze=JSON.parse(readFileSync(new URL('../../evidence/candidate-freeze.json',import.meta.url)));
const mint='GyEHcTHL2dA2DTgzRctA34E1JsXhp54UdvSmJehKLTYt';
test('independent read retry cannot bless RPC,HTTP429,metadata or identity failures',()=>{assert(retryableReadFailure(new TypeError('fetch failed')));assert(retryableReadFailure({name:'TimeoutError'}));for(const e of [new Error('429'),new Error('Genesis changed'),new SyntaxError('JSON'),new TypeError('Wrong mint'),{name:'AbortError'},null])assert.equal(retryableReadFailure(e),false);});
test('full journey profiles are fixed, mobile uses touch and narrow360px viewport',()=>{assert.deepEqual(viewportFor('mobile'),{width:360,height:844,isMobile:true,hasTouch:true});assert.equal(viewportFor('desktop').width,1440);for(const p of ['mainnet',360,'__proto__','constructor','',null])assert.throws(()=>viewportFor(p));});
function fixture(){return {owner:'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',data:{parsed:{type:'mint',info:{supply:'1',decimals:0,mintAuthority:null,freezeAuthority:null,extensions:[{extension:'metadataPointer',state:{authority:null,metadataAddress:mint}},{extension:'tokenMetadata',state:{updateAuthority:null,mint,name:'QA',uri:'https://network-release-production.up.railway.app/assets/'+'a'.repeat(64)+'/metadata.json'}}]}}}};}
test('fixed valueless targets only, no arbitrary endpoint or prototype lookup',()=>{assert.equal(targetFor('custom').web,'https://solanaclassic.net');assert.equal(targetFor('frozen').web,freeze.candidate.frontendOrigin);for(const name of ['https://api.mainnet-beta.solana.com','mainnet','__proto__','constructor',''])assert.throws(()=>targetFor(name));});
test('every original runtime identity must match before any test action',()=>{assert.doesNotThrow(()=>checkRuntime(freeze.runtime));for(const key of ['genesis','sourceCommit','coreSha256','apiBootId','validatorBootId','deploymentId','tokenProgramSha256'])assert.throws(()=>checkRuntime({...freeze.runtime,[key]:'changed'}));});
test('receipt must be a fresh relative explorer transaction link',()=>{const signature='2'.repeat(88);assert.equal(receipt('/explorer/tx/'+signature),signature);for(const href of [null,'/explorer/address/'+mint,'https://mainnet.example/tx/'+signature,'/explorer/tx/abc','/explorer/tx/'+signature+'?secret=1'])assert.throws(()=>receipt(href));});
test('immutable NFT metadata checks exact programme,supply,precision and authority',()=>{assert.equal(checkMint(fixture(),mint,'nft','QA').name,'QA');for(const [key,value] of [['supply','2'],['decimals',6],['mintAuthority',mint],['freezeAuthority',mint]]){const account=fixture();account.data.parsed.info[key]=value;assert.throws(()=>checkMint(account,mint,'nft','QA'));}});
test('meme precision and exact fixed supply do not inherit NFT acceptance',()=>{assert.throws(()=>checkMint(fixture(),mint,'meme','QA'));const account=fixture();account.data.parsed.info.supply='1000000000000';account.data.parsed.info.decimals=6;assert.doesNotThrow(()=>checkMint(account,mint,'meme','QA'));});
test('wrong pointer,mutable metadata,unexpected name or public metadata origin rejects',()=>{for(const change of ['pointer','authority','name','uri']){const account=fixture(),extensions=account.data.parsed.info.extensions;if(change==='pointer')extensions[0].state.metadataAddress='other';if(change==='authority')extensions[1].state.updateAuthority=mint;if(change==='name')extensions[1].state.name='other';if(change==='uri')extensions[1].state.uri='https://solana.com/metadata.json';assert.throws(()=>checkMint(account,mint,'nft','QA'));}});
test('artwork cannot select another host,asset directory,credentials or query',()=>{const metadata='https://network-release-production.up.railway.app/assets/'+'a'.repeat(64)+'/metadata.json';const image=metadata.replace('metadata.json','image.svg');assert.equal(checkArtwork(image,metadata,false),image);for(const uri of ['http://127.0.0.1/image.svg',image+'?secret=1',image.replace('a'.repeat(64),'b'.repeat(64)),image.replace('image.svg','image.png')])assert.throws(()=>checkArtwork(uri,metadata,false));const account=fixture();account.data.parsed.info.extensions[1].state.uri=metadata.replace('https://','https://name:credential@');assert.throws(()=>checkMint(account,mint,'nft','QA'));});

test('storage rule permits only the exact branded panel preference and keeps frozen storage empty',()=>{
 const empty={localKeys:[],sessionLength:0,panelPreference:null};
 assert.equal(checkBrowserStorage('frozen',empty).localStorageEmpty,true);
 for(const value of ['open','closed'])assert.equal(checkBrowserStorage('custom',{localKeys:['classic.wallet.panel'],sessionLength:0,panelPreference:value}).onlyPanelPreference,true);
 assert.throws(()=>checkBrowserStorage('custom',empty));
 assert.throws(()=>checkBrowserStorage('frozen',{localKeys:['classic.wallet.panel'],sessionLength:0,panelPreference:'closed'}));
});
test('storage rule rejects extra keys, unknown preference values, session entries and malformed snapshots',()=>{
 const valid={localKeys:['classic.wallet.panel'],sessionLength:0,panelPreference:'closed'};
 for(const change of [{localKeys:['classic.wallet.panel','wallet']},{localKeys:['wallet']},{panelPreference:'secret'},{panelPreference:null},{sessionLength:1},{sessionLength:'0'},{sessionLength:false},{localKeys:null}])assert.throws(()=>checkBrowserStorage('custom',{...valid,...change}));
 for(const name of ['__proto__','mainnet',''])assert.throws(()=>checkBrowserStorage(name,valid));
 assert.throws(()=>checkBrowserStorage('custom',null));
});
