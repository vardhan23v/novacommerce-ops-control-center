"""Local synthetic business services. Python 3.9+, standard library only."""
import json, os, re, threading, uuid
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
ROOT=Path(__file__).parent
DATA=json.loads((ROOT/'business_data.json').read_text())
orders={x['id']:x for x in DATA['orders']}; payments={x['order_id']:x for x in DATA['payments']}; shipments={x['order_id']:x for x in DATA['shipments']}; refunds={}; tickets={}; lock=threading.RLock()
class Handler(BaseHTTPRequestHandler):
 def reply(self, code, body):
  self.send_response(code); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(json.dumps(body).encode())
 def do_GET(self):
  with lock:
   p=urlparse(self.path).path
   collections={'/commerce/orders':list(orders.values()),'/commerce/customers':DATA['customers'],'/payments/transactions':list(payments.values()),'/shipping/shipments':list(shipments.values()),'/payments/refunds':list(refunds.values()),'/commerce/tickets':list(tickets.values())}
   if p=='/health': return self.reply(200,{'ok':True})
   if p in collections:return self.reply(200,collections[p])
   for prefix, records in [('/commerce/orders/',orders),('/payments/transactions/',payments),('/shipping/shipments/',shipments),('/payments/refunds/',refunds)]:
    if p.startswith(prefix):
     key=p[len(prefix):]; row=records.get(key)
     if row is None:return self.reply(404,{'error':'not found'})
     if prefix=='/shipping/shipments/' and key=='NC-1012':return self.reply(503,{'error':'carrier temporarily unavailable'})
     return self.reply(200,row)
   return self.reply(404,{'error':'unknown endpoint'})
 def do_POST(self):
  try:
   body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))) or b'{}')
   if not isinstance(body,dict):raise ValueError()
  except (ValueError,TypeError):return self.reply(400,{'error':'invalid JSON object'})
  p=urlparse(self.path).path
  with lock:
   m=re.fullmatch(r'/commerce/orders/([^/]+)/cancel',p)
   if m:
    o=orders.get(m[1]); s=shipments.get(m[1]);
    if not o:return self.reply(404,{'error':'unknown order'})
    if o['status'] in ('shipped','delivered') or (s and s['status'] in ('shipped','delayed','delivered')):return self.reply(409,{'error':'already shipped'})
    o['status']='cancelled';return self.reply(200,o)
   if p=='/payments/refunds':
    oid=body.get('order_id'); pay=payments.get(oid); order=orders.get(oid); amount=body.get('amount_minor')
    if not pay or not order:return self.reply(404,{'error':'unknown order'})
    if pay['status']!='captured' or order['status'] not in ('cancelled','delivered'):return self.reply(409,{'error':'ineligible refund'})
    if type(amount) is not int or not 0<amount<=pay['amount_minor']:return self.reply(400,{'error':'invalid amount'})
    if sum(r['amount_minor'] for r in refunds.values() if r['order_id']==oid and r['status']!='failed')+amount>pay['amount_minor']:return self.reply(409,{'error':'refund exceeds captured amount'})
    rid='R-'+uuid.uuid4().hex[:10]; r={'id':rid,'order_id':oid,'amount_minor':amount,'currency':'INR','status':'failed' if oid=='NC-1010' else 'succeeded'};refunds[rid]=r;return self.reply(201,r)
   if p=='/commerce/tickets':
    if body.get('order_id') not in orders or not isinstance(body.get('reason'),str) or not body['reason'].strip():return self.reply(400,{'error':'order_id and reason required'})
    tid='T-'+uuid.uuid4().hex[:10]; t={'id':tid,'order_id':body['order_id'],'reason':body['reason'],'status':'open'};tickets[tid]=t;return self.reply(201,t)
   return self.reply(404,{'error':'unknown endpoint'})
if __name__=='__main__':
 port=int(os.environ.get('MOCK_PORT','8765'));print(f'Mock services: http://127.0.0.1:{port}',flush=True);ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
