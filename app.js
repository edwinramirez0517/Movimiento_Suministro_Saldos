Chart.register(ChartDataLabels);

// Variables Globales
let rawSaldos = [];
let rawMovimientos = [];
let filteredMovsData = []; // Guarda la data filtrada para poder hacer el drill-down
let charts = {};
let tableDetalle, tableMovsResumen, tableMovsDetalle;

const MESES_ORDEN = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// 1. LIMPIEZA DE NÚMEROS Y NOMBRES
const reglas = {
    cleanNumber: (val) => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        // Quita la "L", el "$", espacios y comas, pero RESPETA el signo negativo "-"
        const strNum = val.toString().replace(/[L$,\s]/gi, '').trim();
        const num = parseFloat(strNum);
        return isNaN(num) ? 0 : num;
    },
    
    // Filtro estricto para limpiar '0', nulos o vacíos en los textos
    cleanName: (name) => {
        if (!name || name === '0' || name === 0 || name.toString().trim() === '') {
            return "SIN ESPECIFICAR";
        }
        return name.toString().toUpperCase().trim();
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

    $('#btn-reset-real').click(function() {
        $('.select2').val(null).trigger('change');
        $('#btnFlujoAmbos').prop('checked', true).trigger('change');
        $('#f-metric').val('und').trigger('change.select2'); 
    });

    // EVENTOS PARA DRILL-DOWN (MAESTRO-DETALLE)
    $('#tablaMovsResumen tbody').on('click', 'tr', function () {
        if(!tableMovsResumen) return;
        let data = tableMovsResumen.row(this).data();
        if(data) abrirDetalleMovimientos(data.Mes, data.Departamento);
    });

    $('#btn-ver-todo-detalle').click(function() { abrirDetalleMovimientos('TODOS', 'TODOS'); });
    
    $('#btn-volver-resumen').click(function() { 
        $('#view-detalle').hide(); 
        $('#view-resumen').fadeIn(); 
    });
});

// 3. LLENADO DE FILTROS DESPLEGABLES
function prepararFiltrosDropdowns() {
    let setCat = new Set(), setProv = new Set(), setDep = new Set();
    
    rawSaldos.forEach(r => { 
        if(r['CATEGORIA']) setCat.add(reglas.cleanName(r['CATEGORIA'])); 
        if(r['PROVEEDOR']) setProv.add(reglas.cleanName(r['PROVEEDOR'])); 
    });
    
    rawMovimientos.forEach(r => { 
        if(r['DEPARTAMENTO2']) setDep.add(reglas.cleanName(r['DEPARTAMENTO2'])); 
        if(r['CATEGORIA']) setCat.add(reglas.cleanName(r['CATEGORIA']));
        if(r['PROVEEDOR']) setProv.add(reglas.cleanName(r['PROVEEDOR']));
    });

    const llenar = (id, dataSet) => {
        const select = $(id); select.empty();
        Array.from(dataSet).sort().forEach(item => select.append(new Option(item, item)));
    };

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
    const fCat = $('#f-cat').val() || [];
    const fProv = $('#f-prov').val() || [];
    const fDep = $('#f-dep').val() || [];
    const fMetric = $('#f-metric').val(); 
    const fFlujo = $('input[name="btnFlujo"]:checked').val();

    // 4.1 Filtrar SALDOS 
    let totalCosto = 0, totalStock = 0;
    let saldosTabla = [];
    
    rawSaldos.forEach(row => {
        let cat = reglas.cleanName(row['CATEGORIA']);
        let prov = reglas.cleanName(row['PROVEEDOR']);

        if (fCat.length && !fCat.includes(cat)) return;
        if (fProv.length && !fProv.includes(prov)) return;

        let stock = reglas.cleanNumber(row['SALDOUNDTOTAL']);
        let costo = reglas.cleanNumber(row['TOTAL COSTO UND.']);

        totalStock += stock;
        totalCosto += costo;

        saldosTabla.push({
            Division: reglas.cleanName(row['DIVISION']),
            Categoria: cat,
            Grupo: reglas.cleanName(row['GRUPO']),
            Proveedor: prov,
            Stock: stock,
            Costo: costo
        });
    });

    // 4.2 Filtrar MOVIMIENTOS
    let totalPos = 0, totalNeg = 0;
    let consumoPorDepto = {}, consumoPorCat = {}, consumoPorProv = {}, consumoPorGrp = {};
    
    let lineIn25 = Array(12).fill(0), lineOut25 = Array(12).fill(0);
    let lineIn26 = Array(12).fill(0), lineOut26 = Array(12).fill(0);
    
    filteredMovsData = []; // Reseteamos la data filtrada global
    let resumenMap = {}; // Para agrupar la tabla Resumen

    const metricKey = fMetric === 'und' ? 'UNIDAD' : 'COSTO';

    rawMovimientos.forEach(row => {
        let mesStr = (row['MES'] || "SIN ESPECIFICAR").toUpperCase();
        let cat = reglas.cleanName(row['CATEGORIA']);
        let prov = reglas.cleanName(row['PROVEEDOR']);
        let depto = reglas.cleanName(row['DEPARTAMENTO2']);
        let grp = reglas.cleanName(row['GRUPO']);

        if (fMes.length && !fMes.includes(mesStr)) return;
        if (fCat.length && !fCat.includes(cat)) return;
        if (fProv.length && !fProv.includes(prov)) return;
        if (fDep.length && !fDep.includes(depto)) return;

        let mesIdx = MESES_ORDEN.indexOf(mesStr);
        let filaPos = 0, filaNeg = 0;
        
        let out25 = 0, out26 = 0, in25 = 0, in26 = 0;

        Object.keys(row).forEach(k => {
            if (!k.includes(metricKey)) return; 
            
            let is2025 = k.includes('2025');
            let is2026 = k.includes('2026');
            let isPos = k.includes('POS');
            let isNeg = k.includes('NEG'); 
            
            let val = reglas.cleanNumber(row[k]);

            if (fYear.length > 0) {
                if (is2025 && !fYear.includes('2025')) return;
                if (is2026 && !fYear.includes('2026')) return;
            }

            if (isPos) { totalPos += val; filaPos += val; }
            if (isNeg) { totalNeg += val; filaNeg += val; }

            // Guardamos para la tabla de resumen
            if(is2025 && isNeg) out25 += val;
            if(is2026 && isNeg) out26 += val;
            if(is2025 && isPos) in25 += val;
            if(is2026 && isPos) in26 += val;

            // Gráfico de líneas (Math.abs para dibujo)
            if (mesIdx >= 0) {
                if(is2025 && isPos) lineIn25[mesIdx] += Math.abs(val);
                if(is2025 && isNeg) lineOut25[mesIdx] += Math.abs(val);
                if(is2026 && isPos) lineIn26[mesIdx] += Math.abs(val);
                if(is2026 && isNeg) lineOut26[mesIdx] += Math.abs(val);
            }
        });

        // Guardamos la fila si tuvo movimiento para el Detail
        if(out25 !== 0 || out26 !== 0 || in25 !== 0 || in26 !== 0) {
            filteredMovsData.push({
                Mes: mesStr, Departamento: depto, Categoria: cat, Grupo: grp, Proveedor: prov,
                Out25: out25, Out26: out26, In25: in25, In26: in26
            });

            // Agregamos al Resumen
            let keyResumen = mesStr + '|' + depto;
            if(!resumenMap[keyResumen]) resumenMap[keyResumen] = { Mes: mesStr, Departamento: depto, Out25: 0, Out26: 0, In25: 0, In26: 0 };
            resumenMap[keyResumen].Out25 += out25;
            resumenMap[keyResumen].Out26 += out26;
            resumenMap[keyResumen].In25 += in25;
            resumenMap[keyResumen].In26 += in26;
        }

        // Sumar Tops basados en el flujo.
        let valorTops = 0;
        if (fFlujo === 'all' || fFlujo === 'out') valorTops += filaNeg; 
        if (fFlujo === 'in') valorTops += filaPos; 

        consumoPorDepto[depto] = (consumoPorDepto[depto] || 0) + valorTops;
        consumoPorCat[cat] = (consumoPorCat[cat] || 0) + valorTops;
        consumoPorProv[prov] = (consumoPorProv[prov] || 0) + valorTops;
        consumoPorGrp[grp] = (consumoPorGrp[grp] || 0) + valorTops;
    });

    // 4.3 Inyectar Valores a HTML
    let prefix = fMetric === 'cst' ? 'L ' : '';
    let configNum = fMetric === 'cst' ? {minimumFractionDigits: 2, maximumFractionDigits: 2} : {maximumFractionDigits: 0};

    $('#k-cost').text('L ' + totalCosto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    $('#k-stock').text(totalStock.toLocaleString('en-US'));
    $('#k-pos').text(prefix + Math.abs(totalPos).toLocaleString('en-US', configNum));
    $('#k-neg').text(prefix + Math.abs(totalNeg).toLocaleString('en-US', configNum));

    let topDepto = Object.entries(consumoPorDepto).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    let topCat = Object.entries(consumoPorCat).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    $('#k-top-d').text(topDepto.length > 0 ? topDepto[0][0].substring(0,25) : '-');
    $('#k-top-c').text(topCat.length > 0 ? topCat[0][0].substring(0,25) : '-');

    actualizarTablaSaldos(saldosTabla);
    
    // Si la vista de detalle está abierta, forzar a regresar a la de resumen al filtrar global
    $('#view-detalle').hide(); 
    $('#view-resumen').show();
    
    actualizarTablaMovsResumen(Object.values(resumenMap), prefix, configNum);

    actualizarGraficos({
        lineIn25, lineOut25, lineIn26, lineOut26,
        consumoPorDepto, consumoPorCat, consumoPorProv, consumoPorGrp,
        fFlujo, fYear, prefix, configNum
    });
}

// 5. DATA TABLES (Saldos)
function actualizarTablaSaldos(datosTabla) {
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

// 5.1 DATA TABLES (Movimientos - Resumen)
function actualizarTablaMovsResumen(datosTabla, prefix, configNum) {
    if($.fn.DataTable.isDataTable('#tablaMovsResumen')) {
        tableMovsResumen.clear().rows.add(datosTabla).draw();
        return;
    }
    tableMovsResumen = $('#tablaMovsResumen').DataTable({
        data: datosTabla,
        pageLength: 10,
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        order: [[0, 'asc']], 
        columns: [
            { data: 'Mes', defaultContent: '-' },
            { data: 'Departamento', defaultContent: '-' },
            { data: 'Out25', className: 'num text-danger fw-bold', render: (data, t) => t==='display' ? (data !== 0 ? prefix + data.toLocaleString('en-US', configNum) : '-') : data },
            { data: 'Out26', className: 'num text-danger fw-bold', render: (data, t) => t==='display' ? (data !== 0 ? prefix + data.toLocaleString('en-US', configNum) : '-') : data },
            { data: 'In25', className: 'num text-success fw-bold', render: (data, t) => t==='display' ? (data !== 0 ? prefix + data.toLocaleString('en-US', configNum) : '-') : data },
            { data: 'In26', className: 'num text-success fw-bold', render: (data, t) => t==='display' ? (data !== 0 ? prefix + data.toLocaleString('en-US', configNum) : '-') : data }
        ]
    });
}

// 5.2 DRILL-DOWN: VISTA DETALLE
function abrirDetalleMovimientos(mes, depto) {
    let titulo = mes === 'TODOS' ? 'Historial Completo' : `Detalle: ${mes} - ${depto}`;
    $('#titulo-detalle').text(titulo);

    let prefix = $('#f-metric').val() === 'cst' ? 'L ' : '';
    let configNum = $('#f-metric').val() === 'cst' ? {minimumFractionDigits: 2, maximumFractionDigits: 2} : {maximumFractionDigits: 0};

    let dataDetalle = [];
    let sumOut25 = 0, sumOut26 = 0, sumIn25 = 0, sumIn26 = 0;

    filteredMovsData.forEach(d => {
        if(mes !== 'TODOS' && d.Mes !== mes) return;
        if(depto !== 'TODOS' && d.Departamento !== depto) return;
        
        sumOut25 += d.Out25; sumOut26 += d.Out26;
        sumIn25 += d.In25; sumIn26 += d.In26;
        
        dataDetalle.push(d);
    });

    // Actualizar Mini KPIs
    $('#det-out-25').text(prefix + sumOut25.toLocaleString('en-US', configNum));
    $('#det-out-26').text(prefix + sumOut26.toLocaleString('en-US', configNum));
    $('#det-in-25').text(prefix + sumIn25.toLocaleString('en-US', configNum));
    $('#det-in-26').text(prefix + sumIn26.toLocaleString('en-US', configNum));

    if($.fn.DataTable.isDataTable('#tablaMovsDetalle')) {
        tableMovsDetalle.clear().rows.add(dataDetalle).draw();
    } else {
        tableMovsDetalle = $('#tablaMovsDetalle').DataTable({
            data: dataDetalle,
            pageLength: 15,
            language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            order: [[4, 'asc']], // Ordenar por Salidas 25
            columns: [
                { data: 'Mes', defaultContent: '-' },
                { data: 'Departamento', defaultContent: '-' },
                { data: 'Categoria', defaultContent: '-' },
                { data: 'Grupo', defaultContent: '-' },
                { data: 'Out25', className: 'num text-danger', render: (data, t) => t==='display' ? (data !== 0 ? prefix + data.toLocaleString('en-US', configNum) : '-') : data },
                { data: 'Out26', className: 'num text-danger', render: (data, t) => t==='display' ? (data !== 0 ? prefix + data.toLocaleString('en-US', configNum) : '-') : data },
                { data: 'In25', className: 'num text-success', render: (data, t) => t==='display' ? (data !== 0 ? prefix + data.toLocaleString('en-US', configNum) : '-') : data },
                { data: 'In26', className: 'num text-success', render: (data, t) => t==='display' ? (data !== 0 ? prefix + data.toLocaleString('en-US', configNum) : '-') : data }
            ]
        });
    }

    // Transición visual
    $('#view-resumen').hide();
    $('#view-detalle').fadeIn();
}


// 6. GRÁFICOS (CHART.JS) ESTÉTICA 100% CORREGIDA (NEGRO Y NEGRITA)
function actualizarGraficos(gData) {
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    Object.values(charts).forEach(c => c.destroy()); 

    const { lineIn25, lineOut25, lineIn26, lineOut26, fFlujo, fYear, prefix, configNum } = gData;

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
        options: { 
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { top: 20, bottom: 10, right: 20, left: 10 } },
            scales: { 
                x: { grid: { display: false }, ticks: { color: '#000', font: { weight: 'bold', size: 11 } } }, 
                y: { grid: { display: false }, ticks: { display: false }, border: { display: false } } 
            },
            plugins: { 
                legend: { display: true, position: 'bottom', labels: { color: '#000', font: { weight: 'bold' } } }, 
                datalabels: { display: false }, // Apagado en líneas
                tooltip: {
                    callbacks: {
                        label: function(context) { return context.dataset.label + ': ' + prefix + context.parsed.y.toLocaleString('en-US', configNum); }
                    }
                }
            } 
        }
    });

    // --- GRÁFICOS BARRAS VERTICALES (-45 Grados Perfecto, Letra Negra y Negrita) ---
    const renderBarV = (id, dataObj, color) => {
        let sorted = Object.entries(dataObj).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0, 12);
        
        charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: {
                labels: sorted.map(d => d[0].length > 20 ? d[0].substring(0, 20) + '...' : d[0]),
                datasets: [{ data: sorted.map(d => Math.abs(d[1])), backgroundColor: color, borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { top: 65, bottom: 0, right: 10, left: 10 } }, 
                scales: { 
                    x: { 
                        grid: { display: false }, 
                        ticks: { maxRotation: 45, minRotation: 45, color: '#000', font: { weight: 'bold', size: 10 } } 
                    }, 
                    y: { grid: { display: false }, ticks: { display: false }, border: { display: false } } 
                },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'end', // Empuja el número hacia ARRIBA de la barra
                        rotation: -45, // Ángulo
                        offset: 4, // Separación de la barra
                        color: '#000000', // Negro oscuro
                        font: { weight: 'bold', size: 11 }, // Negrita y buen tamaño
                        formatter: v => {
                            let absV = Math.abs(v);
                            return absV > 0 ? prefix + absV.toLocaleString('en-US', configNum) : '';
                        }
                    },
                    tooltip: {
                        callbacks: { label: function(context) { return prefix + context.parsed.y.toLocaleString('en-US', configNum); } }
                    }
                }
            }
        });
    };

    renderBarV('c-dept', gData.consumoPorDepto, '#E1251B');
    renderBarV('c-cat', gData.consumoPorCat, '#012094');

    // --- GRÁFICOS BARRAS HORIZONTALES (Negritas y Color Negro) ---
    const renderBarH = (id, dataObj, color) => {
        let sorted = Object.entries(dataObj).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0, 15);

        charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: {
                labels: sorted.map(d => d[0].length > 30 ? d[0].substring(0, 30) + '...' : d[0]),
                datasets: [{ data: sorted.map(d => Math.abs(d[1])), backgroundColor: color, borderRadius: 4, barPercentage: 0.8 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y', 
                layout: { padding: { top: 10, bottom: 10, right: 120, left: 10 } }, 
                scales: { 
                    x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
                    y: { grid: { display: false }, ticks: { display: true, color: '#000', font: { weight: 'bold', size: 10 } }, border: { display: false } } 
                },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'right', // Fuera de la barra
                        color: '#000000', // Negro puro
                        font: { weight: 'bold', size: 11 }, // Negrita y legible
                        formatter: v => {
                            let absV = Math.abs(v);
                            return absV > 0 ? prefix + absV.toLocaleString('en-US', configNum) : '';
                        }
                    },
                    tooltip: {
                        callbacks: { label: function(context) { return prefix + context.parsed.x.toLocaleString('en-US', configNum); } }
                    }
                }
            }
        });
    };

    renderBarH('c-prov', gData.consumoPorProv, '#2c3e50');
    renderBarH('c-grp', gData.consumoPorGrp, '#00b4db');
}
