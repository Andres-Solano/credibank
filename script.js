// --- Cliente Supabase ---
const supabaseClient = window.supabase.createClient(
  "https://ychkekvylldsbkqlcfid.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljaGtla3Z5bGxkc2JrcWxjZmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyNDIwNjIsImV4cCI6MjA3MzgxODA2Mn0.IDR4dFnMiYZcViUSoz5nOPaPlXrHOky_u05Vq-ztI9Q"
);

// --- Helpers DOM (refactor sin cambiar funcionalidad) ---
const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const on = (el, ev, fn, opts) => { if (el) el.addEventListener(ev, fn, opts); };

function setHidden(elOrId, hidden) {
  const el = typeof elOrId === "string" ? $(elOrId) : elOrId;
  if (!el) return;
  el.classList.toggle("hidden", !!hidden);
}

function setText(elOrId, value) {
  const el = typeof elOrId === "string" ? $(elOrId) : elOrId;
  if (!el) return;
  el.textContent = value ?? "";
}

function setValue(elOrId, value) {
  const el = typeof elOrId === "string" ? $(elOrId) : elOrId;
  if (!el) return;
  el.value = value ?? "";
}

function getValue(id, fallback = "") {
  const el = $(id);
  return el ? (el.value ?? fallback) : fallback;
}


// ============================================================
// ✅ Storage seguro con fallback (Edge/Tracking Prevention puede bloquear localStorage)
// ============================================================
const SafeStore = (() => {
  let mem = {}; // fallback en memoria

  function canUse(storage) {
    try {
      const k = "__test__" + Date.now();
      storage.setItem(k, "1");
      storage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  const hasLocal = canUse(window.localStorage);
  const hasSession = canUse(window.sessionStorage);
  const store = hasLocal ? window.localStorage : (hasSession ? window.sessionStorage : null);

  return {
    get(key) {
      try {
        return store ? store.getItem(key) : (key in mem ? mem[key] : null);
      } catch {
        return key in mem ? mem[key] : null;
      }
    },
    set(key, value) {
      try {
        if (store) store.setItem(key, String(value));
        else mem[key] = String(value);
      } catch {
        mem[key] = String(value);
      }
    },
    del(key) {
      try {
        if (store) store.removeItem(key);
        else delete mem[key];
      } catch {
        delete mem[key];
      }
    },
    clear(keys = []) {
      keys.forEach((k) => this.del(k));
    },
    using() {
      return store === window.localStorage
        ? "localStorage"
        : store === window.sessionStorage
          ? "sessionStorage"
          : "memory";
    },
  };
})();


// --- Lazy JSON loader (cacheado) ---
const __jsonCache = new Map();

async function __loadJSON(url) {
  if (__jsonCache.has(url)) return __jsonCache.get(url);

  const promise = fetch(url, { cache: "force-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar ${url} (${r.status})`);
      return r.json();
    });

  __jsonCache.set(url, promise);
  return promise;
}


// ============================================================
// 💤 Lazy loader de tablas (carga bajo demanda + cache + anti-duplicados)
// ============================================================

const __tabState = {
  perfilamiento: { loaded: false, ts: 0, inFlight: null },
  radicacion: { loaded: false, ts: 0, inFlight: null },
  "trabaja-nosotros": { loaded: false, ts: 0, inFlight: null },
  historial: { loaded: false, ts: 0, inFlight: null },
  creditos: { loaded: false, ts: 0, inFlight: null },
  comisiones: { loaded: false, ts: 0, inFlight: null },
  asesores: { loaded: false, ts: 0, inFlight: null },
  "fichas-cuentas": { loaded: false, ts: 0, inFlight: null },
};

const __TAB_TTL_MS = 60_000;

function __getActiveAdminTabId() {
  const btn = qs(".admin-tab-btn.active-tab");
  return btn ? btn.getAttribute("data-tab") : null;
}

function invalidateTab(tabId) {
  const s = __tabState[tabId];
  if (!s) return;
  s.loaded = false;
  s.ts = 0;
}

function invalidateAdminData(tabs = []) {
  tabs.forEach(invalidateTab);
}

async function ensureTabData(tabId, { force = false } = {}) {
  const s = __tabState[tabId];
  if (!s) return;

  const fresh = (Date.now() - (s.ts || 0)) < __TAB_TTL_MS;
  if (!force && s.loaded && fresh) return;

  if (s.inFlight) return s.inFlight;

  s.inFlight = (async () => {
    switch (tabId) {
      case "perfilamiento":
        await cargarPerfilamiento();
        break;
      case "radicacion":
        await cargarRadicacion();
        break;
      case "trabaja-nosotros":
        await cargarTrabajaNosotros();
        break;
      case "historial":
        await cargarHistorial();
        break;
      case "creditos":
        await cargarCreditos();
        break;
      case "comisiones":
        await cargarComisiones();
        volverAVistaComisiones();
        break;
      case "asesores":
        await cargarAsesores();
        break;
      case "fichas-cuentas":
        await Promise.all([
          (typeof verFichasComerciales === "function") ? verFichasComerciales("admin") : Promise.resolve(),
          (typeof verCuentasCobroAdmin === "function") ? verCuentasCobroAdmin() : Promise.resolve(),
        ]);
        break;
      default:
        break;
    }

    s.loaded = true;
    s.ts = Date.now();
  })().finally(() => {
    s.inFlight = null;
  });

  return s.inFlight;
}

// --- Helpers para legibilidad y formato ---
function formatDate(dateString) {
  if (!dateString) return "N/A";

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Fecha inválida";

  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function obtenerNombreTipo(tipo) {
  switch (tipo) {
    case "credivillas": return "Credivillas";
    case "libranza": return "Libranza";
    case "hipotecario": return "Hipotecario";
    case "Tarjetas":
    case "tarjeta": return "Tarjeta de Crédito";
    case "radicacion": return "Radicación";
    case "trabaja-nosotros": return "Trabaja con Nosotros";
    default: return tipo;
  }
}

function formatearNombreCampo(key) {
  const reemplazos = {
    "cedula-trabaja": "Cédula Asesor",
  };
  if (reemplazos[key]) return reemplazos[key];

  return key
    .replace(/[_-]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0) + word.slice(1))
    .join(" ");
}


// --- Funciones de Autenticación y UI (basadas en SafeStore) ---
function isAuthenticated() {
  return SafeStore.get("authenticated") === "true";
}

function getUserRole() {
  return SafeStore.get("userRole");
}

function getUserName() {
  return SafeStore.get("userName");
}

// 🧠 Función de login
async function login(username, password) {
  try {

    // =========================
    // LOGIN USUARIO
    // =========================
    const { data, error } = await supabaseClient
      .from("usuarios")
      .select("*")
      .eq("usuario", username)
      .eq("contraseña", password)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error(
        "Error de login:",
        error?.message || "Credenciales inválidas"
      );

      mostrarMensaje(
        null,
        "error",
        "Usuario o contraseña incorrectos"
      );

      return false;
    }

    // =========================
    // BUSCAR ESTADO REAL EN ASESORES
    // =========================
    let estadoAsesor = "";

    const { data: asesorData, error: asesorError } =
      await supabaseClient
        .from("asesores")
        .select("estado")
        .eq("cedula", data.usuario)
        .maybeSingle();

    if (asesorError) {
      console.error(
        "Error consultando asesor:",
        asesorError
      );
    }

    if (asesorData) {
      estadoAsesor = String(
        asesorData.estado || ""
      ).trim();
    }

    console.log("Estado real asesor:", estadoAsesor);

    // =========================
    // GUARDAR SESIÓN
    // =========================
    SafeStore.set("authenticated", "true");
    SafeStore.set("userRole", data.rol);
    SafeStore.set("userName", data.nombre_completo);
    SafeStore.set("username", data.usuario);

    // ✅ Cédula asesor
    SafeStore.set("usuario_cedula", data.usuario);

    // ✅ Estado REAL desde tabla asesores
    SafeStore.set("usuario_estado", estadoAsesor);

    // =========================
    // UI
    // =========================
    updateAuthUI();
    hideLoginModal();

    // ✅ Autocompletar formularios
    autocompletarDatosAsesor();

    // 🔹 Mostrar panel
    await showAdminPanel();

    mostrarMensaje(
      null,
      "exito",
      `Bienvenido, ${data.nombre_completo}`
    );

    return true;

  } catch (err) {

    console.error("Error inesperado en login:", err);

    mostrarMensaje(
      null,
      "error",
      "Error inesperado al iniciar sesión"
    );

    return false;
  }
}

// 🚪 Cerrar sesión
function logout() {
  SafeStore.clear([
    "authenticated",
    "userRole",
    "userName",
    "username",
    "usuario_cedula",
  ]);

  // ✅ Reset de banderas de inicialización (evita estados pegados en recargas)
  window._listenersIniciados = false;
  window._adminPanelStarted = false;
  window.__realtimeStarted = false;

  updateAuthUI();
  hideAdminPanel();
  showLoginModal();
  showSection("inicio");

  console.log("🔒 Sesión cerrada correctamente. Storage:", SafeStore.using());
}


// 📦 Mostrar modal de login
function showLoginModal() {
  $("login-modal")?.classList.add("visible");

  const msg = qs("#login-modal .mt-6 p:last-child");
  if (msg) msg.innerHTML = "Ingrese su usuario y contraseña registrados.";
}

// Ocultar modal
function hideLoginModal() {
  $("login-modal")?.classList.remove("visible");
}


// 🧱 Mostrar panel de administración o comercial según el rol
async function showAdminPanel() {
  // ✅ Guard fuerte: si NO está autenticado, NO intentes activar paneles
  if (!isAuthenticated()) {
    console.log("🚪 No autenticado: no se activa panel. Storage:", SafeStore.using());
    updateAuthUI();
    showLoginModal();
    showSection("inicio");
    return;
  }

  const userRole = getUserRole();
  const userName = getUserName();

  // ✅ Guard: evita re-inicializar el panel admin/operativo varias veces
  if ((userRole === "admin" || userRole === "operativo") && window._adminPanelStarted) {
    return;
  }
  if (userRole === "admin" || userRole === "operativo") {
    window._adminPanelStarted = true;
  }

  const adminPanel = $("admin");
  const comercialPanel = $("seccion-comercial");

  // Panel para administradores / operativos
  if (userRole === "admin" || userRole === "operativo") {
    if (adminPanel) adminPanel.classList.remove("hidden");
    if (comercialPanel) comercialPanel.classList.add("hidden");

    showAdminContent("creditos");
    applyRolePermissions();

    // 🟢 Cargar asesores activos para el select
    await cargarAsesoresParaCuentas();

    // ✅ No reiniciar listeners
    if (!window._listenersIniciados) {
      await initRealtimeListeners();
      window._listenersIniciados = true;
    }

    console.log(`🧰 Panel administrativo activado (${userRole}). Storage: ${SafeStore.using()}`);
  }

  // Panel para comerciales
  else if (userRole === "comercial") {
    if (comercialPanel) comercialPanel.classList.remove("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");

    console.log(`👤 Panel comercial activado para: ${userName}. Storage: ${SafeStore.using()}`);

    try {
      abrirVista("vista-principal");
      // No se carga automáticamente ninguna ficha
    } catch (err) {
      console.error("❌ Error al inicializar el panel comercial:", err);
    }
  }

  // Rol desconocido
  else {
    console.warn(`⚠️ Rol desconocido o sin panel asignado: ${userRole}`);
    if (adminPanel) adminPanel.classList.add("hidden");
    if (comercialPanel) comercialPanel.classList.add("hidden");
  }
}


// 🧱 Ocultar panel de administración
function hideAdminPanel() {
  const adminPanel = $("admin");
  if (adminPanel) adminPanel.classList.add("hidden");
}


// 🔄 Actualiza la interfaz según el estado del login
function updateAuthUI() {
  let authenticated = false;
  let userRole = null;
  let userName = null;

  // ✅ Protección si el navegador bloquea storage
  try {
    authenticated = isAuthenticated();
    userRole = getUserRole();
    userName = getUserName();
  } catch (e) {
    console.warn("⚠️ No se pudo leer storage. Usando fallback. Detalle:", e);
    authenticated = false;
  }

  // Elementos comunes de la interfaz
  const adminLink = $("admin-link");
  const mobileAdminLink = $("mobile-admin-link");
  const logoutBtn = $("logout-button");
  const mobileLogoutBtn = $("mobile-logout-button");
  const adminDashboardLink = $("admin-dashboard-link");
  const mobileAdminDashboardLink = $("mobile-admin-dashboard-link");
  const userFullNameSpan = $("user-full-name");

  // Paneles
  const adminPanel = $("admin");
  const comercialPanel = $("seccion-comercial");

  if (authenticated) {
    if (adminLink) adminLink.classList.add("hidden");
    if (mobileAdminLink) mobileAdminLink.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    if (mobileLogoutBtn) mobileLogoutBtn.classList.remove("hidden");
    if (adminDashboardLink) adminDashboardLink.classList.remove("hidden");
    if (mobileAdminDashboardLink) mobileAdminDashboardLink.classList.remove("hidden");

    if (userFullNameSpan) {
      userFullNameSpan.textContent = `Bienvenido, ${userName || ""}`;
      userFullNameSpan.classList.remove("hidden");
    }

    // Control por rol
    if (userRole === "admin" || userRole === "operativo") {
      if (adminPanel) adminPanel.classList.remove("hidden");
      if (comercialPanel) comercialPanel.classList.add("hidden");
    } else if (userRole === "comercial") {
      if (comercialPanel) comercialPanel.classList.remove("hidden");
      if (adminPanel) adminPanel.classList.add("hidden");

      console.log(`👤 Panel comercial activado para: ${userName}`);

      try {
        abrirVista("vista-principal");
      } catch (err) {
        console.error("❌ Error al inicializar la vista comercial:", err);
      }
    } else {
      if (adminPanel) adminPanel.classList.add("hidden");
      if (comercialPanel) comercialPanel.classList.add("hidden");
      console.warn(`⚠️ Rol desconocido o no autorizado: ${userRole}`);
    }
  } else {
    if (adminLink) adminLink.classList.remove("hidden");
    if (mobileAdminLink) mobileAdminLink.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (mobileLogoutBtn) mobileLogoutBtn.classList.add("hidden");
    if (adminDashboardLink) adminDashboardLink.classList.add("hidden");
    if (mobileAdminDashboardLink) mobileAdminDashboardLink.classList.add("hidden");

    if (userFullNameSpan) {
      userFullNameSpan.textContent = "";
      userFullNameSpan.classList.add("hidden");
    }

    if (adminPanel) adminPanel.classList.add("hidden");
    if (comercialPanel) comercialPanel.classList.add("hidden");

    console.log("🚪 Usuario no autenticado: interfaz restaurada. Storage:", SafeStore.using());
  }
}

// --- Gestión de Solicitudes (versión Supabase) ---
async function handleFormSubmit(event, formType) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  console.log("ESTADO CIVIL =>", formData.get("radicacion-estado"));
  for (const [k, v] of formData.entries()) {
    console.log(k, "=>", v);
  }

  // ✅ Validar asesor SOLO en perfilamiento y radicación
  if (formType !== "trabaja-nosotros") {
    const okAsesor = await validarAsesorAntesDeEnviar(formData, formType, form);
    if (!okAsesor) return;
  }


  // --- Validaciones personalizadas ---
  function validarMonto(monto) {
    if (isNaN(monto) || monto <= 1000000) {
      mostrarMensaje(
        form,
        "error",
        "El monto solicitado debe ser mayor a 1,000,000 COP"
      );
      return false;
    }
    return true;
  }

  function validarTelefono(telefono) {
    const regex = /^[0-9]{10}$/;
    if (!regex.test(telefono)) {
      mostrarMensaje(
        form,
        "error",
        "Ingrese un número de teléfono válido de 10 dígitos."
      );
      return false;
    }
    return true;
  }

  function validarCedula(cedula) {
    const regex = /^[0-9]{5,15}$/;
    if (!regex.test(cedula)) {
      mostrarMensaje(
        form,
        "error",
        "Ingrese una cédula válida (solo números, sin signos ni letras)."
      );
      return false;
    }
    return true;
  }

  function validarCorreo(correo) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(correo)) {
      mostrarMensaje(
        form,
        "error",
        "Ingrese un correo electrónico válido. Ejemplo: usuario@gmail.com"
      );
      return false;
    }
    return true;
  }

  // --- Aplicar validaciones según tipo de formulario ---
  if (formType === "trabaja-nosotros") {
    if (!validarCedula(formData.get("cedula-trabaja"))) return;
    if (!validarTelefono(formData.get("telefono"))) return;
    if (!validarCorreo(formData.get("email"))) return;
  } else if (formType === "radicacion") {
    if (!perfilamientoRadicacionEstaCargado()) {
      mostrarMensaje(
        form,
        "error",
        "❌ Primero debes buscar al cliente y cargar los datos desde perfilamiento antes de radicar."
      );
      return;
    }
    if (!validarCedula(formData.get("cedula-radicacion"))) return;
    if (!validarTelefono(formData.get("radicacion-telefono"))) return;
    if (!validarCorreo(formData.get("radicacion-correo-electronico"))) return;
    if (!validarReferenciasUnicasRadicacion(formData, form)) return;
  } else {
    // Solo para perfilamiento: credivillas, libranza, hipotecario, tarjetas
    if (!validarCedula(formData.get("cedula-cliente"))) return;
    if (!validarTelefono(formData.get("telefono"))) return;
    if (!validarCorreo(formData.get("email"))) return;
    // 💡 Validar monto solo si no es Tarjeta de Crédito
    if (formType !== "tarjetas") {
      const monto = parseFloat(formData.get("valor-credito") || 0);
      if (!validarMonto(monto)) return;
    }
  }

  async function validarAsesorAntesDeEnviar(formData, formType, form) {
    const cedulaAsesor =
      formData.get("cedula-asesor") || formData.get("cedula-asesor-radicacion");

    const cedulaStr = String(cedulaAsesor || "").trim();
    if (!cedulaStr) {
      mostrarMensaje(form, "error", "❌ Debes ingresar la cédula del asesor.");
      return false;
    }

    const { data, error } = await supabaseClient
      .from("asesores")
      .select("cedula")
      .eq("cedula", cedulaStr)
      .limit(1);

    if (error || !data || data.length === 0) {
      mostrarMensaje(form, "error", "❌ Asesor no encontrado. No se puede enviar.");
      return false;
    }

    return true;
  }

  // --- Si todo está correcto, guardar en Supabase ---
  try {
    const nuevaSolicitud = await guardarSolicitud(formType, formData);
    if (!nuevaSolicitud) return; // Si ya existe o hay error, no continúa

    mostrarMensaje(
      form,
      "exito",
      `✅ ¡Solicitud de ${obtenerNombreTipo(formType)} enviada con éxito!`
    );
    form.reset();
  } catch (e) {
    console.error("Error al enviar la solicitud:", e);
    mostrarMensaje(
      form,
      "error",
      "❌ Hubo un error al enviar la solicitud. Por favor, inténtalo de nuevo."
    );
  }
}

// --- Mostrar mensajes en formularios ---
function mostrarMensaje(form, tipo, texto) {
  const clase =
    tipo === "exito"
      ? "mensaje-exito mt-4 p-3 rounded bg-green-100 text-green-700 font-semibold"
      : "mensaje-error mt-4 p-3 rounded bg-red-100 text-red-700 font-semibold";

  let contenedor = form || $("mensajes-globales");
  if (!contenedor) {
    contenedor = document.createElement("div");
    contenedor.id = "mensajes-globales";
    contenedor.className = "fixed top-4 right-4 z-50 space-y-2";
    document.body.appendChild(contenedor);
  }

  const mensaje = document.createElement("div");
  mensaje.className = clase;
  mensaje.textContent = texto;
  contenedor.appendChild(mensaje);

  setTimeout(() => mensaje.remove(), 5000);
}

// --- Habilitar / Deshabilitar campos de Radicación ---
const camposRadicacion = [
  "radicacion-apellido1",
  "radicacion-apellido2",
  "radicacion-nombre1",
  "radicacion-nombre2",
  "radicacion-fecha-nacimiento",
  "radicacion-estado", // Corrected name
  "radicacion-telefono",
  "radicacion-ciudad-residencia",
  "radicacion-correo-electronico",
  "direccion-cliente",
  "barrio",
  "nombre-referencia1",
  "telefono-referencia1",
  "parentesco-referencia1",
  "direccion-referencia1",
  "departamento-referencia1", // Agregado
  "ciudad-referencia1",
  "nombre-referencia2",
  "telefono-referencia2",
  "parentesco-referencia2",
  "direccion-referencia2",
  "departamento-referencia2", // Agregado
  "ciudad-referencia2",
  "nombre-referencia3",
  "telefono-referencia3",
  "departamento-referencia3", // Agregado
  "ciudad-referencia3",
  "nombre-beneficiario",
  "cedula-beneficiario",
  "parentesco-beneficiario",
  "tipo-radicacion",
];

function toggleCamposRadicacion(enabled) {
  camposRadicacion.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = !enabled;
      el.classList.toggle("bg-gray-100", !enabled);
      el.classList.toggle("cursor-not-allowed", !enabled);
    }
  });

  const submitButton = qs(
    "#radicacion-form button[type='submit']"
  );
  if (submitButton) {
    submitButton.disabled = !enabled;
    submitButton.classList.toggle("opacity-50", !enabled);
    submitButton.classList.toggle("cursor-not-allowed", !enabled);
  }
}

// Helpers para legibilidad
function deshabilitarCamposRadicacion() {
  toggleCamposRadicacion(false);
}
function habilitarCamposRadicacion() {
  toggleCamposRadicacion(true);
}

const camposRadicacionPerfilamiento = [
  "radicacion-apellido1",
  "radicacion-apellido2",
  "radicacion-nombre1",
  "radicacion-nombre2",
  "radicacion-fecha-nacimiento",
  "radicacion-estado",
  "radicacion-telefono",
  "radicacion-ciudad-residencia",
  "radicacion-correo-electronico",
  "radicacion-direccion-residencia",
  "radicacion-barrio",
];

function setCamposPerfilamientoRadicacionLocked(locked = true) {
  camposRadicacionPerfilamiento.forEach((id) => {
    const el = $(id);
    if (!el) return;

    // Para inputs normales
    if (el.tagName !== "SELECT") {
      el.readOnly = !!locked;
    }

    // Para selects, no uses disabled si quieres que se envíen en FormData
    if (el.tagName === "SELECT") {
      el.style.pointerEvents = locked ? "none" : "auto";
      el.tabIndex = locked ? -1 : 0;
    }

    el.classList.toggle("bg-gray-100", !!locked);
    el.classList.toggle("cursor-not-allowed", !!locked);
  });
}

function marcarPerfilamientoRadicacionCargado(cargado) {
  window.__radicacionPerfilamientoCargado = !!cargado;
}

function perfilamientoRadicacionEstaCargado() {
  return !!window.__radicacionPerfilamientoCargado;
}

function validarReferenciasUnicasRadicacion(formData, form) {
  const referencias = [1, 2, 3].map((idx) => ({
    nombre: String(formData.get(`nombre-referencia${idx}`) || "").trim(),
    telefono: String(formData.get(`telefono-referencia${idx}`) || "").trim(),
    numero: idx,
  }));

  const nombres = new Map();
  const telefonos = new Map();

  for (const ref of referencias) {
    if (ref.nombre) {
      const claveNombre = normalizarTextoPlano(ref.nombre);
      if (nombres.has(claveNombre)) {
        mostrarMensaje(
          form,
          "error",
          `❌ La referencia ${ref.numero} repite el nombre de la referencia ${nombres.get(claveNombre)}. Debes cambiarla.`
        );
        return false;
      }
      nombres.set(claveNombre, ref.numero);
    }

    if (ref.telefono) {
      const claveTelefono = ref.telefono.replace(/\D/g, "");
      if (telefonos.has(claveTelefono)) {
        mostrarMensaje(
          form,
          "error",
          `❌ La referencia ${ref.numero} repite el número de la referencia ${telefonos.get(claveTelefono)}. Debes cambiarlo.`
        );
        return false;
      }
      telefonos.set(claveTelefono, ref.numero);
    }
  }

  return true;
}

// --- Formatear números a moneda ---
function formatCurrency(valor) {

  // Si viene vacío, null, undefined, NaN o 0
  if (
    valor === null ||
    valor === undefined ||
    valor === "" ||
    isNaN(Number(valor)) ||
    Number(valor) === 0
  ) {
    return "-";
  }

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

function formatPercentage(value) {
  if (!value || isNaN(value)) return "-";
  return `${parseFloat(value).toFixed(2)}%`;
}

function formatCurrencyComision(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === "" ||
    Number(valor) === 0
  ) {
    return "-";
  }
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(valor || 0));
}

function normalizarTextoPlano(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function esEntidadAvVillas(valor) {
  const texto = normalizarTextoPlano(valor);
  return texto.includes("av villas") || texto.includes("avvillas");
}

function aplicaReglaLibranzaSinSeguroNiCampana({ entidad, linea }) {
  const lineaNormalizada = normalizarTextoPlano(linea);
  return lineaNormalizada === "libranza" && !esEntidadAvVillas(entidad);
}

function normalizarCreditoSegunReglaLibranza(credito = {}) {
  const normalizado = { ...credito };

  if (aplicaReglaLibranzaSinSeguroNiCampana({
    entidad: normalizado.entidad,
    linea: normalizado.linea,
  })) {
    normalizado.seguro = "";
    normalizado.campana = "";
  }

  return normalizado;
}

// --- Guardar Solicitud en Supabase (con validación de duplicados) ---
async function guardarSolicitud(tipo, formData, form = null) {
  // ✅ Captura la hora apenas el usuario envía la solicitud
  const fechaSolicitud = new Date().toISOString();

  const allFormData = {};
  let nombre = "N/A",
    documento = "N/A",
    monto = "0",
    email = "N/A";

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      try {
        const safeFileName = value.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");

        const filePath = `${tipo}/${Date.now()}_${safeFileName}`;

        const { error: uploadError } = await supabaseClient.storage
          .from("archivos")
          .upload(filePath, value, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabaseClient.storage
          .from("archivos")
          .getPublicUrl(filePath);

        allFormData[key] = publicData.publicUrl;
      } catch (error) {
        console.error(`Error al subir archivo ${value.name}:`, error);
        allFormData[key] = `[Error al subir: ${value.name}]`;
        mostrarMensaje(form, "error", `Error al subir el archivo ${value.name}.`);
      }
    } else {
      if (selectOptions[key]) {
        allFormData[key] = value
          .toLowerCase()
          .replace(/ /g, "-")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\//g, "");
      } else if (
        typeof value === "string" &&
        !["email", "radicacion-correo-electronico"].includes(key)
      ) {
        allFormData[key] = value;
      } else if (
        [
          "valor-credito",
          "valor-vivienda",
          "ingreso-principal",
          "otros-ingresos",
          "valor-inmueble",
          "valor-activos",
        ].includes(key)
      ) {
        allFormData[key] = parseFloat(value) || 0;
      } else {
        allFormData[key] = value;
      }
    }
  }

  if (tipo === "trabaja-nosotros") {
    nombre = allFormData["nombre"] || "N/A";
    email = allFormData["email"] || "N/A";
    documento = allFormData["cedula-trabaja"] || "N/A";
  } else if (tipo === "radicacion") {
    nombre = `${allFormData["radicacion-apellido1"] || ""} ${allFormData["radicacion-apellido2"] || ""} ${allFormData["radicacion-nombre1"] || ""} ${allFormData["radicacion-nombre2"] || ""}`.trim();
    documento = allFormData["cedula-radicacion"] || "N/A";
    email = allFormData["radicacion-correo-electronico"] || "N/A";
  } else {
    nombre = `${allFormData["apellido1"] || ""} ${allFormData["apellido2"] || ""} ${allFormData["nombre1"] || ""} ${allFormData["nombre2"] || ""}`.trim();
    documento = allFormData["cedula-cliente"] || "N/A";
    monto = allFormData["valor-credito"] || 0;
    email = allFormData["email"] || "N/A";
  }

  const { data: existente, error: checkError } = await supabaseClient
    .from("solicitudes")
    .select("id")
    .eq("documento", documento)
    .eq("tipo", tipo)
    .maybeSingle();

  if (checkError) return mostrarMensaje(form, "error", "Error verificando duplicados.");

  if (existente) {
    return mostrarMensaje(
      form,
      "error",
      "⚠️ Ya existe una solicitud con este documento."
    );
  }

  const nuevaSolicitud = {
    tipo,
    fecha: fechaSolicitud, // ✅ usa la hora real del envío
    nombre,
    documento,
    monto,
    email,
    datos: allFormData,
    estado: "Pendiente",
    observaciones: "",
    cambiadopor: "",
  };

  try {
    const { data, error } = await supabaseClient
      .from("solicitudes")
      .insert([nuevaSolicitud])
      .select()
      .single();

    if (error) throw error;

    mostrarMensaje(form, "exito", "✅ Solicitud enviada correctamente.");
    return data;
  } catch (e) {
    console.error("Error guardando solicitud:", e);
    mostrarMensaje(form, "error", "Error enviando la solicitud.");
    return null;
  }
}

async function cambiarEstado(id, nuevoEstado) {
  const userRole = getUserRole();
  const userName = getUserName();

  // Verificar permisos
  if (userRole !== "admin" && userRole !== "operativo") {
    mostrarMensaje(
      null,
      "error",
      "No tienes permiso para cambiar el estado de las solicitudes."
    );
    return;
  }

  if (!id || !nuevoEstado) {
    mostrarMensaje(null, "error", "ID o estado inválido.");
    return;
  }

  try {
    const { data: solicitud, error: getError } = await supabaseClient
      .from("solicitudes")
      .select("*")
      .eq("id", id)
      .single();

    if (getError || !solicitud) {
      mostrarMensaje(null, "error", "Solicitud no encontrada.");
      return;
    }

    if (nuevoEstado === "Realizado" && solicitud.tipo !== "trabaja-nosotros") {
      // 1. Buscar si ya existe una solicitud del mismo tipo y documento en historial_clientes
      const { data: oldHistoryEntry, error: searchHistError } = await supabaseClient
        .from("historial_clientes")
        .select("id")
        .eq("documento", solicitud.documento)
        .eq("tipo", solicitud.tipo)
        .maybeSingle();

      if (searchHistError) {
        console.error(
          "Error buscando entrada antigua en historial:",
          searchHistError
        );
      }

      // 2. Si se encuentra una entrada antigua, eliminarla
      if (oldHistoryEntry) {
        const { error: deleteOldHistError } = await supabaseClient
          .from("historial_clientes")
          .delete()
          .eq("id", oldHistoryEntry.id);

        if (deleteOldHistError) {
          console.error(
            "Error eliminando entrada antigua del historial:",
            deleteOldHistError
          );
          mostrarMensaje(
            null,
            "error",
            `Error al eliminar entrada antigua del historial: ${deleteOldHistError.message}`
          );
          return;
        }
        console.log(
          `Entrada antigua de historial (ID: ${oldHistoryEntry.id}) eliminada para ser reemplazada.`
        );
      }

      // 3. Insertar la nueva solicitud en historial_clientes
      const { error: histError } = await supabaseClient
        .from("historial_clientes")
        .insert([
          {
            tipo: solicitud.tipo,
            fecha: solicitud.fecha,
            nombre: solicitud.nombre,
            documento: solicitud.documento,
            monto: solicitud.monto,
            email: solicitud.email,
            datos: solicitud.datos,
            estado: nuevoEstado,
            observaciones: solicitud.observaciones || "",
            cambiadopor: userName,
            fechacompletado: new Date().toISOString(),
          },
        ]);

      if (histError) {
        console.error("Error al mover a historial:", histError);
        mostrarMensaje(
          null,
          "error",
          `Error al mover a historial: ${histError.message}`
        );
        return;
      }

      const { error: deleteError } = await supabaseClient
        .from("solicitudes")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Error al eliminar solicitud:", deleteError);
        mostrarMensaje(
          null,
          "error",
          `Error al eliminar solicitud: ${deleteError.message}`
        );
        return;
      }

      mostrarMensaje(
        null,
        "exito",
        "✅ Solicitud movida a historial correctamente."
      );
    } else {
      // Solo actualizar estado
      const { error: updateError } = await supabaseClient
        .from("solicitudes")
        .update({ estado: nuevoEstado, cambiadopor: userName })
        .eq("id", id);

      if (updateError) {
        console.error("Error al actualizar estado:", updateError);
        mostrarMensaje(
          null,
          "error",
          `Error al actualizar estado: ${updateError.message}`
        );
        return;
      }

      mostrarMensaje(null, "exito", "✅ Estado actualizado correctamente.");
    }
  } catch (e) {
    console.error("Error cambiando estado:", e);
    mostrarMensaje(
      null,
      "error",
      `Hubo un error al cambiar el estado: ${e.message || JSON.stringify(e)}`
    );
  }
}

// Orden de campos para cada tipo de formulario
// --- Definición de ordenCampos ---
const ordenCampos = {
  credivillas: [
    "fecha-consulta",
    "nombre-asesor",
    "cedula-asesor",
    "estado-asesor", // ✅ nuevo campo
    "valor-credito",
    "destino-credito",
    "convenio",
    "plazo",
    "entidad-compra",
    "seguro",
    "cedula-cliente",
    "apellido1",
    "apellido2",
    "nombre1",
    "nombre2",
    "fecha-nacimiento",
    "estado",
    "personas-cargo",
    "telefono",
    "ciudad-residencia",
    "email",
    "nivel-estudio",
    "profesion",
    "actividad-economica",
    "fecha-actividad",
    "tipo-contrato",
    "nit-empresa",
    "telefono-empresa",
    "ciudad-empresa",
    "ingreso-principal",
    "otros-ingresos",
    "tipo-residencia",
    "tipo-inmueble",
    "valor-inmueble",
    "valor-activos",
  ],
  libranza: [
    "fecha-consulta",
    "nombre-asesor",
    "cedula-asesor",
    "estado-asesor", // ✅ nuevo campo
    "valor-credito",
    "destino-credito",
    "convenio",
    "plazo",
    "entidad-compra",
    "seguro",
    "cedula-cliente",
    "apellido1",
    "apellido2",
    "nombre1",
    "nombre2",
    "fecha-nacimiento",
    "estado",
    "personas-cargo",
    "telefono",
    "ciudad-residencia",
    "email",
    "nivel-estudio",
    "profesion",
    "actividad-economica",
    "fecha-actividad",
    "tipo-contrato",
    "nit-empresa",
    "telefono-empresa",
    "ciudad-empresa",
    "ingreso-principal",
    "otros-ingresos",
    "tipo-residencia",
    "tipo-inmueble",
    "valor-inmueble",
    "valor-activos",
  ],
  hipotecario: [
    "fecha-consulta",
    "nombre-asesor",
    "cedula-asesor",
    "estado-asesor", // ✅ nuevo campo
    "valor-credito",
    "valor-vivienda",
    "destino-credito",
    "convenio",
    "plazo",
    "entidad-compra",
    "seguro",
    "cedula-cliente",
    "apellido1",
    "apellido2",
    "nombre1",
    "nombre2",
    "fecha-nacimiento",
    "estado",
    "personas-cargo",
    "telefono",
    "ciudad-residencia",
    "email",
    "nivel-estudio",
    "profesion",
    "actividad-economica",
    "fecha-actividad",
    "tipo-contrato",
    "nit-empresa",
    "telefono-empresa",
    "ciudad-empresa",
    "ingreso-principal",
    "otros-ingresos",
    "tipo-residencia",
    "tipo-inmueble",
    "valor-inmueble",
    "valor-activos",
  ],
  tarjetas: [
    "fecha-consulta",
    "nombre-asesor",
    "cedula-asesor",
    "estado-asesor", // ✅ nuevo campo
    "valor-credito",
    "destino-credito",
    "convenio",
    "plazo",
    "entidad-compra",
    "seguro",
    "cedula-cliente",
    "apellido1",
    "apellido2",
    "nombre1",
    "nombre2",
    "fecha-nacimiento",
    "estado",
    "personas-cargo",
    "telefono",
    "ciudad-residencia",
    "email",
    "nivel-estudio",
    "profesion",
    "actividad-economica",
    "fecha-actividad",
    "tipo-contrato",
    "nit-empresa",
    "telefono-empresa",
    "ciudad-empresa",
    "ingreso-principal",
    "otros-ingresos",
    "tipo-residencia",
    "tipo-inmueble",
    "valor-inmueble",
    "valor-activos",
  ],
  radicacion: [
    "fecha-radicacion",
    "nombre-asesor-radicacion",
    "cedula-asesor-radicacion",
    "estado-asesor-radicacion", // ✅ nuevo campo
    "tipo-radicacion",
    "cedula-radicacion",
    "radicacion-apellido1",
    "radicacion-apellido2",
    "radicacion-nombre1",
    "radicacion-nombre2",
    "radicacion-fecha-nacimiento",
    "radicacion-ciudad-nacimiento",
    "radicacion-estado",
    "direccion-cliente",
    "barrio",
    "departamento-residencia",
    "radicacion-ciudad-residencia",
    "radicacion-telefono",
    "radicacion-correo-electronico",
    "nombre-referencia1",
    "telefono-referencia1",
    "parentesco-referencia1",
    "direccion-referencia1",
    "departamento-referencia1",
    "ciudad-referencia1",
    "nombre-referencia2",
    "telefono-referencia2",
    "parentesco-referencia2",
    "direccion-referencia2",
    "departamento-referencia2",
    "ciudad-referencia2",
    "nombre-referencia3",
    "telefono-referencia3",
    "departamento-referencia3",
    "ciudad-referencia3",
    "nombre-beneficiario",
    "cedula-beneficiario",
    "parentesco-beneficiario",
  ],
  "trabaja-nosotros": [
    "cedula-trabaja",
    "nombre",
    "email",
    "telefono",
    "ciudad",
    "hv",
    "certificado",
    "rut",
    "cedula",
    "mensaje",
  ],
};

// --- Combinar todos los campos ordenados en una sola lista para el renderizado de detalles ---
const camposOrdenados = [...new Set(Object.values(ordenCampos).flat())];

// Mapeo de opciones para campos select
const selectOptions = {
  estado: ["soltero", "casado", "viudo", "divorciado", "union-libre"],
  "radicacion-estado": [
    "soltero",
    "casado",
    "viudo",
    "divorciado",
    "union-libre",
  ], // Added for consistency
  "personas-cargo": ["0", "1", "2", "3", "4", "5 o más"],
  "nivel-estudio": [
    "ninguno",
    "primaria",
    "secundaria",
    "universitario",
    "tecnico-tecnologo",
    "postgrado",
  ],
  "actividad-economica": [
    "pensionado",
    "empleado",
    "rentista",
    "transportador",
    "independiente",
  ],
  "tipo-contrato": [
    "carrera",
    "fijo",
    "indefinido",
    "labor",
    "libre",
    "servicios",
    "propiedad",
    "provisionalidad",
    "otra",
  ],
  "tipo-residencia": ["familiar", "propia"],
  "tipo-inmueble": ["casa", "apartamento"],
  "destino-credito": ["compra", "libre", "casa-nueva", "casa-usada", "leasing"],
  seguro: ["si", "no"],
  "parentesco-referencia1": [
    "hermano-a",
    "primo-a",
    "tio-a",
    "sobrino-a",
    "padre",
    "madre",
    "abuelo-a",
    "hijo-a",
    "cunado-a",
    "yerno-a",
    "suegro-a",
    "esposo-a",
  ],
  "parentesco-referencia2": [
    "hermano-a",
    "primo-a",
    "tio-a",
    "sobrino-a",
    "padre",
    "madre",
    "abuelo-a",
    "hijo-a",
    "cunado-a",
    "yerno-a",
    "suegro-a",
    "esposo-a",
  ],
  "parentesco-beneficiario": [
    "hermano-a",
    "primo-a",
    "tio-a",
    "sobrino-a",
    "padre",
    "madre",
    "abuelo-a",
    "hijo-a",
    "cunado-a",
    "yerno-a",
    "suegro-a",
    "esposo-a",
  ],
  "tipo-radicacion": [
    "credivillas-radicacion",
    "libranza-radicacion",
    "hipotecario-radicacion",
    "tc-radicacion",
  ],
  linea: ["Hipotecario", "Libranza", "Credivillas", "Tarjetas"],
  tipoSolicitud: ["Libre inversion", "Compra de Cartera"],
};

function capitalizarNombres(texto) {
  return texto
    .toLowerCase()
    .split(" ")
    .map(palabra => {
      if (!palabra) return "";
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}

function capitalizarParrafo(texto) {
  texto = texto.toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ============================================================
// ✍️ Capitalización automática (optimizada)
//    - Evita trabajo excesivo en cada pulsación (throttle con rAF)
//    - Respeta composición IME (móviles/acentos)
// ============================================================
(function setupCapitalizacionOptimizada() {
  const pending = new WeakMap(); // element -> { rafId, lastValue }

  function normalizeAndSet(target) {
    const nombreCampo = (target.name || "").toLowerCase();

    const nextValue =
      nombreCampo.includes("nombre") || nombreCampo.includes("apellido")
        ? capitalizarNombres(target.value)
        : capitalizarParrafo(target.value);

    if (nextValue === target.value) return;

    // Guardar cursor sólo si existe selection
    const cursor =
      typeof target.selectionStart === "number" ? target.selectionStart : null;

    target.value = nextValue;

    if (cursor !== null && typeof target.setSelectionRange === "function") {
      target.setSelectionRange(cursor, cursor);
    }
  }

  document.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!target) return;

      // Evitar interferir con IME / dictado
      if (event.isComposing) return;

      const isTextInput =
        (target.tagName === "INPUT" && target.type === "text") ||
        target.tagName === "TEXTAREA";

      if (!isTextInput) return;

      // Throttle por elemento (1 actualización por frame)
      const state = pending.get(target) || { rafId: null, lastValue: "" };
      if (state.rafId) cancelAnimationFrame(state.rafId);

      state.lastValue = target.value;
      state.rafId = requestAnimationFrame(() => {
        state.rafId = null;
        // Si el valor cambió desde que programamos, aún aplicamos sobre el actual
        normalizeAndSet(target);
      });

      pending.set(target, state);
    },
    { passive: true }
  );
})();


// --- Render de selects en edición (UI) ---
function getSelectHtml(fieldName, currentValue) {
  const options = selectOptions[fieldName] || [];
  let optionsHtml = "";

  // Normalizar valor actual (el que viene de la base de datos o del formulario)
  const normalizedCurrentValue = (currentValue || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/ /g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Verificar si el valor actual ya está dentro de las opciones predefinidas
  const existeEnLista = options.some((opt) => {
    const normalizedOpt = opt
      .toLowerCase()
      .replace(/ /g, "-")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return normalizedOpt === normalizedCurrentValue;
  });

  // Si el valor actual no existe, lo añadimos como opción visible al principio
  if (currentValue && !existeEnLista) {
    optionsHtml += `<option value="${currentValue}" selected>${currentValue}</option>`;
  } else {
    optionsHtml += '<option value="">Seleccione...</option>';
  }

  // Generar las opciones normales
  options.forEach((option) => {
    const normalizedOpt = option
      .toLowerCase()
      .replace(/ /g, "-")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const selected = normalizedOpt === normalizedCurrentValue ? "selected" : "";
    optionsHtml += `<option value="${option}" ${selected}>${option}</option>`;
  });

  // Retornar el <select> completo
  return `
    <select
      id="edit-${fieldName}"
      data-field-name="${fieldName}"
      class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
    >
      ${optionsHtml}
    </select>
  `;
}

// ============================================================
// 🔄 CARGA DE SOLICITUDES (PERFILAMIENTO / RADICACIÓN / TRABAJA)
//    Refactor para eliminar código duplicado y mejorar rendimiento
// ============================================================

/**
 * Carga solicitudes y renderiza una tabla con contador y mensaje "sin datos".
 * Mantiene la misma salida (usa renderFila) pero evita repetir la lógica.
 */
async function cargarSolicitudesTabla({
  queryBuilder,
  tbodyId,
  emptyId,
  contadorId,
  renderContext,
}) {
  const tbody = document.getElementById(tbodyId);
  const emptyEl = document.getElementById(emptyId);
  const contador = document.getElementById(contadorId);

  if (!tbody) return;

  const { data, error } = await queryBuilder;

  if (error) {
    console.error(`Error cargando ${renderContext}:`, error);
    if (contador) contador.textContent = "(0)";
    return;
  }

  const rows = Array.isArray(data) ? data : [];

  if (rows.length === 0) {
    tbody.innerHTML = "";
    if (emptyEl) emptyEl.classList.remove("hidden");
    if (contador) contador.textContent = "(0)";
    return;
  }

  if (emptyEl) emptyEl.classList.add("hidden");

  // Render: mantener compatibilidad con renderFila
  // Nota: innerHTML es rápido para tablas grandes; usamos join en una sola asignación.
  tbody.innerHTML = rows.map((s) => renderFila(s, renderContext, false)).join("");

  if (contador) contador.textContent = `(${rows.length})`;
}

// 📊 PERFILAMIENTO
async function cargarPerfilamiento() {
  return cargarSolicitudesTabla({
    queryBuilder: supabaseClient
      .from("solicitudes")
      .select("*")
      .in("tipo", ["credivillas", "libranza", "hipotecario", "tarjetas"])
      .order("fecha", { ascending: false }),
    tbodyId: "solicitudes-table-body-perfilamiento",
    emptyId: "no-solicitudes-perfilamiento",
    contadorId: "contador-perfilamiento",
    renderContext: "perfilamiento",
  });
}

// 📊 RADICACIÓN
async function cargarRadicacion() {
  return cargarSolicitudesTabla({
    queryBuilder: supabaseClient
      .from("solicitudes")
      .select("*")
      .eq("tipo", "radicacion")
      .order("fecha", { ascending: false }),
    tbodyId: "solicitudes-table-body-radicacion",
    emptyId: "no-solicitudes-radicacion",
    contadorId: "contador-radicacion",
    renderContext: "radicacion",
  });
}

// 📊 TRABAJA CON NOSOTROS
async function cargarTrabajaNosotros() {
  return cargarSolicitudesTabla({
    queryBuilder: supabaseClient
      .from("solicitudes")
      .select("*")
      .eq("tipo", "trabaja-nosotros")
      .order("fecha", { ascending: false }),
    tbodyId: "solicitudes-table-body-trabaja-nosotros",
    emptyId: "no-solicitudes-trabaja-nosotros",
    contadorId: "contador-trabaja-nosotros",
    renderContext: "trabaja-nosotros",
  });
}

async function cargarHistorial() {

  // Pedimos conteo EXACTO
  const { data, count, error } = await supabaseClient
    .from("historial_clientes")
    .select("*", { count: "exact" })
    .order("fecha", { ascending: false });

  const tbody = $("solicitudes-table-body-historial");
  const noHistorial = $("no-solicitudes-historial");
  const contador = $("contador-historial");

  if (error) {
    console.error("Error cargando historial:", error);
    if (contador) contador.textContent = "(0)";
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = "";
    noHistorial.classList.remove("hidden");
    if (contador) contador.textContent = "(0)";
  } else {

    // 🔥 Fijamos el contador con el número REAL
    if (contador) contador.textContent = `(${count})`;

    noHistorial.classList.add("hidden");

    // 🔽 --- Tu lógica original intacta, sólo cambié el contador ---
    const clientesMap = new Map();

    data.forEach((solicitud) => {
      const clienteId = solicitud.documento || solicitud.email || "sin-id";

      if (!clientesMap.has(clienteId)) {
        clientesMap.set(clienteId, {
          clienteId,
          nombre: solicitud.nombre || "N/A",
          documentos: new Set(),
          emails: new Set(),
          tipos: new Set(),
          estados: new Set(),
          fechasSolicitud: [],
          fechasCompletado: [],
        });
      }

      const cliente = clientesMap.get(clienteId);

      if (solicitud.documento) cliente.documentos.add(solicitud.documento);
      if (solicitud.email) cliente.emails.add(solicitud.email);

      cliente.tipos.add(obtenerNombreTipo(solicitud.tipo));
      cliente.estados.add(solicitud.estado);
      cliente.fechasSolicitud.push(solicitud.fecha);
      cliente.fechasCompletado.push(solicitud.fechacompletado || "");
    });

    const clientesArray = Array.from(clientesMap.values());

    tbody.innerHTML = clientesArray
      .map((cliente) => {
        const documentosStr = Array.from(cliente.documentos).join(", ");
        const emailsStr = Array.from(cliente.emails).join(", ");
        const tiposStr = Array.from(cliente.tipos).join(", ");

        const fechasSolicitudValidas = cliente.fechasSolicitud
          .filter((f) => f)
          .map((f) => new Date(f).getTime());

        const fechasCompletadoValidas = cliente.fechasCompletado
          .filter((f) => f)
          .map((f) => new Date(f).getTime());

        const fechaSolicitudMin =
          fechasSolicitudValidas.length > 0
            ? new Date(Math.min(...fechasSolicitudValidas))
            : null;

        const fechaCompletadoMax =
          fechasCompletadoValidas.length > 0
            ? new Date(Math.max(...fechasCompletadoValidas))
            : null;

        const estadoStr =
          cliente.estados.size === 1 ? Array.from(cliente.estados)[0] : "Mixto";

        return `
        <tr>
          <td class="px-6 py-4 text-sm">${formatDate(fechaSolicitudMin)}</td>
          <td class="px-6 py-4 text-sm">${tiposStr}</td>
          <td class="px-6 py-4 text-sm whitespace-nowrap">${cliente.nombre}</td>
          <td class="px-6 py-4 text-sm">${documentosStr || emailsStr || "N/A"}</td>
          <td class="px-6 py-4 text-sm">${formatDate(fechaCompletadoMax)}</td>
          <td class="px-6 py-4 text-sm">${estadoStr}</td>
          <td class="px-6 py-4 text-sm flex gap-2">
            <button onclick="verDetalles({ clienteId: '${cliente.clienteId}', isHistory: true })"
              class="text-blue-600 hover:text-blue-900">
              <i class="fas fa-eye"></i> Ver
            </button>
            <button onclick="descargarPDFCliente('${cliente.clienteId}')"
              class="text-red-600 hover:text-red-900">
              <i class="fas fa-file-pdf"></i> PDF
            </button>
          </td>
        </tr>`;
      })
      .join("");
  }
}

async function descargarPDFCliente(clienteId) {
  try {
    const { data, error } = await supabaseClient
      .from("historial_clientes")
      .select("*")
      .or(`documento.eq.${clienteId},email.eq.${clienteId}`)
      .order("fecha", { ascending: true });

    if (error || !data || data.length === 0) {
      mostrarMensaje(
        null,
        "error",
        "No se encontraron datos para este cliente."
      );
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // === Colores corporativos ===
    const verde = [59, 191, 93];
    const azul = [0, 136, 198];

    // === Encabezado ===
    const logoUrl =
      "https://ychkekvylldsbkqlcfid.supabase.co/storage/v1/object/public/archivos/logo.png";
    doc.setFillColor(azul[0], azul[1], azul[2]);
    doc.rect(0, 0, 210, 25, "F");

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = logoUrl;
      doc.addImage(img, "PNG", 10, 3, 25, 18);
    } catch (err) {
      console.warn("⚠️ No se pudo cargar el logo:", err);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text("CREDIBANK GRUPO FINANCIERO", 40, 15);

    // === DATOS DEL CLIENTE ===
    const cliente = data[0];
    let y = 40;
    doc.setTextColor(verde[0], verde[1], verde[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Datos del Cliente", 14, y);
    y += 8;

    const datosPrincipales = [
      ["Nombre", cliente.nombre || "N/A"],
      ["Documento", cliente.documento || "N/A"],
      ["Correo", cliente.email || "N/A"],
      ["Último Estado", data[data.length - 1]?.estado || "N/A"],
      [
        "Última Actualización",
        formatDate(data[data.length - 1]?.fechacompletado),
      ],
    ];

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    datosPrincipales.forEach(([campo, valor]) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text(`${campo}:`, 14, y);
      doc.setFont("helvetica", "normal");
      const textLines = doc.splitTextToSize(String(valor), 130);
      doc.text(textLines, 60, y);
      y += textLines.length * 6;
    });

    // Línea separadora
    y += 4;
    doc.setDrawColor(azul[0], azul[1], azul[2]);
    doc.line(14, y, 196, y);
    y += 10;

    // === DATOS CONSOLIDADOS (jsonb) ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(verde[0], verde[1], verde[2]);
    doc.text("Datos Consolidados", 14, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    // 🔹 Combinar todos los JSONB en un solo objeto sin duplicados
    const mergedDatos = {};
    data.forEach((registro) => {
      if (!registro.datos) return;
      let parsed = registro.datos;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          console.warn("⚠️ No se pudo parsear JSON:", registro.datos);
        }
      }
      if (typeof parsed === "object") {
        Object.entries(parsed).forEach(([key, value]) => {
          if (value !== null && value !== "" && value !== undefined)
            mergedDatos[key] = value;
        });
      }
    });

    const keys = Object.keys(mergedDatos);
    if (keys.length === 0) {
      doc.text("Sin datos adicionales registrados.", 14, y);
      y += 10;
    } else {
      const colClaveWidth = 80;
      const colValorWidth = 100;

      keys.forEach((k, index) => {
        if (y > 265) {
          doc.addPage();
          y = 20;
        }

        // Fondo alternado
        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(14, y - 4, 182, 8, "F");
        }

        // Clave y valor
        const clave = String(k).replace(/\s+/g, " ").trim();
        const valor = String(mergedDatos[k]);

        const claveLines = doc.splitTextToSize(clave, colClaveWidth);
        const valorLines = doc.splitTextToSize(valor, colValorWidth);

        const rowHeight =
          Math.max(claveLines.length, valorLines.length) * 5 + 3;

        doc.setFont("helvetica", "bold");
        doc.text(claveLines, 16, y + 2);
        doc.setFont("helvetica", "normal");
        doc.text(valorLines, 16 + colClaveWidth + 5, y + 2);

        y += rowHeight;
      });
    }

    // === PIE DE PÁGINA ===
    const fechaActual = new Date().toLocaleString("es-CO");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generado el ${fechaActual}`, 14, 285);
    doc.text("© CREDIBANK Grupo Financiero", 150, 285);

    // === GUARDAR ===
    doc.save(`Datos_${cliente.nombre || clienteId}.pdf`);
  } catch (e) {
    console.error(e);
    mostrarMensaje(null, "error", "Error generando el PDF.");
  }
}

// 📄 Generar PDF de PERFILAMIENTO con diseño corporativo
async function descargarPDFPerfilamiento(idSolicitud) {
  try {
    const { data, error } = await supabaseClient
      .from("solicitudes")
      .select("*")
      .eq("id", idSolicitud)
      .single();

    if (error || !data) {
      mostrarMensaje(null, "error", "No se encontró la solicitud.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // === Colores corporativos ===
    const verde = [59, 191, 93];
    const azul = [0, 136, 198];
    const logoUrl =
      "https://ychkekvylldsbkqlcfid.supabase.co/storage/v1/object/public/archivos/logo.png";

    // === Encabezado ===
    doc.setFillColor(...verde);
    doc.rect(0, 0, 210, 25, "F");

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = logoUrl;
      doc.addImage(img, "PNG", 10, 3, 25, 18);
    } catch (err) {
      console.warn("⚠️ No se pudo cargar el logo:", err);
    }

    // === Títulos encabezado (centrados y sin encimarse) ===
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("CREDIBANK GRUPO FINANCIERO", 105, 13, { align: "center" });
    doc.setFontSize(11);
    doc.text("FORMULARIO DE PERFILAMIENTO", 105, 20, { align: "center" });

    // === Datos principales ===
    let y = 40;
    doc.setTextColor(...verde);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Datos del Cliente", 14, y);
    y += 8;

    const datosPrincipales = [
      ["Tipo de Crédito", obtenerNombreTipo(data.tipo)],
      ["Nombre", data.nombre || "N/A"],
      ["Documento", data.documento || "N/A"],
      ["Correo", data.email || "N/A"],
      ["Valor del Crédito", formatCurrency(data.monto)],
      ["Fecha de Solicitud", formatDate(data.fecha)],
      ["Estado", data.estado || "Pendiente"],
      ["Último Cambio por", data.cambiadopor || "N/A"],
    ];

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    datosPrincipales.forEach(([campo, valor]) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text(`${campo}:`, 14, y);
      doc.setFont("helvetica", "normal");
      const textLines = doc.splitTextToSize(String(valor), 120);
      doc.text(textLines, 70, y);
      y += textLines.length * 6;
    });

    // === Línea separadora ===
    y += 4;
    doc.setDrawColor(...verde);
    doc.line(14, y, 196, y);
    y += 10;

    // === Datos completos ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...verde);
    doc.text("Datos del Formulario", 14, y);
    y += 8;

    // --- Obtener todos los datos del formulario ---
    const allData =
      typeof data.datos === "string"
        ? JSON.parse(data.datos)
        : data.datos || {};

    // --- Determinar tipo de formulario del perfilamiento ---
    const tipoForm = (data.tipo || "").toLowerCase();

    // --- Buscar el orden correspondiente según el tipo ---
    let listaOrden = [];
    if (ordenCampos[tipoForm]) {
      listaOrden = ordenCampos[tipoForm];
    } else {
      console.warn(
        `⚠️ Tipo de formulario no encontrado en ordenCampos: ${tipoForm}`
      );
      listaOrden = camposOrdenados; // fallback global
    }

    // --- Filtrar los campos existentes ---
    const keys = listaOrden.filter((campo) => allData.hasOwnProperty(campo));

    if (keys.length === 0) {
      doc.setTextColor(0, 0, 0);
      doc.text("Sin datos adicionales registrados.", 14, y);
      y += 10;
    } else {
      const colClaveWidth = 80;
      const colValorWidth = 100;

      keys.forEach((k, index) => {
        if (y > 265) {
          doc.addPage();
          y = 20;
        }

        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(14, y - 4, 182, 8, "F");
        }

        const clave = formatearNombreCampo(k);
        const valor = allData[k] ?? "-";

        const claveLines = doc.splitTextToSize(clave, colClaveWidth);
        const valorLines = doc.splitTextToSize(String(valor), colValorWidth);
        const rowHeight =
          Math.max(claveLines.length, valorLines.length) * 5 + 3;

        // --- Título de campo en negro y negrita ---
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.text(claveLines, 16, y + 2);

        // --- Valor en negro normal ---
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(valorLines, 16 + colClaveWidth + 5, y + 2);

        y += rowHeight;
      });
    }

    // === Pie de página ===
    const fechaActual = new Date().toLocaleString("es-CO");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generado el ${fechaActual}`, 14, 285);
    doc.text("© CREDIBANK Grupo Financiero", 150, 285);

    // === Guardar ===
    doc.save(`Perfilamiento_${data.nombre || data.documento}.pdf`);
  } catch (e) {
    console.error(e);
    mostrarMensaje(null, "error", "Error generando el PDF de perfilamiento.");
  }
}

// 📄 Generar PDF de RADICACIÓN con diseño corporativo
async function descargarPDFRadicacion(idSolicitud) {
  try {
    const { data, error } = await supabaseClient
      .from("solicitudes")
      .select("*")
      .eq("id", idSolicitud)
      .single();

    if (error || !data) {
      mostrarMensaje(null, "error", "No se encontró la solicitud.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const verde = [59, 191, 93];
    const azul = [0, 136, 198];
    const logoUrl =
      "https://ychkekvylldsbkqlcfid.supabase.co/storage/v1/object/public/archivos/logo.png";

    // === Encabezado ===
    doc.setFillColor(...azul);
    doc.rect(0, 0, 210, 25, "F");

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = logoUrl;
      doc.addImage(img, "PNG", 10, 3, 25, 18);
    } catch (err) {
      console.warn("⚠️ No se pudo cargar el logo:", err);
    }

    // === Títulos encabezado (centrados y sin encimarse) ===
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("CREDIBANK GRUPO FINANCIERO", 105, 13, { align: "center" });
    doc.setFontSize(11);
    doc.text("FORMULARIO DE RADICACIÓN", 105, 20, { align: "center" });

    // === Datos principales ===
    let y = 40;
    doc.setTextColor(...verde);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Datos del Cliente", 14, y);
    y += 8;

    const datosPrincipales = [
      ["Tipo de Radicación", data.datos?.["tipo-radicacion"] || "N/A"],
      ["Nombre", data.nombre || "N/A"],
      ["Documento", data.documento || "N/A"],
      ["Correo", data.email || "N/A"],
      ["Fecha de Radicación", formatDate(data.fecha)],
      ["Estado", data.estado || "Pendiente"],
      ["Último Cambio por", data.cambiadopor || "N/A"],
    ];

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    datosPrincipales.forEach(([campo, valor]) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text(`${campo}:`, 14, y);
      doc.setFont("helvetica", "normal");
      const textLines = doc.splitTextToSize(String(valor), 120);
      doc.text(textLines, 70, y);
      y += textLines.length * 6;
    });

    // === Línea separadora ===
    y += 4;
    doc.setDrawColor(...azul);
    doc.line(14, y, 196, y);
    y += 10;

    // === Datos completos ===
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...verde);
    doc.text("Datos de la Radicación", 14, y);
    y += 8;

    // --- Obtener todos los datos del formulario ---
    const allData =
      typeof data.datos === "string"
        ? JSON.parse(data.datos)
        : data.datos || {};

    // --- Determinar tipo de formulario ---
    const tipoForm = (data.tipo || "").toLowerCase();

    // --- Escoger el orden correspondiente ---
    let listaOrden = [];
    if (ordenCampos[tipoForm]) {
      listaOrden = ordenCampos[tipoForm];
    } else {
      // Si no está definido el tipo, usar orden global
      listaOrden = camposOrdenados;
    }

    // --- Mantener solo los campos presentes en el registro ---
    const keys = listaOrden.filter((campo) => allData.hasOwnProperty(campo));

    if (keys.length === 0) {
      doc.setTextColor(0, 0, 0);
      doc.text("Sin datos adicionales registrados.", 14, y);
      y += 10;
    } else {
      const colClaveWidth = 80;
      const colValorWidth = 100;

      keys.forEach((k, index) => {
        if (y > 265) {
          doc.addPage();
          y = 20;
        }

        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(14, y - 4, 182, 8, "F");
        }

        const clave = formatearNombreCampo(k);
        const valor = allData[k] ?? "-";

        const claveLines = doc.splitTextToSize(clave, colClaveWidth);
        const valorLines = doc.splitTextToSize(String(valor), colValorWidth);
        const rowHeight =
          Math.max(claveLines.length, valorLines.length) * 5 + 3;

        // --- Título de campo en negro y negrita ---
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.text(claveLines, 16, y + 2);

        // --- Valor en negro normal ---
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(valorLines, 16 + colClaveWidth + 5, y + 2);

        y += rowHeight;
      });
    }

    // === Pie de página ===
    const fechaActual = new Date().toLocaleString("es-CO");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generado el ${fechaActual}`, 14, 285);
    doc.text("© CREDIBANK Grupo Financiero", 150, 285);

    doc.save(`Radicacion_${data.nombre || data.documento}.pdf`);
  } catch (e) {
    console.error(e);
    mostrarMensaje(null, "error", "Error generando el PDF de radicación.");
  }
}

// --- CRUD Créditos Radicados --- (versiones corregidas)

// ✅ Crear nuevo crédito (contentType + lazy reload correcto)
async function guardarCredito(formData) {
  try {
    const nuevoCredito = {};
    const archivos = ["autorizacion-consulta", "llamadas", "vobo-cliente"];
    const esDigital = $("autorizacion-digital")?.checked;

    // ✅ Edad (si viene vacía -> null)
    const edadRaw = formData.get("edad");
    const edad = parseInt(edadRaw, 10);
    nuevoCredito.edad = Number.isFinite(edad) ? edad : null;

    // ✅ Subir archivos (si aplica)
    for (const nombreCampo of archivos) {
      const archivo = formData.get(nombreCampo);
      const key = nombreCampo.replace(/-/g, "_");

      // Autorización digital no sube archivo
      if (nombreCampo === "autorizacion-consulta" && esDigital) {
        nuevoCredito[key] = "Digital";
        continue;
      }

      // Si no hay archivo válido
      if (!(archivo instanceof File) || !archivo.name) {
        nuevoCredito[key] = null;
        continue;
      }

      try {
        const safeName = archivo.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");

        const path = `creditos_radicados/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabaseClient.storage
          .from("archivos")
          .upload(path, archivo, {
            cacheControl: "3600",
            upsert: true,
            contentType: archivo.type || "application/octet-stream",
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabaseClient.storage
          .from("archivos")
          .getPublicUrl(path);

        nuevoCredito[key] = publicData?.publicUrl ?? null;
      } catch (err) {
        console.error(`Error subiendo ${nombreCampo}:`, err);
        nuevoCredito[key] = null;
      }
    }

    // ✅ Campos que NO deberían convertirse a número (para no perder ceros o precisión)
    const noConvertirANumero = new Set([
      "telefono",
      "cedula",
      "cedula_cliente",
      "numero_credito",
      "n_credito",
      "nit",
    ]);

    // ✅ Copiar el resto del formData al objeto
    formData.forEach((valor, clave) => {
      if (archivos.includes(clave)) return;

      const key = clave.replace(/-/g, "_");

      // Normaliza vacíos
      if (valor === "" || valor === "{}" || valor === "null" || valor == null) {
        nuevoCredito[key] = null;
        return;
      }

      // Si es string numérico y no está en la lista de “no convertir”
      if (typeof valor === "string" && !noConvertirANumero.has(clave)) {
        const n = Number(valor);
        if (Number.isFinite(n) && valor.trim() !== "") {
          nuevoCredito[key] = n;
          return;
        }
      }

      nuevoCredito[key] = valor;
    });

    Object.assign(nuevoCredito, normalizarCreditoSegunReglaLibranza(nuevoCredito));

    const { data, error } = await supabaseClient
      .from("creditos_radicados")
      .insert([nuevoCredito])
      .select()
      .single();

    if (error) throw error;

    mostrarMensaje(null, "exito", "✅ Crédito guardado correctamente.");

    // ✅ Lazy reload: invalida y recarga solo si estás en la pestaña de créditos
    invalidateTab("creditos");
    if (typeof __getActiveAdminTabId === "function" && __getActiveAdminTabId() === "creditos") {
      await ensureTabData("creditos", { force: true });
    }

    return data;
  } catch (error) {
    console.error("⚠️ Error inesperado al guardar crédito:", error);
    mostrarMensaje(null, "error", "⚠️ Error al guardar crédito.");
    return null;
  }
}

async function traerCreditosTodos() {
  const PAGE = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const { data, error } = await supabaseClient
      .from("creditos_radicados")
      .select("*")
      .order("fecha_consulta", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

async function cargarCreditos() {
  const [{ count, error: countError }, creditosRes] = await Promise.all([
    supabaseClient
      .from("creditos_radicados")
      .select("id", { count: "exact", head: true }),
    traerCreditosTodos().then(data => ({ data })).catch(error => ({ error }))
  ]);

  if (countError) console.error("Error contando créditos:", countError);

  const { data, error } = creditosRes;

  const tbody = $("solicitudes-table-body-creditos");
  const noSolicitudes = $("no-solicitudes-creditos");
  const contador = $("contador-creditos");
  const tabla = tbody.closest("table");

  if (error) {
    console.error("Error cargando créditos:", error);
    if (contador) contador.textContent = "(0)";
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = "";
    noSolicitudes.classList.remove("hidden");
    if (contador) contador.textContent = "(0)";
    const tfoot = tabla.querySelector("tfoot");
    if (tfoot) tfoot.remove();
    return;
  }

  noSolicitudes.classList.add("hidden");
  tbody.innerHTML = data.map((c) => renderFilaCredito(c)).join("");

  // ✅ total real
  if (contador) contador.textContent = `(${count ?? data.length})`;

  actualizarTotalesCreditos();
}

// ============================================================
// ✏️ EDITAR Y ACTUALIZAR CRÉDITO — Optimizado sin recargas
// ============================================================

let creditoEditando = null; // Estado global para saber si estamos editando

// ✅ EDITAR CRÉDITO — carga datos y archivos en el formulario
async function editarCredito(id) {
  if (!id) {
    mostrarMensaje(
      null,
      "error",
      "❌ No se ha especificado un crédito válido."
    );
    return;
  }

  const { data, error } = await supabaseClient
    .from("creditos_radicados")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("❌ Error cargando crédito:", error || "No data");
    mostrarMensaje(null, "error", "❌ No se pudo cargar el crédito.");
    return;
  }

  creditoEditando = id;
  const form = $("creditos-form");
  if (!form) return;

  const camposArchivo = ["autorizacion-consulta", "llamadas", "vobo-cliente"];

  Object.keys(data).forEach((key) => {
    const inputName = key.replace(/_/g, "-");
    const input = form.querySelector(`[name="${inputName}"]`);
    if (!input) return;

    const value = data[key] ?? "";

    // 📁 Campos de archivo
    if (input.type === "file") {
      input.value = "";
      const label = input.parentElement.querySelector("label");
      if (!label) return;

      // Limpiar etiquetas previas
      label
        .querySelectorAll("a[href^='http'], span.text-green-600")
        .forEach((el) => el.remove());

      // Mostrar estado actual
      if (typeof value === "string") {
        if (value === "Digital") {
          const span = document.createElement("span");
          span.textContent = "📄 Digital";
          span.className = "text-green-600 font-semibold ml-2";
          label.appendChild(span);
        } else if (value.startsWith("http")) {
          const link = document.createElement("a");
          link.href = value;
          link.target = "_blank";
          link.textContent = value.endsWith(".pdf")
            ? "📄 Ver documento"
            : "🎧 Escuchar audio";
          link.className = "text-blue-600 underline ml-2";
          label.appendChild(link);
        }
      }
      return;
    }

    // 📋 Selects o campos normales
    if (input.tagName === "SELECT") {
      const normalized = (v) =>
        String(v || "")
          .trim()
          .toLowerCase()
          .replace(/ /g, "-")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
      const option = Array.from(input.options).find(
        (opt) =>
          normalized(opt.value) === normalized(value) ||
          normalized(opt.textContent) === normalized(value)
      );
      if (option) {
        input.value = option.value;
      } else if (value) {
        const newOpt = document.createElement("option");
        newOpt.value = value;
        newOpt.textContent = value;
        newOpt.selected = true;
        input.prepend(newOpt);
      }
    } else {
      input.value = value;
    }
  });

  inicializarBloqueoCampos(form);

  $("form-creditos").classList.remove("hidden");
  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) submitButton.textContent = "Actualizar Crédito";
}

// ✅ ACTUALIZAR CRÉDITO — mantiene filtros, posición y sin recarga
async function actualizarCredito(id, entrada) {
  try {
    if (!id) throw new Error("ID no válido.");

    const archivos = ["autorizacion-consulta", "llamadas", "vobo-cliente"];
    let formData;

    if (entrada instanceof FormData) formData = entrada;
    else if (entrada instanceof HTMLFormElement) formData = new FormData(entrada);
    else if (typeof entrada === "object")
      formData = new FormData(Object.entries(entrada));
    else throw new Error("Entrada inválida.");

    const { data: actual, error: fetchError } = await supabaseClient
      .from("creditos_radicados")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !actual) throw new Error("No se encontró el registro.");

    const actualizados = {};
    const subidasFallidas = [];

    for (const campo of archivos) {
      const key = campo.replace(/-/g, "_");
      const input =
        document.getElementById(campo) ||
        document.getElementById(`file-${campo}`);
      const archivo = input?.files?.[0] || null;
      const valorPrevio = actual[key] ?? null;

      const checkDigital =
        campo === "autorizacion-consulta"
          ? $("autorizacion-digital")
          : null;

      if (archivo) {
        try {
          if (checkDigital) checkDigital.checked = false;

          const safeName = archivo.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]/g, "_");

          const path = `creditos_radicados/${id}/${Date.now()}_${safeName}`;

          const { error: uploadError } = await supabaseClient.storage
            .from("archivos")
            .upload(path, archivo, {
              cacheControl: "3600",
              upsert: true,
              contentType: archivo.type,
            });

          if (uploadError) throw uploadError;

          const { data: publicData } = supabaseClient.storage
            .from("archivos")
            .getPublicUrl(path);

          actualizados[key] = publicData.publicUrl;

        } catch (err) {
          subidasFallidas.push(campo);
          console.error(err);
        }
        continue;
      }

      if (checkDigital?.checked) {
        actualizados[key] = "Digital";
        continue;
      }

      actualizados[key] = valorPrevio;
    }

    formData.forEach((valor, clave) => {
      if (archivos.includes(clave) || clave.startsWith("file-")) return;

      const key = clave.replace(/-/g, "_");
      let limpio = valor || null;

      if (limpio !== actual[key]) actualizados[key] = limpio;
    });

    for (const k in actualizados) {
      const v = actualizados[k];
      if (!v || v === "null" || v === "{}") actualizados[k] = null;
      else if (typeof v === "string") actualizados[k] = v.trim();
    }

    Object.assign(actualizados, normalizarCreditoSegunReglaLibranza({
      ...actual,
      ...actualizados,
    }));

    const { error: updateError } = await supabaseClient
      .from("creditos_radicados")
      .update(actualizados)
      .eq("id", id);

    if (updateError) throw updateError;

    mostrarMensaje(null, "exito", "✅ Crédito actualizado correctamente.");

    await aplicarFiltrosCreditos();

  } catch (err) {
    console.error(err);
    mostrarMensaje(null, "error", `⚠️ Error al actualizar: ${err.message}`);
  }
}

// 🔗 Sincroniza checkbox Digital y archivo
const fileAut = $("file-autorizacion-consulta");
const checkDigital = $("autorizacion-digital");

if (fileAut && checkDigital) {
  fileAut.addEventListener("change", () => {
    if (fileAut.files.length > 0) checkDigital.checked = false;
  });
}

// ✅ Eliminar crédito (sin cambios)
async function eliminarCredito(id) {
  const confirmar = confirm("¿Seguro que deseas eliminar este crédito?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("creditos_radicados")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error eliminando crédito:", error);
    mostrarMensaje(null, "error", "❌ No se pudo eliminar el crédito.");
    return;
  }

  mostrarMensaje(null, "exito", "✅ Crédito eliminado correctamente.");
  invalidateTab("creditos");
  if (__getActiveAdminTabId() === "creditos") {
    await ensureTabData("creditos", { force: true });
  }
}

function actualizarTotalesCreditos() {
  const tbody = $("solicitudes-table-body-creditos");
  const tabla = tbody?.closest("table");
  if (!tabla) return;

  const filas = tabla.querySelectorAll("tbody tr");

  // 🔹 Contar solo las filas visibles
  const filasVisibles = Array.from(filas).filter(
    (f) => f.style.display !== "none"
  );
  const totalClientes = filasVisibles.length;

  // Totales
  let totalSolicitado = 0;
  let totalRetanqueo = 0;
  let totalSaldo = 0;
  let totalAprobadoLibranza = 0;
  let totalPagadoLibranza = 0;
  let totalPendienteLibranza = 0;
  let totalAprobadoCredivillas = 0;
  let totalPagadoCredivillas = 0;
  let totalAprobadoHipotecario = 0;
  let totalPagadoHipotecario = 0;
  let totalAprobadoTarjeta = 0;
  let totalTarjetasActivadas = 0;

  // 🧮 Convierte texto con formato a número real
  const parsear = (txt) => {
    if (!txt) return 0;
    const limpio = txt
      .toString()
      .replace(/[^0-9,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    return parseFloat(limpio) || 0;
  };

  // ✅ Sumar solo las filas visibles
  filasVisibles.forEach((fila) => {
    const celdas = fila.querySelectorAll("td");
    totalSolicitado += parsear(celdas[19]?.textContent);
    totalRetanqueo += parsear(celdas[20]?.textContent);
    totalSaldo += parsear(celdas[21]?.textContent);
    totalAprobadoLibranza += parsear(celdas[22]?.textContent);
    totalPagadoLibranza += parsear(celdas[23]?.textContent);
    totalPendienteLibranza += parsear(celdas[24]?.textContent);
    totalAprobadoCredivillas += parsear(celdas[25]?.textContent);
    totalPagadoCredivillas += parsear(celdas[26]?.textContent);
    totalAprobadoHipotecario += parsear(celdas[27]?.textContent);
    totalPagadoHipotecario += parsear(celdas[28]?.textContent);
    totalAprobadoTarjeta += parsear(celdas[29]?.textContent);
    totalTarjetasActivadas += parsear(celdas[30]?.textContent);
  });

  // 🧹 Eliminar sumatoria anterior
  const tfootExistente = tabla.querySelector("tfoot");
  if (tfootExistente) tfootExistente.remove();

  // 🧱 Crear pie de tabla con totales actualizados
  const tfoot = document.createElement("tfoot");
  tfoot.innerHTML = `
    <tr class="bg-gray-100 font-semibold text-gray-800 border-t border-gray-400">
      <td colspan="19" class="px-4 py-2 text-center border border-gray-300">
        TOTAL CLIENTES: ${totalClientes}
      </td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalSolicitado
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalRetanqueo
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalSaldo
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalAprobadoLibranza
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalPagadoLibranza
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalPendienteLibranza
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalAprobadoCredivillas
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalPagadoCredivillas
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalAprobadoHipotecario
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalPagadoHipotecario
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${formatCurrency(
    totalAprobadoTarjeta
  )}</td>
      <td class="px-4 py-2 text-right border border-gray-300">${totalTarjetasActivadas.toLocaleString(
    "es-CO"
  )}</td>
      <td colspan="14" class="border border-gray-300"></td>
    </tr>
  `;
  tabla.appendChild(tfoot);
}

function obtenerColorPorEtapa(etapa) {
  if (!etapa) return "";

  etapa = etapa
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Azul: análisis, preanálisis o en estudio
  if (["analisis", "preanalisis", "en estudio"].includes(etapa)) {
    return "#3b82f6"; // azul
  }

  // Rojo: negado, retenido por otra entidad, desiste
  if (["negado", "retenido por otra entidad", "desiste"].includes(etapa)) {
    return "#ef4444"; // rojo
  }

  // Naranja: radicación pendiente, enviado
  if (["radicacion pendiente", "enviado"].includes(etapa)) {
    return "#f97316"; // naranja
  }

  // Amarillo: negado pte validar
  if (["negado pte validar"].includes(etapa)) {
    return "#facc15"; // amarillo
  }

  // Verde: contabilización aceptado, aceptado, desembolsado
  if (
    ["contabilizacion aceptado", "aceptado", "desembolsado"].includes(etapa)
  ) {
    return "#22c55e"; // verde
  }

  // Sin color para las demás etapas
  return "";
}

// 🩷 Detectar y resaltar clientes repetidos por cédula en la tabla de créditos
function resaltarClientesRepetidos() {
  const filas = $$(
    "#solicitudes-table-body-creditos tr"
  );
  const contador = {};

  // 1️⃣ Contar cuántas veces aparece cada cédula
  filas.forEach((fila) => {
    const cedula = fila.querySelector(".col-cedula")?.textContent?.trim();
    if (cedula) contador[cedula] = (contador[cedula] || 0) + 1;
  });

  // 2️⃣ Resaltar la celda del nombre si la cédula se repite
  filas.forEach((fila) => {
    const cedula = fila.querySelector(".col-cedula")?.textContent?.trim();
    const celdaNombre = fila.querySelector(".col-nombre");
    const celdaCedula = fila.querySelector(".col-cedula");

    if (cedula && celdaNombre && celdaCedula) {
      if (contador[cedula] > 1) {
        // 💖 Resalta la celda del nombre completa
        celdaNombre.style.backgroundColor = "#fbcfe8"; // rosado claro
        celdaNombre.style.color = "black";
        celdaNombre.style.border = "2px solid #f472b6";
      } else {
        // 🔄 Restaura estilos originales si no hay duplicado
        celdaNombre.style.backgroundColor = "";
        celdaNombre.style.color = "black";
        celdaNombre.style.fontWeight = "";
        celdaNombre.style.border = "";
      }
    }
  });
}

// ✅ Ejecutar después de cargar los créditos
document.addEventListener("DOMContentLoaded", () => {
  if ($("solicitudes-table-body-creditos")) {
    // Esperar a que se carguen los datos antes de aplicar el resaltado
    setTimeout(resaltarClientesRepetidos, 1500);
  }
});

// Renderizar fila
function renderFilaCredito(c) {
  const colorEtapa = obtenerColorPorEtapa(c.datos?.etapa || c.etapa);

  // 🧹 Helper para validar URLs de archivos
  const esURLValida = (v) =>
    v &&
    typeof v === "string" &&
    v.startsWith("http") &&
    !["{}", "undefined", "null"].includes(v.trim());

  // 🟢 Mostrar correctamente la autorización de consulta
  const mostrarAutorizacion = (() => {
    if (c.autorizacion_consulta === "Digital") {
      return `<span class="text-green-600 font-semibold">Digital</span>`;
    } else if (esURLValida(c.autorizacion_consulta)) {
      return `<a href="${c.autorizacion_consulta}" target="_blank" class="text-blue-600 underline">Ver PDF</a>`;
    } else {
      return `<span class="text-gray-400 italic">Sin archivo</span>`;
    }
  })();

  const ocultarSeguroYCampana = aplicaReglaLibranzaSinSeguroNiCampana({
    entidad: c.entidad,
    linea: c.linea,
  });
  const campanaVisible = ocultarSeguroYCampana ? "" : (c.campana || "");
  const seguroVisible = ocultarSeguroYCampana ? "" : (c.seguro || "");

  return `
    <tr>
      <!-- Acciones -->
      <td class="border px-4 py-2 text-center whitespace-nowrap">
        ${(() => {
      const userRole = getUserRole(); // Rol actual
      let botones = `
            <button onclick="editarCredito(${c.id})"
              class="bg-yellow-500 text-white px-3 py-1 rounded mr-2 hover:bg-yellow-600 transition whitespace-nowrap">
              <i class="fas fa-edit"></i> Editar
            </button>`;

      // Solo admin puede eliminar
      if (userRole === "admin") {
        botones += `
              <button onclick="eliminarCredito(${c.id})"
                class="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition whitespace-nowrap">
                <i class="fas fa-trash"></i> Eliminar
              </button>`;
      }

      return botones;
    })()}
      </td>

      <td class="border px-4 text-sm whitespace-nowrap">${c.operativo || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.entidad || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.oficina || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.numero_credito || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap col-cedula" 
          style="background-color: ${colorEtapa}; color: black; text-align: center;">
          ${c.cedula || ""}
      </td>
      <td class="border px-4 text-sm whitespace-nowrap col-nombre">${c.nombre || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.linea || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.tipo_solicitud || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.fecha_consulta || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.resultado_consulta || ""
    }</td>
    <td class="border px-4 text-sm whitespace-nowrap">${campanaVisible}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatPercentage(
      c.tasa
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.fecha_radicacion || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.fecha_nacimiento || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.edad ? c.edad + " años" : ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.telefono || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.convenio_libranza || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.empresa || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_solicitado
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_retanqueo
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.saldo_comprar
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_aprobado_libranza
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_pagado_libranza
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_pendiente_libranza
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_aprobado_credivillas
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_pagado_credivillas
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_aprobado_hipotecario
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_pagado_hipotecario
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${formatCurrency(
      c.monto_aprobado_tarjeta
    )}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.numero_tarjetas_activadas || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.categorias_tdc || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.entidad_comprar || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${seguroVisible}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.departamento || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.ciudad || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.plazo || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.etapa || ""}</td>

      <!-- Archivos -->
      <td class="border px-4 py-2 text-center">${mostrarAutorizacion}</td>

      <td class="border px-4 py-2 text-center">
        ${esURLValida(c.llamadas)
      ? `<audio controls class="mx-auto"><source src="${c.llamadas}" type="audio/mpeg"></audio>`
      : `<span class="text-gray-400 italic">Sin audio</span>`
    }
      </td>
      <td class="border px-4 py-2 text-center">
        ${esURLValida(c.vobo_cliente)
      ? `<audio controls class="mx-auto"><source src="${c.vobo_cliente}" type="audio/mpeg"></audio>`
      : `<span class="text-gray-400 italic">Sin audio</span>`
    }
      </td>

      <td class="border px-4 text-sm whitespace-nowrap">${c.fecha_desembolso || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.coordinador || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.ejecutivo_comercial || ""
    }</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.anio || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.mes || ""}</td>
      <td class="border px-4 text-sm whitespace-nowrap">${c.observaciones || ""
    }</td>
    </tr>
  `;
}

// --- Ver detalles de una solicitud o historial de un cliente ---
async function verDetalles({ id = null, clienteId = null, isHistory = false }) {
  try {
    const userRole = getUserRole();
    const table = isHistory ? "historial_clientes" : "solicitudes";
    let solicitudes = [];

    // 🔹 Caso 1: Detalle único por ID
    if (id) {
      const { data: solicitud, error } = await supabaseClient
        .from(table)
        .select("*")
        .eq("id", id)
        .single();

      if (error || !solicitud) {
        mostrarMensaje(null, "error", "La solicitud no fue encontrada.");
        return;
      }
      solicitudes.push(solicitud);
    }

    // 🔹 Caso 2: Historial por clienteId (documento o email)
    if (clienteId) {
      let { data: byDoc, error: docError } = await supabaseClient
        .from("historial_clientes")
        .select("*")
        .eq("documento", clienteId)
        .order("fecha", { ascending: false });

      if (docError) console.error("Error buscando por documento:", docError);

      if (!byDoc || byDoc.length === 0) {
        let { data: byEmail, error: emailError } = await supabaseClient
          .from("historial_clientes")
          .select("*")
          .eq("email", clienteId)
          .order("fecha", { ascending: false });

        if (emailError) console.error("Error buscando por email:", emailError);
        solicitudes = byEmail || [];
      } else {
        solicitudes = byDoc;
      }
    }

    if (solicitudes.length === 0) {
      mostrarMensaje(
        null,
        "error",
        "No se encontraron solicitudes para este cliente."
      );
      return;
    }

    // 🔹 Renderizar detalles
    const detailsContainer = $("details-content");
    let html = "";

    if (clienteId) {
      html += `<h3 class="text-xl font-semibold mb-4">Historial del Cliente: ${solicitudes[0].nombre || "N/A"
        }</h3>`;
    }

    solicitudes.forEach((solicitud, idx) => {
      html += renderSolicitudDetalle(
        solicitud,
        idx,
        userRole,
        isHistory,
        table
      );
    });

    detailsContainer.innerHTML = html;

    // 🔹 Eventos dinámicos (botones)
    solicitudes.forEach((solicitud) => {
      if (!isHistory && (userRole === "admin" || userRole === "operativo")) {
        const updateBtn = document.getElementById(
          `update-status-button-${solicitud.id}`
        );
        if (updateBtn) {
          updateBtn.onclick = async () => {
            const nuevoEstado = document.getElementById(
              `estado-select-${solicitud.id}`
            ).value;
            await cambiarEstado(solicitud.id, nuevoEstado);
            document
              .getElementById("details-modal")
              .classList.remove("visible");
          };
        }
      }

      if (userRole === "admin" || userRole === "operativo") {
        const saveBtn = document.getElementById(
          `save-details-button-${solicitud.id}`
        );
        if (saveBtn) {
          saveBtn.onclick = async () => {
            await guardarCambiosSolicitud(solicitud.id, solicitud.tipo, table);
          };
        }
      }
    });

    $("details-modal").classList.add("visible");
  } catch (e) {
    console.error("Error mostrando detalles:", e);
    mostrarMensaje(null, "error", "Error al cargar detalles.");
  }
}

// --- Renderizar los detalles de la solicitud ---
function renderSolicitudDetalle(solicitud, idx, userRole, isHistory, table) {
  let html = `<div class="mb-6 p-4 border rounded-lg bg-gray-50">`;

  if (idx !== undefined) {
    html += `<h4 class="font-semibold mb-2">Solicitud #${idx + 1
      } - ${obtenerNombreTipo(solicitud.tipo)}</h4>`;
  }

  html += `
    <p><strong>ID:</strong> ${solicitud.id}</p>
    <p><strong>Fecha Solicitud:</strong> ${formatDate(solicitud.fecha)}</p>
    <p><strong>Cambiado Por:</strong> ${solicitud.cambiadopor || "N/A"}</p>
    ${isHistory
      ? `<p><strong>Fecha Completado:</strong> ${formatDate(
        solicitud.fechacompletado
      )}</p>`
      : ""
    }
  `;

  // 🔹 Mostrar y actualizar estado general de la solicitud
  if (!isHistory && (userRole === "admin" || userRole === "operativo")) {
    html += `
      <div class="mb-2">
        <label class="block text-gray-700 text-sm font-bold mb-1">Estado:</label>
        <select id="estado-select-${solicitud.id
      }" class="shadow border rounded w-full py-2 px-3 text-gray-700">
          <option value="Pendiente" ${solicitud.estado === "Pendiente" ? "selected" : ""
      }>Pendiente</option>
          <option value="Realizado" ${solicitud.estado === "Realizado" ? "selected" : ""
      }>Realizado</option>
        </select>
        <button id="update-status-button-${solicitud.id
      }" class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors mt-2">
          Actualizar Estado
        </button>
      </div>
    `;
  } else {
    html += `<p><strong>Estado:</strong> ${solicitud.estado}</p>`;
  }

  html += `<hr class="my-2">`;

  // 🔹 Observaciones
  html += `
    <div class="mb-2">
      <label class="block text-gray-700 text-sm font-bold mb-1">Observaciones:</label>
      <textarea id="edit-observaciones-${solicitud.id}"
        class="shadow border rounded w-full py-2 px-3 text-gray-700"
        data-field-name="observaciones" ${userRole !== "admin" && userRole !== "operativo" ? "readonly" : ""
    }>${solicitud.observaciones || ""}</textarea>
    </div>
  `;

  // 🔹 Renderizar todos los campos guardados (incluido estado asesor)
  camposOrdenados.forEach((key) => {
    if (solicitud.datos && solicitud.datos[key] !== undefined) {
      let valor = solicitud.datos[key];
      if (valor === null || valor === "" || valor === undefined) valor = "-";

      // Formatear valores numéricos
      if (
        [
          "valor-credito",
          "valor-vivienda",
          "ingreso-principal",
          "otros-ingresos",
          "valor-inmueble",
          "valor-activos",
        ].includes(key.toLowerCase())
      ) {
        valor = valor === "-" ? "-" : formatCurrency(valor);
      }

      // 🔸 Mostrar el estado del asesor con el mismo formato visual que los demás campos
      if (key.toLowerCase().includes("estado-asesor")) {
        let colorClass = "text-gray-700";
        if (valor.toLowerCase() === "activo") colorClass = "text-green-600";
        else if (valor.toLowerCase().includes("sin vinc"))
          colorClass = "text-yellow-600";
        else if (valor.toLowerCase() === "inactivo")
          colorClass = "text-red-600";

        html += `
          <div class="mb-2">
            <label class="block text-gray-700 text-sm font-bold mb-1">
              ${formatearNombreCampo(key)}:
            </label>
            <input type="text"
              class="shadow border rounded w-full py-2 px-3 font-semibold ${colorClass} bg-gray-50"
              value="${valor}"
              readonly
            >
          </div>
        `;
      } else {
        html += renderCampo(
          key,
          valor,
          solicitud.id,
          userRole,
          solicitud.tipo,
          isHistory
        );
      }
    }
  });

  // 🔹 Botón de guardar
  if (userRole === "admin" || userRole === "operativo") {
    html += `
      <button id="save-details-button-${solicitud.id}"
        class="gradient-bg text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity mt-4">
        <i class="fas fa-save mr-2"></i>Guardar Cambios
      </button>
    `;
  }

  return html + `</div>`;
}

function renderCampo(key, value, solicitudId, userRole, tipo, isHistory) {
  let formattedKey = formatearNombreCampo(key);

  // Detectar si es campo numérico de moneda
  const camposMoneda = [
    "valor-credito",
    "valor-vivienda",
    "ingreso-principal",
    "otros-ingresos",
    "valor-inmueble",
    "valor-activos",
  ];
  const esCampoMoneda = camposMoneda.includes(key);

  // Para mostrar en texto, formatear moneda
  let displayValue = value;
  if (esCampoMoneda) {
    displayValue = formatCurrency(value);
  }

  // Si es archivo
  if (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://"))
  ) {
    const fileName = value.substring(value.lastIndexOf("/") + 1).split("?")[0];
    return `<p><strong>${formattedKey}:</strong> <a href="${value}" target="_blank" class="text-blue-600 hover:underline"><i class="fas fa-download mr-1"></i> Descargar ${fileName}</a></p>`;
  }

  // Editable
  if (userRole === "admin" || userRole === "operativo") {
    // Eliminada la condición tipo !== "trabaja-nosotros"
    let inputElement = "";
    if (selectOptions[key]) {
      inputElement = getSelectHtml(key, value);
    } else {
      let inputType = "text";
      if (
        key.includes("cedula") ||
        key.includes("telefono") ||
        key.includes("nit") ||
        key.includes("plazo")
      ) {
        inputType = "number";
      } else if (key.includes("fecha")) {
        inputType = "date";
      } else if (key.includes("email")) {
        inputType = "email";
      }

      // Para campos moneda, asignar valor sin formatear en input number
      let inputValue = value;
      if (inputType === "number" && esCampoMoneda) {
        // Asegurar que sea número o vacío
        inputValue =
          isNaN(value) || value === null || value === undefined ? "" : value;
      }

      inputElement = `<input type="${inputType}" id="edit-${key}-${solicitudId}" value="${inputValue || ""
        }" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" data-field-name="${key}">`;
    }
    return `<div class="mb-2"><label class="block text-gray-700 text-sm font-bold mb-1">${formattedKey}:</label>${inputElement}</div>`;
  }

  // Solo mostrar texto formateado
  return `<p><strong>${formattedKey}:</strong> ${displayValue}</p>`;
}

// --- Helpers para cerrar el modal ---
$("close-details-modal").addEventListener("click", () => {
  $("details-modal").classList.remove("visible");
});
document
  .getElementById("close-details-modal-btn")
  .addEventListener("click", () => {
    $("details-modal").classList.remove("visible");
  });

// --- Guardar Cambios en Solicitud (con merge para no perder datos) ---
async function guardarCambiosSolicitud(id, tipo, tableName) {
  const userRole = getUserRole();

  // 🔒 Verificación de permisos
  if (userRole !== "admin" && userRole !== "operativo") {
    mostrarMensaje(null, "error", "No tienes permiso para editar solicitudes.");
    return;
  }

  // 🧩 1️⃣ Obtener datos existentes
  const { data: solicitudExistente, error: getError } = await supabaseClient
    .from(tableName)
    .select("datos")
    .eq("id", id)
    .single();

  if (getError || !solicitudExistente) {
    mostrarMensaje(null, "error", "Error al obtener datos anteriores.");
    return;
  }

  const datosOriginales = solicitudExistente.datos || {};
  const updatedDatos = {};
  const detailsContainer = $("details-content");

  // 🧠 2️⃣ Recolectar solo campos válidos (sin sobrescribir vacíos)
  detailsContainer.querySelectorAll(`[id^="edit-"][data-field-name]`).forEach((input) => {
    const fieldName = input.dataset.fieldName;
    let value = input.value;

    if (input.tagName === "SELECT") {
      // Limpieza de valores de selects
      value = value
        .toLowerCase()
        .replace(/ /g, "-")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\//g, "");
    }
    // Campos numéricos y de identificación
    else if (
      [
        "valor-credito",
        "valor-vivienda",
        "ingreso-principal",
        "otros-ingresos",
        "valor-inmueble",
        "valor-activos",
        "cedula-cliente",
        "nit-empresa",
        "telefono-empresa",
        "cedula-asesor",
        "cedula-radicacion",
        "telefono-referencia1",
        "telefono-referencia2",
        "telefono-referencia3",
        "cedula-beneficiario",
        "plazo",
        "cedula-trabaja",
      ].includes(fieldName)
    ) {
      if (value === "" || value === "-" || value == null) {
        // Conserva el valor previo si el input está vacío
        value = datosOriginales[fieldName] ?? 0;
      } else {
        const parsed = parseFloat(value);
        value = isNaN(parsed) ? datosOriginales[fieldName] ?? 0 : parsed;
      }
    }

    // 🚫 Evita sobrescribir con valores vacíos
    if (value !== "" && value !== "-" && value != null) {
      updatedDatos[fieldName] = value;
    }
  });

  // 📝 3️⃣ Leer observaciones
  const observacionesInput = document.getElementById(`edit-observaciones-${id}`);
  const updatedObservaciones = observacionesInput ? observacionesInput.value : "";

  // 🧮 4️⃣ Fusionar datos (sin perder originales)
  const datosFinales = { ...datosOriginales, ...updatedDatos };

  // 📦 5️⃣ Actualizar campos principales visibles
  const mainUpdate = {};

  if (tipo === "trabaja-nosotros") {
    mainUpdate.nombre = datosFinales["nombre"] || "N/A";
    mainUpdate.email = datosFinales["email"] || "N/A";
    mainUpdate.documento = datosFinales["cedula-trabaja"] || "N/A";
  } else if (tipo === "radicacion") {
    mainUpdate.nombre = `${datosFinales["radicacion-apellido1"] || ""} ${datosFinales["radicacion-apellido2"] || ""} ${datosFinales["radicacion-nombre1"] || ""} ${datosFinales["radicacion-nombre2"] || ""}`.trim();
    mainUpdate.documento = datosFinales["cedula-radicacion"] || "N/A";
    mainUpdate.email = datosFinales["radicacion-correo-electronico"] || "N/A";
  } else {
    mainUpdate.nombre = `${datosFinales["apellido1"] || ""} ${datosFinales["apellido2"] || ""} ${datosFinales["nombre1"] || ""} ${datosFinales["nombre2"] || ""}`.trim();
    mainUpdate.documento = datosFinales["cedula-cliente"] || "N/A";
    mainUpdate.monto = datosFinales["valor-credito"] || 0;
    mainUpdate.email = datosFinales["email"] || "N/A";
  }

  // 🧾 6️⃣ Guardar en Supabase
  try {
    const { error } = await supabaseClient
      .from(tableName)
      .update({
        datos: datosFinales,
        observaciones: updatedObservaciones,
        ...mainUpdate,
      })
      .eq("id", id);

    if (error) throw error;

    mostrarMensaje(null, "exito", "✅ Cambios guardados exitosamente.");
    $("details-modal").classList.remove("visible");

    // 🔁 Recargar tabla según el tipo
    if (["credivillas", "libranza", "hipotecario", "tarjetas"].includes(tipo)) {
      await cargarPerfilamiento();
    } else if (tipo === "radicacion") {
      await cargarRadicacion();
    } else if (tipo === "trabaja-nosotros") {
      await cargarTrabajaNosotros();
    }
  } catch (e) {
    console.error("Error al guardar cambios:", e);
    mostrarMensaje(null, "error", "❌ Hubo un error al guardar los cambios.");
  }
}

// --- Eliminar Solicitud ---
async function eliminarSolicitud(id, isHistory = false) {
  const userRole = getUserRole();

  // Verificación de permisos
  if (userRole !== "admin") {
    mostrarMensaje(
      null,
      "error",
      "No tienes permiso para eliminar solicitudes."
    );
    return;
  }

  const confirmar = confirm("¿Seguro que deseas eliminar esta información?");
  if (!confirmar) return;

  try {
    const table = isHistory ? "historial_clientes" : "solicitudes";

    const { error } = await supabaseClient.from(table).delete().eq("id", id);

    if (error) throw error;

    console.log(`Solicitud ${id} eliminada de ${table}.`);
    mostrarMensaje(null, "exito", "✅ Solicitud eliminada correctamente.");

    // Recargar las tablas relevantes después de la eliminación
    await cargarPerfilamiento();
    await cargarRadicacion();
    await cargarTrabajaNosotros();
    await cargarHistorial();
  } catch (e) {
    console.error("Error eliminando solicitud:", e);
    mostrarMensaje(null, "error", "❌ Hubo un error al eliminar la solicitud.");
  }
}

// --- Exportar historial de clientes ---
async function exportHistorialClientes() {
  const userRole = getUserRole();
  if (userRole !== "admin") {
    mostrarMensaje(
      null,
      "error",
      "No tienes permiso para exportar el historial."
    );
    return;
  }

  // Puedes crear un modal propio si quieres confirmación visual
  // Por ahora quitamos el confirm() para no interrumpir la UI
  // if (!confirm("¿Estás seguro de que quieres exportar el historial combinado de perfilamiento y radicación?")) return;

  try {
    // ✅ Obtener historial desde Supabase
    const { data: historial, error } = await supabaseClient
      .from("historial_clientes")
      .select("*");

    if (error) throw error;

    const tiposPerfilamiento = [
      "credivillas",
      "libranza",
      "hipotecario",
      "tarjetas",
    ];
    const tiposRadicacion = ["radicacion"];
    const clientesMap = new Map();

    function procesarDatos(tipo, datos) {
      const formSpecificData = {};
      const order = ordenCampos[tipo];
      if (!order) return {};

      order.forEach((key) => {
        let value = datos[key];

        if (
          [
            "valor-credito",
            "valor-vivienda",
            "ingreso-principal",
            "otros-ingresos",
            "valor-inmueble",
            "valor-activos",
          ].includes(key) &&
          typeof value === "number"
        ) {
          value = formatCurrency(value);
        } else if (
          typeof value === "string" &&
          (value.startsWith("http://") || value.startsWith("https://"))
        ) {
          value = `[ARCHIVO ADJUNTO] ${value}`;
        } else if (selectOptions[key] && typeof value === "string") {
          const originalOption = selectOptions[key].find(
            (opt) =>
              opt
                .toLowerCase()
                .replace(/ /g, "-")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/\//g, "") === value
          );
          if (originalOption) value = originalOption;
        }
        formSpecificData[key] = value !== undefined ? value : null;
      });

      return formSpecificData;
    }

    // Procesar historial
    historial.forEach((data) => {
      const tipo = data.tipo;
      if (![...tiposPerfilamiento, ...tiposRadicacion].includes(tipo)) return;

      const clienteId = data.documento || data.email || data.id;

      if (!clientesMap.has(clienteId)) {
        clientesMap.set(clienteId, {
          idCliente: clienteId,
          nombre: data.nombre || null,
          documento: data.documento || null,
          email: data.email || null,
          perfilamiento: null,
          radicacion: null,
        });
      }

      const cliente = clientesMap.get(clienteId);
      const datosProcesados = procesarDatos(tipo, data.datos || {});

      if (tiposPerfilamiento.includes(tipo)) {
        cliente.perfilamiento = {
          tipo,
          fecha: data.fecha,
          estado: data.estado,
          observaciones: data.observaciones,
          fechacompletado: data.fechacompletado,
          cambiadopor: data.cambiadopor,
          datos: datosProcesados,
        };
      } else if (tiposRadicacion.includes(tipo)) {
        cliente.radicacion = {
          tipo,
          fecha: data.fecha,
          estado: data.estado,
          observaciones: data.observaciones,
          fechacompletado: data.fechacompletado,
          cambiadopor: data.cambiadopor,
          datos: datosProcesados,
        };
      }
    });

    // Convertir a array y ordenar
    const clientesArray = Array.from(clientesMap.values());
    clientesArray.sort((a, b) =>
      a.nombre && b.nombre ? a.nombre.localeCompare(b.nombre) : 0
    );

    // Descargar JSON
    const jsonString = JSON.stringify(clientesArray, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial_perfilamiento_radicacion_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    mostrarMensaje(
      null,
      "exito",
      "✅ Historial combinado exportado exitosamente."
    );
  } catch (e) {
    console.error("Error al exportar historial:", e);
    mostrarMensaje(null, "error", "❌ Hubo un error al exportar el historial.");
  }
}

// --- Renderizar filas ---
function renderFila(solicitud, tableType, isHistory = false) {
  let extraColsHtml = "";
  let mainIdentifier = "";
  const userRole = getUserRole();

  // --- Columnas extra según tabla ---
  if (tableType === "perfilamiento") {
    extraColsHtml = `
      <td class="px-6 py-4 text-sm">
        ${typeof solicitud.monto === "number"
        ? formatCurrency(solicitud.monto)
        : solicitud.monto
      }
      </td>
      <td class="px-6 py-4 text-sm">${solicitud.observaciones || ""}</td>`;
    mainIdentifier = solicitud.documento;
  } else if (tableType === "radicacion") {
    mainIdentifier = solicitud.documento;
    extraColsHtml = `
      <td class="px-6 py-4 text-sm">${solicitud.datos?.["tipo-radicacion"] || "N/A"
      }</td>
      <td class="px-6 py-4 text-sm">${solicitud.observaciones || ""}</td>`;
  } else if (tableType === "trabaja-nosotros") {
    mainIdentifier = solicitud.email;
    extraColsHtml = `
      <td class="px-6 py-4 text-sm">${solicitud.documento || "N/A"}</td>
      <td class="px-6 py-4 text-sm">${solicitud.observaciones || ""}</td>`; // ✅ Observaciones para trabaja-nosotros
  } else if (tableType === "historial") {
    mainIdentifier = solicitud.documento || solicitud.email || "N/A";
    extraColsHtml = `
      <td class="px-6 py-4 text-sm">${formatDate(
      solicitud.fechacompletado
    )}</td>`;
  }

  // --- Estado editable según tabla ---
  let estadoHtml = solicitud.estado;
  if (!isHistory) {
    if (tableType === "trabaja-nosotros") {
      // ✅ Estados para Trabaja con Nosotros (incluye Activo y Desactivado)
      estadoHtml = `
        <select id="estado-select-${solicitud.id}" class="border rounded p-1">
          <option value="Pendiente" ${solicitud.estado === "Pendiente" ? "selected" : ""
        }>Pendiente</option>
          <option value="En Proceso" ${solicitud.estado === "En Proceso" ? "selected" : ""
        }>En Proceso</option>
          <option value="Realizado" ${solicitud.estado === "Realizado" ? "selected" : ""
        }>Realizado</option>
          <option value="Activo" ${solicitud.estado === "Activo" ? "selected" : ""
        }>Activo</option>
          <option value="Desactivado" ${solicitud.estado === "Desactivado" ? "selected" : ""
        }>Desactivado</option>
        </select>
        <button 
  onclick="cambiarEstado('${solicitud.id}', document.getElementById('estado-select-${solicitud.id}').value)"
  class="ml-2 text-green-600 hover:text-green-800">
  Guardar
</button>`;
    } else if (["perfilamiento", "radicacion"].includes(tableType)) {
      // Estados normales para otras tablas
      estadoHtml = `
        <select id="estado-select-${solicitud.id}" class="border rounded p-1">
          <option value="Pendiente" ${solicitud.estado === "Pendiente" ? "selected" : ""
        }>Pendiente</option>
          <option value="En Proceso" ${solicitud.estado === "En Proceso" ? "selected" : ""
        }>En Proceso</option>
          <option value="Realizado" ${solicitud.estado === "Realizado" ? "selected" : ""
        }>Realizado</option>
        </select>
        <button 
  onclick="cambiarEstado('${solicitud.id}', document.getElementById('estado-select-${solicitud.id}').value)"
  class="ml-2 text-green-600 hover:text-green-800">
  Guardar
</button>`;
    }
  }

  // --- Botones de acción ---
  let actionButtons = `
  <div class="flex items-center gap-3">
    <button onclick="verDetalles({ id: '${solicitud.id}', isHistory: ${isHistory} })"
      class="text-blue-600 hover:text-blue-900">
      <i class="fas fa-eye"></i> Ver
    </button>
`;

  // 🔽 Botón PDF según tipo de tabla
  if (tableType === "perfilamiento") {
    actionButtons += `
    <button onclick="descargarPDFPerfilamiento('${solicitud.id}')"
      class="text-red-600 hover:text-red-900">
      <i class="fas fa-file-pdf"></i> PDF
    </button>`;
  } else if (tableType === "radicacion") {
    actionButtons += `
    <button onclick="descargarPDFRadicacion('${solicitud.id}')"
      class="text-red-600 hover:text-red-900">
      <i class="fas fa-file-pdf"></i> PDF
    </button>`;
  }

  // ❌ Botón Eliminar solo para admin
  if (userRole === "admin") {
    actionButtons += `
    <button onclick="eliminarSolicitud('${solicitud.id}', ${isHistory})"
      class="text-red-600 hover:text-red-900">
      <i class="fas fa-trash"></i> Eliminar
    </button>`;
  }

  // ✅ Cerrar contenedor
  actionButtons += `</div>`;

  // --- Retornar fila ---
  return `
    <tr>
      <td class="px-6 py-4 text-sm">${formatDate(solicitud.fecha)}</td>
      <td class="px-6 py-4 text-sm">${obtenerNombreTipo(solicitud.tipo)}</td>
      <td class="px-6 py-4 text-sm whitespace-nowrap">${solicitud.nombre}</td>
      <td class="px-6 py-4 text-sm">${mainIdentifier || "N/A"}</td>
      ${extraColsHtml}
      <td class="px-6 py-4 text-sm">
        ${estadoHtml}
        ${solicitud.cambiadopor
      ? `<br><small>(${solicitud.cambiadopor})</small>`
      : ""
    }
      </td>
      <td class="px-6 py-4 text-sm">${actionButtons}</td>
    </tr>`;
}

// --- Listeners en tiempo real con Supabase ---
// --- 🔔 LISTENERS EN TIEMPO REAL CON SUPABASE (Versión Mejorada) ---
async function initRealtimeListeners() {
  if (window.__realtimeStarted) return;
  window.__realtimeStarted = true;

  if (!isAuthenticated()) return;

  const rol = getUserRole(); // admin u operativo

  // ---------------- LISTENERS EN TIEMPO REAL ----------------

  // 🟩 PERFILAMIENTO
  supabaseClient
    .channel("perfilamiento-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "solicitudes" },
      async (payload) => {
        const nueva = payload.new;
        if (
          ["credivillas", "libranza", "hipotecario", "tarjetas"].includes(
            nueva.tipo
          )
        ) {
          invalidateTab("perfilamiento");
          if (__getActiveAdminTabId() === "perfilamiento") {
            await ensureTabData("perfilamiento", { force: true });
          } // 🔹 Solo recarga la vista
        }
      }
    )
    .subscribe();

  // 🟦 RADICACIÓN
  supabaseClient
    .channel("radicacion-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "solicitudes" },
      async (payload) => {
        const nueva = payload.new;
        if (nueva.tipo === "radicacion") {
          invalidateTab("radicacion");
          if (__getActiveAdminTabId() === "radicacion") {
            await ensureTabData("radicacion", { force: true });
          } // 🔹 Solo recarga la vista
        }
      }
    )
    .subscribe();

  // 💼 TRABAJA CON NOSOTROS
  supabaseClient
    .channel("trabaja-nosotros-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "solicitudes" },
      async (payload) => {
        const nueva = payload.new;
        if (nueva.tipo === "trabaja-nosotros") {
          invalidateTab("trabaja-nosotros");
          if (__getActiveAdminTabId() === "trabaja-nosotros") {
            await ensureTabData("trabaja-nosotros", { force: true });
          } // 🔹 Solo recarga la vista
        }
      }
    )
    .subscribe();

  // 🟧 HISTORIAL
  supabaseClient
    .channel("historial-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "historial_clientes" },
      async () => {
        invalidateTab("historial");
        if (__getActiveAdminTabId() === "historial") {
          await ensureTabData("historial", { force: true });
        }
      }
    )
    .subscribe();

  // 🟪 CRÉDITOS RADICADOS
  supabaseClient
    .channel("creditos-radicados-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "creditos_radicados" },
      async () => {
        invalidateTab("creditos");
        if (__getActiveAdminTabId() === "creditos") {
          await ensureTabData("creditos", { force: true });
        }
      }
    )
    .subscribe();

  // 🟫 ASESORES
  supabaseClient
    .channel("asesores-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "asesores" },
      async (payload) => {
        console.log("👀 Cambio detectado en asesores:", payload.eventType);
        const cedulaFiltro =
          $("buscar-cedula")?.value.trim() || "";
        const estadoFiltro =
          $("filtro-estado")?.value || "";
        await cargarAsesores(cedulaFiltro, estadoFiltro);
      }
    )
    .subscribe();

  console.log("✅ Realtime listeners inicializados correctamente");
}

// ============================================================
// 📤 ENVÍO DE FORMULARIO — Crear o Actualizar Crédito
// ============================================================
document
  .getElementById("creditos-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    if (creditoEditando) {
      // --- ACTUALIZAR ---
      await actualizarCredito(creditoEditando, formData);
      creditoEditando = null;
      e.target.querySelector("button[type='submit']").textContent =
        "Guardar Crédito";
    } else {
      // --- CREAR ---
      await guardarCredito(formData);
    }

    // Resetear formulario y ocultar
    e.target.reset();
    $("form-creditos").classList.add("hidden");

    // 🔁 Reaplicar filtros actuales (sin recargar)
    const filtrosPrevios = cargarFiltrosDesdeMemoria();
    if (filtrosPrevios) {
      restaurarFiltrosGuardados(filtrosPrevios);
      await aplicarFiltrosCreditos();
    }
  });

// Toggle formulario
$("btn-toggle-form").addEventListener("click", () => {
  $("form-creditos").classList.toggle("hidden");
});

// Mostrar / ocultar formulario de asesores
document
  .getElementById("btn-toggle-form-asesor")
  ?.addEventListener("click", () => {
    const form = $("form-asesor");
    if (!form) return;

    const visible = !form.classList.contains("hidden");
    if (visible) {
      form.classList.add("hidden");
    } else {
      form.classList.remove("hidden");
    }
  });
// --- Buscar en historial ---
function buscarHistorial() {
  const filtro = document
    .getElementById("historial-cedula-search")
    .value.toLowerCase()
    .trim();
  const filas = $$(
    "#solicitudes-table-body-historial tr"
  );

  filas.forEach((fila) => {
    const celdaCedula = fila.querySelector("td:nth-child(4)"); // Asumiendo que la cédula/email está en la 4ta columna
    const textoCedula = celdaCedula
      ? celdaCedula.textContent.toLowerCase()
      : "";

    fila.style.display =
      filtro === "" || textoCedula.includes(filtro) ? "" : "none";
  });
}

// --- Buscar cliente para radicación ---
async function buscarClienteParaRadicacion() {
  const cedulaInput = $("radicacion-cedula-cliente");
  const cedulaStatusDiv = $("radicacion-cedula-status");
  const cedula = cedulaInput.value.trim();

  cedulaStatusDiv.innerHTML = "";
  cedulaStatusDiv.className = "";

  if (!cedula) {
    cedulaStatusDiv.textContent = "❌ Por favor, ingrese una cédula.";
    cedulaStatusDiv.className = "bg-red-100 text-red-700 px-3 py-2 rounded mt-2";
    limpiarCamposRadicacion();
    deshabilitarCamposRadicacion();
    setCamposPerfilamientoRadicacionLocked(true);
    marcarPerfilamientoRadicacionCargado(false);
    setCamposPerfilamientoRadicacionLocked(true);
    marcarPerfilamientoRadicacionCargado(false);
    return;
  }

  cedulaStatusDiv.textContent = "🔎 Buscando cliente...";
  cedulaStatusDiv.className = "bg-blue-100 text-blue-700 px-3 py-2 rounded mt-2";

  try {
    // Buscar en historial_clientes por cédula y tipos de perfilamiento "Realizado"
    const { data, error } = await supabaseClient
      .from("historial_clientes")
      .select("*")
      .eq("documento", cedula)
      .in("tipo", ["credivillas", "libranza", "hipotecario", "tarjetas"])
      .eq("estado", "Realizado")
      .order("fecha", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      cedulaStatusDiv.textContent =
        "⚠️ El cliente no tiene perfilamiento en estado Realizado. No se puede radicar.";
      cedulaStatusDiv.className = "bg-red-100 text-red-700 px-3 py-2 rounded mt-2";
      limpiarCamposRadicacion();
      deshabilitarCamposRadicacion();
      setCamposPerfilamientoRadicacionLocked(true);
      marcarPerfilamientoRadicacionCargado(false);
      return;
    }

    const datosCliente = data[0].datos || {};

    // Datos personales
    $("radicacion-apellido1").value = datosCliente["apellido1"] || "";
    $("radicacion-apellido2").value = datosCliente["apellido2"] || "";
    $("radicacion-nombre1").value = datosCliente["nombre1"] || "";
    $("radicacion-nombre2").value = datosCliente["nombre2"] || "";
    $("radicacion-fecha-nacimiento").value = datosCliente["fecha-nacimiento"] || "";

    // Estado civil
    const estadoSelect = $("radicacion-estado");
    if (estadoSelect) {
      const normalizedEstado = (datosCliente["estado"] || "")
        .toLowerCase()
        .replace(/ /g, "-")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\//g, "");

      estadoSelect.value = normalizedEstado;
    }

    // Contacto y residencia
    $("radicacion-telefono").value = datosCliente["telefono"] || "";
    $("radicacion-ciudad-residencia").value = datosCliente["ciudad-residencia"] || "";
    $("radicacion-correo-electronico").value = datosCliente["email"] || "";
    $("radicacion-direccion-residencia").value =
      datosCliente["direccion-cliente"] ||
      datosCliente["direccion-residencia"] ||
      datosCliente["direccion"] ||
      "";

    $("radicacion-barrio").value =
      datosCliente["barrio"] || "";


    cedulaStatusDiv.textContent = "✅ Cliente encontrado y datos importados correctamente.";
    cedulaStatusDiv.className = "bg-green-100 text-green-700 px-3 py-2 rounded mt-2";
    habilitarCamposRadicacion();
    setCamposPerfilamientoRadicacionLocked(true);
    marcarPerfilamientoRadicacionCargado(true);
  } catch (e) {
    console.error("Error buscando cliente: ", e);
    cedulaStatusDiv.textContent = "❌ Error al buscar el cliente.";
    cedulaStatusDiv.className = "bg-red-100 text-red-700 px-3 py-2 rounded mt-2";
    limpiarCamposRadicacion();
    deshabilitarCamposRadicacion();
  }
}

// --- Limpiar campos radicación ---
function limpiarCamposRadicacion() {
  const fieldsToClear = [
    "radicacion-apellido1",
    "radicacion-apellido2",
    "radicacion-nombre1",
    "radicacion-nombre2",
    "radicacion-fecha-nacimiento",
    "radicacion-estado",
    "radicacion-telefono",
    "radicacion-ciudad-residencia",
    "radicacion-correo-electronico",
    "direccion-cliente",
    "barrio",
    "nombre-referencia1",
    "telefono-referencia1",
    "parentesco-referencia1",
    "direccion-referencia1",
    "departamento-referencia1",
    "ciudad-referencia1",
    "nombre-referencia2",
    "telefono-referencia2",
    "parentesco-referencia2",
    "direccion-referencia2",
    "departamento-referencia2",
    "ciudad-referencia2",
    "nombre-referencia3",
    "telefono-referencia3",
    "departamento-referencia3",
    "ciudad-referencia3",
    "nombre-beneficiario",
    "cedula-beneficiario",
    "parentesco-beneficiario",
    "tipo-radicacion",
  ];

  fieldsToClear.forEach((id) => {
    const campo = document.getElementById(id);
    if (campo) campo.value = "";
  });
}

// --- Función genérica para buscar asesor en Supabase (ACTUALIZADA) ---
async function buscarAsesorPorCedula(cedula, formId) {
  const nombreAsesorInput = document.getElementById(`nombre-asesor-${formId}`);
  const estadoAsesorInput = document.getElementById(`estado-asesor-${formId}`);
  if (!nombreAsesorInput) return;

  // ✅ Normaliza: solo dígitos (por si pegan con puntos, espacios, guiones, etc.)
  const cedulaStr = String(cedula || "")
    .trim()
    .replace(/\D/g, ""); // deja solo 0-9

  // Limpia si está muy corto
  if (!cedulaStr || cedulaStr.length < 5) {
    nombreAsesorInput.value = "";
    if (estadoAsesorInput) estadoAsesorInput.value = "";
    return;
  }

  // ✅ Debounce por formulario (evita consultas por cada tecla)
  window._asesorTimers ??= {};
  clearTimeout(window._asesorTimers[formId]);

  window._asesorTimers[formId] = setTimeout(async () => {
    try {
      // ✅ Buscar como texto y traer hasta 2 para detectar duplicados
      const { data, error } = await supabaseClient
        .from("asesores")
        .select("nombre, estado, cedula")
        .eq("cedula", cedulaStr)
        .limit(2);

      if (error || !data || data.length === 0) {
        nombreAsesorInput.value = "No encontrado";
        if (estadoAsesorInput) estadoAsesorInput.value = "Sin vinculación";
        return;
      }

      // ✅ Si hay duplicados, igual mostramos el primero (pero queda detectado)
      if (data.length > 1) {
        console.warn(
          `⚠️ Hay ${data.length} asesores con la misma cédula (${cedulaStr}). Revisa duplicados.`
        );
      }

      nombreAsesorInput.value = data[0].nombre || "N/A";
      if (estadoAsesorInput) estadoAsesorInput.value = data[0].estado || "Activo";
    } catch (e) {
      console.error("Error buscando asesor:", e);
      nombreAsesorInput.value = "Error en búsqueda";
      if (estadoAsesorInput) estadoAsesorInput.value = "Error";
    }
  }, 250); // ⏱️ ajusta 200-400ms si quieres
}

// --- Funciones de Interacción de UI (Tabs, Menús, Campos Dinámicos) ---
// Estas funciones no necesitan cambios ya que solo manejan la UI y no el almacenamiento.

function setupFormTabs() {
  const tabButtons = $$(".tab-btn");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tabButtons.forEach((btn) => btn.classList.remove("active-tab"));
      button.classList.add("active-tab");

      $$(".form-section").forEach((section) => {
        section.classList.remove("form-visible");
        section.classList.add("form-hidden");
      });

      const tabId = button.getAttribute("data-tab");
      const formSection = document.getElementById(tabId);
      if (formSection) {
        formSection.classList.remove("form-hidden");
        formSection.classList.add("form-visible");
      }
    });
  });
}

function showAdminContent(tabId) {
  const userRole = getUserRole();

  const allowedOperativoTabs = [
    "perfilamiento",
    "radicacion",
    "historial",
    "creditos",
    "asesores",
    "fichas-cuentas",
    "simulador"
  ];

  // Ocultar todas las secciones de contenido del admin
  $$(".admin-content-section").forEach((section) => {
    section.classList.add("hidden");
  });

  // Ocultar todos los botones de tab del admin
  $$(".admin-tab-btn").forEach((btn) => {
    btn.classList.remove("active-tab", "bg-blue-600", "text-white");
    btn.classList.add("bg-gray-300", "text-gray-700");
    btn.classList.add("hidden");
  });

  // ADMIN: ve todo
  if (userRole === "admin") {
    const targetSection = document.getElementById(`admin-content-${tabId}`);
    if (targetSection) {
      targetSection.classList.remove("hidden");
    }

    $$(".admin-tab-btn").forEach((btn) => {
      btn.classList.remove("hidden");
    });
  }

  // OPERATIVO: ve solo ciertas pestañas
  else if (userRole === "operativo") {
    const tabPermitido = allowedOperativoTabs.includes(tabId);

    if (tabPermitido) {
      const targetSection = document.getElementById(`admin-content-${tabId}`);
      if (targetSection) {
        targetSection.classList.remove("hidden");
      }
    } else {
      tabId = "perfilamiento";
      const fallbackSection = document.getElementById("admin-content-perfilamiento");
      if (fallbackSection) {
        fallbackSection.classList.remove("hidden");
      }
    }

    // Mostrar solo los botones permitidos para operativo
    allowedOperativoTabs.forEach((tab) => {
      const btn = document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`);
      if (btn) {
        btn.classList.remove("hidden");
      }
    });
  }

  // Si quieres que otros roles no vean nada, aquí puedes controlarlo
  else {
    const fallbackSection = document.getElementById("admin-content-perfilamiento");
    if (fallbackSection) {
      fallbackSection.classList.remove("hidden");
    }

    const btn = document.querySelector('.admin-tab-btn[data-tab="perfilamiento"]');
    if (btn) {
      btn.classList.remove("hidden");
    }

    tabId = "perfilamiento";
  }

  // Activar el botón de la pestaña seleccionada
  const activeTabButton = qs(`.admin-tab-btn[data-tab="${tabId}"]`);
  if (activeTabButton) {
    activeTabButton.classList.add("active-tab", "bg-blue-600", "text-white");
    activeTabButton.classList.remove("bg-gray-300", "text-gray-700");
  }
}

function setupAdminTabs() {
  const adminTabButtons = $$(".admin-tab-btn");
  adminTabButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const tabId = button.getAttribute("data-tab");
      showAdminContent(tabId);
      // ✅ Cargar datos SOLO cuando el usuario abre la pestaña
      await ensureTabData(tabId);
    });
  });
}

function setupMobileMenu() {
  const menuButton = $("mobile-menu-button");
  const mobileMenu = $("mobile-menu");

  menuButton.addEventListener("click", () => {
    mobileMenu.classList.toggle("hidden");
  });

  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mobileMenu.classList.add("hidden");
    });
  });
}

function setupAdminAccess() {
  const adminLink = $("admin-link");
  const mobileAdminLink = $("mobile-admin-link");
  const adminDashboardLink = $("admin-dashboard-link");
  const mobileAdminDashboardLink = $("mobile-admin-dashboard-link");
  const logoutBtn = $("logout-button");
  const mobileLogoutBtn = $("mobile-logout-button");

  function handleAdminAccess() {
    if (isAuthenticated()) {
      showSection("admin");
      showAdminPanel();
      // Asegurarse de que la pestaña "Perfilamiento" esté activa al entrar al admin
      const creditosTabButton = qs(
        '.admin-tab-btn[data-tab="creditos"]'
      );
      if (creditosTabButton) {
        creditosTabButton.click();
      }
    } else {
      showLoginModal();
      if (adminDashboardLink) adminDashboardLink.classList.add("hidden");
      if (mobileAdminDashboardLink)
        mobileAdminDashboardLink.classList.add("hidden");
    }
  }

  adminLink.addEventListener("click", (e) => {
    e.preventDefault();
    handleAdminAccess();
  });

  mobileAdminLink.addEventListener("click", (e) => {
    e.preventDefault();
    handleAdminAccess();
  });

  if (adminDashboardLink) {
    adminDashboardLink.addEventListener("click", (e) => {
      e.preventDefault();
      handleAdminAccess();
    });
  }

  if (mobileAdminDashboardLink) {
    mobileAdminDashboardLink.addEventListener("click", (e) => {
      e.preventDefault();
      handleAdminAccess();
    });
  }

  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });

  mobileLogoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });
}

function setupLoginForm() {
  const loginForm = $("login-form");

  loginForm.addEventListener("submit", async (e) => {
    // Marcado como async
    e.preventDefault();

    const username = $("username").value;
    const password = $("password").value;
    const errorElement = $("login-error");

    const success = await login(username, password); // Esperar el resultado del login

    if (success) {
      hideLoginModal();
      updateAuthUI();
      if (window.location.hash !== "#admin") {
        window.location.hash = "#admin";
      } else {
        showSection("admin");
        showAdminPanel();
      }
      // Asegurarse de que la pestaña "Perfilamiento" esté activa al iniciar sesión
      const perfilamientoTabButton = qs(
        '.admin-tab-btn[data-tab="creditos"]'
      );
      if (perfilamientoTabButton) {
        perfilamientoTabButton.click();
      }
    } else {
      errorElement.classList.remove("hidden");
    }
  });
}

function showSection(sectionId) {
  // ✅ Bloquear secciones de crédito al público.
  // Solo deben estar disponibles dentro de la sesión del rol "comercial".
  const seccionesSoloComercial = ["formularios", "formulario2", "consulta-credito"];
  const rolesPermitidos = ["comercial", "admin", "operativo"];

  if (seccionesSoloComercial.includes(sectionId)) {
    if (!isAuthenticated() || !rolesPermitidos.includes(getUserRole())) {
      mostrarMensaje(
        null,
        "error",
        "Debes iniciar sesión (comercial, admin u operativo) para acceder a esta sección."
      );
      sectionId = "inicio";
    }
  }


  const mainSections = [
    "inicio",
    "sobre-nosotros",
    "trabaja-nosotros",
    "formularios",
    "formulario2",
    "consulta-credito",
    "contacto",
    "admin",
    "seccion-comercial",
  ];
  mainSections.forEach((id) => {
    const section = document.getElementById(id);
    if (section) {
      if (id === sectionId) {
        section.classList.remove("hidden");
      } else {
        section.classList.add("hidden");
      }
    }
  });
}

// 🔗 Navegación desde el panel comercial (actualiza hash + muestra sección)
function navigateToSection(sectionId) {
  showSection(sectionId);
  window.location.hash = sectionId;
  // Scroll suave al inicio de la sección
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
}

function setupDynamicFields() {
  document
    .querySelectorAll('select[name="destino-credito"]')
    .forEach((selectElement) => {
      if (!selectElement.dataset.listenerAttached) {
        selectElement.addEventListener("change", function () {
          const form = this.closest("form");
          const entidadesContainer = form.querySelector(".entidades-container");

          if (!entidadesContainer) return; // Asegurarse de que el contenedor exista

          const destinoCredito = this.value;

          // Limpiar el contenido actual del contenedor
          entidadesContainer.innerHTML = "";

          if (destinoCredito === "libre") {
            entidadesContainer.innerHTML = `
                            <label class="block text-gray-700 mb-2">Entidades a Comprar *</label>
                            <input type="text" name="entidad-compra" value="NO APLICA" readonly
                                class="w-full px-4 py-2 border rounded-lg bg-gray-100 text-gray-500">
                        `;
          } else if (destinoCredito === "compra") {
            entidadesContainer.innerHTML = `
                            <label class="block text-gray-700 mb-2">Entidades a Comprar *</label>
                            <input type="text" name="entidad-compra" required
                                placeholder="ESCRIBA LAS ENTIDADES A COMPRAR..."
                                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        `;
          } else if (
            destinoCredito === "usada" ||
            destinoCredito === "nueva" ||
            destinoCredito === "leasing"
          ) {
            // Para hipotecario, también "NO APLICA"
            entidadesContainer.innerHTML = `
                            <label class="block text-gray-700 mb-2">Entidades a Comprar *</label>
                            <input type="text" name="entidad-compra" value="NO APLICA" readonly
                                class="w-full px-4 py-2 border rounded-lg bg-gray-100 text-gray-500">
                        `;
          } else {
            // Valor por defecto si no es ninguno de los anteriores (ej. si el select se resetea)
            entidadesContainer.innerHTML = `
                            <label class="block text-gray-700 mb-2">Entidades a Comprar *</label>
                            <select name="entidad-compra" required
                                    class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="">SELECCIONE...</option>
                                <option value="no-aplica">NO APLICA</option>
                                <option value="si">SI</option>
                            </select>
                        `;
          }
        });
        selectElement.dataset.listenerAttached = "true";
      }
    });

  $$(".form-section").forEach((formSection) => {
    const tipoContratoSelect = formSection.querySelector(
      'select[name="tipo-contrato"]'
    );
    if (tipoContratoSelect && !tipoContratoSelect.dataset.listenerAttached) {
      tipoContratoSelect.addEventListener("change", function () {
        const parentDiv = this.closest("div");
        // Only if the "otra" option exists and is selected
        if (
          this.querySelector('option[value="otra"]') &&
          this.value === "otra"
        ) {
          parentDiv.innerHTML = `
                        <label class="block text-gray-700 mb-2">Tipo de Contrato *</label>
                        <input type="text" name="tipo-contrato" required
                            placeholder="ESCRIBA EL TIPO DE CONTRATO..."
                            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                    `;
        }
      });
      tipoContratoSelect.dataset.listenerAttached = "true";
    }
  });
}

function setupPlazos() {
  // Credivillas
  document
    .querySelectorAll('#credivillas select[name="plazo"]')
    .forEach((select) => {
      [12, 24, 36, 48, 60, 72].forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      });
    });

  // Libranza
  document
    .querySelectorAll('#libranza select[name="plazo"]')
    .forEach((select) => {
      for (let m = 12; m <= 144; m += 12) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      }
    });

  // Hipotecario
  document
    .querySelectorAll('#hipotecario select[name="plazo"]')
    .forEach((select) => {
      for (let m = 12; m <= 240; m += 12) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      }
    });

  // Tarjetas (ya está deshabilitado en el HTML)
}
function setupActividadEconomica() {
  document
    .querySelectorAll('select[name="actividad-economica"]')
    .forEach((select) => {
      select.addEventListener("change", () => {
        const formSection = select.closest("form"); // busca dentro del formulario actual
        // const formId = formSection.closest(".form-section").id; // Obtener el ID del formulario (credivillas, libranza, etc.) - This variable is not used.

        const fieldsToDisableForPensionado = [
          "tipo-contrato",
          "nit-empresa",
          "telefono-empresa",
          "ciudad-empresa",
        ];

        // Deshabilitar campos para "Pensionado" en todos los formularios
        fieldsToDisableForPensionado.forEach((name) => {
          const field = formSection.querySelector(`[name="${name}"]`);
          if (field) {
            if (select.value === "pensionado") {
              field.disabled = true;
              field.classList.add("bg-gray-100", "cursor-not-allowed");
              field.removeAttribute("required");
              field.value = ""; // Limpiar el valor
            } else {
              field.disabled = false;
              field.classList.remove("bg-gray-100", "cursor-not-allowed");
              field.setAttribute("required", "required");
            }
          }
        });

        // Lógica específica para "Rentista de Capital"
        const tipoContratoField = formSection.querySelector(
          '[name="tipo-contrato"]'
        );
        const nitEmpresaField = formSection.querySelector(
          '[name="nit-empresa"]'
        );
        const telefonoEmpresaField = formSection.querySelector(
          '[name="telefono-empresa"]'
        );
        const ciudadEmpresaField = formSection.querySelector(
          '[name="ciudad-empresa"]'
        );

        if (select.value === "rentista") {
          if (tipoContratoField) {
            tipoContratoField.disabled = true;
            tipoContratoField.classList.add(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            tipoContratoField.removeAttribute("required");
            tipoContratoField.value = "";
          }
          if (nitEmpresaField) {
            nitEmpresaField.disabled = true;
            nitEmpresaField.classList.add("bg-gray-100", "cursor-not-allowed");
            nitEmpresaField.removeAttribute("required");
            nitEmpresaField.value = "";
          }
          if (telefonoEmpresaField) {
            telefonoEmpresaField.disabled = true;
            telefonoEmpresaField.classList.add(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            telefonoEmpresaField.removeAttribute("required");
            telefonoEmpresaField.value = "";
          }
          if (ciudadEmpresaField) {
            ciudadEmpresaField.disabled = true;
            ciudadEmpresaField.classList.add(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            ciudadEmpresaField.removeAttribute("required");
            ciudadEmpresaField.value = "";
          }
        } else if (select.value !== "pensionado") {
          // Re-habilitar si no es pensionado ni rentista
          if (tipoContratoField) {
            tipoContratoField.disabled = false;
            tipoContratoField.classList.remove(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            tipoContratoField.setAttribute("required", "required");
          }
          if (nitEmpresaField) {
            nitEmpresaField.disabled = false;
            nitEmpresaField.classList.remove(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            nitEmpresaField.setAttribute("required", "required");
          }
          if (telefonoEmpresaField) {
            telefonoEmpresaField.disabled = false;
            telefonoEmpresaField.classList.remove(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            telefonoEmpresaField.setAttribute("required", "required");
          }
          if (ciudadEmpresaField) {
            ciudadEmpresaField.disabled = false;
            ciudadEmpresaField.classList.remove(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            ciudadEmpresaField.setAttribute("required", "required");
          }
        }
      });
    });

  // Lógica para deshabilitar campos de inmueble si el tipo de residencia es "Familiar"
  document
    .querySelectorAll('select[name="tipo-residencia"]')
    .forEach((select) => {
      select.addEventListener("change", () => {
        const formSection = select.closest("form");
        const valorInmuebleField = formSection.querySelector(
          'input[name="valor-inmueble"]'
        );
        const tipoInmuebleField = formSection.querySelector(
          'select[name="tipo-inmueble"]'
        );

        if (select.value === "familiar") {
          if (valorInmuebleField) {
            valorInmuebleField.disabled = true;
            valorInmuebleField.classList.add(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            valorInmuebleField.removeAttribute("required");
            valorInmuebleField.value = "";
          }
          if (tipoInmuebleField) {
            tipoInmuebleField.disabled = true;
            tipoInmuebleField.classList.add(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            tipoInmuebleField.removeAttribute("required");
            tipoInmuebleField.value = "";
          }
        } else {
          if (valorInmuebleField) {
            valorInmuebleField.disabled = false;
            valorInmuebleField.classList.remove(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            valorInmuebleField.setAttribute("required", "required");
          }
          if (tipoInmuebleField) {
            tipoInmuebleField.disabled = false;
            tipoInmuebleField.classList.remove(
              "bg-gray-100",
              "cursor-not-allowed"
            );
            tipoInmuebleField.setAttribute("required", "required");
          }
        }
      });
    });
}

// Función para convertir el texto de los inputs a mayúsculas
function setupUppercaseInputs() {
  document
    .querySelectorAll('input[type="text"], input[type="email"], textarea')
    .forEach((input) => {
      // Excluir inputs de tipo email para no forzar mayúsculas en direcciones de correo
      if (input.type !== "email" && input.id !== "username") {
        input.addEventListener("input", function () {
          this.value = this.value;
        });
      }
    });
}

// --- Nueva función para aplicar permisos según el rol ---
function applyRolePermissions() {
  const userRole = getUserRole();

  // 1) Ocultar/mostrar pestaña y contenido "Trabaja con Nosotros"
  const trabajaNosotrosTab = qs(
    '.admin-tab-btn[data-tab="trabaja-nosotros"]'
  );
  const adminContentTrabajaNosotros = $("admin-content-trabaja-nosotros");

  if (userRole === "operativo") {
    if (trabajaNosotrosTab) trabajaNosotrosTab.classList.add("hidden");
    if (adminContentTrabajaNosotros)
      adminContentTrabajaNosotros.classList.add("hidden");
  } else {
    if (trabajaNosotrosTab) trabajaNosotrosTab.classList.remove("hidden");
    if (adminContentTrabajaNosotros)
      adminContentTrabajaNosotros.classList.remove("hidden");
  }

  // 2) Deshabilitar botones de eliminar para el rol 'operativo'
  const deleteButtons = $$(
    "#solicitudes-table-body-perfilamiento .fa-trash, " +
    "#solicitudes-table-body-radicacion .fa-trash, " +
    "#solicitudes-table-body-trabaja-nosotros .fa-trash, " +
    "#solicitudes-table-body-historial .fa-trash"
  );

  deleteButtons.forEach((icon) => {
    const btn = icon.closest("button");
    if (!btn) return;

    if (userRole === "operativo") {
      btn.disabled = true;
      btn.classList.add("opacity-50", "cursor-not-allowed");
      btn.title = "No tienes permisos para eliminar.";
    } else {
      btn.disabled = false;
      btn.classList.remove("opacity-50", "cursor-not-allowed");
      btn.title = "";
    }
  });

  // 3) Operativo: ocultar Cuentas de Cobro
  const bloqueCuentas = $("admin-bloque-cuentas-cobro");
  if (userRole === "operativo") {
    if (bloqueCuentas) bloqueCuentas.classList.add("hidden");
  } else {
    if (bloqueCuentas) bloqueCuentas.classList.remove("hidden");
  }

  // 4) Operativo: ocultar SUBIDA de fichas (solo deja el visor)
  const bloqueSubirFichas = $("admin-subir-fichas-bloque");
  if (userRole === "operativo") {
    if (bloqueSubirFichas) bloqueSubirFichas.classList.add("hidden");
  } else {
    if (bloqueSubirFichas) bloqueSubirFichas.classList.remove("hidden");
  }

  // 5) Cambiar nombre del tab según rol (y restaurarlo en admin)
  const tabFichasCuentasBtn = qs(
    '.admin-tab-btn[data-tab="fichas-cuentas"]'
  );

  if (tabFichasCuentasBtn) {
    if (userRole === "operativo") {
      tabFichasCuentasBtn.innerHTML =
        `<i class="fas fa-file-alt mr-2"></i> Fichas Comerciales`;
    } else {
      tabFichasCuentasBtn.innerHTML =
        `<i class="fas fa-file-invoice-dollar mr-2"></i> Fichas y Cuentas`;
    }
  }

  const tituloPanel = $("titulo-fichas-cuentas");

  if (tituloPanel) {
    if (userRole === "admin") {
      tituloPanel.textContent = "Gestión de Fichas y Cuentas de Cobro";
    } else if (userRole === "operativo") {
      tituloPanel.textContent = "Fichas Comerciales";
    }
  }

  // Nota: el select de estado en modal se maneja en renderSolicitudDetalle (como ya lo tienes).
}

// --- Inicializar para todos los formularios de perfilamiento y radicación ---
function configurarAsesorFormulario(formId) {
  const cedulaInput = document.getElementById(`cedula-asesor-${formId}`);
  if (!cedulaInput) return;

  cedulaInput.addEventListener("input", () => {
    buscarAsesorPorCedula(cedulaInput.value.trim(), formId);
  });
}

// Llamar a configurarAsesorFormulario para cada formulario
["credivillas", "libranza", "hipotecario", "tarjetas", "radicacion"].forEach(
  configurarAsesorFormulario
);

document.addEventListener("DOMContentLoaded", function () {
  // --- Inicialización de tabs, menús y formularios ---
  setupFormTabs();
  setupAdminTabs();
  setupMobileMenu();
  setupAdminAccess();
  setupLoginForm();
  setupDynamicFields();
  setupPlazos();
  setupActividadEconomica();
  setupUppercaseInputs();

  // Formularios públicos
  document
    .getElementById("trabaja-nosotros-form")
    ?.addEventListener("submit", (e) => handleFormSubmit(e, "trabaja-nosotros"));

  document
    .getElementById("radicacion-form")
    ?.addEventListener("submit", (e) => handleFormSubmit(e, "radicacion"));

  document
    .querySelector("#credivillas form")
    ?.addEventListener("submit", (e) => handleFormSubmit(e, "credivillas"));

  document
    .querySelector("#libranza form")
    ?.addEventListener("submit", (e) => handleFormSubmit(e, "libranza"));

  document
    .querySelector("#hipotecario form")
    ?.addEventListener("submit", (e) => handleFormSubmit(e, "hipotecario"));

  document
    .querySelector("#tarjetas form")
    ?.addEventListener("submit", (e) => handleFormSubmit(e, "tarjetas"));

  // Actualizar interfaz según login
  updateAuthUI();

  // ✅ Autocompletar asesor si ya hay sesión iniciada
  autocompletarDatosAsesor();

  // ✅ PUBLICIDAD: cargar y renderizar SIEMPRE (Inicio + Comercial)
  // (Esto hace que se vea en todas las sesiones porque lee desde Supabase)
  cargarYRenderPublicidad?.();

  // ✅ PUBLICIDAD ADMIN: enganchar listeners del módulo tipo "Cuentas"
  $("btn-crear-publicidad")?.addEventListener("click", (e) => {
    e.preventDefault();
    subirPublicidadAdmin?.();
  });

  $("btn-recargar-publicidad")?.addEventListener("click", (e) => {
    e.preventDefault();
    verPublicidadAdmin?.();
  });

  // --- Manejar sección inicial según hash ---
  async function handleInitialSection() {
    const hash = window.location.hash.substring(1);

    if (hash === "admin") {
      if (isAuthenticated()) {
        showSection("admin");
        await showAdminPanel();

        // Tab por defecto
        qs('.admin-tab-btn[data-tab="creditos"]')?.click();
      } else {
        showLoginModal();
        showSection("inicio");
      }
    }
    else if (document.getElementById(hash)) {
      showSection(hash);
    } else {
      showSection("inicio");
    }
  }

  handleInitialSection();
  window.addEventListener("hashchange", handleInitialSection);

  // --- Botón radicación ---
  document
    .getElementById("radicacion-button")
    ?.addEventListener("click", function (e) {
      e.preventDefault();
      showSection("formulario2");
      window.location.hash = "formulario2";
    });

  // --- Modal de login ---
  $("login-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "login-modal") hideLoginModal();
  });

  // --- Botón buscar cliente radicación ---
  document
    .getElementById("buscar-cliente-btn")
    ?.addEventListener("click", buscarClienteParaRadicacion);

  // --- Botón exportar historial ---
  document
    .getElementById("export-historial-btn")
    ?.addEventListener("click", exportHistorialClientes);

  // --- Al iniciar, deshabilitar todos los campos excepto la cédula ---
  deshabilitarCamposRadicacion();
  setCamposPerfilamientoRadicacionLocked(true);
  marcarPerfilamientoRadicacionCargado(false);
  const cedulaInput = $("radicacion-cedula-cliente");
  if (cedulaInput) {
    cedulaInput.addEventListener("input", () => {
      marcarPerfilamientoRadicacionCargado(false);
      if (cedulaInput.value.trim() === "") {
        limpiarCamposRadicacion();
        deshabilitarCamposRadicacion();
        setCamposPerfilamientoRadicacionLocked(true);
        $("radicacion-cedula-status").innerHTML = "";
      }
    });
  }

  // --- Búsqueda en historial ---
  const historialCedulaSearchInput = $("historial-cedula-search");
  const historialSearchBtn = $("historial-search-btn");
  const historialClearSearchBtn = $("historial-clear-search-btn");

  historialSearchBtn?.addEventListener("click", () => buscarHistorial());
  historialClearSearchBtn?.addEventListener("click", () => {
    historialCedulaSearchInput.value = "";
    buscarHistorial();
  });

  // 🆕 --- Lógica dinámica SOLO para formulario de Créditos Radicados ---
  const creditosForm = $("creditos-form");
  if (creditosForm) {
    const operativoRad = creditosForm.querySelector('select[name="operativo"]');
    const entidadRad = creditosForm.querySelector('select[name="entidad"]');
    const oficinaRad = creditosForm.querySelector('select[name="oficina"]');
    const lineaRad = creditosForm.querySelector('select[name="linea"]');
    const tipoRad = creditosForm.querySelector('select[name="tipo-solicitud"]');
    const plazoRad = $("creditos-plazo");
    const etapaRad = $("creditos-etapa");
    const seguroRad = creditosForm.querySelector('select[name="seguro"]');

    const entidadRadOpcionesOriginales = entidadRad ? entidadRad.innerHTML : "";

    const generarPlazos = (inicio, fin, paso = 12) =>
      Array.from({ length: (fin - inicio) / paso + 1 }, (_, i) => inicio + i * paso);

    const etapasOtros = [
      "Enviado",
      "Devuelto",
      "En estudio",
      "Aplazado",
      "Aprobado",
      "Negado",
      "Visacion",
      "Pendiente desembolso",
      "Desembolsado",
    ];

    const opciones = {
      Credivillas: {
        tipos: ["Compra de Cartera", "Libre Inversión"],
        plazos: generarPlazos(12, 72, 1),
        etapas: [
          "Radicación Pendiente",
          "Devuelto Complementación",
          "Verificación Empresa",
          "Análisis",
          "Negado Pte Validar",
          "Negado",
          "Constitución Seguro",
          "Atribuciones Personales",
          "Comité Dirección",
          "Comité Regional",
          "Comité Gerencia",
          "Comité Jefatura",
          "Comité Vicepresidencia",
          "Vobo Cliente",
          "Devuelto Garantías",
          "Vobo Jurídico",
          "Contabilización Pendiente",
          "Contabilización Aceptado",
          "Desiste",
        ],
      },
      Libranza: {
        tipos: ["Compra de Cartera", "Libre Inversión"],
        plazos: generarPlazos(12, 180, 1),
        etapas: [
          "Radicación Pendiente",
          "Devuelto Complementación",
          "Análisis",
          "Negado Pte Validar",
          "Negado",
          "Constitución Seguro",
          "Atribuciones Personales",
          "Comité Dirección",
          "Comité Regional",
          "Comité Jefatura",
          "Comité Vicepresidencia",
          "Vobo Cliente",
          "Vobo Comercial",
          "Vobo Cartera",
          "Vobo Empresa",
          "Devuelto Garantías",
          "Vobo Jurídico",
          "Archivado",
          "Contabilización Pendiente",
          "Contabilización Aceptado",
          "Desiste",
          "Retenido por Otra Entidad",
        ],
      },
      Hipotecario: {
        tipos: ["Compra de Cartera", "Libre Inversión", "Casa Usada", "Casa Nueva", "Leasing"],
        plazos: generarPlazos(12, 240, 1),
        etapas: [
          "Radicación Pendiente",
          "Verificación Empresa",
          "Devuelto Complementación",
          "Preanálisis",
          "Comité Dirección Preaprobado",
          "Comité Gerencia Preaprobado",
          "Comité Jefatura Preaprobado",
          "Vobo Cliente Preaprobado",
          "Negado Pte Validar",
          "Negado",
          "Carta Preaprobado",
          "Avalúo",
          "Análisis",
          "Comité Dirección",
          "Comité Jefatura Crédito",
          "Comité Gerencia",
          "Señalización",
          "Carta Aprobado",
          "Trámite Crédito",
          "Estudio Títulos",
          "Minuta",
          "Recepción Escritura",
          "Contabilización Pendiente",
          "Contabilización Aceptado",
          "Archivado",
          "Desiste",
        ],
      },
      Tarjetas: {
        tipos: ["Libre Inversión"],
        plazos: [0],
        etapas: [
          "Radicación Pendiente",
          "Devuelto Complementación",
          "Verificación Empresa",
          "Análisis",
          "Negado Pte Validar",
          "Negado",
          "Atribuciones Personales",
          "Vobo Cliente",
          "Devuelto Garantías",
          "Vobo Jurídico",
          "Contabilización Pendiente",
          "Contabilización Aceptado",
          "Desiste",
        ],
      },
    };

    function actualizarPorOperativoYEntidad() {
      const opSel = (operativoRad?.value || "").trim();
      const entidadActual = entidadRad?.value || "";
      const lineaActual = lineaRad?.value || "";

      if (!opSel) {
        if (oficinaRad)
          oficinaRad.innerHTML =
            '<option value="">Seleccione un operativo primero...</option>';

        if (lineaRad)
          lineaRad.innerHTML =
            '<option value="">Seleccione una entidad primero...</option>';

        if (entidadRad && entidadRadOpcionesOriginales)
          entidadRad.innerHTML = entidadRadOpcionesOriginales;

        return;
      }

      // ✅ Restaurar entidades normales
      if (entidadRad) {
        entidadRad.innerHTML = entidadRadOpcionesOriginales;

        if (
          entidadActual &&
          [...entidadRad.options].some((o) => o.value === entidadActual)
        ) {
          entidadRad.value = entidadActual;
        } else {
          entidadRad.value = "";
        }
      }

      // ✅ Oficinas permitidas para los operativos
      let oficinas = [];

      if (
        opSel === "Andres Armando Solano Ospino" ||
        opSel === "Rodrigo Rafael Campo Castillo" ||
        opSel === "Rafael Carlos Ospino Cobo"
      ) {
        oficinas = [
          "Credibank Barranquilla",
          "Credibank Valledupar",
          "Credibank Monteria",
        ];
      } else {
        oficinas = ["Credibank"];
      }

      // ✅ Llenar select de oficinas
      if (oficinaRad) {
        oficinaRad.innerHTML =
          '<option value="">Seleccione...</option>';

        oficinas.forEach((oficina) => {
          const optOf = document.createElement("option");
          optOf.value = oficina;
          optOf.textContent = oficina;
          oficinaRad.appendChild(optOf);
        });
      }

      actualizarLineasSegunEntidad(lineaActual);
    }

    function actualizarLineasSegunEntidad(lineaPreferida = "") {
      if (!lineaRad) return;

      const entidadSeleccionada = entidadRad?.value || "";
      const entidadNormalizada = normalizarTextoPlano(entidadSeleccionada);
      const esAvVillas = esEntidadAvVillas(entidadSeleccionada);
      const hayEntidadSeleccionada = entidadNormalizada !== "";

      lineaRad.innerHTML = '<option value="">Seleccione...</option>';

      if (!hayEntidadSeleccionada) {
        if (tipoRad) tipoRad.innerHTML = '<option value="">Seleccione...</option>';
        if (plazoRad) plazoRad.innerHTML = '<option value="">Seleccione...</option>';
        if (etapaRad) etapaRad.innerHTML = '<option value="">Seleccione...</option>';
        actualizarSeguro();
        return;
      }

      const lineas = esAvVillas
        ? ["Credivillas", "Libranza", "Hipotecario", "Tarjetas"]
        : ["Libranza"];

      lineas.forEach((linea) => {
        const opt = document.createElement("option");
        opt.value = linea;
        opt.textContent = linea;
        lineaRad.appendChild(opt);
      });

      if (lineaPreferida && lineas.includes(lineaPreferida)) {
        lineaRad.value = lineaPreferida;
      } else if (!esAvVillas) {
        lineaRad.value = "Libranza";
      } else {
        lineaRad.value = "";
      }

      if (lineaRad.value) {
        actualizarSelects(lineaRad.value);
      } else {
        if (tipoRad) tipoRad.innerHTML = '<option value="">Seleccione...</option>';
        if (plazoRad) plazoRad.innerHTML = '<option value="">Seleccione...</option>';
        if (etapaRad) etapaRad.innerHTML = '<option value="">Seleccione...</option>';
        actualizarSeguro();
      }
    }

    function actualizarSelects(linea, valoresActuales = {}) {
      const oldTipo = tipoRad.value;
      const oldPlazo = plazoRad.value;
      const oldEtapa = etapaRad.value;

      tipoRad.innerHTML = '<option value="">Seleccione...</option>';
      plazoRad.innerHTML = '<option value="">Seleccione...</option>';
      etapaRad.innerHTML = '<option value="">Seleccione...</option>';

      const entidadActual = (entidadRad.value || "").toLowerCase();
      const esAvVillas = entidadActual.includes("av villas");
      const config = opciones[linea];
      if (!config) return;

      const tiposUsar = esAvVillas ? config.tipos : ["Compra de Cartera", "Libre Inversión"];
      tiposUsar.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        tipoRad.appendChild(opt);
      });

      config.plazos.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p === 0 ? "N/A" : `${p} meses`;
        plazoRad.appendChild(opt);
      });

      const etapasAUsar = esAvVillas ? config.etapas || [] : etapasOtros;
      etapasAUsar.forEach((e) => {
        const opt = document.createElement("option");
        opt.value = e;
        opt.textContent = e;
        etapaRad.appendChild(opt);
      });

      if (valoresActuales.tipoSolicitud) tipoRad.value = valoresActuales.tipoSolicitud;
      if (valoresActuales.plazo) plazoRad.value = valoresActuales.plazo;
      if (valoresActuales.etapa) etapaRad.value = valoresActuales.etapa;

      if (!tipoRad.value && oldTipo) tipoRad.value = oldTipo;
      if (!plazoRad.value && oldPlazo) plazoRad.value = oldPlazo;
      if (!etapaRad.value && oldEtapa) etapaRad.value = oldEtapa;

      actualizarSeguro();
    }

    function actualizarSeguro() {
      if (!seguroRad) return;

      const lineaSeleccionada = lineaRad?.value || "";
      const entidadSeleccionada = entidadRad?.value || "";
      const lineaNormalizada = normalizarTextoPlano(lineaSeleccionada);
      const esAvVillas = esEntidadAvVillas(entidadSeleccionada);

      const bloquearPorRegla = aplicaReglaLibranzaSinSeguroNiCampana({
        entidad: entidadSeleccionada,
        linea: lineaSeleccionada,
      });

      if (bloquearPorRegla) {
        seguroRad.value = "";
        seguroRad.disabled = true;
        seguroRad.classList.add("bg-gray-100", "cursor-not-allowed");
        return;
      }

      seguroRad.disabled = false;
      seguroRad.classList.remove("bg-gray-100", "cursor-not-allowed");

      const esLineaAvVillasSinPredeterminado =
        esAvVillas &&
        ["libranza", "hipotecario", "credivillas"].includes(lineaNormalizada);

      if (esLineaAvVillasSinPredeterminado) {
        seguroRad.value = "";
        return;
      }

      if (!lineaNormalizada) {
        seguroRad.value = "";
        return;
      }

      const esLibranza = lineaNormalizada === "libranza";
      seguroRad.value = esLibranza ? "si" : "no";
    }

    operativoRad?.addEventListener("change", actualizarPorOperativoYEntidad);
    lineaRad?.addEventListener("change", (e) => actualizarSelects(e.target.value));
    entidadRad?.addEventListener("change", () => {
      actualizarLineasSegunEntidad(lineaRad?.value || "");
    });
    etapaRad?.addEventListener("focus", () => {
      const seguroActual = seguroRad?.value || "";
      actualizarSelects(lineaRad.value);
      if (seguroRad && seguroActual) seguroRad.value = seguroActual;
    });

    window.addEventListener("load", () => {
      actualizarPorOperativoYEntidad();
      if (entidadRad?.value) {
        actualizarLineasSegunEntidad(lineaRad?.value || "");
      } else if (lineaRad) {
        lineaRad.innerHTML = '<option value="">Seleccione...</option>';
      }
      actualizarSeguro();
    });

    const fileAutorizacion = $("autorizacion-consulta");
    const checkDigital = $("autorizacion-digital");

    if (fileAutorizacion && checkDigital) {
      checkDigital.addEventListener("change", () => {
        if (checkDigital.checked) {
          fileAutorizacion.disabled = true;
          fileAutorizacion.removeAttribute("required");
          fileAutorizacion.value = "";
          fileAutorizacion.classList.add("bg-gray-100", "cursor-not-allowed");
        } else {
          fileAutorizacion.disabled = false;
          fileAutorizacion.setAttribute("required", "true");
          fileAutorizacion.classList.remove("bg-gray-100", "cursor-not-allowed");
        }
      });
    }
  }

  // 🆕 --- Mostrar panel automáticamente si el usuario ya está autenticado ---
  window.addEventListener("load", () => {
    if (isAuthenticated()) {
      // ✅ Rellenar automáticamente datos del asesor
      autocompletarDatosAsesor();
      showAdminPanel();
      cargarPerfilamiento();
      cargarRadicacion();
      cargarTrabajaNosotros();
      cargarHistorial();
      cargarCreditos?.();
      cargarAsesores?.();

      // ✅ Publicidad: refrescar en caso de que haya cambiado desde otra sesión
      cargarYRenderPublicidad?.();
      verPublicidadAdmin?.();

      qs('.admin-tab-btn[data-tab="creditos"]')?.click();
    }
  });
}); // ✅ cierre DOMContentLoaded

// --- Consulta de Crédito (Tabla creditos_radicados) ---
document
  .getElementById("consulta-credito-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const numeroCredito = document
      .getElementById("numero_credito-input")
      .value.trim();
    const resultadoDiv = $("resultado-credito");

    if (!numeroCredito) return;

    try {
      const { data, error } = await supabaseClient
        .from("creditos_radicados")
        .select("*")
        .eq("numero_credito", numeroCredito)
        .maybeSingle();

      if (error || !data) {
        resultadoDiv.innerHTML = `<p class="text-red-600 font-semibold">❌ No se encontró un crédito con ese número.</p>`;
        resultadoDiv.classList.remove("hidden");
        return;
      }

      // ✅ Campos que SÍ queremos mostrar (según tus capturas)
      const camposMostrar = [
        "entidad",
        "nombre",
        "cedula",
        "linea",
        "tipo_solicitud",
        "tasa",
        "convenio_libranza",
        "empresa",
        "monto_solicitado",
        "monto_retanqueo",
        "saldo_comprar",
        "monto_aprobado_libranza",
        "monto_aprobado_credivillas",
        "monto_aprobado_hipotecario",
        "monto_aprobado_tarjeta",
        "numero_tarjetas_aprobadas",
        "entidad_comprar",
        "seguro",
        "plazo",
        "etapa",
        "fecha_desembolso",
        "observaciones",
      ];

      let detallesHtml = `
        <h3 class="text-xl font-bold text-gray-800 mb-4">📋 Detalles del Crédito</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full border border-gray-300 text-sm">
            <tbody>
      `;

      // 🔍 Mostrar solo los campos seleccionados
      camposMostrar.forEach((key) => {
        if (data[key] === undefined) return; // si no existe el campo, lo ignora
        let valor = data[key] ?? "-";

        // Formatear números y fechas
        const camposMoneda = [
          "monto_solicitado",
          "monto_retanqueo",
          "saldo_comprar",
          "monto_aprobado_libranza",
          "monto_aprobado_credivillas",
          "monto_aprobado_hipotecario",
          "monto_aprobado_tarjeta",
        ];

        if (camposMoneda.includes(key)) {
          valor = formatCurrency(valor);
        }
        if (key.includes("fecha")) {
          valor = formatDate(valor);
        }

        detallesHtml += `
          <tr class="border-b">
            <td class="px-3 py-2 font-semibold text-gray-700 capitalize">${formatearNombreCampo(
          key
        )}</td>
            <td class="px-3 py-2 text-gray-600">${valor}</td>
          </tr>
        `;
      });

      detallesHtml += `
            </tbody>
          </table>
        </div>
      `;

      resultadoDiv.innerHTML = detallesHtml;
      resultadoDiv.classList.remove("hidden");
    } catch (err) {
      console.error("Error consultando crédito:", err);
      resultadoDiv.innerHTML = `<p class="text-red-600 font-semibold">⚠️ Ocurrió un error al consultar.</p>`;
      resultadoDiv.classList.remove("hidden");
    }
  });

// --- Formatear fecha de vinculación sin desfase ---
function formatFechaVinculacion(dateString) {
  if (!dateString) return "N/A";

  const [year, month, day] = String(dateString).split("-");
  if (!year || !month || !day) return "Fecha inválida";

  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

// 📋 Cargar asesores (filtra por cédula, estado y coordinador)
async function cargarAsesores(
  cedulaFiltro = "",
  estadoFiltro = "",
  coordinadorFiltro = ""
) {
  let query = supabaseClient
    .from("asesores")
    .select("*")
    .order("fecha_vinculacion", { ascending: false });

  if (cedulaFiltro) query = query.ilike("cedula", `%${cedulaFiltro}%`);
  if (estadoFiltro) query = query.eq("estado", estadoFiltro);
  if (coordinadorFiltro) query = query.ilike("coordinador", `%${coordinadorFiltro}%`);

  const { data, error } = await query;

  const tbody = $("asesores-table-body");
  const contador = $("contador-asesores");

  if (error) {
    console.error("Error cargando asesores:", error);
    tbody.innerHTML = `<tr><td colspan="10" class="text-red-600 p-4 text-center">Error al cargar asesores</td></tr>`;
    if (contador) contador.textContent = "(0)";
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-gray-500 p-4 text-center">No hay asesores registrados</td></tr>`;
    if (contador) contador.textContent = "(0)";
    return;
  }

  if (contador) contador.textContent = `(${data.length})`;

  tbody.innerHTML = data.map((asesor) => {
    const estado = asesor.estado || "Sin Vinculación";

    const colorClase =
      estado === "Activo"
        ? "text-green-600 font-semibold"
        : estado === "Inactivo"
          ? "text-red-600 font-semibold"
          : "text-gray-500 font-semibold";

    const payload = encodeURIComponent(JSON.stringify(asesor));
    const userRole = getUserRole();

    return `
      <tr class="border-b">
        <td class="px-4 py-2 text-center">${asesor.cedula || "-"}</td>
        <td class="px-4 py-2">${asesor.nombre || "-"}</td>
        <td class="px-4 py-2">${asesor.coordinador || "-"}</td>
        <td class="px-4 py-2 text-center">${asesor.fecha_vinculacion ? formatFechaVinculacion(asesor.fecha_vinculacion) : "N/A"}</td>

        <td class="px-4 py-2 text-center">
          <select
            onchange="actualizarEstadoAsesor('${asesor.cedula}', this.value)"
            class="estado-select border rounded px-2 py-1 text-sm ${colorClase}">
            <option value="Activo" ${estado === "Activo" ? "selected" : ""}>Activo</option>
            <option value="Inactivo" ${estado === "Inactivo" ? "selected" : ""}>Inactivo</option>
            <option value="Sin Vinculación" ${estado === "Sin Vinculación" ? "selected" : ""}>Sin Vinculación</option>
          </select>
        </td>

        <td class="px-4 py-2 text-center">${asesor.telefono || "-"}</td>
        <td class="px-4 py-2 text-center">${asesor.banco || "-"}</td>
        <td class="px-4 py-2 text-center">${asesor.cuenta || "-"}</td>

        <td class="px-4 py-2 text-center whitespace-nowrap">
          <button onclick="editarAsesorDecodificado('${payload}')"
            class="bg-yellow-500 text-white px-3 py-1 rounded mr-2 hover:bg-yellow-600 whitespace-nowrap">
            <i class="fas fa-edit"></i> Editar
          </button>
          ${userRole === "admin"
        ? `
            <button onclick="eliminarAsesor('${asesor.cedula}')"
              class="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 whitespace-nowrap">
              <i class="fas fa-trash"></i> Eliminar
            </button>`
        : ""
      }
        </td>
      </tr>
    `;
  }).join("");
}

// ✅ Actualizar estado individual
async function actualizarEstadoAsesor(cedula, nuevoEstado) {
  try {
    const { error } = await supabaseClient
      .from("asesores")
      .update({ estado: nuevoEstado })
      .eq("cedula", cedula);

    if (error) {
      console.error("Error actualizando estado:", error);
      mostrarMensaje(null, "error", "❌ No se pudo actualizar el estado");
      return;
    }

    // Cambiar color del select
    const select = qs(
      `select[onchange="actualizarEstadoAsesor('${cedula}', this.value)"]`
    );
    if (select) {
      select.classList.remove(
        "text-green-600",
        "text-red-600",
        "text-gray-500"
      );

      if (nuevoEstado === "Activo")
        select.classList.add("text-green-600", "font-semibold");
      else if (nuevoEstado === "Inactivo")
        select.classList.add("text-red-600", "font-semibold");
      else select.classList.add("text-gray-500", "font-semibold");
    }

    mostrarMensaje(null, "exito", `✅ Estado actualizado a "${nuevoEstado}"`);
  } catch (e) {
    console.error("Error en actualizarEstadoAsesor:", e);
    mostrarMensaje(null, "error", "❌ Error inesperado al actualizar estado");
  }
}

// 🔹 Cargar coordinadores en el <select> del formulario y en el filtro
async function cargarCoordinadores() {
  const { data, error } = await supabaseClient
    .from("coordinadores")
    .select("nombre")
    .order("nombre", { ascending: true });

  const selectForm = $("coordinador-asesor");
  const selectFiltro = $("filtro-coordinador-asesor");

  if (selectForm)
    selectForm.innerHTML = '<option value="">Seleccione un coordinador...</option>';
  if (selectFiltro)
    selectFiltro.innerHTML =
      '<option value="">Todos los coordinadores</option>';

  if (error) {
    console.error("Error al cargar coordinadores:", error);
    return;
  }

  data.forEach((coord) => {
    if (selectForm) {
      const option = document.createElement("option");
      option.value = coord.nombre;
      option.textContent = coord.nombre;
      selectForm.appendChild(option);
    }

    if (selectFiltro) {
      const option2 = document.createElement("option");
      option2.value = coord.nombre;
      option2.textContent = coord.nombre;
      selectFiltro.appendChild(option2);
    }
  });
}

// 🧩 Cargar coordinadores y asesores al iniciar
document.addEventListener("DOMContentLoaded", async () => {
  await cargarCoordinadores();
  await cargarAsesores();
});

// ✅ Escuchar cambios en búsqueda, filtro de estado y filtro de coordinador
const inputCedula = $("buscar-cedula");
const selectEstado = $("filtro-estado");
const selectCoordinadorFiltro = $("filtro-coordinador-asesor");

inputCedula.addEventListener("input", () => {
  cargarAsesores(
    inputCedula.value.trim(),
    selectEstado.value,
    selectCoordinadorFiltro ? selectCoordinadorFiltro.value : ""
  );
});

selectEstado.addEventListener("change", () => {
  cargarAsesores(
    inputCedula.value.trim(),
    selectEstado.value,
    selectCoordinadorFiltro ? selectCoordinadorFiltro.value : ""
  );
});

if (selectCoordinadorFiltro) {
  selectCoordinadorFiltro.addEventListener("change", () => {
    cargarAsesores(
      inputCedula.value.trim(),
      selectEstado.value,
      selectCoordinadorFiltro.value
    );
  });
}

// 🧾 Guardar / actualizar asesor
$("asesor-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const cedula = $("cedula-asesor").value.trim();
  const nombre = $("nombre-asesor").value.trim();
  const fecha = $("fecha-vinculacion").value;
  const estado = $("estado-asesor").value;
  const coordinador = $("coordinador-asesor").value;
  const telefono = $("telefono-asesor")?.value.trim() || "";
  const banco = $("banco-asesor")?.value.trim() || "";
  const cuenta = $("cuenta-asesor")?.value.trim() || "";

  try {
    const nuevoAsesor = {
      cedula,
      nombre,
      estado,
      coordinador,
      telefono,
      banco,
      cuenta,
    };

    if (fecha) nuevoAsesor.fecha_vinculacion = fecha;

    const { error } = await supabaseClient
      .from("asesores")
      .upsert([nuevoAsesor], { onConflict: "cedula" });

    if (error) throw error;

    mostrarMensaje(null, "exito", "✅ Asesor guardado correctamente.");
    $("asesor-form").reset();
    await cargarAsesores();
  } catch (err) {
    console.error("Error guardando asesor:", err);
    mostrarMensaje(null, "error", "❌ Error al guardar asesor.");
  }
});

// ✏️ Editar asesor
function editarAsesor(asesor) {
  $("cedula-asesor").value = asesor.cedula || "";
  $("nombre-asesor").value = asesor.nombre || "";
  $("fecha-vinculacion").value = asesor.fecha_vinculacion || "";
  $("estado-asesor").value = asesor.estado || "Sin Vinculación";
  $("coordinador-asesor").value = asesor.coordinador || "";
  $("telefono-asesor").value = asesor.telefono || "";
  $("banco-asesor").value = asesor.banco || "";
  $("cuenta-asesor").value = asesor.cuenta || "";
}

function editarAsesorDecodificado(payload) {
  try {
    const asesor = JSON.parse(decodeURIComponent(payload));
    editarAsesor(asesor);
  } catch (error) {
    console.error("Error cargando datos del asesor para edición:", error);
    mostrarMensaje(null, "error", "❌ No se pudo cargar la información del asesor.");
  }
}

// 🗑️ Eliminar asesor
async function eliminarAsesor(cedula) {
  if (!confirm("¿Seguro que quieres eliminar este asesor?")) return;

  try {
    const { error } = await supabaseClient
      .from("asesores")
      .delete()
      .eq("cedula", cedula);

    if (error) throw error;

    mostrarMensaje(null, "exito", "🗑️ Asesor eliminado correctamente.");
    await cargarAsesores();
  } catch (err) {
    console.error("Error eliminando asesor:", err);
    mostrarMensaje(null, "error", "❌ Error al eliminar asesor.");
  }
}

// ============================================================
// 🔎 FILTROS AVANZADOS Y BUSCADOR DE CRÉDITOS RADICADOS
// ============================================================

// Elementos principales
const inputBuscarCreditos = $("buscar-creditos");
const inputCedulaNumero = $("filtro-cedula-numero");
const filtrosSelects = $$("#filtros-creditos select");
const tbodyCreditos = $("solicitudes-table-body-creditos");
const noSolicitudesCreditos = $("no-solicitudes-creditos");

// ============================================================
// 🧰 Helpers para selects (soporta multiple)
// ============================================================
function getSelectValues(id) {
  const el = $(id);
  if (!el) return [];

  // ✅ TomSelect soporta múltiples valores como array (o string si single)
  if (el.tomselect) {
    const v = el.tomselect.getValue();
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter((x) => x !== "");
    const s = String(v ?? "").trim();
    return s ? [s] : [];
  }

  // ✅ Select nativo
  if (el.multiple) {
    return Array.from(el.selectedOptions || [])
      .map((o) => (o.value ?? "").trim())
      .filter((v) => v !== "");
  }
  const v = (el.value ?? "").trim();
  return v ? [v] : [];
}

function setSelectValues(id, values) {
  const el = $(id);
  if (!el) return;

  const vals = Array.isArray(values) ? values.map(String) : [String(values ?? "")];
  const clean = vals.map((v) => v.trim()).filter((v) => v !== "");

  // ✅ TomSelect
  if (el.tomselect) {
    el.tomselect.setValue(clean, true);
    return;
  }

  // ✅ Select nativo
  if (el.multiple) {
    const set = new Set(clean);
    Array.from(el.options).forEach((opt) => {
      opt.selected = set.has(String(opt.value));
    });
  } else {
    el.value = clean[0] ?? "";
  }
}

function clearSelect(el) {
  if (!el) return;

  // ✅ TomSelect
  if (el.tomselect) {
    el.tomselect.clear(true);
    el.tomselect.refreshOptions(false);
    return;
  }

  // ✅ Select nativo
  if (el.multiple) {
    Array.from(el.options).forEach((o) => (o.selected = false));
  } else {
    el.value = "";
  }
}

// ============================================================
// 🧠 MEMORIA DE FILTROS ACTIVOS (usa SafeStore para evitar bloqueos)
// ============================================================
const FILTERS_KEY = "filtros_creditos";


// ============================================================
// ✅ Multi-select bonito (Tom Select) para filtros de Créditos
//    - Permite seleccionar varias opciones
//    - Búsqueda, tags, botón limpiar
// ============================================================

function initCreditosMultiSelects() {
  if (typeof TomSelect === "undefined") return;

  const ids = [
    "filtro-entidad",
    "filtro-anio",
    "filtro-mes",
    "filtro-linea",
    "filtro-etapa",
    "filtro-operativo",
    "filtro-oficina",
  ];

  ids.forEach((id) => {
    const el = $(id);
    if (!el) return;

    // Evitar doble inicialización
    if (el.tomselect) return;

    const placeholder = el.getAttribute("data-placeholder") || "Selecciona...";

    new TomSelect(el, {
      plugins: ["remove_button", "clear_button", "checkbox_options"],
      placeholder,
      persist: false,
      maxItems: null,
      create: false,
      hideSelected: false,
      closeAfterSelect: false,
      allowEmptyOption: true,

      // Mejor UX al escribir
      render: {
        no_results: function (data, escape) {
          return '<div class="no-results">Sin resultados para "' + escape(data.input) + '"</div>';
        },
      },
    });
  });
}

function obtenerFiltrosActuales() {
  return {
    texto: inputBuscarCreditos?.value || "",
    cedula: inputCedulaNumero?.value || "",

    // multiples
    entidad: getSelectValues("filtro-entidad"),
    anio: getSelectValues("filtro-anio"),
    mes: getSelectValues("filtro-mes"),
    linea: getSelectValues("filtro-linea"),
    etapa: getSelectValues("filtro-etapa"),
    operativo: getSelectValues("filtro-operativo"),
    oficina: getSelectValues("filtro-oficina"),

    // simples
    resultado: ($("filtro-resultado")?.value || ""),
    coordinador: ($("filtro-coordinador")?.value || ""),
    ejecutivo: ($("filtro-ejecutivo")?.value || ""),
  };
}

function restaurarFiltrosGuardados(filtros) {
  if (!filtros) return;

  if (inputBuscarCreditos) inputBuscarCreditos.value = filtros.texto || "";
  if (inputCedulaNumero) inputCedulaNumero.value = filtros.cedula || "";

  setSelectValues("filtro-entidad", filtros.entidad || []);
  setSelectValues("filtro-anio", filtros.anio || []);
  setSelectValues("filtro-mes", filtros.mes || []);
  setSelectValues("filtro-linea", filtros.linea || []);
  setSelectValues("filtro-etapa", filtros.etapa || []);
  setSelectValues("filtro-operativo", filtros.operativo || []);
  setSelectValues("filtro-oficina", filtros.oficina || []);

  const r = $("filtro-resultado"); if (r) r.value = filtros.resultado || "";
  const c = $("filtro-coordinador"); if (c) c.value = filtros.coordinador || "";
  const e = $("filtro-ejecutivo"); if (e) e.value = filtros.ejecutivo || "";
}

function guardarFiltrosEnMemoria() {
  try {
    const filtros = obtenerFiltrosActuales();
    // SafeStore existe arriba en tu script; si por alguna razón no está, cae a localStorage
    if (typeof SafeStore !== "undefined" && SafeStore?.set) SafeStore.set(FILTERS_KEY, JSON.stringify(filtros));
    else localStorage.setItem(FILTERS_KEY, JSON.stringify(filtros));
  } catch (err) {
    console.warn("⚠️ No se pudieron guardar filtros:", err);
  }
}

function cargarFiltrosDesdeMemoria() {
  try {
    const raw =
      (typeof SafeStore !== "undefined" && SafeStore?.get)
        ? SafeStore.get(FILTERS_KEY)
        : localStorage.getItem(FILTERS_KEY);

    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("⚠️ No se pudieron leer filtros guardados:", err);
    return null;
  }
}

function limpiarMemoriaFiltros() {
  try {
    if (typeof SafeStore !== "undefined" && SafeStore?.del) SafeStore.del(FILTERS_KEY);
    else localStorage.removeItem(FILTERS_KEY);
  } catch (err) {
    // ignore
  }
}

// ============================================================
// 🧩 FUNCIÓN PRINCIPAL: Aplica todos los filtros combinados
//     ✅ Soporta selects multiple usando .in()
// ============================================================
async function aplicarFiltrosCreditos() {
  const filtroTexto = (inputBuscarCreditos?.value || "").trim();
  const filtroCedulaNumero = (inputCedulaNumero?.value || "").trim();

  const entidades = getSelectValues("filtro-entidad");
  const anios = getSelectValues("filtro-anio");
  const meses = getSelectValues("filtro-mes");
  const lineas = getSelectValues("filtro-linea");
  const etapas = getSelectValues("filtro-etapa");
  const operativos = getSelectValues("filtro-operativo");
  const oficinas = getSelectValues("filtro-oficina");

  const resultado = ($("filtro-resultado")?.value || "").trim();
  const coordinador = ($("filtro-coordinador")?.value || "").trim();
  const ejecutivo = ($("filtro-ejecutivo")?.value || "").trim();

  let query = supabaseClient
    .from("creditos_radicados")
    .select("*")
    .order("fecha", { ascending: false });

  // 🔍 texto libre
  if (filtroTexto) {
    query = query.or(
      `numero_credito.ilike.%${filtroTexto}%,cedula.ilike.%${filtroTexto}%`
    );
  }

  // 🔍 cédula / número dedicado
  if (filtroCedulaNumero) {
    query = query.or(
      `numero_credito.ilike.%${filtroCedulaNumero}%,cedula.ilike.%${filtroCedulaNumero}%`
    );
  }

  // ✅ multi-selects
  if (entidades.length) query = query.in("entidad", entidades);
  if (anios.length) query = query.in("anio", anios);
  if (meses.length) query = query.in("mes", meses);
  if (lineas.length) query = query.in("linea", lineas);

  if (etapas.length) {
    const etapasNormales = etapas
      .filter((e) => e !== "__VACIO__")
      .map((e) => String(e).trim())
      .filter(Boolean);

    const incluirVacio = etapas.includes("__VACIO__");

    if (etapasNormales.length && incluirVacio) {
      const lista = etapasNormales.map((e) => `"${e}"`).join(",");
      query = query.or(`etapa.in.(${lista}),etapa.is.null,etapa.eq.""`);
    } else if (etapasNormales.length) {
      query = query.in("etapa", etapasNormales);
    } else if (incluirVacio) {
      query = query.or('etapa.is.null,etapa.eq.""');
    }
  }

  if (operativos.length) query = query.in("operativo", operativos);
  if (oficinas.length) query = query.in("oficina", oficinas);

  // ✅ simples
  if (resultado) query = query.eq("resultado_consulta", resultado);
  if (coordinador) query = query.eq("coordinador", coordinador);
  if (ejecutivo) query = query.eq("ejecutivo_comercial", ejecutivo);

  try {
    const { data, error } = await query;

    if (error) {
      console.error("❌ Error al aplicar filtros:", error);
      return;
    }

    if (!data || data.length === 0) {
      if (tbodyCreditos) tbodyCreditos.innerHTML = "";
      noSolicitudesCreditos?.classList.remove("hidden");
      actualizarTotalesCreditos([]);
    } else {
      noSolicitudesCreditos?.classList.add("hidden");
      if (tbodyCreditos) {
        tbodyCreditos.innerHTML = data.map((c) => renderFilaCredito(c)).join("");
      }
      actualizarTotalesCreditos(data);
    }
  } catch (err) {
    console.error("⚠️ Error ejecutando filtros de créditos:", err);
  }
}

// ============================================================
// ⌨️ BUSCADORES EN TIEMPO REAL
// ============================================================
if (inputBuscarCreditos) {
  inputBuscarCreditos.addEventListener("input", () => {
    guardarFiltrosEnMemoria();
    aplicarFiltrosCreditos();
  });
}
if (inputCedulaNumero) {
  inputCedulaNumero.addEventListener("input", () => {
    guardarFiltrosEnMemoria();
    aplicarFiltrosCreditos();
  });
}

// initCreditosMultiSelects(); // moved to init block after dynamic option filling

// ============================================================
// 🎯 Escucha cambios en los selects de filtros
// ============================================================
if (filtrosSelects.length > 0) {
  filtrosSelects.forEach((filtro) => {
    filtro.addEventListener("change", () => {
      guardarFiltrosEnMemoria();
      aplicarFiltrosCreditos();
    });
  });
}

// ============================================================
// 🧹 BOTÓN LIMPIAR FILTROS (limpia multiple correctamente)
// ============================================================
const btnLimpiar = document.createElement("button");
btnLimpiar.innerHTML = "🧹 <span class='ml-1'>Limpiar Filtros</span>";
btnLimpiar.type = "button";
btnLimpiar.className =
  "bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2";

btnLimpiar.addEventListener("click", async () => {
  document
    .querySelectorAll("#filtros-creditos select")
    .forEach((sel) => clearSelect(sel));

  if (inputBuscarCreditos) inputBuscarCreditos.value = "";
  if (inputCedulaNumero) inputCedulaNumero.value = "";

  limpiarMemoriaFiltros();

  await aplicarFiltrosCreditos();
  mostrarMensaje(null, "exito", "Filtros limpiados correctamente.");
});

$("filtros-creditos")?.appendChild(btnLimpiar);

// ============================================================
// 👔 LLENAR EJECUTIVOS, ETAPAS, OFICINAS Y COORDINADORES DINÁMICAMENTE
// ============================================================

// Traer todos los ejecutivos desde la BD por páginas
async function traerEjecutivosBDTodos() {
  const PAGE = 1000;
  let from = 0;
  const ejecutivos = [];

  while (true) {
    const { data, error } = await supabaseClient
      .from("creditos_radicados")
      .select("ejecutivo_comercial")
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      ejecutivos.push(row.ejecutivo_comercial);
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return ejecutivos;
}

async function llenarEjecutivosFiltro() {
  const filtroEjecutivo = $("filtro-ejecutivo");
  if (!filtroEjecutivo) return;

  try {
    const ejecutivosBD = await traerEjecutivosBDTodos();

    const ejecutivosUnicos = [
      ...new Set(
        ejecutivosBD
          .map((e) => String(e ?? "").trim()) // quita null, undefined y espacios
          .filter(Boolean) // elimina vacíos
      ),
    ].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

    filtroEjecutivo.innerHTML = `<option value="">Todos</option>`;

    ejecutivosUnicos.forEach((nombre) => {
      const opt = document.createElement("option");
      opt.value = nombre;
      opt.textContent = nombre;
      filtroEjecutivo.appendChild(opt);
    });

    // Si usas TomSelect
    if (filtroEjecutivo.tomselect) {
      const ts = filtroEjecutivo.tomselect;
      ts.clear(true);
      ts.clearOptions();

      ts.addOption({ value: "", text: "Todos" });

      ejecutivosUnicos.forEach((nombre) => {
        ts.addOption({ value: nombre, text: nombre });
      });

      ts.refreshOptions(false);
    }
  } catch (err) {
    console.error("Error al llenar ejecutivos:", err);
  }
}

async function traerEtapasBDTodas() {
  const PAGE = 1000;
  let from = 0;
  const etapas = [];

  while (true) {
    const { data, error } = await supabaseClient
      .from("creditos_radicados")
      .select("etapa")
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      etapas.push(row.etapa);
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return etapas;
}

async function llenarEtapasFiltro() {
  const filtroEtapa = $("filtro-etapa");
  if (!filtroEtapa) return;

  try {
    const etapasBD = await traerEtapasBDTodas();

    const tieneVacios = etapasBD.some((e) => !String(e ?? "").trim());

    const etapasUnicas = [
      ...new Set(
        etapasBD
          .map((e) => String(e ?? "").trim())
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

    filtroEtapa.innerHTML = "";

    if (tieneVacios) {
      const optVacio = document.createElement("option");
      optVacio.value = "__VACIO__";
      optVacio.textContent = "(Vacío)";
      filtroEtapa.appendChild(optVacio);
    }

    etapasUnicas.forEach((etapa) => {
      const opt = document.createElement("option");
      opt.value = etapa;
      opt.textContent = etapa;
      filtroEtapa.appendChild(opt);
    });

    if (filtroEtapa.tomselect) {
      const ts = filtroEtapa.tomselect;
      ts.clear(true);
      ts.clearOptions();

      if (tieneVacios) {
        ts.addOption({ value: "__VACIO__", text: "(Vacío)" });
      }

      etapasUnicas.forEach((etapa) => {
        ts.addOption({ value: etapa, text: etapa });
      });

      ts.refreshOptions(false);
    }
  } catch (err) {
    console.error("Error al llenar etapas:", err);
  }
}

// 🆕 Llenar oficinas dinámicamente
async function llenarOficinasFiltro() {
  const filtroOficina = $("filtro-oficina");
  if (!filtroOficina) return;

  try {
    const { data, error } = await supabaseClient
      .from("creditos_radicados")
      .select("oficina")
      .not("oficina", "is", null);

    if (error) {
      console.error("Error cargando oficinas:", error);
      return;
    }

    const oficinasUnicas = [
      ...new Set(
        data
          .map((d) => d.oficina?.trim())
          .filter(Boolean)
          .map((o) =>
            o.toLowerCase() === "credibank otros convenios"
              ? "Credibank Barranquilla"
              : o
          )
      ),
    ];

    oficinasUnicas.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    filtroOficina.innerHTML = `<option value="">Todas</option>`;

    oficinasUnicas.forEach((oficina) => {
      const opt = document.createElement("option");
      opt.value = oficina;
      opt.textContent = oficina;
      filtroOficina.appendChild(opt);
    });
  } catch (err) {
    console.error("Error al llenar oficinas dinámicamente:", err);
  }
}

// 🆕 Llenar coordinadores dinámicamente
async function llenarCoordinadoresFiltro() {
  const filtroCoordinador = $("filtro-coordinador");
  if (!filtroCoordinador) return;

  try {
    const { data, error } = await supabaseClient
      .from("creditos_radicados")
      .select("coordinador")
      .not("coordinador", "is", null);

    if (error) {
      console.error("Error cargando coordinadores:", error);
      return;
    }

    const coordinadoresUnicos = [
      ...new Set(
        data.map((d) => String(d.coordinador ?? "").trim()).filter(Boolean)
      ),
    ];

    coordinadoresUnicos.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    filtroCoordinador.innerHTML = `<option value="">Todos</option>`;

    coordinadoresUnicos.forEach((coord) => {
      const opt = document.createElement("option");
      opt.value = coord;
      opt.textContent = coord;
      filtroCoordinador.appendChild(opt);
    });
  } catch (err) {
    console.error("Error al llenar coordinadores dinámicamente:", err);
  }
}

// ============================================================
// 🚀 Inicialización
// ============================================================
(async () => {
  await llenarCoordinadoresFiltro();
  await llenarEjecutivosFiltro();
  await llenarEtapasFiltro();
  await llenarOficinasFiltro();

  // ✅ Inicializar multi-selects (Tom Select) después de llenar opciones dinámicas
  initCreditosMultiSelects();

  // 🔄 Restaurar filtros guardados si existen
  const filtrosGuardados = cargarFiltrosDesdeMemoria();
  if (filtrosGuardados) {
    restaurarFiltrosGuardados(filtrosGuardados);
  }

  await aplicarFiltrosCreditos();
})();

// 🔄 Deshabilitar "Tipo de Solicitud", "Seguro" y "Plazo" cuando la línea es "Tarjeta de Crédito"
document.addEventListener("DOMContentLoaded", function () {
  // Referencias a los selects
  const lineaSelect = qs('select[name="linea"]');
  const tipoSolicitudSelect = qs(
    'select[name="tipo-solicitud"]'
  );
  const seguroSelect = qs('select[name="seguro"]');
  const plazoSelect = qs("#creditos-plazo");

  if (!lineaSelect || !tipoSolicitudSelect || !seguroSelect || !plazoSelect)
    return;

  function toggleCamposTarjeta() {
    const valor = lineaSelect.value.trim().toLowerCase();
    const isTarjeta = valor === "tarjetas" || valor === "tarjeta de credito";

    // Agrupamos los tres campos
    const campos = [tipoSolicitudSelect, seguroSelect, plazoSelect];

    campos.forEach((campo) => {
      campo.disabled = isTarjeta;
      campo.classList.toggle("bg-gray-100", isTarjeta);
      campo.classList.toggle("cursor-not-allowed", isTarjeta);

      // Limpiar el valor si se deshabilita
      if (isTarjeta) campo.value = "";
    });
  }

  // Ejecutar al cargar y cuando se cambie la línea
  toggleCamposTarjeta();
  lineaSelect.addEventListener("change", toggleCamposTarjeta);
});

// 🧮 Calcular edad automáticamente cuando se selecciona la fecha de nacimiento
document
  .getElementById("fecha-nacimiento")
  .addEventListener("change", function () {
    const fechaNacimiento = new Date(this.value);
    const hoy = new Date();

    if (isNaN(fechaNacimiento)) {
      $("edad").value = "";
      return;
    }

    let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
    const mes = hoy.getMonth() - fechaNacimiento.getMonth();

    // Ajuste si aún no ha cumplido años este año
    if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
      edad--;
    }

    // 🧠 Solo guardar el número (sin texto)
    $("edad").value = edad;
  });

document.addEventListener("DOMContentLoaded", () => {

  const departamentoSelect = $("departamento");
  const ciudadSelect = $("ciudad");

  if (!departamentoSelect || !ciudadSelect) return;

  // Cache para evitar cargar el JSON varias veces
  let ciudadesCache = null;

  async function getCiudadesPorDepartamento() {
    if (ciudadesCache) return ciudadesCache;

    try {
      ciudadesCache = await __loadJSON("./data/ciudades.json");
    } catch (error) {
      console.error("Error cargando ciudades:", error);
      ciudadesCache = {};
    }

    return ciudadesCache;
  }

  // Cuando cambie el departamento
  departamentoSelect.addEventListener("change", async () => {

    const departamento = departamentoSelect.value.trim();

    const dataCiudades = await getCiudadesPorDepartamento();

    const ciudades = dataCiudades[departamento] || [];

    // Limpiar ciudades
    ciudadSelect.innerHTML =
      '<option value="">Seleccione una ciudad...</option>';

    // Si no hay ciudades salir
    if (!ciudades.length) return;

    // Crear opciones
    const fragment = document.createDocumentFragment();

    ciudades.forEach(ciudad => {

      const option = document.createElement("option");
      option.value = ciudad;
      option.textContent = ciudad;

      fragment.appendChild(option);

    });

    ciudadSelect.appendChild(fragment);

  });

});

// --- Convenios dinámicos según entidad, línea y tipo de solicitud ---
document.addEventListener("DOMContentLoaded", () => {
  const entidadSelect = $("entidad");
  const lineaSelect = $("linea");
  const tipoSolicitudSelect = $("tipo-solicitud");
  const convenioInput = $("convenio-libranza");
  const listaConvenios = $("listaConvenios");

  // Convenios se cargan bajo demanda (evita cargar + parsear el mega-objeto al inicio)
  let __conveniosData = null;
  async function __getConvenios() {
    if (__conveniosData) return __conveniosData;
    __conveniosData = await __loadJSON("./data/convenios.json");
    return __conveniosData;
  }
  // 🔍 Función para obtener la lista de convenios según la selección actual
  function obtenerLista(convenios) {
    const entidad = (entidadSelect?.value || "").toLowerCase();
    const linea = (lineaSelect?.value || "").toLowerCase();
    const tipo = (tipoSolicitudSelect?.value || "").toLowerCase();

    // Caso especial: Banco Av Villas → usa libranza + tipo de solicitud
    if (entidad.includes("av villas") && linea === "libranza") {
      if (tipo.includes("compra")) return convenios.avvillas.compra;
      if (tipo.includes("libre")) return convenios.avvillas.libre;
    }

    // Si es otra entidad → busca la lista correspondiente
    const entidadKey = Object.keys(convenios).find(
      (k) => k.toLowerCase() === entidadSelect.value.toLowerCase()
    );
    return convenios[entidadKey] || [];
  }

  // 🧠 Escucha escritura en el campo "convenio" y muestra sugerencias dinámicas
  if (convenioInput && listaConvenios) {
    convenioInput.addEventListener("input", async () => {
      const texto = convenioInput.value.toLowerCase();
      const convenios = await __getConvenios();
      const lista = obtenerLista(convenios);

      // Filtrar según lo que el usuario escriba
      const filtrados = lista.filter((c) => c.toLowerCase().includes(texto));

      // Limpiar y volver a llenar el datalist
      listaConvenios.innerHTML = "";
      filtrados.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        listaConvenios.appendChild(opt);
      });
    });
  }

  // 🧩 Al cambiar de entidad, tipo o línea → limpiar el campo de convenio
  [entidadSelect, lineaSelect, tipoSolicitudSelect].forEach((select) => {
    if (select) {
      select.addEventListener("change", () => {
        convenioInput.value = "";
        listaConvenios.innerHTML = "";
      });
    }
  });
});

// 🔹 Cargar lista de coordinadores
async function cargarCoordinadoresFormulario() {
  const { data, error } = await supabaseClient
    .from("coordinadores")
    .select("nombre")
    .order("nombre", { ascending: true });

  const selectCoordinador = $("coordinador");

  if (error) {
    console.error("Error cargando coordinadores:", error);
    return;
  }

  selectCoordinador.innerHTML =
    '<option value="">Seleccione un coordinador...</option>';
  data.forEach((coord) => {
    const option = document.createElement("option");
    option.value = coord.nombre;
    option.textContent = coord.nombre;
    selectCoordinador.appendChild(option);
  });
}

// 🔹 Cargar ejecutivos (asesores) según coordinador seleccionado
async function cargarEjecutivosPorCoordinador(nombreCoordinador) {
  const { data, error } = await supabaseClient
    .from("asesores")
    .select("nombre")
    .eq("coordinador", nombreCoordinador)
    .order("nombre", { ascending: true });

  const selectEjecutivo = $("ejecutivo-comercial");

  if (error) {
    console.error("Error cargando ejecutivos:", error);
    return;
  }

  selectEjecutivo.innerHTML =
    '<option value="">Seleccione un ejecutivo...</option>';
  if (!data || data.length === 0) {
    selectEjecutivo.innerHTML =
      '<option value="">Sin ejecutivos asignados</option>';
    return;
  }

  data.forEach((asesor) => {
    const option = document.createElement("option");
    option.value = asesor.nombre;
    option.textContent = asesor.nombre;
    selectEjecutivo.appendChild(option);
  });
}

// 🧩 Al cambiar coordinador → actualizar lista de ejecutivos
document.addEventListener("DOMContentLoaded", () => {
  const selectCoordinador = $("coordinador");
  cargarCoordinadoresFormulario();

  selectCoordinador.addEventListener("change", (e) => {
    const nombreCoordinador = e.target.value;
    if (nombreCoordinador) {
      cargarEjecutivosPorCoordinador(nombreCoordinador);
    } else {
      const selectEjecutivo = $("ejecutivo-comercial");
      selectEjecutivo.innerHTML =
        '<option value="">Seleccione un ejecutivo...</option>';
    }
  });
});

// === BLOQUEO DINÁMICO DE CAMPOS SEGÚN LÍNEA Y TIPO DE SOLICITUD ===
function inicializarBloqueoCampos(contexto = document) {
  const lineaSelect = contexto.querySelector('select[name="linea"]');
  const tipoSolicitudSelect = contexto.querySelector(
    'select[name="tipo-solicitud"]'
  );

  if (!lineaSelect || !tipoSolicitudSelect) return;

  const entidadSelect = contexto.querySelector('select[name="entidad"]');

  const campos = {
    convenioLibranza: contexto.querySelector('input[name="convenio-libranza"]'),
    empresa: contexto.querySelector('input[name="empresa"]'),
    montoRetanqueo: contexto.querySelector('input[name="monto-retanqueo"]'),
    saldoComprar: contexto.querySelector('input[name="saldo-comprar"]'),
    aprobadoLibranza: contexto.querySelector(
      'input[name="monto-aprobado-libranza"]'
    ),
    pagadoLibranza: contexto.querySelector(
      'input[name="monto-pagado-libranza"]'
    ),
    pendienteLibranza: contexto.querySelector(
      'input[name="monto-pendiente-libranza"]'
    ),
    aprobadoCredivillas: contexto.querySelector(
      'input[name="monto-aprobado-credivillas"]'
    ),
    pagadoCredivillas: contexto.querySelector(
      'input[name="monto-pagado-credivillas"]'
    ),
    aprobadoHipotecario: contexto.querySelector(
      'input[name="monto-aprobado-hipotecario"]'
    ),
    pagadoHipotecario: contexto.querySelector(
      'input[name="monto-pagado-hipotecario"]'
    ),
    aprobadoTC: contexto.querySelector('input[name="monto-aprobado-tarjeta"]'),
    tarjetasActivadas: contexto.querySelector(
      'input[name="numero-tarjetas-activadas"]'
    ),
    categoriaTDC: contexto.querySelector('select[name="categorias-tdc"]'),
    entidadComprar: contexto.querySelector('input[name="entidad-comprar"]'),
    tasa: contexto.querySelector('input[name="tasa"]'),
    seguro: contexto.querySelector('select[name="seguro"]'),
    campana: contexto.querySelector('select[name="campana"]'),
  };

  function bloquearCampo(campo, bloquear) {
    if (campo) {
      campo.disabled = bloquear;
      campo.classList.toggle("bg-gray-100", bloquear);
    }
  }

  function aplicarReglaEntidadLibranza() {
    const reglaActiva = aplicaReglaLibranzaSinSeguroNiCampana({
      entidad: entidadSelect?.value,
      linea: lineaSelect?.value,
    });

    if (campos.seguro) {
      if (reglaActiva) {
        campos.seguro.value = "";
        bloquearCampo(campos.seguro, true);
      } else if (normalizarTextoPlano(lineaSelect?.value) !== "tarjetas") {
        bloquearCampo(campos.seguro, false);
      }
    }

    if (campos.campana) {
      if (reglaActiva) {
        campos.campana.value = "";
        bloquearCampo(campos.campana, true);
      } else {
        bloquearCampo(campos.campana, false);
      }
    }
  }

  function actualizarCampos() {
    const linea = (lineaSelect.value || "").trim();
    const tipoSolicitud = (tipoSolicitudSelect.value || "")
      .trim()
      .toLowerCase();

    // Desbloquear todo antes de aplicar reglas
    Object.values(campos).forEach((campo) => bloquearCampo(campo, false));

    switch (linea) {
      case "Hipotecario":
        bloquearCampo(campos.convenioLibranza, true);
        bloquearCampo(campos.montoRetanqueo, true);
        bloquearCampo(campos.aprobadoLibranza, true);
        bloquearCampo(campos.pagadoLibranza, true);
        bloquearCampo(campos.pendienteLibranza, true);
        bloquearCampo(campos.aprobadoCredivillas, true);
        bloquearCampo(campos.pagadoCredivillas, true);
        bloquearCampo(campos.aprobadoTC, true);
        bloquearCampo(campos.tarjetasActivadas, true);
        bloquearCampo(campos.categoriaTDC, true);
        bloquearCampo(
          campos.saldoComprar,
          tipoSolicitud !== "compra de cartera"
        );
        bloquearCampo(
          campos.entidadComprar,
          tipoSolicitud !== "compra de cartera"
        );
        break;

      case "Credivillas":
        bloquearCampo(campos.convenioLibranza, true);
        bloquearCampo(campos.aprobadoLibranza, true);
        bloquearCampo(campos.pagadoLibranza, true);
        bloquearCampo(campos.pendienteLibranza, true);
        bloquearCampo(campos.aprobadoHipotecario, true);
        bloquearCampo(campos.pagadoHipotecario, true);
        bloquearCampo(campos.aprobadoTC, true);
        bloquearCampo(campos.tarjetasActivadas, true);
        bloquearCampo(campos.categoriaTDC, true);
        bloquearCampo(
          campos.saldoComprar,
          tipoSolicitud !== "compra de cartera"
        );
        bloquearCampo(
          campos.entidadComprar,
          tipoSolicitud !== "compra de cartera"
        );
        break;

      case "Libranza":
        bloquearCampo(campos.empresa, true);
        bloquearCampo(campos.aprobadoCredivillas, true);
        bloquearCampo(campos.pagadoCredivillas, true);
        bloquearCampo(campos.aprobadoHipotecario, true);
        bloquearCampo(campos.pagadoHipotecario, true);
        bloquearCampo(campos.aprobadoTC, true);
        bloquearCampo(campos.tarjetasActivadas, true);
        bloquearCampo(campos.categoriaTDC, true);
        bloquearCampo(
          campos.saldoComprar,
          tipoSolicitud !== "compra de cartera"
        );
        bloquearCampo(
          campos.entidadComprar,
          tipoSolicitud !== "compra de cartera"
        );
        break;

      case "Tarjetas":
        bloquearCampo(campos.tasa, true);
        bloquearCampo(campos.convenioLibranza, true);
        bloquearCampo(campos.montoRetanqueo, true);
        bloquearCampo(campos.saldoComprar, true);
        bloquearCampo(campos.aprobadoLibranza, true);
        bloquearCampo(campos.pagadoLibranza, true);
        bloquearCampo(campos.pendienteLibranza, true);
        bloquearCampo(campos.aprobadoCredivillas, true);
        bloquearCampo(campos.pagadoCredivillas, true);
        bloquearCampo(campos.aprobadoHipotecario, true);
        bloquearCampo(campos.pagadoHipotecario, true);
        bloquearCampo(campos.entidadComprar, true);
        bloquearCampo(campos.seguro, true);
        break;
    }

    aplicarReglaEntidadLibranza();
  }

  // Eventos de cambio
  lineaSelect.addEventListener("change", actualizarCampos);
  tipoSolicitudSelect.addEventListener("change", actualizarCampos);
  if (entidadSelect) entidadSelect.addEventListener("change", actualizarCampos);

  // Ejecutar al cargar (para edición o actualización)
  actualizarCampos();
}

// Ejecutar automáticamente al cargar el DOM
document.addEventListener("DOMContentLoaded", () => inicializarBloqueoCampos());


// 📤 Exportar tabla de Créditos a Excel (solo datos, sin filtros ni totales)
document.addEventListener("DOMContentLoaded", () => {
  const botonExportar = $("exportarExcelCreditos");
  if (botonExportar) {
    botonExportar.addEventListener("click", () => {
      // ✅ Validar que el usuario esté autenticado y sea admin
      const userRole = localStorage.getItem("userRole");
      const authenticated = localStorage.getItem("authenticated") === "true";

      if (!authenticated || userRole !== "admin") {
        mostrarMensaje(
          null,
          "error",
          "⚠️ Solo el usuario administrador puede exportar los datos a Excel."
        );
        return;
      }

      // Si pasa la validación, procede con la exportación
      exportarTablaCreditosAExcel();
    });
  }
});

function exportarTablaCreditosAExcel() {
  try {
    const tabla = $("tabla-creditos");
    if (!tabla) {
      mostrarMensaje(
        null,
        "error",
        "No se encontró la tabla de créditos en el documento."
      );
      return;
    }

    // 🧱 Clonar la tabla para no alterar la original
    const tablaClon = tabla.cloneNode(true);

    // 🔹 Eliminar la columna "Acciones" (1ª columna)
    tablaClon
      .querySelectorAll("th:first-child, td:first-child")
      .forEach((el) => el.remove());

    // 🔹 Eliminar filas con filtros o totales
    tablaClon.querySelectorAll("tr").forEach((fila) => {
      if (fila.querySelector("input, select")) {
        fila.remove();
      } else if (
        fila.innerText.toLowerCase().includes("total") ||
        fila.innerText.toLowerCase().includes("suma")
      ) {
        fila.remove();
      }
    });

    // 📋 Crear hoja Excel
    const hoja = XLSX.utils.table_to_sheet(tablaClon, {
      raw: true,
      cellDates: true,
    });

    // 📘 Crear libro
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Creditos");

    // 📏 Ajustar ancho de columnas
    const rango = XLSX.utils.decode_range(hoja["!ref"]);
    const colWidths = [];
    for (let C = rango.s.c; C <= rango.e.c; ++C) {
      let max = 10;
      for (let R = rango.s.r; R <= rango.e.r; ++R) {
        const celda = hoja[XLSX.utils.encode_cell({ r: R, c: C })];
        if (celda && celda.v) {
          const len = celda.v.toString().length;
          if (len > max) max = len;
        }
      }
      colWidths.push({ wch: max + 2 });
    }
    hoja["!cols"] = colWidths;

    // 📅 Nombre del archivo
    const nombreArchivo = `Creditos_Credibank_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    // 💾 Descargar Excel
    XLSX.writeFile(libro, nombreArchivo);

    mostrarMensaje(
      null,
      "exito",
      "✅ Exportación completada correctamente (solo datos)."
    );
  } catch (error) {
    console.error("Error al exportar la tabla:", error);
    mostrarMensaje(
      null,
      "error",
      "Ocurrió un error al generar el archivo Excel."
    );
  }
}

// ====================================================
// 🧱 SUBIR FICHAS COMERCIALES (ADMIN) POR ZONA + PERIODO
// ====================================================
async function subirFichasAdmin() {
  if (getUserRole() === "operativo") {
    mostrarMensaje(null, "error", "⛔ No tienes permiso para subir fichas.");
    return;
  }
  const archivosInput = $("fichas-admin");
  const lista = $("lista-fichas-admin");
  const zona = $("zona-ficha-admin")?.value || "Nacionales";
  const periodo = $("periodo-ficha-admin")?.value; // YYYY-MM

  if (!periodo) return mostrarMensaje(null, "error", "Selecciona el mes y año (Periodo).");

  if (!archivosInput?.files?.length)
    return mostrarMensaje(null, "error", "Selecciona uno o más archivos PDF.");

  lista.textContent = "📤 Subiendo fichas...";

  const storageBucket = "fichas_comerciales";   // ✅ NOMBRE DEL BUCKET (Storage)
  const tableName = "fichas_comerciales";       // ✅ NOMBRE DE LA TABLA (DB)

  const limpiar = (txt) =>
    txt
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");

  try {
    // (Opcional) Reemplazo SOLO EN BD: borra registros del mismo zona+periodo
    // Nota: esto NO borra archivos del bucket (por policy). Se hace con Edge Function.
    await supabaseClient
      .from(tableName)
      .delete()
      .eq("zona", zona)
      .eq("periodo", periodo);

    for (const archivo of archivosInput.files) {
      if (!archivo.type.includes("pdf")) continue;

      const nombreLimpio = limpiar(archivo.name);
      const zonaLimpia = limpiar(zona);

      // Ruta ordenada: Zona/Periodo/archivo.pdf
      const storagePath = `${zonaLimpia}/${periodo}/${Date.now()}_${nombreLimpio}`;

      const { error: uploadError } = await supabaseClient.storage
        .from(storageBucket)
        .upload(storagePath, archivo, { upsert: true, contentType: "application/pdf" });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabaseClient.storage
        .from(storageBucket)
        .getPublicUrl(storagePath);

      const { error: insertError } = await supabaseClient.from(tableName).insert([{
        archivo_nombre: archivo.name,
        archivo_url: publicData.publicUrl,
        storage_path: storagePath,
        zona,
        periodo,
        fecha: new Date().toISOString(),
      }]);

      if (insertError) throw insertError;
    }

    mostrarMensaje(null, "exito", `✅ Fichas subidas para ${zona} • ${periodo}.`);
    lista.textContent = "✅ Subida completada.";
    archivosInput.value = "";
    verFichasComerciales("admin");
  } catch (err) {
    console.error("❌ Error subiendo fichas:", err);
    mostrarMensaje(null, "error", "Error al subir las fichas comerciales.");
    lista.textContent = "❌ Error durante la subida.";
  }
}

// ====================================================
// 👁️ MOSTRAR / OCULTAR FICHAS (ADMIN)
// ====================================================
function toggleZonaFichasAdmin() {
  const zonaFichas = $("zona-fichas-admin");
  const boton = $("btn-ver-fichas-admin");
  if (!zonaFichas || !boton) return;

  const visible = !zonaFichas.classList.contains("hidden");
  zonaFichas.classList.toggle("hidden");
  boton.textContent = visible ? "👁️ Ver Fichas Comerciales" : "⬅️ Ocultar Fichas Comerciales";

  if (!visible) verFichasComerciales("admin");
}

// ====================================================
// 👥 CARGAR ASESORES ACTIVOS (ADMIN)
// ====================================================
async function cargarAsesoresParaCuentas() {
  const select = $("usuario-cuenta-admin");
  if (!select) return;

  try {
    const { data, error } = await supabaseClient.from("asesores").select("cedula, nombre, estado").order("nombre", { ascending: true });
    if (error) throw error;

    if (!data?.length) {
      select.innerHTML = `<option value="">⚠️ No hay asesores registrados</option>`;
      return;
    }

    select.innerHTML = `<option value="">-- Selecciona un asesor --</option>`;
    data.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.cedula;
      opt.textContent = `${a.nombre} (${a.cedula}) - ${a.estado}`;
      opt.style.color = a.estado === "Activo" ? "green" : a.estado === "Inactivo" ? "red" : "gray";
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargando asesores:", err);
    select.innerHTML = `<option value="">❌ Error al cargar asesores</option>`;
  }
}

// ====================================================
// 🧩 HELPERS GENERALES PARA AGRUPAR POR MES / PERIODO
// ====================================================
function obtenerPeriodoDesdeFecha(fechaStr) {
  if (!fechaStr) return "Sin mes";
  const iso = fechaStr.toString();
  // Si viene en formato ISO "YYYY-MM-DD..."
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    return iso.slice(0, 7); // YYYY-MM
  }
  const d = new Date(fechaStr);
  if (isNaN(d)) return "Sin mes";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function agruparPorPeriodo(lista, getPeriodo) {
  return lista.reduce((acc, item) => {
    const periodo = getPeriodo(item) || "Sin mes";
    if (!acc[periodo]) acc[periodo] = [];
    acc[periodo].push(item);
    return acc;
  }, {});
}

// ====================================================
// 💰 SUBIR CUENTAS DE COBRO (ADMIN)
// ====================================================
async function subirCuentasAdmin() {
  const mes = $("mes-cuenta-admin")?.value;
  const usuario = $("usuario-cuenta-admin")?.value;
  const archivos = $("cuentas-admin");
  const lista = $("lista-cuentas-admin");

  if (!mes || !usuario || !archivos?.files?.length)
    return mostrarMensaje(
      null,
      "error",
      "Completa el mes, usuario y selecciona archivos."
    );

  lista.textContent = "📤 Subiendo cuentas...";

  try {
    const bucket = "cuentas_cobro";
    const limpiar = (t) =>
      t
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");

    for (const archivo of archivos.files) {
      if (!archivo.type.includes("pdf")) continue;

      const nombreArchivo = `${usuario}_${mes}_${Date.now()}_${limpiar(
        archivo.name
      )}`;

      // 📤 Subir el archivo
      const { error: uploadError } = await supabaseClient.storage
        .from(bucket)
        .upload(nombreArchivo, archivo, { upsert: true });

      if (uploadError) throw uploadError;

      // 🌍 Obtener URL pública permanente
      const { data: publicData } = supabaseClient.storage
        .from(bucket)
        .getPublicUrl(nombreArchivo);

      const publicUrl = publicData.publicUrl;

      // Guardar en tabla cuentas_cobro
      const { error: insertError } = await supabaseClient.from(bucket).insert([
        {
          archivo_nombre: archivo.name,
          archivo_url: publicUrl,
          usuario,
          mes,
          fecha: new Date().toISOString(),
        },
      ]);

      if (insertError) throw insertError;
    }

    mostrarMensaje(null, "exito", "✅ Cuentas subidas correctamente.");
    lista.textContent = "✅ Subida completada.";
    archivos.value = "";
    verCuentasCobroAdmin();
  } catch (err) {
    console.error("❌ Error:", err);
    mostrarMensaje(null, "error", "Error al subir cuentas.");
  }
}

// ====================================================
// 🧩 Helpers (Periodo)
// ====================================================
function formatearPeriodo(yyyyMm) {
  // yyyyMm: "2026-01" -> "Enero 2026"
  if (!yyyyMm || !yyyyMm.includes("-")) return yyyyMm || "";
  const [y, m] = yyyyMm.split("-");
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const idx = parseInt(m, 10) - 1;
  return `${meses[idx] || m} ${y}`;
}

function obtenerPeriodoDesdeFecha(fechaISO) {
  // "2026-01-05T..." -> "2026-01"
  if (!fechaISO) return "";
  const d = new Date(fechaISO);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Agrupa un array por clave calculada
function agruparPorPeriodo(data, getKey) {
  return data.reduce((acc, item) => {
    const key = getKey(item) || "Sin periodo";
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

// ====================================================
// 📄 VER FICHAS AGRUPADAS (ADMIN / COMERCIAL) POR ZONA + PERIODO
// ====================================================
async function verFichasComerciales(modo = "comercial") {
  const esAdmin = modo === "admin";

  const contenedor = document.getElementById(
    esAdmin ? "contenedor-fichas-admin" : "contenedor-fichas"
  );
  const contador = document.getElementById(
    esAdmin ? "contador-fichas-admin" : "contador-fichas"
  );

  if (!contenedor) return;

  contenedor.classList.remove("hidden");
  contenedor.innerHTML = `
    <div class="text-center text-gray-500 py-6">
      <i class="fas fa-spinner fa-spin mr-2"></i> Cargando fichas...
    </div>`;
  if (contador) contador.textContent = "";

  try {
    // 🔹 Zona según modo
    const zonaSeleccionada = esAdmin
      ? $("zona-ficha-admin")?.value || "Nacionales"
      : $("zona-fichas-comercial")?.value || "Nacionales";

    // 🔹 Periodo según modo (input type="month")
    const periodoSeleccionado = esAdmin
      ? $("periodo-ficha-admin")?.value || ""
      : $("periodo-fichas-comercial")?.value || "";

    // 🔍 Consulta (ya traemos periodo + storage_path para eliminar bien)
    let query = supabaseClient
      .from("fichas_comerciales")
      .select("id, archivo_nombre, archivo_url, fecha, zona, periodo, storage_path")
      .order("periodo", { ascending: false })
      .order("fecha", { ascending: false });

    // ✅ Filtrar por zona
    if (zonaSeleccionada) query = query.eq("zona", zonaSeleccionada);

    // ✅ Filtrar por periodo (si eligieron)
    if (periodoSeleccionado) query = query.eq("periodo", periodoSeleccionado);

    const { data, error } = await query;
    if (error) throw error;

    if (!data?.length) {
      contenedor.innerHTML = `
        <div class="text-center text-gray-500 py-6">
          <i class="fas fa-info-circle mr-2"></i>
          No hay fichas disponibles para <strong>${zonaSeleccionada}</strong>
          ${periodoSeleccionado ? `en <strong>${formatearPeriodo(periodoSeleccionado)}</strong>` : ""}.
        </div>`;
      if (contador) {
        contador.textContent = "Mostrando 0 fichas.";
      }
      return;
    }

    // ✅ Asegurar periodo: si algún registro viejo no lo tiene, lo sacamos desde fecha
    const normalizadas = data.map((f) => ({
      ...f,
      periodo: f.periodo || obtenerPeriodoDesdeFecha(f.fecha),
    }));

    // ✅ Agrupar por periodo
    const fichasPorPeriodo = agruparPorPeriodo(normalizadas, (f) => f.periodo);
    const periodos = Object.keys(fichasPorPeriodo).sort().reverse();

    // Render común (admin/comercial)
    const renderCard = (f) => `
      <div class="card-ficha bg-white border rounded-xl p-5 shadow-sm hover:shadow-md text-center w-64">
        <i class="fas fa-file-pdf text-red-600 text-4xl mb-3"></i>

        <p class="font-semibold text-gray-800 mb-1 text-sm truncate" title="${f.archivo_nombre}">
          ${f.archivo_nombre}
        </p>

        <p class="text-xs text-gray-500 mb-3">
          ${f.fecha ? new Date(f.fecha).toLocaleDateString("es-CO") : ""}
        </p>

        <a href="${f.archivo_url}" target="_blank"
          class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-500 transition">
          Ver PDF
        </a>

        ${esAdmin
        ? `<button onclick="eliminarFichaAdmin(${JSON.stringify({
          id: f.id,
          archivo_nombre: f.archivo_nombre,
          zona: f.zona,
          archivo_url: f.archivo_url,
          storage_path: f.storage_path,
          periodo: f.periodo
        }).replace(/"/g, "&quot;")})"
              class="mt-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-500 transition">
              🗑️ Eliminar
            </button>`
        : ""
      }
      </div>
    `;

    // ✅ Render por periodo
    contenedor.innerHTML = periodos
      .map((periodo) => {
        const fichas = fichasPorPeriodo[periodo] || [];
        return `
          <div class="mb-10">
            <h4 class="text-xl font-bold text-blue-700 mb-4 border-b pb-1">
              📅 ${formatearPeriodo(periodo)} • Zona ${zonaSeleccionada}
            </h4>
            <div class="flex flex-wrap gap-6 ${esAdmin ? "" : "justify-center"}">
              ${fichas.map(renderCard).join("")}
            </div>
          </div>
        `;
      })
      .join("");

    if (contador) {
      contador.textContent = `Mostrando ${data.length} fichas de ${zonaSeleccionada}${periodoSeleccionado ? ` • ${formatearPeriodo(periodoSeleccionado)}` : ""}.`;
    }
  } catch (err) {
    console.error("❌ Error:", err);
    contenedor.innerHTML = `
      <div class="text-center text-red-600 py-6">
        <i class="fas fa-exclamation-triangle mr-2"></i>Error al cargar fichas.
      </div>`;
  }
}

// ====================================================
// 🔍 FILTRAR FICHAS COMERCIALES (ADMIN / COMERCIAL)
// ====================================================
function filtrarFichasComerciales(modo = "comercial") {
  const esAdmin = modo === "admin";

  const input = document.getElementById(esAdmin ? "buscar-fichas-admin" : "buscar-fichas");
  const contenedor = document.getElementById(esAdmin ? "contenedor-fichas-admin" : "contenedor-fichas");
  if (!input || !contenedor) return;

  const filtro = input.value.toLowerCase();
  const tarjetas = contenedor.querySelectorAll(".card-ficha");
  let visibles = 0;

  tarjetas.forEach((card) => {
    const texto = card.textContent.toLowerCase();
    if (texto.includes(filtro)) {
      card.style.display = "";
      visibles++;
    } else {
      card.style.display = "none";
    }
  });

  const contadorEl = document.getElementById(esAdmin ? "contador-fichas-admin" : "contador-fichas");
  if (contadorEl) {
    contadorEl.textContent = `Mostrando ${visibles} fichas filtradas.`;
  }
}

// ====================================================
// 🗑️ ELIMINAR FICHA COMERCIAL (ADMIN)
// ✅ Borra en BD y (si tienes Edge Function) borra en Storage
// ====================================================
async function eliminarFichaAdmin(payload) {
  // payload: { id, archivo_nombre, zona, archivo_url, storage_path, periodo }
  const { id, archivo_nombre, zona, storage_path } = payload || {};

  if (!id) return mostrarMensaje(null, "error", "No se encontró el ID del registro.");
  if (!confirm(`¿Seguro deseas eliminar la ficha "${archivo_nombre}" de ${zona}?`)) return;

  try {
    // 1) Borrar registro en BD
    const { error: dbErr } = await supabaseClient
      .from("fichas_comerciales")
      .delete()
      .eq("id", id);

    if (dbErr) throw dbErr;

    // 2) Intentar borrar archivo del bucket (⚠️ en tu caso FALLARÁ por policy)
    // Lo correcto: usar Edge Function con service_role.
    if (storage_path) {
      const { error: stErr } = await supabaseClient.storage
        .from("fichas_comerciales")
        .remove([storage_path]);

      if (stErr) {
        console.warn("⚠️ No se pudo borrar del bucket (policy). Recomendado Edge Function:", stErr);
      }
    }

    mostrarMensaje(null, "exito", "🗑️ Ficha eliminada correctamente.");
    verFichasComerciales("admin");
  } catch (err) {
    console.error("❌ Error al eliminar ficha:", err);
    mostrarMensaje(null, "error", "Error al eliminar la ficha comercial.");
  }
}


// ====================================================
// 💰 VER / ELIMINAR CUENTAS DE COBRO (ADMIN)
// ====================================================
async function verCuentasCobroAdmin() {
  const contenedor = $("contenedor-cuentas-admin");
  const contador = $("contador-cuentas-admin");
  contenedor.innerHTML = `<div class="text-center text-gray-500 py-6"><i class="fas fa-spinner fa-spin mr-2"></i> Cargando cuentas...</div>`;
  contador && (contador.textContent = "");

  try {
    const { data, error } = await supabaseClient
      .from("cuentas_cobro")
      .select("archivo_nombre, archivo_url, fecha, usuario, mes")
      .order("fecha", { ascending: false });
    if (error) throw error;
    if (!data?.length) {
      contenedor.innerHTML = `<div class="text-center text-gray-500 py-6"><i class="fas fa-info-circle mr-2"></i>No hay cuentas de cobro.</div>`;
      return;
    }

    // Agrupar por mes (campo mes viene de input tipo month o periodo)
    const cuentasPorMes = agruparPorPeriodo(data, (c) => c.mes || "Sin mes");
    const periodos = Object.keys(cuentasPorMes).sort().reverse();

    contenedor.innerHTML = periodos
      .map((periodo) => {
        const cuentasMes = cuentasPorMes[periodo];
        return `
        <div class="col-span-full mb-6">
          <h4 class="text-lg font-semibold text-gray-800 mb-3 border-b pb-1">
            📅 ${periodo}
          </h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            ${cuentasMes
            .map(
              (c) => `
              <div class="card-cuenta border rounded-lg p-4 shadow bg-white hover:shadow-md text-center">
                <i class="fas fa-file-invoice-dollar text-green-600 text-4xl mb-3"></i>
                <p class="text-sm font-medium mb-1 truncate" title="${c.archivo_nombre
                }">${c.archivo_nombre}</p>
                <p class="text-xs text-gray-500 mb-2">${c.usuario
                } • ${c.mes} • ${new Date(c.fecha).toLocaleDateString(
                  "es-CO"
                )}</p>
                <a href="${c.archivo_url
                }" target="_blank" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-500 transition">Ver / Descargar</a>
                <button onclick="eliminarCuentaAdmin('${c.archivo_nombre}', '${c.archivo_url
                }')" class="mt-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-500 transition">🗑️ Eliminar</button>
              </div>`
            )
            .join("")}
          </div>
        </div>`;
      })
      .join("");

    contador &&
      (contador.textContent = `Mostrando ${data.length} cuentas en total.`);
  } catch (err) {
    console.error("❌ Error:", err);
    contenedor.innerHTML = `<div class="text-center text-red-600 py-6"><i class="fas fa-exclamation-triangle mr-2"></i>Error al cargar cuentas.</div>`;
  }
}

async function eliminarCuentaAdmin(nombreArchivo, url) {
  if (!confirm(`¿Seguro deseas eliminar la cuenta "${nombreArchivo}"?`)) return;
  try {
    const bucket = "cuentas_cobro";
    const nombreEnBucket = decodeURIComponent(url.split("/").pop());
    await supabaseClient.storage.from(bucket).remove([nombreEnBucket]);
    await supabaseClient.from(bucket).delete().eq("archivo_url", url);
    mostrarMensaje(null, "exito", "🗑️ Cuenta eliminada correctamente.");
    verCuentasCobroAdmin();
  } catch (err) {
    console.error("❌ Error al eliminar cuenta:", err);
    mostrarMensaje(
      null,
      "error",
      "Error al eliminar la cuenta de cobro."
    );
  }
}

// ====================================================
// 📅 GENERAR AÑOS Y MOSTRAR CUENTAS (ASESOR)
// ====================================================
document.addEventListener("DOMContentLoaded", () => {
  const selectAnio = $("anio-cuenta");
  if (!selectAnio) return;
  const anioActual = new Date().getFullYear();
  selectAnio.innerHTML = `<option value="">-- Selecciona un año --</option>`;
  for (let y = anioActual - 1; y <= anioActual + 2; y++) {
    selectAnio.innerHTML += `<option value="${y}">${y}</option>`;
  }
  selectAnio.value = anioActual;
});

async function mostrarCuentasPorMes() {
  const anio = $("anio-cuenta")?.value;
  const mes = $("mes-cuenta")?.value;
  const contenedor = $("contenedor-cuentas");
  const cedula = localStorage.getItem("usuario_cedula");
  if (!cedula) {
    contenedor.innerHTML = `<div class="text-red-500 text-center mt-4">⚠️ No se detectó la cédula del usuario actual.</div>`;
    return;
  }
  if (!anio || !mes) {
    contenedor.innerHTML = `<div class="text-gray-500 text-center mt-4">Selecciona un año y un mes para ver tus cuentas.</div>`;
    return;
  }

  const periodo = `${anio}-${mes}`;
  contenedor.innerHTML = `<div class="text-gray-500 text-center mt-4 italic">Cargando cuentas de cobro de ${periodo}...</div>`;

  try {
    const { data, error } = await supabaseClient
      .from("cuentas_cobro")
      .select("*")
      .eq("usuario", cedula)
      .eq("mes", periodo)
      .order("fecha", { ascending: false });
    if (error) throw error;

    contenedor.innerHTML = data.length
      ? data
        .map(
          (c) => `
        <div class="p-4 bg-white border rounded-xl shadow-sm hover:shadow-md transition text-center">
          <i class="fas fa-file-invoice-dollar text-green-600 text-4xl mb-2"></i>
          <p class="font-semibold text-gray-800 text-sm truncate mb-1">${c.archivo_nombre
            }</p>
          <p class="text-xs text-gray-500 mb-3">${new Date(
              c.fecha
            ).toLocaleDateString("es-CO")}</p>
          <a href="${c.archivo_url
            }" target="_blank" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition">Ver / Descargar</a>
        </div>`
        )
        .join("")
      : `<div class="text-gray-500 text-center mt-4"><i class="fas fa-info-circle mr-1"></i>No hay cuentas de cobro registradas para ${periodo}.</div>`;
  } catch (err) {
    console.error("❌ Error al cargar cuentas:", err);
    contenedor.innerHTML = `<div class="text-red-500 text-center mt-4">Error al cargar las cuentas de cobro.</div>`;
  }
}

// ====================================================
// 📤 SUBIR CUENTA DE COBRO (ASESOR / COMERCIAL)
// ====================================================
async function subirCuentaDeCobroAsesor() {
  const cedula = localStorage.getItem("usuario_cedula");
  const nombre = localStorage.getItem("userName");
  const anio = $("anio-cuenta")?.value;
  const mes = $("mes-cuenta")?.value;

  if (!cedula || !nombre) {
    mostrarMensaje(
      null,
      "error",
      "⚠️ No se detectó la información del usuario."
    );
    return;
  }

  if (!anio || !mes) {
    mostrarMensaje(
      null,
      "error",
      "Selecciona el año y el mes antes de subir la cuenta."
    );
    return;
  }

  const periodo = `${anio}-${mes}`;
  const archivoInput = document.createElement("input");
  archivoInput.type = "file";
  archivoInput.accept = ".pdf";

  archivoInput.onchange = async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;

    if (!archivo.type.includes("pdf")) {
      mostrarMensaje(null, "error", "Solo se permiten archivos PDF.");
      return;
    }

    try {
      const bucket = "cuentas_cobro";
      const limpiar = (t) =>
        t
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");

      const nombreArchivo = `${cedula}_${periodo}_${Date.now()}_${limpiar(
        archivo.name
      )}`;

      // 🔍 Buscar si existe una cuenta previa del mismo mes
      const { data: existentes, error: consultaError } = await supabaseClient
        .from(bucket)
        .select("id, archivo_url")
        .eq("usuario", cedula)
        .eq("mes", periodo)
        .limit(1);

      if (consultaError) throw consultaError;

      // 📤 Subir archivo nuevo
      const { error: uploadError } = await supabaseClient.storage
        .from(bucket)
        .upload(nombreArchivo, archivo, { upsert: true });

      if (uploadError) throw uploadError;

      // 🌍 Obtener URL pública permanente
      const { data: publicData } = supabaseClient.storage
        .from(bucket)
        .getPublicUrl(nombreArchivo);

      const nuevaURL = publicData.publicUrl;

      // 🟦 SI YA EXISTE → reemplazar
      if (existentes && existentes.length > 0) {
        const id = existentes[0].id;

        // Extraer nombre real del archivo viejo
        let archivoViejo = existentes[0].archivo_url.split("/").pop();

        // Intentar eliminar archivo viejo
        if (archivoViejo) {
          await supabaseClient.storage.from(bucket).remove([archivoViejo]);
        }

        // Actualizar registro
        const { error: updateError } = await supabaseClient
          .from(bucket)
          .update({
            archivo_nombre: archivo.name,
            archivo_url: nuevaURL,
            fecha: new Date().toISOString(),
            nombre_asesor: nombre,
          })
          .eq("id", id);

        if (updateError) throw updateError;

        mostrarMensaje(
          null,
          "exito",
          "♻️ Cuenta de cobro actualizada correctamente."
        );
      }

      // 🟩 SI NO EXISTE → insertar
      else {
        const { error: insertError } = await supabaseClient.from(bucket).insert([
          {
            usuario: cedula,
            nombre_asesor: nombre,
            mes: periodo,
            archivo_nombre: archivo.name,
            archivo_url: nuevaURL,
            fecha: new Date().toISOString(),
          },
        ]);

        if (insertError) throw insertError;

        mostrarMensaje(
          null,
          "exito",
          "✅ Cuenta de cobro subida correctamente."
        );
      }

      mostrarCuentasPorMes();
    } catch (err) {
      console.error("❌ Error al subir cuenta:", err);
      mostrarMensaje(
        null,
        "error",
        "Error al subir o reemplazar la cuenta de cobro."
      );
    }
  };

  archivoInput.click();
}

// ====================================================
// 🧭 PANEL COMERCIAL - NAVEGACIÓN
// ====================================================
function abrirVista(vistaId) {
  ["vista-principal", "vista-fichas", "vista-cuentas", "vista-simulador"].forEach((id) =>
    document.getElementById(id)?.classList.add("hidden")
  );
  document.getElementById(vistaId)?.classList.remove("hidden");
  const menu = $("menu-principal-comercial");
  vistaId === "vista-principal"
    ? menu?.classList.remove("hidden")
    : menu?.classList.add("hidden");
}
function volverAlMenu() {
  ["vista-fichas", "vista-cuentas", "vista-simulador"].forEach((id) =>
    document.getElementById(id)?.classList.add("hidden")
  );
  $("vista-principal")?.classList.remove("hidden");
  document
    .getElementById("menu-principal-comercial")
    ?.classList.remove("hidden");
}

// 🧍‍♂️ --- GESTIÓN DE USUARIOS ADMIN ---
async function cargarUsuarios() {
  const tbody = $("usuarios-tbody");
  if (!tbody) return;

  tbody.innerHTML =
    "<tr><td colspan='4' class='text-gray-500 py-4'>Cargando...</td></tr>";

  try {
    const { data, error } = await supabaseClient
      .from("usuarios")
      .select("*")
      .order("nombre_completo", { ascending: true });

    if (error) throw error;

    if (!data || !data.length) {
      tbody.innerHTML =
        "<tr><td colspan='4' class='text-gray-500 py-4'>No hay usuarios registrados.</td></tr>";
      return;
    }

    tbody.innerHTML = data
      .map(
        (u) => `
        <tr>
          <td class="border px-3 py-2">${u.cedula || u.usuario || "-"}</td>
          <td class="border px-3 py-2">${u.nombre_completo || "-"}</td>
          <td class="border px-3 py-2 capitalize">${u.rol || "-"}</td>
          <td class="border px-3 py-2">
            <button onclick='editarUsuario(${JSON.stringify(
          u
        )})' class="text-blue-600 hover:underline mr-2">Editar</button>
            <button onclick='eliminarUsuario("${u.id
          }")' class="text-red-600 hover:underline">Eliminar</button>
          </td>
        </tr>`
      )
      .join("");
  } catch (err) {
    console.error("Error cargando usuarios:", err);
    tbody.innerHTML =
      "<tr><td colspan='4' class='text-red-500 py-4'>Error al cargar los usuarios</td></tr>";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if ($("usuarios-tbody")) cargarUsuarios();
});

// ✏️ --- Editar usuario ---
function editarUsuario(usuario) {
  $("usuario-id").value = usuario.id;
  $("usuario-cedula").value =
    usuario.usuario || usuario.cedula || "";
  $("usuario-nombre").value =
    usuario.nombre_completo || "";
  $("usuario-password").value = usuario.contraseña || "";
  $("usuario-rol").value = usuario.rol || "comercial";

  $("cancelar-edicion").classList.remove("hidden");
  qs("#form-usuario button[type='submit']").textContent =
    "Actualizar Usuario";
}

// 🔙 Cancelar edición
$("cancelar-edicion").addEventListener("click", () => {
  $("form-usuario").reset();
  $("usuario-id").value = "";
  $("cancelar-edicion").classList.add("hidden");
  qs("#form-usuario button[type='submit']").textContent =
    "Guardar Usuario";
});

// 💾 --- Guardar o actualizar usuario ---
document
  .getElementById("form-usuario")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = $("usuario-id").value.trim();
    const nuevoUsuario = {
      usuario: $("usuario-cedula").value.trim(),
      nombre_completo: $("usuario-nombre").value.trim(),
      contraseña: $("usuario-password").value.trim(),
      rol: $("usuario-rol").value,
    };

    if (
      !nuevoUsuario.usuario ||
      !nuevoUsuario.nombre_completo ||
      !nuevoUsuario.contraseña
    ) {
      mostrarMensaje(
        null,
        "error",
        "Por favor completa todos los campos obligatorios."
      );
      return;
    }

    try {
      let res;
      if (id) {
        res = await supabaseClient.from("usuarios").update(nuevoUsuario).eq("id", id);
      } else {
        res = await supabaseClient.from("usuarios").insert([nuevoUsuario]);
      }

      if (res.error) throw res.error;

      mostrarMensaje(null, "exito", "✅ Usuario guardado correctamente.");
      $("form-usuario").reset();
      $("usuario-id").value = "";
      $("cancelar-edicion").classList.add("hidden");
      qs(
        "#form-usuario button[type='submit']"
      ).textContent = "Guardar Usuario";

      await cargarUsuarios();
    } catch (err) {
      console.error("Error guardando usuario:", err);
      mostrarMensaje(null, "error", "❌ Error al guardar usuario.");
    }
  });

// 🗑️ --- Eliminar usuario ---
async function eliminarUsuario(id) {
  if (!confirm("¿Seguro que deseas eliminar este usuario?")) return;

  try {
    const { error } = await supabaseClient.from("usuarios").delete().eq("id", id);
    if (error) throw error;

    mostrarMensaje(null, "exito", "✅ Usuario eliminado correctamente.");
    await cargarUsuarios();
  } catch (err) {
    console.error("Error eliminando usuario:", err);
    mostrarMensaje(null, "error", "❌ Error al eliminar usuario.");
  }

}

// 📤 Exportar tabla de Asesores a Excel
document
  .getElementById("exportarExcelAsesores")
  .addEventListener("click", exportarExcelAsesores);

function exportarExcelAsesores() {
  try {
    const tbody = $("asesores-table-body");
    if (!tbody) {
      mostrarMensaje(
        null,
        "error",
        "No se encontró la tabla de asesores en el documento."
      );
      return;
    }

    const filas = tbody.querySelectorAll("tr");

    if (
      !filas.length ||
      (filas.length === 1 &&
        filas[0].textContent.toLowerCase().includes("no hay asesores"))
    ) {
      mostrarMensaje(null, "error", "No hay asesores para exportar.");
      return;
    }

    const tablaOriginal = tbody.closest("table");
    if (!tablaOriginal) {
      mostrarMensaje(
        null,
        "error",
        "No se encontró la tabla completa de asesores."
      );
      return;
    }

    // 🧱 Clonar tabla sin alterar la original
    const tablaClon = tablaOriginal.cloneNode(true);

    // 🟩 REEMPLAZAR el contenido de la columna ESTADO por la opción seleccionada
    const filasClon = tablaClon.querySelectorAll("tbody tr");

    filasClon.forEach((fila) => {
      const celdas = fila.querySelectorAll("td");

      // La columna ESTADO es la 5 (index 4)
      const estadoTd = celdas[4];
      if (!estadoTd) return;

      const select = estadoTd.querySelector("select");
      if (select) {
        const textoSeleccionado =
          select.options[select.selectedIndex]?.text || "";
        estadoTd.textContent = textoSeleccionado; // ← Limpia y coloca solo el seleccionado
      }
    });

    // 🔹 Eliminar la columna "Acciones" (última)
    tablaClon
      .querySelectorAll("th:last-child, td:last-child")
      .forEach((el) => el.remove());

    // 📋 Crear hoja desde la tabla corregida
    const hoja = XLSX.utils.table_to_sheet(tablaClon, {
      raw: true,
      cellDates: true,
    });

    // 📏 Ajustar ancho de columnas
    const rango = XLSX.utils.decode_range(hoja["!ref"]);
    const colWidths = [];
    for (let C = rango.s.c; C <= rango.e.c; ++C) {
      let max = 10;
      for (let R = rango.s.r; R <= rango.e.r; ++R) {
        const celda = hoja[XLSX.utils.encode_cell({ r: R, c: C })];
        if (celda && celda.v != null) {
          const len = celda.v.toString().length;
          if (len > max) max = len;
        }
      }
      colWidths.push({ wch: max + 2 });
    }
    hoja["!cols"] = colWidths;

    // 📘 Crear libro y agregar hoja
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Asesores");

    // 📅 Nombre del archivo
    const nombreArchivo = `Asesores_Credibank_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    // 💾 Descargar Excel
    XLSX.writeFile(libro, nombreArchivo);

    mostrarMensaje(
      null,
      "exito",
      "✅ Asesores exportados correctamente a Excel."
    );
  } catch (error) {
    console.error("Error al exportar asesores:", error);
    mostrarMensaje(
      null,
      "error",
      "❌ Ocurrió un error al exportar los asesores a Excel."
    );
  }
}

// ====================================================
// ====================================================
// 📢 PUBLICIDAD / BANNERS (ADMIN + SLIDER EN INICIO/COMERCIAL)
// ====================================================

const PUB_TABLE = "publicidad_banners";
const PUB_BUCKET = "publicidad_banners";
const PUB_SLIDE_MS = 8000; // 8 segundos

// Helper: hoy en YYYY-MM-DD
function hoyISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Decide si un banner está vigente según fechas opcionales
function bannerVigente(b) {
  const hoy = hoyISO();
  if (b?.fecha_inicio && hoy < b.fecha_inicio) return false;
  if (b?.fecha_fin && hoy > b.fecha_fin) return false;
  return true;
}

function isVideoUrl(url = "") {
  const u = (url || "").toLowerCase();
  return u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".ogg");
}

// Render HTML (un slide)
function renderBannerSlideHTML(banner) {
  if (!banner) return "";

  const safeTitle = (banner.titulo || "Publicidad").replaceAll('"', "");

  const titulo = banner.titulo
    ? `<div class="text-sm font-semibold text-gray-700 mb-2 text-center">
         ${banner.titulo}
       </div>`
    : "";

  const mediaUrl = banner.imagen_url;

  // 👉 CLAVE: sin height fija + object-contain
  const mediaClass =
    "w-full max-w-md md:max-w-lg max-h-[460px] h-auto object mx-auto " +
    "rounded-xl shadow-md ring-1 ring-black/5";

  const media = isVideoUrl(mediaUrl)
    ? `
      <video
        src="${mediaUrl}"
        class="${mediaClass}"
        autoplay muted playsinline preload="metadata"
      ></video>
    `
    : `
      <img
        src="${mediaUrl}"
        alt="${safeTitle}"
        class="${mediaClass}"
        loading="lazy"
      />
    `;

  return banner.enlace
    ? `
      <a href="${banner.enlace}" target="_blank" rel="noopener noreferrer"
         class="block hover:opacity-95 transition">
        <div class="flex flex-col items-center gap-1">
          ${titulo}
          ${media}
        </div>
      </a>
    `
    : `
      <div class="flex flex-col items-center gap-1">
        ${titulo}
        ${media}
      </div>
    `;
}

// Slider (evita múltiples timers)
window.__pubTimers = window.__pubTimers || { inicio: null, comercial: null };

function startPublicidadSlider(container, items, key) {
  if (!container) return;

  // detener timer anterior
  if (window.__pubTimers[key]) {
    clearInterval(window.__pubTimers[key]);
    window.__pubTimers[key] = null;
  }

  if (!items?.length) {
    container.innerHTML = "";
    return;
  }

  let i = 0;

  const paint = () => {
    const b = items[i];
    container.innerHTML = renderBannerSlideHTML(b);

    // intentar reproducir si es video
    const v = container.querySelector("video");
    if (v) v.play().catch(() => { });

    i = (i + 1) % items.length;
  };

  paint();
  window.__pubTimers[key] = setInterval(paint, PUB_SLIDE_MS);
}

// Pinta en ambos contenedores según ubicación (SLIDER)
async function cargarYRenderPublicidad() {
  try {
    const { data, error } = await supabaseClient
      .from(PUB_TABLE)
      .select("id,titulo,imagen_url,enlace,ubicacion,activo,orden,fecha_inicio,fecha_fin,created_at")
      .eq("activo", true)
      .order("orden", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const vigente = (data || []).filter(bannerVigente);

    const itemsInicio = vigente.filter(
      (b) => b.ubicacion === "inicio" || b.ubicacion === "ambos"
    );
    const itemsComercial = vigente.filter(
      (b) => b.ubicacion === "comercial" || b.ubicacion === "ambos"
    );

    const cInicio = $("banner-publicidad-inicio");
    const cComercial = $("banner-publicidad-comercial");

    startPublicidadSlider(cInicio, itemsInicio, "inicio");
    startPublicidadSlider(cComercial, itemsComercial, "comercial");
  } catch (err) {
    console.warn("⚠️ No se pudo cargar publicidad:", err);
  }
}

// ===============================
// ✅ ADMIN: subir banner (imagen o video) + listar/activar/eliminar
// ===============================

async function subirPublicidadAdmin() {
  const estado = $("estado-publicidad-admin");

  const titulo = $("pub-titulo-admin")?.value?.trim() || "";
  const enlace = $("pub-enlace-admin")?.value?.trim() || "";
  const ubicacion = $("pub-ubicacion-admin")?.value || "ambos";
  const orden = Number($("pub-orden-admin")?.value || 0);
  const fecha_inicio = $("pub-fecha-inicio-admin")?.value || null;
  const fecha_fin = $("pub-fecha-fin-admin")?.value || null;
  const activo = !!$("pub-activo-admin")?.checked;

  const fileInput = $("pub-imagen-admin");
  if (!fileInput?.files?.length) {
    if (estado) estado.textContent = "⚠️ Debes seleccionar una imagen o video.";
    return;
  }

  const file = fileInput.files[0];
  const isOk = [
    "image/jpeg", "image/png", "image/webp",
    "video/mp4", "video/webm", "video/ogg"
  ].includes(file.type);

  if (!isOk) {
    if (estado) estado.textContent = "⚠️ Formato inválido. Usa JPG/PNG/WebP o MP4/WebM/OGG.";
    return;
  }

  try {
    if (estado) estado.textContent = "⏳ Subiendo banner...";

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(PUB_BUCKET)
      .upload(storagePath, file, { upsert: true, contentType: file.type });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient.storage
      .from(PUB_BUCKET)
      .getPublicUrl(storagePath);

    const imagen_url = publicData?.publicUrl;
    if (!imagen_url) throw new Error("No se pudo obtener publicUrl del banner.");

    const { error: insertError } = await supabaseClient.from(PUB_TABLE).insert([{
      titulo,
      enlace: enlace || null,
      ubicacion,
      orden,
      activo,
      fecha_inicio,
      fecha_fin,
      imagen_url, // aquí guardamos tanto imagen como video
    }]);

    if (insertError) throw insertError;

    if (estado) estado.textContent = "✅ Banner publicado.";

    // limpiar
    const t = $("pub-titulo-admin");
    const e = $("pub-enlace-admin");
    const o = $("pub-orden-admin");
    const fi = $("pub-fecha-inicio-admin");
    const ff = $("pub-fecha-fin-admin");

    if (t) t.value = "";
    if (e) e.value = "";
    if (o) o.value = "0";
    if (fi) fi.value = "";
    if (ff) ff.value = "";
    fileInput.value = "";

    await verPublicidadAdmin();
    await cargarYRenderPublicidad();
  } catch (err) {
    console.error("❌ Error publicando banner:", err);
    if (estado) estado.textContent = "❌ Error publicando el banner.";
  }
}

// ADMIN: listar banners
async function cargarPublicidadAdmin() {
  const cont = $("contenedor-publicidad-admin");
  const contador = $("contador-publicidad-admin");
  if (!cont) return;

  cont.innerHTML = `<div class="text-center text-gray-500 py-6"><i class="fas fa-spinner fa-spin mr-2"></i> Cargando banners...</div>`;
  if (contador) contador.textContent = "";

  try {
    const { data, error } = await supabaseClient
      .from(PUB_TABLE)
      .select("id,titulo,imagen_url,enlace,ubicacion,activo,orden,fecha_inicio,fecha_fin,created_at")
      .order("orden", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (contador) contador.textContent = `${(data || []).length} banners`;

    if (!data?.length) {
      cont.innerHTML = `<div class="text-center text-gray-500 py-6"><i class="fas fa-info-circle mr-2"></i> No hay banners.</div>`;
      return;
    }

    cont.innerHTML = data.map((b) => {
      const vigente = bannerVigente(b);
      const preview = isVideoUrl(b.imagen_url)
        ? `<video src="${b.imagen_url}" class="w-full h-32 object-cover rounded-lg mb-3" muted playsinline></video>`
        : `<img src="${b.imagen_url}" class="w-full h-32 object-cover rounded-lg mb-3" />`;

      return `
        <div class="card-publicidad border rounded-xl p-3 bg-white">
          ${preview}
          <div class="text-sm font-semibold text-gray-800">${b.titulo || "Sin título"}</div>
          <div class="text-xs text-gray-500 mt-1">
            Ubicación: <b>${b.ubicacion}</b> • Orden: <b>${b.orden}</b>
          </div>
          <div class="text-xs mt-1 ${vigente ? "text-green-700" : "text-red-600"}">
            ${vigente ? "Vigente" : "Fuera de fechas"} • Estado: ${b.activo ? "Activo" : "Inactivo"}
          </div>

          <div class="mt-3 flex gap-2">
            <button class="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-500"
              onclick="eliminarPublicidadAdmin(${b.id})">
              🗑️ Eliminar
            </button>
            <button class="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-300"
              onclick="togglePublicidadActiva(${b.id}, ${b.activo ? "true" : "false"})">
              ${b.activo ? "🚫 Desactivar" : "✅ Activar"}
            </button>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("❌ Error cargando publicidad admin:", err);
    cont.innerHTML = `<div class="text-center text-red-600 py-6"><i class="fas fa-exclamation-triangle mr-2"></i> Error cargando banners.</div>`;
  }
}

// ADMIN: activar/desactivar
async function togglePublicidadActiva(id, actual) {
  try {
    const { error } = await supabaseClient
      .from(PUB_TABLE)
      .update({ activo: !actual })
      .eq("id", id);

    if (error) throw error;

    await cargarPublicidadAdmin();
    await cargarYRenderPublicidad();
  } catch (err) {
    console.error("❌ Error toggle publicidad:", err);
    mostrarMensaje(null, "error", "No se pudo cambiar el estado del banner.");
  }
}

// ADMIN: eliminar (solo DB)
async function eliminarPublicidadAdmin(id) {
  if (!confirm("¿Seguro deseas eliminar este banner?")) return;

  try {
    const { error } = await supabaseClient.from(PUB_TABLE).delete().eq("id", id);
    if (error) throw error;

    await cargarPublicidadAdmin();
    await cargarYRenderPublicidad();
  } catch (err) {
    console.error("❌ Error eliminando banner:", err);
    mostrarMensaje(null, "error", "No se pudo eliminar el banner.");
  }
}

// Alias que tu HTML llama
async function verPublicidadAdmin() {
  await cargarPublicidadAdmin();
}

// Filtro de búsqueda (usa .card-publicidad)
function filtrarPublicidadAdmin() {
  const input = $("buscar-publicidad-admin");
  const contenedor = $("contenedor-publicidad-admin");
  if (!input || !contenedor) return;

  const filtro = input.value.toLowerCase();
  const cards = contenedor.querySelectorAll(".card-publicidad");
  let visibles = 0;

  cards.forEach((card) => {
    const texto = card.textContent.toLowerCase();
    const ok = texto.includes(filtro);
    card.style.display = ok ? "" : "none";
    if (ok) visibles++;
  });

  const contador = $("contador-publicidad-admin");
  if (contador) contador.textContent = `Mostrando ${visibles} banners.`;
}

function volverAlPanelAdminOperativo(tab = "perfilamiento") {
  const role = getUserRole?.() || null;

  // Si es admin u operativo, vuelve al panel de control
  if (role === "admin" || role === "operativo") {
    showSection("admin");          // 👈 clave: cambia sección visible
    showAdminPanel();              // muestra panel según rol (admin/operativo)
    window.location.hash = "admin";

    // Opcional: dejar una pestaña activa al volver
    qs(`.admin-tab-btn[data-tab="${tab}"]`)?.click();
    return;
  }

  // Si es comercial u otro, vuelve a inicio (ajusta si quieres otro destino)
  showSection("inicio");
  window.location.hash = "inicio";
}

// 👇 Esto asegura que el onclick del HTML SIEMPRE la encuentre
window.volverAlPanelAdminOperativo = volverAlPanelAdminOperativo;


// =====================================================================
// ✅ MEJORA PROFESIONAL (OPCIÓN A): Créditos por bloques + Resumen server
// - No carga todo al inicio
// - Filtros consultan por API (Vercel) con range (bloques)
// - Totales de columnas (Aprobado/Pagado/etc) vienen de /api/creditos_resumen
// =====================================================================

// DOM ready helper (evita repetir DOMContentLoaded)
function onReady(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn, { once: true });
}

// Ejecuta init solo una vez por llave
const __once = new Set();
function runOnce(key, fn) {
  if (__once.has(key)) return;
  __once.add(key);
  return fn();
}

// Estado para "cargar más"
const __creditosUI = {
  pageSize: 100,
  offset: 0,
  total: 0,
  hasMore: false,
  loading: false,
  filtrosKey: "",
};

// Elementos UI (si existen)
function __getCreditosUIEls() {
  return {
    tbody: $("solicitudes-table-body-creditos"),
    empty: $("no-solicitudes-creditos"),
    btnMore: $("btn-creditos-cargar-mas"),
    pageSizeSel: $("creditos-page-size"),
    mostrando: $("creditos-mostrando"),
    totalClientes: $("total-clientes-filtrados"),
    tMontoSolicitado: $("total-monto-solicitado"),
    tMontoRetanqueo: $("total-monto-retanqueo"),
    tAprobLib: $("total-aprobado-libranza"),
    tPagLib: $("total-pagado-libranza"),
    tReajLib: $("total-reajuste-libranza"),
    tAprobCred: $("total-aprobado-credivillas"),
    tPagCred: $("total-pagado-credivillas"),
    tAprobHip: $("total-aprobado-hipotecario"),
    tPagHip: $("total-pagado-hipotecario"),
    tAprobTC: $("total-aprobado-tc"),
    tTarjAct: $("total-tarjetas-activadas"),
  };
}

// Construye filtros actuales (usa tus controles existentes)
function __buildCreditosFiltros() {
  const filtroTexto = (inputBuscarCreditos?.value || "").trim();
  const filtroCedulaNumero = (inputCedulaNumero?.value || "").trim();

  const entidades = getSelectValues("filtro-entidad");
  const anios = getSelectValues("filtro-anio");
  const meses = getSelectValues("filtro-mes");
  const lineas = getSelectValues("filtro-linea");
  const etapas = getSelectValues("filtro-etapa");
  const operativos = getSelectValues("filtro-operativo");
  const oficinas = getSelectValues("filtro-oficina");

  const resultado = ($("filtro-resultado")?.value || "").trim();
  const coordinador = ($("filtro-coordinador")?.value || "").trim();
  const ejecutivo = ($("filtro-ejecutivo")?.value || "").trim();

  return {
    q: filtroTexto || "",
    q2: filtroCedulaNumero || "",
    entidad: entidades,
    anio: anios,
    mes: meses,
    linea: lineas,
    etapa: etapas,
    operativo: operativos,
    oficina: oficinas,
    resultado: resultado || "",
    coordinador: coordinador || "",
    ejecutivo: ejecutivo || "",
  };
}

function __filtersKey(f) {
  // clave estable para saber si cambiaron filtros
  return JSON.stringify(f);
}

function __toParams(filters, extra = {}) {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.q2) p.set("q2", filters.q2);

  const putArr = (k, arr) => {
    if (Array.isArray(arr) && arr.length) p.set(k, arr.join(","));
  };

  putArr("entidad", filters.entidad);
  putArr("anio", filters.anio);
  putArr("mes", filters.mes);
  putArr("linea", filters.linea);
  putArr("etapa", filters.etapa);
  putArr("operativo", filters.operativo);
  putArr("oficina", filters.oficina);

  if (filters.resultado) p.set("resultado", filters.resultado);
  if (filters.coordinador) p.set("coordinador", filters.coordinador);
  if (filters.ejecutivo) p.set("ejecutivo", filters.ejecutivo);

  Object.entries(extra).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    p.set(k, String(v));
  });

  return p;
}

// Inicialización 1 vez (llenar selects, TomSelect, restaurar filtros)
async function initCreditosTabOnce() {
  await runOnce("creditos:init", async () => {
    // Estos métodos ya existen en tu script original
    if (typeof llenarCoordinadoresFiltro === "function") await llenarCoordinadoresFiltro();
    if (typeof llenarEjecutivosFiltro === "function") await llenarEjecutivosFiltro();
    if (typeof llenarEtapasFiltro === "function") await llenarEtapasFiltro();
    if (typeof llenarOficinasFiltro === "function") await llenarOficinasFiltro();

    if (typeof initCreditosMultiSelects === "function") initCreditosMultiSelects();

    const filtrosGuardados = (typeof cargarFiltrosDesdeMemoria === "function")
      ? cargarFiltrosDesdeMemoria()
      : null;

    if (filtrosGuardados && typeof restaurarFiltrosGuardados === "function") {
      restaurarFiltrosGuardados(filtrosGuardados);
    }

    // Enlazar UI de "cargar más" una sola vez
    onReady(() => {
      const els = __getCreditosUIEls();
      if (els.pageSizeSel) {
        els.pageSizeSel.addEventListener("change", () => {
          __creditosUI.pageSize = Number(els.pageSizeSel.value || 100) || 100;
          aplicarFiltrosCreditos(); // recarga con nuevo bloque
        });
      }
      if (els.btnMore) {
        els.btnMore.addEventListener("click", () => {
          cargarMasCreditos();
        });
      }
    });
  });
}

// Llama tu API de Vercel: /api/creditos (filas por bloques)
async function __fetchCreditosBloque({ reset = false } = {}) {
  const els = __getCreditosUIEls();
  if (!els.tbody) return;

  if (__creditosUI.loading) return;
  __creditosUI.loading = true;

  try {
    const filtros = __buildCreditosFiltros();
    const key = __filtersKey(filtros);

    if (reset || key !== __creditosUI.filtrosKey) {
      __creditosUI.filtrosKey = key;
      __creditosUI.offset = 0;
      __creditosUI.total = 0;
      __creditosUI.hasMore = false;
      els.tbody.innerHTML = "";
    }

    const params = __toParams(filtros, {
      offset: __creditosUI.offset,
      limit: __creditosUI.pageSize,
    });

    const res = await fetch(`/api/creditos?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      console.error("❌ /api/creditos error:", data);
      return;
    }

    const rows = data.rows || [];
    __creditosUI.total = Number(data.total || 0);
    __creditosUI.hasMore = !!data.hasMore;

    if (!rows.length && __creditosUI.offset === 0) {
      els.tbody.innerHTML = "";
      els.empty?.classList.remove("hidden");
    } else {
      els.empty?.classList.add("hidden");
      els.tbody.insertAdjacentHTML("beforeend", rows.map((c) => renderFilaCredito(c)).join(""));
    }

    __creditosUI.offset += rows.length;

    // UI mostrar
    if (els.totalClientes) els.totalClientes.textContent = __creditosUI.total.toLocaleString("es-CO");
    if (els.mostrando) els.mostrando.textContent =
      `${__creditosUI.offset.toLocaleString("es-CO")} de ${__creditosUI.total.toLocaleString("es-CO")}`;

    if (els.btnMore) {
      els.btnMore.disabled = !__creditosUI.hasMore;
    }
  } catch (e) {
    console.error("⚠️ Error cargando bloque de créditos:", e);
  } finally {
    __creditosUI.loading = false;
  }
}

// Llama tu API de resumen: /api/creditos_resumen (totales reales del filtro)
async function __fetchResumenCreditos() {
  const els = __getCreditosUIEls();
  const filtros = __buildCreditosFiltros();
  const params = __toParams(filtros);

  try {
    const res = await fetch(`/api/creditos_resumen?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      console.error("❌ /api/creditos_resumen error:", data);
      return;
    }

    // Totales monetarios (usa tu formatCurrency existente)
    const safeNum = (v) => (v === null || v === undefined || v === "") ? 0 : Number(v) || 0;
    if (els.tMontoSolicitado) els.tMontoSolicitado.textContent = formatCurrency(safeNum(data.monto_solicitado));
    if (els.tMontoRetanqueo) els.tMontoRetanqueo.textContent = formatCurrency(safeNum(data.monto_retanqueo));
    if (els.tAprobLib) els.tAprobLib.textContent = formatCurrency(safeNum(data.monto_aprobado_libranza));
    if (els.tPagLib) els.tPagLib.textContent = formatCurrency(safeNum(data.monto_pagado_libranza));
    if (els.tReajLib) els.tReajLib.textContent = formatCurrency(safeNum(data.monto_pendiente_libranza));
    if (els.tAprobCred) els.tAprobCred.textContent = formatCurrency(safeNum(data.monto_aprobado_credivillas));
    if (els.tPagCred) els.tPagCred.textContent = formatCurrency(safeNum(data.monto_pagado_credivillas));
    if (els.tAprobHip) els.tAprobHip.textContent = formatCurrency(safeNum(data.monto_aprobado_hipotecario));
    if (els.tPagHip) els.tPagHip.textContent = formatCurrency(safeNum(data.monto_pagado_hipotecario));
    if (els.tAprobTC) els.tAprobTC.textContent = formatCurrency(safeNum(data.monto_aprobado_tarjeta));
    if (els.tTarjAct) els.tTarjAct.textContent = (safeNum(data.numero_tarjetas_activadas)).toLocaleString("es-CO");

    // Total clientes filtrados (servidor)
    if (els.totalClientes) {
      const total = Number(data.total_clientes ?? __creditosUI.total ?? 0) || 0;
      els.totalClientes.textContent = total.toLocaleString("es-CO");
    }
  } catch (e) {
    console.error("⚠️ Error cargando resumen de créditos:", e);
  }
}

// ✅ Override profesional: al aplicar filtros no consultamos todo, sino bloque + resumen
async function aplicarFiltrosCreditos() {
  // Guardar filtros si ya tienes esa función
  try {
    if (typeof guardarFiltrosEnMemoria === "function") guardarFiltrosEnMemoria();
  } catch { }

  // Reset + primer bloque + resumen
  await __fetchCreditosBloque({ reset: true });
  await __fetchResumenCreditos();
}

// ✅ Cargar créditos cuando se entra a la pestaña (solo primer bloque)
async function cargarCreditos() {
  await initCreditosTabOnce();

  // Config pageSize desde selector si existe
  onReady(() => {
    const els = __getCreditosUIEls();
    if (els.pageSizeSel) __creditosUI.pageSize = Number(els.pageSizeSel.value || 100) || 100;
  });

  await aplicarFiltrosCreditos();
}

// ✅ Botón "Cargar más"
async function cargarMasCreditos() {
  await __fetchCreditosBloque({ reset: false });
}

// ✅ Anula el cálculo DOM de totales (ahora vienen del servidor)
function actualizarTotalesCreditos() {
  // No-op: Totales se actualizan con __fetchResumenCreditos()
}

// =====================================================================
// FIN Opción A
// =====================================================================


/* =========================
   SIMULADOR COMERCIAL / ADMIN
   FIX: soporte para múltiples simuladores con mismos IDs
========================= */

const SIMULADOR_STATE = {
  loaded: false,
  maestro: null,
  convenioMap: new Map(),
  capdesMap: new Map(),
  metodologiaMap: new Map(),
  holguraEspecialMap: new Map(),
  ultimoResultado: null,
};

// =========================
// Helpers de scope
// =========================
function simGetRoots() {
  return Array.from(document.querySelectorAll("[data-sim-root]"));
}

function simEsVisible(el) {
  if (!el) return false;
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function simGetRootActivo() {
  const roots = simGetRoots();
  return roots.find((r) => simEsVisible(r) && !r.classList.contains("hidden")) || roots[0] || null;
}

function simGetEl(id, root = null) {
  const scope = root || simGetRootActivo();
  return scope ? scope.querySelector(`#${id}`) : null;
}

function simSetText(id, value, root = null) {
  const el = simGetEl(id, root);
  if (el) el.textContent = value ?? "";
}

function simSetValue(id, value, root = null) {
  const el = simGetEl(id, root);
  if (el) el.value = value ?? "";
}

// =========================
// Utilidades base
// =========================
function simNormalizarTexto(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function simToNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const limpio = String(v).replace(/[^\d.-]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

function simParseMonto(input) {
  if (input == null) return 0;

  let texto = String(input).trim();
  if (!texto) return 0;

  texto = texto.replace(/\s+/g, "");

  if (!/^[0-9+\-().,]+$/.test(texto)) {
    return 0;
  }

  texto = texto.replace(/,/g, "");

  try {
    const resultado = Function(`"use strict"; return (${texto})`)();
    return Number.isFinite(resultado) ? resultado : 0;
  } catch {
    return 0;
  }
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(simToNumber(valor));
}

function formatearPorcentaje(valorDecimal) {
  return `${(simToNumber(valorDecimal) * 100).toFixed(2)}%`;
}

function evaluarOperacion(valor) {
  if (!valor) return 0;

  let texto = valor.toString().replace(/\s+/g, "");

  if (!/^[0-9+\-*/().,]+$/.test(texto)) {
    return Number(texto) || 0;
  }

  texto = texto.replace(/,/g, "");

  try {
    const resultado = Function(`"use strict"; return (${texto})`)();
    return Number.isFinite(resultado) ? resultado : 0;
  } catch {
    return Number(texto) || 0;
  }
}

function resolverInputOperacion(inputId) {
  const input = simGetEl(inputId);
  if (!input) return;

  const resultado = evaluarOperacion(input.value);
  input.value = resultado;

  const root = input.closest("[data-sim-root]");
  recalcularSimulador(root);
}

function mostrarAlertaSimulador(msg = "", root = null) {
  const el = simGetEl("simulador-alerta", root);
  if (!el) return;

  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }

  el.textContent = msg;
  el.classList.remove("hidden");
}

function ocultarResultadoSimulador(root = null) {
  const box = simGetEl("resultado-simulador", root);
  if (box) box.classList.add("hidden");
}

// =========================
// Carga de maestro
// =========================
async function cargarMaestroSimulador() {
  if (SIMULADOR_STATE.loaded && SIMULADOR_STATE.maestro) {
    return SIMULADOR_STATE.maestro;
  }

  const rutas = [
    "./data/simulador_maestro.json",
    "/data/simulador_maestro.json",
    "data/simulador_maestro.json",
  ];

  let ultimoError = null;

  for (const ruta of rutas) {
    try {
      console.log("🔎 Intentando cargar simulador desde:", ruta);

      const resp = await fetch(`${ruta}?v=${Date.now()}`, {
        cache: "no-store",
      });

      console.log("📦 Respuesta simulador:", ruta, resp.status, resp.url);

      if (!resp.ok) {
        ultimoError = new Error(`No se pudo cargar ${ruta} (${resp.status})`);
        continue;
      }

      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("json")) {
        const texto = await resp.text();
        throw new Error(
          `La ruta ${ruta} respondió algo que no es JSON. Inicio: ${texto.slice(0, 120)}`
        );
      }

      const maestro = await resp.json();

      SIMULADOR_STATE.maestro = maestro;
      SIMULADOR_STATE.convenioMap = new Map();
      SIMULADOR_STATE.capdesMap = new Map();
      SIMULADOR_STATE.metodologiaMap = new Map();
      SIMULADOR_STATE.holguraEspecialMap = new Map();

      (maestro.convenios || []).forEach((conv) => {
        const key = simNormalizarTexto(conv.nombre);
        if (key) SIMULADOR_STATE.convenioMap.set(key, conv);
      });

      (maestro.capdes || []).forEach((row) => {
        const clave = row?.clave ?? row?.subconvenio ?? row?.codigo;
        if (clave !== undefined && clave !== null && clave !== "") {
          SIMULADOR_STATE.capdesMap.set(String(clave), row);
        }
      });

      (maestro.metodologia || []).forEach((row) => {
        const codigo = row?.codigo ?? row?.metodologia ?? row?.id;
        if (codigo !== undefined && codigo !== null && codigo !== "") {
          SIMULADOR_STATE.metodologiaMap.set(Number(codigo), row);
        }
      });

      (maestro.holguras_especiales || []).forEach((row) => {
        if (row?.codigo !== undefined && row?.codigo !== null && row?.codigo !== "") {
          SIMULADOR_STATE.holguraEspecialMap.set(Number(row.codigo), row);
        }
      });

      SIMULADOR_STATE.loaded = true;
      console.log("✅ Maestro del simulador cargado correctamente desde:", ruta);

      return maestro;
    } catch (error) {
      console.error("❌ Falló ruta simulador:", ruta, error);
      ultimoError = error;
    }
  }

  throw ultimoError || new Error("No se pudo cargar simulador_maestro.json");
}

// =========================
// Poblado de campos
// =========================
function poblarConveniosSimulador(root = null) {
  const dataList = simGetEl("lista-convenios-simulador", root);
  if (!dataList || !SIMULADOR_STATE.maestro) return;

  dataList.innerHTML = "";
  (SIMULADOR_STATE.maestro.convenios || []).forEach((conv) => {
    const option = document.createElement("option");
    option.value = conv.nombre || "";
    dataList.appendChild(option);
  });
}

function poblarPlazosSimulador(root = null) {
  const select = simGetEl("sim-plazo", root);
  if (!select) return;

  const actual = select.value;
  select.innerHTML = `<option value="">Seleccione plazo</option>`;

  for (let i = 1; i <= 144; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = String(i);
    select.appendChild(option);
  }

  if (actual) select.value = actual;
}

// =========================
// Reglas negocio
// =========================
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return 0;

  const fn = new Date(fechaNacimiento);
  if (Number.isNaN(fn.getTime())) return 0;

  const hoy = new Date();
  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();

  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) {
    edad--;
  }

  return edad < 0 ? 0 : edad;
}

function obtenerFactorSeguro(edad) {
  if (edad >= 18 && edad <= 50) return 0.000885;
  if (edad <= 60) return 0.001144;
  if (edad <= 70) return 0.001181;
  if (edad <= 75) return 0.003455;
  if (edad <= 80) return 0.007123;
  if (edad > 80) return 0.01172;
  return 0;
}

function teaAMensual(tea) {
  const t = simToNumber(tea);
  if (t <= 0) return 0;
  return Math.pow(1 + t, 1 / 12) - 1;
}

function obtenerConvenioPorNombre(nombre) {
  const key = simNormalizarTexto(nombre);
  if (!key) return null;
  return SIMULADOR_STATE.convenioMap.get(key) || null;
}

function esConvenioConCuentaNomina(convenio) {
  const nombre = simNormalizarTexto(convenio?.nombre || "");
  return nombre.includes("colpensiones") || nombre.includes("fopep");
}

function obtenerTasaEA(tasaIngresada, cuentaNomina, seguro, convenio) {
  const tasaBasePct = simToNumber(tasaIngresada);

  if (!tasaBasePct || tasaBasePct <= 0) {
    throw new Error("Debe ingresar la tasa base de interés.");
  }

  const cuentaNominaNorm = simNormalizarTexto(cuentaNomina);
  const seguroNorm = simNormalizarTexto(seguro);
  const aplicaCuentaNomina = esConvenioConCuentaNomina(convenio);

  const ajusteNominaPct =
    aplicaCuentaNomina && cuentaNominaNorm === "no" ? 1.5 : 0;

  const ajusteSeguroPct = seguroNorm === "no" ? 0.5 : 0;

  const tasaFinalPct = tasaBasePct + ajusteNominaPct + ajusteSeguroPct;

  return {
    tasaBasePct,
    ajusteNominaPct,
    ajusteSeguroPct,
    tasaFinalPct,
    tasaEA: tasaFinalPct / 100,
    aplicaCuentaNomina,
  };
}

function calcularDescuentosLey({
  actividad,
  ingreso,
  codigoConvenio,
  otrosDescuentosLey = 0,
  retefuenteReal = 0
}) {
  const ingresoNum = simToNumber(ingreso);
  const otrosLey = simToNumber(otrosDescuentosLey);
  const reteReal = simToNumber(retefuenteReal);

  const parametros = SIMULADOR_STATE.maestro?.parametros || {};
  const smmlv = simToNumber(parametros.smmlv);
  const uvt = simToNumber(parametros.uvt);

  const conveniosPensionado4 = [
    10001618,
    10001841,
    10001114,
    10051001,
    10001698,
    10051056
  ];

  let salud = 0;
  let pension = 0;
  let solidaridad = 0;
  let retefuenteCalculada = 0;

  const act = simNormalizarTexto(actividad);
  const codigo = Number(codigoConvenio);

  if (act === "empleado") {
    salud = ingresoNum * 0.04;
    pension = ingresoNum * 0.04;
  } else if (act === "pensionado") {
    if (conveniosPensionado4.includes(codigo)) {
      salud = ingresoNum * 0.04;
    } else if (ingresoNum <= smmlv) {
      salud = ingresoNum * 0.04;
    } else if (ingresoNum <= smmlv * 3) {
      salud = ingresoNum * 0.10;
    } else {
      salud = ingresoNum * 0.12;
    }
  }

  if (act === "empleado") {
    if (ingresoNum >= smmlv * 4 && ingresoNum <= smmlv * 20) {
      solidaridad = ingresoNum * 0.01;
    } else if (ingresoNum > smmlv * 20) {
      solidaridad = ingresoNum * 0.02;
    }
  } else if (act === "pensionado") {
    if (ingresoNum >= smmlv * 10 && ingresoNum <= smmlv * 20) {
      solidaridad = ingresoNum * 0.01;
    } else if (ingresoNum > smmlv * 20) {
      solidaridad = ingresoNum * 0.02;
    }
  }

  if (act === "empleado" && ingresoNum >= 7231380) {
    retefuenteCalculada = ingresoNum * 0.10;
  }

  if (act === "pensionado" && uvt > 0 && ingresoNum >= uvt * 1000) {
    retefuenteCalculada = ingresoNum * 0.10;
  }

  let retefuenteFinal = retefuenteCalculada;

  if (reteReal > 0) {
    retefuenteFinal = Math.min(retefuenteCalculada, reteReal);
  }

  const total = salud + pension + solidaridad + retefuenteFinal + otrosLey;

  return {
    salud,
    pension,
    solidaridad,
    retefuenteCalculada,
    retefuenteReal: reteReal,
    retefuente: retefuenteFinal,
    otrosDescuentosLey: otrosLey,
    total
  };
}

function obtenerCapDesRow(codigoConvenio, actividad) {
  const sufijo = simNormalizarTexto(actividad) === "pensionado" ? "1" : "2";
  const claves = [
    `${codigoConvenio}-${sufijo}`,
    `${codigoConvenio}_${sufijo}`,
    `${codigoConvenio}${sufijo}`,
    String(codigoConvenio),
  ];

  for (const clave of claves) {
    if (SIMULADOR_STATE.capdesMap.has(String(clave))) {
      return SIMULADOR_STATE.capdesMap.get(String(clave));
    }
  }

  return null;
}

function obtenerFactorProteccion(capDesRow) {
  return (
    simToNumber(capDesRow?.factor_proteccion) ||
    simToNumber(capDesRow?.factorProteccion) ||
    simToNumber(capDesRow?.proteccion) ||
    0.15
  );
}

function obtenerFactorAjuste(capDesRow) {
  return (
    simToNumber(capDesRow?.factor_ajuste) ||
    simToNumber(capDesRow?.factorAjuste) ||
    1
  );
}

function normalizarSalariosProtegidos(valor) {
  const n = simToNumber(valor);
  if (n > 10) return n / 100;
  return n;
}

function obtenerSalariosProtegidos(capDesRow, convenio) {
  const desdeCapdes =
    normalizarSalariosProtegidos(
      capDesRow?.salarios_protegidos ??
      capDesRow?.salariosProtegidos
    );

  const desdeConvenio = simToNumber(convenio?.smlmv);
  return Math.max(desdeCapdes, desdeConvenio, 0);
}

function obtenerHolguraBase(convenio) {
  return simToNumber(convenio?.holgura_base);
}

function obtenerMesesGracia(convenio, compraCartera) {
  const compra = simNormalizarTexto(compraCartera);
  if (compra === "sí" || compra === "si") {
    return simToNumber(convenio?.meses_gracia_compra);
  }
  return simToNumber(convenio?.meses_gracia);
}

function calcularProteccionSalarial({
  ingreso,
  descuentosLey,
  factorProteccion,
  salariosProtegidos,
  smmlv
}) {
  const ingresoNetoParcial = simToNumber(ingreso) - simToNumber(descuentosLey);

  const salariosProt = simToNumber(salariosProtegidos);
  const valorSmmlv = simToNumber(smmlv);
  const factorProt = simToNumber(factorProteccion);

  const proteccionPorSmmlv =
    salariosProt > 0 && valorSmmlv > 0
      ? salariosProt * valorSmmlv
      : 0;

  const proteccionPorFactor =
    factorProt > 0
      ? ingresoNetoParcial * factorProt
      : 0;

  return Math.max(0, proteccionPorSmmlv, proteccionPorFactor);
}

function calcularCapacidadDescuento({
  ingreso,
  descuentosLey,
  descuentosNomina,
  holgura,
  factorProteccion,
  factorAjuste,
  salariosProtegidos,
  smmlv
}) {
  const ingresoNetoParcial = simToNumber(ingreso) - simToNumber(descuentosLey);

  const proteccionSalarial = calcularProteccionSalarial({
    ingreso,
    descuentosLey,
    factorProteccion,
    salariosProtegidos,
    smmlv
  });

  const totalEgresos =
    proteccionSalarial +
    simToNumber(descuentosNomina) +
    simToNumber(holgura);

  const ingresoDisponible = ingresoNetoParcial - totalEgresos;

  const cuotaMaxima = Math.max(
    0,
    ingresoDisponible * simToNumber(factorAjuste || 1)
  );

  return {
    proteccionSalarial,
    totalEgresos,
    ingresoDisponible,
    cuotaMaxima,
  };
}

function calcularMontoMaximo({
  cuotaMaxima,
  plazo,
  tasaEA,
  edad,
  incluirSeguro,
  mesesGracia = 0,
}) {
  const cuota = simToNumber(cuotaMaxima);
  const n = simToNumber(plazo);
  const i = teaAMensual(tasaEA);
  const g = simToNumber(mesesGracia);
  const factorSeguro = incluirSeguro ? obtenerFactorSeguro(edad) : 0;

  if (cuota <= 0 || n <= 0 || i <= 0) return 0;

  const factorAmortizacion = i / (1 - Math.pow(1 + i, -n));

  const divisor =
    (1 + (i * (g + 1)) + (factorSeguro * (g + 1))) * factorAmortizacion +
    factorSeguro;

  if (divisor <= 0) return 0;

  const monto = cuota / divisor;
  return Math.max(0, monto);
}

function calcularCuotaDesdeMonto({
  monto,
  plazo,
  tasaEA,
  edad,
  incluirSeguro,
  mesesGracia = 0,
}) {
  const P = simToNumber(monto);
  const n = simToNumber(plazo);
  const i = teaAMensual(tasaEA);
  const g = simToNumber(mesesGracia);
  const factorSeguro = incluirSeguro ? obtenerFactorSeguro(edad) : 0;

  if (P <= 0 || n <= 0 || i <= 0) {
    return {
      cuotaTotal: 0,
      cuotaCredito: 0,
      seguroMensual: 0,
      capitalAjustado: 0,
    };
  }

  const capitalAjustado =
    P * (1 + (i * (g + 1)) + (factorSeguro * (g + 1)));

  const factorAmortizacion = i / (1 - Math.pow(1 + i, -n));

  const cuotaCredito = capitalAjustado * factorAmortizacion;
  const seguroMensual = P * factorSeguro;
  const cuotaTotal = cuotaCredito + seguroMensual;

  return {
    cuotaTotal,
    cuotaCredito,
    seguroMensual,
    capitalAjustado,
  };
}

// =========================
// Lectura / cálculo scoped
// =========================
function obtenerInputsSimulador(root = null) {
  return {
    convenioNombre: simGetEl("sim-convenio", root)?.value || "",
    actividad: simGetEl("sim-actividad", root)?.value || "",
    ingresoPrincipal: simParseMonto(simGetEl("sim-ingreso", root)?.value),
    compraCartera: simGetEl("sim-compra-cartera", root)?.value || "No",
    cuentaNomina: simGetEl("sim-cuenta-nomina", root)?.value || "Sí",
    seguro: simGetEl("sim-seguro", root)?.value || "Sí",
    fechaNacimiento: simGetEl("sim-fecha-nacimiento", root)?.value || "",
    descuentosNomina: simParseMonto(simGetEl("sim-descuentos-nomina", root)?.value),
    otrosDescuentosLey: simParseMonto(simGetEl("sim-otros-desc-ley", root)?.value),
    retefuenteReal: simToNumber(simGetEl("sim-retefuente-real", root)?.value),
    plazo: simToNumber(simGetEl("sim-plazo", root)?.value),
    tasa: simToNumber(simGetEl("sim-tasa", root)?.value)
  };
}

function simularOferta(datos) {
  const maestro = SIMULADOR_STATE.maestro;
  if (!maestro) {
    throw new Error("El maestro del simulador aún no está cargado.");
  }

  const convenio = obtenerConvenioPorNombre(datos.convenioNombre);
  if (!convenio) {
    throw new Error("No se encontró el convenio seleccionado.");
  }

  const codigoConvenio = Number(convenio.codigo);
  const edad = calcularEdad(datos.fechaNacimiento);
  const tasaInfo = obtenerTasaEA(
    datos.tasa,
    datos.cuentaNomina,
    datos.seguro,
    convenio
  );

  const tasaEA = tasaInfo.tasaEA;
  const tasaMV = teaAMensual(tasaEA);

  const descuentosLey = calcularDescuentosLey({
    actividad: datos.actividad,
    ingreso: datos.ingresoPrincipal,
    codigoConvenio,
    otrosDescuentosLey: datos.otrosDescuentosLey,
    retefuenteReal: datos.retefuenteReal
  });

  const capDesRow = obtenerCapDesRow(codigoConvenio, datos.actividad);
  const factorProteccion = obtenerFactorProteccion(capDesRow);
  const factorAjuste = obtenerFactorAjuste(capDesRow);
  const salariosProtegidos = obtenerSalariosProtegidos(capDesRow, convenio);

  const smmlv = simToNumber(maestro?.parametros?.smmlv);
  const holgura = obtenerHolguraBase(convenio);
  const mesesGracia = obtenerMesesGracia(convenio, datos.compraCartera);

  const capacidad = calcularCapacidadDescuento({
    ingreso: datos.ingresoPrincipal,
    descuentosLey: descuentosLey.total,
    descuentosNomina: datos.descuentosNomina,
    holgura,
    factorProteccion,
    factorAjuste,
    salariosProtegidos,
    smmlv
  });

  const incluirSeguro =
    simNormalizarTexto(datos.seguro) === "si" ||
    simNormalizarTexto(datos.seguro) === "sí";

  const montoMaximo = calcularMontoMaximo({
    cuotaMaxima: capacidad.cuotaMaxima,
    plazo: datos.plazo,
    tasaEA,
    edad,
    incluirSeguro: true, // ✅ siempre reserva el factor seguro para que "Sin seguro" no dé más monto
    mesesGracia,
  });

  return {
    convenio: convenio.nombre || "",
    codigoConvenio,
    actividad: datos.actividad,
    ingresoPrincipal: simToNumber(datos.ingresoPrincipal),
    edad,
    plazo: simToNumber(datos.plazo),
    seguro: datos.seguro,
    tasaEA,
    tasaMV,
    tasaEAPorcentaje: formatearPorcentaje(tasaEA),
    tasaMVPorcentaje: formatearPorcentaje(tasaMV),

    tasaBasePct: tasaInfo.tasaBasePct,
    ajusteNominaPct: tasaInfo.ajusteNominaPct,
    ajusteSeguroPct: tasaInfo.ajusteSeguroPct,
    tasaFinalPct: tasaInfo.tasaFinalPct,
    aplicaCuentaNomina: tasaInfo.aplicaCuentaNomina,

    descuentosLey,
    descuentosNomina: simToNumber(datos.descuentosNomina),
    holgura,
    mesesGracia,
    cuotaMaxima: capacidad.cuotaMaxima,
    montoMaximo,
    proteccionSalarial: capacidad.proteccionSalarial,
    ingresoDisponible: capacidad.ingresoDisponible,
    totalEgresos: capacidad.totalEgresos,
    factorProteccion,
    factorAjuste
  };
}

function actualizarValorSolicitado(resultado, root = null) {
  const input = simGetEl("sim-valor-solicitado", root);
  const cuotaEl = simGetEl("res-cuota-solicitada", root);

  if (!input || !cuotaEl || !resultado) return;

  const montoMaximo = simToNumber(resultado.montoMaximo);
  const cuotaMaxima = simToNumber(resultado.cuotaMaxima);

  input.max = Math.floor(montoMaximo);
  input.min = 0;
  input.step = 1000;

  let valorSolicitado = simToNumber(input.value);

  if (!valorSolicitado || valorSolicitado <= 0) {
    valorSolicitado = montoMaximo;
    input.value = Math.floor(montoMaximo);
  }

  if (valorSolicitado > montoMaximo) {
    valorSolicitado = montoMaximo;
    input.value = Math.floor(montoMaximo);
    mostrarAlertaSimulador("El valor solicitado no puede superar el valor máximo a ofrecer.", root);
  } else {
    mostrarAlertaSimulador("", root);
  }

  const incluirSeguro =
    simNormalizarTexto(resultado.seguro) === "si" ||
    simNormalizarTexto(resultado.seguro) === "sí";

  const cuotaInfo = calcularCuotaDesdeMonto({
    monto: valorSolicitado,
    plazo: resultado.plazo,
    tasaEA: resultado.tasaEA,
    edad: resultado.edad,
    incluirSeguro,
    mesesGracia: resultado.mesesGracia,
  });

  let cuotaFinal = cuotaInfo.cuotaTotal;

  if (cuotaFinal > cuotaMaxima) {
    cuotaFinal = cuotaMaxima;
    mostrarAlertaSimulador("La cuota del valor solicitado supera la capacidad máxima permitida.", root);
  }

  cuotaEl.textContent = formatearMoneda(cuotaFinal);
}

function mostrarResultadoSimulador(resultado, root = null) {
  const box = simGetEl("resultado-simulador", root);
  if (!box) return;

  SIMULADOR_STATE.ultimoResultado = resultado;

  const tasaEA = resultado.tasaEAPorcentaje || "0%";
  const tasaMV = resultado.tasaMVPorcentaje || "0%";

  simSetText("res-tasa", `${tasaEA} EA`, root);
  simSetText("res-tasa-mv-card", `${tasaMV} MV`, root);
  simSetText("res-tasa-mv", tasaMV, root);

  simSetText("res-desc-ley", formatearMoneda(resultado.descuentosLey?.total || 0), root);
  simSetText("res-cuota-max", formatearMoneda(resultado.cuotaMaxima || 0), root);
  simSetText("res-monto-max", formatearMoneda(resultado.montoMaximo || 0), root);
  simSetText("res-monto-max-edicion", formatearMoneda(resultado.montoMaximo || 0), root);
  simSetText("res-convenio", resultado.convenio || "", root);
  simSetText("res-codigo", resultado.codigoConvenio || "", root);
  simSetText("res-edad", `${resultado.edad || 0} años`, root);
  simSetText("res-holgura", formatearMoneda(resultado.holgura || 0), root);
  simSetText("res-salud", formatearMoneda(resultado.descuentosLey?.salud || 0), root);
  simSetText("res-pension", formatearMoneda(resultado.descuentosLey?.pension || 0), root);
  simSetText("res-solidaridad", formatearMoneda(resultado.descuentosLey?.solidaridad || 0), root);
  simSetText("res-retefuente-calculada", formatearMoneda(resultado.descuentosLey?.retefuenteCalculada || 0), root);
  simSetText("res-retefuente-real", formatearMoneda(resultado.descuentosLey?.retefuenteReal || 0), root);
  simSetText("res-retefuente", formatearMoneda(resultado.descuentosLey?.retefuente || 0), root);
  simSetText("res-otros-desc-ley", formatearMoneda(resultado.descuentosLey?.otrosDescuentosLey || 0), root);
  simSetText("res-total-desc-ley", formatearMoneda(resultado.descuentosLey?.total || 0), root);
  simSetText("res-descuentos-nomina", formatearMoneda(resultado.descuentosNomina || 0), root);
  simSetText("res-tasa-base", `${simToNumber(resultado.tasaBasePct).toFixed(2)}%`, root);
  simSetText(
    "res-ajuste-nomina",
    resultado.aplicaCuentaNomina
      ? `${simToNumber(resultado.ajusteNominaPct).toFixed(2)}%`
      : "No aplica",
    root
  );
  simSetText("res-ajuste-seguro", `${simToNumber(resultado.ajusteSeguroPct).toFixed(2)}%`, root);

  const valorSolicitadoInput = simGetEl("sim-valor-solicitado", root);
  if (valorSolicitadoInput) {
    valorSolicitadoInput.value = Math.floor(resultado.montoMaximo || 0);
  }

  actualizarValorSolicitado(resultado, root);
  box.classList.remove("hidden");
}

function recalcularSimulador(root = null) {
  try {
    mostrarAlertaSimulador("", root);

    const datos = obtenerInputsSimulador(root);

    if (
      !datos.convenioNombre ||
      !datos.actividad ||
      !datos.ingresoPrincipal ||
      !datos.fechaNacimiento ||
      !datos.plazo ||
      !datos.tasa
    ) {
      ocultarResultadoSimulador(root);
      return;
    }

    const resultado = simularOferta(datos);
    mostrarResultadoSimulador(resultado, root);
  } catch (error) {
    console.error("❌ Error recalculando simulador:", error);
    ocultarResultadoSimulador(root);
    mostrarAlertaSimulador(error.message || "No se pudo calcular la simulación.", root);
  }
}

function limpiarSimulador(root = null) {
  const campos = {
    "sim-convenio": "",
    "sim-actividad": "Empleado",
    "sim-ingreso": "",
    "sim-compra-cartera": "No",
    "sim-cuenta-nomina": "Sí",
    "sim-seguro": "Sí",
    "sim-fecha-nacimiento": "",
    "sim-otros-desc-ley": "0",
    "sim-descuentos-nomina": "0",
    "sim-retefuente-real": "0",
    "sim-plazo": "",
    "sim-tasa": ""
  };

  Object.entries(campos).forEach(([id, valor]) => {
    const el = simGetEl(id, root);
    if (el) el.value = valor;
  });

  const valorSolicitadoInput = simGetEl("sim-valor-solicitado", root);
  if (valorSolicitadoInput) valorSolicitadoInput.value = "";

  const cuotaSolicitadaEl = simGetEl("res-cuota-solicitada", root);
  if (cuotaSolicitadaEl) cuotaSolicitadaEl.textContent = "$0";

  SIMULADOR_STATE.ultimoResultado = null;
  mostrarAlertaSimulador("", root);
  ocultarResultadoSimulador(root);
}

function enlazarEventosSimulador(root = null) {
  const scope = root || simGetRootActivo();
  if (!scope || scope.dataset.simBound === "true") return;

  const ids = [
    "sim-convenio",
    "sim-actividad",
    "sim-ingreso",
    "sim-compra-cartera",
    "sim-cuenta-nomina",
    "sim-seguro",
    "sim-fecha-nacimiento",
    "sim-otros-desc-ley",
    "sim-descuentos-nomina",
    "sim-retefuente-real",
    "sim-plazo",
    "sim-tasa"
  ];

  ids.forEach((id) => {
    const el = simGetEl(id, scope);
    if (!el) return;

    el.addEventListener("input", () => recalcularSimulador(scope));
    el.addEventListener("change", () => recalcularSimulador(scope));
  });

  const inputValorSolicitado = simGetEl("sim-valor-solicitado", scope);
  if (inputValorSolicitado) {
    const recalcularValorSolicitado = () => {
      if (SIMULADOR_STATE.ultimoResultado) {
        actualizarValorSolicitado(SIMULADOR_STATE.ultimoResultado, scope);
      }
    };

    inputValorSolicitado.addEventListener("input", recalcularValorSolicitado);
    inputValorSolicitado.addEventListener("change", recalcularValorSolicitado);
  }

  const btnLimpiar = simGetEl("btn-limpiar-simulador", scope);
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", () => limpiarSimulador(scope));
  }

  scope.dataset.simBound = "true";
}

async function initSimuladorComercial(root = null) {
  try {
    await cargarMaestroSimulador();

    if (root) {
      poblarConveniosSimulador(root);
      poblarPlazosSimulador(root);
      enlazarEventosSimulador(root);
    } else {
      simGetRoots().forEach((r) => {
        poblarConveniosSimulador(r);
        poblarPlazosSimulador(r);
        enlazarEventosSimulador(r);
      });
    }

    console.log("✅ Simulador inicializado");
  } catch (error) {
    console.error("No se pudo inicializar el simulador:", error);

    if (root) {
      mostrarAlertaSimulador(
        "No se pudo cargar el simulador. Verifica el archivo data/simulador_maestro.json.",
        root
      );
    } else {
      simGetRoots().forEach((r) => {
        mostrarAlertaSimulador(
          "No se pudo cargar el simulador. Verifica el archivo data/simulador_maestro.json.",
          r
        );
      });
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSimuladorComercial();
});

/******************************************************
 * COMISIONES - ACTUALIZADO COMPLETO
 ******************************************************/

let __comisionesCache = [];
window.__comisionesDetalleCache = window.__comisionesDetalleCache || [];
let cacheAsesoresComision = null;

const MESES_COMISION = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};

const ETAPAS_VALIDAS_COMISION = [
  "Desembolsado",
  "Contabilización Aceptado",
  "Contabilizacion Aceptado",
  "Contabilización Pendiente",
  "Contabilizacion Pendiente"
];

const TARIFAS_ESPECIALES_LIBRANZA_AV_VILLAS = {
  "jan carlos sierra gonzalez": {
    limite: 300,
    conSeguro: { hasta: 12000, mas: 13000 },
    sinSeguro: { hasta: 11000, mas: 12000 }
  },
  "daniel alberto chica delgado": {
    limite: 300,
    conSeguro: { hasta: 12000, mas: 13000 },
    sinSeguro: { hasta: 11000, mas: 12000 }
  },
  "jean nicholl orozco castro": {
    limite: 300,
    conSeguro: { hasta: 12000, mas: 13000 },
    sinSeguro: { hasta: 11000, mas: 12000 }
  },
  "leonor maria carmona baron": {
    limite: 300,
    conSeguro: { hasta: 12000, mas: 13000 },
    sinSeguro: { hasta: 11000, mas: 12000 }
  },
  "arnold david florez solano": {
    limite: 300,
    conSeguro: { hasta: 12000, mas: 13000 },
    sinSeguro: { hasta: 11000, mas: 12000 }
  },
  "valor confianza": {
    limite: 1500,
    conSeguro: { hasta: 13000, mas: 13000 },
    sinSeguro: { hasta: 12000, mas: 12000 }
  }
};

const TARIFAS_ESPECIALES_CREDIVILLAS_AV_VILLAS = {
  "daniel alberto chica delgado": {
    rangos: [
      { min: 1, max: 100, valor: 11500 },
      { min: 101, max: 200, valor: 12500 },
      { min: 201, max: 300, valor: 13500 },
      { min: 301, max: Infinity, valor: 14500 }
    ]
  },
  "jean nicholl orozco castro": {
    rangos: [
      { min: 1, max: 100, valor: 11500 },
      { min: 101, max: 200, valor: 12500 },
      { min: 201, max: 300, valor: 13500 },
      { min: 301, max: Infinity, valor: 14500 }
    ]
  },
  "valor confianza": {
    rangos: [
      { min: 1, max: 100, valor: 12500 },
      { min: 101, max: 200, valor: 13500 },
      { min: 201, max: 300, valor: 15000 },
      { min: 301, max: 500, valor: 16500 },
      { min: 501, max: Infinity, valor: 18000 }
    ]
  }
};

const TARIFAS_POR_MILLON = {
  bancien: 25000,
  crezcamos: 25000,
  mission: 25000,
  finexus: 40000,
  valorenz: 25000,
  lagobo: 25000
};

// Tarifas especiales por asesor / ejecutivo comercial
const TARIFAS_ESPECIALES_CREDITO_POR_MILLON = {
  crezcamos: {
    "jean nicholl orozco castro": 30000
  }
};

const TARIFAS_ESPECIALES_TARJETAS = {
  "valor confianza": 60000
};

function limpiarTextoComision(valor = "") {
  return String(valor || "").trim();
}

function normalizarTextoComision(valor = "") {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function aNumeroComision(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor).trim();
  texto = texto.replace(/\$/g, "").replace(/\s+/g, "");

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(texto)) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(texto)) {
    texto = texto.replace(/,/g, "");
  } else {
    texto = texto.replace(/[^\d,.-]/g, "");
    if (texto.includes(",") && !texto.includes(".")) {
      texto = texto.replace(",", ".");
    } else {
      texto = texto.replace(/,/g, "");
    }
  }

  const num = Number(texto);
  return Number.isFinite(num) ? num : 0;
}

function redondearComision(valor) {
  return Number((Number(valor || 0)).toFixed(2));
}

function obtenerNombreMesComision(mesNumero) {
  return MESES_COMISION[String(mesNumero || "").padStart(2, "0")] || "";
}

function tieneSeguroComision(valor) {
  const v = normalizarTextoComision(valor);
  return (
    v === "si" ||
    v === "sí" ||
    v === "con seguro" ||
    v === "true" ||
    v === "1" ||
    v === "x" ||
    v === "seguro"
  );
}

async function cargarCacheAsesoresComision(force = false) {
  if (!force && Array.isArray(cacheAsesoresComision)) {
    return cacheAsesoresComision;
  }

  try {
    const { data, error } = await supabaseClient
      .from("asesores")
      .select("cedula, nombre");

    if (error) throw error;
    cacheAsesoresComision = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error cargando asesores para comisiones:", error);
    cacheAsesoresComision = [];
  }

  return cacheAsesoresComision;
}

async function obtenerAsesorDesdeCreditoComision(registro) {
  const nombre = limpiarTextoComision(registro?.ejecutivo_comercial) || "Sin asesor";
  const nombreNormalizado = normalizarTextoComision(nombre);

  if (!nombreNormalizado || nombreNormalizado === "sin asesor") {
    return { nombre, identificacion: "sin-id" };
  }

  const asesores = await cargarCacheAsesoresComision();
  const asesorEncontrado = asesores.find((asesor) => {
    const nombreAsesor = normalizarTextoComision(asesor?.nombre || "");
    return nombreAsesor === nombreNormalizado;
  });

  return {
    nombre,
    identificacion: asesorEncontrado?.cedula
      ? String(asesorEncontrado.cedula).trim()
      : "sin-id"
  };
}

function obtenerMillonesDesdeMonto(valor) {
  const monto = aNumeroComision(valor);
  if (monto <= 0) return 0;
  return monto / 1000000;
}

function obtenerTarifaLibranzaAvVillasPorEscala(montoTotal, seguro, ejecutivoComercial = "") {
  const millones = obtenerMillonesDesdeMonto(montoTotal);
  if (millones <= 0) return 0;

  const nombreAsesor = normalizarTextoComision(ejecutivoComercial);
  const conSeguro = tieneSeguroComision(seguro);

  const tarifaEspecial = TARIFAS_ESPECIALES_LIBRANZA_AV_VILLAS[nombreAsesor] || null;

  const tarifaBase = {
    limite: 220,
    conSeguro: { hasta: 10000, mas: 11000 },
    sinSeguro: { hasta: 9000, mas: 10000 }
  };

  const configuracion = tarifaEspecial || tarifaBase;
  const tarifas = conSeguro ? configuracion.conSeguro : configuracion.sinSeguro;

  return millones <= configuracion.limite
    ? tarifas.hasta
    : tarifas.mas;
}

function obtenerTarifaCredivillasPorEscala(montoTotal, ejecutivoComercial = "") {
  const millones = obtenerMillonesDesdeMonto(montoTotal);
  if (millones <= 0) return 0;

  const nombreAsesor = normalizarTextoComision(ejecutivoComercial);

  const tarifaEspecial =
    TARIFAS_ESPECIALES_CREDIVILLAS_AV_VILLAS[nombreAsesor] || null;

  // 🔹 Tarifa base completa
  const tarifaBase = {
    rangos: [
      { min: 1, max: 100, valor: 10000 },
      { min: 101, max: 200, valor: 11000 },
      { min: 201, max: 300, valor: 12500 },
      { min: 301, max: Infinity, valor: 14000 }
    ]
  };

  const configuracion = tarifaEspecial || tarifaBase;

  const rango = configuracion.rangos.find(
    r => millones >= r.min && millones <= r.max
  );

  return rango ? rango.valor : 0;
}

function obtenerTarifaBancoUnionPorEscala(montoTotal) {
  const millones = obtenerMillonesDesdeMonto(montoTotal);
  if (millones <= 0) return 0;
  if (millones <= 100) return 15000;
  return 17000;
}

function obtenerTarifaHipotecarioPorEscala(montoTotal) {
  const millones = obtenerMillonesDesdeMonto(montoTotal);
  if (millones <= 0) return 0;
  if (millones <= 500) return 8000;
  if (millones <= 1000) return 10000;
  return 12000;
}

function calcularComisionPorEscalaGlobal(montoTotal, tarifa) {
  const millones = obtenerMillonesDesdeMonto(montoTotal);
  if (millones <= 0 || tarifa <= 0) return 0;
  return redondearComision(millones * tarifa);
}

function calcularPorMillon(monto, tarifa) {
  const valor = aNumeroComision(monto);
  if (valor <= 0) return 0;
  const millones = valor / 1000000;
  return redondearComision(millones * tarifa);
}

function obtenerTarifaEntidadPorMillon(tipo, asesorNombre = "") {
  const tipoNormalizado = normalizarTextoComision(tipo);
  const nombreAsesor = normalizarTextoComision(asesorNombre);

  return (
    TARIFAS_ESPECIALES_CREDITO_POR_MILLON[tipoNormalizado]?.[nombreAsesor] ||
    TARIFAS_POR_MILLON[tipoNormalizado] ||
    0
  );
}

function calcularComisionEntidadPorMillon(tipo, monto, asesorNombre = "") {
  return calcularPorMillon(monto, obtenerTarifaEntidadPorMillon(tipo, asesorNombre));
}

function obtenerTarifaTarjetas(asesorNombre = "") {
  const nombreAsesor = normalizarTextoComision(asesorNombre);
  return TARIFAS_ESPECIALES_TARJETAS[nombreAsesor] || 50000;
}

function calcularComisionTarjetas(cantidad, asesorNombre = "") {
  const total = aNumeroComision(cantidad);
  return total > 0 ? redondearComision(total * obtenerTarifaTarjetas(asesorNombre)) : 0;
}

function calcularComisionActivos(montoPagadoLibranza, linea, tipoSolicitud) {
  const monto = aNumeroComision(montoPagadoLibranza);
  if (monto <= 0) return 0;

  const millones = monto / 1000000;
  const lineaNorm = normalizarTextoComision(linea);
  const tipoNorm = normalizarTextoComision(tipoSolicitud);
  const texto = `${lineaNorm} ${tipoNorm}`;

  if (texto.includes("libre")) return redondearComision(millones * 50000);
  if (texto.includes("compra")) return redondearComision(millones * 45000);

  return 0;
}

function actualizarTotalesComisiones(filas) {
  const total = filas.reduce((a, b) => a + (b.total || 0), 0);
  const libranza = filas.reduce((a, b) => a + (b.libranza || 0), 0);
  const credivillas = filas.reduce((a, b) => a + (b.credivillas || 0), 0);
  const bancoUnion = filas.reduce((a, b) => a + (b.bancoUnion || 0), 0);
  const hipotecario = filas.reduce((a, b) => a + (b.hipotecario || 0), 0);
  const tarjetas = filas.reduce((a, b) => a + (b.tarjetas || 0), 0);
  const bancien = filas.reduce((a, b) => a + (b.bancien || 0), 0);
  const activos = filas.reduce((a, b) => a + (b.activos || 0), 0);
  const crezcamos = filas.reduce((a, b) => a + (b.crezcamos || 0), 0);
  const mission = filas.reduce((a, b) => a + (b.mission || 0), 0);
  const finexus = filas.reduce((a, b) => a + (b.finexus || 0), 0);
  const valorenz = filas.reduce((a, b) => a + (b.valorenz || 0), 0);
  const lagobo = filas.reduce((a, b) => a + (b.lagobo || 0), 0);

  setText("total-comisiones-general", formatCurrency(total));
  setText("total-libranza-general", formatCurrency(libranza));
  setText("total-credivillas", formatCurrency(credivillas));
  setText("total-banco-union", formatCurrency(bancoUnion));
  setText("total-hipotecario", formatCurrency(hipotecario));
  setText("total-tarjetas-general", formatCurrency(tarjetas));
  setText("total-bancien", formatCurrency(bancien));
  setText("total-activos", formatCurrency(activos));
  setText("total-crezcamos", formatCurrency(crezcamos));
  setText("total-mission", formatCurrency(mission));
  setText("total-finexus", formatCurrency(finexus));
  setText("total-valorenz", formatCurrency(valorenz));
  setText("total-lagobo", formatCurrency(lagobo));
  setText("total-asesores-comision", filas.length);
}

async function poblarFiltroAsesorComision(registros = []) {
  const select = $("filtro-asesor-comision");
  if (!select) return;

  const valorActual = select.value || "";
  const mapa = new Map();

  const asesores = await Promise.all(
    registros.map((registro) => obtenerAsesorDesdeCreditoComision(registro))
  );

  asesores.forEach((asesor) => {
    const id = String(asesor?.identificacion || "").trim();
    const nombre = String(asesor?.nombre || "").trim();

    if (!id || !nombre || nombre === "Sin asesor" || id === "sin-id") return;
    if (!mapa.has(id)) mapa.set(id, nombre);
  });

  select.innerHTML = `<option value="">Todos</option>`;

  [...mapa.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "es"))
    .forEach(([id, nombre]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = nombre;
      select.appendChild(opt);
    });

  if (valorActual && mapa.has(valorActual)) {
    select.value = valorActual;
  }

  sincronizarOpcionesFiltroComisionesGuardadas();
}

function obtenerPeriodoComisionDesdeFiltro() {
  const filtroMes = $("filtro-mes-comision")?.value || "";
  if (!filtroMes) return null;

  const [anio, mes] = filtroMes.split("-");
  if (!anio || !mes) return null;

  const fechaInicio = `${anio}-${mes}-01`;

  // calcular siguiente mes
  let siguienteMes = Number(mes) + 1;
  let siguienteAnio = Number(anio);

  if (siguienteMes > 12) {
    siguienteMes = 1;
    siguienteAnio++;
  }

  const fechaFin = `${siguienteAnio}-${String(siguienteMes).padStart(2, "0")}-01`;

  return {
    periodo: fechaInicio,
    fechaInicio,
    fechaFin,
    anio: Number(anio),
    mesNumero: mes,
  };
}

function obtenerCedulaClienteComision(registro = {}) {
  return String(
    registro?.cedula_cliente ??
    registro?.cedula ??
    registro?.documento ??
    registro?.numero_documento ??
    registro?.identificacion ??
    ""
  ).trim();
}

function obtenerNombreClienteComision(registro = {}) {
  const directo = String(
    registro?.nombre_cliente ??
    registro?.nombre ??
    registro?.nombre_completo ??
    registro?.nombres_apellidos ??
    registro?.cliente ??
    registro?.titular ??
    ""
  ).trim();

  if (directo) return directo;

  return [
    registro?.nombre1,
    registro?.nombre2,
    registro?.apellido1,
    registro?.apellido2
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function resolverNombreClienteDetalleComision(detalle = {}) {
  return obtenerNombreClienteComision(detalle) || "Cliente sin nombre";
}

function capitalizarTextoComision(valor = "") {
  return String(valor || "")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function obtenerLineaVisualComision(registro = {}) {
  const texto = `${registro?.linea || ""} ${registro?.tipo_solicitud || ""}`.toLowerCase();

  if ((Number(registro?.numero_tarjetas_activadas || 0) > 0) || texto.includes("tarjeta")) {
    return "Tarjeta de Credito";
  }
  if ((Number(registro?.monto_pagado_hipotecario || 0) > 0) || texto.includes("hipotecario")) {
    return "Hipotecario";
  }
  if ((Number(registro?.monto_pagado_credivillas || 0) > 0) || texto.includes("credivillas") || texto.includes("consumo")) {
    return "Consumo";
  }
  return "Libranza";
}

function obtenerClasificacionEntidadComision(entidadValor = "") {
  const entidad = normalizarTextoComision(entidadValor);

  return {
    entidad,
    esAvVillas:
      entidad.includes("av villas") ||
      entidad.includes("avvillas") ||
      entidad.includes("banco av villas"),
    esBancoUnion:
      entidad.includes("banco union") ||
      entidad === "union" ||
      entidad.includes(" union"),
    esBancien: entidad.includes("bancien"),
    esActivos: entidad === "activos y finanzas",
    esCrezcamos: entidad.includes("crezcamos"),
    esMission: entidad.includes("mission"),
    esFinexus:
      entidad === "finexus" ||
      entidad === "finexus activos" ||
      entidad === "finexus pensionados",
    esValorenz: entidad.includes("valorenz"),
    esLagobo: entidad.includes("lagobo")
  };
}

async function construirDetalleBaseComision(registro, periodoInfo) {
  const asesor = await obtenerAsesorDesdeCreditoComision(registro);
  const linea = obtenerLineaVisualComision(registro);

  return {
    id_credito: registro?.id ?? null,
    periodo: periodoInfo?.periodo || null,
    anio: Number(periodoInfo?.anio || registro?.anio || 0) || null,
    mes: String(periodoInfo?.mesTexto || registro?.mes || "").trim(),
    asesor_id: String(asesor.identificacion || "").trim(),
    asesor_nombre: String(asesor.nombre || "").trim(),
    ejecutivo_comercial: String(registro?.ejecutivo_comercial || "").trim(),
    entidad: capitalizarTextoComision(registro?.entidad || "Sin entidad"),
    entidad_normalizada: normalizarTextoComision(registro?.entidad || ""),
    cedula_cliente: obtenerCedulaClienteComision(registro),
    nombre_cliente: obtenerNombreClienteComision(registro) || "Cliente sin nombre",
    linea,
    seguro: tieneSeguroComision(registro?.seguro) ? "SI" : "-",
    seguro_bool: tieneSeguroComision(registro?.seguro),
    valor_libranza: aNumeroComision(registro?.monto_pagado_libranza),
    comision_libranza: 0,
    valor_consumo: aNumeroComision(registro?.monto_pagado_credivillas),
    comision_consumo: 0,
    valor_hipotecario: aNumeroComision(registro?.monto_pagado_hipotecario),
    comision_hipotecario: 0,
    cantidad_tc: Math.round(aNumeroComision(registro?.numero_tarjetas_activadas)),
    comision_tc: 0,
    tipo_solicitud: String(registro?.tipo_solicitud || "").trim(),
    estado_negocio: String(registro?.etapa || "").trim(),
    observacion: null
  };
}

function construirContextoEscalaAsesor(detalles = []) {
  const contexto = {};

  detalles.forEach((det) => {
    const key = String(det.asesor_id || "").trim();
    if (!key) return;

    if (!contexto[key]) {
      contexto[key] = {
        libranzaAvVillas: 0,
        credivillasAvVillas: 0,
        hipotecarioAvVillas: 0,
        bancoUnionLibranza: 0,
        totalTarjetas: 0
      };
    }

    const grupo = contexto[key];
    const cls = obtenerClasificacionEntidadComision(det.entidad);

    if (cls.esAvVillas && Number(det.valor_libranza || 0) > 0) {
      grupo.libranzaAvVillas += Number(det.valor_libranza || 0);
    }

    if (cls.esAvVillas && Number(det.valor_consumo || 0) > 0) {
      grupo.credivillasAvVillas += Number(det.valor_consumo || 0);
    }

    if (cls.esAvVillas && Number(det.valor_hipotecario || 0) > 0) {
      grupo.hipotecarioAvVillas += Number(det.valor_hipotecario || 0);
    }

    if (cls.esBancoUnion && Number(det.valor_libranza || 0) > 0) {
      grupo.bancoUnionLibranza += Number(det.valor_libranza || 0);
    }

    if (cls.esAvVillas && Number(det.cantidad_tc || 0) > 0) {
      grupo.totalTarjetas += Number(det.cantidad_tc || 0);
    }
  });

  return contexto;
}

function aplicarComisionDetalleSegunEscala(det, contextoAsesor = {}) {
  const cls = obtenerClasificacionEntidadComision(det.entidad);

  det.comision_libranza = 0;
  det.comision_consumo = 0;
  det.comision_hipotecario = 0;
  det.comision_tc = 0;

  if (det.linea === "Libranza" && Number(det.valor_libranza || 0) > 0) {
    if (cls.esAvVillas) {
      const tarifa = obtenerTarifaLibranzaAvVillasPorEscala(
        Number(contextoAsesor.libranzaAvVillas || 0),
        det.seguro_bool,
        det.ejecutivo_comercial || det.asesor_nombre || ""
      );
      det.comision_libranza = calcularComisionPorEscalaGlobal(det.valor_libranza, tarifa);
    } else if (cls.esBancoUnion) {
      const tarifa = obtenerTarifaBancoUnionPorEscala(Number(contextoAsesor.bancoUnionLibranza || 0));
      det.comision_libranza = calcularComisionPorEscalaGlobal(det.valor_libranza, tarifa);
    } else if (cls.esBancien) {
      det.comision_libranza = calcularComisionEntidadPorMillon("bancien", det.valor_libranza, det.ejecutivo_comercial || det.asesor_nombre || "");
    } else if (cls.esActivos) {
      det.comision_libranza = calcularComisionActivos(det.valor_libranza, det.linea, det.tipo_solicitud);
    } else if (cls.esCrezcamos) {
      det.comision_libranza = calcularComisionEntidadPorMillon("crezcamos", det.valor_libranza, det.ejecutivo_comercial || det.asesor_nombre || "");
    } else if (cls.esMission) {
      det.comision_libranza = calcularComisionEntidadPorMillon("mission", det.valor_libranza, det.ejecutivo_comercial || det.asesor_nombre || "");
    } else if (cls.esFinexus) {
      det.comision_libranza = calcularComisionEntidadPorMillon("finexus", det.valor_libranza, det.ejecutivo_comercial || det.asesor_nombre || "");
    } else if (cls.esValorenz) {
      det.comision_libranza = calcularComisionEntidadPorMillon("valorenz", det.valor_libranza, det.ejecutivo_comercial || det.asesor_nombre || "");
    } else if (cls.esLagobo) {
      det.comision_libranza = calcularComisionEntidadPorMillon("lagobo", det.valor_libranza, det.ejecutivo_comercial || det.asesor_nombre || "");
    }
  }

  if (det.linea === "Consumo" && Number(det.valor_consumo || 0) > 0) {
    const tarifa = obtenerTarifaCredivillasPorEscala(
      Number(contextoAsesor.credivillasAvVillas || 0),
      det.ejecutivo_comercial || det.ejecutivoComercial || det.asesor_nombre || ""
    );
    det.comision_consumo = calcularComisionPorEscalaGlobal(det.valor_consumo, tarifa);
  }

  if (det.linea === "Hipotecario" && Number(det.valor_hipotecario || 0) > 0) {
    const tarifa = obtenerTarifaHipotecarioPorEscala(Number(contextoAsesor.hipotecarioAvVillas || 0));
    det.comision_hipotecario = calcularComisionPorEscalaGlobal(det.valor_hipotecario, tarifa);
  }

  if (det.linea === "Tarjeta de Credito" && Number(det.cantidad_tc || 0) > 0) {
    det.comision_tc = calcularComisionTarjetas(det.cantidad_tc, det.ejecutivo_comercial || det.asesor_nombre || "");
    det.seguro = "-";
  }

  return det;
}

function agruparResumenComisionesDesdeDetalle(detalles = []) {
  const resumen = {};

  detalles.forEach((det) => {
    const key = String(det.asesor_id || det.asesor_nombre || "").trim();
    if (!key) return;

    if (!resumen[key]) {
      resumen[key] = {
        asesor: det.asesor_nombre || "Sin asesor",
        cedula: det.asesor_id || "",
        cantidadCreditos: 0,
        libranza: 0,
        credivillas: 0,
        bancoUnion: 0,
        hipotecario: 0,
        tarjetas: 0,
        bancien: 0,
        activos: 0,
        crezcamos: 0,
        mission: 0,
        finexus: 0,
        valorenz: 0,
        lagobo: 0,
        total: 0
      };
    }

    const fila = resumen[key];
    fila.cantidadCreditos += 1;

    const cls = obtenerClasificacionEntidadComision(det.entidad);
    const comLibranza = Number(det.comision_libranza || 0);
    const comConsumo = Number(det.comision_consumo || 0);
    const comHipotecario = Number(det.comision_hipotecario || 0);
    const comTc = Number(det.comision_tc || 0);

    if (cls.esAvVillas) {
      fila.libranza += comLibranza;
      fila.credivillas += comConsumo;
      fila.hipotecario += comHipotecario;
      fila.tarjetas += comTc;
    } else if (cls.esBancoUnion) {
      fila.bancoUnion += comLibranza;
    } else if (cls.esBancien) {
      fila.bancien += comLibranza;
    } else if (cls.esActivos) {
      fila.activos += comLibranza;
    } else if (cls.esCrezcamos) {
      fila.crezcamos += comLibranza;
    } else if (cls.esMission) {
      fila.mission += comLibranza;
    } else if (cls.esFinexus) {
      fila.finexus += comLibranza;
    } else if (cls.esValorenz) {
      fila.valorenz += comLibranza;
    } else if (cls.esLagobo) {
      fila.lagobo += comLibranza;
    }

    fila.total =
      fila.libranza +
      fila.credivillas +
      fila.bancoUnion +
      fila.hipotecario +
      fila.tarjetas +
      fila.bancien +
      fila.activos +
      fila.crezcamos +
      fila.mission +
      fila.finexus +
      fila.valorenz +
      fila.lagobo;
  });

  return Object.values(resumen)
    .map((f) => ({ ...f, total: redondearComision(f.total) }))
    .filter((f) => Number(f.total || 0) > 0)
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return String(a.asesor || "").localeCompare(String(b.asesor || ""), "es");
    });
}

function obtenerClaseTotalComision(total) {
  if (total >= 3000000) return "text-green-700";
  if (total >= 1000000) return "text-yellow-600";
  return "text-gray-500";
}

function renderFilaResumenComision(f) {
  return `
    <tr class="border-b hover:bg-blue-50 transition">
      <td class="px-4 py-3">
        <div class="font-semibold text-gray-800">${f.asesor}</div>
        <div class="text-xs text-gray-400">${f.cantidadCreditos} registro(s)</div>
      </td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.libranza)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.credivillas)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.bancoUnion)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.hipotecario)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.tarjetas)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.bancien)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.activos)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.crezcamos)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.mission)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.finexus)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.valorenz)}</td>
      <td class="px-4 py-3 text-center">${formatCurrencyComision(f.lagobo)}</td>
      <td class="px-4 py-3 text-center font-bold ${obtenerClaseTotalComision(f.total)}">
        ${formatCurrencyComision(f.total)}
      </td>
    </tr>
  `;
}

/* ==========================================
   CARGAR COMISIONES
========================================== */

async function cargarComisiones() {
  const tbody = $("tabla-comisiones-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="14" class="px-4 py-6 text-center text-gray-500">
        <i class="fas fa-spinner fa-spin mr-2"></i>Calculando comisiones...
      </td>
    </tr>
  `;

  const filtroMes = $("filtro-mes-comision")?.value || "";
  const filtroAsesor = $("filtro-asesor-comision")?.value || "";
  const periodoInfoBase = obtenerPeriodoComisionDesdeFiltro();

  try {
    let query = supabaseClient
      .from("creditos_radicados")
      .select("*")
      .order("anio", { ascending: false })
      .order("fecha", { ascending: false });

    if (filtroMes) {
      const [anioSeleccionado, mesNumero] = filtroMes.split("-");
      const mesTexto = obtenerNombreMesComision(mesNumero);

      query = query
        .in("etapa", ETAPAS_VALIDAS_COMISION)
        .eq("anio", Number(anioSeleccionado))
        .or(`mes.eq.${mesTexto},mes.eq.${mesNumero}`);
    } else {
      query = query.in("etapa", ETAPAS_VALIDAS_COMISION);
    }

    const { data, error } = await query;
    if (error) throw error;

    const registros = Array.isArray(data) ? data : [];
    await poblarFiltroAsesorComision(registros);

    const detallesBase = await Promise.all(
      registros.map((registro) => {
        const periodoInfo = periodoInfoBase || {
          periodo:
            registro?.anio && registro?.mes
              ? `${registro.anio}-${String(registro.mes).padStart(2, "0")}-01`
              : null,
          anio: Number(registro?.anio || 0) || null,
          mesTexto: String(registro?.mes || "").trim()
        };
        return construirDetalleBaseComision(registro, periodoInfo);
      })
    );

    const detallesBaseFiltrados = filtroAsesor
      ? detallesBase.filter((det) => String(det.asesor_id || "") === String(filtroAsesor))
      : detallesBase;

    const contextoEscala = construirContextoEscalaAsesor(detallesBaseFiltrados);

    const detallesCalculados = detallesBaseFiltrados
      .map((det) =>
        aplicarComisionDetalleSegunEscala(
          { ...det },
          contextoEscala[String(det.asesor_id || "").trim()] || {}
        )
      )
      .filter((det) => {
        const totalFila =
          Number(det.comision_libranza || 0) +
          Number(det.comision_consumo || 0) +
          Number(det.comision_hipotecario || 0) +
          Number(det.comision_tc || 0);
        return totalFila > 0;
      });

    window.__comisionesDetalleCache = detallesCalculados;

    const filas = agruparResumenComisionesDesdeDetalle(detallesCalculados);
    __comisionesCache = filas;

    if (!filas.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="14" class="px-4 py-6 text-center text-gray-500">
            No se encontraron comisiones para los filtros seleccionados.
          </td>
        </tr>
      `;
      actualizarTotalesComisiones([]);
      return;
    }

    tbody.innerHTML = filas.map(renderFilaResumenComision).join("");
    actualizarTotalesComisiones(filas);
  } catch (err) {
    console.error("Error cargando comisiones:", err);
    alert(
      "Error cargando comisiones: " +
      (err?.message || err?.details || err?.hint || JSON.stringify(err))
    );

    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="px-4 py-6 text-center text-red-600">
          Error al calcular comisiones.
        </td>
      </tr>
    `;
  }
}

/* ==========================================
   EXPORTAR EXCEL / ESTADOS
========================================== */

function obtenerEstadoPagoComisionDesdeFila(fila = {}) {
  const estado = String(fila?.estado_pago || "").trim().toLowerCase();
  if (["pagado", "pago parcial", "pendiente"].includes(estado)) return estado;
  return "pendiente";
}

function renderBadgeEstadoPagoComision(estado = "pendiente") {
  const mapa = {
    "pagado": "bg-green-100 text-green-700",
    "pago parcial": "bg-amber-100 text-amber-700",
    "pendiente": "bg-orange-100 text-orange-700",
  };
  const clase = mapa[estado] || mapa.pendiente;
  const texto = estado === "pagado" ? "Pagado" : estado === "pago parcial" ? "Pago parcial" : "Pendiente";
  return `<span class="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${clase}">${texto}</span>`;
}

function renderValorSoloLecturaComisionGuardada(valor = 0, tipo = "moneda") {
  if (tipo === "entero") {
    return `<span class="font-medium text-gray-800">${Number(valor || 0)}</span>`;
  }

  return `<span class="font-medium text-gray-800">${formatCurrencyComision(valor)}</span>`;
}

function renderResumenAnticipoSoloLectura(anticipo = {}) {
  const esFijo = anticipo.tipoDescuento === "fijo";
  const etiqueta = esFijo ? "Valor fijo" : "% anticipo";
  const valor = esFijo
    ? formatCurrencyComision(anticipo.valorFijo || 0)
    : `${Number(anticipo.porcentaje || 0)}%`;

  return `
    <div class="flex flex-col items-center gap-1">
      <span class="inline-flex min-w-[7rem] items-center justify-center rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700">${valor}</span>
      <span class="text-[11px] text-gray-500">${etiqueta}</span>
    </div>
  `;
}

function renderSelectorTipoDescuentoEditableComision(fila = {}) {
  const tipoActual = String(fila?.tipo_descuento_anticipado || "porcentaje").trim().toLowerCase() === "fijo"
    ? "fijo"
    : "porcentaje";

  return `
    <select
      class="min-w-[7rem] rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 focus:border-green-500 focus:outline-none"
      onchange="cambiarTipoDescuentoComision('${fila.id}', this.value)"
    >
      <option value="porcentaje" ${tipoActual === "porcentaje" ? "selected" : ""}>Porcentaje</option>
      <option value="fijo" ${tipoActual === "fijo" ? "selected" : ""}>Valor fijo</option>
    </select>
  `;
}

function renderInputPorcentajeAnticipoEditableComision(fila = {}) {
  const anticipo = calcularTotalesAnticipoComision(fila || {});
  const deshabilitado = anticipo.tipoDescuento === "fijo" ? "disabled" : "";
  const clasesEstado = anticipo.tipoDescuento === "fijo"
    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
    : "bg-white text-gray-700";

  return `
    <div class="flex flex-col items-center gap-1">
      <input
        type="number"
        min="0"
        max="100"
        step="1"
        value="${Number(anticipo.porcentaje || 0)}"
        ${deshabilitado}
        class="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center text-xs font-medium focus:border-green-500 focus:outline-none ${clasesEstado}"
        onchange="actualizarDescuentoAnticipadoComision('${fila.id}', this.value)"
      />
      <span class="text-[11px] text-gray-500">% anticipo</span>
    </div>
  `;
}

function renderInputValorFijoEditableComision(fila = {}) {
  const anticipo = calcularTotalesAnticipoComision(fila || {});
  const deshabilitado = anticipo.tipoDescuento === "porcentaje" ? "disabled" : "";
  const clasesEstado = anticipo.tipoDescuento === "porcentaje"
    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
    : "bg-white text-gray-700";

  return `
    <div class="flex flex-col items-center gap-1">
      <input
        type="number"
        min="0"
        step="1000"
        value="${Number(anticipo.valorFijo || 0)}"
        ${deshabilitado}
        class="w-24 rounded-lg border border-gray-300 px-3 py-2 text-center text-xs font-medium focus:border-green-500 focus:outline-none ${clasesEstado}"
        onchange="actualizarDescuentoFijoComision('${fila.id}', this.value)"
      />
      <span class="text-[11px] text-gray-500">Valor fijo</span>
    </div>
  `;
}

function obtenerFiltroMesComisionesGuardadas() {
  return $("filtro-mes-guardadas-comision")?.value || $("filtro-mes-comision")?.value || "";
}

function obtenerFiltroAsesorComisionesGuardadas() {
  return $("filtro-asesor-guardadas-comision")?.value || $("filtro-asesor-comision")?.value || "";
}

function sincronizarOpcionesFiltroComisionesGuardadas() {
  const origen = $("filtro-asesor-comision");
  const destino = $("filtro-asesor-guardadas-comision");
  if (!origen || !destino) return;

  const valorActual = destino.value || "";
  destino.innerHTML = origen.innerHTML;

  if (valorActual && [...destino.options].some((opt) => opt.value === valorActual)) {
    destino.value = valorActual;
  }
}

function limpiarFiltrosComisionesGuardadas() {
  const mesGuardadas = $("filtro-mes-guardadas-comision");
  const asesorGuardadas = $("filtro-asesor-guardadas-comision");

  if (mesGuardadas) mesGuardadas.value = "";
  if (asesorGuardadas) asesorGuardadas.value = "";

  cargarComisionesGuardadas();
}

function inicializarFiltrosComisionesGuardadas() {
  const mes = $("filtro-mes-guardadas-comision");
  const asesor = $("filtro-asesor-guardadas-comision");

  if (mes && !mes.dataset.bound) {
    mes.addEventListener("change", () => cargarComisionesGuardadas());
    mes.dataset.bound = "1";
  }

  if (asesor && !asesor.dataset.bound) {
    asesor.addEventListener("change", () => cargarComisionesGuardadas());
    asesor.dataset.bound = "1";
  }

  sincronizarOpcionesFiltroComisionesGuardadas();
}


function sanitizarPorcentajeAnticipado(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.min(100, Math.max(0, numero));
}

function sanitizarValorMoneda(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.round(numero);
}

function calcularTotalesAnticipoComision(fila = {}) {
  const totalBruto = Number(
    fila?.total ||
    Number(fila?.libranza || 0) +
    Number(fila?.credivillas || 0) +
    Number(fila?.banco_union || 0) +
    Number(fila?.hipotecario || 0) +
    Number(fila?.tarjetas || 0) +
    Number(fila?.bancien || 0) +
    Number(fila?.activos || 0) +
    Number(fila?.crezcamos || 0) +
    Number(fila?.mission || 0) +
    Number(fila?.finexus || 0) +
    Number(fila?.valorenz || 0) +
    Number(fila?.lagobo || 0)
  ) || 0;

  const porcentaje = sanitizarPorcentajeAnticipado(
    fila?.porcentaje_descuento_anticipado ??
    fila?.descuento_anticipado_porcentaje ??
    fila?.porcentaje_descuento ??
    0
  );

  const tipoDescuento = String(
    fila?.tipo_descuento_anticipado || "porcentaje"
  ).trim().toLowerCase() === "fijo" ? "fijo" : "porcentaje";

  const valorFijo = sanitizarValorMoneda(
    fila?.valor_fijo_anticipado ??
    fila?.descuento_anticipado_fijo ??
    fila?.valor_descuento_fijo ??
    0
  );

  const descuentoGuardado = Number(
    fila?.valor_descuento_anticipado ??
    fila?.descuento_anticipado_valor ??
    fila?.valor_descuento ??
    NaN
  );

  let descuento = 0;

  if (tipoDescuento === "fijo") {
    descuento = Math.min(totalBruto, valorFijo);
  } else {
    descuento = Number.isFinite(descuentoGuardado)
      ? descuentoGuardado
      : Math.round((totalBruto * porcentaje) / 100);
  }

  const totalNeto = Math.max(0, totalBruto - descuento);

  return {
    totalBruto,
    porcentaje,
    valorFijo,
    tipoDescuento,
    descuento,
    totalNeto,
  };
}

async function actualizarDescuentoAnticipadoComision(id, porcentajeRaw) {
  let porcentaje = parseInt(porcentajeRaw, 10);

  if (isNaN(porcentaje)) porcentaje = 0;
  if (porcentaje < 0) porcentaje = 0;
  if (porcentaje > 100) porcentaje = 100;

  try {
    const { data: actual, error: errorConsulta } = await supabaseClient
      .from("comisiones_calculadas")
      .select("id, total, libranza, credivillas, banco_union, hipotecario, tarjetas, bancien, activos, crezcamos, mission, finexus, valorenz, lagobo")
      .eq("id", id)
      .single();

    if (errorConsulta) throw errorConsulta;

    const { totalBruto } = calcularTotalesAnticipoComision(actual || {});
    const valorDescuento = Math.round((totalBruto * porcentaje) / 100);
    const totalNeto = Math.max(0, Math.round(totalBruto - valorDescuento));

    const payload = {
      tipo_descuento_anticipado: "porcentaje",
      porcentaje_descuento_anticipado: porcentaje,
      valor_fijo_anticipado: 0,
      valor_descuento_anticipado: valorDescuento,
      total_neto_pagar: totalNeto,
    };

    const { error } = await supabaseClient
      .from("comisiones_calculadas")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    mostrarMensaje(
      null,
      "exito",
      `✅ Descuento por anticipado actualizado (${porcentaje}%).`
    );

    await cargarComisionesGuardadas();
  } catch (error) {
    console.error("Error actualizando descuento por anticipado:", error);
    mostrarMensaje(
      null,
      "error",
      "No fue posible guardar el descuento por anticipado. Revisa que existan las columnas tipo_descuento_anticipado, porcentaje_descuento_anticipado, valor_fijo_anticipado, valor_descuento_anticipado y total_neto_pagar en comisiones_calculadas."
    );
    await cargarComisionesGuardadas();
  }
}

async function actualizarDescuentoFijoComision(id, valorRaw) {
  let valorFijo = sanitizarValorMoneda(valorRaw);

  try {
    const { data: actual, error: errorConsulta } = await supabaseClient
      .from("comisiones_calculadas")
      .select("id, total, libranza, credivillas, banco_union, hipotecario, tarjetas, bancien, activos, crezcamos, mission, finexus, valorenz, lagobo")
      .eq("id", id)
      .single();

    if (errorConsulta) throw errorConsulta;

    const { totalBruto } = calcularTotalesAnticipoComision(actual || {});
    const valorDescuento = Math.min(totalBruto, valorFijo);
    const totalNeto = Math.max(0, Math.round(totalBruto - valorDescuento));

    const payload = {
      tipo_descuento_anticipado: "fijo",
      porcentaje_descuento_anticipado: 0,
      valor_fijo_anticipado: valorFijo,
      valor_descuento_anticipado: valorDescuento,
      total_neto_pagar: totalNeto,
    };

    const { error } = await supabaseClient
      .from("comisiones_calculadas")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    mostrarMensaje(
      null,
      "exito",
      `✅ Valor fijo por anticipado actualizado (${formatCurrencyComision(valorFijo)}).`
    );

    await cargarComisionesGuardadas();
  } catch (error) {
    console.error("Error actualizando valor fijo por anticipado:", error);
    mostrarMensaje(
      null,
      "error",
      "No fue posible guardar el valor fijo por anticipado. Revisa que existan las columnas tipo_descuento_anticipado, valor_fijo_anticipado, valor_descuento_anticipado y total_neto_pagar en comisiones_calculadas."
    );
    await cargarComisionesGuardadas();
  }
}

async function cambiarTipoDescuentoComision(id, tipoRaw) {
  const tipo = String(tipoRaw || "porcentaje").trim().toLowerCase() === "fijo" ? "fijo" : "porcentaje";

  try {
    const { data: actual, error: errorConsulta } = await supabaseClient
      .from("comisiones_calculadas")
      .select("*")
      .eq("id", id)
      .single();

    if (errorConsulta) throw errorConsulta;

    const filaActualizada = {
      ...(actual || {}),
      tipo_descuento_anticipado: tipo,
      porcentaje_descuento_anticipado: tipo === "fijo"
        ? 0
        : sanitizarPorcentajeAnticipado(actual?.porcentaje_descuento_anticipado ?? 0),
      valor_fijo_anticipado: tipo === "fijo"
        ? sanitizarValorMoneda(actual?.valor_fijo_anticipado ?? 0)
        : 0,
    };

    const anticipo = calcularTotalesAnticipoComision(filaActualizada);

    const payload = {
      tipo_descuento_anticipado: tipo,
      porcentaje_descuento_anticipado: anticipo.tipoDescuento === "porcentaje" ? anticipo.porcentaje : 0,
      valor_fijo_anticipado: anticipo.tipoDescuento === "fijo" ? anticipo.valorFijo : 0,
      valor_descuento_anticipado: anticipo.descuento,
      total_neto_pagar: anticipo.totalNeto,
    };

    const { error } = await supabaseClient
      .from("comisiones_calculadas")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    await cargarComisionesGuardadas();
  } catch (error) {
    console.error("Error cambiando tipo de descuento:", error);
    mostrarMensaje(null, "error", "No fue posible cambiar el tipo de descuento anticipado.");
    await cargarComisionesGuardadas();
  }
}

async function actualizarCampoComisionGuardada(id, campo, valorRaw, tipo = "moneda") {
  const camposPermitidos = new Set([
    "libranza",
    "credivillas",
    "banco_union",
    "hipotecario",
    "tarjetas",
    "bancien",
    "activos",
    "crezcamos",
    "mission",
    "finexus",
    "valorenz",
    "lagobo",
    "cantidad_creditos",
  ]);

  if (!camposPermitidos.has(campo)) {
    console.warn("Campo de comisión no permitido:", campo);
    return;
  }

  let valor = tipo === "entero"
    ? parseInt(valorRaw, 10)
    : sanitizarValorMoneda(valorRaw);

  if (!Number.isFinite(valor) || valor < 0) valor = 0;

  try {
    const { data: actual, error: errorConsulta } = await supabaseClient
      .from("comisiones_calculadas")
      .select("id, libranza, credivillas, banco_union, hipotecario, tarjetas, bancien, activos, crezcamos, mission, finexus, valorenz, lagobo, cantidad_creditos, tipo_descuento_anticipado, porcentaje_descuento_anticipado, valor_fijo_anticipado")
      .eq("id", id)
      .single();

    if (errorConsulta) throw errorConsulta;

    const baseActualizada = {
      ...(actual || {}),
      [campo]: valor,
    };

    const anticipo = calcularTotalesAnticipoComision(baseActualizada);

    const payload = {
      [campo]: valor,
      total: anticipo.totalBruto,
      valor_descuento_anticipado: anticipo.descuento,
      total_neto_pagar: anticipo.totalNeto,
      porcentaje_descuento_anticipado: anticipo.tipoDescuento === "porcentaje" ? anticipo.porcentaje : 0,
      valor_fijo_anticipado: anticipo.tipoDescuento === "fijo" ? anticipo.valorFijo : 0,
      tipo_descuento_anticipado: anticipo.tipoDescuento,
    };

    const { error } = await supabaseClient
      .from("comisiones_calculadas")
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    mostrarMensaje(null, "exito", "✅ Comisión actualizada correctamente.");
    await cargarComisionesGuardadas();
  } catch (error) {
    console.error("Error actualizando campo de comisión:", error);
    mostrarMensaje(null, "error", "No fue posible actualizar la comisión guardada.");
    await cargarComisionesGuardadas();
  }
}

async function cambiarEstadoPagoComision(id, nuevoEstado) {
  const estado = String(nuevoEstado || "pendiente").trim().toLowerCase();
  const esDesmarcarPagado = estado !== "pagado";

  if (esDesmarcarPagado) {
    const confirmar = confirm("¿Seguro que deseas cambiar este pago a pago parcial o pendiente?");
    if (!confirmar) {
      await cargarComisionesGuardadas();
      return;
    }
  }

  const { error } = await supabaseClient
    .from("comisiones_calculadas")
    .update({ estado_pago: estado })
    .eq("id", id);

  if (error) {
    console.error(error);
    mostrarMensaje(null, "error", "Error actualizando estado del pago.");
    await cargarComisionesGuardadas();
    return;
  }

  await cargarComisionesGuardadas();
}

function mostrarComisionesGuardadas() {
  setHidden("comisiones-panel-principal", true);
  setHidden("seccion-comprobante-comision", true);
  setHidden("seccion-comisiones-guardadas", false);
  cargarComisionesGuardadas();
}

function volverAVistaComisiones() {
  setHidden("seccion-comprobante-comision", true);
  setHidden("seccion-comisiones-guardadas", true);
  setHidden("comisiones-panel-principal", false);
}

function exportarComisionesExcel() {
  if (!__comisionesCache.length) {
    alert("No hay datos de comisiones para exportar.");
    return;
  }

  const data = __comisionesCache.map((x) => ({
    Asesor: x.asesor,
    "Libranza AV Villas": x.libranza,
    Credivillas: x.credivillas,
    "Banco Union": x.bancoUnion,
    Hipotecario: x.hipotecario,
    Tarjetas: x.tarjetas,
    Bancien: x.bancien,
    "Activos y Finanzas": x.activos,
    Crezcamos: x.crezcamos,
    Mission: x.mission,
    Finexus: x.finexus,
    Valorenz: x.valorenz,
    Lagobo: x.lagobo,
    "Total Comision": x.total,
    "Cantidad Registros": x.cantidadCreditos
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const rango = XLSX.utils.decode_range(ws["!ref"]);

  for (let R = 1; R <= rango.e.r; ++R) {
    for (let C = 1; C <= 13; ++C) {
      const celda = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[celda]) {
        ws[celda].t = "n";
        ws[celda].z = '"$"#,##0.00';
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comisiones");
  XLSX.writeFile(wb, "comisiones.xlsx");
}

/* ==========================================
   DETALLE / GUARDADO
========================================== */

async function insertarDetallesComisionRobusto(detallesPayload = []) {
  if (!Array.isArray(detallesPayload) || !detallesPayload.length) {
    return { inserted: 0, removedColumns: [], duplicatesRemoved: 0 };
  }

  const columnasRemovidas = [];
  const maxIntentos = 25;
  const safeText = (v) => String(v || "").trim();

  const buildKey = (row) => {
    const numeroCredito = safeText(row.numero_credito);
    const cedula = normalizarTextoPlano(row.cedula_cliente || "");

    if (numeroCredito) {
      return [
        safeText(row.comision_id),
        safeText(row.asesor_id),
        numeroCredito,
        cedula,
      ].join("||");
    }

    return [
      safeText(row.comision_id),
      safeText(row.asesor_id),
      normalizarTextoPlano(row.entidad || ""),
      cedula,
      normalizarTextoPlano(row.nombre_cliente || ""),
      normalizarTextoPlano(row.linea || ""),
      normalizarTextoPlano(row.seguro || "-"),
      safeText(row.valor_libranza),
      safeText(row.valor_consumo),
      safeText(row.valor_hipotecario),
      safeText(row.cantidad_tc),
      safeText(row.estado_negocio),
      safeText(row.editado_en),
    ].join("||");
  };

  const mapa = new Map();
  for (const row of detallesPayload) {
    const key = buildKey(row);
    mapa.set(key, { ...row });
  }

  let payloadActual = Array.from(mapa.values());
  const duplicatesRemoved = detallesPayload.length - payloadActual.length;

  console.log("📦 detallesPayload originales:", detallesPayload.length);
  console.log("🧹 duplicados removidos:", duplicatesRemoved);
  console.log("✅ detallesPayload final:", payloadActual.length);

  for (let intento = 0; intento < maxIntentos; intento++) {
    const { error } = await supabaseClient
      .from("comisiones_detalle")
      .insert(payloadActual);

    if (!error) {
      return {
        inserted: payloadActual.length,
        removedColumns: columnasRemovidas,
        duplicatesRemoved,
      };
    }

    const mensaje = String(error?.message || "");
    const match = mensaje.match(/Could not find the '([^']+)' column/i);

    if (!match) {
      console.error("❌ Error insertando comisiones_detalle:", error);
      console.error("❌ Ejemplo payload:", payloadActual[0]);
      throw error;
    }

    const columnaFaltante = match[1];

    if (!columnaFaltante || columnasRemovidas.includes(columnaFaltante)) {
      throw error;
    }

    columnasRemovidas.push(columnaFaltante);
    console.warn(`⚠️ Quitando columna inexistente: ${columnaFaltante}`);

    payloadActual = payloadActual.map((row) => {
      const nuevo = { ...row };
      delete nuevo[columnaFaltante];
      return nuevo;
    });
  }

  throw new Error("No fue posible adaptar el payload de comisiones_detalle al esquema actual.");
}

async function guardarComisionesCalculadas() {
  try {
    if (!__comisionesCache.length) {
      mostrarMensaje(null, "error", "Primero debes calcular las comisiones.");
      return;
    }

    const periodoInfo = obtenerPeriodoComisionDesdeFiltro();
    if (!periodoInfo) {
      mostrarMensaje(null, "error", "Debes seleccionar un mes antes de guardar.");
      return;
    }

    const calculadoPor = getUserName() || getValue("username") || "Sistema";
    const mesTexto = obtenerNombreMesComision(periodoInfo.mesNumero);
    const asesorIdsCache = __comisionesCache
      .map((fila) => String(fila.cedula || fila.asesor || "").trim())
      .filter(Boolean);

    let estadosPrevios = [];
    if (asesorIdsCache.length) {
      const { data, error } = await supabaseClient
        .from("comisiones_calculadas")
        .select("id, asesor_id, estado_pago, tipo_descuento_anticipado, porcentaje_descuento_anticipado, valor_fijo_anticipado, valor_descuento_anticipado, total_neto_pagar")
        .eq("periodo", periodoInfo.periodo)
        .in("asesor_id", asesorIdsCache);

      if (error) throw error;
      estadosPrevios = Array.isArray(data) ? data : [];
    }

    const mapaEstadosPrevios = new Map(
      estadosPrevios.map((fila) => [
        String(fila.asesor_id || "").trim(),
        fila,
      ])
    );

    let detallesPrevios = [];
    const idsCabecerasPrevias = estadosPrevios
      .map((fila) => fila?.id)
      .filter(Boolean);

    if (idsCabecerasPrevias.length) {
      const { data, error } = await supabaseClient
        .from("comisiones_detalle")
        .select("*")
        .in("comision_id", idsCabecerasPrevias);

      if (error) throw error;
      detallesPrevios = Array.isArray(data) ? data : [];
    }

    const construirLlavesDetalleManual = (detalle = {}) => {
      const asesorId = String(detalle.asesor_id || "").trim();
      const entidad = normalizarTextoPlano(detalle.entidad || "");
      const linea = normalizarTextoPlano(detalle.linea || "");
      const seguro = normalizarTextoPlano(detalle.seguro || "-");
      const cedula = normalizarTextoPlano(detalle.cedula_cliente || "");
      const nombre = normalizarTextoPlano(detalle.nombre_cliente || "");
      const numeroCredito = String(detalle.numero_credito || "").trim();
      const cliente = cedula || nombre;

      return [
        numeroCredito ? [asesorId, entidad, numeroCredito, cedula, linea, seguro].join("||") : "",
        numeroCredito ? [asesorId, entidad, numeroCredito, cliente, linea].join("||") : "",
        [asesorId, entidad, cliente, linea, seguro].join("||"),
        [asesorId, entidad, cliente, linea].join("||"),
        [asesorId, entidad, cedula, linea].join("||"),
        [asesorId, entidad, nombre, linea].join("||"),
        [asesorId, entidad, cliente].join("||"),
        [asesorId, entidad, linea].join("||")
      ].filter((v, i, arr) => v && arr.indexOf(v) === i);
    };

    const mapaDetallesManualPrevios = new Map();
    detallesPrevios.forEach((detalle) => {
      construirLlavesDetalleManual(detalle).forEach((llave) => {
        if (!mapaDetallesManualPrevios.has(llave)) {
          mapaDetallesManualPrevios.set(llave, detalle);
        }
      });
    });

    const buscarDetalleManualPrevio = (detalle = {}) => {
      for (const llave of construirLlavesDetalleManual(detalle)) {
        const encontrado = mapaDetallesManualPrevios.get(llave);
        if (encontrado) return encontrado;
      }
      return null;
    };

    const detallesCacheFusionados = (window.__comisionesDetalleCache || []).map((det) => {
      const anterior = buscarDetalleManualPrevio(det);
      if (!anterior) return { ...det };

      const fusionado = { ...det };

      if (anterior.manual_comision_libranza) {
        fusionado.comision_libranza = Number(anterior.comision_libranza || 0);
        fusionado.manual_comision_libranza = true;
      }
      if (anterior.manual_comision_consumo) {
        fusionado.comision_consumo = Number(anterior.comision_consumo || 0);
        fusionado.manual_comision_consumo = true;
      }
      if (anterior.manual_comision_hipotecario) {
        fusionado.comision_hipotecario = Number(anterior.comision_hipotecario || 0);
        fusionado.manual_comision_hipotecario = true;
      }
      if (anterior.manual_comision_tc) {
        fusionado.comision_tc = Number(anterior.comision_tc || 0);
        fusionado.manual_comision_tc = true;
      }
      if (anterior.editado_manual) {
        fusionado.editado_manual = true;
        fusionado.editado_en = anterior.editado_en || null;
      }

      return fusionado;
    });

    const resumenCalculadoParaGuardar = agruparResumenComisionesDesdeDetalle(detallesCacheFusionados);

    const payload = resumenCalculadoParaGuardar
      .map((fila) => {
        const asesorId = String(fila.cedula || fila.asesor || "").trim();
        if (!asesorId) return null;
        return {
          periodo: periodoInfo.periodo,
          anio: periodoInfo.anio,
          mes: mesTexto,
          asesor_id: asesorId,
          asesor_nombre: String(fila.asesor || "").trim(),
          libranza: Number(fila.libranza || 0),
          credivillas: Number(fila.credivillas || 0),
          banco_union: Number(fila.bancoUnion || 0),
          hipotecario: Number(fila.hipotecario || 0),
          tarjetas: Number(fila.tarjetas || 0),
          bancien: Number(fila.bancien || 0),
          activos: Number(fila.activos || 0),
          crezcamos: Number(fila.crezcamos || 0),
          mission: Number(fila.mission || 0),
          finexus: Number(fila.finexus || 0),
          valorenz: Number(fila.valorenz || 0),
          lagobo: Number(fila.lagobo || 0),
          total: Number(fila.total || 0),
          cantidad_creditos: Number(fila.cantidadCreditos || 0),
          calculado_por: calculadoPor,
          estado_pago: obtenerEstadoPagoComisionDesdeFila(mapaEstadosPrevios.get(asesorId)),
          tipo_descuento_anticipado: String(mapaEstadosPrevios.get(asesorId)?.tipo_descuento_anticipado || "porcentaje").trim().toLowerCase() === "fijo" ? "fijo" : "porcentaje",
          porcentaje_descuento_anticipado: Number(mapaEstadosPrevios.get(asesorId)?.porcentaje_descuento_anticipado || 0),
          valor_fijo_anticipado: Number(mapaEstadosPrevios.get(asesorId)?.valor_fijo_anticipado || 0),
          valor_descuento_anticipado: Number(mapaEstadosPrevios.get(asesorId)?.valor_descuento_anticipado || 0),
          total_neto_pagar: Number(mapaEstadosPrevios.get(asesorId)?.total_neto_pagar || fila.total || 0)
        };
      })
      .filter(Boolean);

    if (!payload.length) {
      mostrarMensaje(null, "error", "No hay cabeceras válidas para guardar.");
      return;
    }

    const payloadNormalizado = payload.map((fila) => {
      const anticipo = calcularTotalesAnticipoComision(fila);
      return {
        ...fila,
        tipo_descuento_anticipado: anticipo.tipoDescuento,
        porcentaje_descuento_anticipado: anticipo.tipoDescuento === "porcentaje" ? anticipo.porcentaje : 0,
        valor_fijo_anticipado: anticipo.tipoDescuento === "fijo" ? anticipo.valorFijo : 0,
        valor_descuento_anticipado: anticipo.descuento,
        total_neto_pagar: anticipo.totalNeto,
      };
    });

    const { error: upsertError } = await supabaseClient
      .from("comisiones_calculadas")
      .upsert(payloadNormalizado, { onConflict: "periodo,asesor_id" });

    if (upsertError) throw upsertError;

    const asesorIds = payload.map((x) => x.asesor_id).filter(Boolean);
    const { data: cabeceras, error: readError } = await supabaseClient
      .from("comisiones_calculadas")
      .select("id, asesor_id, periodo")
      .eq("periodo", periodoInfo.periodo)
      .in("asesor_id", asesorIds);

    if (readError) throw readError;

    const mapaCabeceras = new Map((cabeceras || []).map((x) => [String(x.asesor_id || "").trim(), x.id]));
    const idsCabecera = [...new Set((cabeceras || []).map((x) => x.id).filter(Boolean))];

    if (!idsCabecera.length) {
      throw new Error("No se pudieron recuperar las cabeceras guardadas de comisiones.");
    }

    if (idsCabecera.length) {
      const { error: deleteError } = await supabaseClient
        .from("comisiones_detalle")
        .delete()
        .in("comision_id", idsCabecera);
      if (deleteError) throw deleteError;
    }

    const detallesPayload = detallesCacheFusionados
      .map((det) => ({
        comision_id: mapaCabeceras.get(String(det.asesor_id || "")),
        periodo: periodoInfo.periodo,
        anio: periodoInfo.anio,
        mes: mesTexto,
        asesor_id: String(det.asesor_id || "").trim(),
        asesor_nombre: String(det.asesor_nombre || "").trim(),
        entidad: String(det.entidad || "").trim(),
        numero_credito: String(det.numero_credito || "").trim(),
        cedula_cliente: String(det.cedula_cliente || "").trim(),
        nombre_cliente: String(det.nombre_cliente || "").trim(),
        linea: String(det.linea || "").trim(),
        seguro: String(det.seguro || "-").trim(),
        valor_libranza: Number(det.valor_libranza || 0),
        comision_libranza: Number(det.comision_libranza || 0),
        valor_consumo: Number(det.valor_consumo || 0),
        comision_consumo: Number(det.comision_consumo || 0),
        valor_hipotecario: Number(det.valor_hipotecario || 0),
        comision_hipotecario: Number(det.comision_hipotecario || 0),
        cantidad_tc: Number(det.cantidad_tc || 0),
        comision_tc: Number(det.comision_tc || 0),
        estado_negocio: det.estado_negocio || null,
        observacion: det.observacion || null,
        editado_manual: !!det.editado_manual,
        editado_en: det.editado_en || null,
        manual_comision_libranza: !!det.manual_comision_libranza,
        manual_comision_consumo: !!det.manual_comision_consumo,
        manual_comision_hipotecario: !!det.manual_comision_hipotecario,
        manual_comision_tc: !!det.manual_comision_tc
      }))
      .filter((x) => x.comision_id && x.asesor_id);

    let resumenInsercionDetalles = { inserted: 0, removedColumns: [], duplicatesRemoved: 0 };

    if (detallesPayload.length) {
      resumenInsercionDetalles = await insertarDetallesComisionRobusto(detallesPayload);
    }

    const avisoColumnas = resumenInsercionDetalles.removedColumns.length
      ? ` Columnas omitidas automáticamente: ${resumenInsercionDetalles.removedColumns.join(", ")}.`
      : "";

    const avisoDuplicados = resumenInsercionDetalles.duplicatesRemoved
      ? ` Duplicados removidos: ${resumenInsercionDetalles.duplicatesRemoved}.`
      : "";

    mostrarMensaje(
      null,
      "exito",
      `✅ Se guardaron ${payloadNormalizado.length} comisiones y ${resumenInsercionDetalles.inserted} detalles del periodo ${mesTexto} ${periodoInfo.anio}.${avisoDuplicados}${avisoColumnas}`
    );

    invalidateTab("comisiones");
    await cargarComisionesGuardadas();
    mostrarComisionesGuardadas();
  } catch (error) {
    console.error("Error guardando comisiones:", error);
    mostrarMensaje(
      null,
      "error",
      "Error guardando comisiones: " +
      (error?.message || error?.details || error?.hint || JSON.stringify(error))
    );
  }
}

/* ==========================================
   COMISIONES GUARDADAS
========================================== */

async function cargarComisionesGuardadas() {
  const tbody = $("tabla-comisiones-guardadas-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="21" class="px-4 py-6 text-center text-gray-500">
        <i class="fas fa-spinner fa-spin mr-2"></i>Cargando comisiones guardadas...
      </td>
    </tr>
  `;

  try {
    let query = supabaseClient
      .from("comisiones_calculadas")
      .select("*")
      .order("periodo", { ascending: false })
      .order("asesor_nombre", { ascending: true });

    const filtroMes = obtenerFiltroMesComisionesGuardadas();
    const filtroAsesor = obtenerFiltroAsesorComisionesGuardadas();

    // ✅ FILTRO POR MES CORREGIDO
    if (filtroMes) {
      const [anio, mes] = filtroMes.split("-");

      const fechaInicio = `${anio}-${mes}-01`;

      let siguienteMes = Number(mes) + 1;
      let siguienteAnio = Number(anio);

      if (siguienteMes > 12) {
        siguienteMes = 1;
        siguienteAnio++;
      }

      const fechaFin = `${siguienteAnio}-${String(siguienteMes).padStart(2, "0")}-01`;

      query = query
        .gte("periodo", fechaInicio)
        .lt("periodo", fechaFin);
    }

    // ✅ FILTRO POR ASESOR
    if (filtroAsesor) {
      query = query.eq("asesor_id", filtroAsesor);
    }

    const { data, error } = await query;

    if (error) throw error;

    const filas = Array.isArray(data) ? data : [];

    sincronizarOpcionesFiltroComisionesGuardadas();

    if (!filas.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="21" class="px-4 py-6 text-center text-gray-500">
            No hay comisiones guardadas para los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filas.map((f) => {
      const estadoPago = obtenerEstadoPagoComisionDesdeFila(f);

      const asesorClase = estadoPago === "pagado"
        ? "text-green-700 line-through"
        : estadoPago === "pago parcial"
          ? "text-red-700"
          : "text-gray-800";

      const anticipo = calcularTotalesAnticipoComision(f);

      return `
        <tr class="border-b hover:bg-gray-50 transition align-top">
          <td class="px-4 py-3">
            <div class="space-y-2">
              <div>
                <div class="font-semibold ${asesorClase}">
                  ${f.asesor_nombre || ""}
                </div>
                <div class="text-xs text-gray-400">
                  ${f.asesor_id || ""}
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <select
                  class="mt-2 w-full border border-gray-200 bg-white px-2 py-1 rounded text-xs"
                  onchange="cambiarEstadoPagoComision('${f.id}', this.value)"
                >
                  <option value="pendiente" ${estadoPago === "pendiente" ? "selected" : ""}>
                    Pendiente
                  </option>

                  <option value="pago parcial" ${estadoPago === "pago parcial" ? "selected" : ""}>
                    Pago parcial
                  </option>

                  <option value="pagado" ${estadoPago === "pagado" ? "selected" : ""}>
                    Pagado
                  </option>
                </select>
              </div>
            </div>
          </td>

          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.libranza || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.credivillas || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.banco_union || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.hipotecario || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.tarjetas || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.bancien || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.activos || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.crezcamos || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.mission || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.finexus || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.valorenz || 0)}</td>
          <td class="px-4 py-3 text-center">${renderValorSoloLecturaComisionGuardada(f.lagobo || 0)}</td>

          <td class="px-4 py-3 text-center font-bold">
            ${renderValorSoloLecturaComisionGuardada(anticipo.totalBruto || 0)}
          </td>

          <td class="px-4 py-3 text-center">
            ${renderSelectorTipoDescuentoEditableComision(f)}
          </td>

          <td class="px-4 py-3 text-center">
            ${renderInputPorcentajeAnticipoEditableComision(f)}
          </td>

          <td class="px-4 py-3 text-center">
            ${renderInputValorFijoEditableComision(f)}
          </td>

          <td class="px-4 py-3 text-center text-red-600 font-semibold">
            ${formatCurrencyComision(anticipo.descuento || 0)}
          </td>

          <td class="px-4 py-3 text-center text-green-700 font-bold">
            ${formatCurrencyComision(anticipo.totalNeto || 0)}
          </td>

          <td class="px-4 py-3 text-center">
            ${renderValorSoloLecturaComisionGuardada(f.cantidad_creditos || 0, "entero")}
          </td>

          <td class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-2">
              <button
                onclick="abrirDetalleEditableDesdeGuardada('${f.id}')"
                class="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
              >
                Ver detalle
              </button>

              <button
                onclick="abrirComprobanteComisionDesdeGuardada('${f.id}')"
                class="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                PDF
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

  } catch (error) {
    console.error("Error cargando comisiones guardadas:", error);

    tbody.innerHTML = `
      <tr>
        <td colspan="21" class="px-4 py-6 text-center text-red-600">
          Error cargando comisiones guardadas.
        </td>
      </tr>
    `;
  }
}


async function abrirDetalleEditableDesdeGuardada(comisionId) {
  try {
    const { data: cabecera, error: cabError } = await supabaseClient
      .from("comisiones_calculadas")
      .select("*")
      .eq("id", comisionId)
      .single();

    if (cabError) throw cabError;

    const { data: detalle, error: detError } = await supabaseClient
      .from("comisiones_detalle")
      .select("*")
      .eq("comision_id", comisionId)
      .order("entidad", { ascending: true })
      .order("nombre_cliente", { ascending: true });

    if (detError && !String(detError.message || "").toLowerCase().includes("does not exist")) {
      throw detError;
    }

    renderDetalleEditableComision(cabecera, Array.isArray(detalle) ? detalle : []);
    document.getElementById("modal-detalle-comision")?.classList.add("visible");
  } catch (error) {
    console.error("Error abriendo detalle editable:", error);
    mostrarMensaje(null, "error", "No fue posible abrir el detalle editable.");
  }
}

function cerrarDetalleEditableComision() {
  document.getElementById("modal-detalle-comision")?.classList.remove("visible");
}

function resolverCampoDetalleEditable(detalle) {
  const linea = String(detalle?.linea || "").toLowerCase();

  if (linea.includes("tarjeta")) return "comision_tc";
  if (linea.includes("hipotecario")) return "comision_hipotecario";
  if (linea.includes("libranza")) return "comision_libranza";
  return "comision_consumo";
}

function obtenerValorActualDetalle(detalle) {
  const campo = resolverCampoDetalleEditable(detalle);
  return Number(detalle?.[campo] || 0);
}

function renderDetalleEditableComision(cabecera, detalles = []) {
  const resumen = document.getElementById("detalle-comision-resumen");
  const tbody = document.getElementById("detalle-comision-body");

  if (resumen) {
    resumen.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-2">
        <div class="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2"><b>Asesor:</b> ${cabecera?.asesor_nombre || "-"}</div>
        <div class="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2"><b>Cédula:</b> ${cabecera?.asesor_id || "-"}</div>
        <div class="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2"><b>Periodo:</b> ${cabecera?.mes || "-"} ${cabecera?.anio || ""}</div>
        <div class="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2"><b>Total actual:</b> ${formatCurrencyComision(cabecera?.total || 0)}</div>
      </div>
    `;
  }

  if (!tbody) return;

  if (!Array.isArray(detalles) || !detalles.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-4 py-4 text-center text-gray-500">
          No hay detalle disponible.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = detalles.map((d) => {
    const campo = resolverCampoDetalleEditable(d);
    const valor = obtenerValorActualDetalle(d);

    return `
      <tr>
        <td class="px-3 py-2 border border-gray-200">${d.entidad || "-"}</td>
        <td class="px-3 py-2 border border-gray-200">${formatearNombrePropio(resolverNombreClienteDetalleComision(d))}</td>
        <td class="px-3 py-2 border border-gray-200">${d.linea || "-"}</td>
        <td class="px-3 py-2 border border-gray-200">${formatCurrencyComision(valor)}</td>
        <td class="px-3 py-2 border border-gray-200">
          <input
            type="number"
            min="0"
            step="1"
            id="detalle-input-${d.id}"
            value="${valor}"
            class="w-36 rounded border border-gray-300 px-2 py-1"
          />
        </td>
        <td class="px-3 py-2 border border-gray-200">
          <button
            onclick="guardarFilaDetalleComision('${cabecera.id}', '${d.id}', '${campo}')"
            class="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
          >
            Guardar
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

async function guardarFilaDetalleComision(comisionId, detalleId, campo) {
  try {
    const input = document.getElementById(`detalle-input-${detalleId}`);
    const valor = Number(input?.value || 0);

    const payload = {
      [campo]: valor,
      editado_manual: true,
      editado_en: new Date().toISOString()
    };

    if (campo === "comision_libranza") payload.manual_comision_libranza = true;
    if (campo === "comision_consumo") payload.manual_comision_consumo = true;
    if (campo === "comision_hipotecario") payload.manual_comision_hipotecario = true;
    if (campo === "comision_tc") payload.manual_comision_tc = true;

    const { error } = await supabaseClient
      .from("comisiones_detalle")
      .update(payload)
      .eq("id", detalleId);

    if (error) throw error;

    await recalcularCabeceraDesdeDetalle(comisionId);
    await abrirDetalleEditableDesdeGuardada(comisionId);
    await cargarComisionesGuardadas();

    mostrarMensaje(null, "exito", "Detalle actualizado correctamente.");
  } catch (error) {
    console.error("Error guardando fila del detalle:", error);
    mostrarMensaje(null, "error", "No fue posible guardar la fila.");
  }
}

async function recalcularCabeceraDesdeDetalle(comisionId) {
  const { data: detalles, error } = await supabaseClient
    .from("comisiones_detalle")
    .select("*")
    .eq("comision_id", comisionId);

  if (error) throw error;

  let libranza = 0;
  let credivillas = 0;
  let hipotecario = 0;
  let tarjetas = 0;
  let cantidadCreditos = Array.isArray(detalles) ? detalles.length : 0;

  for (const d of detalles || []) {
    libranza += Number(d.comision_libranza || 0);
    credivillas += Number(d.comision_consumo || 0);
    hipotecario += Number(d.comision_hipotecario || 0);
    tarjetas += Number(d.comision_tc || 0);
  }

  const total = libranza + credivillas + hipotecario + tarjetas;

  const { data: cabecera, error: cabError } = await supabaseClient
    .from("comisiones_calculadas")
    .select("tipo_descuento_anticipado, porcentaje_descuento_anticipado, valor_fijo_anticipado")
    .eq("id", comisionId)
    .single();

  if (cabError) throw cabError;

  let descuento = 0;
  if ((cabecera?.tipo_descuento_anticipado || "porcentaje") === "fijo") {
    descuento = Number(cabecera?.valor_fijo_anticipado || 0);
  } else {
    descuento = total * (Number(cabecera?.porcentaje_descuento_anticipado || 0) / 100);
  }

  const totalNeto = Math.max(0, total - descuento);

  const { error: updError } = await supabaseClient
    .from("comisiones_calculadas")
    .update({
      libranza,
      credivillas,
      hipotecario,
      tarjetas,
      total,
      cantidad_creditos: cantidadCreditos,
      valor_descuento_anticipado: descuento,
      total_neto_pagar: totalNeto,
      updated_at: new Date().toISOString()
    })
    .eq("id", comisionId);

  if (updError) throw updError;
}

/* ==========================================
   COMPROBANTE / PDF
========================================== */

async function abrirComprobanteComisionDesdeGuardada(comisionId) {
  try {
    const { data: cabecera, error: cabError } = await supabaseClient
      .from("comisiones_calculadas")
      .select("*")
      .eq("id", comisionId)
      .single();

    if (cabError) throw cabError;

    const { data: detalle, error: detError } = await supabaseClient
      .from("comisiones_detalle")
      .select("*")
      .eq("comision_id", comisionId)
      .order("entidad", { ascending: true })
      .order("nombre_cliente", { ascending: true });

    if (detError && !String(detError.message || "").toLowerCase().includes("does not exist")) {
      throw detError;
    }

    abrirComprobanteComision(cabecera, Array.isArray(detalle) ? detalle : []);
  } catch (error) {
    console.error("Error abriendo comprobante:", error);
    mostrarMensaje(null, "error", "No fue posible abrir el comprobante.");
  }
}

function llenarTablaComprobanteComision(cabecera, detalles = []) {
  const tbody = $("tabla-comprobante-comision-body");
  const totalEl = $("tabla-comprobante-total");
  if (!tbody) return;

  if (!Array.isArray(detalles) || !detalles.length) {
    const filasFallback = [];

    const pushFallback = (entidad, linea, valorKey, comKey, tc = 0) => {
      const valor = Number(cabecera?.[valorKey] || 0);
      const com = Number(cabecera?.[comKey] || 0);
      if (!valor && !com && !tc) return;

      filasFallback.push({
        entidad,
        cedula_cliente: cabecera?.asesor_id || "",
        nombre_cliente: cabecera?.asesor_nombre || "",
        linea,
        seguro: "-",
        valor_libranza: linea === "Libranza" ? valor : 0,
        comision_libranza: linea === "Libranza" ? com : 0,
        valor_consumo: linea === "Consumo" ? valor : 0,
        comision_consumo: linea === "Consumo" ? com : 0,
        valor_hipotecario: linea === "Hipotecario" ? valor : 0,
        comision_hipotecario: linea === "Hipotecario" ? com : 0,
        cantidad_tc: linea === "Tarjeta de Credito" ? tc : 0,
        comision_tc: linea === "Tarjeta de Credito" ? com : 0
      });
    };

    pushFallback("AV Villas", "Libranza", "libranza", "libranza");
    pushFallback("AV Villas", "Consumo", "credivillas", "credivillas");
    pushFallback("AV Villas", "Hipotecario", "hipotecario", "hipotecario");
    pushFallback("AV Villas", "Tarjeta de Credito", "tarjetas", "tarjetas", Number(cabecera?.tarjetas || 0));
    pushFallback("Banco Unión", "Libranza", "banco_union", "banco_union");
    pushFallback("Bancien", "Libranza", "bancien", "bancien");
    pushFallback("Activos y Finanzas", "Libranza", "activos", "activos");
    pushFallback("Crezcamos", "Libranza", "crezcamos", "crezcamos");
    pushFallback("Mission", "Libranza", "mission", "mission");
    pushFallback("Finexus", "Libranza", "finexus", "finexus");
    pushFallback("Valorenz", "Libranza", "valorenz", "valorenz");
    pushFallback("Lagobo", "Libranza", "lagobo", "lagobo");

    detalles = filasFallback;
  }

  if (!detalles.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" class="px-4 py-6 text-center text-gray-500">
          No hay detalle disponible para esta comisión.
        </td>
      </tr>
    `;
    if (totalEl) totalEl.textContent = formatCurrency(cabecera?.total || 0);
    return;
  }

  tbody.innerHTML = detalles.map((d) => `
    <tr>
      <td class="border border-black px-2 py-2">${d.entidad || "-"}</td>
      <td class="border border-black px-2 py-2">${d.cedula_cliente || "-"}</td>
      <td class="border border-black px-2 py-2">${formatearNombrePropio(resolverNombreClienteDetalleComision(d))}</td>
      <td class="border border-black px-2 py-2">${d.linea || "-"}</td>
      <td class="border border-black px-2 py-2">${d.seguro || "-"}</td>
      <td class="border border-black px-2 py-2">${Number(d.valor_libranza || 0) > 0 ? formatCurrency(d.valor_libranza) : "-"}</td>
      <td class="border border-black px-2 py-2">${Number(d.comision_libranza || 0) > 0 ? formatCurrency(d.comision_libranza) : "-"}</td>
      <td class="border border-black px-2 py-2">${Number(d.valor_consumo || 0) > 0 ? formatCurrency(d.valor_consumo) : "-"}</td>
      <td class="border border-black px-2 py-2">${Number(d.comision_consumo || 0) > 0 ? formatCurrency(d.comision_consumo) : "-"}</td>
      <td class="border border-black px-2 py-2">${Number(d.valor_hipotecario || 0) > 0 ? formatCurrency(d.valor_hipotecario) : "-"}</td>
      <td class="border border-black px-2 py-2">${Number(d.comision_hipotecario || 0) > 0 ? formatCurrency(d.comision_hipotecario) : "-"}</td>
      <td class="border border-black px-2 py-2">${Number(d.cantidad_tc || 0) > 0 ? Number(d.cantidad_tc || 0) : "-"}</td>
      <td class="border border-black px-2 py-2">${Number(d.comision_tc || 0) > 0 ? formatCurrency(d.comision_tc) : "-"}</td>
    </tr>
  `).join("");

  const total = detalles.reduce(
    (acc, d) =>
      acc +
      Number(d.comision_libranza || 0) +
      Number(d.comision_consumo || 0) +
      Number(d.comision_hipotecario || 0) +
      Number(d.comision_tc || 0),
    0
  );

  const anticipo = calcularTotalesAnticipoComision({
    ...cabecera,
    total: total || cabecera?.total || 0,
  });

  if (totalEl) totalEl.textContent = formatCurrency(anticipo.totalNeto || 0);
}

const cacheDatosAsesorComprobante = new Map();

async function obtenerDatosAsesorComprobante(cedula) {
  const key = String(cedula || "").trim();
  if (!key || key === "sin-id") return {};
  if (cacheDatosAsesorComprobante.has(key)) return cacheDatosAsesorComprobante.get(key);

  try {
    const { data, error } = await supabaseClient
      .from("asesores")
      .select("*")
      .eq("cedula", key)
      .maybeSingle();

    if (error) throw error;

    const info = data || {};
    cacheDatosAsesorComprobante.set(key, info);
    return info;
  } catch (error) {
    console.warn("No fue posible cargar los datos bancarios del asesor para el comprobante:", error);
    const vacio = {};
    cacheDatosAsesorComprobante.set(key, vacio);
    return vacio;
  }
}

function obtenerPrimerValorAsesor(origen = {}, claves = []) {
  for (const clave of claves) {
    const valor = origen?.[clave];
    if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
      return String(valor).trim();
    }
  }
  return "";
}

function tituloOracionComision(texto) {
  const limpio = String(texto || "")
    .trim()
    .toLocaleLowerCase("es-CO")
    .replace(/\s+/g, " ");

  if (!limpio) return "";

  return limpio.replace(/^([¿¡"'\(\[\s]*)([a-záéíóúüñ])/iu, (_, prefijo, letra) => {
    return prefijo + letra.toLocaleUpperCase("es-CO");
  });
}

function formatearNombrePropio(texto) {
  return String(texto || "")
    .toLocaleLowerCase("es-CO")
    .replace(/\b([a-záéíóúüñ])/giu, (letra) => letra.toLocaleUpperCase("es-CO"))
    .replace(/\s+/g, " ")
    .trim();
}

function cargarImagenComoDataURL(src) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}

function numeroALetrasComision(valor) {
  const numero = Number(valor || 0);

  function formatearTipoOracion(texto) {
    const limpio = String(texto || "")
      .trim()
      .toLocaleLowerCase("es-CO")
      .replace(/\s+/g, " ");

    if (!limpio) return "";

    return limpio.replace(/^([¿¡"'\(\[\s]*)([a-záéíóúüñ])/iu, (_, prefijo, letra) => {
      return prefijo + letra.toLocaleUpperCase("es-CO");
    });
  }

  if (!Number.isFinite(numero)) return "Cero pesos m/cte";

  const parteEntera = Math.floor(numero);
  const parteDecimal = Math.round((numero - parteEntera) * 100);

  const UNIDADES = [
    "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
    "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
    "DIECIOCHO", "DIECINUEVE", "VEINTE"
  ];

  const DECENAS = [
    "", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA",
    "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"
  ];

  const CENTENAS = [
    "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS",
    "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"
  ];

  function convertirMenorDe100(n) {
    if (n <= 20) return UNIDADES[n];
    if (n < 30) return n === 21 ? "VEINTIUNO" : "VEINTI" + UNIDADES[n - 20];

    const decena = Math.floor(n / 10);
    const unidad = n % 10;
    return unidad === 0 ? DECENAS[decena] : `${DECENAS[decena]} Y ${UNIDADES[unidad]}`;
  }

  function convertirMenorDe1000(n) {
    if (n === 0) return "";
    if (n === 100) return "CIEN";
    if (n < 100) return convertirMenorDe100(n);

    const centena = Math.floor(n / 100);
    const resto = n % 100;
    return resto === 0 ? CENTENAS[centena] : `${CENTENAS[centena]} ${convertirMenorDe100(resto)}`;
  }

  function convertirNumero(n) {
    if (n === 0) return "CERO";
    if (n < 1000) return convertirMenorDe1000(n);

    if (n < 1000000) {
      const miles = Math.floor(n / 1000);
      const resto = n % 1000;
      const milesTexto = miles === 1 ? "MIL" : `${convertirMenorDe1000(miles)} MIL`;
      return resto === 0 ? milesTexto : `${milesTexto} ${convertirMenorDe1000(resto)}`;
    }

    if (n < 1000000000000) {
      const millones = Math.floor(n / 1000000);
      const resto = n % 1000000;
      const millonesTexto = millones === 1
        ? "UN MILLÓN"
        : `${convertirNumero(millones)} MILLONES`;
      return resto === 0 ? millonesTexto : `${millonesTexto} ${convertirNumero(resto)}`;
    }

    return n.toLocaleString("es-CO");
  }

  const letrasEntero = convertirNumero(parteEntera);
  const decimales = String(parteDecimal).padStart(2, "0");

  return formatearTipoOracion(`${letrasEntero} ${decimales}/100 pesos m/cte`);
}

let ultimoComprobantePDFUrl = null;

function obtenerNombreArchivoComprobantePDF() {
  const asesor = String($("print-asesor-nombre")?.textContent || "comprobante")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  const mes = String($("print-mes")?.textContent || "").trim().toLowerCase();
  const anio = String($("print-anio")?.textContent || "").trim();
  const partes = ["comprobante_comision", asesor || "asesor"];

  if (mes) partes.push(mes);
  if (anio) partes.push(anio);

  return `${partes.join("_")}.pdf`;
}

function obtenerFilasTablaComprobantePDF() {
  return $$("#tabla-comprobante-comision-body tr")
    .map((tr) => $$("td", tr).map((td) => (td.textContent || "").trim()))
    .filter((fila) => fila.length === 13);
}

async function generarComprobantePDFBlob() {
  const { jsPDF } = window.jspdf || {};

  if (!jsPDF) {
    throw new Error("La librería jsPDF no está disponible.");
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const fechaHoy = $("print-fecha-hoy")?.textContent?.trim() || "";
  const nitEmpresa = $("print-nit-empresa")?.textContent?.trim() || "";
  const asesorNombre = $("print-asesor-nombre")?.textContent?.trim() || "-";
  const asesorCedula = $("print-asesor-cedula")?.textContent?.trim() || "-";
  const asesorTelefono = $("print-asesor-telefono")?.textContent?.trim() || "-";
  const asesorCuenta = $("print-asesor-cuenta")?.textContent?.trim() || "-";
  const asesorBanco = $("print-asesor-banco")?.textContent?.trim() || "-";
  const totalLetras = $("print-total-letras")?.textContent?.trim() || "";
  const mes = $("print-mes")?.textContent?.trim() || "";
  const anio = $("print-anio")?.textContent?.trim() || "";
  const total = $("tabla-comprobante-total")?.textContent?.trim() || "$0,00";
  const totalBruto = $("print-total-bruto")?.textContent?.trim() || "$0,00";
  const descuentoPct = $("print-descuento-pct")?.textContent?.trim() || "";
  const descuentoValor = $("print-descuento-valor")?.textContent?.trim() || "";
  const mostrarDescuentoAnticipado = !!(descuentoPct && descuentoValor);
  const filas = obtenerFilasTablaComprobantePDF();
  const logoDataUrl = await cargarImagenComoDataURL("logo.png");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const centerX = pageWidth / 2;
  const usableWidth = pageWidth - marginX * 2;

  const addText = (value, x, y, options = {}) => {
    const xx = Number(x);
    const yy = Number(y);
    if (isNaN(xx) || isNaN(yy)) return;
    doc.text(String(value ?? ""), xx, yy, options);
  };

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  if (logoDataUrl && doc.GState) {
    try {
      doc.setGState(new doc.GState({ opacity: 0.05 }));
      const imgWidth = 120;
      const imgHeight = 120;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;
      doc.addImage(logoDataUrl, "PNG", x, y, imgWidth, imgHeight);
      doc.setGState(new doc.GState({ opacity: 1 }));
    } catch (e) {
      console.warn("No se pudo aplicar marca de agua:", e);
    }
  }

  doc.setTextColor(33, 37, 41);
  doc.setDrawColor(180, 180, 180);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  addText("Credibank Grupo Financiero S. A. S.", centerX, 18, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  addText(`NIT ${nitEmpresa}`, centerX, 24, { align: "center" });
  addText(tituloOracionComision(fechaHoy), pageWidth - 10, 20, { align: "right" });

  doc.setLineWidth(0.4);
  doc.line(marginX, 28, pageWidth - marginX, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  addText("Debe a:", centerX, 47, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  addText(formatearNombrePropio(asesorNombre), centerX, 55, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  addText(`Cédula: ${asesorCedula}`, centerX, 62, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  addText("La suma de:", marginX, 72);

  doc.setFont("helvetica", "normal");
  const sumaTexto = doc.splitTextToSize(totalLetras || "-", usableWidth - 55);
  doc.text(sumaTexto, 38, 72);

  const sumaHeight = sumaTexto.length * 5;
  const conceptoY = 72 + sumaHeight + 5;

  const concepto =
    "Por concepto de: Colocación de productos crediticios para las diferentes entidades financieras.";

  const conceptoTexto = doc.splitTextToSize(concepto, usableWidth - 60);
  doc.text(conceptoTexto, marginX, conceptoY);

  doc.setFont("helvetica", "bold");
  addText(`${tituloOracionComision(mes)} ${anio}`, pageWidth - 12, conceptoY, { align: "right" });

  const startY = conceptoY + conceptoTexto.length * 5 + 5;

  doc.autoTable({
    startY,
    head: [[
      "Entidad", "Cédula", "Nombre", "Línea", "Seguro",
      "Libranza", "Comisión", "Consumo", "Comisión",
      "Hipotecario", "Comisión", "Tarjeta de crédito", "Comisión"
    ]],
    body: filas,
    theme: "grid",
    styles: {
      fontSize: 7.5,
      halign: "center",
      valign: "middle",
      lineColor: [210, 210, 210],
      lineWidth: 0.1,
      cellPadding: 1.8,
      textColor: [33, 37, 41]
    },
    headStyles: {
      fillColor: [25, 135, 84],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center"
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250]
    },
    margin: { left: marginX, right: marginX }
  });

  const finalY = doc.lastAutoTable.finalY + 8;

  const resumenX = pageWidth - 82;
  const resumenY = finalY - 2;
  const resumenW = 72;
  const resumenH = mostrarDescuentoAnticipado ? 22 : 15;

  doc.setDrawColor(180, 180, 180);
  doc.roundedRect(resumenX, resumenY, resumenW, resumenH, 2, 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Total bruto: ${totalBruto}`, pageWidth - 12, finalY + 4, { align: "right" });

  if (mostrarDescuentoAnticipado) {
    doc.setFont("helvetica", "normal");
    doc.text(`Descuento anticipado (${descuentoPct}): ${descuentoValor}`, pageWidth - 12, finalY + 10, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.text(`Total a pagar: ${total}`, pageWidth - 12, finalY + 16, { align: "right" });
  } else {
    doc.text(`Total a pagar: ${total}`, pageWidth - 12, finalY + 10, { align: "right" });
  }

  const footerY = pageHeight - 28;
  const footerLeftX = marginX;
  const footerRightX = 70;
  const footerNameY = footerY + 2;

  doc.setLineWidth(0.35);
  doc.line(marginX, footerY - 4, 150, footerY - 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  addText(formatearNombrePropio(asesorNombre), footerLeftX, footerNameY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  addText(`Cédula: ${asesorCedula}`, footerLeftX, footerY + 8);
  addText(`Teléfono: ${asesorTelefono}`, footerLeftX, footerY + 14);
  addText(`Cuenta: ${asesorCuenta}`, footerRightX, footerY + 8);
  addText(`Banco: ${asesorBanco}`, footerRightX, footerY + 14);

  return doc.output("blob");
}

async function verComprobantePDF() {
  try {
    const blob = await generarComprobantePDFBlob();

    if (ultimoComprobantePDFUrl) {
      URL.revokeObjectURL(ultimoComprobantePDFUrl);
    }

    ultimoComprobantePDFUrl = URL.createObjectURL(blob);
    window.open(ultimoComprobantePDFUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Error al abrir el comprobante PDF:", error);
    mostrarMensaje(null, "error", "No fue posible abrir el comprobante en PDF.");
  }
}

async function descargarComprobantePDF() {
  try {
    const blob = await generarComprobantePDFBlob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = obtenerNombreArchivoComprobantePDF();
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (error) {
    console.error("Error al descargar el comprobante PDF:", error);
    mostrarMensaje(null, "error", "No fue posible descargar el comprobante en PDF.");
  }
}

async function abrirComprobanteComision(cabecera, detalles = []) {
  const anticipo = calcularTotalesAnticipoComision(cabecera);
  const porcentaje = parseInt(anticipo.porcentaje, 10) || 0;
  const valor = Number(anticipo.descuento || 0);
  const esFijo = anticipo.tipoDescuento === "fijo";

  setText("print-fecha-hoy", new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }));
  setText("print-asesor-nombre", cabecera?.asesor_nombre || "");
  setText("print-asesor-cedula", cabecera?.asesor_id || "");
  setText("print-total-letras", numeroALetrasComision(Number(anticipo.totalNeto || 0)));
  setText("print-mes", tituloOracionComision(String(cabecera?.mes || "")));
  setText("print-anio", cabecera?.anio || "");
  setText("print-total-bruto", formatCurrency(anticipo.totalBruto || 0));

  if (valor > 0) {
    setHidden("bloque-descuento-anticipado", false);
    setText("print-descuento-pct", esFijo ? "Valor fijo" : `${porcentaje}%`);
    setText("print-descuento-valor", formatCurrency(valor));
  } else {
    setHidden("bloque-descuento-anticipado", true);
    setText("print-descuento-pct", "");
    setText("print-descuento-valor", "");
  }

  const datosAsesor = await obtenerDatosAsesorComprobante(cabecera?.asesor_id);
  setText("print-asesor-telefono", obtenerPrimerValorAsesor(datosAsesor, ["telefono", "celular", "telefono1", "telefono_1", "phone", "movil"]));
  setText("print-asesor-cuenta", obtenerPrimerValorAsesor(datosAsesor, ["cuenta", "numero_cuenta", "cuenta_bancaria", "nro_cuenta", "cuenta_pago"]));
  setText("print-asesor-banco", obtenerPrimerValorAsesor(datosAsesor, ["banco", "entidad_bancaria", "banco_pago", "nombre_banco"]));

  llenarTablaComprobanteComision(cabecera, detalles);

  try {
    await verComprobantePDF();
  } catch (error) {
    console.error("Error al abrir el comprobante de comisión:", error);
    mostrarMensaje(null, "error", "No fue posible abrir el comprobante en PDF.");
  }
}

// ============================================================
// ✅ Autocompletar datos del asesor logueado
// ============================================================
function autocompletarDatosAsesor() {
  const role = SafeStore.get("userRole");

  // Solo aplica para comerciales
  if (role !== "comercial") return;

  const cedula = SafeStore.get("usuario_cedula") || "";
  const nombre = SafeStore.get("userName") || "";
  const estado = SafeStore.get("usuario_estado") || "";

  // Todos los formularios
  const formularios = [
    {
      cedula: "cedula-asesor-credivillas",
      nombre: "nombre-asesor-credivillas",
      estado: "estado-asesor-credivillas",
    },
    {
      cedula: "cedula-asesor-libranza",
      nombre: "nombre-asesor-libranza",
      estado: "estado-asesor-libranza",
    },
    {
      cedula: "cedula-asesor-hipotecario",
      nombre: "nombre-asesor-hipotecario",
      estado: "estado-asesor-hipotecario",
    },
    {
      cedula: "cedula-asesor-tarjetas",
      nombre: "nombre-asesor-tarjetas",
      estado: "estado-asesor-tarjetas",
    },
    // =========================
    // 🆕 Radicación
    // =========================
    {
      cedula: "cedula-asesor-radicacion",
      nombre: "nombre-asesor-radicacion",
      estado: "estado-asesor-radicacion",
    },
  ];

  formularios.forEach((form) => {
    const cedulaInput = document.getElementById(form.cedula);
    const nombreInput = document.getElementById(form.nombre);
    const estadoInput = document.getElementById(form.estado);

    if (cedulaInput) {
      cedulaInput.value = cedula;
      cedulaInput.readOnly = true;
      cedulaInput.classList.add("bg-gray-100");
    }

    if (nombreInput) {
      nombreInput.value = nombre;
      nombreInput.readOnly = true;
      nombreInput.classList.add("bg-gray-100");
    }

    if (estadoInput) {
      estadoInput.value = estado;
      estadoInput.readOnly = true;
      estadoInput.classList.add("bg-gray-100");
    }
  });
}

// ========================================
// ✅ CONVERTIR INPUTS A MAYÚSCULAS
// ❌ EXCEPTO LOGIN Y EMAIL
// ========================================
document.addEventListener("input", (e) => {
  const el = e.target;

  if (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA"
  ) {

    // ❌ No modificar login
    if (el.closest("#login-modal")) return;

    // ❌ No modificar correos
    if (el.type === "email") return;

    el.value = el.value.toUpperCase();
  }
});