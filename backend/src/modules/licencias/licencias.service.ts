import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createPublicKey, KeyObject, verify } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AlmacenService } from '../../comun/almacen.service';
import { CargadoresService } from '../cargadores/cargadores.service';
import { OcppGatewayService } from '../ocpp-gateway/ocpp-gateway.service';
import { OperadoresService } from '../operadores/operadores.service';
import { SesionesService } from '../sesiones/sesiones.service';

// Licencias de activación por empresa, firmadas por Infraestructura-IT con Ed25519 (ver
// herramientas/licencias). Aquí solo está la llave pública: se verifican sin internet.
// Sin llave pública configurada el licenciamiento queda desactivado (instalaciones de prueba).

export interface Licencia {
  id: string;
  empresa: string;
  nit: string;
  max_cargadores: number;
  emitida: string; // AAAA-MM-DD
  vence: string; // AAAA-MM-DD (vigente hasta el final de ese día)
  activada: string;
  texto: string;
}

export type EstadoLicencia = 'sin_control' | 'sin_licencia' | 'vigente' | 'por_vencer' | 'en_gracia' | 'vencida';

const DIAS_GRACIA = 7;
const DIAS_AVISO = 30;
const DIA_MS = 86_400_000;
const OPERATIVOS: EstadoLicencia[] = ['sin_control', 'vigente', 'por_vencer', 'en_gracia'];

@Injectable()
export class LicenciasService implements OnModuleInit {
  private readonly logger = new Logger(LicenciasService.name);
  private readonly llave: KeyObject | null;
  private licencias: Licencia[];

  constructor(
    private readonly almacen: AlmacenService,
    private readonly operadores: OperadoresService,
    private readonly cargadores: CargadoresService,
    private readonly ocpp: OcppGatewayService,
    private readonly sesiones: SesionesService,
  ) {
    this.licencias = this.almacen.leer<Licencia[]>('licencias', []);
    this.llave = this.cargarLlave();
  }

  onModuleInit() {
    // Reglas de la licencia en los puntos donde se usan los cargadores.
    this.cargadores.registrarValidadorAlta((operador_id) => this.validarAlta(operador_id));
    this.ocpp.registrarValidadorArranque((numero_serie) => this.motivoBloqueo(numero_serie));
    this.sesiones.registrarValidadorInicio((numero_serie) => {
      const motivo = this.motivoBloqueo(numero_serie);
      if (motivo) throw new ConflictException(`Este cargador no está habilitado: ${motivo}`);
    });
  }

  get configurado() {
    return this.llave !== null;
  }

  // Resumen por empresa (panel y avisos). alcance = empresa del usuario (null = todas).
  resumen(alcance: string | null) {
    return {
      configurado: this.configurado,
      dias_gracia: DIAS_GRACIA,
      empresas: this.operadores.findAll(alcance).map((o) => {
        const lic = this.vigenteDe(o.nit);
        const usados = this.cargadores.findAll(o.id).length;
        return {
          operador_id: o.id,
          nombre: o.nombre,
          nit: o.nit,
          estado: this.estado(o.nit),
          licencia: lic ? { ...lic, texto: undefined } : null,
          dias_restantes: lic ? Math.ceil((this.finDe(lic) - Date.now()) / DIA_MS) : null,
          usados,
          max: lic?.max_cargadores ?? null,
        };
      }),
    };
  }

  // Pegar el texto de la licencia en el panel. Un administrador de empresa solo activa la suya.
  activar(texto: string, alcance: string | null) {
    if (!this.llave) throw new ConflictException('El licenciamiento no está configurado en este servidor (falta licencia-publica.pem).');
    const datos = this.leer(texto);
    let empresa = this.operadores.findAll().find((o) => o.nit === datos.nit);
    if (alcance) {
      const propia = this.operadores.findOne(alcance);
      if (empresa && empresa.id !== alcance) throw new ForbiddenException('Esta licencia es de otra empresa');
      if (!empresa) {
        if (propia.nit) throw new BadRequestException(`La licencia es para el NIT ${datos.nit} y tu empresa tiene el NIT ${propia.nit}`);
        // Empresa sin NIT: la licencia se lo asigna.
        this.operadores.actualizar(propia.id, { nit: datos.nit });
        empresa = propia;
      }
    }
    if (!empresa) throw new NotFoundException(`No hay ninguna empresa con NIT ${datos.nit}. Créala o ponle ese NIT en Empresas.`);
    if (this.licencias.some((l) => l.id === datos.id)) throw new ConflictException(`La licencia ${datos.id} ya está activada`);
    const licencia: Licencia = { ...datos, activada: new Date().toISOString(), texto: texto.trim() };
    this.licencias.push(licencia);
    this.persistir();
    this.logger.log(`Licencia ${licencia.id} activada para ${empresa.nombre} (${licencia.max_cargadores} cargadores, vence ${licencia.vence})`);
    return { ...licencia, texto: undefined };
  }

  eliminar(id: string) {
    const antes = this.licencias.length;
    this.licencias = this.licencias.filter((l) => l.id !== id);
    if (this.licencias.length === antes) throw new NotFoundException(`No existe la licencia ${id}`);
    this.persistir();
  }

  // ---------- Reglas ----------

  private estado(nit: string | null): EstadoLicencia {
    if (!this.configurado) return 'sin_control';
    const lic = this.vigenteDe(nit);
    if (!lic) return 'sin_licencia';
    const fin = this.finDe(lic);
    const ahora = Date.now();
    if (ahora <= fin) return fin - ahora <= DIAS_AVISO * DIA_MS ? 'por_vencer' : 'vigente';
    return ahora <= fin + DIAS_GRACIA * DIA_MS ? 'en_gracia' : 'vencida';
  }

  private validarAlta(operador_id: string) {
    if (!this.configurado) return;
    const o = this.operadores.findOne(operador_id);
    const estado = this.estado(o.nit);
    if (!OPERATIVOS.includes(estado)) {
      throw new ConflictException(
        estado === 'sin_licencia'
          ? `La empresa ${o.nombre} no tiene licencia activa. Actívala en Licencias antes de registrar cargadores.`
          : `La licencia de ${o.nombre} venció. Renuévala para registrar cargadores.`,
      );
    }
    const max = this.vigenteDe(o.nit)!.max_cargadores;
    if (this.cargadores.findAll(o.id).length >= max) {
      throw new ConflictException(`La licencia de ${o.nombre} permite ${max} cargador(es) y ya están registrados. Pide una licencia ampliada.`);
    }
  }

  // Motivo por el que un cargador no puede operar (null = puede).
  private motivoBloqueo(numero_serie: string): string | null {
    if (!this.configurado || !this.cargadores.existe(numero_serie)) return null;
    const c = this.cargadores.findByNumeroSerie(numero_serie);
    const o = this.operadores.findOne(c.operador_id);
    const estado = this.estado(o.nit);
    if (estado === 'sin_licencia') return `la empresa ${o.nombre} no tiene licencia activa`;
    if (estado === 'vencida') return `la licencia de ${o.nombre} venció`;
    // Por encima del límite (p. ej. licencia renovada con menos cargadores): los más antiguos siguen.
    const max = this.vigenteDe(o.nit)!.max_cargadores;
    const orden = this.cargadores
      .findAll(o.id)
      .sort((a, b) => Date.parse(a.creado) - Date.parse(b.creado))
      .findIndex((x) => x.numero_serie === numero_serie);
    return orden >= max ? `supera el límite de ${max} cargador(es) de la licencia de ${o.nombre}` : null;
  }

  // La licencia que rige para un NIT: la de vencimiento más lejano (una renovación reemplaza a la anterior).
  private vigenteDe(nit: string | null): Licencia | null {
    if (!nit) return null;
    return (
      this.licencias
        .filter((l) => l.nit === nit)
        .sort((a, b) => this.finDe(b) - this.finDe(a) || b.emitida.localeCompare(a.emitida))[0] ?? null
    );
  }

  // Fin del día de vencimiento, hora de Colombia (UTC-5).
  private finDe(l: Licencia) {
    return Date.parse(`${l.vence}T23:59:59-05:00`);
  }

  private leer(texto: string): Omit<Licencia, 'activada' | 'texto'> {
    const [cuerpo, firma] = String(texto ?? '').trim().split('.');
    if (!cuerpo || !firma) throw new BadRequestException('El texto no parece una licencia (debe tener la forma xxxxx.yyyyy)');
    const valida = verify(null, Buffer.from(cuerpo), this.llave!, Buffer.from(firma, 'base64url'));
    if (!valida) throw new BadRequestException('La firma de la licencia no es válida: no la emitió Infraestructura-IT o fue modificada.');
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('La licencia está dañada');
    }
    const ok =
      typeof d.id === 'string' &&
      typeof d.nit === 'string' &&
      typeof d.empresa === 'string' &&
      Number.isInteger(d.max_cargadores) &&
      typeof d.vence === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(d.vence as string);
    if (!ok) throw new BadRequestException('La licencia no tiene el formato esperado');
    return {
      id: d.id as string,
      empresa: d.empresa as string,
      nit: OperadoresService.normalizarNit(d.nit as string)!,
      max_cargadores: d.max_cargadores as number,
      emitida: String(d.emitida ?? ''),
      vence: d.vence as string,
    };
  }

  private cargarLlave(): KeyObject | null {
    const env = process.env.LICENCIA_CLAVE_PUBLICA;
    const archivo = join(__dirname, '..', '..', '..', 'licencia-publica.pem');
    try {
      if (env) return createPublicKey(env.includes('BEGIN PUBLIC KEY') ? env : readFileSync(env));
      if (existsSync(archivo)) return createPublicKey(readFileSync(archivo));
    } catch (e) {
      this.logger.error(`No se pudo leer la llave pública de licencias: ${(e as Error).message}`);
      return null;
    }
    this.logger.warn('Licenciamiento desactivado: no hay backend/licencia-publica.pem ni LICENCIA_CLAVE_PUBLICA.');
    return null;
  }

  private persistir() {
    this.almacen.guardar('licencias', this.licencias);
  }
}
