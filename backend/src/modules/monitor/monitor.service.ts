import { Injectable } from '@nestjs/common';
import { CargadoresService, CargadorRegistro } from '../cargadores/cargadores.service';
import { ElectrolineasService } from '../electrolineras/electrolineras.service';
import { OcppGatewayService } from '../ocpp-gateway/ocpp-gateway.service';
import { OperadoresService } from '../operadores/operadores.service';
import { SesionesService } from '../sesiones/sesiones.service';
import { ZonasService } from '../zonas/zonas.service';

// Estado que ve el conductor en el mapa.
export type Disponibilidad = 'disponible' | 'ocupado' | 'fuera_de_servicio' | 'sin_conexion';

const CARGANDO = ['Preparing', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing'];

@Injectable()
export class MonitorService {
  constructor(
    private readonly cargadores: CargadoresService,
    private readonly electrolineras: ElectrolineasService,
    private readonly operadores: OperadoresService,
    private readonly zonas: ZonasService,
    private readonly ocpp: OcppGatewayService,
    private readonly sesiones: SesionesService,
  ) {}

  // Tablero del panel: un registro por cargador visible para el usuario.
  tablero(alcance: string | null, zona: string | null) {
    const zonas = new Map(this.zonas.listar().map((z) => [z.id, z.nombre]));
    const lista = this.cargadores.findAll(alcance, zona).map((c) => {
      const e = this.electrolineras.buscar(c.electrolinera_id);
      const conexion = this.ocpp.infoConexion(c.numero_serie);
      const sesion = this.sesiones.activaPorSerie(c.numero_serie);
      return {
        numero_serie: c.numero_serie,
        modelo: c.modelo,
        ubicacion: c.ubicacion,
        potencia_kw: c.potencia_kw,
        tarifa_por_kwh: c.tarifa_por_kwh,
        estado_registro: c.estado,
        operador_id: c.operador_id,
        operador_nombre: this.nombreOperador(c.operador_id),
        electrolinera: e ? { id: e.id, nombre: e.nombre, ciudad: e.ciudad } : null,
        zona: e?.zona_id ? zonas.get(e.zona_id) ?? null : null,
        version_ocpp: c.version_ocpp,
        conexion,
        disponibilidad: this.disponibilidad(c, conexion?.conector?.status ?? null, Boolean(conexion)),
        sesion: sesion
          ? {
              id: sesion.id,
              estado: sesion.estado,
              origen: sesion.origen,
              usuario_id: sesion.usuario_id,
              inicio: sesion.inicio,
              kwh_consumidos: sesion.kwh_consumidos,
              potencia_kw: sesion.potencia_kw,
              costo_estimado: sesion.costo_estimado,
            }
          : null,
      };
    });
    const cuenta = (d: Disponibilidad) => lista.filter((x) => x.disponibilidad === d).length;
    return {
      generado: new Date().toISOString(),
      resumen: {
        total: lista.length,
        disponibles: cuenta('disponible'),
        cargando: cuenta('ocupado'),
        fuera_de_servicio: cuenta('fuera_de_servicio'),
        sin_conexion: cuenta('sin_conexion'),
        potencia_kw: Number(lista.reduce((t, x) => t + (x.sesion?.potencia_kw ?? 0), 0).toFixed(1)),
      },
      cargadores: lista,
    };
  }

  // Mapa público de la app del conductor: electrolineras con ubicación y sus cargadores.
  mapa() {
    return this.electrolineras
      .listar()
      .filter((e) => e.latitud !== null && e.longitud !== null)
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        direccion: e.direccion,
        ciudad: e.ciudad,
        horario: e.horario,
        latitud: e.latitud,
        longitud: e.longitud,
        empresa: this.nombreOperador(e.operador_id),
        cargadores: this.cargadores
          .findAll()
          .filter((c) => c.electrolinera_id === e.id)
          .map((c) => {
            const conexion = this.ocpp.infoConexion(c.numero_serie);
            return {
              numero_serie: c.numero_serie,
              modelo: c.modelo,
              potencia_kw: c.potencia_kw,
              tarifa_por_kwh: c.tarifa_por_kwh,
              ubicacion: c.ubicacion,
              disponibilidad: this.disponibilidad(c, conexion?.conector?.status ?? null, Boolean(conexion)),
            };
          }),
      }));
  }

  private disponibilidad(c: CargadorRegistro, status: string | null, conectado: boolean): Disponibilidad {
    if (c.estado === 'inactivo' || c.estado === 'en_falla') return 'fuera_de_servicio';
    if (this.sesiones.activaPorSerie(c.numero_serie)) return 'ocupado';
    if (!conectado) return 'sin_conexion';
    if (status === 'Faulted' || status === 'Unavailable') return 'fuera_de_servicio';
    if (status && CARGANDO.includes(status)) return 'ocupado';
    return 'disponible';
  }

  private nombreOperador(id: string) {
    try {
      return this.operadores.findOne(id).nombre;
    } catch {
      return null;
    }
  }
}
