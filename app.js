// Registramos el plugin Datalabels globalmente para los gráficos
Chart.register(ChartDataLabels);

// Variables Globales
let rawSaldos = [];
let rawMovimientos = [];
let masterData = [];
let tableDetalle;
let charts = {};

// 1. REGLAS DE NEGOCIO Y LIMPIEZA
const reglas = {
    cleanNumber: (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        // Elimina comas, espacios y letras como 'L' (Lempiras)
        const strNum = val.toString().replace(/[L$,\s]/gi, '').trim();
        const num = parseFloat(strNum);
        return isNaN(num) ? 0 : num;
    },

    getEmpresa: (tienda) => {
        tienda = (tienda || "").toUpperCase();
        if (tienda.includes("DS") || tienda.includes("VITRINA")) {
            return "DANILOS STORE";
        }
        return "EL COMPADRE";
    },

    getTipoInterno: (tienda, categoria) => {
        tienda = (tienda || "").toUpperCase();
        categoria = (categoria || "").toUpperCase();
        // Clasificación estricta corporativa: CD, CEDIS, MEGABODEGA, AEC y DS
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

// Función vital: Limpia los encabezados de Excel (elimina el caracter oculto BOM \ufeff y pone todo en mayúsculas)
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

// 2. LECTURA Y PROCESAMIENTO AUTOMÁTICO (PapaParse)
$(document).ready(function () {
    $('.select2').select2({ theme: 'bootstrap-5', placeholder: "Todos..." });
    
    const hoy = new Date();
    $('#fecha-hoy').text(hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }));

    Promise.all([
        new Promise((resolve, reject) => {
            Papa.parse("saldo_almacen_suministro.csv", {
                download: true, header: true, skipEmptyLines: true,
                complete: resolve, error: reject
            });
        }),
        new Promise((resolve, reject) => {
            Papa.parse("movimiento_suministro_2025_2026.csv", {
                download: true, header: true, skipEmptyLines: true,
                complete: resolve, error: reject
            });
        })
    ]).then(results => {
        // Normalizamos inmediatamente toda la data leída para evitar errores de nombres
        rawSaldos = results[0].data.map(normalizeRow);
        rawMovimientos = results[1].data.map(normalizeRow);
        
        prepararFiltrosDropdowns();
        procesarYLimpiarDatos();
        $('#loader-overlay').fadeOut();
    }).catch(err => {
        console.error("Error cargando los CSV:", err);
        $('#loader-overlay').html('<h4 class="text-danger fw-bold">Error al cargar datos. Verifique los archivos CSV.</h4>');
    });

    $('#btn-reset').click(function() {
        $('.select2').val(null).trigger('change');
    });
});

// 3. PREPARAR LISTAS DESPLEGABLES (FILTROS)
function prepararFiltrosDropdowns() {
    let setCat = new Set(), setProv = new Set(), setDep = new Set(), setMes = new Set();

    rawSaldos.forEach(row => {
        if(row['CATEGORIA']) setCat.add(row['CATEGORIA']);
        if(row['PROVEEDOR']) setProv.add(row['PROVEEDOR']);
    });

    rawMovimientos.forEach(row => {
        if(row['DEPARTAMENTO2']) setDep.add(row['DEPARTAMENTO2']); // Alineado a tu archivo exacto
        if(row['MES']) setMes.add(row['MES']);
    });

    const llenarSelect = (id, dataSet) => {
        const select = $(id);
        select.empty();
        Array.from(dataSet).sort().forEach(item => select.append(new Option(item, item)));
    };

    llenarSelect('#f-cat', setCat);
    llenarSelect('#f-prov', setProv);
    llenarSelect('#f-dep', setDep);
    llenarSelect('#f-mes', setMes);

    $('#f-year').empty().append(new Option('2025', '2025')).append(new Option('2026', '2026'));
    $('#f-tienda-tipo').empty().append(new Option('DETALLE', 'DETALLE')).append(new Option('MAYOREO', 'MAYOREO'));
}

// 4. LÓGICA DE DATOS Y KPI
function procesarYLimpiarDatos() {
    let totalCosto = 0;
    let totalStock = 0;

    // Procesamos la tabla de Saldos
    masterData = rawSaldos.map(row => {
        let tienda = row['SUCURSAL'] || row['DIVISION'] || ""; 
        let categoria = row['CATEGORIA'] || "";
        let tipoInterno = reglas.getTipoInterno(tienda, categoria);
        let stock = reglas.cleanNumber(row['SALDOUNDTOTAL']);
        let costo = reglas.cleanNumber(row['TOTAL COSTO UND.']);

        totalStock += stock;
        totalCosto += costo;

        return {
            Empresa: reglas.getEmpresa(tienda),
            TiendaInterna: tipoInterno,
            TiendaVisual: reglas.getFiltroVisual(tipoInterno),
            Division: tienda,
            Categoria: categoria,
            Grupo: row['GRUPO'] || "",
            Proveedor: row['PROVEEDOR'] || "SIN ESPECIFICAR",
            Stock: stock,
            Costo: costo
        };
    });

    // Procesamos la tabla de Movimientos
    let entradasUnd = 0, salidasUnd = 0;
    let consumoPorDepto = {}, consumoPorCat = {};

    rawMovimientos.forEach(row => {
        let depto = row['DEPARTAMENTO2'] || "SIN ASIGNAR";
        let cat = row['CATEGORIA'] || "SIN ASIGNAR";
        let consumoFila = 0;

        Object.keys(row).forEach(k => {
            let val = reglas.cleanNumber(row[k]);
            
            if (k.includes('UNIDAD') && k.includes('POS')) entradasUnd += Math.abs(val);
            if (k.includes('UNIDAD') && k.includes('NEG')) salidasUnd += Math.abs(val);

            // Consumo basado en costo negativo (salidas)
            if (k.includes('COSTO') && k.includes('NEG')) {
                consumoFila += Math.abs(val);
            }
        });

        consumoPorDepto[depto] = (consumoPorDepto[depto] || 0) + consumoFila;
        consumoPorCat[cat] = (consumoPorCat[cat] || 0) + consumoFila;
    });

    // Inyectar KPI Numéricos
    $('#k-cost').text('L ' + totalCosto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    $('#k-stock').text(totalStock.toLocaleString('en-US'));
    $('#k-pos').text(entradasUnd.toLocaleString('en-US'));
    $('#k-neg').text(salidasUnd.toLocaleString('en-US'));

    // Calcular e Inyectar Tops
    let arrDeptos = Object.entries(consumoPorDepto).sort((a,b) => b[1] - a[1]);
    let arrCats = Object.entries(consumoPorCat).sort((a,b) => b[1] - a[1]);

    $('#k-top-d').text(arrDeptos.length > 0 ? arrDeptos[0][0].substring(0, 18) : '-');
    $('#k-top-c').text(arrCats.length > 0 ? arrCats[0][0].substring(0, 18) : '-');

    inicializarDataTables();
    renderGraficos(consumoPorDepto);
}

// 5. RENDERIZADO DE TABLA
function inicializarDataTables() {
    if($.fn.DataTable.isDataTable('#tablaDetalle')) {
        $('#tablaDetalle').DataTable().destroy();
    }
    
    tableDetalle = $('#tablaDetalle').DataTable({
        data: masterData,
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
                defaultContent: '-',
                render: function(data, type) {
                    if (type === 'display') {
                        let color = data === 'MAYOREO' ? 'primary' : 'secondary';
                        return `<span class="badge bg-${color}">${data}</span>`;
                    }
                    return data;
                }
            },
            { 
                data: 'Stock',
                className: 'num',
                defaultContent: 0,
                render: function(data, type) {
                    if (type === 'display' || type === 'filter') {
                        let color = data > 0 ? 'success' : (data < 0 ? 'danger' : 'dark');
                        return `<span class="badge bg-${color} px-3 py-2 shadow-sm" style="font-size:0.9rem">${data.toLocaleString('en-US')}</span>`;
                    }
                    return data;
                }
            },
            { 
                data: 'Costo',
                className: 'num',
                defaultContent: 0,
                render: function(data, type) {
                    if (type === 'display') {
                        return `<strong>L ${data.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>`;
                    }
                    return data;
                }
            }
        ]
    });
}

// 6. RENDERIZADO DE GRÁFICOS
function renderGraficos(consumoPorDepto) {
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    
    const optionsBase = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: { grid: { display: false } },
            y: { grid: { display: false }, ticks: { display: false }, border: { display: false } }
        },
        plugins: {
            legend: { display: false },
            datalabels: {
                anchor: 'end', align: 'top', color: '#111', font: { weight: 'bold', size: 10 },
                formatter: v => v > 0 ? v.toLocaleString('en-US', {maximumFractionDigits:0}) : ''
            }
        }
    };

    Object.values(charts).forEach(c => c.destroy());

    let mesesData = {};
    rawMovimientos.forEach(row => {
        let mes = row['MES'] || 'S/M';
        if(mes === 'S/M') return;
        if(!mesesData[mes]) mesesData[mes] = { in: 0, out: 0 };
        
        Object.keys(row).forEach(k => {
            let val = Math.abs(reglas.cleanNumber(row[k]));
            if(k.includes('UNIDAD') && k.includes('POS')) mesesData[mes].in += val;
            if(k.includes('UNIDAD') && k.includes('NEG')) mesesData[mes].out += val;
        });
    });

    const ctxResp = document.getElementById('c-respiracion').getContext('2d');
    charts.cResp = new Chart(ctxResp, {
        type: 'line',
        data: {
            labels: Object.keys(mesesData),
            datasets: [
                { label: 'Entradas (+)', data: Object.values(mesesData).map(d => d.in), borderColor: '#00b4db', backgroundColor: 'rgba(0,180,219,0.1)', fill: true, tension: 0.3 },
                { label: 'Salidas (-)', data: Object.values(mesesData).map(d => d.out), borderColor: '#E1251B', backgroundColor: 'rgba(225,37,27,0.1)', fill: true, tension: 0.3 }
            ]
        },
        options: { ...optionsBase, plugins: { legend: { display: true, position: 'bottom' } } }
    });

    let sortedDept = Object.entries(consumoPorDepto).sort((a,b)=>b[1]-a[1]).slice(0,12);
    charts.cDept = new Chart(document.getElementById('c-dept').getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedDept.map(d=>d[0].substring(0,12)),
            datasets: [{ data: sortedDept.map(d=>d[1]), backgroundColor: '#E1251B', borderRadius: 4 }]
        },
        options: optionsBase
    });

    let catSaldo = {};
    masterData.forEach(d => catSaldo[d.Categoria] = (catSaldo[d.Categoria] || 0) + d.Costo);
    let sortedCat = Object.entries(catSaldo).sort((a,b)=>b[1]-a[1]).slice(0,12);
    
    charts.cCat = new Chart(document.getElementById('c-cat').getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedCat.map(d=>d[0].substring(0,12)),
            datasets: [{ data: sortedCat.map(d=>d[1]), backgroundColor: '#012094', borderRadius: 4 }]
        },
        options: optionsBase
    });

    let provSaldo = {};
    masterData.forEach(d => provSaldo[d.Proveedor] = (provSaldo[d.Proveedor] || 0) + d.Costo);
    let sortedProv = Object.entries(provSaldo).sort((a,b)=>b[1]-a[1]).slice(0,15);
    
    let optHorizontal = JSON.parse(JSON.stringify(optionsBase));
    optHorizontal.indexAxis = 'y';
    optHorizontal.plugins.datalabels.anchor = 'end';
    optHorizontal.plugins.datalabels.align = 'right';

    charts.cProv = new Chart(document.getElementById('c-prov').getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedProv.map(d=>d[0].substring(0,15)),
            datasets: [{ data: sortedProv.map(d=>d[1]), backgroundColor: '#4ca1af', borderRadius: 4 }]
        },
        options: optHorizontal
    });

    let grpSaldo = {};
    masterData.forEach(d => { if(d.Grupo) grpSaldo[d.Grupo] = (grpSaldo[d.Grupo] || 0) + d.Costo; });
    let sortedGrp = Object.entries(grpSaldo).sort((a,b)=>b[1]-a[1]).slice(0,15);
    
    charts.cGrp = new Chart(document.getElementById('c-grp').getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedGrp.map(d=>d[0].substring(0,15)),
            datasets: [{ data: sortedGrp.map(d=>d[1]), backgroundColor: '#0082c8', borderRadius: 4 }]
        },
        options: optionsBase
    });
}
