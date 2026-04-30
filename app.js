Chart.register(ChartDataLabels);

// Variables Globales
let rawSaldos = [];
let rawMovimientos = [];
let charts = {};
let tableDetalle;

const MESES_ORDEN = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// 1. REGLAS DE NEGOCIO Y LIMPIEZA
const reglas = {
    cleanNumber: (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const strNum = val.toString().replace(/[L$,\s]/gi, '').trim();
        const num = parseFloat(strNum);
        return isNaN(num) ? 0 : num;
    },

    getEmpresa: (tienda) => {
        tienda = (tienda || "").toUpperCase();
        if (tienda.includes("DS") || tienda.includes("VITRINA")) return "DANILOS STORE";
        return "EL COMPADRE";
    },

    getTipoInterno: (tienda, categoria) => {
        tienda = (tienda || "").toUpperCase();
        categoria = (categoria || "").toUpperCase();
        // Clasificación corporativa estricta
        if (tienda.includes("CD ") || tienda.includes("CEDIS") || tienda.includes("MEGABODEGA") || 
            categoria === "ALMACEN" || tienda.includes("AEC") || tienda.includes("DS")) {
            return "CEDIS";
        }
        return "TIENDA";
    },

    getFiltroVisual: (tipoInterno) => {
        return tipoInterno === "CEDIS" ? "MAYOREO" : "DETALLE";
    }
};

// Limpia los encabezados de Excel (elimina caracteres ocultos y pone mayúsculas)
function normalizeRow(row) {
    let normalized = {};
    for (let key in row) {
        if (key) {
            let newKey = key.replace(/^\uFEFF/, '').trim().toUpperCase();
            normalized[newKey] = row[key];
        }
    }
    // Agregar TiendaVisual calculada al vuelo para facilitar filtros
    let division = normalized['SUCURSAL'] || normalized['DIVISION'] || "";
    let categoria = normalized['CATEGORIA'] || "";
    normalized['TIENDAVISUAL'] = reglas.getFiltroVisual(reglas.getTipoInterno(division, categoria));
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
        aplicarFiltrosYRenderizar(); // Primer render
        $('#loader-overlay').fadeOut();
    }).catch(err => {
        console.error(err);
        $('#loader-overlay').html('<h4 class="text-danger fw-bold">Error al cargar datos.</h4>');
    });

    $('#btn-reset').click(function() {
        $('.select2').val(null).trigger('change');
        $('#btnFlujoAmbos').prop('checked', true).trigger('change');
    });
});

// 3. LLENADO DE FILTROS DESPLEGABLES
function prepararFiltrosDropdowns() {
    let setCat = new Set(), setProv = new Set(), setDep = new Set();
    
    rawSaldos.forEach(r => { if(r['CATEGORIA']) setCat.add(r['CATEGORIA']); if(r['PROVEEDOR']) setProv.add(r['PROVEEDOR']); });
    rawMovimientos.forEach(r => { 
        if(r['DEPARTAMENTO2']) setDep.add(r['DEPARTAMENTO2']); 
        if(r['CATEGORIA']) setCat.add(r['CATEGORIA']);
        if(r['PROVEEDOR']) setProv.add(r['PROVEEDOR']);
    });

    const llenar = (id, dataSet) => {
        const select = $(id); select.empty();
        Array.from(dataSet).sort().forEach(item => select.append(new Option(item, item)));
    };

    llenar('#f-cat', setCat); llenar('#f-prov', setProv); llenar('#f-dep', setDep);
    
    $('#f-year').empty().append(new Option('2025', '2025')).append(new Option('2026', '2026'));
    $('#f-mes').empty(); MESES_ORDEN.forEach(m => $('#f-mes').append(new Option(m, m)));
    $('#f-tienda-tipo').empty().append(new Option('DETALLE', 'DETALLE')).append(new Option('MAYOREO', 'MAYOREO'));
    
    // Dejar todos sin selección inicial (Muestra Todo)
    $('.select2:not(#f-metric)').val(null).trigger('change.select2');
}

// Escuchar cambios en cualquier filtro
function bindEventosFiltros() {
    $('.select2').on('change', function() { aplicarFiltrosYRenderizar(); });
    $('input[name="btnFlujo"]').on('change', function() { aplicarFiltrosYRenderizar(); });
}

// 4. MOTOR PRINCIPAL: FILTRA Y RECALCULA
function aplicarFiltrosYRenderizar() {
    // 4.1 Leer Filtros Seleccionados
    const fYear = $('#f-year').val() || [];
    const fMes = $('#f-mes').val() || [];
    const fTienda = $('#f-tienda-tipo').val() || [];
    const fCat = $('#f-cat').val() || [];
    const fProv = $('#f-prov').val() || [];
    const fDep = $('#f-dep').val() || [];
    const fMetric = $('#f-metric').val(); // 'und' o 'cst'
    const fFlujo = $('input[name="btnFlujo"]:checked').val(); // 'all', 'in', 'out'

    // 4.2 Filtrar SALDOS (Afecta Stock Físico, Costo e Inventario DataTable)
    let totalCosto = 0, totalStock = 0;
    let saldosTabla = [];
    
    rawSaldos.forEach(row => {
        if (fTienda.length && !fTienda.includes(row['TIENDAVISUAL'])) return;
        if (fCat.length && !fCat.includes(row['CATEGORIA'])) return;
        if (fProv.length && !fProv.includes(row['PROVEEDOR'])) return;

        let division = row['SUCURSAL'] || row['DIVISION'] || "";
        let stock = reglas.cleanNumber(row['SALDOUNDTOTAL']);
        let costo = reglas.cleanNumber(row['TOTAL COSTO UND.']);

        totalStock += stock;
        totalCosto += costo;

        saldosTabla.push({
            Empresa: reglas.getEmpresa(division),
            Division: division,
            Categoria: row['CATEGORIA'] || "",
            Proveedor: row['PROVEEDOR'] || "SIN ESPECIFICAR",
            TiendaVisual: row['TIENDAVISUAL'],
            Stock: stock,
            Costo: costo,
            Grupo: row['GRUPO'] || ""
        });
    });

    // 4.3 Filtrar MOVIMIENTOS (Afecta Entradas, Salidas, Tops y Gráfico de Líneas)
    let totalPos = 0, totalNeg = 0;
    let consumoPorDepto = {}, consumoPorCat = {}, consumoPorProv = {}, consumoPorGrp = {};
    
    // Arrays para gráfico de 4 líneas (12 meses)
    let lineIn25 = Array(12).fill(0), lineOut25 = Array(12).fill(0);
    let lineIn26 = Array(12).fill(0), lineOut26 = Array(12).fill(0);

    // Definir qué palabra buscar según el filtro de métrica
    const colWord = fMetric === 'und' ? 'UNIDAD' : 'COSTO';

    rawMovimientos.forEach(row => {
        let mesStr = (row['MES'] || "").toUpperCase();
        if (fMes.length && !fMes.includes(mesStr)) return;
        if (fTienda.length && !fTienda.includes(row['TIENDAVISUAL'])) return;
        if (fCat.length && !fCat.includes(row['CATEGORIA'])) return;
        if (fProv.length && !fProv.includes(row['PROVEEDOR'])) return;
        if (fDep.length && !fDep.includes(row['DEPARTAMENTO2'])) return;

        let mesIdx = MESES_ORDEN.indexOf(mesStr);
        let depto = row['DEPARTAMENTO2'] || "SIN ASIGNAR";
        let cat = row['CATEGORIA'] || "SIN ASIGNAR";
        let prov = row['PROVEEDOR'] || "SIN ASIGNAR";
        let grp = row['GRUPO'] || "SIN ASIGNAR";

        let filaPos = 0, filaNeg = 0;

        // Analizar cada columna para sumar dinámicamente según el año
        Object.keys(row).forEach(k => {
            if (!k.includes(colWord)) return; // Si no es la métrica seleccionada, ignorar

            let is2025 = k.includes('2025');
            let is2026 = k.includes('2026');
            let isPos = k.includes('POS');
            let isNeg = k.includes('NEG');
            let val = Math.abs(reglas.cleanNumber(row[k]));

            // Filtrar por año seleccionado
            if (fYear.length > 0) {
                if (is2025 && !fYear.includes('2025')) return;
                if (is2026 && !fYear.includes('2026')) return;
            }

            // Suma Globales
            if (isPos) { totalPos += val; filaPos += val; }
            if (isNeg) { totalNeg += val; filaNeg += val; }

            // Llenar datos para el gráfico de líneas si es un mes válido
            if (mesIdx >= 0) {
                if(is2025 && isPos) lineIn25[mesIdx] += val;
                if(is2025 && isNeg) lineOut25[mesIdx] += val;
                if(is2026 && isPos) lineIn26[mesIdx] += val;
                if(is2026 && isNeg) lineOut26[mesIdx] += val;
            }
        });

        // Sumar a los Top según el flujo seleccionado (Si es "Solo Entradas" el top es de lo recibido, sino es de lo consumido)
        let valorParaTops = (fFlujo === 'in') ? filaPos : filaNeg;
        
        consumoPorDepto[depto] = (consumoPorDepto[depto] || 0) + valorParaTops;
        consumoPorCat[cat] = (consumoPorCat[cat] || 0) + valorParaTops;
        consumoPorProv[prov] = (consumoPorProv[prov] || 0) + valorParaTops;
        consumoPorGrp[grp] = (consumoPorGrp[grp] || 0) + valorParaTops;
    });

    // 4.4 Inyectar KPI Visuales
    let prefix = fMetric === 'cst' ? 'L ' : '';
    let configNum = fMetric === 'cst' ? {minimumFractionDigits: 2, maximumFractionDigits: 2} : {maximumFractionDigits: 0};

    $('#k-cost').text('L ' + totalCosto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    $('#k-stock').text(totalStock.toLocaleString('en-US'));
    $('#k-pos').text(prefix + totalPos.toLocaleString('en-US', configNum));
    $('#k-neg').text(prefix + totalNeg.toLocaleString('en-US', configNum));

    let topDepto = Object.entries(consumoPorDepto).sort((a,b)=>b[1]-a[1]);
    let topCat = Object.entries(consumoPorCat).sort((a,b)=>b[1]-a[1]);
    $('#k-top-d').text(topDepto.length > 0 ? topDepto[0][0].substring(0,20) : '-');
    $('#k-top-c').text(topCat.length > 0 ? topCat[0][0].substring(0,20) : '-');

    // 4.5 Actualizar Tabla y Gráficos
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
        order: [[6, 'desc']],
        columns: [
            { data: 'Empresa', defaultContent: '-' },
            { data: 'Division', defaultContent: '-' },
            { data: 'Categoria', defaultContent: '-' },
            { data: 'Proveedor', defaultContent: '-' },
            { 
                data: 'TiendaVisual',
                render: data => `<span class="badge bg-${data==='MAYOREO'?'primary':'secondary'}">${data}</span>`
            },
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

// 6. GRÁFICOS (CHART.JS)
function actualizarGraficos(dataGraficos) {
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    Object.values(charts).forEach(c => c.destroy()); // Limpiar gráficos anteriores

    const { lineIn25, lineOut25, lineIn26, lineOut26, fFlujo, fYear, prefix, configNum } = dataGraficos;

    const optBase = {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { grid: { display: false } }, y: { grid: { display: false }, ticks: { display: false }, border: { display: false } } },
        plugins: {
            legend: { display: false },
            datalabels: {
                anchor: 'end', align: 'top', color: '#333', font: { weight: 'bold', size: 10 },
                formatter: v => v > 0 ? prefix + v.toLocaleString('en-US', configNum) : ''
            }
        }
    };

    // --- GRÁFICO 1: RESPIRACIÓN LOGÍSTICA (LÍNEAS) ---
    let datasetsLine = [];
    let show25 = fYear.length === 0 || fYear.includes('2025');
    let show26 = fYear.length === 0 || fYear.includes('2026');

    if (show25 && (fFlujo === 'all' || fFlujo === 'in')) {
        datasetsLine.push({ label: 'Entradas 2025 (+)', data: lineIn25, borderColor: '#0082c8', borderDash: [5, 5], tension: 0.3 });
    }
    if (show25 && (fFlujo === 'all' || fFlujo === 'out')) {
        datasetsLine.push({ label: 'Salidas 2025 (-)', data: lineOut25, borderColor: '#ff7b72', borderDash: [5, 5], tension: 0.3 });
    }
    if (show26 && (fFlujo === 'all' || fFlujo === 'in')) {
        datasetsLine.push({ label: 'Entradas 2026 (+)', data: lineIn26, borderColor: '#012094', borderWidth: 3, tension: 0.3 });
    }
    if (show26 && (fFlujo === 'all' || fFlujo === 'out')) {
        datasetsLine.push({ label: 'Salidas 2026 (-)', data: lineOut26, borderColor: '#E1251B', borderWidth: 3, tension: 0.3 });
    }

    charts.cResp = new Chart(document.getElementById('c-respiracion').getContext('2d'), {
        type: 'line',
        data: { labels: MESES_ORDEN, datasets: datasetsLine },
        options: { ...optBase, plugins: { legend: { display: true, position: 'bottom' }, datalabels: { display: false } } }
    });

    // Función auxiliar para crear gráficos de barras
    const renderBar = (id, dataObj, color, isHorizontal = false) => {
        let sorted = Object.entries(dataObj).sort((a,b)=>b[1]-a[1]).slice(0, 15);
        let opts = JSON.parse(JSON.stringify(optBase));
        if(isHorizontal) {
            opts.indexAxis = 'y';
            opts.plugins.datalabels.anchor = 'end';
            opts.plugins.datalabels.align = 'right';
        }
        // Custom Datalabels formatter for Bars
        opts.plugins.datalabels.formatter = v => v > 0 ? prefix + v.toLocaleString('en-US', configNum) : '';

        charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: {
                labels: sorted.map(d => d[0].substring(0, 18)),
                datasets: [{ data: sorted.map(d => d[1]), backgroundColor: color, borderRadius: 4 }]
            },
            options: opts
        });
    };

    renderBar('c-dept', dataGraficos.consumoPorDepto, '#E1251B');
    renderBar('c-cat', dataGraficos.consumoPorCat, '#012094');
    renderBar('c-prov', dataGraficos.consumoPorProv, '#2c3e50', true);
    renderBar('c-grp', dataGraficos.consumoPorGrp, '#00b4db', true);
}
