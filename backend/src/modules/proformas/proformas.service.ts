import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';
import { UsuarioActual } from '../../comun/decoradores';
import { CargadoresService } from '../cargadores/cargadores.service';
import { ConfiguracionService, ParametrosFacturacion } from '../configuracion/configuracion.service';
import { OperadoresService } from '../operadores/operadores.service';
import { SesionesService, SesionRegistro } from '../sesiones/sesiones.service';
import { valorEnLetras } from './valor-en-letras';

export interface ClienteProforma {
  nombre: string;
  documento: string; // NIT o CC
  direccion: string;
  ciudad: string;
  telefono: string;
  correo: string;
}

export interface LineaProforma {
  codigo: string;
  descripcion: string;
  detalle: string;
  cantidad: number; // kWh
  unidad: string;
  precio_unitario: number; // sin IVA
  valor_total: number; // sin IVA
}

export interface TotalesProforma {
  total_general: number;
  descuento: number;
  subtotal: number;
  iva_porcentaje: number;
  iva: number;
  total: number;
  retefuente: number;
  reteiva: number;
  reteica: number;
  total_neto: number; // total menos retenciones
}

export interface Proforma {
  id: string;
  numero: string; // PF-000001
  prefijo: string;
  consecutivo: number;
  codigo_verificacion: string; // va en el QR; permite ver el documento sin login
  estado: 'vigente' | 'anulada';
  origen: 'automatica' | 'manual';
  fecha_emision: string;
  fecha_vencimiento: string;
  sesion_id: string;
  operador_id: string;
  numero_serie: string;
  emisor: Omit<ParametrosFacturacion, 'prefijo' | 'siguiente_consecutivo'>;
  punto_carga: { operador: string; ubicacion: string | null; numero_serie: string; modelo: string };
  cliente: ClienteProforma;
  lineas: LineaProforma[];
  totales: TotalesProforma;
  valor_en_letras: string;
  forma_pago: string;
  vendedor: string;
  aplica_retenciones: boolean;
  anulacion: { fecha: string; motivo: string; usuario: string } | null;
}

// Código que la DIAN usa para el consumidor final no identificado.
const DOCUMENTO_CONSUMIDOR_FINAL = '222222222222';
const DIGITOS_CONSECUTIVO = 6;

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ProformasService implements OnModuleInit {
  private readonly proformas = new Map<string, Proforma>();

  constructor(
    private readonly almacen: AlmacenService,
    private readonly configuracion: ConfiguracionService,
    private readonly sesiones: SesionesService,
    private readonly cargadores: CargadoresService,
    private readonly operadores: OperadoresService,
  ) {
    for (const p of this.almacen.leer<Proforma[]>('proformas', [])) this.proformas.set(p.id, p);
  }

  onModuleInit() {
    // Al pagar una carga desde la app se emite su proforma a nombre de consumidor final.
    this.sesiones.registrarProformas({
      alPagar: (sesion) => {
        if (!this.vigenteDeSesion(sesion.id)) this.emitir(sesion, null, false, 'automatica', 'App Electrolineras');
      },
      buscarProforma: (sesion_id) => {
        const p = this.vigenteDeSesion(sesion_id);
        return p ? { id: p.id, numero: p.numero, codigo_verificacion: p.codigo_verificacion, estado: p.estado } : null;
      },
    });
    this.configuracion.registrarConsecutivoLibre((prefijo) => {
      const usados = [...this.proformas.values()].filter((p) => p.prefijo === prefijo).map((p) => p.consecutivo);
      return usados.length ? Math.max(...usados) + 1 : 1;
    });
  }

  // ---------- Consultas ----------

  listar(alcance: string | null, filtro: { estado?: string; q?: string } = {}) {
    const q = filtro.q?.trim().toLowerCase();
    return [...this.proformas.values()]
      .filter((p) => !alcance || p.operador_id === alcance)
      .filter((p) => !filtro.estado || p.estado === filtro.estado)
      .filter(
        (p) =>
          !q ||
          [p.numero, p.cliente.nombre, p.cliente.documento, p.cliente.correo, p.numero_serie, p.punto_carga.operador]
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => b.consecutivo - a.consecutivo || Date.parse(b.fecha_emision) - Date.parse(a.fecha_emision))
      .map(({ id, numero, estado, origen, fecha_emision, cliente, numero_serie, punto_carga, totales, sesion_id, codigo_verificacion }) => ({
        id,
        numero,
        estado,
        origen,
        fecha_emision,
        cliente: { nombre: cliente.nombre, documento: cliente.documento },
        numero_serie,
        operador: punto_carga.operador,
        total: totales.total,
        total_neto: totales.total_neto,
        sesion_id,
        codigo_verificacion,
      }));
  }

  obtener(id: string, alcance: string | null) {
    const p = this.proformas.get(id);
    if (!p) throw new NotFoundException(`No existe la proforma ${id}`);
    if (alcance && p.operador_id !== alcance) throw new ForbiddenException('No tienes acceso a esta proforma');
    return p;
  }

  porCodigo(codigo: string) {
    const p = [...this.proformas.values()].find((x) => x.codigo_verificacion === String(codigo).toUpperCase());
    if (!p) throw new NotFoundException('No encontramos una proforma con ese código');
    return p;
  }

  // ---------- Emisión manual desde el panel ----------

  generar(
    data: { sesion_id: string; cliente?: Partial<ClienteProforma>; aplicar_retenciones?: boolean },
    usuario: UsuarioActual,
    alcance: string | null,
  ) {
    const sesion = this.sesiones.registro(data.sesion_id);
    if (alcance && sesion.operador_id !== alcance) throw new ForbiddenException('No tienes acceso a esta sesión');
    const cliente = data.cliente ? this.validarCliente(data.cliente) : null;
    const existente = this.vigenteDeSesion(sesion.id);
    if (existente) {
      throw new ConflictException(`La sesión ya tiene la proforma ${existente.numero}. Anúlala si necesitas emitir otra.`);
    }
    return this.emitir(sesion, cliente, Boolean(data.aplicar_retenciones), 'manual', usuario.nombre);
  }

  anular(id: string, motivo: string, usuario: UsuarioActual) {
    const p = this.obtener(id, null);
    if (p.estado === 'anulada') throw new ConflictException(`La proforma ${p.numero} ya está anulada`);
    const texto = String(motivo ?? '').trim();
    if (texto.length < 5) throw new BadRequestException('Escribe el motivo de la anulación (mínimo 5 caracteres)');
    p.estado = 'anulada';
    p.anulacion = { fecha: new Date().toISOString(), motivo: texto.slice(0, 300), usuario: usuario.nombre };
    this.persistir();
    return p;
  }

  // ---------- Internos ----------

  private vigenteDeSesion(sesion_id: string) {
    return [...this.proformas.values()].find((p) => p.sesion_id === sesion_id && p.estado === 'vigente') ?? null;
  }

  private emitir(
    sesion: SesionRegistro,
    clienteDado: ClienteProforma | null,
    aplicaRetenciones: boolean,
    origen: Proforma['origen'],
    vendedor: string,
  ): Proforma {
    if (sesion.estado !== 'finalizada' || sesion.costo_total == null) {
      throw new ConflictException('Solo se puede emitir la proforma de una carga finalizada');
    }
    if (sesion.costo_total <= 0) throw new ConflictException('La carga no tiene consumo para facturar');

    const f = this.configuracion.obtener().facturacion;
    const cargador = this.cargadores.findById(sesion.cargador_id);
    const operador = this.operadores.findOne(sesion.operador_id);
    const { prefijo, numero } = this.configuracion.reservarConsecutivo();

    // La tarifa al usuario incluye el IVA (precio al consumidor final): se desagrega.
    const factorIva = 1 + f.iva_porcentaje / 100;
    // Descuento por puntos de la app (valor con IVA): reduce la base antes de impuestos.
    const bruto = r2(sesion.costo_total);
    const descuentoConIva = Math.min(bruto, r2(sesion.descuento_puntos?.valor ?? 0));
    const total = r2(bruto - descuentoConIva);
    const totalGeneral = r2(bruto / factorIva);
    const descuento = r2(descuentoConIva / factorIva);
    const subtotal = r2(total / factorIva);
    const iva = r2(total - subtotal);
    const precioSinIva = r2(sesion.tarifa_por_kwh / factorIva);

    const retefuente = aplicaRetenciones ? r2((subtotal * f.retefuente_porcentaje) / 100) : 0;
    const reteiva = aplicaRetenciones ? r2((iva * f.reteiva_porcentaje) / 100) : 0;
    const reteica = aplicaRetenciones ? r2((subtotal * f.reteica_por_mil) / 1000) : 0;
    const total_neto = Math.round(total - retefuente - reteiva - reteica);

    const emision = new Date();
    const vencimiento = new Date(emision.getTime() + f.dias_vencimiento * 86_400_000);
    const fechaCarga = new Date(sesion.inicio).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'short',
      timeStyle: 'short',
    });

    const { prefijo: _p, siguiente_consecutivo: _s, ...emisor } = f;
    const proforma: Proforma = {
      id: randomUUID(),
      numero: `${prefijo}-${String(numero).padStart(DIGITOS_CONSECUTIVO, '0')}`,
      prefijo,
      consecutivo: numero,
      codigo_verificacion: randomBytes(6).toString('hex').toUpperCase(),
      estado: 'vigente',
      origen,
      fecha_emision: emision.toISOString(),
      fecha_vencimiento: vencimiento.toISOString(),
      sesion_id: sesion.id,
      operador_id: sesion.operador_id,
      numero_serie: sesion.numero_serie,
      emisor,
      punto_carga: {
        operador: operador.nombre,
        ubicacion: cargador.ubicacion,
        numero_serie: cargador.numero_serie,
        modelo: cargador.modelo,
      },
      cliente: clienteDado ?? this.consumidorFinal(sesion.usuario_id),
      lineas: [
        {
          codigo: f.codigo_producto,
          descripcion: f.descripcion_producto,
          detalle: `Cargador ${cargador.numero_serie}${cargador.ubicacion ? `, ${cargador.ubicacion}` : ''}. Carga${sesion.origen === 'rfid' ? ' con tarjeta RFID' : ''} del ${fechaCarga}`,
          cantidad: sesion.kwh_consumidos,
          unidad: 'kWh',
          precio_unitario: precioSinIva,
          valor_total: totalGeneral,
        },
      ],
      totales: {
        total_general: totalGeneral,
        descuento,
        subtotal,
        iva_porcentaje: f.iva_porcentaje,
        iva,
        total,
        retefuente,
        reteiva,
        reteica,
        total_neto,
      },
      valor_en_letras: valorEnLetras(total_neto),
      forma_pago: f.forma_pago,
      vendedor,
      aplica_retenciones: aplicaRetenciones,
      anulacion: null,
    };
    this.proformas.set(proforma.id, proforma);
    this.persistir();
    return proforma;
  }

  // Sin datos del cliente: consumidor final, con el correo o celular que dio en la app.
  private consumidorFinal(contacto: string): ClienteProforma {
    const esCorreo = contacto.includes('@');
    return {
      nombre: 'CONSUMIDOR FINAL',
      documento: DOCUMENTO_CONSUMIDOR_FINAL,
      direccion: '',
      ciudad: '',
      telefono: !esCorreo && !contacto.startsWith('Tarjeta') ? contacto : '',
      correo: esCorreo ? contacto : '',
    };
  }

  private validarCliente(c: Partial<ClienteProforma>): ClienteProforma {
    const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
    const cliente: ClienteProforma = {
      nombre: texto(c.nombre, 120).toUpperCase(),
      documento: texto(c.documento, 30),
      direccion: texto(c.direccion, 120),
      ciudad: texto(c.ciudad, 60),
      telefono: texto(c.telefono, 40),
      correo: texto(c.correo, 120),
    };
    if (!cliente.nombre) throw new BadRequestException('Escribe el nombre o razón social del cliente');
    if (!/^[0-9]{5,15}(-[0-9])?$/.test(cliente.documento)) {
      throw new BadRequestException('El NIT o CC debe tener solo números, con el dígito de verificación opcional (900298074-9)');
    }
    if (cliente.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.correo)) {
      throw new BadRequestException('El correo del cliente no es válido');
    }
    return cliente;
  }

  private persistir() {
    this.almacen.guardar('proformas', [...this.proformas.values()]);
  }
}
