Chart.register(ChartDataLabels);

let rawSaldos = [], rawMovimientos = [], filteredMovsData = []; 
let charts = {};
let tableDetalle, tableMovsResumen, tableMovsDetalle;

const MESES_ORDEN = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const reglas = {
    cleanNumber: (val) => {
        if (!val || val === '') return 0;
        if (typeof val === 'number') return val;
        const strNum = val.toString().replace(/[L$,\s]/gi, '').trim();
        const num = parseFloat(strNum);
        return isNaN(num) ? 0 : num;
    },
    cleanName: (name) => {
        if (!name || name === '0' || name === 0 || name.toString().trim() === '') return "SIN ESPECIFICAR";
        return name.toString().toUpperCase().trim();
    },
    getTipoUbicacion: (almacen, depto) => {
        almacen = (almacen || "").toUpperCase().trim();
        depto = (depto || "").toUpperCase().trim();
        if (depto.includes("HOTEL")) return "HOTELES";
        if (depto.includes("CASA")) return "CASAS";
        const isVehiculo = depto.includes("BUSITO") || depto.includes("CAMION") || depto.includes("TOYOTA") || depto.includes("HONDA") || depto.includes("ISUZU") || depto.includes("MITSUBISHI") || depto.includes("HYUNDAI") || depto.includes("KIA") || depto.includes("VEHICULO") || /^[HJ][A-Z]{2}\d{4}$/.test(almacen);
        if (isVehiculo) return "VEHICULOS";
        if (almacen.startsWith("T") || depto.includes("AEC") || depto.includes("DS ") || depto === "DS" || depto.includes("MAYOREO") || depto.includes("MEGABODEGA") || depto.includes("VITRINA")) return "TIENDAS";
        return "DEPARTAMENTOS";
    }
};

function normalizeRow(row) {
    let normalized = {};
    for (let key in row) { if (key) { let newKey = key.replace(/^\uFEFF/, '').trim().toUpperCase(); normalized[newKey] = row[key]; } }
    let almacen = normalized['ALMACEN'] || normalized['SUCURSAL'] || "";
    let depto = normalized['DEPARTAMENTO2'] || normalized['DIVISION'] || "";
    normalized['TIPO_UBICACION'] = reglas.getTipoUbicacion(almacen, depto);
    return normalized;
}

$(document).ready(function () {
    $('.select2').select2({ theme: 'bootstrap-5', placeholder: "Todos...", allowClear: true });
    $('#fecha-hoy').text(new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }));

    Promise.all([
        new Promise((res, rej) => Papa.parse("saldo_almacen_suministro.csv", { download: true, header: true, skipEmptyLines: true, complete: res, error: rej })),
        new Promise((res, rej) => Papa.parse("movimiento_suministro_2025_2026.csv", { download: true, header: true, skipEmptyLines: true, complete: res, error: rej }))
    ]).then(results => {
        rawSaldos = results[0].data.map(normalizeRow);
        rawMovimientos = results[1].data.map(normalizeRow);
        prepararFiltrosDropdowns();
        bindEventosFiltros();
        aplicarFiltrosYRenderizar(); 
        $('#loader-overlay').fadeOut();
    });

    $('#btn-reset-real').click(function() { $('.select2').val(null).trigger('change'); $('#btnFlujoAmbos').prop('checked', true).trigger('change'); $('#f-metric').val('und').trigger('change.select2'); });
    $('#tablaMovsResumen tbody').on('click', 'tr', function () { let data = tableMovsResumen.row(this).data(); if(data) abrirDashboardDetalle(data.Mes, data.Departamento); });
    $('#btn-volver-resumen').click(function() { $('#dashboard-detalle').hide(); $('#main-filters').slideDown(); $('#dashboard-principal').fadeIn(); });
});

function prepararFiltrosDropdowns() {
    let setTipo = new Set(), setCat = new Set(), setProv = new Set(), setDep = new Set();
    rawSaldos.forEach(r => { if(r['TIPO_UBICACION']) setTipo.add(r['TIPO_UBICACION']); setCat.add(reglas.cleanName(r['CATEGORIA'])); setProv.add(reglas.cleanName(r['PROVEEDOR'])); });
    rawMovimientos.forEach(r => { setTipo.add(r['TIPO_UBICACION']); setDep.add(reglas.cleanName(r['DEPARTAMENTO2'])); setCat.add(reglas.cleanName(r['CATEGORIA'])); setProv.add(reglas.cleanName(r['PROVEEDOR'])); });
    const llenar = (id, dataSet) => { const select = $(id); select.empty(); Array.from(dataSet).sort().forEach(item => select.append(new Option(item, item))); };
    llenar('#f-tipo', setTipo); llenar('#f-cat', setCat); llenar('#f-prov', setProv); llenar('#f-dep', setDep);
    $('#f-year').empty().append(new Option('2025', '2025')).append(new Option('2026', '2026'));
    $('#f-mes').empty(); MESES_ORDEN.forEach(m => $('#f-mes').append(new Option(m, m)));
    $('.select2:not(#f-metric)').val(null).trigger('change.select2');
}

function bindEventosFiltros() { $('.select2').on('change', aplicarFiltrosYRenderizar); $('input[name="btnFlujo"]').on('change', aplicarFiltrosYRenderizar); }

function aplicarFiltrosYRenderizar() {
    const fYear = $('#f-year').val() || [], fMes = $('#f-mes').val() || [], fTipo = $('#f-tipo').val() || [], fCat = $('#f-cat').val() || [], fProv = $('#f-prov').val() || [], fDep = $('#f-dep').val() || [], fMetric = $('#f-metric').val(), fFlujo = $('input[name="btnFlujo"]:checked').val();
    let tC = 0, tS = 0, saldosTabla = [];
    
    rawSaldos.forEach(row => {
        let tp = row['TIPO_UBICACION'], ct = reglas.cleanName(row['CATEGORIA']), pr = reglas.cleanName(row['PROVEEDOR']);
        if ((fTipo.length && !fTipo.includes(tp)) || (fCat.length && !fCat.includes(ct)) || (fProv.length && !fProv.includes(pr))) return;
        let s = reglas.cleanNumber(row['SALDOUNDTOTAL']), c = reglas.cleanNumber(row['TOTAL COSTO UND.']);
        tS += s; tC += c;
        saldosTabla.push({ Division: reglas.cleanName(row['DIVISION']), Categoria: ct, Grupo: reglas.cleanName(row['GRUPO']), Proveedor: pr, Stock: s, Costo: c });
    });

    let tP = 0, tN = 0, cDep = {}, cCat = {}, cPrv = {}, cGrp = {}, lIn25 = Array(12).fill(0), lOut25 = Array(12).fill(0), lIn26 = Array(12).fill(0), lOut26 = Array(12).fill(0);
    filteredMovsData = []; let resMap = {}; 
    const key = fMetric === 'und' ? 'UNIDAD' : 'COSTO';

    rawMovimientos.forEach(row => {
        let ms = (row['MES'] || "").toUpperCase(), tp = row['TIPO_UBICACION'], ct = reglas.cleanName(row['CATEGORIA']), pr = reglas.cleanName(row['PROVEEDOR']), dp = reglas.cleanName(row['DEPARTAMENTO2']), gr = reglas.cleanName(row['GRUPO']);
        if ((fMes.length && !fMes.includes(ms)) || (fTipo.length && !fTipo.includes(tp)) || (fCat.length && !fCat.includes(ct)) || (fProv.length && !fProv.includes(pr)) || (fDep.length && !fDep.includes(dp))) return;
        let mi = MESES_ORDEN.indexOf(ms), fP = 0, fN = 0, o25 = 0, o26 = 0, i25 = 0, i26 = 0;
        Object.keys(row).forEach(k => {
            if (!k.includes(key)) return; 
            let v = reglas.cleanNumber(row[k]), iP = k.includes('POS'), iN = k.includes('NEG'), is25 = k.includes('2025'), is26 = k.includes('2026');
            if (fYear.length > 0 && ((is25 && !fYear.includes('2025')) || (is26 && !fYear.includes('2026')))) return;
            if (iP) { tP += v; fP += v; if(is25) i25 += v; if(is26) i26 += v; }
            if (iN) { tN += v; fN += v; if(is25) o25 += v; if(is26) o26 += v; }
            if (mi >= 0) { if(is25 && iP) lIn25[mi] += Math.abs(v); if(is25 && iN) lOut25[mi] += Math.abs(v); if(is26 && iP) lIn26[mi] += Math.abs(v); if(is26 && iN) lOut26[mi] += Math.abs(v); }
        });
        if(o25||o26||i25||i26) {
            filteredMovsData.push({ Mes: ms, Tipo: tp, Departamento: dp, Categoria: ct, Grupo: gr, Out25: o25, Out26: o26, In25: i25, In26: i26 });
            let kR = ms + '|' + dp; if(!resMap[kR]) resMap[kR] = { Mes: ms, Tipo: tp, Departamento: dp, Out25: 0, Out26: 0, In25: 0, In26: 0 };
            resMap[kR].Out25 += o25; resMap[kR].Out26 += o26; resMap[kR].In25 += i25; resMap[kR].In26 += i26;
        }
        let vT = (fFlujo==='in') ? fP : (fFlujo==='out' ? fN : fN);
        cDep[dp] = (cDep[dp]||0)+vT; cCat[ct] = (cCat[ct]||0)+vT; cPrv[pr] = (cPrv[pr]||0)+vT; cGrp[gr] = (cGrp[gr]||0)+vT;
    });

    let px = fMetric==='cst' ? 'L ' : '', cf = {minimumFractionDigits: (fMetric==='cst'?2:0), maximumFractionDigits: (fMetric==='cst'?2:0)};
    $('#k-cost').text('L ' + tC.toLocaleString('en-US', {minimumFractionDigits: 2}));
    $('#k-stock').text(tS.toLocaleString('en-US'));
    $('#k-pos').text(px + Math.abs(tP).toLocaleString('en-US', cf));
    $('#k-neg').text(px + Math.abs(tN).toLocaleString('en-US', cf));

    let tD = Object.entries(cDep).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])), tC2 = Object.entries(cCat).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    $('#k-top-d').text(tD.length ? tD[0][0].substring(0,25) : '-'); $('#k-top-c').text(tC2.length ? tC2[0][0].substring(0,25) : '-');

    actualizarTablaSaldos(saldosTabla);
    actualizarTablaMovsResumen(Object.values(resMap), px, cf);
    actualizarGraficos({ lIn25, lOut25, lIn26, lOut26, cDep, cCat, cPrv, cGrp, fFlujo, fYear, px, cf });
}

function actualizarTablaSaldos(datos) {
    if($.fn.DataTable.isDataTable('#tablaDetalle')) { $('#tablaDetalle').DataTable().destroy(); }
    tableDetalle = $('#tablaDetalle').DataTable({
        data: datos, pageLength: 15, language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, order: [[5, 'desc']],
        columns: [ { data: 'Division' }, { data: 'Categoria' }, { data: 'Grupo' }, { data: 'Proveedor' }, { data: 'Stock', className:'num', render: d => `<span class="badge bg-${d>0?'success':(d<0?'danger':'dark')} px-3 py-2">${d.toLocaleString('en-US')}</span>` }, { data: 'Costo', className:'num', render: d => `<strong>L ${d.toLocaleString('en-US', {minimumFractionDigits:2})}</strong>` } ]
    });
}

function actualizarTablaMovsResumen(datos, px, cf) {
    if($.fn.DataTable.isDataTable('#tablaMovsResumen')) { $('#tablaMovsResumen').DataTable().destroy(); }
    tableMovsResumen = $('#tablaMovsResumen').DataTable({
        data: datos, pageLength: 10, language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, order: [[0, 'asc']],
        columns: [ { data: 'Mes' }, { data: 'Tipo', render: d => `<span class="badge-tipo">${d}</span>` }, { data: 'Departamento' }, { data: 'Out25', className:'num text-danger fw-bold', render: d => d!==0?px+Math.abs(d).toLocaleString('en-US', cf):'-' }, { data: 'Out26', className:'num text-danger fw-bold', render: d => d!==0?px+Math.abs(d).toLocaleString('en-US', cf):'-' }, { data: 'In25', className:'num text-success fw-bold', render: d => d!==0?px+d.toLocaleString('en-US', cf):'-' }, { data: 'In26', className:'num text-success fw-bold', render: d => d!==0?px+d.toLocaleString('en-US', cf):'-' } ]
    });
}

function abrirDashboardDetalle(mes, depto) {
    $('#titulo-detalle').text(`${depto} | ${mes}`);
    let px = $('#f-metric').val()==='cst'?'L ':'', cf = {minimumFractionDigits: ($('#f-metric').val()==='cst'?2:0), maximumFractionDigits: ($('#f-metric').val()==='cst'?2:0)};
    let dD = [], sO25=0, sO26=0, sI25=0, sI26=0, rG={};
    filteredMovsData.forEach(d => { if(d.Mes!==mes || d.Departamento!==depto) return; sO25+=d.Out25; sO26+=d.Out26; sI25+=d.In25; sI26+=d.In26; rG[d.Grupo] = (rG[d.Grupo]||0)+(Math.abs(d.Out25)+Math.abs(d.Out26)); dD.push(d); });
    $('#det-out-25').text(px+Math.abs(sO25).toLocaleString('en-US', cf)); $('#det-out-26').text(px+Math.abs(sO26).toLocaleString('en-US', cf)); $('#det-in-25').text(px+sI25.toLocaleString('en-US', cf)); $('#det-in-26').text(px+sI26.toLocaleString('en-US', cf));
    if($.fn.DataTable.isDataTable('#tablaMovsDetalle')) { $('#tablaMovsDetalle').DataTable().destroy(); }
    tableMovsDetalle = $('#tablaMovsDetalle').DataTable({
        data: dD, pageLength: 10, language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }, order: [[5, 'asc']],
        columns: [ { data: 'Mes' }, { data: 'Tipo', render: d => `<span class="badge-tipo">${d}</span>` }, { data: 'Departamento' }, { data: 'Categoria' }, { data: 'Grupo' }, { data: 'Out25', className:'num text-danger', render: d => d!==0?px+Math.abs(d).toLocaleString('en-US', cf):'-' }, { data: 'Out26', className:'num text-danger', render: d => d!==0?px+Math.abs(d).toLocaleString('en-US', cf):'-' }, { data: 'In25', className:'num text-success', render: d => d!==0?px+d.toLocaleString('en-US', cf):'-' }, { data: 'In26', className:'num text-success', render: d => d!==0?px+d.toLocaleString('en-US', cf):'-' } ]
    });
    if(charts.cDetGrp) charts.cDetGrp.destroy();
    let sDG = Object.entries(rG).sort((a,b)=>b[1]-a[1]).slice(0, 10);
    charts.cDetGrp = new Chart(document.getElementById('c-detalle-grupo'), { type:'bar', data: { labels: sDG.map(x=>x[0].substring(0,25)), datasets:[{data:sDG.map(x=>x[1]), backgroundColor:'#E1251B', borderRadius:4}] }, options: { responsive:true, maintainAspectRatio:false, indexAxis:'y', scales: { x:{display:false}, y:{grid:{display:false}, ticks:{color:'#000', font:{weight:'bold', size:10}}} }, plugins:{legend:{display:false}, datalabels:{anchor:'end', align:'right', color:'#000', font:{weight:'bold'}, formatter: v => v>0?px+v.toLocaleString('en-US', cf):''}} } });
    $('#main-filters').slideUp(); $('#dashboard-principal').hide(); $('#dashboard-detalle').fadeIn();
}

function actualizarGraficos(g) {
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    let ds = []; let s25 = !g.fYear.length || g.fYear.includes('2025'), s26 = !g.fYear.length || g.fYear.includes('2026');
    if (s25 && (g.fFlujo!=='out')) ds.push({ label: 'Ent. 2025', data: g.lIn25, borderColor: '#00b4db', borderDash: [5, 5], tension: 0.4 });
    if (s25 && (g.fFlujo!=='in')) ds.push({ label: 'Sal. 2025', data: g.lOut25, borderColor: '#ff7b72', borderDash: [5, 5], tension: 0.4 });
    if (s26 && (g.fFlujo!=='out')) ds.push({ label: 'Ent. 2026', data: g.lIn26, borderColor: '#012094', borderWidth: 3, tension: 0.4 });
    if (s26 && (g.fFlujo!=='in')) ds.push({ label: 'Sal. 2026', data: g.lOut26, borderColor: '#E1251B', borderWidth: 3, tension: 0.4 });
    if(charts.cResp) charts.cResp.destroy();
    charts.cResp = new Chart(document.getElementById('c-respiracion'), { type: 'line', data: { labels: MESES_ORDEN, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false }, ticks: { color: '#000', font: { weight: 'bold' } } }, y: { display: false } }, plugins: { legend: { position: 'bottom', labels: { color: '#000', font: { weight: 'bold' } } }, datalabels: { display: false } } } });

    const rV = (id, data, col) => {
        if(charts[id]) charts[id].destroy();
        let s = Object.entries(data).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0, 12);
        charts[id] = new Chart(document.getElementById(id), { type: 'bar', data: { labels: s.map(x=>x[0].substring(0,18)), datasets: [{ data: s.map(x=>Math.abs(x[1])), backgroundColor: col, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 75 } }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, color: '#000', font: { weight: 'bold' } } }, y: { display: false } }, plugins: { legend: { display: false }, datalabels: { display: true, anchor: 'end', align: 'end', rotation: -45, offset: 5, color: '#000', font: { weight: 'bold', size: 11 }, formatter: v => v > 0 ? g.px + v.toLocaleString('en-US', g.cf) : '' } } } });
    };
    rV('c-dept', g.cDep, '#E1251B'); rV('c-cat', g.cCat, '#012094');

    const rH = (id, data, col) => {
        if(charts[id]) charts[id].destroy();
        let s = Object.entries(data).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0, 15);
        charts[id] = new Chart(document.getElementById(id), { type: 'bar', data: { labels: s.map(x=>x[0].substring(0,25)), datasets: [{ data: s.map(x=>Math.abs(x[1])), backgroundColor: col, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', layout: { padding: { right: 120 } }, scales: { x: { display: false }, y: { grid: { display: false }, ticks: { color: '#000', font: { weight: 'bold' } } } }, plugins: { legend: { display: false }, datalabels: { display: true, anchor: 'end', align: 'right', color: '#000', font: { weight: 'bold' }, formatter: v => v > 0 ? g.px + v.toLocaleString('en-US', g.cf) : '' } } } });
    };
    rH('c-prov', g.cPrv, '#2c3e50'); rH('c-grp', g.cGrp, '#00b4db');
}
