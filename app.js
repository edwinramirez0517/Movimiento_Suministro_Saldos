Chart.register(ChartDataLabels);

// Variables Globales
let rawSaldos = [];
let rawMovimientos = [];
let charts = {};
let tableDetalle;

const MESES_ORDEN = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// 1. LIMPIEZA DE NÚMEROS
const reglas = {
    cleanNumber: (val) => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        // Quita la "L", el "$", espacios y comas, pero RESPETA el signo negativo "-"
        const strNum = val.toString().replace(/[L$,\s]/gi, '').trim();
        const num = parseFloat(strNum);
        return isNaN(num) ? 0 : num;
    }
};

function normalizeRow(row) {
    let normalized = {};
    for (let key in row) {
        if (key) {
            let newKey = key.replace(/^\uFEFF/, '').trim().toUpperCase();
            normalized[newKey] = row[key];
        }
    }
    return normalized;
}

// 2. INICIALIZACIÓN
$(document).ready(function () {
    $('.select2').select2({ theme: 'bootstrap-5', placeholder: "Todos...", allowClear: true });
    $('#fecha-hoy').text(new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }));

    Promise.all([
        new Promise((resolve, reject) => Papa.parse("saldo_almacen_suministro.csv", { download: true, header: true, skipEmptyLines: true, complete: resolve, error: reject })),
        new Promise((resolve, reject) => Papa.parse("movimiento_suministro_2025_2026.csv", { download: true, header: true, skipEmptyLines: true, complete: resolve, error: reject }))
    ]).then(results => {
        rawSaldos = results[0].data.map(normalizeRow);
        rawMovimientos = results[1].data.map(normalizeRow);
        
        prepararFiltrosDropdowns();
        bindEventosFiltros();
        aplicarFiltrosYRenderizar(); 
        $('#loader-overlay').fadeOut();
    }).catch(err => {
        console.error(err);
        $('#loader-overlay').html('<h4 class="text-danger fw-bold">Error al cargar datos. Verifique archivos CSV.</h4>');
    });

    $('#btn-reset').click(function() {
        $('.select2').val(null).trigger('change');
        $('#btnFlujoAmbos').prop('checked', true).trigger('change');
        $('#f-metric').val('und').trigger('change.select2'); 
    });
});

// 3. LLENADO DE FILTROS DESPLEGABLES
function prepararFiltrosDropdowns() {
    let setTienda = new Set(), setCat = new Set(), setProv = new Set(), setDep = new Set();
    
    rawSaldos.forEach(r => { 
        if(r['DIVISION']) setTienda.add(r['DIVISION']);
        if(r['CATEGORIA']) setCat.add(r['CATEGORIA']); 
        if(r['PROVEEDOR']) setProv.add(r['PROVEEDOR']); 
    });
    
    rawMovimientos.forEach(r => { 
        if(r['DEPARTAMENTO2']) setDep.add(r['DEPARTAMENTO2']); 
        if(r['DIVISION']) setTienda.add(r['DIVISION']);
        if(r['CATEGORIA']) setCat.add(r['CATEGORIA']);
        if(r['PROVEEDOR']) setProv.add(r['PROVEEDOR']);
    });

    const llenar = (id, dataSet) => {
        const select = $(id); select.empty();
        Array.from(dataSet).sort().forEach(item => select.append(new Option(item, item)));
    };

    llenar('#f-div', setTienda); 
    llenar('#f-cat', setCat); 
    llenar('#f-prov', setProv); 
    llenar('#f-dep', setDep);
    
    $('#f-year').empty().append(new Option('2025', '2025')).append(new Option('2026', '2026'));
    $('#f-mes').empty(); MESES_ORDEN.forEach(m => $('#f-mes').append(new Option(m, m)));
    
    $('.select2:not(#f-metric)').val(null).trigger('change.select2');
}

function bindEventosFiltros() {
    $('.select2').on('change', function() { aplicarFiltrosYRenderizar(); });
    $('input[name="btnFlujo"]').on('change', function() { aplicarFiltrosYRenderizar(); });
}

// 4. MOTOR PRINCIPAL: FILTRA Y RECALCULA
function aplicarFiltrosYRenderizar() {
    const fYear = $('#f-year').val() || [];
    const fMes = $('#f-mes').val() || [];
    const fDiv = $('#f-div').val() || [];
    const fCat = $('#f-cat').val() || [];
    const fProv = $('#f-prov').val() || [];
    const fDep = $('#f-dep').val() || [];
    const fMetric = $('#f-metric').val(); 
    const fFlujo = $('input[name="btnFlujo"]:checked').val();

    // 4.1 Filtrar SALDOS 
    let totalCosto = 0, totalStock = 0;
    let saldosTabla = [];
    
    rawSaldos.forEach(row => {
        if (fDiv.length && !fDiv.includes(row['DIVISION'])) return;
        if (fCat.length && !fCat.includes(row['CATEGORIA'])) return;
        if (fProv.length && !fProv.includes(row['PROVEEDOR'])) return;

        let stock = reglas.cleanNumber(row['SALDOUNDTOTAL']);
        let costo = reglas.cleanNumber(row['TOTAL COSTO UND.']);

        totalStock += stock;
        totalCosto += costo;

        saldosTabla.push({
            Division: row['DIVISION'] || "SIN DIVISION",
            Categoria: row['CATEGORIA'] || "",
            Grupo: row['GRUPO'] || "",
            Proveedor: row['PROVEEDOR'] || "SIN ESPECIFICAR",
            Stock: stock,
            Costo: costo
        });
    });

    // 4.2 Filtrar MOVIMIENTOS
    let totalPos = 0, totalNeg = 0;
    let consumoPorDepto = {}, consumoPorCat = {}, consumoPorProv = {}, consumoPorGrp = {};
    
    let lineIn25 = Array(12).fill(0), lineOut25 = Array(12).fill(0);
    let lineIn26 = Array(12).fill(0), lineOut26 = Array(12).fill(0);

    const metricKey = fMetric === 'und' ? 'UNIDAD' : 'COSTO';

    rawMovimientos.forEach(row => {
        let mesStr = (row['MES'] || "").toUpperCase();
        if (fMes.length && !fMes.includes(mesStr)) return;
        if (fDiv.length && !fDiv.includes(row['DIVISION'])) return;
        if (fCat.length && !fCat.includes(row['CATEGORIA'])) return;
        if (fProv.length && !fProv.includes(row['PROVEEDOR'])) return;
        if (fDep.length && !fDep.includes(row['DEPARTAMENTO2'])) return;

        let mesIdx = MESES_ORDEN.indexOf(mesStr);
        let depto = row['DEPARTAMENTO2'] || "SIN ASIGNAR";
        let cat = row['CATEGORIA'] || "SIN ASIGNAR";
        let prov = row['PROVEEDOR'] || "SIN ASIGNAR";
        let grp = row['GRUPO'] || "SIN ASIGNAR";

        let filaPos = 0, filaNeg = 0;

        Object.keys(row).forEach(k => {
            if (!k.includes(metricKey)) return; 
            
            let is2025 = k.includes('2025');
            let is2026 = k.includes('2026');
            let isPos = k.includes('POS');
            let isNeg = k.includes('NEG'); 
            
            // Extraer el valor EXACTO con su signo original (NO usar Math.abs aquí)
            let val = reglas.cleanNumber(row[k]);

            if (fYear.length > 0) {
                if (is2025 && !fYear.includes('2025')) return;
                if (is2026 && !fYear.includes('2026')) return;
            }

            // Suma con signos reales (permitiendo que devoluciones neteen el valor)
            if (isPos) { totalPos += val; filaPos += val; }
            if (isNeg) { totalNeg += val; filaNeg += val; }

            // Llenar gráfico de líneas (usamos valor absoluto en la línea para que no dibuje para abajo)
            if (mesIdx >= 0) {
                if(is2025 && isPos) lineIn25[mesIdx] += Math.abs(val);
                if(is2025 && isNeg) lineOut25[mesIdx] += Math.abs(val);
                if(is2026 && isPos) lineIn26[mesIdx] += Math.abs(val);
                if(is2026 && isNeg) lineOut26[mesIdx] += Math.abs(val);
            }
        });

        // Sumar Tops basados en el flujo. Usamos el valor real neto (sumado con sus signos)
        let valorTops = 0;
        if (fFlujo === 'all' || fFlujo === 'out') valorTops += filaNeg; 
        if (fFlujo === 'in') valorTops += filaPos; 

        consumoPorDepto[depto] = (consumoPorDepto[depto] || 0) + valorTops;
        consumoPorCat[cat] = (consumoPorCat[cat] || 0) + valorTops;
        consumoPorProv[prov] = (consumoPorProv[prov] || 0) + valorTops;
        consumoPorGrp[grp] = (consumoPorGrp[grp] || 0) + valorTops;
    });

    // 4.3 Inyectar Valores a HTML (Aquí sí aplicamos Math.abs solo para mostrarlos en la tarjeta en positivo)
    let prefix = fMetric === 'cst' ? 'L ' : '';
    let configNum = fMetric === 'cst' ? {minimumFractionDigits: 2, maximumFractionDigits: 2} : {maximumFractionDigits: 0};

    $('#k-cost').text('L ' + totalCosto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    $('#k-stock').text(totalStock.toLocaleString('en-US'));
    $('#k-pos').text(prefix + Math.abs(totalPos).toLocaleString('en-US', configNum));
    $('#k-neg').text(prefix + Math.abs(totalNeg).toLocaleString('en-US', configNum));

    // Para los Tops, ordenar por el valor absoluto mayor (para que los consumos más altos estén de primero)
    let topDepto = Object.entries(consumoPorDepto).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    let topCat = Object.entries(consumoPorCat).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    $('#k-top-d').text(topDepto.length > 0 ? topDepto[0][0].substring(0,25) : '-');
    $('#k-top-c').text(topCat.length > 0 ? topCat[0][0].substring(0,25) : '-');

    actualizarTabla(saldosTabla);
    actualizarGraficos({
        lineIn25, lineOut25, lineIn26, lineOut26,
        consumoPorDepto, consumoPorCat, consumoPorProv, consumoPorGrp,
        fFlujo, fYear, prefix, configNum
    });
}

// 5. DATA TABLES 
function actualizarTabla(datosTabla) {
    if($.fn.DataTable.isDataTable('#tablaDetalle')) {
        tableDetalle.clear().rows.add(datosTabla).draw();
        return;
    }
    
    tableDetalle = $('#tablaDetalle').DataTable({
        data: datosTabla,
        pageLength: 15,
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        order: [[5, 'desc']], 
        columns: [
            { data: 'Division', defaultContent: '-' },
            { data: 'Categoria', defaultContent: '-' },
            { data: 'Grupo', defaultContent: '-' },
            { data: 'Proveedor', defaultContent: '-' },
            { 
                data: 'Stock', className: 'num',
                render: (data, t) => t==='display' ? `<span class="badge bg-${data>0?'success':(data<0?'danger':'dark')} px-3 py-2">${data.toLocaleString('en-US')}</span>` : data
            },
            { 
                data: 'Costo', className: 'num',
                render: (data, t) => t==='display' ? `<strong>L ${data.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong>` : data
            }
        ]
    });
}

// 6. GRÁFICOS (CHART.JS) AJUSTADOS (Rotación a 45 grados y sin amontonarse)
function actualizarGraficos(gData) {
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    Object.values(charts).forEach(c => c.destroy()); 

    const { lineIn25, lineOut25, lineIn26, lineOut26, fFlujo, fYear, prefix, configNum } = gData;

    // Config Base Global
    const optBase = {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 35, bottom: 10, right: 10, left: 10 } },
        scales: { 
            x: { grid: { display: false } }, 
            y: { grid: { display: false }, ticks: { display: false }, border: { display: false } } 
        },
        plugins: {
            legend: { display: false },
            datalabels: { display: false } // Lo apagamos globalmente, y lo encendemos solo en las barras
        }
    };

    // --- GRÁFICO 1: RESPIRACIÓN LOGÍSTICA ---
    let dsLine = [];
    let show25 = fYear.length === 0 || fYear.includes('2025');
    let show26 = fYear.length === 0 || fYear.includes('2026');

    if (show25 && (fFlujo === 'all' || fFlujo === 'in')) {
        dsLine.push({ label: 'Entradas 2025 (+)', data: lineIn25, borderColor: '#00b4db', backgroundColor: '#00b4db', borderDash: [5, 5], tension: 0.4 });
    }
    if (show25 && (fFlujo === 'all' || fFlujo === 'out')) {
        dsLine.push({ label: 'Salidas 2025 (-)', data: lineOut25, borderColor: '#ff7b72', backgroundColor: '#ff7b72', borderDash: [5, 5], tension: 0.4 });
    }
    if (show26 && (fFlujo === 'all' || fFlujo === 'in')) {
        dsLine.push({ label: 'Entradas 2026 (+)', data: lineIn26, borderColor: '#012094', backgroundColor: '#012094', borderWidth: 3, tension: 0.4 });
    }
    if (show26 && (fFlujo === 'all' || fFlujo === 'out')) {
        dsLine.push({ label: 'Salidas 2026 (-)', data: lineOut26, borderColor: '#E1251B', backgroundColor: '#E1251B', borderWidth: 3, tension: 0.4 });
    }

    charts.cResp = new Chart(document.getElementById('c-respiracion').getContext('2d'), {
        type: 'line',
        data: { labels: MESES_ORDEN, datasets: dsLine },
        options: { ...optBase, plugins: { legend: { display: true, position: 'bottom' } } }
    });

    // --- GRÁFICOS BARRAS VERTICALES (Etiquetas a 45 grados) ---
    const renderBarV = (id, dataObj, color) => {
        let sorted = Object.entries(dataObj).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0, 12);
        
        let optV = JSON.parse(JSON.stringify(optBase));
        optV.layout = { padding: { top: 60, bottom: 0, right: 10, left: 10 } }; 
        optV.scales.x.ticks = { maxRotation: 45, minRotation: 45, font: { size: 9 } }; // Forzar 45 grados abajo
        
        // Ajuste perfecto del Datalabel a 45 grados arriba de la barra
        optV.plugins.datalabels = {
            display: true,
            anchor: 'end',
            align: 'top',
            rotation: -45, // Rota el número 45 grados hacia la izquierda
            offset: -10, // Lo baja un poco hacia el centro de la barra
            color: '#111',
            font: { weight: 'bold', size: 10 },
            formatter: v => {
                let absV = Math.abs(v);
                return absV > 0 ? prefix + absV.toLocaleString('en-US', configNum) : '';
            }
        };

        charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: {
                labels: sorted.map(d => d[0].length > 20 ? d[0].substring(0, 20) + '...' : d[0]),
                datasets: [{ data: sorted.map(d => Math.abs(d[1])), backgroundColor: color, borderRadius: 4 }]
            },
            options: optV
        });
    };

    renderBarV('c-dept', gData.consumoPorDepto, '#E1251B');
    renderBarV('c-cat', gData.consumoPorCat, '#012094');

    // --- GRÁFICOS BARRAS HORIZONTALES (Sin Distorsión) ---
    const renderBarH = (id, dataObj, color) => {
        let sorted = Object.entries(dataObj).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0, 15);
        let optH = JSON.parse(JSON.stringify(optBase));
        
        optH.indexAxis = 'y';
        optH.layout = { padding: { top: 10, bottom: 10, right: 100, left: 10 } }; 
        optH.scales.y = { grid: { display: false }, ticks: { display: true, font: { size: 9 } }, border: { display: false } };
        optH.scales.x = { grid: { display: false }, ticks: { display: false }, border: { display: false } };
        
        optH.plugins.datalabels = {
            display: true,
            anchor: 'end',
            align: 'right',
            color: '#333',
            font: { weight: 'bold', size: 10 },
            formatter: v => {
                let absV = Math.abs(v);
                return absV > 0 ? prefix + absV.toLocaleString('en-US', configNum) : '';
            }
        };

        charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: {
                labels: sorted.map(d => d[0].length > 25 ? d[0].substring(0, 25) + '...' : d[0]),
                datasets: [{ data: sorted.map(d => Math.abs(d[1])), backgroundColor: color, borderRadius: 4, barPercentage: 0.8 }]
            },
            options: optH
        });
    };

    renderBarH('c-prov', gData.consumoPorProv, '#2c3e50');
    renderBarH('c-grp', gData.consumoPorGrp, '#00b4db');
}
