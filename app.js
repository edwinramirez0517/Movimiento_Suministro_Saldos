// Registramos el plugin Datalabels globalmente para los gráficos
Chart.register(ChartDataLabels);

// Variables Globales
let masterData = [];
let tableDetalle;
let charts = {};

// 1. REGLAS DE NEGOCIO Y LIMPIEZA
const reglas = {
    cleanNumber: (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        // Elimina comas, espacios y la letra 'L' para evitar errores matemáticos (ej: "L465,101.94" -> 465101.94)
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
        if (tienda.includes("CD ") || tienda.includes("CEDIS") || tienda.includes("MEGABODEGA") || categoria === "ALMACEN") {
            return "CEDIS";
        }
        return "TIENDA";
    },

    getFiltroVisual: (tipoInterno) => {
        return tipoInterno === "CEDIS" ? "MAYOREO" : "DETALLE";
    }
};

// 2. LECTURA Y PROCESAMIENTO AUTOMÁTICO (PapaParse)
$(document).ready(function () {
    $('.select2').select2({ theme: 'bootstrap-5', placeholder: "Todos..." });
    
    const hoy = new Date();
    $('#fecha-hoy').text(hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }));

    // Usamos Promise.all para cargar AMBOS archivos CSV simultáneamente
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
        const datosSaldos = results[0].data;
        const datosMovimientos = results[1].data;
        
        procesarYLimpiarDatos(datosSaldos, datosMovimientos);
        $('#loader-overlay').fadeOut();
    }).catch(err => {
        console.error("Error cargando los CSV:", err);
        $('#loader-overlay').html('<h4 class="text-danger">Error al cargar datos. Verifique los nombres de los archivos.</h4>');
    });

    $('#btn-reset').click(function() {
        $('.select2').val(null).trigger('change');
    });
});

function procesarYLimpiarDatos(rawDataSaldos, rawDataMovimientos) {
    // Función auxiliar para buscar nombres de columnas a pesar de caracteres ocultos (BOM) que Excel deja
    const getVal = (row, keyName) => {
        const key = Object.keys(row).find(k => k.toLowerCase().includes(keyName.toLowerCase()));
        return key ? row[key] : "";
    };

    // Procesamos el stock (saldo_almacen_suministro.csv) para alimentar la tabla principal
    masterData = rawDataSaldos.map(row => {
        let tienda = getVal(row, 'Sucursal') || getVal(row, 'Division') || ""; 
        let categoria = getVal(row, 'Categoria') || "";
        let tipoInterno = reglas.getTipoInterno(tienda, categoria);

        return {
            Empresa: reglas.getEmpresa(tienda),
            TiendaInterna: tipoInterno,
            TiendaVisual: reglas.getFiltroVisual(tipoInterno),
            Division: getVal(row, 'Division'),
            Categoria: categoria,
            Grupo: getVal(row, 'Grupo'),
            Proveedor: getVal(row, 'Proveedor') || "SIN ESPECIFICAR",
            // Detecta la columna "SaldoUNDTotal"
            Stock: reglas.cleanNumber(getVal(row, 'SaldoUNDTotal')),
            // Detecta la columna "Total Costo Und"
            Costo: reglas.cleanNumber(getVal(row, 'Total Costo Und'))
        };
    });

    // Llenar Filtro Tipo Tienda
    const tiposVisuales = [...new Set(masterData.map(d => d.TiendaVisual))];
    const selectTienda = $('#f-tienda-tipo');
    selectTienda.empty();
    tiposVisuales.forEach(t => selectTienda.append(new Option(t, t)));

    // Calcular KPIs Base
    let totalCosto = 0;
    let totalStock = 0;
    masterData.forEach(d => {
        totalCosto += d.Costo;
        totalStock += d.Stock;
    });

    $('#k-cost').text('L ' + totalCosto.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
    $('#k-stock').text(totalStock.toLocaleString('en-US'));

    // Calcular Movimientos de Entradas y Salidas si existe el archivo (movimiento_suministro_2025_2026.csv)
    if(rawDataMovimientos && rawDataMovimientos.length > 0) {
        let totalSalidas = 0;
        let totalEntradas = 0;
        rawDataMovimientos.forEach(row => {
            totalSalidas += Math.abs(reglas.cleanNumber(getVal(row, 'UNIDAD NEG 2026')) || 0);
            totalEntradas += Math.abs(reglas.cleanNumber(getVal(row, 'UNIDAD POS 2026')) || 0);
        });
        $('#k-neg').text(totalSalidas.toLocaleString('en-US'));
        $('#k-pos').text(totalEntradas.toLocaleString('en-US'));
    }

    inicializarDataTables();
    inicializarGraficos();
}

function inicializarDataTables() {
    if($.fn.DataTable.isDataTable('#tablaDetalle')) {
        $('#tablaDetalle').DataTable().destroy();
    }
    
    tableDetalle = $('#tablaDetalle').DataTable({
        data: masterData,
        pageLength: 15,
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        order: [[6, 'desc']], // Ordena por la columna costo por defecto
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
                        let val = parseFloat(data) || 0;
                        let color = val > 0 ? 'success' : (val < 0 ? 'danger' : 'dark');
                        return `<span class="badge bg-${color} px-3 py-2 shadow-sm" style="font-size:0.9rem">${val.toLocaleString('en-US')}</span>`;
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
                        let val = parseFloat(data) || 0;
                        return `<strong>L ${val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>`;
                    }
                    return data;
                }
            }
        ]
    });
}

function inicializarGraficos() {
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    const optionsEjecutivas = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { grid: { display: false } },
            y: { 
                grid: { display: false }, 
                ticks: { display: false },
                border: { display: false }
            }
        },
        plugins: {
            legend: { display: false },
            datalabels: {
                anchor: 'end',
                align: 'top',
                color: '#111',
                font: { weight: 'bold', size: 11 },
                formatter: function(value) {
                    return value.toLocaleString('en-US');
                }
            }
        }
    };

    // Destruir gráficos anteriores si existen
    if(charts.cCat) charts.cCat.destroy();
    
    // Gráfico: Top Categorías (Dinámico basado en el CSV de saldos)
    let agruparCategoria = {};
    masterData.forEach(d => {
        if(!agruparCategoria[d.Categoria]) agruparCategoria[d.Categoria] = 0;
        agruparCategoria[d.Categoria] += d.Costo;
    });

    let categoriasSorted = Object.keys(agruparCategoria)
        .map(cat => ({ nombre: cat, costo: agruparCategoria[cat] }))
        .sort((a,b) => b.costo - a.costo)
        .slice(0, 12);

    const ctxCat = document.getElementById('c-cat').getContext('2d');
    charts.cCat = new Chart(ctxCat, {
        type: 'bar',
        data: {
            labels: categoriasSorted.map(c => c.nombre || "N/A"),
            datasets: [{
                data: categoriasSorted.map(c => c.costo),
                backgroundColor: 'rgba(1, 32, 148, 0.85)',
                borderRadius: 4
            }]
        },
        options: optionsEjecutivas
    });
    
    // (Puedes seguir este mismo patrón para los demás gráficos c-dept, c-prov, etc.)
}
