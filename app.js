// Registramos el plugin Datalabels globalmente
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
        // Elimina comas y convierte string a número flotante
        const num = parseFloat(val.toString().replace(/,/g, '').trim());
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
        // En el filtro desplegable SOLO existirán "MAYOREO" (CEDIS) y "DETALLE" (TIENDA)
        return tipoInterno === "CEDIS" ? "MAYOREO" : "DETALLE";
    }
};

// 2. LECTURA Y PROCESAMIENTO AUTOMÁTICO (PapaParse)
$(document).ready(function () {
    // Inicializar Select2
    $('.select2').select2({ theme: 'bootstrap-5', placeholder: "Todos..." });
    
    // Poner fecha actual
    const hoy = new Date();
    $('#fecha-hoy').text(hoy.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }));

    // Leer CSV referenciado. Nota: Asegúrate de que las cabeceras del CSV 
    // coincidan con las utilizadas en el mapeo (Ej. Tienda, Categoria, Proveedor, Costo, Unidades)
    Papa.parse("movimiento_suministro_2025_2026.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            procesarYLimpiarDatos(results.data);
            $('#loader-overlay').fadeOut();
        },
        error: function(err) {
            console.error("Error cargando el CSV:", err);
            $('#loader-overlay').html('<h4 class="text-danger">Error al cargar datos. Verifique el archivo CSV.</h4>');
        }
    });

    // Eventos de botones
    $('#btn-reset').click(function() {
        $('.select2').val(null).trigger('change');
        // trigger actualización aquí
    });
});

function procesarYLimpiarDatos(rawData) {
    masterData = rawData.map(row => {
        // Obtenemos los valores base (Asumiendo columnas estándar del CSV)
        let tienda = row['Tienda'] || row['Division'] || ""; 
        let categoria = row['Categoria'] || "";
        let tipoInterno = reglas.getTipoInterno(tienda, categoria);

        return {
            Empresa: reglas.getEmpresa(tienda),
            TiendaInterna: tipoInterno,
            TiendaVisual: reglas.getFiltroVisual(tipoInterno),
            Division: tienda,
            Categoria: categoria,
            Grupo: row['Grupo'] || "",
            Proveedor: row['Proveedor'] || "SIN ESPECIFICAR",
            Departamento: row['Departamento'] || "",
            Año: row['Año'] || "",
            Mes: row['Mes'] || "",
            Stock: reglas.cleanNumber(row['Stock'] || row['Unidades']),
            Costo: reglas.cleanNumber(row['Costo'])
        };
    });

    // Llenar Filtro Tipo Tienda SOLO con los 2 valores permitidos
    const tiposVisuales = [...new Set(masterData.map(d => d.TiendaVisual))];
    const selectTienda = $('#f-tienda-tipo');
    tiposVisuales.forEach(t => selectTienda.append(new Option(t, t)));

    // Aquí iría el llenado dinámico del resto de los filtros (Año, Mes, etc.)
    
    inicializarDataTables();
    inicializarGraficos();
}

// 3. CONFIGURACIÓN EJECUTIVA DE DATATABLES
function inicializarDataTables() {
    tableDetalle = $('#tablaDetalle').DataTable({
        data: masterData,
        pageLength: 15,
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
        order: [[6, 'desc']], // Ordenar por Costo por defecto usando su número crudo
        columns: [
            { data: 'Empresa' },
            { data: 'Division' },
            { data: 'Categoria' },
            { data: 'Proveedor' },
            { 
                data: 'TiendaVisual',
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
                render: function(data, type) {
                    if (type === 'display' || type === 'filter') {
                        // Badges verde/rojo para display de inventario
                        let color = data > 0 ? 'success' : (data < 0 ? 'danger' : 'dark');
                        return `<span class="badge bg-${color} px-3 py-2 shadow-sm" style="font-size:0.9rem">${data.toLocaleString('en-US')}</span>`;
                    }
                    return data; // Retorna crudo para el ordenamiento
                }
            },
            { 
                data: 'Costo',
                className: 'num',
                render: function(data, type) {
                    if (type === 'display') {
                        return `<strong>L ${data.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>`;
                    }
                    return data; // Retorna número crudo para matemática y orden
                }
            }
        ]
    });
}

// 4. CONFIGURACIÓN EJECUTIVA DE CHART.JS
function inicializarGraficos() {
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    
    // Opciones globales para cumplir las reglas de negocio ejecutivas (Sin grids, sin números Eje Y)
    const optionsEjecutivas = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { 
                grid: { display: false } 
            },
            y: { 
                grid: { display: false }, 
                ticks: { display: false }, // Oculta números del eje Y
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
                    return value.toLocaleString('en-US'); // Números formateados sobre la barra
                }
            }
        }
    };

    // Ejemplo: Inyección para Categorías Top (Reemplaza la data de ejemplo por la data agregada real)
    const ctxCat = document.getElementById('c-cat').getContext('2d');
    charts.cCat = new Chart(ctxCat, {
        type: 'bar',
        data: {
            labels: ['Papelería', 'Limpieza', 'Computo', 'Construcción', 'Empaques'],
            datasets: [{
                data: [150000, 120000, 95000, 45000, 30000],
                backgroundColor: 'rgba(1, 32, 148, 0.85)',
                borderRadius: 4
            }]
        },
        options: optionsEjecutivas
    });

    // Repetir el patrón chart para los demás Canvas usando masterData agregada
}
