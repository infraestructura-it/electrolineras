import { Injectable } from '@nestjs/common';

// TODO: conectar con el gateway OCPP (RemoteStartTransaction / MeterValues / StopTransaction)
// y con el repositorio TypeORM de SesionCarga.
@Injectable()
export class SesionesService {
  iniciar(data: { cargador_id: string; usuario_id: string }) {
    return { id: 'pendiente', estado: 'en_curso', inicio: new Date(), ...data };
  }

  finalizar(sesion_id: string, kwh_consumidos: number) {
    return { id: sesion_id, estado: 'finalizada', kwh_consumidos, fin: new Date() };
  }
}
