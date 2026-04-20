import csv, json, os
from datetime import datetime

def gen():
    print("--- INICIANDO DEPURACIÓN ---")
    archivos = os.listdir('.')
    print(f"Archivos en carpeta: {archivos}")
    
    # Buscar archivos ignorando mayúsculas/minúsculas
    f_saldo = next((f for f in archivos if f.lower() == 'saldo_almacen_suministro.csv'), None)
    f_mov = next((f for f in archivos if f.lower() == 'movimiento_suministro_2025_2026.csv'), None)
    
    if not f_saldo or not f_mov:
        print(f"ERROR: Falta archivo. Saldo: {f_saldo}, Mov: {f_mov}")
        return

    s, c_tot = [], 0.0
    with open(f_saldo, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for r in reader:
            st = float(r.get('Suma de SaldoUNDTotal', '0').replace(',', '') or 0)
            ct = float(r.get('Suma de Total Costo Und.', '0').replace('L', '').replace(',', '') or 0)
            if st == 0 and ct == 0: continue
            s.append([r.get('Division', ''), r.get('Categoria', ''), r.get('Grupo', ''), r.get('Proveedor', ''), st, ct])
            c_tot += ct
    print(f"Saldos procesados: {len(s)}. Inversión: L {c_tot:,.2f}")

    m, ms = [], {"ENERO":1,"FEBRERO":2,"MARZO":3,"ABRIL":4,"MAYO":5,"JUNIO":6,"JULIO":7,"AGOSTO":8,"SEPTIEMBRE":9,"OCTUBRE":10,"NOVIEMBRE":11,"DICIEMBRE":12}
    with open(f_mov, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for r in reader:
            try:
                mes = r.get('MES', '').upper()
                un, up = abs(float(r.get('UNIDAD NEG 2025', 0) or 0)), float(r.get('UNIDAD POS 2026', 0) or 0)
                cn, cp = abs(float(r.get('COSTO NEG 2025', '0').replace('-L','').replace('L','').replace(',','') or 0)), float(r.get('COSTO POS 2026', '0').replace('L','').replace(',','') or 0)
                if un > 0 or up > 0 or cn > 0 or cp > 0:
                    m.append(["2025/2026", mes, float(ms.get(mes, 0)), r.get('DEPARTAMENTO2', ''), r.get('Division', ''), r.get('Categoria', ''), r.get('Grupo', ''), r.get('Proveedor', ''), un, up, cn, cp])
            except: pass
    print(f"Movimientos procesados: {len(m)}")

    js = json.dumps({"s": s, "m": m}, ensure_ascii=False)
    with open('index.html', 'r', encoding='utf-8') as f: h = f.read()
    
    # Búsqueda ultra-flexible
    i = h.find('const RAW')
    if i == -1:
        print("ERROR: No se encontró la palabra 'const RAW' en index.html")
        return
    
    f_idx = h.find('};', i) + 2
    print(f"Posición RAW: {i}, Fin: {f_idx}")
    
    p_abj = h[f_idx:]
    if "")
    print("--- PROCESO COMPLETADO EXITOSAMENTE ---")

if __name__ == '__main__': gen()
