import csv,json
from datetime import datetime
def gen():
 s,c_tot=[],0.0
 with open('saldo_almacen_suministro.csv','r',encoding='utf-8')as f:
  for r in csv.DictReader(f,delimiter=';'):
   st,ct=float(r.get('Suma de SaldoUNDTotal','0').replace(',','')or 0),float(r.get('Suma de Total Costo Und.','0').replace('L','').replace(',','')or 0)
   if st==0 and ct==0: continue
   s.append([r.get('Division',''),r.get('Categoria',''),r.get('Grupo',''),r.get('Proveedor',''),st,ct]); c_tot+=ct
 m,ms=[],{"ENERO":1,"FEBRERO":2,"MARZO":3,"ABRIL":4,"MAYO":5,"JUNIO":6,"JULIO":7,"AGOSTO":8,"SEPTIEMBRE":9,"OCTUBRE":10,"NOVIEMBRE":11,"DICIEMBRE":12}
 with open('movimiento_suministro_2025_2026.csv','r',encoding='utf-8')as f:
  for r in csv.DictReader(f,delimiter=';'):
   try:
    un,up=abs(float(r.get('UNIDAD NEG 2025',0)or 0)),float(r.get('UNIDAD POS 2026',0)or 0)
    cn,cp=abs(float(r.get('COSTO NEG 2025','0').replace('-L','').replace('L','').replace(',','')or 0)),float(r.get('COSTO POS 2026','0').replace('L','').replace(',','')or 0)
    if un>0 or up>0 or cn>0 or cp>0: m.append(["2025/2026",r.get('MES','').upper(),float(ms.get(r.get('MES','').upper(),0)),r.get('DEPARTAMENTO2',''),r.get('Division',''),r.get('Categoria',''),r.get('Grupo',''),r.get('Proveedor',''),un,up,cn,cp])
   except ValueError: pass
 js=json.dumps({"s":s,"m":m},ensure_ascii=False)
 with open('index.html','r',encoding='utf-8')as f: h=f.read()
 i=h.find('const RAW = {')
 if i==-1: i=h.find('const RAW')
 f_idx=h.find('};',i)+2
 if i!=-1 and f_idx!=1:
  p_abj=h[f_idx:]
  if "")
  print(f"EXITO: L {c_tot:,.2f}")
if __name__=='__main__': gen()
