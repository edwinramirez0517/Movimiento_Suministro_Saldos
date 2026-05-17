Chart.register(ChartDataLabels);

// Variables Globales
let rawSaldos = [];
let rawMovimientos = [];
let filteredMovsData = []; 
let charts = {};
let tableDetalle;
let tableMovsResumen;
let tableMovsDetalle;

const MESES_ORDEN = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

// Reglas de Negocio y Clasificación
const reglas = {
    cleanNumber: (val) => {
        if (val === null || val === undefined || val === '') {
            return 0;
        }
        if (typeof val === 'number') {
            return isNaN(val) ? 0 : val;
        }
        const strNum = val.toString().replace(/[L$,\s]/gi, '').trim();
        const num = parseFloat(strNum);
        return isNaN(num) ? 0 : num;
    },
    cleanName: (name) => {
        if (!name || name === '0' || name === 0 || name.toString().trim() === '') {
            return "SIN ESPECIFICAR";
        }
        return name.toString().toUpperCase().trim();
    },
    getTipoUbicacion: (almacen, depto) => {
        almacen = (almacen || "").toUpperCase().trim();
        depto = (depto || "").toUpperCase().trim();
        
        if (depto.includes("HOTEL")) {
            return "HOTELES";
        }
        if (depto.includes("CASA")) {
            return "CASAS";
        }
        
        const isVehiculo = depto.includes("BUSITO") || 
                           depto.includes("CAMION") || 
                           depto.includes("TOYOTA") || 
                           depto.includes("HONDA") || 
                           depto.includes("ISUZU") || 
                           depto.includes("MITSUBISHI") || 
                           depto.includes("HYUNDAI") || 
                           depto.includes("KIA") || 
                           depto.includes("VEHICULO") || 
                           /^[HJ][A-Z]{2}\d{4}$/.test(almacen);
                           
        if (isVehiculo) {
            return "VEHICULOS";
        }
        
        if (almacen.startsWith("T") || 
            depto.includes("AEC") || 
            depto.includes("DS ") || 
            depto === "DS" || 
            depto.includes("MAYOREO") || 
            depto.includes("MEGABODEGA") || 
            depto.includes("VITRINA")) {
            return "TIENDAS";
        }
        
        return "DEPARTAMENTOS";
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
    let almacen = normalized['ALMACEN'] || normalized['SUCURSAL'] || "";
    let depto = normalized['DEPARTAMENTO2'] || normalized['DIVISION'] || "";
    normalized['TIPO_UBICACION'] = reglas.getTipoUbicacion(almacen, depto);
    
    return normalized;
}

// Inicialización
$(document).ready(function () {
    $('.select2').select2({ theme: 'bootstrap-5', placeholder: "Todos...", allowClear: true });
    $('#fecha-hoy').text(new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }));

    Promise.all([
        new Promise((res, rej) => Papa.parse("saldo_almacen_suministro.csv", { download: true, delimiter: ";", header: true, skipEmptyLines: true, complete: res, error: rej })),
        new Promise((res, rej) => Papa.parse("movimiento_suministro_2025_2026.csv", { download: true, delimiter: ";", header: true, skipEmptyLines: true, complete: res, error: rej }))
    ]).then(results => {
        try {
            rawSaldos = results[0].data.map(normalizeRow);
            rawMovimientos = results[1].data.map(normalizeRow);
            
            prepararFiltrosDropdowns();
            renderizarSaldosFijos(); 
            
            bindEventosFiltros();
            aplicarFiltrosYRenderizar(); 
            
            $('#loader-overlay').fadeOut();
        } catch (error) {
            console.error("Error en el cálculo interno:", error);
            $('#loader-text').text("Error: Revise la estructura de los datos CSV.");
            $('#loader-text').removeClass('text-primary').addClass('text-danger');
        }
    }).catch(err => {
        console.error("Fallo al leer los archivos CSV:", err);
        $('#loader-text').html("No se encontraron los archivos CSV o hay un error de conexión.");
        $('#loader-text').removeClass('text-primary').addClass('text-danger');
    });

    $('#btn-reset-real').click(function() {
        $('.select2').val(null).trigger('change');
        $('#btnFlujoAmbos').prop('checked', true).trigger('change');
        $('#f-metric').val('und').trigger('change.select2'); 
    });

    // Abrir Panel de Detalle al hacer clic en el resumen
    $('#tablaMovsResumen tbody').on('click', 'tr', function () {
        if(!tableMovsResumen) {
            return;
        }
        let data = tableMovsResumen.row(this).data();
        if(data) {
            abrirDashboardDetalle(data.Departamento);
        }
    });

    // Botón para volver al Dashboard Principal
    $('#btn-volver-resumen').click(function() {
        $('#dashboard-detalle').hide();
        $('#dashboard-principal').fadeIn();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

function prepararFiltrosDropdowns() {
    let setTipo = new Set();
    let setCat = new Set();
    let setProv = new Set();
    let setDep = new Set();
    
    rawSaldos.forEach(r => {
        if(r['TIPO_UBICACION']) {
            setTipo.add(r['TIPO_UBICACION']);
        }
        if(r['CATEGORIA']) {
            setCat.add(reglas.cleanName(r['CATEGORIA']));
        }
        if(r['PROVEEDOR']) {
            setProv.add(reglas.cleanName(r['PROVEEDOR']));
        }
    });
    
    rawMovimientos.forEach(r => {
        if(r['TIPO_UBICACION']) {
            setTipo.add(r['TIPO_UBICACION']);
        }
        if(r['DEPARTAMENTO2']) {
            setDep.add(reglas.cleanName(r['DEPARTAMENTO2']));
        }
        if(r['CATEGORIA']) {
            setCat.add(reglas.cleanName(r['CATEGORIA']));
        }
        if(r['PROVEEDOR']) {
            setProv.add(reglas.cleanName(r['PROVEEDOR']));
        }
    });

    const llenar = (id, dataSet) => {
        const select = $(id);
        select.empty();
        Array.from(dataSet).sort().forEach(item => {
            select.append(new Option(item, item));
        });
    };

    llenar('#f-tipo', setTipo);
    llenar('#f-cat', setCat);
    llenar('#f-prov', setProv);
    llenar('#f-dep', setDep);
    
    $('#f-year').empty();
    $('#f-year').append(new Option('2025', '2025'));
    $('#f-year').append(new Option('2026', '2026'));
    
    $('#f-mes').empty();
    MESES_ORDEN.forEach(m => {
        $('#f-mes').append(new Option(m, m));
    });
    
    $('.select2:not(#f-metric)').val(null).trigger('change.select2');
}

function bindEventosFiltros() {
    $('.select2').on('change', aplicarFiltrosYRenderizar);
    $('input[name="btnFlujo"]').on('change', aplicarFiltrosYRenderizar);
}

// 1. INVENTARIO MAESTRO
function renderizarSaldosFijos() {
    let totalCosto = 0;
    let totalStock = 0;
    let saldosTabla = [];
    
    rawSaldos.forEach(row => {
        let stockVal = row['SALDOUNDTOTAL'] || row['SALDO UND TOTAL'] || 0;
        let costoVal = row['TOTAL COSTO UND.'] || row['TOTAL COSTO'] || 0;

        let stock = reglas.cleanNumber(stockVal);
        let costo = reglas.cleanNumber(costoVal);
        
        totalStock += stock;
        totalCosto += costo;

        saldosTabla.push({
            Division: reglas.cleanName(row['DIVISION']),
            Categoria: reglas.cleanName(row['CATEGORIA']),
            Grupo: reglas.cleanName(row['GRUPO']),
            Proveedor: reglas.cleanName(row['PROVEEDOR']),
            SKU: row['PRODUCTO'] || row['ITEM NO_'] || "N/A", 
            Descripcion: row['PRODNOMBRE'] || row['DESCRIPCION'] || "SIN DESCRIPCIÓN", 
            Stock: isNaN(stock) ? 0 : stock,
            Costo: isNaN(costo) ? 0 : costo
        });
    });

    $('#k-cost').text('L ' + totalCosto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    $('#k-stock').text(totalStock.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));

    if($.fn.DataTable.isDataTable('#tablaDetalle')) {
        $('#tablaDetalle').DataTable().destroy();
    }
    
    tableDetalle = $('#tablaDetalle').DataTable({
        data: saldosTabla,
        pageLength: 15,
        language: { 
            url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' 
        },
        order: [[6, 'desc']], 
        dom: '<"row mb-3"<"col-sm-12 col-md-6"B><"col-sm-12 col-md-6"f>>rt<"row mt-3"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        buttons: [
            { 
                extend: 'excelHtml5', 
                text: '<i class="fa-solid fa-file-excel me-1"></i> Exportar a Excel', 
                className: 'btn btn-success fw-bold shadow-sm', 
                title: 'Auditoria_Saldos_ElCompadre' 
            }
        ],
        columns: [
            { data: 'Division' },
            { data: 'Categoria' },
            { data: 'Grupo' },
            { data: 'Proveedor' },
            { data: 'SKU' },
            { data: 'Descripcion' },
            { 
                data: 'Stock', 
                className: 'num', 
                render: (d, t) => t==='display' ? `<span class="badge bg-${d>0?'success':(d<0?'danger':'dark')} px-3 py-2">${parseFloat(d||0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>` : d 
            },
            { 
                data: 'Costo', 
                className: 'num', 
                render: (d, t) => t==='display' ? `<strong>L ${parseFloat(d||0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>` : d 
            }
        ]
    });
}

// 2. MOTOR DE MOVIMIENTOS
function aplicarFiltrosYRenderizar() {
    const fYear = $('#f-year').val() || [];
    const fMes = $('#f-mes').val() || [];
    const fTipo = $('#f-tipo').val() || [];
    const fCat = $('#f-cat').val() || [];
    const fProv = $('#f-prov').val() || [];
    const fDep = $('#f-dep').val() || [];
    const fMetric = $('#f-metric').val(); 
    const fFlujo = $('input[name="btnFlujo"]:checked').val();

    let totalPos = 0;
    let totalNeg = 0;
    let consumoPorDepto = {};
    let consumoPorCat = {};
    let consumoPorProv = {};
    let consumoPorGrp = {};
    
    let lineIn25 = Array(12).fill(0);
    let lineOut25 = Array(12).fill(0);
    let lineIn26 = Array(12).fill(0);
    let lineOut26 = Array(12).fill(0);
    
    filteredMovsData = []; 
    let resumenMap = {}; 
    const metricKey = fMetric === 'und' ? 'UNIDAD' : 'COSTO';

    rawMovimientos.forEach(row => {
        let mesStr = (row['MES'] || "SIN ESPECIFICAR").toUpperCase();
        let tipo = row['TIPO_UBICACION'];
        let cat = reglas.cleanName(row['CATEGORIA']);
        let prov = reglas.cleanName(row['PROVEEDOR']);
        let depto = reglas.cleanName(row['DEPARTAMENTO2']);
        let grp = reglas.cleanName(row['GRUPO']);

        if (fMes.length > 0 && !fMes.includes(mesStr)) {
            return;
        }
        if (fTipo.length > 0 && !fTipo.includes(tipo)) {
            return;
        }
        if (fCat.length > 0 && !fCat.includes(cat)) {
            return;
        }
        if (fProv.length > 0 && !fProv.includes(prov)) {
            return;
        }
        if (fDep.length > 0 && !fDep.includes(depto)) {
            return;
        }

        let mesIdx = MESES_ORDEN.indexOf(mesStr);
        let filaPos = 0;
        let filaNeg = 0;
        let out25 = 0;
        let out26 = 0;
        let in25 = 0;
        let in26 = 0;

        Object.keys(row).forEach(k => {
            if (!k.includes(metricKey)) {
                return; 
            }
            
            let val = reglas.cleanNumber(row[k]);
            let isPos = k.includes('POS');
            let isNeg = k.includes('NEG'); 
            let is25 = k.includes('2025');
            let is26 = k.includes('2026');

            if (fYear.length > 0) {
                if (is25 && !fYear.includes('2025')) {
                    return;
                }
                if (is26 && !fYear.includes('2026')) {
                    return;
                }
            }

            if (isPos) { 
                totalPos += val; 
                filaPos += val; 
                if(is25) {
                    in25 += val; 
                }
                if(is26) {
                    in26 += val; 
                }
            }
            if (isNeg) { 
                totalNeg += val; 
                filaNeg += val; 
                if(is25) {
                    out25 += val; 
                }
                if(is26) {
                    out26 += val; 
                }
            }

            if (mesIdx >= 0) {
                if(is25 && isPos) {
                    lineIn25[mesIdx] += Math.abs(val);
                }
                if(is25 && isNeg) {
                    lineOut25[mesIdx] += Math.abs(val);
                }
                if(is26 && isPos) {
                    lineIn26[mesIdx] += Math.abs(val);
                }
                if(is26 && isNeg) {
                    lineOut26[mesIdx] += Math.abs(val);
                }
            }
        });

        if(out25 !== 0 || out26 !== 0 || in25 !== 0 || in26 !== 0) {
            filteredMovsData.push({
                Tipo: tipo,
                Departamento: depto,
                Categoria: cat,
                Grupo: grp,
                SKU: row['ITEM NO_'] || row['PRODUCTO'] || "N/A", 
                Descripcion: row['DESCRIPCION'] || row['PRODNOMBRE'] || "SIN DESCRIPCIÓN",
                Out25: out25,
                Out26: out26,
                In25: in25,
                In26: in26
            });
            
            let keyResumen = depto;
            if(!resumenMap[keyResumen]) {
                resumenMap[keyResumen] = { 
                    Tipo: tipo, 
                    Departamento: depto, 
                    Out25: 0, 
                    Out26: 0, 
                    In25: 0, 
                    In26: 0 
                };
            }
            resumenMap[keyResumen].Out25 += out25;
            resumenMap[keyResumen].Out26 += out26;
            resumenMap[keyResumen].In25 += in25;
            resumenMap[keyResumen].In26 += in26;
        }

        let valorTops = 0;
        if (fFlujo === 'all' || fFlujo === 'out') { 
            valorTops += filaNeg; 
        }
        if (fFlujo === 'in') { 
            valorTops += filaPos; 
        }

        consumoPorDepto[depto] = (consumoPorDepto[depto] || 0) + valorTops;
        consumoPorCat[cat] = (consumoPorCat[cat] || 0) + valorTops;
        consumoPorProv[prov] = (consumoPorProv[prov] || 0) + valorTops;
        consumoPorGrp[grp] = (consumoPorGrp[grp] || 0) + valorTops;
    });

    let prefix = fMetric === 'cst' ? 'L ' : '';
    let configNum = { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    };

    $('#k-pos').text(prefix + Math.abs(totalPos).toLocaleString('en-US', configNum));
    $('#k-neg').text(prefix + Math.abs(totalNeg).toLocaleString('en-US', configNum));

    let topDepto = Object.entries(consumoPorDepto).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
    let topCat = Object.entries(consumoPorCat).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
    
    $('#k-top-d').text(topDepto.length ? topDepto[0][0].substring(0,25) : '-');
    $('#k-top-c').text(topCat.length ? topCat[0][0].substring(0,25) : '-');

    actualizarTablaMovsResumen(Object.values(resumenMap), prefix, configNum);

    actualizarGraficos({
        lIn25: lineIn25, 
        lOut25: lineOut25, 
        lIn26: lineIn26, 
        lOut26: lineOut26,
        cDep: consumoPorDepto, 
        cCat: consumoPorCat, 
        cPrv: consumoPorProv, 
        cGrp: consumoPorGrp,
        fFlujo: fFlujo, 
        fYear: fYear, 
        px: prefix, 
        cf: configNum
    });
}

// 3. TABLA DE RESUMEN
function actualizarTablaMovsResumen(datos, px, cf) {
    if($.fn.DataTable.isDataTable('#tablaMovsResumen')) { 
        $('#tablaMovsResumen').DataTable().destroy(); 
    }
    
    tableMovsResumen = $('#tablaMovsResumen').DataTable({
        data: datos,
        pageLength: 15,
        language: { 
            url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' 
        },
        order: [[1, 'asc']],
        columns: [
            { 
                data: 'Tipo', 
                render: d => `<span class="badge-tipo">${d}</span>` 
            },
            { data: 'Departamento' },
            { 
                data: 'Out25', 
                className: 'num text-danger fw-bold', 
                render: (d, t) => t==='display' ? (d!==0 ? px + Math.abs(d).toLocaleString('en-US', cf) : '-') : Math.abs(d) 
            },
            { 
                data: 'Out26', 
                className: 'num text-danger fw-bold', 
                render: (d, t) => t==='display' ? (d!==0 ? px + Math.abs(d).toLocaleString('en-US', cf) : '-') : Math.abs(d) 
            },
            { 
                data: 'In25', 
                className: 'num text-success fw-bold', 
                render: (d, t) => t==='display' ? (d!==0 ? px + d.toLocaleString('en-US', cf) : '-') : d 
            },
            { 
                data: 'In26', 
                className: 'num text-success fw-bold', 
                render: (d, t) => t==='display' ? (d!==0 ? px + d.toLocaleString('en-US', cf) : '-') : d 
            }
        ]
    });
}

// 4. TABLA DE DETALLE Y LÓGICA DE CLICS
function abrirDashboardDetalle(depto) {
    $('#titulo-detalle').text(`Detalle de: ${depto}`);
    
    let px = $('#f-metric').val() === 'cst' ? 'L ' : '';
    let cf = { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    };
    
    let sumOut25 = 0;
    let sumOut26 = 0;
    let sumIn25 = 0;
    let sumIn26 = 0;
    
    let rankGrupo = {};
    let mapaArticulos = {};

    filteredMovsData.forEach(d => {
        if(d.Departamento !== depto) {
            return; 
        }
        
        sumOut25 += d.Out25;
        sumOut26 += d.Out26;
        sumIn25 += d.In25;
        sumIn26 += d.In26;
        
        let rGValue = Math.abs(d.Out25) + Math.abs(d.Out26);
        rankGrupo[d.Grupo] = (rankGrupo[d.Grupo] || 0) + rGValue;
        
        if (!mapaArticulos[d.SKU]) {
            mapaArticulos[d.SKU] = { 
                Depto: d.Departamento, 
                Categoria: d.Categoria, 
                Grupo: d.Grupo, 
                SKU: d.SKU, 
                Descripcion: d.Descripcion, 
                Out25: 0, 
                Out26: 0, 
                In25: 0, 
                In26: 0 
            };
        }
        mapaArticulos[d.SKU].Out25 += d.Out25;
        mapaArticulos[d.SKU].Out26 += d.Out26;
        mapaArticulos[d.SKU].In25 += d.In25;
        mapaArticulos[d.SKU].In26 += d.In26;
    });

    let dataDetalle = Object.values(mapaArticulos);

    $('#det-out-25').text(px + Math.abs(sumOut25).toLocaleString('en-US', cf));
    $('#det-out-26').text(px + Math.abs(sumOut26).toLocaleString('en-US', cf));
    $('#det-in-25').text(px + sumIn25.toLocaleString('en-US', cf));
    $('#det-in-26').text(px + sumIn26.toLocaleString('en-US', cf));

    if($.fn.DataTable.isDataTable('#tablaMovsDetalle')) { 
        $('#tablaMovsDetalle').DataTable().destroy(); 
    }
    
    tableMovsDetalle = $('#tablaMovsDetalle').DataTable({
        data: dataDetalle,
        pageLength: 10,
        language: { 
            url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' 
        },
        order: [[5, 'desc']], 
        columns: [
            { data: 'Depto' }, 
            { data: 'Categoria' }, 
            { data: 'Grupo' }, 
            { data: 'SKU' }, 
            { data: 'Descripcion' },
            { 
                data: 'Out25', 
                className: 'num text-danger fw-bold', 
                render: (d, t) => t==='display' ? (d!==0 ? px + Math.abs(d).toLocaleString('en-US', cf) : '-') : Math.abs(d) 
            },
            { 
                data: 'Out26', 
                className: 'num text-danger fw-bold', 
                render: (d, t) => t==='display' ? (d!==0 ? px + Math.abs(d).toLocaleString('en-US', cf) : '-') : Math.abs(d) 
            },
            { 
                data: 'In25', 
                className: 'num text-success fw-bold', 
                render: (d, t) => t==='display' ? (d!==0 ? px + d.toLocaleString('en-US', cf) : '-') : d 
            },
            { 
                data: 'In26', 
                className: 'num text-success fw-bold', 
                render: (d, t) => t==='display' ? (d!==0 ? px + d.toLocaleString('en-US', cf) : '-') : d 
            }
        ]
    });

    if(charts.cDetGrp) {
        charts.cDetGrp.destroy();
    }
    
    let sortedDG = Object.entries(rankGrupo).sort((a,b) => b[1] - a[1]).slice(0, 10);
    
    charts.cDetGrp = new Chart(document.getElementById('c-detalle-grupo'), {
        type: 'bar',
        data: {
            labels: sortedDG.map(x => x[0].substring(0, 25)),
            datasets: [{ 
                data: sortedDG.map(x => x[1]), 
                backgroundColor: '#E1251B', 
                borderRadius: 4 
            }]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false, 
            indexAxis: 'y', 
            layout: { 
                padding: { right: 30 } 
            },
            scales: { 
                x: { display: false }, 
                y: { 
                    grid: { display: false }, 
                    ticks: { color: '#000', font: { weight: 'bold', size: 10 } } 
                } 
            },
            plugins: { 
                legend: { display: false }, 
                datalabels: { 
                    anchor: 'end', 
                    align: 'right', 
                    color: '#000', 
                    font: { weight: 'bold' }, 
                    formatter: v => v > 0 ? px + v.toLocaleString('en-US', cf) : '' 
                } 
            }
        }
    });

    // Desvincular clics anteriores y asignar nuevo clic en la tabla para actualizar tendencia
    $('#tablaMovsDetalle tbody').off('click', 'tr').on('click', 'tr', function () {
        if(!tableMovsDetalle) {
            return;
        }
        let dataRow = tableMovsDetalle.row(this).data();
        if(dataRow) {
            // Remarcar la fila seleccionada
            $('#tablaMovsDetalle tbody tr').removeClass('table-primary');
            $(this).addClass('table-primary');
            
            // Dibujar la tendencia SOLO para el SKU seleccionado
            dibujarTendencia(depto, dataRow.SKU, dataRow.Descripcion);
            
            // Hacer scroll suave hacia el gráfico de tendencia
            document.getElementById('titulo-tendencia').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    // Dibujar tendencia inicial (General del Departamento)
    dibujarTendencia(depto, null, null);

    // Mantenemos visible todo (No ocultamos el dashboard principal para que los filtros funcionen y sean visibles)
    $('#dashboard-principal .kpi-grid, #dashboard-principal .nav-tabs, #dashboard-principal .tab-content').hide();
    $('#dashboard-detalle').fadeIn();
}

// 4.1 FUNCIÓN PARA DIBUJAR LA TENDENCIA (Dinámica por SKU o por Departamento)
function dibujarTendencia(depto, sku, descripcion) {
    let px = $('#f-metric').val() === 'cst' ? 'L ' : '';
    let cf = { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    };
    
    let fFlujo = $('input[name="btnFlujo"]:checked').val();
    let fYear = $('#f-year').val() || [];
    let fTipo = $('#f-tipo').val() || [];
    let fCat = $('#f-cat').val() || [];
    let fProv = $('#f-prov').val() || [];
    let metricKey = $('#f-metric').val() === 'und' ? 'UNIDAD' : 'COSTO';

    let d_in25 = Array(12).fill(0);
    let d_out25 = Array(12).fill(0);
    let d_in26 = Array(12).fill(0);
    let d_out26 = Array(12).fill(0);

    rawMovimientos.forEach(row => {
        let deptoRow = reglas.cleanName(row['DEPARTAMENTO2']);
        if (deptoRow !== depto) {
            return; 
        }

        // SI HAY UN SKU SELECCIONADO, FILTRAMOS SOLO ESE SKU
        if (sku) {
            let rowSKU = row['ITEM NO_'] || row['PRODUCTO'] || "N/A";
            if (rowSKU !== sku) {
                return;
            }
        }

        let tipo = row['TIPO_UBICACION'];
        let cat = reglas.cleanName(row['CATEGORIA']);
        let prov = reglas.cleanName(row['PROVEEDOR']);

        if (fTipo.length > 0 && !fTipo.includes(tipo)) {
            return;
        }
        if (fCat.length > 0 && !fCat.includes(cat)) {
            return;
        }
        if (fProv.length > 0 && !fProv.includes(prov)) {
            return;
        }

        let mesStr = (row['MES'] || "SIN ESPECIFICAR").toUpperCase();
        let mesIdx = MESES_ORDEN.indexOf(mesStr);
        if(mesIdx < 0) {
            return;
        }

        Object.keys(row).forEach(k => {
            if (!k.includes(metricKey)) {
                return;
            }
            
            let val = reglas.cleanNumber(row[k]);
            let isPos = k.includes('POS');
            let isNeg = k.includes('NEG');
            let is25 = k.includes('2025');
            let is26 = k.includes('2026');

            if (fYear.length > 0) {
                if (is25 && !fYear.includes('2025')) {
                    return;
                }
                if (is26 && !fYear.includes('2026')) {
                    return;
                }
            }

            if(is25 && isPos) {
                d_in25[mesIdx] += Math.abs(val);
            }
            if(is25 && isNeg) {
                d_out25[mesIdx] += Math.abs(val);
            }
            if(is26 && isPos) {
                d_in26[mesIdx] += Math.abs(val);
            }
            if(is26 && isNeg) {
                d_out26[mesIdx] += Math.abs(val);
            }
        });
    });

    if(charts.cDetTendencia) {
        charts.cDetTendencia.destroy();
    }
    
    let dsLineasDet = [];
    let show25 = !fYear.length || fYear.includes('2025');
    let show26 = !fYear.length || fYear.includes('2026');

    if (show25 && (fFlujo !== 'out')) {
        dsLineasDet.push({ label: 'Entradas 2025', data: d_in25, borderColor: '#00b4db', borderDash: [5, 5], tension: 0.4 });
    }
    if (show25 && (fFlujo !== 'in')) {
        dsLineasDet.push({ label: 'Salidas 2025', data: d_out25, borderColor: '#ff7b72', borderDash: [5, 5], tension: 0.4 });
    }
    if (show26 && (fFlujo !== 'out')) {
        dsLineasDet.push({ label: 'Entradas 2026', data: d_in26, borderColor: '#012094', borderWidth: 3, tension: 0.4 });
    }
    if (show26 && (fFlujo !== 'in')) {
        dsLineasDet.push({ label: 'Salidas 2026', data: d_out26, borderColor: '#E1251B', borderWidth: 3, tension: 0.4 });
    }

    // Actualizar el título del gráfico
    if (sku) {
        $('#titulo-tendencia').html(`<i class="fa-solid fa-chart-line me-2"></i>Tendencia Mensual: <span class="text-primary">${sku} - ${descripcion}</span>`);
    } else {
        $('#titulo-tendencia').html(`<i class="fa-solid fa-chart-line me-2"></i>Tendencia Mensual del Departamento General (Haz clic en un artículo de la tabla para ver su tendencia)`);
    }

    charts.cDetTendencia = new Chart(document.getElementById('c-detalle-tendencia'), {
        type: 'line',
        data: { 
            labels: MESES_ORDEN, 
            datasets: dsLineasDet 
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { 
                padding: { top: 20, right: 20 } 
            },
            scales: { 
                x: { 
                    grid: { display: false }, 
                    ticks: { color: '#000', font: { weight: 'bold' } } 
                }, 
                y: { display: false } 
            },
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { color: '#000', font: { weight: 'bold' } } 
                },
                datalabels: { display: false },
                tooltip: { 
                    callbacks: { 
                        label: function(context) { 
                            return context.dataset.label + ': ' + px + context.parsed.y.toLocaleString('en-US', cf); 
                        } 
                    } 
                }
            }
        }
    });
}

// 5. GRÁFICOS DINÁMICOS
function actualizarGraficos(g) {
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    let dsLineas = [];
    
    let show25 = !g.fYear.length || g.fYear.includes('2025');
    let show26 = !g.fYear.length || g.fYear.includes('2026');

    if (show25 && (g.fFlujo !== 'out')) {
        dsLineas.push({ label: 'Entradas 2025', data: g.lIn25, borderColor: '#00b4db', borderDash: [5, 5], tension: 0.4 });
    }
    if (show25 && (g.fFlujo !== 'in')) {
        dsLineas.push({ label: 'Salidas 2025', data: g.lOut25, borderColor: '#ff7b72', borderDash: [5, 5], tension: 0.4 });
    }
    if (show26 && (g.fFlujo !== 'out')) {
        dsLineas.push({ label: 'Entradas 2026', data: g.lIn26, borderColor: '#012094', borderWidth: 3, tension: 0.4 });
    }
    if (show26 && (g.fFlujo !== 'in')) {
        dsLineas.push({ label: 'Salidas 2026', data: g.lOut26, borderColor: '#E1251B', borderWidth: 3, tension: 0.4 });
    }

    if(charts.cResp) {
        charts.cResp.destroy();
    }
    
    charts.cResp = new Chart(document.getElementById('c-respiracion'), {
        type: 'line',
        data: { 
            labels: MESES_ORDEN, 
            datasets: dsLineas 
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { 
                padding: { top: 20, right: 20 } 
            },
            scales: { 
                x: { 
                    grid: { display: false }, 
                    ticks: { color: '#000', font: { weight: 'bold' } } 
                }, 
                y: { display: false } 
            },
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { color: '#000', font: { weight: 'bold' } } 
                },
                datalabels: { display: false },
                tooltip: { 
                    callbacks: { 
                        label: function(context) { 
                            return context.dataset.label + ': ' + g.px + context.parsed.y.toLocaleString('en-US', g.cf); 
                        } 
                    } 
                }
            }
        }
    });

    const dibujarVertical = (id, dataObj, color) => {
        if(charts[id]) {
            charts[id].destroy();
        }
        
        let arr = Object.entries(dataObj).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12);
        
        charts[id] = new Chart(document.getElementById(id), {
            type: 'bar',
            data: { 
                labels: arr.map(x => x[0].substring(0, 18)), 
                datasets: [{ 
                    data: arr.map(x => Math.abs(x[1])), 
                    backgroundColor: color, 
                    borderRadius: 4 
                }] 
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false, 
                layout: { 
                    padding: { top: 75 } 
                },
                scales: { 
                    x: { 
                        grid: { display: false }, 
                        ticks: { maxRotation: 45, minRotation: 45, color: '#000', font: { weight: 'bold' } } 
                    }, 
                    y: { display: false } 
                },
                plugins: { 
                    legend: { display: false }, 
                    datalabels: { 
                        display: true, 
                        anchor: 'end', 
                        align: 'end', 
                        rotation: -45, 
                        offset: 5, 
                        color: '#000', 
                        font: { weight: 'bold', size: 11 }, 
                        formatter: v => v > 0 ? g.px + v.toLocaleString('en-US', g.cf) : '' 
                    }, 
                    tooltip: { 
                        callbacks: { 
                            label: function(context) { 
                                return g.px + context.parsed.y.toLocaleString('en-US', g.cf); 
                            } 
                        } 
                    } 
                }
            }
        });
    };

    dibujarVertical('c-dept', g.cDep, '#E1251B');
    dibujarVertical('c-cat', g.cCat, '#012094');

    const dibujarHorizontal = (id, dataObj, color) => {
        if(charts[id]) {
            charts[id].destroy();
        }
        
        let arr = Object.entries(dataObj).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 15);
        
        charts[id] = new Chart(document.getElementById(id), {
            type: 'bar',
            data: { 
                labels: arr.map(x => x[0].substring(0, 25)), 
                datasets: [{ 
                    data: arr.map(x => Math.abs(x[1])), 
                    backgroundColor: color, 
                    borderRadius: 4 
                }] 
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false, 
                indexAxis: 'y', 
                layout: { 
                    padding: { right: 40 } 
                }, 
                scales: { 
                    x: { display: false }, 
                    y: { 
                        grid: { display: false }, 
                        ticks: { color: '#000', font: { weight: 'bold' } } 
                    } 
                },
                plugins: { 
                    legend: { display: false }, 
                    datalabels: { 
                        display: true, 
                        anchor: 'end', 
                        align: 'right', 
                        color: '#000', 
                        font: { weight: 'bold', size: 11 }, 
                        formatter: v => v > 0 ? g.px + v.toLocaleString('en-US', g.cf) : '' 
                    }, 
                    tooltip: { 
                        callbacks: { 
                            label: function(context) { 
                                return g.px + context.parsed.x.toLocaleString('en-US', g.cf); 
                            } 
                        } 
                    } 
                }
            }
        });
    };

    dibujarHorizontal('c-prov', g.cPrv, '#2c3e50');
    dibujarHorizontal('c-grp', g.cGrp, '#00b4db');
}
