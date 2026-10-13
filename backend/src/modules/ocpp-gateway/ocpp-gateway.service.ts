import { Injectable, Logger } from '@nestjs/common';

// Punto de entrada para la comunicación OCPP con los cargadores (ej. MDXDC3001).
// Versión confirmada en el manual del equipo: OCPP 1.6J sobre ws:// y wss://.
// El cargador se configura con domain_master (URL del servidor) y pile_number_master
// (su identificador, que en la plataforma es numero_serie). Ver docs/especificacion-tecnica.md.
//
// Mensajes OCPP 1.6 relevantes para el flujo de facturación:
// - BootNotification: el cargador se anuncia al conectarse.
// - StatusNotification: reporta su estado (disponible, ocupado, en falla).
// - RemoteStartTransaction: el backend ordena iniciar una carga.
// - MeterValues: el cargador reporta el consumo en tiempo real (kWh).
// - StopTransaction: el cargador reporta el fin de la sesión y el consumo total.
@Injectable()
export class OcppGatewayService {
  private readonly logger = new Logger(OcppGatewayService.name);

  // TODO: levantar el servidor WebSocket OCPP (ej. con la librería `ws`) y
  // enrutar los mensajes entrantes por numero_serie del cargador.
  iniciarServidor() {
    this.logger.log('Gateway OCPP listo para recibir conexiones de cargadores (pendiente de implementar)');
  }

  enviarRemoteStartTransaction(numero_serie: string, usuario_id: string) {
    // TODO: enviar el comando real por WebSocket al cargador identificado por numero_serie.
    this.logger.log(`RemoteStartTransaction -> cargador ${numero_serie}, usuario ${usuario_id}`);
  }

  enviarRemoteStopTransaction(numero_serie: string) {
    // TODO: enviar el comando real por WebSocket al cargador identificado por numero_serie.
    this.logger.log(`RemoteStopTransaction -> cargador ${numero_serie}`);
  }
}
