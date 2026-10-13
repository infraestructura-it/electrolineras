import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CargadoresService } from '../cargadores/cargadores.service';
import { OperadoresService } from '../operadores/operadores.service';
import { FacturacionService } from '../facturacion/facturacion.service';
import { OcppGatewayService } from '../ocpp-gateway/ocpp-gateway.service';

export type EstadoSesion = 'en_curso' | 'finalizada' | 'fallida';

export interface PagoSesion {
  estado_pago: 'pendiente' | 'aprobado' | 'rechazado';
  monto_total: number;
  comision_plataforma: number;
  monto_operador: number;
  referencia_pasarela: string | null;
  fecha: Date;
}

export interface SesionRegistro {
  id: string;
  cargador_id: string;
  numero_serie: string;
  usuario_id: string;
  estado: EstadoSesion;
  inicio: Date;
  fin: Date | null;
  kwh_consumidos: number;
  tarifa_por_kwh: number; // tarifa congelada al iniciar la sesión (COP/kWh)
  costo_total: number | null;
  pago: PagoSesion | null;
}

// Mientras el gateway OCPP no esté conectado, el consumo se simula a la potencia
// nominal del MDXDC3001 (30 kW). Desactivar con SIMULAR_MEDICION=false cuando
// los kWh lleguen por MeterValues / StopTransaction.
const SIMULAR_MEDICION = process.env.SIMULAR_MEDICION !== 'false';
const POTENCIA_SIMULADA_KW = Number(process.env.POTENCIA_SIMULADA_KW) || 30;

// Almacenamiento en memoria: los datos se pierden al reiniciar el backend.
// TODO: reemplazar el Map por el repositorio TypeORM de SesionCarga al conectar PostgreSQL.
@Injectable()
export class SesionesService {
  private readonly sesiones = new Map<string, SesionRegistro>();

  constructor(
    private readonly cargadoresService: CargadoresService,
    private readonly operadoresService: OperadoresService,
    private readonly facturacionService: FacturacionService,
    private readonly ocppGateway: OcppGatewayService,
  ) {}

  listar() {
    return [...this.sesiones.values()]
      .sort((a, b) => b.inicio.getTime() - a.inicio.getTime())
      .map((s) => this.vista(s));
  }

  obtener(id: string) {
    return this.vista(this.buscar(id));
  }

  iniciar(data: { cargador_id?: string; numero_serie?: string; usuario_id: string }) {
    const usuario_id = data.usuario_id?.trim();
    if (!usuario_id) throw new BadRequestException('Indica un correo o celular para identificar la carga');

    const cargador = data.numero_serie
      ? this.cargadoresService.findByNumeroSerie(data.numero_serie)
      : this.cargadoresService.findById(data.cargador_id ?? '');

    if (cargador.estado !== 'activo') {
      throw new ConflictException('El cargador no está disponible en este momento');
    }
    if (cargador.tarifa_por_kwh == null) {
      throw new ConflictException('El cargador aún no tiene tarifa configurada');
    }
    const ocupado = [...this.sesiones.values()].some(
      (s) => s.cargador_id === cargador.id && s.estado === 'en_curso',
    );
    if (ocupado) throw new ConflictException('El cargador ya tiene una carga en curso');

    const sesion: SesionRegistro = {
      id: randomUUID(),
      cargador_id: cargador.id,
      numero_serie: cargador.numero_serie,
      usuario_id,
      estado: 'en_curso',
      inicio: new Date(),
      fin: null,
      kwh_consumidos: 0,
      tarifa_por_kwh: cargador.tarifa_por_kwh,
      costo_total: null,
      pago: null,
    };
    this.sesiones.set(sesion.id, sesion);
    this.ocppGateway.enviarRemoteStartTransaction(cargador.numero_serie, usuario_id);
    return this.vista(sesion);
  }

  // kwh_consumidos es opcional: si no llega, se usa la última medición disponible.
  finalizar(id: string, kwh_consumidos?: number) {
    const sesion = this.buscar(id);
    if (sesion.estado !== 'en_curso') throw new ConflictException('La sesión ya no está en curso');

    this.actualizarMedicion(sesion);
    if (kwh_consumidos !== undefined && kwh_consumidos !== null) {
      const kwh = Number(kwh_consumidos);
      if (!Number.isFinite(kwh) || kwh < 0) throw new BadRequestException('kWh inválidos');
      sesion.kwh_consumidos = kwh;
    }
    sesion.estado = 'finalizada';
    sesion.fin = new Date();
    sesion.costo_total = this.facturacionService.calcularCosto(sesion.kwh_consumidos, sesion.tarifa_por_kwh);
    this.ocppGateway.enviarRemoteStopTransaction(sesion.numero_serie);
    return this.vista(sesion);
  }

  async pagar(id: string) {
    const sesion = this.buscar(id);
    if (sesion.estado !== 'finalizada' || sesion.costo_total == null) {
      throw new ConflictException('Solo se puede pagar una sesión finalizada');
    }
    if (sesion.pago) return this.vista(sesion); // idempotente: no cobrar dos veces

    const cargador = this.cargadoresService.findById(sesion.cargador_id);
    const operador = this.operadoresService.findOne(cargador.operador_id);
    const resultado = await this.facturacionService.cobrarYDispersar({
      monto_total: sesion.costo_total,
      comision_pactada: operador.comision_pactada,
      cuenta_beneficiario: operador.cuenta_beneficiario,
    });
    sesion.pago = { ...resultado, fecha: new Date() };
    return this.vista(sesion);
  }

  private buscar(id: string): SesionRegistro {
    const sesion = this.sesiones.get(id);
    if (!sesion) throw new NotFoundException(`No existe la sesión ${id}`);
    return sesion;
  }

  private actualizarMedicion(sesion: SesionRegistro) {
    if (!SIMULAR_MEDICION || sesion.estado !== 'en_curso') return;
    const horas = (Date.now() - sesion.inicio.getTime()) / 3_600_000;
    sesion.kwh_consumidos = Number((horas * POTENCIA_SIMULADA_KW).toFixed(3));
  }

  private vista(sesion: SesionRegistro) {
    this.actualizarMedicion(sesion);
    const costo_estimado = this.facturacionService.calcularCosto(sesion.kwh_consumidos, sesion.tarifa_por_kwh);
    return { ...sesion, costo_estimado, medicion_simulada: SIMULAR_MEDICION };
  }
}
