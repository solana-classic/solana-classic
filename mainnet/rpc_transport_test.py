"""Actual loopback HTTP fixtures only; no validator, keys or real chain calls."""
import contextlib,importlib.util,json,os,threading,time,unittest,urllib.error
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('consensus_transport_subject',Path(__file__).with_name('consensus.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

@contextlib.contextmanager
def endpoint(reply,port=0):
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_GET(self):self.handle_request()
  def do_POST(self):self.handle_request()
  def handle_request(self):
   body=self.rfile.read(int(self.headers.get('Content-Length','0')))
   self.server.requests.append({'method':self.command,'path':self.path,'body':body})
   reply(self)
 class Server(ThreadingHTTPServer):allow_reuse_address=True;daemon_threads=True
 server=Server(('127.0.0.1',port),Handler);server.requests=[]
 thread=threading.Thread(target=lambda:server.serve_forever(poll_interval=0.01),daemon=True);thread.start()
 try:yield server
 finally:server.shutdown();server.server_close();thread.join(timeout=2);assert not thread.is_alive()

def json_reply(value,status=200):
 raw=json.dumps(value).encode()
 def reply(handler):
  handler.send_response(status);handler.send_header('Content-Type','application/json');handler.send_header('Content-Length',str(len(raw)));handler.end_headers();handler.wfile.write(raw)
 return reply

def result(value):return {'jsonrpc':'2.0','id':1,'result':value}

class PrivateRpcTransport(unittest.TestCase):
 def test_redirect_cannot_escape_the_selected_node_to_another_listener(self):
  with endpoint(json_reply(result('redirect-target'))) as target:
   def redirect(handler):handler.send_response(302);handler.send_header('Location','http://127.0.0.1:'+str(target.server_port)+'/other-node');handler.send_header('Content-Length','0');handler.end_headers()
   with endpoint(redirect,m.ports(0)['rpc']) as source,patch.dict(os.environ,{},clear=True),patch.object(m.urllib.request,'_opener',None):
    with self.assertRaises((ValueError,urllib.error.HTTPError)):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
    self.assertEqual(len(source.requests),1);self.assertEqual(target.requests,[])
 def test_environment_proxy_cannot_replace_a_selected_loopback_node(self):
  with endpoint(json_reply(result('proxy-response'))) as proxy,endpoint(json_reply(result('selected-node')),m.ports(0)['rpc']) as source:
   env={'http_proxy':'http://127.0.0.1:'+str(proxy.server_port),'https_proxy':'http://127.0.0.1:'+str(proxy.server_port),'all_proxy':'http://127.0.0.1:'+str(proxy.server_port),'no_proxy':''}
   with patch.dict(os.environ,env,clear=True),patch.object(m.urllib.request,'_opener',None):self.assertEqual(m.rpc(m.ports(0)['rpc'],'getGenesisHash'),'selected-node')
   self.assertEqual(len(source.requests),1);self.assertEqual(proxy.requests,[])
 def test_each_fixed_node_accepts_only_direct_posted_read_requests(self):
  methods=['getGenesisHash','getIdentity','getVersion','getSlot','getSupply','getInflationGovernor','getVoteAccounts','getBlock']
  for i in range(3):
   port=m.ports(i)['rpc']
   with endpoint(json_reply(result('direct-node')),port) as source:
    for method in methods:
     params=[44,{'commitment':'finalized'}] if method=='getBlock' else []
     self.assertEqual(m.rpc(port,method,params),'direct-node')
     request=source.requests[-1];self.assertEqual(request['method'],'POST');self.assertEqual(request['path'],'/');self.assertEqual(json.loads(request['body']),{'jsonrpc':'2.0','id':1,'method':method,'params':params})
    self.assertEqual(len(source.requests),len(methods))
 def test_all_redirect_codes_refuse_without_contacting_the_target(self):
  with endpoint(json_reply(result('unselected-target'))) as target:
   for status in [301,302,303,307,308]:
    def redirect(handler):handler.send_response(status);handler.send_header('Location','http://127.0.0.1:'+str(target.server_port)+'/unselected');handler.send_header('Content-Length','0');handler.end_headers()
    with self.subTest(status=status),endpoint(redirect,m.ports(0)['rpc']) as source:
     with self.assertRaisesRegex(ValueError,'PRIVATE_RPC_REDIRECT_FORBIDDEN'):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
     self.assertEqual(len(source.requests),1);self.assertEqual(target.requests,[])
 def test_preinstalled_global_opener_is_never_used(self):
  from unittest.mock import Mock
  ambient=Mock()
  with endpoint(json_reply(result('selected-node')),m.ports(0)['rpc']) as source,patch.object(m.urllib.request,'_opener',ambient):
   self.assertEqual(m.rpc(m.ports(0)['rpc'],'getGenesisHash'),'selected-node');self.assertEqual(len(source.requests),1)
  ambient.open.assert_not_called()
 def test_wrong_http_status_or_malformed_rpc_envelope_cannot_supply_result(self):
  cases=[(201,result('wrong-status')),(206,result('partial')),(500,result('server-error')),(200,[]),(200,None),(200,{'jsonrpc':'2.0','id':True,'result':'boolean-id'}),(200,{'jsonrpc':'2.0','id':2,'result':'wrong-id'}),(200,{'jsonrpc':'1.0','id':1,'result':'wrong-version'}),(200,{'jsonrpc':'2.0','id':1,'result':'ambiguous','error':{}}),(200,{'jsonrpc':'2.0','id':1})]
  for status,body in cases:
   with self.subTest(status=status,body=body),endpoint(json_reply(body,status),m.ports(0)['rpc']) as source:
    with self.assertRaises((ValueError,urllib.error.HTTPError)):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
    self.assertEqual(len(source.requests),1)
 def test_response_byte_limit_is_enforced_on_actual_http_reads(self):
  limit=2*1024**2;overhead=len(json.dumps(result('')).encode())
  exact='a'*(limit-overhead)
  with endpoint(json_reply(result(exact)),m.ports(0)['rpc']):self.assertEqual(m.rpc(m.ports(0)['rpc'],'getGenesisHash'),exact)
  with endpoint(json_reply(result(exact+'x')),m.ports(0)['rpc']),self.assertRaisesRegex(ValueError,'PRIVATE_RPC_EXCEEDS_BOUND'):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
 def test_slow_headers_body_and_chunked_body_share_a_total_network_deadline(self):
  # Send data more often than a socket inactivity timeout, but keep the
  # complete valid reply beyond the request budget. No chain RPC is used.
  for mode in ['headers','body','chunked']:
   cancelled=threading.Event();finished=threading.Event()
   def slow(handler):
    body=json.dumps(result('slow-local-fixture')).encode()
    headers=b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n'
    if mode=='chunked':
     headers+=b'Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n'
     payload=[b'1\r\n'+bytes([value])+b'\r\n' for value in body]+[b'0\r\n\r\n']
    else:
     headers+=b'Content-Length: '+str(len(body)).encode()+b'\r\nConnection: close\r\n\r\n'
     payload=[body[i:i+2] for i in range(0,len(body),2)]
    pieces=[headers[i:i+8] for i in range(0,len(headers),8)]+[body] if mode=='headers' else [headers]+payload
    try:
     for piece in pieces:
      if cancelled.is_set():break
      handler.wfile.write(piece);handler.wfile.flush()
      if cancelled.wait(0.04):break
    except OSError:pass
    finally:finished.set()
   with self.subTest(mode=mode),endpoint(slow,m.ports(0)['rpc']) as source,patch.object(m,'RPC_NETWORK_SECONDS',0.18,create=True):
    try:
     start=time.monotonic()
     with self.assertRaisesRegex(ValueError,'PRIVATE_RPC_NETWORK_DEADLINE'):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
     self.assertLess(time.monotonic()-start,0.8);self.assertEqual(len(source.requests),1)
    finally:
     cancelled.set();self.assertTrue(finished.wait(2))

 def test_headers_and_body_do_not_receive_separate_deadline_budgets(self):
  cancelled=threading.Event();finished=threading.Event()
  def slow(handler):
   body=json.dumps(result('shared-budget')).encode()
   try:
    if cancelled.wait(0.12):return
    handler.send_response(200);handler.send_header('Content-Length',str(len(body)));handler.end_headers()
    if cancelled.wait(0.12):return
    handler.wfile.write(body);handler.wfile.flush()
   except OSError:pass
   finally:finished.set()
  with endpoint(slow,m.ports(0)['rpc']),patch.object(m,'RPC_NETWORK_SECONDS',0.18):
   try:
    with self.assertRaisesRegex(ValueError,'PRIVATE_RPC_NETWORK_DEADLINE'):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
   finally:cancelled.set();self.assertTrue(finished.wait(2))

 def test_deadline_sockets_close_after_success_invalid_json_and_silent_peer(self):
  for mode in ['success','invalid-json','silent']:
   cancelled=threading.Event();finished=threading.Event();sockets=[];selected=m.PrivateRpcDeadlineSocket
   def capture(*args,**kwargs):
    opened=selected(*args,**kwargs);sockets.append(opened);return opened
   def reply(handler):
    try:
     if mode=='silent':cancelled.wait(2);return
     if mode=='success':json_reply(result('complete'))(handler)
     else:
      handler.send_response(200);handler.send_header('Content-Length','1');handler.end_headers();handler.wfile.write(b'{')
    except OSError:pass
    finally:finished.set()
   with self.subTest(mode=mode),endpoint(reply,m.ports(0)['rpc']),patch.object(m,'RPC_NETWORK_SECONDS',0.18),patch.object(m,'PrivateRpcDeadlineSocket',side_effect=capture):
    try:
     if mode=='success':self.assertEqual(m.rpc(m.ports(0)['rpc'],'getGenesisHash'),'complete')
     else:
      with self.assertRaises(ValueError) as raised:m.rpc(m.ports(0)['rpc'],'getGenesisHash')
      if mode=='silent':self.assertEqual(str(raised.exception),'PRIVATE_RPC_NETWORK_DEADLINE')
     self.assertEqual(len(sockets),1);self.assertEqual(sockets[0].fileno(),-1)
    finally:cancelled.set();self.assertTrue(finished.wait(2))

 def test_complete_chunked_reply_within_deadline_succeeds(self):
  def reply(handler):
   body=json.dumps(result('complete-chunked')).encode()
   handler.send_response(200);handler.send_header('Transfer-Encoding','chunked');handler.end_headers()
   for piece in [body[:7],body[7:]]:handler.wfile.write(hex(len(piece))[2:].encode()+b'\r\n'+piece+b'\r\n')
   handler.wfile.write(b'0\r\n\r\n');handler.wfile.flush()
  with endpoint(reply,m.ports(0)['rpc']):self.assertEqual(m.rpc(m.ports(0)['rpc'],'getGenesisHash'),'complete-chunked')

 def test_wrong_port_type_unselected_ports_and_mutation_methods_refuse_before_open(self):
  cases=[(float(m.ports(0)['rpc']),'getGenesisHash'),(True,'getGenesisHash'),(8899,'getGenesisHash'),(m.ports(0)['rpc'],'sendTransaction'),(m.ports(0)['rpc'],'requestAirdrop'),(m.ports(0)['rpc'],'getBalance')]
  with patch.object(m.urllib.request,'build_opener') as opened:
   for port,method in cases:
    with self.subTest(port=port,method=method),self.assertRaises(ValueError):m.rpc(port,method)
   opened.assert_not_called()

if __name__=='__main__':unittest.main()
