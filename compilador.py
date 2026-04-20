import csv
import json
import re

def generar_dashboard():
    s_data = []
    with open('saldo_almacen_suministro.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            stock_str = row.get('Suma de SaldoUNDTotal', '0').replace(',', '')
            stock = float(stock_str) if stock_str else 0.0
            costo_str = row.get('Suma de Total Costo Und.', '0').replace('L', '').replace(',', '')
            costo = float(costo_str) if costo_str else 0.0
            
            if stock == 0 and costo == 0:
                continue
                
            s_data.append([row.get('Division', ''), row.get('Categoria', ''), row.get('Grupo', ''), row.get('Proveedor', ''), stock, costo])

    m_data = []
    meses = {"ENERO":1, "FEBRERO":2, "MARZO":3, "ABRIL":4, "MAYO":5, "JUNIO":6, "JULIO":7, "AGOSTO":8, "SEPTIEMBRE":9, "OCTUBRE":10, "NOVIEMBRE":11, "DICIEMBRE":12}
             
    with open('movimiento_suministro_2025_2026.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            mes_nombre = row.get('MES', '').upper()
            mes_num = meses.get(mes_nombre, 0)
            depto = row.get('DEPARTAMENTO2', '')
            try:
                und_neg = abs(float(row.get('UNIDAD NEG 2025', 0) or 0))
                und_pos = float(row.get('UNIDAD POS 2026', 0) or 0)
                cst_neg = abs(float(row.get('COSTO NEG 2025', '0').replace('-L','').replace('L','').replace(',','') or 0))
                cst_pos = float(row.get('COSTO POS 2026', '0').replace('L','').replace(',','') or 0)
                if und_neg > 0 or und_pos > 0 or cst_neg > 0 or cst_pos > 0:
                    m_data.append(["2025/2026", mes_nombre, float(mes_num), depto, row.get('Division', ''), row.get('Categoria', ''), row.get('Grupo', ''), row.get('Proveedor', ''), und_neg, und_pos, cst_neg, cst_pos])
            except ValueError:
                pass
            
    json_nuevo = json.dumps({"s": s_data, "m": m_data}, ensure_ascii=False)
    
    # Nombre exacto de tu archivo actual
    nombre_archivo_html = 'Dashboard_Gerencial_Final_Compadre_V44.html' 
    
    with open(nombre_archivo_html, 'r', encoding='utf-8') as f:
        html_content = f.read()
        
    html_nuevo = re.sub(r'const RAW = \{.*?\};', f'const RAW = {json_nuevo};', html_content, flags=re.DOTALL)
    
    with open(nombre_archivo_html, 'w', encoding='utf-8') as f:
        f.write(html_nuevo)

if __name__ == '__main__':
    generar_dashboard()
