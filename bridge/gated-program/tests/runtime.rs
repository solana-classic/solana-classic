//! Local in-process SVM tests with synthetic balances/keys. Not two networks,
//! real SOC, source-chain finality, or production security acceptance.
use borsh::BorshDeserialize;
use classic_bridge_program::state::*;
use litesvm::LiteSVM;
use solana_program::{clock::Clock,program_option::COption,program_pack::Pack,pubkey::Pubkey};
use solana_loader_v3_interface::state::UpgradeableLoaderState;
use solana_sdk::{account::Account,instruction::{AccountMeta,Instruction},signature::{Keypair,Signer},transaction::Transaction};
use solana_sdk_ids::{bpf_loader_upgradeable,system_program};
use spl_token_2022::state::{Account as TokenAccount,AccountState,Mint};
use std::path::Path;

fn call(svm:&mut LiteSVM,payer:&Keypair,program:Pubkey,accounts:Vec<AccountMeta>,data:BridgeInstruction,members:&[&Keypair])->bool {
    svm.expire_blockhash();
    let mut signers=vec![payer];for member in members {if member.pubkey()!=payer.pubkey(){signers.push(*member);}}
    let ix=Instruction{program_id:program,accounts,data:borsh::to_vec(&data).unwrap()};
    let tx=Transaction::new_signed_with_payer(&[ix],Some(&payer.pubkey()),&signers,svm.latest_blockhash());
    match svm.send_transaction(tx){Ok(_)=>true,Err(error)=>{eprintln!("Expected/observed runtime rejection: {:?}",error);false}}
}
fn account(svm:&mut LiteSVM,key:Pubkey,owner:Pubkey,data:Vec<u8>,executable:bool){
    svm.set_account(key,Account{lamports:svm.minimum_balance_for_rent_exemption(data.len()),owner,data,executable,..Account::default()}).unwrap();
}
fn install(svm:&mut LiteSVM,program:Pubkey,authority:Pubkey)->Pubkey{
    let elf=std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.tools/bridge-gated-artifacts/classic_bridge_gated_program.so")).expect("Build and externally select the separate gated SBF artifact before runtime tests");
    let checksum=solana_program::hash::hash(&elf).to_bytes().iter().map(|b|format!("{b:02x}")).collect::<String>();
    assert_eq!(checksum,include_str!("../artifact-sha256.txt").trim(),"Runtime tests require the selected separate gated artifact");
    let program_data=Pubkey::find_program_address(&[program.as_ref()],&bpf_loader_upgradeable::ID).0;
    let mut bytes=bincode::serialize(&UpgradeableLoaderState::ProgramData{slot:0,upgrade_authority_address:Some(authority)}).unwrap();
    bytes.resize(UpgradeableLoaderState::size_of_programdata_metadata(),0);bytes.extend_from_slice(&elf);
    account(svm,program_data,bpf_loader_upgradeable::ID,bytes,false);
    account(svm,program,bpf_loader_upgradeable::ID,bincode::serialize(&UpgradeableLoaderState::Program{programdata_address:program_data}).unwrap(),true);
    program_data
}
struct Side{svm:LiteSVM,program:Pubkey,state:Pubkey,vault:Pubkey,escrow:Pubkey,program_data:Pubkey,config:Config}
fn side(mode:u8,program:Pubkey,remote:Pubkey,mint:Pubkey,payer:&Keypair,committee:&[Keypair;5])->Side{
    let mut svm=LiteSVM::new();svm.airdrop(&payer.pubkey(),20_000_000_000).unwrap();
    let token_bytes=std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.tools/programs/spl_token_2022-v10.0.0.so")).expect("Install the checksum-pinned official Token-2022 v10 program");
    let checksum=solana_program::hash::hash(&token_bytes).to_bytes().iter().map(|b|format!("{b:02x}")).collect::<String>();
    assert_eq!(checksum,"a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68");
    svm.add_program(spl_token_2022::ID,&token_bytes).unwrap();
    let mut clock=svm.get_sysvar::<Clock>();clock.slot=20;clock.unix_timestamp=86_400;svm.set_sysvar(&clock);
    let program_data=install(&mut svm,program,payer.pubkey());
    let config=Config{magic:CONFIG_MAGIC,bridge:[1;32],local_chain:[if mode==ESCROW{2}else{3};32],remote_chain:[if mode==ESCROW{3}else{2};32],remote_program:remote.to_bytes(),origin_mint:mint.to_bytes(),committee:committee.each_ref().map(|k|k.pubkey().to_bytes()),origin_decimals:6,native_decimals:9,side:mode,threshold:3,epoch:1,new_locks_paused:true,settlement_paused:true,transfer_limit:2_000_000,daily_limit:4_000_000,day:0,daily_settled:0,outstanding:0};
    let state=Pubkey::find_program_address(&[b"config",&config.bridge],&program).0;
    let vault=Pubkey::find_program_address(&[b"vault",state.as_ref()],&program).0;
    let escrow=Pubkey::find_program_address(&[b"escrow",state.as_ref()],&program).0;
    if mode==ESCROW{
        let mut bytes=vec![0;Mint::LEN];Mint::pack(Mint{mint_authority:COption::None,supply:2_000_000,decimals:6,is_initialized:true,freeze_authority:COption::None},&mut bytes).unwrap();
        account(&mut svm,mint,spl_token_2022::ID,bytes,false);
    }
    for member in committee{svm.airdrop(&member.pubkey(),100_000_000).unwrap();}
    Side{svm,program,state,vault,escrow,program_data,config}
}
fn init_accounts(s:&Side,payer:&Keypair)->Vec<AccountMeta>{vec![
    AccountMeta::new(payer.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),
    AccountMeta::new(if s.config.side==ESCROW{s.escrow}else{payer.pubkey()},false),
    AccountMeta::new_readonly(if s.config.side==ESCROW{Pubkey::new_from_array(s.config.origin_mint)}else{payer.pubkey()},false),
    AccountMeta::new_readonly(spl_token_2022::ID,false),AccountMeta::new_readonly(system_program::ID,false),
    AccountMeta::new_readonly(s.program,false),AccountMeta::new_readonly(s.program_data,false)]}
fn initialize(s:&mut Side,payer:&Keypair){let accounts=init_accounts(s,payer);assert!(call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));}
fn append_gate(s:&Side,accounts:&mut Vec<AccountMeta>){
    if s.config.side!=NATIVE{return;}
    let record=Pubkey::find_program_address(&[b"bootstrap",s.state.as_ref()],&s.program).0;
    let Some(a)=s.svm.get_account(&record) else{return;};
    let Ok(b)=BootstrapRecord::try_from_slice(&a.data) else{return;};
    let consumed=Pubkey::find_program_address(&[b"claim",s.state.as_ref(),&b.source_event],&s.program).0;
    accounts.extend([AccountMeta::new_readonly(s.vault,false),AccountMeta::new_readonly(record,false),AccountMeta::new_readonly(consumed,false)]);
}
fn unpause(s:&mut Side,payer:&Keypair,members:&[&Keypair]) -> bool {
    let mut accounts=vec![AccountMeta::new(s.state,false)];accounts.extend(members.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));
    append_gate(s,&mut accounts);
    call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::SetPause{new_locks:false,settlement:false},members)
}
fn token_balance(s:&Side,key:Pubkey)->u64{TokenAccount::unpack(&s.svm.get_account(&key).unwrap().data).unwrap().amount}
fn set_token(s:&mut Side,key:Pubkey,owner:Pubkey,amount:u64){
    let mut data=vec![0;TokenAccount::LEN];TokenAccount::pack(TokenAccount{mint:Pubkey::new_from_array(s.config.origin_mint),owner,amount,delegate:COption::None,state:AccountState::Initialized,is_native:COption::None,delegated_amount:0,close_authority:COption::None},&mut data).unwrap();account(&mut s.svm,key,spl_token_2022::ID,data,false);
}
fn deposit(s:&mut Side,user:&Keypair,recipient:Pubkey,amount:u64,nonce:u64,source_token:Option<Pubkey>)->Option<Event>{
    let receipt=Pubkey::find_program_address(&[b"event",s.state.as_ref(),user.pubkey().as_ref(),&nonce.to_le_bytes()],&s.program).0;
    let mut accounts=vec![AccountMeta::new(user.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),AccountMeta::new(receipt,false),AccountMeta::new_readonly(system_program::ID,false)];
    if let Some(token)=source_token {accounts.extend([AccountMeta::new(token,false),AccountMeta::new(s.escrow,false),AccountMeta::new_readonly(Pubkey::new_from_array(s.config.origin_mint),false),AccountMeta::new_readonly(spl_token_2022::ID,false)]);}
    append_gate(s,&mut accounts);
    if !call(&mut s.svm,user,s.program,accounts,BridgeInstruction::Deposit{origin_amount:amount,nonce,recipient:recipient.to_bytes()},&[]){return None;}
    Some(Event::try_from_slice(&s.svm.get_account(&receipt).unwrap().data).unwrap())
}
fn claim(s:&mut Side,payer:&Keypair,event:Event,members:&[&Keypair],destination:Option<Pubkey>)->bool{
    let receipt=Pubkey::find_program_address(&[b"claim",s.state.as_ref(),&event.source_event],&s.program).0;
    let mut accounts=vec![AccountMeta::new(payer.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),AccountMeta::new(receipt,false),AccountMeta::new(Pubkey::new_from_array(event.recipient),false),AccountMeta::new_readonly(system_program::ID,false)];
    if let Some(token)=destination{accounts.extend([AccountMeta::new(s.escrow,false),AccountMeta::new(token,false),AccountMeta::new_readonly(Pubkey::new_from_array(s.config.origin_mint),false),AccountMeta::new_readonly(spl_token_2022::ID,false)]);}
    accounts.extend(members.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));
    append_gate(s,&mut accounts);
    call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::Claim(event),members)
}

fn boot_accounts(s:&Side,payer:&Keypair,event:&Event,members:&[&Keypair])->Vec<AccountMeta>{
    let receipt=Pubkey::find_program_address(&[b"claim",s.state.as_ref(),&event.source_event],&s.program).0;
    let record=Pubkey::find_program_address(&[b"bootstrap",s.state.as_ref()],&s.program).0;
    let mut accounts=vec![AccountMeta::new(payer.pubkey(),true),AccountMeta::new(s.state,false),
        AccountMeta::new(s.vault,false),AccountMeta::new(receipt,false),AccountMeta::new(record,false),
        AccountMeta::new_readonly(system_program::ID,false),AccountMeta::new_readonly(s.program,false),
        AccountMeta::new_readonly(s.program_data,false)];
    accounts.extend(members.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));accounts
}
fn bootstrap(s:&mut Side,payer:&Keypair,event:Event,witness:BootstrapWitness,members:&[&Keypair])->bool{
    let accounts=boot_accounts(s,payer,&event,members);
    call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::Bootstrap{event,witness},members)
}
// The witness describes a synthetic budget; it is NOT a total inventory of
// LiteSVM's injected balances/sysvars/fees. Test real Token-2022 source locking,
// cross-VM attestation admission and native state transitions, not genesis.
fn boot_fixture(payer:&Keypair,members:&[Keypair;5])->(Side,Side,Keypair,Pubkey,Keypair,Event,BootstrapWitness){
    let op=Pubkey::new_unique();let np=Pubkey::new_unique();let mint=Pubkey::new_unique();
    let mut origin=side(ESCROW,op,np,mint,payer,members);let mut native=side(NATIVE,np,op,mint,payer,members);
    initialize(&mut origin,payer);initialize(&mut native,payer);
    let source_user=Keypair::new();let recipient=Keypair::new();
    origin.svm.airdrop(&source_user.pubkey(),1_000_000_000).unwrap();native.svm.airdrop(&recipient.pubkey(),100_000_000).unwrap();
    let source=Pubkey::new_unique();set_token(&mut origin,source,source_user.pubkey(),2_000_000);
    assert!(unpause(&mut origin,payer,&[&members[0],&members[1],&members[2]]));
    let event=deposit(&mut origin,&source_user,native.vault,102_000,1,Some(source)).unwrap();
    let mut vault=native.svm.get_account(&native.vault).unwrap();vault.lamports=1_900_000_000;native.svm.set_account(native.vault,vault).unwrap();
    let witness=BootstrapWitness{audit_digest:[42;32],origin_supply:2_000_000,total_native:2_000_000_000,outside_native:100_000_000,reserve_native:1_900_000_000};
    (origin,native,source_user,source,recipient,event,witness)
}

#[test] fn gated_bootstrap_roundtrip_preserves_floor_and_consumed_backing(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (mut origin,mut native,user,source,recipient,event,witness)=boot_fixture(&payer,&members);
    let before=native.svm.get_balance(&native.vault).unwrap();let recipient_before=native.svm.get_balance(&recipient.pubkey()).unwrap();
    assert!(bootstrap(&mut native,&payer,event.clone(),witness.clone(),&q));
    assert_eq!(native.svm.get_balance(&native.vault).unwrap(),before);
    assert_eq!(native.svm.get_balance(&recipient.pubkey()).unwrap(),recipient_before);
    let c=Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap();assert_eq!(c.outstanding,102_000);assert!(c.settlement_paused);
    assert_eq!(Config::try_from_slice(&origin.svm.get_account(&origin.state).unwrap().data).unwrap().outstanding,c.outstanding);
    let record=Pubkey::find_program_address(&[b"bootstrap",native.state.as_ref()],&native.program).0;
    let saved=BootstrapRecord::try_from_slice(&native.svm.get_account(&record).unwrap().data).unwrap();
    assert_eq!(saved.witness,witness);assert_eq!(saved.source_event,event.source_event);assert_eq!(saved.protected_native,2_000_000);
    let receipt=Pubkey::find_program_address(&[b"claim",native.state.as_ref(),&event.source_event],&native.program).0;
    assert_eq!(native.svm.get_account(&receipt).unwrap().data,event.source_event);
    assert!(!bootstrap(&mut native,&payer,event.clone(),witness,&q));
    assert!(unpause(&mut native,&payer,&q));
    assert!(!claim(&mut native,&payer,event.clone(),&q,None));
    let mut altered=event.clone();altered.recipient=recipient.pubkey().to_bytes();assert!(!claim(&mut native,&payer,altered,&q,None),"same backing cannot authorize a second release even with a changed recipient");
    let next=deposit(&mut origin,&user,recipient.pubkey(),1_898_000,2,Some(source)).unwrap();
    let mut too_much=next.clone();too_much.origin_amount+=1;
    assert!(!claim(&mut native,&payer,too_much,&q,None),"protected backing stays reserved even above the rent-only floor");
    let next_receipt=Pubkey::find_program_address(&[b"claim",native.state.as_ref(),&next.source_event],&native.program).0;
    assert!(native.svm.get_account(&next_receipt).is_none(),"failed settlement rolls back receipt and counter");
    assert!(claim(&mut native,&payer,next,&q,None));assert_eq!(native.svm.get_balance(&native.vault).unwrap(),2_000_000);
    let returned=deposit(&mut native,&recipient,user.pubkey(),50_000,3,None).unwrap();
    assert!(claim(&mut origin,&payer,returned,&q,Some(source)));
    assert_eq!(token_balance(&origin,source),50_000);assert_eq!(token_balance(&origin,origin.escrow),1_950_000);
    assert_eq!(Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap().outstanding,1_950_000);
    assert_eq!(u64::from_le_bytes(native.svm.get_account(&native.vault).unwrap().data[8..].try_into().unwrap()),2_000_000);
}


#[test] fn gated_native_unpause_requires_bootstrap_but_emergency_pause_does_not(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,_,_,_)=boot_fixture(&payer,&members);
    let config=native.svm.get_account(&native.state).unwrap();let vault=native.svm.get_account(&native.vault).unwrap();
    for (new_locks,settlement) in [(false,false),(false,true),(true,false)]{
        let mut a=vec![AccountMeta::new(native.state,false)];a.extend(q.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));
        assert!(!call(&mut native.svm,&payer,native.program,a,BridgeInstruction::SetPause{new_locks,settlement},&q));
        assert_eq!(native.svm.get_account(&native.state).unwrap(),config);assert_eq!(native.svm.get_account(&native.vault).unwrap(),vault);
    }
    let mut a=vec![AccountMeta::new(native.state,false)];a.extend(q.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));
    assert!(call(&mut native.svm,&payer,native.program,a,BridgeInstruction::SetPause{new_locks:true,settlement:true},&q));
}
#[test] fn gated_native_claim_and_return_refuse_unbootstrapped_injected_unpaused_state(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,recipient,mut event,_)=boot_fixture(&payer,&members);
    let mut injected=native.svm.get_account(&native.state).unwrap();let mut c=Config::try_from_slice(&injected.data).unwrap();c.new_locks_paused=false;c.settlement_paused=false;c.outstanding=102_000;injected.data=borsh::to_vec(&c).unwrap();native.svm.set_account(native.state,injected.clone()).unwrap();
    let vault=native.svm.get_account(&native.vault).unwrap();event.recipient=recipient.pubkey().to_bytes();
    assert!(!claim(&mut native,&payer,event,&q,None));
    assert!(deposit(&mut native,&recipient,payer.pubkey(),1,9,None).is_none());
    assert_eq!(native.svm.get_account(&native.state).unwrap(),injected);assert_eq!(native.svm.get_account(&native.vault).unwrap(),vault);
}
#[test] fn gated_marker_receipt_and_floor_tampering_refuse_before_unpause(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,_,event,witness)=boot_fixture(&payer,&members);assert!(bootstrap(&mut native,&payer,event.clone(),witness,&q));
    let record=Pubkey::find_program_address(&[b"bootstrap",native.state.as_ref()],&native.program).0;
    let consumed=Pubkey::find_program_address(&[b"claim",native.state.as_ref(),&event.source_event],&native.program).0;
    let marker=native.svm.get_account(&record).unwrap();let receipt=native.svm.get_account(&consumed).unwrap();let vault=native.svm.get_account(&native.vault).unwrap();let config=native.svm.get_account(&native.state).unwrap();
    for i in 0..8{
        let mut m=marker.clone();let mut v=vault.clone();let mut r=receipt.clone();
        match i{0=>m.owner=system_program::ID,1=>m.data[0]^=1,2=>{m.data.pop();},3=>m.data[8..40].fill(0),4=>m.data[112]^=1,5=>r.owner=system_program::ID,6=>r.data[0]^=1,_=>v.data[8]^=1}
        native.svm.set_account(record,m).unwrap();native.svm.set_account(consumed,r).unwrap();native.svm.set_account(native.vault,v.clone()).unwrap();
        let mut a=vec![AccountMeta::new(native.state,false)];a.extend(q.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));a.extend([AccountMeta::new_readonly(native.vault,false),AccountMeta::new_readonly(record,false),AccountMeta::new_readonly(consumed,false)]);
        assert!(!call(&mut native.svm,&payer,native.program,a,BridgeInstruction::SetPause{new_locks:false,settlement:false},&q));assert_eq!(native.svm.get_account(&native.state).unwrap(),config);assert_eq!(native.svm.get_account(&native.vault).unwrap(),v);
        native.svm.set_account(record,marker.clone()).unwrap();native.svm.set_account(consumed,receipt.clone()).unwrap();native.svm.set_account(native.vault,vault.clone()).unwrap();
    }
    assert!(unpause(&mut native,&payer,&q));
}
#[test] fn gated_valid_bootstrap_still_requires_quorum_and_exact_trailer(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,_,event,witness)=boot_fixture(&payer,&members);assert!(bootstrap(&mut native,&payer,event,witness,&q));
    let saved=native.svm.get_account(&native.state).unwrap();assert!(!unpause(&mut native,&payer,&q[..2]));assert!(!unpause(&mut native,&payer,&[q[0],q[0],q[1]]));
    let mut a=vec![AccountMeta::new(native.state,false)];a.extend(q.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));append_gate(&native,&mut a);
    let last=a.len()-1;a[last]=AccountMeta::new_readonly(payer.pubkey(),false);
    assert!(!call(&mut native.svm,&payer,native.program,a,BridgeInstruction::SetPause{new_locks:false,settlement:false},&q));
    assert_eq!(native.svm.get_account(&native.state).unwrap(),saved);assert!(unpause(&mut native,&payer,&q));
}

// Cross-language construction under a bounded outer driver. Inputs are only
// public synthetic account bytes; private keys stay in the Rust VM process.
fn client_wire(s:&Side,payer:&Keypair,members:&[&Keypair],action:&str,event:Option<&Event>,recipient:Pubkey,amount:u64,nonce:u64,bootstrap_event:Pubkey)->Option<Instruction>{
    use std::{io::Write,process::{Command,Stdio}};
    let hex=|b:&[u8]|b.iter().map(|v|format!("{v:02x}")).collect::<String>();
    let sha=|b:&[u8]|hex(&solana_program::hash::hash(b).to_bytes());
    let config=s.svm.get_account(&s.state).unwrap();
    let record=Pubkey::find_program_address(&[b"bootstrap",s.state.as_ref()],&s.program).0;
    let record_bytes=s.svm.get_account(&record).map(|a|a.data).unwrap_or_default();
    let data=s.svm.get_account(&s.program_data).unwrap();let authority=Pubkey::new_from_array(data.data[13..45].try_into().unwrap());
    let e=event.map(|e|borsh::to_vec(e).unwrap()).unwrap_or_default();
    let selected=members.iter().map(|m|format!("\"{}\"",m.pubkey())).collect::<Vec<_>>().join(",");
    let request=format!(r#"{{"configurationHex":"{}","program":"{}","programDataSHA256":"{}","upgradeAuthority":"{}","recordHex":"{}","expectedRecordSHA256":"{}","expectedSourceEvent":"{}","minimumRent":"{}","action":"{}","actor":"{}","committee":[{}],"eventHex":"{}","recipient":"{}","originAmount":"{}","nonce":"{}"}}"#,hex(&config.data),s.program,sha(&data.data),authority,hex(&record_bytes),sha(&record_bytes),bootstrap_event,s.svm.minimum_balance_for_rent_exemption(16),action,payer.pubkey(),selected,hex(&e),recipient,amount,nonce);
    let script=Path::new(env!("CARGO_MANIFEST_DIR")).join("../rehearsal/gated-native-wire.mjs");
    let mut child=Command::new("node").arg(script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(request.as_bytes()).unwrap();let output=child.wait_with_output().unwrap();
    if !output.status.success(){return None;}
    assert!(output.stdout.len()<65536);let text=String::from_utf8(output.stdout).unwrap();let mut lines=text.lines();
    let program_id=lines.next().unwrap().parse().unwrap();let data=lines.next().unwrap();assert!(data.len()<=1024 && data.len()%2==0);
    let bytes=data.as_bytes().chunks(2).map(|v|u8::from_str_radix(std::str::from_utf8(v).unwrap(),16).unwrap()).collect();
    let keys=lines.map(|l|{let (k,f)=l.split_once(' ').unwrap();assert!(f.len()==2 && f.bytes().all(|b|b==b'0'||b==b'1'));AccountMeta{pubkey:k.parse().unwrap(),is_signer:f.as_bytes()[0]==b'1',is_writable:f.as_bytes()[1]==b'1'}}).collect::<Vec<_>>();assert!(keys.len()<=12);
    Some(Instruction{program_id,accounts:keys,data:bytes})
}
fn send_client(s:&mut Side,payer:&Keypair,members:&[&Keypair],ix:Instruction)->bool{
    s.svm.expire_blockhash();let mut signers=vec![payer];for m in members{if m.pubkey()!=payer.pubkey(){signers.push(*m);}}
    let tx=Transaction::new_signed_with_payer(&[ix],Some(&payer.pubkey()),&signers,s.svm.latest_blockhash());s.svm.send_transaction(tx).is_ok()
}
#[test] fn gated_js_client_wire_roundtrip_and_emergency_pause(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (mut origin,mut native,user,source,recipient,boot,witness)=boot_fixture(&payer,&members);let boot_event=Pubkey::new_from_array(boot.source_event);
    let before=native.svm.get_account(&native.state).unwrap();assert!(client_wire(&native,&payer,&q,"unpause",None,payer.pubkey(),0,0,boot_event).is_none());assert_eq!(native.svm.get_account(&native.state).unwrap(),before);
    assert!(bootstrap(&mut native,&payer,boot,witness,&q));
    let ix=client_wire(&native,&payer,&q,"unpause",None,payer.pubkey(),0,0,boot_event).unwrap();assert_eq!(ix.accounts.len(),7);assert!(send_client(&mut native,&payer,&q,ix));
    let locked=deposit(&mut origin,&user,recipient.pubkey(),50_000,2,Some(source)).unwrap();
    let ix=client_wire(&native,&payer,&q,"claim",Some(&locked),recipient.pubkey(),0,0,boot_event).unwrap();assert_eq!(ix.accounts.len(),12);assert!(send_client(&mut native,&payer,&q,ix.clone()));
    let saved=native.svm.get_account(&native.vault).unwrap();assert!(!send_client(&mut native,&payer,&q,ix));assert_eq!(native.svm.get_account(&native.vault).unwrap(),saved);
    let ix=client_wire(&native,&recipient,&q,"return",None,user.pubkey(),25_000,7,boot_event).unwrap();assert_eq!(ix.accounts.len(),8);assert!(send_client(&mut native,&recipient,&[],ix));
    let event_key=Pubkey::find_program_address(&[b"event",native.state.as_ref(),recipient.pubkey().as_ref(),&7u64.to_le_bytes()],&native.program).0;
    let returned=Event::try_from_slice(&native.svm.get_account(&event_key).unwrap().data).unwrap();assert!(claim(&mut origin,&payer,returned,&q,Some(source)));
    assert_eq!(token_balance(&origin,origin.escrow),127_000);assert_eq!(token_balance(&origin,source),1_873_000);
    assert_eq!(Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap().outstanding,127_000);assert_eq!(native.svm.get_balance(&native.vault).unwrap(),1_875_000_000);
    assert_eq!(u64::from_le_bytes(native.svm.get_account(&native.vault).unwrap().data[8..16].try_into().unwrap()),2_000_000);
    let ix=client_wire(&native,&payer,&q,"full-pause",None,payer.pubkey(),0,0,boot_event).unwrap();assert_eq!(ix.accounts.len(),4);assert!(send_client(&mut native,&payer,&q,ix));
    let c=Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap();assert!(c.new_locks_paused&&c.settlement_paused);
}
